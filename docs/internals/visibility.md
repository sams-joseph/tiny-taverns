# Visibility

The actor and visibility contract: who is asking, which rows a request may see or change, and where those decisions are allowed to live. Read this before adding an endpoint, a repository method, a table, or anything that looks like a permission check. Shared World reach and invitation management are in [Shared Worlds](shared-worlds.md); the corpora's ownership model is in [Corpora](corpora.md); what a player may write on a character is in [Characters](characters.md).

## The actor

`packages/api/src/Actor.ts` defines `Actor` as `{ accountId, scope }` and nothing else. `scope` is a tagged union (`account`, `sharedWorld`, `campaign`) fixed when the credential is minted. It is scope, not reach: membership says which campaigns the account touches at all, scope narrows that further, and every predicate applies both.

`CurrentActor` is a service that only the `Authorization` middleware provides. Repository methods declare it in their requirements, so an unscoped read does not typecheck.

The actor carries no role, and cannot. One person is the creator of one campaign and a player at another on the same credential, so "may this actor see creator-only rows" is a fact about the pair (account, campaign). That question is `isCreator` in `apps/server/src/repo/visibility.ts`, reading `campaign.creator_account_id`. No role column exists anywhere; `apps/server/test/schema.test.ts` fails if `campaign_member.role` reappears and `apps/server/test/membership.test.ts` greps `apps/server/src` for any role literal.

## Predicates live in SQL

`apps/server/src/repo/visibility.ts` is the only place a visibility predicate is written. Every read composes one of its fragments into its `WHERE` clause so refused rows never leave Postgres. Post-filtering in a handler is the leak pattern: the creator-only text is already in memory and one forgotten `.filter` ships it.

Reads and writes use different predicates. A player may read a `shared` note and must not edit it, so `rowWritable` is not `rowReadable`.

A column that points at a row with its own `visibility` is selected through that row's predicate, not raw. A hidden fight is `NotFound` to a player on every run read, and a raw `session.active_encounter_run_id` or `character_roll.encounter_run_id` would still tell them it is on the table, when it started and ended, and its id. `sessionColumns` (`repo/Sessions.ts`) and the roll select (`repo/Rolls.ts`) return those pointers as null for a run the actor cannot read; `hidden-run-pointer.test.ts` pins both with real actors. A player's note names the encounter it hangs on the same way (`playerNoteColumns` in `repo/Notes.ts`), so a shared read-aloud on a kept or draft encounter is shown without saying which encounter it belongs to. A new pointer column into a narrowed table takes the same `case when exists (… predicate …)` shape.

Visibility is two levels: `campaign.visibility` is the master toggle and a row's own `visibility` narrows within it, so a `shared` note inside an unshared campaign stays invisible. A table that hangs off another row adds a level through a `Containment` chain the `nested*` and `contained*` families walk; it gets no denormalised `campaign_id`, because a child whose copy disagreed with its parent's would be readable in a campaign it is not part of and no `WHERE` clause would notice.

What `shared` means for a row is `sharedWithPlayers`, the one fragment every row-level read test uses. For every table it is `visibility = 'shared'`, except `encounter`, which is shared only when it is also Ready (`encounter_prep.ready`): a draft stays the creator's whatever its Share switch says. The test is an `exists` over the creator-only prep row, so no player read selects the flag. Because it sits in the seam, every path to an encounter inherits it: the player's `playerEncounters` read (`selectPlayerEncounters`) with its roster names and `lastPlayed`, and the name a fight goes by. A run carries its encounter's id and a snapshot of its name; `runColumns` (`repo/EncounterRuns.ts`, over `runEncounterReadable`) selects them only for a reader who may read that encounter and otherwise answers `encounterId: null` and the kind of scene by the run's mode ("A fight", "A conversation", "A skill challenge", "A hazard", `NEUTRAL_RUN_NAMES`), so sharing a fight never publishes an encounter the creator kept hidden or unfinished. A deleted template fails closed to the neutral name for players; the creator keeps the snapshot. `apps/server/test/encounter-drafts.test.ts` drives each combination with real actors.

