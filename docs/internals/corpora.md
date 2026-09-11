# Corpora and the Library

This page covers the bundled 2014 SRD corpora (creatures, character options, spells, equipment, magic items, feats, rule articles), the account-owned Library beside them, and how a campaign uses a row from either without managing a copy. Read it before adding a corpus table, an importer, a corpus read, or anything resembling a campaign corpus screen. The predicates are owned by [Visibility](visibility.md); Shared World library shares by [Shared Worlds](shared-worlds.md).

## Three owners, and `origin` is not one of them

Every copyable corpus table (`creature`, `character_option` and its child tables, `spell`, `equipment`, `magic_item`, `feat`, `rule_article`) holds three kinds of row, told apart by two id columns:

- the bundle: `campaign_id` null, `account_id` null, writable by nobody;
- a Library original: `account_id` set, writable by that account (`libraryRowWritable`);
- a campaign instance: `campaign_id` set, writable by nobody through any endpoint (see below).

Two check constraints per table make this structural. `<table>_one_owner` makes the columns mutually exclusive, so each write predicate names one column. `<table>_system_is_unowned` says `(origin = 'system') = (campaign_id is null and account_id is null)` in both directions: a `system` row never carries an owner, and an unowned row cannot be minted as anything else. The bundle's immutability follows from the predicates alone: every write compares an ownership column to a value the request carries, and a null never equals a uuid.

So **there is no `origin = 'system'` check anywhere in `apps/server/src`, and none may be added.** `repo/visibility.ts`'s `unowned` fragment is the only place "the bundle" is spelled. `apps/server/test/library.test.ts` drives the guarantee from every write path plus raw SQL; `bestiary.test.ts` and `migrations.test.ts` hold it from the schema side.

## The bundle is imported, not posted

Global content has no campaign to scope it to, so no actor could check an endpoint that minted it. The bundle is provisioned by five shell commands (`apps/server/src/bin/import-*.ts`, `pnpm -F server <corpus>:import`) reading checked-in snapshots, with no runtime fetch. The importer modules (`bestiary/import.ts`, `ruleset/import.ts`, `ruleset/rules.ts`, `spells/import.ts`, `equipment/import.ts`, `magic-items/import.ts`) are the only code under `src/` that writes content without `CurrentActor`. `apps/server/test/membership.test.ts` enumerates which files may mention `account_id`, so a new importer is a visible edit to that list.

The order matters on a fresh database and is written in `README.md`:

1. `equipment:import`: background and class kit lines resolve to equipment rows;
2. `ruleset:import`: options, feats and rule articles; seeds the vocabularies (`syncSystemVocabularies`) and the class progression that spells and feats point at;
3. `spell:import`: `spell_subclass` needs `subclass` to exist;
4. `bestiary:import`: monster relationships reference spells and equipment;
5. `magic-item:import`.

Wrong order fails loudly and re-running settles it: every importer upserts on the stable source triplet `(source_corpus, source_family, source_key)` through a partial unique index over unowned rows, so a rename updates one row and two entities may share a display name. No source URLs, payloads, hashes or import runs are stored; source relationships live in concrete lookup and join tables (`0025_concrete_source_relationships.ts`), not a source graph.

Two source families, never to be collapsed:

- `taverns-starter`: the project-authored starter bestiary. It is not SRD and must not be relabelled as such.
- `5e-bits-2014`: everything transformed from the pinned 5e-bits `5e-database` snapshot, version `5.10.0`, commit `5a7ee5a0489b26655d343e4a41e8f7942a887af2` (each `system*.ts` header names its source files). Attribution lives in `THIRD_PARTY_NOTICES.md`, the README and the web footer, not per row.

Visibility is the one place importers differ. `bestiary:import` never writes it, so bundled stat blocks stay at the `dm` default (players must never see one) and a shared one survives an upgrade. The other importers write `visibility = 'shared'` on insert only and omit it from `do update set`, so players can fill the create form's pickers while an option a creator has hidden is not re-shared by a re-import.

