# Characters

How a character is modelled and written: the account-owned row, the seat that joins it to a campaign, the live hit-point seam, the bounded player write, the two creation paths and the corpus-driven starting sheet, and the document keys for actions, resources and gear. For anyone touching `packages/api/src/Character.ts`, `apps/server/src/repo/Characters.ts`, `repo/Party.ts`, `repo/vitals.ts` or the character screens. Who may read a character at a table is [Visibility](visibility.md); the corpora it seeds from are [Corpora](corpora.md); Hob's drafting toolkit is [Hob](hob.md).

## The row: account-owned, one copy of playable state

A character is a top-level identity owned by an account. There is one copy of its playable state, and every campaign that seats it reads and writes that row. The wire `Character` has no `campaignId` and no `visibility`; who at a table may see it is the seat's question. The `character` table still carries a `visibility` column because `schema.test.ts` requires one on every content table, but nothing reads it and no payload can set it.

`version` is the optimistic-concurrency counter. Every owner write bumps it, a PATCH may send `expectedVersion`, and a mismatch is a `Conflict`. The guard rides in the UPDATE's own `where` beside `version = version + 1`, so two racing writers cannot both pass one read. The client always sends it (`apps/web/src/characters/write.ts`).

There is no DM-typed character, no assignment endpoint and no re-pointing. A campaign creator writes their own characters through the same owner path as anybody else.

## The seat: `campaign_character`

