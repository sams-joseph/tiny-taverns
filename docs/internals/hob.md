# Hob, the assistant

This page covers the server side of Hob (`apps/server/src/assistant/`), the conversation and accept repositories behind it, the three toolkits, configuration, how to diagnose a model that "never calls a tool", and the NPC agent that shares Hob's loop and model. The panel's layout is in [Web screens](web-screens.md); the predicates Hob composes are in [Visibility](visibility.md).

## Tools, not a context blob

Hob is not handed the campaign. The prompt carries the saved thread and the campaign's name; every other fact arrives through a tool call, and every handler is one shipped repository method returning `Effect<…, NotFound, CurrentActor>`. A pre-assembled context would be a second data path with its own filtering, which is where the leak would live.

The campaign is closed over from the path segment and the resolved actor (`handlersFor` in `toolkit.ts`); no tool takes a campaign parameter, so a hallucinated campaign id is not expressible. `hob.test.ts` asserts the string `campaignid` appears in no tool schema sent to the provider, and drives the leak case that would look like a feature: two campaigns of one account both containing "ferryman", asked from one, with the other's name in zero bytes sent to the model. Each handler re-provides `CurrentActor` explicitly, because the request context is no longer ambient by the time the stream is pulled.

## No SQL under `src/assistant/`

A `sql` template or an `"effect/unstable/sql"` import anywhere under `src/assistant/` fails the seam sweep in `hob.test.ts` (comments stripped first, so the rule can be described in the files it governs). `npcs.test.ts` runs the same sweep over the `Npc*` files and pins the exact repository imports `NpcAgent.ts` may have. A read the repositories do not expose is a new repository method, never a query here.

## The round loop and the event stream

`LanguageModel.streamText` at the pinned Effect beta is one round trip: it resolves the tool calls a step asked for, emits their results, and stops without sending them back. `round()` in `Hob.ts` supplies the loop through `Chat.fromPrompt`, capped at `MAX_ROUNDS` (4). `hob.test.ts` pins the second request.

The wire is `POST /campaigns/:c/hob/ask` as an SSE stream of `HobEvent` (`began`, `delta`, `tool`, `proposal`, `done`, `failed`; `packages/api/src/Hob.ts`). Three ordering rules matter:

- `began` goes first, before the model is called, carrying the thread id and the turn id the answer will be saved as. Turn ids are minted in TypeScript (`HobThreads`), so a dropped connection cannot lose the thread the question was filed to.
- `done` is emitted exactly once, at the end, by `ask`; a round never emits it. An answer that said `failed` gets no `done`.
- A `proposal` may follow a `failed`: a model that offered something and then burned the budget really did offer it. `tail` puts the proposal last so it never lands after a `done`.

Authorization happens before any stream exists, so a denial is a real 404 and an unconfigured server a declared `HobUnavailable`. The turn's text is saved in a `Stream.ensuring` finalizer, so a closed tab keeps the half that was read; nothing is written when neither words nor a proposal arrived, and a `failed` sentence is never saved. The prompt carries the record's recent end (`RECENT_TURNS`, 40).

## Proposals and the accept path

A `propose*` tool writes nothing. It stashes the draft in a `Ref` that becomes `assistant_turn.proposal`; there is no write repository under `src/assistant/`, which makes "nothing enters the campaign without an accept" a property of the wiring. `proposeEncounter` resolves each `creatureId` through `Creatures.findById`, so an invented id is a readable `NotFound`.

`repo/Proposals.ts` (with its NPC counterpart, `repo/NpcProposals.ts`) is the only path that turns a proposal into a content row, and no create payload carries `origin`. Accept takes no content payload: the row is materialised from the `proposal` column the server wrote. If accept took prose, any client could post its own and have it recorded as the assistant's. It writes through the ordinary `create` methods with one extra `AssistantOrigin` argument (`repo/rows.ts`).

One transaction, turn locked `for update` first: a double-tapped save is one row and one `Conflict`; a turn that proposed nothing is `NotFound` about the proposal. `materialise` has six targets: `note`, `beat` (session resolved at accept time; none is a `Conflict`), `encounter` with its roster, `character` (through `Characters.createOwn`, owned by the accepting credential), and the two Shared World kinds behind `acceptSharedWorld`. Which target a caller can reach is decided by the thread's reach, not a check here: a `character` proposal exists only in a player-reach thread, so a campaign thread can never accept one. Accepted rows take the column default for `visibility`. Discard is not built and not faked; `hob-proposals.test.ts` counts the content tables either side of a proposal.