The one read that crosses campaigns on Shared World membership alone, a played night's story (`GroupHistory.nightStory`, and the Chronicle entry `fromRecap` renders from the same read), applies the same row-level switch through `toldTheWorld` and `fightToldTheWorld`: a world member is never told more of a night than the table's own players, and a fight still on the table is not told at all. See [Shared Worlds](shared-worlds.md).

### `campaignInScope` is the base case

`campaignInScope` is `isMember` (a live `campaign_member` row) conjoined with `scopeAllowsCampaign`. Every campaign-level predicate reaches it. `groupInScope` is the same base case one level up, and the two are deliberately not connected: group membership is eligibility to found campaigns, never reach into one. `campaign.creator_account_id` is authority, not a reach path; the creator holds an ordinary participation row too, enforced by the deferred `campaign_creator_is_campaign_member` in `0001_init.ts`.

`membership.test.ts` keeps this structural. It greps `apps/server/src` and fails if `campaign.account_id` reappears anywhere, if `creator_account_id` is named outside the files that own authority, if a third module names `campaign_member` (only `repo/Memberships.ts` writes it, only `visibility.ts` reads it), or if `repo/Invites.ts` mentions `role`. The writers are `addCreator`, `admitTo` and `revokeMemberAt`, whose `where` composes `notTheCreator` so no upstream bug can unseat the DM. Pass the campaign explicitly: bound from the path, the membership test is a constant Postgres hoists once per query; the correlated `campaign.id` form is for the campaign list only.

### The union is over the innermost test only

The trap that has bitten twice, spelled out on `corpusRowReadable` and `ownedRowReadable`:

- `corpusRowReadable` is `(campaign_id = C or unowned) and <C is readable> and <row visibility>`. Written as `unowned or <campaign-scoped test>`, a bundled row would answer any authenticated request naming any campaign id, because `findById` is reached by path and a path is a claim.
- `ownedRowReadable` adds `account_id = me` inside the same `or` that tests the row's `visibility`, after `withinReadableCampaign`. Written as `rowReadable(...) or account_id = me`, an owner would read their row in a campaign they were revoked from, through a credential scoped elsewhere, in a campaign never shared.

A widening relaxes the row-level toggle and nothing above it. `withinReadableCampaign` is a named fragment precisely so a predicate that relaxes the other half cannot restate this one slightly differently. `copyableIntoCampaign` is a different shape, a plain `or` of predicates each complete on its own.

### Ownership predicates

`ownedRowReadable` (your own row whatever its visibility) and `ownRowWritable` (ownership conjoined with the campaign gate, no visibility disjunct) apply today to `campaign_character`, the seat. The write is strictly narrower than the read by shape: `account_id = me` implies the disjunct it would have had to satisfy in the read, so a player can never write a row they could not read however either predicate changes.

`ownSeatedCombatant` is the one live row a player may write: a `pc` combatant readable through its containment chain whose character sits in an active seat this account holds, the same seat test the player's table uses to call a row "you". It is conjoined with the read predicate, so it too can never reach a row the player could not read. Today its only writer is a player's own initiative (`PlayerTable.setInitiative`, [Live session](live-session.md)).

`character` has no `campaign_id` (`schema.test.ts` asserts it), so its top-level reach is `ownCharacter`, `character.account_id = me` with no membership and no scope, on the Library's argument that there is no campaign for either to be about. A predicate bounds rows; which columns a player may move is a second payload schema (`CharacterOwnUpdate`), never a field filter over the creator's type.

## Denial, claims and defects

Denial is `NotFound`, never `Forbidden`. "It exists but is not yours" is itself a disclosure, so a refused write matches no rows and becomes the same 404 a stranger gets.