`campaign_character` is the party join. It owns what the campaign knows about a character: when it joined and left, display snapshots (`display_name`, `player_display_name`, which survive later renames), and the campaign-scoped `visibility`. It is never a fork of state. `repo/Party.ts` serves it under `/campaigns/:campaignId/party`: `join` (the owner seats their own character; already seated is the same success), seat `update` (creator only), `leave` (the seat's owner or the creator), and `damage`.

The creator's own notes about a seat, its hook and secret, are not on the seat: a player reads their own seat and every shared one, character and all. They sit on `campaign_character_prep`, one row per seat once something is written, served by `repo/SeatPrep.ts` behind the creator proof. The list answers every live seat, `null`s where nothing is written, and walks the seat, so a retired seat's notes go with it. No toolkit reads them and search does not index them, so a secret never reaches a model. `seat-prep.test.ts` drives the refusals with real actors and pins that a player's party read is byte-identical after a write.

Retiring (`left_at`) is the only removal a seat has of its own, and every reach through a seat requires `left_at is null`. A campaign's permanent delete takes its seats with it and leaves every character standing ([Data model](data-model.md), _Deleting a campaign_). `characterSeatedAt` in `repo/visibility.ts` is the campaign-side read: the union is over the seat, so a character is visible at a table exactly when a live seat holding it is.

Damage taken at one table is visible at every other table seating the character, because there is one row. `party.test.ts` and `character-live.test.ts` pin the shared state, the snapshot immutability and the atomic clamp.

## The live trio moves only through `vitals.ts`

`hp_current`, `temp_hp` and `conditions` are the live half. A hit point belongs to the character, the combatant holds the fight's copy, and one transaction writes both. Every function in `apps/server/src/repo/vitals.ts` runs inside the caller's `sql.withTransaction` and none opens one. `applyCharacterDelta` routes through the live combatant when there is one (`liveCombatantOf`) so there is exactly one clamp; a write-through that touches no row dies rather than returning a half-applied result.

`inspiration` is live state of the same kind with no combatant copy, because nothing in a fight draws it. The creator awards and spends it through the seat PATCH, in the statement that writes `conditions` and `temp_hp`, and it rings the doorbell the same way; the owner reads it on their sheet and a seat-mate reads it wherever the seat is shared.

`hp_current` is null until somebody says. That is neither zero nor full; readers substitute `hp_max`, and starting a fight seeds the combatant from the character's current number so a fight cannot silently heal the party.

The doorbell is keyed on the session. `currentSessionOf` answers the campaign's `current_session_id`, which cannot name a finished session, so a level-up typed between games rings nothing and an open page stays stale until it refetches. Only character-side writes append `character-updated`; `Combatants.damage` writes through and appends nothing extra because it already recorded the same change. The creator's authority over live state is `characterVitalsWritable`: a live seat at this campaign plus `campaignWritableById`. The owner is deliberately not a disjunct; an owner edits the durable half through `/me`.

## What a player may write

The `me` group holds every owner write: `POST /me/campaigns/:campaignId/characters`, `POST /me/characters`, `PATCH /me/characters/:characterId`, `DELETE /me/characters/:characterId`, plus `spend` and `rest` below. Two boundaries, and neither may stand in for the other:

- Which rows: `ownCharacter` in `repo/visibility.ts`, `character.account_id = <actor>`, compared to nothing a caller supplied. Credential scope is deliberately not applied, because a top-level character is in no campaign for a scope to be about.
- Which columns: `CharacterOwnUpdate`, a second schema rather than a field filter over a DM type. It carries the durable columns and the whole `sheet`. `hpCurrent`, `tempHp`, `conditions`, `inspiration`, `visibility` and `accountId` have no field, so a control for them does not compile. Excess keys are dropped on encode and on decode, so a payload naming only live keys is an empty patch answering `200` unchanged.

`Characters.updateOwn` runs outside a transaction: a select for the version check and subrace validation, then the guarded UPDATE. It rings no bell, because nothing live moved. A level or class change with no `sheet` in the patch triggers `recomputeForLevel`, which rewrites derived spell lines and slot resources and leaves custom lines standing. `player-write.test.ts` pins the refusals and that a payload of live keys leaves the row untouched.

Whole-document writes race and that is accepted: two edits from two tabs do not merge, and `expectedVersion` turns the loss into a `Conflict` instead of a silent overwrite.

## Creation: a rules context first, then an explicit seat

Creation names a campaign only as context, and needs none. The captain decided on 2026-09-23 that an account with no campaign and no Shared World can still make a character, so _New character_ on the roster (`characters/NewCharacterAction.tsx`) is always offered: straight to `/characters/new` for an account at no table, otherwise a dialog listing each table beside _No campaign_.

- `POST /me/campaigns/:campaignId/characters` is gated by `ensureCampaignReadable` and uses the campaign for the rules vocabulary (`options.list`), subrace validation and Hob's drafting thread.
- `POST /me/characters` names nothing. The core rules are the vocabulary: `coreRulesUsable` in `repo/visibility.ts`, the bundle as a campaign's players see it, with no Library original, campaign copy or Shared World share. The form's pickers read it through `GET /library/options/core` and subrace validation reads the same predicate. Hob drafts here through `/me/hob` (`MeHobGroup`) with `intent: "character"`: a thread of the account's own (`"account"` reach, `0054`), the core drafting toolkit, and an accept that materialises through `Characters.createCore`. The same endpoint with no `intent` is the account's panel, which can also draft a campaign ([Hob](hob.md)). The screen asks `GET /me/hob` first and opens on the describe stage only when a model is behind it; otherwise it opens on the form with no way back to a composer.

Both are `Characters.insertOwn` behind a different gate and vocabulary, and neither writes a `campaign_character`. `account_id` is the actor's and has nowhere on the wire to go. The seat comes later through `party.join`, offered as Add to campaign on the roster and sheet (`characters/AddToCampaignDialog.tsx`). Until then no campaign party can read the character.

## The sheet's vocabulary: its tables, or the core rules

After creation a character's sheet reads one vocabulary, decided in one place: `characterVocabulary` in `repo/visibility.ts`. The spell picker (`Spells.forCharacter`), the level-up recompute (`recomputeForLevel`) and the subrace check on an edit all take it. Seated, it is `usableInCampaign` over every live seat whose campaign the owner can still read, unioned, because one character at several tables cannot be bound to one table's rules. At no such table it is the core rules (`coreRulesUsable`), whatever campaign the character was drafted in: the row does not record that context. `vocabularyAt` is the same rule for a draft, which names its context campaign or none.

Seating a character changes the answer on the next read and rewrites nothing; the sheet keeps what it was written with until the owner edits it or levels up, and leaving the last table hands it back to the core rules the same way. Nothing is lost on seating, because the core rules are inside every campaign's vocabulary for anyone who can read the campaign. The converse is not true: a level-up after leaving drops known spells the core rules do not have, as a level-up always drops spells the vocabulary no longer offers. The equipment picker and gear rows read the owner's Library (`library.equipment`), not a seat, so they are unaffected. `core-characters.test.ts` pins the unseated picker and recompute, the switch on seating and back on leaving, and the refusal for another account.

`CharacterOwnCreate` is `CharacterOwnUpdate` with a required name and no `hpCurrent`: how hurt somebody already is belongs to the table. The delete uses `ownCharacter` too, so a player can never remove a character they could not edit.

## Hob drafting: `intent` selects the toolkit, `reachOf` reads the thread

This section is the campaign path. With no campaign there is one surface and one reach (`/me/hob`, `"account"`), so neither question arises.

A creator holds threads in both campaign sets (the campaign's shared thread and their own drafting threads), so `Hob.ask` cannot infer the surface from the creator proof. `HobAsk.intent: "character"` (sent unconditionally by `characters/draft.ts`) selects the drafting toolkit and a thread of the asker's own, for creator and player alike; absent keeps the campaign panel unchanged. `hob-character.test.ts` pins that the creator drafts too.

Thread-naming operations (`turns`, `accept`) therefore read reach off the thread: `HobThreads.reachOf` selects through the OR of the two complete `conversationReachable` predicates and answers `"dm"` when `account_id` is null, `"own"` otherwise. Reach derived from the proof would let a creator draft a character they are then refused the keeping of. `threads.list` stays proof-derived because the panel's listing genuinely asks which set the panel shows. Accept takes no content payload; the row lands with `origin = 'assistant'` and every correction is an ordinary owner PATCH.

## The portrait: drawn once, seen by whoever sees the character

A character's portrait is the first kind of Hob-drawn image. [Images](images.md) covers the capability every kind shares: the worker, the records, the signed routes, the shared daily budget, the house style and the deletion outbox. This section covers what is particular to characters.

- **The trigger** is `HobImages.drawCharacter`, called by the handlers that make a character, the form's two creates and Hob's two accepts (`HobLive`, `MeHobLive`), after their transactions commit. Another way of making a character must call it too.
- **The record** is `character_portrait` (`0048_character_portraits.ts`): one row per character ever, bound to the character and its owner by the composite key to `character (id, account_id)`. A skipped row means there was no race, class, appearance or background (`portraitHasSubject`).
- **The prompt** is `portraitPromptFor` in `packages/api/src/Portrait.ts` with `HOUSE_PORTRAIT_STYLE`, the one implementation; no client sends a prompt.
- **Visibility is exactly the character's.** The wire carries `Character.portrait` (three signed paths, or `null`) and `portraitPending`. Every URL is minted by `portraitImages` in `repo/Characters.ts`, only for a portrait id that a read's own predicate returned. Two kinds of read return one:
  - A character read (`Characters`, and `Party`'s seat reads) selects `portraitColumns` beside the character. `toCharacter` throws on a row without them.
  - A row that only _points_ at a character selects `seatedPortraitColumn`. These are the runner's `Combatant` (`combatantColumns`, which `toCombatant` also requires), the creator's recap, and the player table's `you` and `ally` rows. The id comes back only through `characterSeatedAt`, a live seat at this campaign that the reader may see. `combatant.character_id` stays provenance, and a hidden or retired seat answers `null`.
  - `portraits.test.ts` covers the owner, the creator, a seat-mate before and after the seat is shared, and a stranger. `portrait-plates.test.ts` covers the runner, the recap and the player table, including a hidden seat and a combatant row whose character has no seat here.
- **The screens** use `CharacterPortrait` (`apps/web/src/characters/CharacterPortrait.tsx`) on the _My characters_ card and both sheet plates: initials always, the image over them when there is one, initials again on any error. While `portraitPending`, the card and sheet say Hob is drawing and re-read through `useHobDrawingPolling`. The list rows (both party lists, the runner's PC rows, the player table's `you` and `ally`) use its 28px `row` size. With no portrait, a row keeps its existing icon (`fallback`) or, on the player table, draws nothing, so a server with images off looks as it did. Only the card and the sheet show the pending state; a list row shows a portrait from the first read after it is ready.

## `sheetGrantsFor`: the corpora build the starting sheet

`sheetGrantsFor` in `packages/api/src/SheetGrants.ts` is the one implementation of the starting sheet. Both composers call it, the form's `payloadFrom` (`apps/web/src/characters/create.ts`) and Hob's `proposeCharacter` handler (`apps/server/src/assistant/toolkit.ts`), so the two paths cannot disagree (`create.test.ts`, `hob-character.test.ts`, `SheetGrants.test.ts`).

It reads only resolved `CharacterOption`s: level-1 class features (top-level grants only; a `parent_feature_id` is a pick made later), race and subrace trait grants, proficiencies from three sources (a `"Saving Throw: …"` line becomes the mark on the ability cell via `withSavingThrows`, `"Choose …"` lines are dropped), both starting kits and gold, and the identity keys the corpora answer (`identityGrants`: speed, proficiency, hit dice). Weapon attacks come off the kit's equipment rows with the 2014 ability rule; slots and casting numbers off `class_level.body.spellcasting` and the class's `spellcastingAbility`; the popular counters off `classSpecific`. The save number is written only when the level-1 `class_level` row supplied a proficiency bonus; a homebrew class without progression rows still gets the mark. Feats are deliberately not consulted: no 2014 SRD feat applies at level 1.

`seedFor` in `packages/api/src/Ruleset.ts` is the arithmetic beside it: race and subrace bonuses applied to the cells, then AC and HP derived from those same cells. It is seed-only; nothing calls it once a row exists. Backgrounds seed no scores in 2014.

Corpus import order matters on a fresh database: `equipment:import` before `ruleset:import`, and `ruleset:import` before `spell:import`. Wrong order fails loudly.

## Actions and resources

`sheet.actions` and `sheet.resources` (`SheetAction`, `SheetResource`) are optional document keys, so every old row decodes and there was no migration. Each line carries a nullable link to its source row (`equipmentId`, `spellId`, `featureId`, `racialTraitId`) and `derived: true`. The link is provenance, never read through; `derived` is what a recompute reads to know which lines are the corpus's to rewrite. `attacks` and `spellcasting.slots` are the legacy keys and the sheet falls back to them.

`ActionCost` (`action`, `bonus`, `reaction`, `free`) is drawn per line and nothing is tracked per turn. `packages/api/src/ActionOverlay.ts` is a curated table keyed by `feature.source_key` / `racial_trait.source_key` for what the source says only in prose (cost, recharge, the prose-only limits such as Second Wind). It is a table and not a parser because a regex over the prose misfiles costs silently; `character-actions.test.ts` proves every key resolves to a real bundled row. A homebrew feature carries none of it and reaches the sheet as a trait with no counter.

## Spend and rest

`POST /me/characters/:id/spend` moves one `sheet.resources[*].used` counter atomically, clamped to `[0, max]`, with an optional `requestId` backed by `character_resource_request`. `POST /me/characters/:id/rest` resets rest counters, spends hit dice on a short rest, heals through the `vitals.ts` clamp, and on a long rest fills HP, zeros temp HP, returns half the hit dice and clears concentration while keeping every other condition. Both are owner-only and ring `character-updated` for every open seat session. Only `rest` refuses while the character is in a live fight (`liveFightOf`, at any table); `spendResource` does not check.

The rest has two callers and one rule. `restCharacterRow` in `repo/Characters.ts` is the statement; the owner calls it under `ownCharacter`, and the creator's `POST /campaigns/:c/party/rest` (`Party.rest`, long rests only) calls it for every live seat's character under `characterVitalsWritable`. That is the one path by which the campaign side reaches a character's counted resources, and it is why a DM's rest shows at every other table the character sits at. The party rest is one transaction: it locks the characters, refuses with `Conflict` if any is in a live fight anywhere (naming no other campaign), claims `requestId` per character in `character_resource_request` so a retry rests nobody twice, and appends `character-updated` to this campaign's current night only, ringing it once. A short rest has no party form, because its hit dice are the owner's choice. Hob's direct resource spends during a fight are a separate creator-switched path (`repo/HobDirectWrites.ts`, see [Hob](hob.md)).

## Gear: one link, four paths, one attack rule

`InventoryItem.equipmentId` is the one link from a gear line to an `equipment` row, and every path that writes a line writes it where a row exists: the class kit, the background kit (`BackgroundBody.startingKit`), the Gear dialog's picker (`gearLineFor`), and Hob's drafted kit (`gearLinesNamed`: bundle only, exactly one case-insensitive match, otherwise the name stays as typed). A free-text line is allowed everywhere and renaming a linked line keeps the link.

The server never nulls a dead `equipmentId`; a line whose row is absent draws as an unlinked one (`gear.test.tsx`). `sheetWithGear` in `packages/api/src/Gear.ts` is the attack rule for gear added after creation: it lifts `weaponAttack` from `SheetGrants.ts` (exported for this caller only), reads Extra Attack back off an existing derived line, gives a newly linked weapon a line, keeps an existing derived line as written, retires a derived line whose gear is unlinked, and never touches a line the player typed.

## The sheet document and its editors

A field earns a column when something in the product reads it (a filter, a predicate, the seed); everything else is an optional key on `body`, which is why the drawn sheet cost no migration. `Ability` and `Trait` are the bestiary's shapes extended, not a second pair.

`sheet.story.appearance` (at most `APPEARANCE_MAX`, 400 characters, the bound an NPC's `persona.identity.appearance` shares) is the one story line both composers write: the form's _Appearance_ box and `proposeCharacter`'s `appearance`, and the Story editor (`BackstoryDialog`) corrects it after. It is its own key rather than more `notes` because it is what a portrait is drawn from. `portraitPromptFor` in `packages/api/src/Portrait.ts` is the one implementation of that prompt, for the server and any screen that says what a portrait reads; it takes subject, appearance, up to two carried lines and the background, and never the name, backstory, bond/ideal/flaw or scores. `portraitHasSubject` is the guard a caller skips generation on.

The abilities and skills editors (`characters/AbilityFields.tsx`, with `abilities.ts` and `skills.ts` as the tested pure halves) follow four rules. The dice are the browser's; the only request is the PATCH. `Ability.score` and `Ability.modifier` are both stored strings, so the modifier is always computed from the score and written in the same object literal; a stale modifier is recomputed, never carried. Saving throws and skill bonuses are not derived, because each needs a proficiency the document does not model. Unknown rows are preserved (a seventh cell or a homebrew skill survives a save from a form that never drew it) and blank rows are not written.

## `GET /me` and `GET /me/characters`

`GET /me` answers `AccountIdentity`, `{ id, name }` only: `name` is the ask, `id` the join key against `accountId` fields already on the wire. It takes no parameter and must not grow into a lookup; other people's names are the roster, behind the creator gate.

`GET /me/characters` is the one read on `character` naming no campaign. `Characters.mine` selects by `ownCharacter` and attaches each row's live seats as `CharacterSeatRef`s (`OwnedCharacter`); campaign names come from `GET /me/campaigns`. It is a narrowing, not a reach: an account owning nothing gets `[]`, and it cannot fail. `my-characters.test.ts` pins it.

## The roster: statuses derived, no seat count

Membership is the model and there is no seat that exists before a person. `apps/web/src/party/roster.ts` derives three statuses from three reads: `playing` is a player member with a live `campaign_character` at this table, `no-character` the same member with none, `invited` a `CampaignInvite` whose status is `live`. The Party tab draws the `playing` ones as their seats' cards and the other two as _Not playing yet_, each with the one line worth saying about them. There is no `open` status and no seat count, because a seat cannot exist before an account and a denominator nothing can produce would be a stubbed number. `members.test.ts` pins that no table in the schema is named for a seat.
