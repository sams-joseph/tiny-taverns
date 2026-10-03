import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * An area template pinned on a fight's board: the DM's sphere, cone, line or
 * cube, shown to the DM and to the players' table until it is cleared.
 *
 * ### Temporary, not the fight's record
 *
 * It is where a spell lands right now, the maintainer's decision D14 of
 * 2026-10-02 ("player and dm and temporary"), not something that happened. So
 * it is columns on `encounter_run_board`, the fight's working surface, and not
 * a table of its own: nothing reads it once the fight ends, and both ways a
 * fight ends (`EncounterRuns.end` and the night carrying it, `Sessions`) clear
 * it. `resume` copies the board column by column and leaves these out, so a
 * resumed fight starts with nothing pinned. Clearing sets them all back to
 * `null`, so the board holds no history of what was pinned; each pin and clear
 * does append a `board-area-updated` line carrying the template, which the
 * DM's run log shows as a line, and no recap or player read uses that payload.
 *
 * ### One template, whole or absent
 *
 * The check keeps a pin whole: either every column is `null` (nothing pinned)
 * or the shape, the size in feet and the origin square are all set, and the
 * aimed square is set exactly when the shape points somewhere (a cone or a
 * line). Both squares are on the board, which nothing resizes after the fight
 * starts (`0058_encounter_run_boards.ts`).
 *
 * ### `board-area-updated`
 *
 * The DM's pin and clear append it, shared while a player's table shows the
 * board so their doorbell rings, and the DM's own line otherwise.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table encounter_run_board
      add column area_shape text
        constraint encounter_run_board_area_shape_check
          check (area_shape in ('sphere', 'cone', 'line', 'cube')),
      add column area_feet integer
        constraint encounter_run_board_area_feet_check check (area_feet between 5 and 120),
      add column area_origin_column integer,
      add column area_origin_row integer,
      add column area_toward_column integer,
      add column area_toward_row integer,
      add constraint encounter_run_board_area_whole check (
        (area_shape is null and area_feet is null
          and area_origin_column is null and area_origin_row is null
          and area_toward_column is null and area_toward_row is null)
        or (area_shape is not null and area_feet is not null
          and area_origin_column between 0 and board_columns - 1
          and area_origin_row between 0 and board_rows - 1
          and (area_toward_column is null) = (area_toward_row is null)
          and (area_shape in ('cone', 'line')) = (area_toward_column is not null)
          and (area_toward_column is null
            or (area_toward_column between 0 and board_columns - 1
              and area_toward_row between 0 and board_rows - 1)))
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
        'hob-resource-spent', 'hob-resource-undone',
        'scene-updated', 'check-logged', 'check-removed',
        'board-fog-updated', 'board-area-updated'
      ))
  `;
});
