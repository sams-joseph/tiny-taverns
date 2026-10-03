import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Death saves leave the sheet document and become two columns on each copy.
 *
 * They lived in `character.body` as `deathSaves` because nothing but the
 * player's own sheet read them. The DM's runner draws them on the initiative
 * row now, so they are live state that two rows hold — the rule `0014` set for
 * a hit point — and `repo/vitals.ts` writes both copies in one transaction.
 *
 * - `character.death_save_successes` / `death_save_failures`, the owner's.
 * - The same pair on `combatant`, the fight's copy. A combatant seeded before
 *   this has nought and nought, which is what its character had in every case
 *   a fight could have drawn.
 *
 * `not null default 0`, as `temp_hp` is: nought up and nought down is the
 * ordinary state, not an unknown one. Each sheet's `deathSaves` moves into the
 * character's columns, clamped to the range the columns allow, and the key is
 * taken out of the document so there is one answer, not two.
 *
 * `death-save` joins the log's closed vocabulary.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  for (const table of ["character", "combatant"]) {
    yield* sql`
      alter table ${sql(table)}
        add column death_save_successes smallint not null default 0,
        add column death_save_failures smallint not null default 0,
        add constraint ${sql(`${table}_death_save_successes_range`)}
          check (death_save_successes between 0 and 3),
        add constraint ${sql(`${table}_death_save_failures_range`)}
          check (death_save_failures between 0 and 3)
    `;
  }

  // Only a number moves; anything else the document held under the key is
  // read as nought. `jsonb_typeof` keeps a string or a fraction from failing
  // the cast and the migration with it.
  yield* sql`
    update character
    set death_save_successes = case
          when jsonb_typeof(body #> '{deathSaves,successes}') = 'number'
            then greatest(0, least(3, floor((body #>> '{deathSaves,successes}')::numeric)))
          else 0
        end,
        death_save_failures = case
          when jsonb_typeof(body #> '{deathSaves,failures}') = 'number'
            then greatest(0, least(3, floor((body #>> '{deathSaves,failures}')::numeric)))
          else 0
        end,
        body = body - 'deathSaves'
    where body ? 'deathSaves'
  `;

  yield* sql`alter table session_event drop constraint session_event_kind_check`;
  yield* sql`
    alter table session_event
      add constraint session_event_kind_check check (kind in (
        'run-started', 'run-updated', 'run-ended', 'run-carried', 'run-resumed',
        'run-escalated',
        'combatant-added', 'combatant-updated', 'combatant-removed',
        'combatant-damaged', 'combatant-moved', 'turn-advanced', 'death-save',
        'beat-added', 'character-updated', 'roll-made',
        'hob-resource-spent', 'hob-resource-undone',
        'scene-updated', 'check-logged', 'check-removed'
      ))
  `;
});
