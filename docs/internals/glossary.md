# Glossary

Shared vocabulary for the product and the code. Public contracts and the web use the product words; the database and repositories sometimes keep older persistence names, which are listed beside the product word where they differ. This is a vocabulary, not a feature index.

## People and reach

- **maintainer**: the person building Tiny Taverns. Older docs and decision records call them "the captain".
- **account**: one signed-in identity (`account`), reached by a machine token or a hosted session. It carries no role anywhere. `apps/server/src/Accounts.ts`.
- **actor**: `{ accountId, scope }` resolved by `Authorization` for one request. `scope` is the credential's reach (the whole account, one Shared World, or one campaign), never a role. `packages/api/src/Actor.ts`.
- **creator**: the account that created a campaign (`campaign.creator_account_id`) and is its sole DM. Creator-ness is a fact about a pair, proven per request by `CampaignCreatorActor` (`apps/server/src/repo/CreatorActor.ts`).
- **member / participant**: an account with a live `campaign_member` row, which is what reaches campaign content. Membership is participation at a table; eligibility for it comes from the backing context.
- **player**: a member of a campaign who is not its creator. The web derives `relation: "creator" | "player"` per campaign from `GET /me/campaigns`.
- **proof**: a branded value that a repository method takes instead of a campaign id, minted by one read. Today that is `CampaignCreatorActor`.

## Containers

- **campaign**: the table: encounters, notes, sessions, seats, threads. Every campaign has a hidden **backing context**.
- **backing context** (`contextId`): the `play_group` row behind a campaign. Ordinary campaign work never navigates or owns it; it exists so membership can chain owner → member → creator → participant → seat.
- **Shared World**: an explicit `play_group` (`is_shared_world = true`) that several campaigns can connect to. Public contracts say `SharedWorld*`, `worldId`, `worldSeq`; persistence still says `group_*`, `Groups`. There is no `/groups` URL. See [shared-worlds.md](shared-worlds.md).
- **world owner**: `play_group.owner_account_id`. Owns the Shared World, not the campaigns in it.
- **invitation**: a single-use, expiring credential minted by a campaign's creator that grants a campaign seat on redemption (`CampaignInvite`, persisted as `group_invite`). Not a way in by itself.
- **Chronicle**: the Shared World's history: entries admitted on purpose in one acceptance order (`group_history_entry`), plus the accepted **Story So Far** summary (`group_history_summary`). Also the name of the per-campaign screen that draws recaps.

## Play

- **session / night**: one evening of play (`session`). Opening a night is separate from putting a fight on the table. The campaign points at its current session; a finished session can never be current.
- **run / fight**: one encounter on the table during a session (`encounter_run`). Exactly one live run per session. A fight that outlives its night continues as a second run linked by `continued_from`.
- **combatant**: a row in a run's initiative order, a snapshot of a character or creature at seed time. Hit points on a player character write through to the character.
- **doorbell**: the contentless fan-out `{ sessionId }` in `apps/server/src/live/LiveEvents.ts`. Clients re-read through the ordinary API when it rings; they never apply an event payload.
- **beat**: one line of prose the DM files against a night (`beat`). The non-combat half of the record.
- **recap**: a per-read assembly of a night from its runs, beats, notes and ticked prep. Nothing stores a summary. It has a DM shape and a narrower player shape on separate paths.
- **live table**: the player's projection of the fight in progress (`GET /campaigns/:c/table`), null when there is nothing a player may know.

## Characters and corpora

- **character**: account-owned, top-level, one copy of playable state (`character`). It has no `campaign_id`; campaign-scoped visibility lives on the seat. See [characters.md](characters.md).
- **seat**: a character's membership of a campaign's party (`campaign_character`): the join, display snapshots and campaign-scoped visibility. Never a state fork. There is no seat that exists before a character.
- **sheet**: the `jsonb` document on the character row (`body`, `sheet` on the wire). Everything that nothing filters, sorts or seeds on lives there.
- **bundle**: the imported 2014 SRD and starter corpora: rows owned by nobody, `origin = 'system'`, written only by import commands.
- **Library**: an account's own originals of any copyable corpus (creatures, options, spells, equipment, magic items, feats, rule articles). Library rows are in no campaign.
- **instance**: the one campaign-owned copy the product still mints, inside `EncounterCreatures.create`, so a fight can track state. Enumerable by nothing and editable by nobody.
- **share**: an explicit grant of a Library original to a Shared World (`group_library_share`), which is how homebrew reaches a table's other members.
- **option**: a class, race (containing subraces) or background (`character_option`). The vocabulary the create form and Hob draft from.

## The assistant

- **Hob**: the assistant. Every fact it states arrives through a tool that is a shipped repository method. See [hob.md](hob.md).
- **thread / turn**: a saved conversation (`assistant_thread`, campaign or world scoped, optionally one account's own) and its lines (`assistant_turn`).
- **proposal**: something Hob offered, stored on its turn. Not a row until a person accepts it. No create payload carries `origin`; accepted rows and the assistant's own turns are the only things that carry `'assistant'`.
- **toolkit**: the set of tools a model is shown for one request. There is a creator toolkit, a player drafting toolkit, a Shared World toolkit and an NPC toolkit; they are different sets, not one set narrowed.
- **NPC / Cast**: a campaign's structured non-player character (`npc`) and the screen that manages it. An NPC answers from its persona, explicit knowledge and approved memory, never from campaign-wide reads.
- **provenance**: the `origin` and `assistant_turn_id` columns every content table carries, plus pointer columns like `derived_from` and `equipmentId`. Provenance is never read through to grant reach.
