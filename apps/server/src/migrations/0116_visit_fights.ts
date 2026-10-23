import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * A fight borrows the level visit it is played on, and hands it back
 * (`EncounterRuns.start` and `end`, `levelFights.ts`' `borrowVisit` and
 * `handBack`). The pointer and its one-live-fight-per-visit index are
 * `0113_level_visits.ts`' `encounter_run.level_visit_id`; nothing about the
 * tables changes here.
 *
 * ### `visit-returned`
 *
 * A borrowing fight ending resolved writes the fight's doors, lights,
 * reveals, fog, seen squares and the party's squares back onto the visit, and
 * logs this line on the fight's night naming the visit: shared while the visit
 * is on the table, since the players' table goes back to the level, else the
 * DM's (`0114_level_visit_writes.ts`' `visit-*` kinds).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

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
        'visit-vision-updated', 'visit-placement-updated', 'visit-returned'
      ))
  `;
});
