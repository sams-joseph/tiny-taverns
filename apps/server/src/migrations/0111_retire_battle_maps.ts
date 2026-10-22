import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Retire the picture battle maps: every fight is played on a level or on the
 * plain grid (`Board.ts` in `@taverns/api`), and nothing is drawn or uploaded
 * for a board any more. The maintainer's call (2026-10-21), with no carry-over:
 * the pictures, their grids and their setting lines are deleted.
 *
 * ### The files
 *
 * A migration cannot reach storage, so it queues them. Each picture row and
 * each upload ticket is deleted before its table goes, which fires its
 * `hob_image_enqueue_deletion` trigger and puts its prefix in
 * `storage_deletion`; the server's image loop drains that outbox as it drains
 * every other kind's (`HobImages.drainDeletions`). `drop table` fires no
 * delete trigger, so the deletes come first.
 *
 * ### What a board keeps
 *
 * `encounter_run_board` keeps its size, its scale, its fog, its pinned area
 * and its level copy (`0109_level_fights.ts`). It loses the pointer to its
 * encounter's map (`map_id`), the picture's alignment (`cell_px`,
 * `offset_x_px`, `offset_y_px`, with their check) and `grid`, whose only
 * writer was the map's grid adjustment: every board is drawn on itself, and
 * whether lines show is the runner's own switch.
 *
 * `image_upload.subject` loses `battleMap`. The `image_spend` ledger keeps its
 * `battleMap` rows: they are what was spent, and the daily caps count them.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`delete from image_upload where subject = 'battleMap'`;
  yield* sql`alter table image_upload drop constraint image_upload_subject_check`;
  yield* sql`
    alter table image_upload add constraint image_upload_subject_check
      check (subject in ('character', 'npc', 'campaign', 'sharedWorld', 'location'))
  `;

  yield* sql`delete from battle_map_image`;

  yield* sql`
    alter table encounter_run_board
      drop column map_id,
      drop column grid,
      drop column cell_px,
      drop column offset_x_px,
      drop column offset_y_px
  `;

  yield* sql`drop table battle_map_image`;
  yield* sql`drop table battle_map`;
});
