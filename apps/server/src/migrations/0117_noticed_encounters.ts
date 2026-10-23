import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * The party comes to see an encounter placed on its level visit
 * (`LevelVisits.ts`' `noticedIn`), and the DM's runner offers to start it.
 * Whether an encounter is noticed is computed on every read, never stored;
 * this adds only the line that says it became so.
 *
 * ### `visit-encounter-noticed`
 *
 * Logged on the open night, naming the visit, by the write that turned an
 * encounter from not noticed to noticed: a visit write, a placement, a seat
 * standing or leaving, a fight handing the dungeon back. Compared before and
 * after in that write's transaction, so it is logged once per coming into
 * notice, and again only after the party lost it and found it once more. No
 * dismissal is stored: *Not yet* is the DM's tab's alone. Always the DM's
 * line, since it says where a fight waits; the players' table already draws
 * what the party sees (`0114_level_visit_writes.ts`' `visit-*` kinds).
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
        'visit-vision-updated', 'visit-placement-updated', 'visit-returned',
        'visit-encounter-noticed'
      ))
  `;
});
