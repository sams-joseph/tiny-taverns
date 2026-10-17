import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * The template an area's damage filled, on the first damage roll of a save
 * for damage that went somewhere on the board (`Roll.area`, `packages/api`):
 * a kept Hob turn's placement, or the template the DM had pinned when they
 * rolled the line. The board draws the area from it, a cone of fire from the
 * dragon or a fireball lobbed and bursting.
 *
 * One `jsonb` value, the board template's own shape (`BoardArea`), decoded
 * through that schema on every read; the board's pinned template keeps
 * columns because the board validates and edits it, and this is a record of
 * where one went. Null on every other roll.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table character_roll
      add column area jsonb
        constraint character_roll_area_object check (jsonb_typeof(area) = 'object')
  `;
});