## Threads and reach

`assistant_thread` has two scopes (campaign XOR group) and a nullable `account_id`: null is the campaign's own conversation, a uuid is one account's. `conversationReachable` in `repo/visibility.ts` is a three-way partition: `"dm"` (`rowWritable` plus `account_id is null`), `"own"` (`ownRowWritable`, which never matches a null), `"sharedWorld"` (`group_id` pinned, `account_id is null`, `groupReadable`). Disjointness is what keeps a player out of prep and a creator's panel from resuming a player's thread, without a check anywhere.

Two decisions there are easy to undo. It is one fragment for reading and writing, spelled with the writable halves, because a conversation has no middle state the way a `shared` note does. And `conversationTurnReachable` does not apply the turn's own `visibility`: the column defaults to `dm` and nothing writes it, so applying it would hide a player's conversation from its author.

`HobThreads` takes a `reach` argument rather than twin methods. A creator holds threads in both campaign sets, so operations naming a thread read the reach off the row (`HobThreads.reachOf`) rather than deriving it from the creator proof; `threads.list` stays proof-derived because listing genuinely is "which set does the panel show".

## Three toolkits, because a toolkit is what the model is shown

A tool bound to a handler that always refuses is still a tool the model spends a round reaching for. So `toolkit.ts` has three toolkits, not one narrowed at the handler:

- `HobToolkit` (campaign creator): the campaign reads plus `getNpc`, the two read-only Shared World tools, `proposeNpcAwareness`, and `proposeNote` / `proposeBeat` / `proposeEncounter`.
- `SharedWorldToolkit`: history search, summary, Story So Far sources, the world's campaigns, played nights, `nightStory`, and `proposeSharedWorldEntry` / `proposeStorySoFar`. It knows every canonical played event across the world and nothing unplayed. `hob-group.test.ts` plants sentinels in notes, planned encounters, prep lines and draft threads and asserts zero occurrences in any captured request.
- The player's, built per request: `searchCampaign` (bound to the asking actor, so `rowReadable` narrows it), `listStartingSpells`, and `proposeCharacter`.

`HobAsk.intent` selects the surface. `intent: "character"` picks the drafting toolkit and a thread of the asker's own for creator and player alike; absent, a creator gets the campaign toolkit. The proof alone cannot tell the two apart (`hob-character.test.ts`, "the creator drafts too").

### The player's toolkit is built per request

`proposeCharacter`'s `race`, `subrace`, `className` and `background` are `Schema.Literals` over that campaign's vocabulary, read through `Options.list` (the same predicate the create form uses), so an unshared class is one Hob cannot offer and no campaign's words reach another's schema. `nameSchema` has three shapes per kind: free text when empty, an enum up to `OPTION_ENUM_CAP` (40), and free text plus `listOptions` above it (`playerToolkitListing`). The cap avoids a silently truncated enum, which reads to the model as "that is all there is".

`Toolkit.make` is an ordinary call whose value is both the handler context and the key `provideContext` uses (`playerBindOver`, `playerBindListing`); a build costs microseconds. Vary the schema only for the vocabulary; anything else fragments prompt caching for nothing. A homebrew name is untrusted text and is not rewritten (it is the link to the option); the description escapes it through `JSON.stringify`, exactly as the schema does. `hob-vocabulary.test.ts` pins the three shapes, the boundary and an injection-shaped name.

### `proposeCharacter` takes labels, not numbers

Every parameter is one a small model is good at: labels, a ranking of six ability keys, prose. The server applies the standard array and derives every modifier (`abilitiesFrom`), because score and modifier are both stored strings and must not disagree; a short or duplicated ranking is repaired. Both composers then call `sheetGrantsFor` ([Characters](characters.md)).

Two optional helpers exist. `optional` wraps a schema in `Union([schema, Null, AbsentWord])`, where `AbsentWord` is `Schema.Literals` over `ABSENT_WORDS` (`""`, `null`, `none` in their casings) decoded to null; a literal set rather than a string arm keeps the published enum's grammar, which is safe only because nothing through `optional` is free text. `optionalText` is the permissive arm for prose optionals (`bond`, `ideal`, `flaw`), where "None" might be meant, and the handler treats a blank as not given.

