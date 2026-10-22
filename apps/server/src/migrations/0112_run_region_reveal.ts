import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * A secret region of a fight's level can be revealed to the table mid-fight,
 * and hidden again, as a secret door can (`0109_level_fights.ts`): the trap
 * the rogue found, the hazard the party stumbled into.
 *
 * `encounter_run_region.revealed` is that switch, live on the fight's copy
 * and written by the DM alone (`RunBoards.updateRegion`). Only a secret
 * region is ever revealed; a region that is not secret is always the
 * table's. A seated player's narrowed level (`playerLevelColumn`) sends a
 * revealed secret region as it sends any other, clipped to the squares the
 * party has seen. A resumed fight carries it with the rest of the copy.
 *
 * `board-region-updated` is its session event: which region and what it
 * became, always the DM's line, with a contentless shared
 * `board-vision-updated` ringing the table when the region touches a square
 * the party has seen.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table encounter_run_region
      add column revealed boolean not null default false,
      add constraint encounter_run_region_revealed_secret check (not revealed or secret)
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
        'party-moved'
      ))
  `;
});