A parent id in a path is a client claim, not a fact. `PrepItems` takes the campaign and the session and refuses a session that is not in that campaign. Two separate checks ("the session is readable", "the run is readable") are both satisfied by a run in another session of the same campaign; `ensureNestedRowReadable` / `ensureNestedRowWritable` bind the foreign key instead. `apps/server/test/prep-visibility.test.ts` pins the honest and the smuggled path.

A failed COMMIT is a defect, not a typed failure. `sql.withTransaction` wraps the commit in `Effect.orDie`, so a deferred constraint (`campaign_creator_is_campaign_member`, the `assistant_turn_id` foreign keys, `encounter_creature.creature_id`) arrives as a defect that `Effect.result` does not catch and `Effect.exit` does. An immediate constraint stays a typed `SqlError`; a test asserting on a refusal has to know which.

## The creator proof

`repo/CreatorActor.ts` exports `CampaignCreatorActor`, a branded proof that this actor is the creator of this campaign. The brand is a module-private `unique symbol`, so `CampaignCreatorActors.of` is the only expression that constructs one (`apps/server/test/creator-actor.test.ts` greps for a second). It is minted by one read through `campaignWritable` and carries the campaign and its backing group, so it cannot be spent on another table.

The standing rule, the one thing here remembered rather than compiled: when a table's player projection diverges from its creator projection, its creator-side repository takes a `CampaignCreatorActor` in place of a campaign id in the same change. Gate first, project later: deferring the projection costs nothing, leaving the wide read reachable costs a disclosure the moment a player actor exists (`Recap.read` once shipped ungated and leaked a monster's exact hit points). `creator-actor.test.ts` counts the gated occurrences across `src/repo` and carries `@ts-expect-error` lines that fail the build if a bare `Actor` or a campaign id ever becomes acceptable. The gate is a precondition on the seam, not a substitute: every gated method still composes `visibility.ts`, so a bug in the gate degrades to the predicate's answer rather than an open door. Methods returning a `shared` row a player may see in full stay ungated, as do Library methods and player writes, where the proof would answer the wrong question.

Player projections are distinct schemas on distinct paths (`PlayerSessionRecap`, `PlayerLiveTable`, `PlayerEncounter`, `PlayerNote`), never a nullable field or a strip-fields helper over the creator's type. A leak then has to be written rather than caused by a forgotten flag. The narrowing is in the statement: the player query does not select the wide columns, so there is nothing to drop.

