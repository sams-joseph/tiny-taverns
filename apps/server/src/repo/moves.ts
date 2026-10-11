import {
  type CombatantId,
  type CombatantPosition,
  Conflict,
  type DiagonalRule,
  type EncounterRunId,
  feetBetween,
} from "@taverns/api";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";

/**
 * A token's move, as both writers of one make it: the DM's
 * (`Combatants.move`), and a player's of their own token (`PlayerTable.move`).
 * Which row may be moved, and when, is each caller's; where it may land and
 * what the walk costs is this file's, so the two cannot disagree.
 */
export interface MoveFight {
  readonly phase: "initiative" | "turns";
  readonly active_combatant_id: CombatantId | null;
  readonly diagonal_rule: DiagonalRule;
  readonly board_columns: number | null;
  readonly board_rows: number | null;
  readonly feet_per_cell: number | null;
}

/**
 * The fight as a move finds it: who is up, its board, and the table's diagonal
 * rule. The run is held `for share` so the marker cannot move under the count;
 * `nextTurn` waits. The caller has already proved the run reachable in this
 * transaction.
 */
export const fightForMove = (sql: SqlClient.SqlClient, runId: EncounterRunId) =>
  sql<MoveFight>`
    select encounter_run.phase, encounter_run.active_combatant_id,
           campaign.diagonal_rule, encounter_run_board.board_columns,
           encounter_run_board.board_rows, encounter_run_board.feet_per_cell
    from encounter_run
    join session on session.id = encounter_run.session_id
    join campaign on campaign.id = session.campaign_id
    left join encounter_run_board on encounter_run_board.run_id = encounter_run.id
    where encounter_run.id = ${runId}
    for share of encounter_run
  `.pipe(Effect.map((rows) => rows[0]!));

/**
 * The square checked against **the fight's own board**, the grid the fight
 * was started on, which nothing resizes afterwards. A fight with no board has
 * nowhere to put a token, and a square past its edge is not a square.
 */
export const ensureOnBoard = (
  fight: MoveFight,
  to: CombatantPosition,
): Effect.Effect<void, Conflict> =>
  fight.board_columns === null || fight.board_rows === null
    ? Effect.fail(new Conflict({ message: "this fight has no board" }))
    : to.column >= fight.board_columns || to.row >= fight.board_rows
      ? Effect.fail(new Conflict({ message: "that square is off the board" }))
      : Effect.void;

/**
 * The feet this move adds to the row's `feet_moved`: the walk from where it
 * stood, under the campaign's diagonal rule, while the fight takes turns and
 * this row is up. Putting a token down or taking it off walks nowhere, and
 * nothing counts for anyone else or while initiative is being rolled.
 */
export const feetWalked = (
  fight: MoveFight,
  id: CombatantId,
  from: { readonly board_column: number | null; readonly board_row: number | null },
  to: CombatantPosition | null,
): number =>
  to !== null &&
  from.board_column !== null &&
  from.board_row !== null &&
  fight.feet_per_cell !== null &&
  fight.phase === "turns" &&
  fight.active_combatant_id === id
    ? feetBetween({ column: from.board_column, row: from.board_row }, to, {
        feetPerCell: fight.feet_per_cell,
        diagonals: fight.diagonal_rule,
      })
    : 0;
