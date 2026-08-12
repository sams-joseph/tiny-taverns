import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The campaign search index: the DM's own prose, made findable.
 *
 * `creature.search` (`0004_bestiary.ts:79-97`) is the shipped precedent and
 * this is the same shape applied to the two tables that hold prose — a
 * **generated `tsvector` column with a GIN index over it**, one per table,
 * unioned at read time by `repo/Search.ts`.
 *
 * ### Why per-table columns rather than one `search_document` table
 *
 * A denormalised copy needs a trigger or repository discipline to stay in step,
 * and it will eventually be forgotten — a stale copy is exactly the class of bug
 * the composite keys and generated columns elsewhere in this schema exist to
 * prevent. **A generated column cannot go stale**: Postgres recomputes it inside
 * the same statement that changed the row, so an edit made in `psql` behind
 * every line of TypeScript is indexed too.
 *
 * It also keeps the visibility seam where it already is. Each arm of the union
 * carries its *own* predicate from `repo/visibility.ts` — `rowReadable` for
 * notes, the `beat → session → campaign` chain for beats, `corpusRowReadable`
 * for creatures. A single denormalised table would have to carry a second copy
 * of every row's visibility, which is a second place for the seam to be wrong.
 *
 * The cost of the alternative, stated plainly: one simpler query and one rank
 * scale, paid for with triggers, a backfill and a duplicated visibility answer.
 *
 * ### `session_event` is deliberately **not** indexed
 *
 * Settled by the captain on evidence, reversing an earlier line that said the
 * log "must be searchable". Three reasons, none of them taste:
 *
 * - The log's text content is numbers. `jsonb_to_tsvector` over real payload
 *   shapes yields `'12':3 '40':5 '82':1` — hit points and round counters.
 * - The only prose in any payload is `run-started.encounterName` and
 *   `combatant-added.displayName`, and both are already real text columns on
 *   `encounter_run` and `combatant`. A tsvector over the log would index
 *   combat numbers and duplicate two columns.
 * - It would make `payload` load-bearing, which `packages/api/src/SessionEvent.ts`
 *   states out loud that it is not.
 *
 * Combat stays reachable three ways without a text index: by name, through
 * `encounter_run.encounter_name` and `combatant.display_name`; by night,
 * through the recap; and structurally, through `GET …/log?since=`. Per-table
 * indexes mean adding a fourth arm later is about eight lines, so this is the
 * cheapest decision on the list to reverse if a query shape appears that those
 * three cannot serve.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // The DM's prep prose. Title weight A, body weight B — the same scheme
  // `creature.search` uses for its name and its size/type line, which is what
  // makes `ts_rank` comparable across the arms of the union rather than three
  // scales that only look like one number.
  //
  // Both columns are `not null` (`0001_init.ts:110-127`), so there is no
  // `coalesce` here and none is needed; `body` defaults to the empty string,
  // which `to_tsvector` maps to an empty vector.
  yield* sql`
    alter table note
      add column search tsvector generated always as (
        setweight(to_tsvector('english', title), 'A') ||
        setweight(to_tsvector('english', body), 'B')
      ) stored
  `;
  yield* sql`create index note_search_idx on note using gin (search)`;

  // What the DM jotted at the table. One text column, so one weight — and it is
  // **B rather than the default D**, on purpose: a beat's body is the same kind
  // of thing as a note's body, and leaving it unweighted would rank every beat
  // at a quarter of an equally good note for no reason anyone could defend.
  //
  // `0008_beats.ts` deliberately left this out ("an index nothing reads is
  // worse than none") and this is the migration that was waiting for.
  yield* sql`
    alter table beat
      add column search tsvector generated always as (
        setweight(to_tsvector('english', body), 'B')
      ) stored
  `;
  yield* sql`create index beat_search_idx on beat using gin (search)`;
});
