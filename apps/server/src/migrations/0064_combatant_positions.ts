import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A combatant's token on its fight's board: `combatant.board_column` and
 * `board_row`, in squares from the board's top-left, or both `null` while the
 * token is not on the board.
 *
 * ### Squares, against the fight's own board
 *
 * A position means something only against a grid that does not move under it,
 * which is why `0058_encounter_run_boards.ts` gave each fight its own copy of
 * the grid. The columns here are bounded by the largest board that copy may
 * hold (200 squares a side); the fight's actual size is checked by the move
 * itself (`Combatants.move`), since a check constraint cannot read another
 * table and the board is never resized once the fight has it.
 *
 * ### Unplaced is the start, and it is `null`
 *
 * Nobody has put a token anywhere yet, so every existing row and every seeded
 * one starts off the board. A guessed square would be a position nobody chose
 * — `AGENTS.md`'s "absent beats stubbed". The two columns are null together or
 * set together; a token half on the board is not a state.
 *
 * ### Columns on `combatant`, not a table of their own
 *
 * The narrowing is in the select lists already: a player's read of a combatant
 * names its columns (`repo/playerCombatant.ts`) rather than `combatant.*`, so a
 * new column reaches no player until a player read selects it. The creator's
 * `Combatant` carries it.
 *
 * `combatant-moved` joins the log's closed vocabulary.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table combatant
      add column board_column integer
        constraint combatant_board_column_range check (board_column between 0 and 199),
      add column board_row integer
        constraint combatant_board_row_range check (board_row between 0 and 199),
      add constraint combatant_board_position_whole
        check ((board_column is null) = (board_row is null))
  `;

  yield* sql`alter table session_event drop constraint session_event_kind_check`;
  yield* sql`
    alter table session_event
      add constraint session_event_kind_check check (kind in (
        'run-started', 'run-updated', 'run-ended', 'run-carried', 'run-resumed',
        'combatant-added', 'combatant-updated', 'combatant-removed',
        'combatant-damaged', 'combatant-moved', 'turn-advanced',
        'beat-added', 'character-updated', 'roll-made',
        'hob-resource-spent', 'hob-resource-undone'
      ))
  `;
});