## Row form and document form

A corpus row keeps two forms, and neither derives from the other. Filterable and sortable values are columns; the display half is one `jsonb` `body` (`statBlock` on the wire for creatures) queried only by full text. `"17 (chain shirt, shield)"` is not recoverable from `17`, so both are stored. `cr` is a string (`"1/4"`) with `cr_sort` beside it, derived on write by `crSortFor` in `repo/Creatures.ts` and overridable; it is `double precision` because `pg` returns `numeric` as a string. See [Data model](data-model.md).

## How a campaign uses a corpus row

There is no campaign-scoped corpus management. The `creatures` API group has `list` and `findById`, the `options` group has `list`, no other corpus has a campaign group, and there is no `derive` endpoint in `packages/api/src/Api.ts`. The web has only Library shelves under `/library/*`.

`usableInCampaign` (`repo/visibility.ts`) is what every campaign corpus read answers: rows in no campaign, gated on `campaignReadable`, that are (a) the bundle under the row-visibility rule `corpusRowReadable` always applied to it (creator, or `visibility = 'shared'`), (b) the reader's own Library, untested for visibility, or (c) originals shared to the campaign's Shared World via `group_library_share`. It never returns a campaign row. `creatures.list`, `options.list`, `repo/Search.ts`'s creature arm, `Characters.subraceResolves` and Hob's per-request vocabulary all compose it, so what is pickable is what validates, what search finds and what Hob is held to.

