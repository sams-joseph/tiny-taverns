# Data model idioms

How tables in `apps/server/src/migrations/` are shaped, and the rules a new table, column, foreign key or search arm has to follow. Who may read a row is [Visibility](visibility.md); the bundled corpora and the Library as tables are [Corpora](corpora.md); the character row and its seat are [Characters](characters.md).

## A column is earned by a reader

A field becomes a column when something reads it as one: a screen filters or sorts on it, a seed copies it, a predicate names it, search indexes it. Everything else is display, and display lives in one `jsonb` document per row (`creature.body`, on the wire `statBlock`; `character.body`, on the wire `sheet`). The document is queried only by full text, and the two forms do not derive from each other: `ac = 17` filters, `"17 (chain shirt, shield)"` is what gets read out, and neither reconstructs the other. A sheet change that seems to need a column is a finding to report.

Two absences that look like omissions and are not:

- A column that would be structurally `0` is worse than none. `Encounter.creatureCount` is `sum(encounter_creature.count)` computed per read (`creatureCount` in `repo/Encounters.ts`) over rows the actor can see, so the card and the roster agree. Its subquery uses `nestedRowReadableWithin`, which omits the parent check because the enclosing query already applied it; use it in a subquery over the parent table and nowhere else.
- "Which encounter is on the table" is a pointer, not a boolean. `session.active_encounter_run_id` names the one live run; a flag per encounter would let two rows claim the table. `encounter_run.active_combatant_id` is a pointer for the same reason: reordering the list would leave an index naming a different creature.

## Generated columns

`character.descriptor` (`"Level 3 Hill Dwarf Paladin"`) and every `search` column are `generated always as ... stored`. Postgres refuses an `INSERT` or `UPDATE` naming one, so no payload carries the field and no client computes a preview. Three things the syntax will not tell you:

- The expression must be immutable. `concat_ws` is only `stable`, so `descriptor` is spelled with `nullif`/`btrim`/`coalesce`.
- A generated column may not reference another generated column, which is why `character.search` re-composes the identity columns instead of reusing `descriptor`.
- A migration does not backfill by guessing. When `descriptor` became generated, the old free text moved to the sheet's `notes` and the line stayed null until the boxes were filled; parsing `"Half-orc paladin"` into columns the DM trusts would have written a guess. `migrations.test.ts` pins it.

## Composite foreign keys as containment

A child inside a campaign references its container through a composite key that includes the container's scope column, so a cross-campaign attachment is unrepresentable rather than checked: `note_encounter_fkey` is `(encounter_id, campaign_id) -> encounter (id, campaign_id)` (`0003_prep_surface.ts`), `beat_run_fkey` is `(encounter_run_id, session_id) -> encounter_run (id, session_id)` (`0008_beats.ts`), and `encounter_run_active_combatant_fkey` binds the turn marker to a combatant of the same run. Postgres matches a composite key only when every column is non-null, so an unattached note is simply unconstrained with no partial index or trigger.

The `on delete set null (encounter_id)` column list is Postgres 15+ and load-bearing: a bare `set null` would null the scope column too and hit its not-null. Detach rather than cascade where the child is the DM's prose.

Where a composite key is impossible the containment moves into the repository, against the same predicate the read uses: `encounter_creature.creature_id` cannot name a campaign because bundled rows have none, and `encounter_run.continued_from` cannot because both ends are `encounter_run`.

## A generated boolean in the key makes a state unrepresentable

The same trick applied to a predicate. `session.is_open` is `generated always as (ended_at is null)`, the campaign carries `current_session_is_open generated always as (true)`, and `campaign_current_session_id_fkey` references `session (id, is_open)` (`0006_session_finished.ts`). Once a session ends there is no `(id, true)` row to match, so a finished session can never be current, against raw SQL as well as the repositories (`session-lifecycle.test.ts`).

`0001_init.ts` uses it for membership: `group_member.is_active` and `campaign_member.is_active` are `generated always as (revoked_at is null)`, every "requires a live member" key references `(…, account_id, is_active)`, and the referencing side spells its column `nullif(<live>, false)` so a revoked row drops out of the key rather than matching `false`. Revocations must retire dependent seats in the same transaction or the commit fails.

One cost: `on delete set null` is refused on a key containing a generated column, so `Sessions.remove` clears the campaign pointer itself.

## Deferred keys, and a failed commit is a defect

`deferrable initially deferred` is the default for any key whose two ends are written in either order or deleted by one cascade: the keys above, `encounter_creature.creature_id` (`0004_bestiary.ts`), and every content table's `assistant_turn_id` (`0010_assistant_conversation.ts`). `delete from campaign` cascades into `creature` and `encounter_creature` in one statement; an immediate `no action` fires before the referencing rows are gone and rejects a legal delete. Deferring moves the check to the end of the transaction, which under autocommit is still the end of that one statement, so a lone `delete from creature` on a roster is still refused.

`sql.withTransaction` wraps the commit in `Effect.orDie`, so a deferred constraint failing at COMMIT arrives as a defect: `Effect.result` does not catch it and `Effect.exit` does, while an immediate constraint still fails inside the transaction as a typed `SqlError`. A test asserting a refusal has to know which.

## Nested tables carry no denormalised `campaign_id`