The redraft loop is `promptFor`'s `offered()`: a saved `turn.proposal` is rendered back into the next prompt (labels, the ranking rather than six cells, an encounter's `creatureId`s), so "make her a ranger instead" reaches a model that can see the druid it wrote. Accept comes before corrections; after it, every edit is an ordinary owner PATCH.

### Direct resource spends

The one Hob write outside a proposal is `spendCharacterResource`, offered only while a live fight has `encounter_run.allow_hob_direct_writes` on and PC counters exist (`directResourceToolkitOver`, `dmBindWithDirect`). The write is `repo/HobDirectWrites.ts`: it re-checks proof, live run and switch at write time, locks the turn for `tool_call_id` idempotency, and records an audit row the runner can undo. With the switch off the toolkit is byte-identical (`hob-direct-writes.test.ts`).

## Configuration: unset is a supported mode

`HOB_API_URL` and `HOB_MODEL` (both, or Hob is off), optional `HOB_API_KEY` (`Redacted`), `HOB_MAX_TOKENS` (default 4096). `assistantFromConfig` in `app.ts` logs `Hob is ON` or `Hob is OFF` at boot, naming model and endpoint and never the key. Off means `Hob.unavailable`, and an unreadable campaign is still a 404 rather than a cheaper probe. `languageModelLayer` in `app.ts` is the one place the provider layer is spelled; `npcAgentFromConfig` reads the same variables through it. Do not add a second model configuration for NPCs.

`assistant/modelConfig.ts` is endpoint-aware because the pinned `@effect/ai-openai-compat` turns its portable `max_output_tokens` into the legacy `max_tokens`. Requests to `api.openai.com` emit `max_completion_tokens` (current OpenAI models reject the legacy field); every other endpoint keeps `max_output_tokens`, hence the `max_tokens` shape local servers require. Direct OpenAI requests for `gpt-5.6-luna` also send `reasoning_effort: "none"`, because Luna's default reasoning cannot combine with function tools on Chat Completions and Hob requires tools. Do not collapse the paths until the adapter moves to Responses. `hob.test.ts` asserts all three shapes.

Always pass the token limit explicitly. `@effect/ai-anthropic`'s capabilities table at this version recognises no model id past a fixed list, the parameter is typed to accept any string, and an unknown id silently falls back to a 4096 cap and prompt-based JSON tooling. Nothing warns.

## Diagnosing "Hob never calls a tool"

Look at the wire first. `test/support/model.ts` records every request body, and one `HttpClient.tapRequest` settles which link failed. Every time this was reported the tools were in the request and the model could call them; the failures were downstream, and each said nothing.

**Null optionals.** OpenAI strict mode puts every property in `required` with a `null` member, and an XML tool-call template through llama.cpp hands a string-typed optional the word `"null"`. The decode side refused both and killed the answer. The `optional`/`AbsentWord` helper is the fix; `Schema.optional` on a `Tool.make` parameter is the thing to grep for.

**Reasoning inside the budget.** A thinking model spends `HOB_MAX_TOKENS` deliberating first, and reasoning parts are dropped on purpose, so the panel showed `began … done` with nothing between (or, on an endpoint that leaves `<think>` in `content`, prose and no tool call). `truncated` and `silence` in `Hob.ts` turn a `length` finish and an empty answer into `failed` events naming the knob, and a `length` round ends the loop. A `done` that follows nothing is the shape to distrust.

**Framework-side decode failure.** Tool arguments are decoded inside `streamText` before any handler runs, so a handler's refusal cannot reach it, and the stream used to die showing a union complaint naming every tool. `recover` sends the correction back as a `user` message (no tool call reached history for a result to answer), trimmed by `complaint()` to the `["params"]` lines, charged to `MAX_ROUNDS`. Only `InvalidOutputError` and `ToolParameterValidationError` are recovered.

**Running out is a failure only when Hob got nowhere.** `gotNowhere` is the one place that judgement lives: a turn that offered a card and then spent its last round is saved with the proposal and a `done`, because a failure before the card contradicts the thing arriving one event later.