The one instance the product mints is inside `EncounterCreatures.create`. A roster add accepts anything `copyableIntoCampaign` reaches (existing instances, the bundle, the caller's Library, Shared World shares). When the source is an owned original (`campaign_id` null, `account_id` set) the transaction copies it into the campaign with one `insert … select`, `derived_from` set and `origin`/`visibility` at their defaults, and points the roster line at the snapshot. A bundled row is referenced directly; a re-import updating it in place is a version upgrade, and history is immune one level down at combatant seed. The duplicate `Conflict` checks `creature.id = source OR creature.derived_from = source` per encounter, so adding an original twice cannot mint a second invisible instance. Deleting the original leaves instances standing with `derived_from` null; nothing reads through that pointer.

Instances are enumerable by nothing and editable by nobody. `creatures.findById` resolves one through `corpusRowReadable OR usableInCampaign`, deliberately not bare `copyableIntoCampaign`: its Library disjunct has no campaign gate and no visibility test, so spelled that way a player read a bundled stat block by id and a stranger's campaign id answered instead of 404ing (`bestiary.test.ts` pins it). The roster wire row carries a server-joined `name` so no client dereferences instance ids.

How homebrew reaches players: an account's Library serves all of its own tables directly, and the Shared World share is the one explicit act that puts an original in front of a table's other members, in the create form's pickers and Hob's grammar alike. Withdrawing the grant takes it out; minted instances stand. A player's own Library is in their picker at any table; it grants nothing they could not type by hand.

## What the Library reads

`libraryRowReadable` is `campaign_id is null and (account_id is null or account_id = <me>)`. Three deliberate absences:

- **No campaign gate.** Every other predicate bottoms out in `campaignInScope` because every other row is inside a campaign. A Library entity is in none, so the owner is the whole question, compared to the actor's own account and never a caller's value. A member of nothing still has a Library.
- **No row `visibility` test, in either half.** Your own rows have nobody to hide from, and testing the bundle's would hide the monster corpus (imported at the `dm` default); `visibility` is about players at a table, and this read has no table. The stated consequence: an account that is only ever a player reads the whole bundle, stat blocks included, in its own Library. What a player sees through a campaign is still `usableInCampaign`'s question.
- **Not narrowed by credential scope.** Scope names a campaign a credential reaches, and there is none here. Nothing mints a scoped credential over HTTP today; `library.test.ts` pins the decision so whoever mints the first one is told.

`libraryRowWritable` is the read minus the bundle's disjunct, so an account can never write a row it could not read. Library payloads carry no `visibility` field; the column exists only because `schema.test.ts` requires it on every content table.

## Character options

`character_option` carries the same three owners; the four generic predicates need no special case. Points a maintainer would otherwise get wrong:

- **Races contain subraces; there is no fourth kind.** A subrace is a child in `RaceBody.subraces`, resolved everywhere through `subraceNamed(race, label)` (`packages/api/src/CharacterOption.ts`). `repo/Characters.ts` validates a named subrace against a usable race in that campaign; a free-text race may stand alone, and a stale subrace beside a changed race is a `Conflict`.
- **`kind` is a query parameter, not a path segment**: `/options/class` and `/options/:optionId` would collide, and the create form wants every kind in one request. The list is not paged; `OPTION_LIMIT` is a sanity bound.
- **Updates carry no `kind`.** `OptionLibraryUpdate` is name, body and relations; a body contradicting the row's kind is a `Conflict` from `bodyKind` in `repo/Options.ts`, the only place a body is told apart by shape.
- **Backgrounds are source grants, not ability math.** `BackgroundBody` records proficiencies, languages, kit, feature and choice text and has no ability-score field; choosing one writes sheet facts and never moves the six cells or the seeded HP/AC. `packages/api/src/Ruleset.ts` is arithmetic only (`seedFor` and the entry types), with no fallback label maps.
- **Concrete vocabulary lives beside the prose document, not instead of it** (`0027_character_vocabulary_traits.ts`). `ruleset:import` runs `syncSystemVocabularies` before options and `syncImportedOptionRelationships` after each, clearing and reinserting FK-backed grants deterministically. `details` on a read is the machine-readable answer; `ClassBody.proficiencies` and friends remain the readable summary, so an edit that omits either authors half an option.
- A character's background is `sheet.identity.background` and earns no column; `class_name`, `race` and `subrace` are columns because `descriptor` is generated from them ([Characters](characters.md)).

## The other corpora

Spells, equipment, magic items, feats and rule articles are dedicated tables, not `character_option` kinds: each needs its own filters and document shape. All use the three-owner model unchanged; do not add a corpus-specific reach rule.

- `equipment` is mundane only: no magic items, shops, encumbrance or inventory. Sheet lines link to it by `equipmentId` as provenance, never read through.
- `magic_item` variant/base links come from source refs, not name parsing, and `magic_item_base_same_scope_fkey` (`0023_magic_items.ts`) stops a variant pointing at a base in another owner's scope. Authored originals are standalone; no variant metadata is inherited.
- `feat` prerequisites are child rows with an FK into `ability_score` (grouped by `feat_prerequisite_group`), which is why feats import inside `ruleset:import` after the vocabularies. Grappler is the whole pinned corpus.
- `rule_article` (the web's Compendium, not the character-building Rules) owns ordered `rule_section` rows. `rule_section` has no visibility or provenance tail and is in `schema.test.ts`'s `NOT_CONTENT`; sections inherit reach from their article.

## Two shelves, one predicate; propagation stops at every hop

Each corpus has one Library shelf (originals plus the bundle, `libraryRowReadable`) and one campaign-facing read (`usableInCampaign`). They are disjoint by predicate, so neither can return the other's rows, and no screen applies a filter of its own; one that did would be a second answer to a settled question. The web reads ownership from `campaignId`/`accountId`, never `origin` (`bestiary/provenance.ts`, `rules/option.ts`): an imported original is still the account's.

A Library original, an instance minted from it, and a character seeded from a shared class are three snapshots with no join between them: editing the original reaches neither the instance nor the sheet, `derived_from` is provenance only, and `character` stores no pointer. There is no recompute-all button; the accepted cost is that the product cannot later say which source row a character was seeded from.
