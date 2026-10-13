import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Undoing a kept Hob turn (`repo/NpcTurns.ts`).
 *
 * The undo puts back the snapshot `hob_npc_turn_row` holds of each row the
 * turn touched, and marks `hob_npc_turn.undone_at` (`0095`). It does not
 * delete the turn's rolls: a roll goes only with its night (the maintainer's
 * standing exception), so `character_roll.undone_at` marks the ones an undone
 * turn rolled, for the log to strike through, and stays null on every other
 * roll. The log itself is append-only, so the undo appends a line of its own,
 * `hob-turn-undone`, rather than touching the `hob-turn-kept` it takes back.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table character_roll
      add column undone_at timestamptz,
      add constraint character_roll_undone_is_hobs
        check (undone_at is null or origin = 'assistant')
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
        'board-fog-updated', 'board-area-updated'
      ))
  `;
});