`prep_item`, `beat`, `session_event`, `combatant` and `encounter_creature` hang off their parent and name no campaign. A copied `campaign_id` that disagreed with the parent's would make the row readable in a campaign it is not in, and no `WHERE` clause would notice. Reach is carried down by `nestedRowReadable` / `containedRowReadable`, which compose the parent's predicate rather than restating it. `schema.test.ts` fails on a `campaign_id` reappearing on `character` or `npc_awareness_candidate`.

## Driver shapes

- `encounter.tags` is `text[]`, not a join table. A bare JS array interpolated into a `sql` template is one bind parameter that `pg` serialises to an array literal. `sql.in(...)` expands an array into `(?, ?, ?)` and is for id lists (`Recap.ts`), not here.
- `pg` returns `numeric` as a string, so `creature.cr_sort` is `double precision`; every rating is an integer or 1/8, 1/4, 1/2, all exact in binary. `cr` stays the string the DM wrote and `cr_sort` is derived on write.
- `session_event.seq` is a `bigint` from one global sequence and comes back as a string; `repo/SessionEvents.ts` narrows it once.
- One statement per `sql` call. The extended protocol rejects several in one query.

## Campaign search

`repo/Search.ts` is the only place a `tsvector` is queried and `GET /campaigns/:campaignId/search` its only surface; Hob's `searchCampaign` wraps `Search.search` with no SQL of its own. A read this repository does not expose is a new method here, never a query elsewhere.

- Each indexed table has its own generated `tsvector` column with a GIN index. A generated column cannot go stale; a denormalised `search_document` table would need a trigger somebody forgets.
- The arms are one SQL `union all` under one `ORDER BY ts_rank`, so weights stay comparable across tables (name A, secondary columns B, `jsonb_to_tsvector(body)` C; `beat.body` is B on purpose, not the default D).
- The campaign gate is inside every arm, composed from that table's shipped predicate (`rowReadable`, `containedRowReadable`, `usableInCampaign`, `characterSeatedAt`). One arm forgetting it returns rows for any request naming any campaign id. Cross-campaign search is refused, not unbuilt; `search.test.ts` mints a scoped actor and proves both directions.
- `websearch_to_tsquery`, never `to_tsquery`, which raises on a stray `&` and turns a search box into a 500. `likeContains` in `repo/rows.ts` is the one `ILIKE` escaper. An `ILIKE`-only hit ranks 0 and falls through to recency; that is correct.
- `ts_headline`'s `StartSel`/`StopSel` must be the quoted empty string (`HEADLINE`). Written bare, the option parser swallows the next option and the snippet carries `,StopSel=` and markup.
- `session_event` is deliberately not indexed. Its text is numbers, the only prose in it already lives on `encounter_run` and `combatant`, and indexing it would make `payload` load-bearing when `SessionEvent.ts` says it is not.

## Beats

`beat` is one line of prose under `session`: no title, no attachment, no reuse. It is not a `note` kind because `notes.list` has no filters, `NoteCreate.title` is non-empty and `note` would need a second container column; it is not a `session_event` kind because that log has no update or delete path and a beat jotted at a dark table will need correcting. The discipline: if a beat ever grows a title or an attachment, merge it into `note`. Creating one appends `beat-added` and rings the doorbell so a recap can order beats against combat from the log alone; the prose is not in the payload, and a correction appends nothing.

## The migration ledger

- Forward only. `effect/unstable/sql/Migrator` has no down concept; a mistake is a new migration.
- An id below the highest already applied is skipped silently (`Migrator.run` keeps `currentId > latestMigrationId`). Parallel numbering can leave a gap that never fills; renumber the latecomer or reset, and do not read a green boot as proof every file ran.
- `0001_init.ts` is a rewritten clean baseline. An old development database silently keeps its old shape, so it must be reset: `pnpm db:reset` for the Docker database, or `pnpm -F server db:reset:fresh -- --force` against one the repo's Docker does not own. That is the product's one destructive command and is never startup DDL.
- The server migrates on boot and refuses a schema it does not know; `pnpm -F server migrate` runs the ledger without holding a port.
- Every content table gets `visibility`, `origin` and `assistant_turn_id`; the opt-out list is `NOT_CONTENT` in `schema.test.ts`.

## Database tests

`apps/server/test/support/database.ts` creates a private database per test file and turns a connection failure into a message naming `pnpm db:up`. Do not make these tests skip; a silently skipped database test has hidden shipped defects before. `start.smoke.test.ts` provisions its own database through `DATABASE_URL`, so a spawned `dist/main.js` never migrates the developer's default.

`apps/server/vitest.config.ts` caps the suite at `maxWorkers: 8`: every file applies the full ledger on its first runtime build, and core-count parallelism ran 30 simultaneous DDL transactions that exhausted PostgreSQL's shared lock table (SQLSTATE `53200`, `max_locks_per_transaction`) while connections were plentiful. The cap lives in the checked-in config rather than in a tuned database. `testTimeout` and `hookTimeout` are both `60_000` because the same `migratedDatabase` cost lands on a hook or a test body depending on whether a file has a `beforeAll`; `start.smoke.test.ts` keeps its own `180_000` because it runs `tsc` inside the test beside CI's concurrent builds.
