import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Placing an encounter on its level (`EncounterSpots.ts` in `@taverns/api`):
 * where its creatures stand before the fight (`encounter_creature_spot`,
 * `0113_level_visits.ts`) and, here, the squares that set it off.
 *
 * ### `encounter_prep.trigger_squares` — the trigger area
 *
 * The squares of the encounter's level the party sets the encounter off by
 * entering, `row * columns + column`, or `null` for none. On the prep row
 * (`0060_encounter_prep.ts`) rather than on `encounter`, for that table's
 * reason: a player reads a shared encounter's row, and where the DM's fight
 * waits is the creator's alone. No player read touches `encounter_prep`.
 *
 * `fog_hidden`'s spelling (`0087`): one dimension, no `null`, no negative
 * square. Ascending, distinct and inside the level's `columns × rows` are the
 * repository's (`Encounters.place`), since a check cannot read the level and a
 * level can be resized; the repository also writes an empty area as `null`,
 * so `null` is the one way to say none. It is cleared wherever the spots are:
 * when the encounter's level changes or is deleted.
 *
 * ### `visit-placement-updated`
 *
 * A placement written while a night is open and the campaign has a visit of
 * the encounter's level is a line in the night's log naming the visit, the
 * DM's own (`0114_level_visit_writes.ts`' `visit-*` kinds).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table encounter_prep
      add column trigger_squares integer[]
        constraint encounter_prep_trigger_shape check (
          array_ndims(trigger_squares) = 1
          and cardinality(trigger_squares) > 0
          and array_position(trigger_squares, null) is null
          and 0 <= all(trigger_squares)
        )
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
        'hob-resource-spent', 'hob-resource-undone', 'hob-turn-kept', 'hob-turn-undone',
        'scene-updated', 'check-logged', 'check-removed',
        'board-fog-updated', 'board-area-updated',
        'board-door-updated', 'board-light-updated', 'board-vision-updated',
        'board-region-updated',
        'party-moved',
        'visit-opened', 'visit-tabled', 'visit-token-moved', 'visit-door-updated',
        'visit-light-updated', 'visit-region-updated', 'visit-fog-updated',
        'visit-vision-updated', 'visit-placement-updated'
      ))
  `;
});