**No way to ask what a campaign has.** `listCreatures`, plus `searchCampaign` accepting `""` at the schema and refusing it in the handler with a `Conflict` naming `listCreatures`: a minimum length in the schema is a refusal the model cannot hear.

**Forgotten offers.** The prompt was built from turn text alone, so a turn that offered a card and said one line reached the next question as a sentence about nothing. `offered()` fixes it.

**The model would not use its build tools, and now says so.** `round` rightly drops a clean finish with no tool call, which is why this was invisible. `printedTheCall` recognises two measured signatures: a tool name in call position, or arguments in a fence (`BUILD_ARGUMENTS`, parameter names the test pins are in a published schema). It fires from `tail` only when nothing was offered, nothing else failed, and no usable build call reached a handler. The creator's panel is general chat, so `askedForABuild` opts in and errs toward silence; the player's composer drafts by default, so `aQuestionAboutIt` is the only way out.

`apology()` is the only thing that fills `HobFailure.message`; `describe()` is for the log. `hob.test.ts` sweeps every reachable failure for framework fingerprints (`LanguageModel.`, `Invalid output`, `Expected `, ` at [`).

A null `proposal` on a saved turn that reads like an offer means the model never called the tool: a model-tier symptom, checked with one query on `assistant_turn` before touching `apps/web/src/hob/`. Reach for "the model is the limit" last, not second.

### Running and testing it

Locally: `llama-server --jinja -m <model>.gguf` (`--jinja` is required for tool calling), then `HOB_API_URL=http://127.0.0.1:8080/v1` and `HOB_MODEL` in `apps/server/.env.local`; Ollama and LM Studio are the same shape. The model must support tool calling, and a reasoning model needs room in `HOB_MAX_TOKENS`.

Offline, stub `HttpClient`, not the model: `scriptedModel` in `test/support/model.ts` answers `POST /chat/completions` with canned `textChunks`, `reasoningChunks` and `toolCallChunks`, exercising the real provider layer, toolkit, handlers and Postgres.

## The panel, briefly

`apps/web/src/hob/conversation.ts` is the only web file that talks to the assistant. Nothing is requested until the panel is opened, and status is re-asked on each open. The "Knows" strip draws only what `HobStatus` vouched for; `hob.fixtures.ts`'s sample thread renders in the gallery and must never reach a screen. Omit an optional key rather than sending `undefined` (`threadId: undefined` arrives as null and `Schema.optional` refuses it). The panel is shadcn's `sidebar` over `sheet`, whose `container` prop portals the overlay into `HobRegion` so it covers the content, not the app.

## The NPC agent (Cast)

`assistant/NpcAgent.ts` is Hob's loop with everything an NPC must not have removed: one `LanguageModel.streamText` call, no reads, no writes, and no toolkit in private player chat. Creator rehearsal and shared-session chat get `NpcProposalToolkit` (`proposeNpcMemory`, `proposeCampaignNote`, `proposeCampaignBeat`), one proposal per reply, recording a pending `npc_proposal` row and nothing else. `repo/NpcProposals.ts` is the only accept path and takes no replacement content; accepted memory lands as a `draft` `npc_memory`. Threads have three channels (`rehearsal`, `player_direct`, `session_shared`; `packages/api/src/Npc.ts`).

Private material is its own column and prompt section, never part of `persona`: `NpcPersona` beside `NpcPrivateMaterial`, and `npcPrompt.ts` renders the second only for the creator audience, so a player channel excludes secrets by construction. `npcs.test.ts` plants sentinels in another campaign's NPC, a creator-only note, a player's sheet and a player's Hob thread and proves zero bytes reach the provider. Bump `NPC_PROMPT_TEMPLATE_VERSION` when prompt behaviour changes and add a snapshot beside the old one (`npc-prompt.test.ts`); the assembled prompt is never stored or sent to a client.

Knowledge is copied text plus provenance; prompt assembly never reads through `source_id`. Memory is `draft` / `approved` / `retired`; only approved, unretired rows enter context under their own cap. Awareness candidates come from campaign Hob's `proposeNpcAwareness`, which validates source ids against the NPC's own campaign or world and queues a review row after Hob's turn is saved; approval takes `expectedVersion`, no replacement prose, and materialises the stored content only.