An encounter is the case where the projection removes whole answers, not only precision. `Encounter` (with its computed difficulty) and the roster (each creature's CR, AC, HP and XP) are the creator's reads, gated like prep and the battle map. A player reads `playerEncounters`: the shared encounters, each with its shared roster lines as names and counts, and no difficulty at all, not even a band (the captain's decision of 2026-09-25). A band over the lines a player can see calls a fight with a hidden creature easy; one over the whole roster says the hidden creature is there. `apps/server/test/encounter-player.test.ts` reads the raw wire for planted names and every numeric key.

A note is gated before the Notes screen widens it. `Note` is the creator's working record, so `notes.list` and `findById` take the creator proof and answer a player `NotFound` even for a shared note; a player reads `playerNotes` (`GET …/player-notes`), the shared notes as `PlayerNote` with no visibility or provenance, and their recap tells a note the same way (`PlayerSessionRecap.notes`). Gating it before the Notes screen gains fields is the point: a field added to `Note` does not reach a player until somebody adds it to `PlayerNote` on purpose. A note's links to encounters and seats (`note_link`) are the first such field and are the creator's alone, read on `Note` and written by `notes.addLink` / `removeLink` behind the creator proof, because a link names its target whether or not the reader may read it. `apps/server/test/note-player.test.ts` and `note-links.test.ts` read the raw wire.

Creator-only material about a row a player can read lives on a table of its own, never as columns on that row: `encounter_prep` and `battle_map` beside `encounter`, `encounter_run_board`, `encounter_run_scene` and `encounter_run_check` beside `encounter_run`, `campaign_character_prep` beside the seat. A column on the shared row is one forgotten select list away from the wire; on its own table no player read touches it, and its repository takes the proof from the day it is declared. Such a table has no provenance tail and sits in `NOT_CONTENT` (`schema.test.ts`), because who may read it is the creator and where it came from is its parent's.

## The provenance tail

Every content table carries `visibility` (not null, default `'dm'`), `origin` (default `'authored'`) and a nullable `assistant_turn_id` that is a real, deferrable foreign key into `assistant_turn`, with a check tying `origin = 'assistant'` to a present turn id. `schema.test.ts` enumerates the content tables and fails if one lacks any of the three; skipping the tail takes a visible edit to its `NOT_CONTENT` list. Fail-closed is the column default, not a payload's (`apps/server/test/visibility.test.ts`). No create payload carries `origin`; assistant provenance is written only by the accept paths (`repo/Proposals.ts` and the NPC counterparts, through the ordinary `create` methods with an `AssistantOrigin` from `repo/rows.ts`) and by the assistant's own turn and audit rows. `group_invite` has no tail, which is why Hob can never mint an invitation.

## The invitation

An invitation (`packages/api/src/Invite.ts`, `repo/Invites.ts`) is a credential to join, not a way in. Redeeming it grants ordinary `group_member` and `campaign_member` rows to the signed-in account in one transaction; the member is then indistinguishable from one admitted any other way. It needed no new predicate, no new base case and no change to `Authorization`; a change here that needs one has drifted into a second way to be reachable, which is where the next leak lives.

Management (`listForCampaign`, `createForCampaign`, `revokeForCampaign`) takes the `CampaignCreatorActor`, so a creator invites their players without owning the hidden group. The lifetime rules, each a property of a statement rather than a habit:

- Single-use. `redeemed_at` is set under `for update` on the invite row in the transaction that writes the membership. The same account redeeming twice gets the same success.
- Expiring on the server clock. `expires_at` is `created_at + INVITE_TTL_DAYS` (14), never client-supplied; liveness is the database's `now() >= expires_at`, selected as `expired` by every read.
- Revocable before and after acceptance. Revoking a redeemed invitation retires only the seat it granted (`granted_campaign_membership`), in the same transaction.
- Forwarded is granted. Whoever holds the token gets the seat; `redeemedByName` makes the wrong person visible and one revoke undoes them.

Denial is one `NotFound` for unknown, expired, withdrawn and spent tokens alike, because naming the kind of dead discloses that the token was ever alive; `preview` answers live invitations only. `preview` is the only endpoint besides `health` with no `Authorization` (`packages/api/src/Api.test.ts` fails on a third), and the token is what scopes it: it and `redeem` read scalar columns of the campaign the invitation names, never one a caller named. `redeem` takes a token and nothing else, so there is nowhere to put another account or campaign. The ordinary outcome of joining is a campaign with nothing in it, since `campaignReadable` still requires `visibility = 'shared'` for a player; `InviteRedeemed.shared` says so.

## Three owners, and no `origin = 'system'` check

Each copyable corpus table holds three kinds of row, told apart by two id columns and nothing else: the bundle (`campaign_id` and `account_id` both null), a Library original (`account_id` set) and a campaign instance (`campaign_id` set). `<table>_one_owner` makes the pair exclusive, which lets each write predicate name one column and be complete: `libraryRowWritable` compares `account_id` to the actor's account, `rowWritable` compares `campaign_id` to the path, and a null never equals a uuid.

`<table>_system_is_unowned` makes `origin = 'system'` and "owned by nobody" the same statement in both directions, so no write path can reach a bundled row and none can mint one by omission. That is why there is no `origin = 'system'` check anywhere in `apps/server/src`; do not add one. `unowned` in `visibility.ts` is the one place the bundle is spelled, and `corpusRowReadable`'s global half must stay `unowned` rather than `campaign_id is null`, or every campaign bestiary would answer every account's Library. `libraryRowReadable` composes no campaign gate and no scope because its rows are in no campaign; that is the rule not applying, not a hole.
