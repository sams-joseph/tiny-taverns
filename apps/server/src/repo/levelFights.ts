import {
  type Actor,
  type BoardSquare,
  type EncounterId,
  type EncounterRunId,
  type LevelLayout,
  propFootprint,
  RunBoardLevel,
  runLevelLayout,
  standable,
} from "@taverns/api";
import { Effect, Schema } from "effect";
import type { SqlClient, Statement } from "effect/sql";
import { levelOwned } from "./visibility.js";

/**
 * A fight's copy of its level (`0109_level_fights.ts`): the copy at start and
 * at resume, the board column that reads it back, and what a move or a start
 * needs of it. The DM's live writes to it are `RunBoards`'.
 *
 * Every statement here is beneath its caller's gate, which has already proved
 * the run (and, at start, the encounter) the creator's in this transaction.
 */

/**
 * Copy the encounter's level onto a new fight's board, in one
 * `insert … select` per table: the board row with the level's size, scale,
 * ambient and floor, then its walls, props, lights and regions with their ids
 * and order. The level is read through the encounter's own pointer and the
 * owner's predicate, so a pointer can reach only the creator's level. Answers
 * whether a level was copied: `false` for an encounter that names none, whose
 * fight gets the plain grid instead.
 */
export const copyLevel = (
  sql: SqlClient.SqlClient,
  runId: EncounterRunId,
  encounterId: EncounterId,
  actor: Actor,
) =>
  Effect.gen(function* () {
    const named = yield* sql<{ readonly id: string }>`
      select level.id from encounter
      join level on level.id = encounter.level_id and level.account_id = encounter.level_owner_id
      where encounter.id = ${encounterId} and ${levelOwned(sql, actor)}
    `;
    const levelId = named[0]?.id;
    if (levelId === undefined) return false;
    const owned = sql`level.id = ${levelId} and ${levelOwned(sql, actor)}`;
    yield* sql`
      insert into encounter_run_board (
        run_id, board_columns, board_rows, feet_per_cell, ambient, floor
      )
      select ${runId}, level.columns, level.rows, level.feet_per_cell, level.ambient, level.floor
      from level
      where ${owned}
    `;
    yield* sql`
      insert into encounter_run_wall (run_id, id, ordinal, x1, y1, x2, y2, kind, door_state, low)
      select ${runId}, level_wall.id, level_wall.ordinal, level_wall.x1, level_wall.y1,
             level_wall.x2, level_wall.y2, level_wall.kind, level_wall.door_state, level_wall.low
      from level_wall join level on level.id = level_wall.level_id
      where ${owned}
    `;
    yield* sql`
      insert into encounter_run_prop (
        run_id, id, ordinal, kind, x, y, rotation, blocks_movement, blocks_sight, cover,
        difficult, dm_only
      )
      select ${runId}, level_prop.id, level_prop.ordinal, level_prop.kind, level_prop.x,
             level_prop.y, level_prop.rotation, level_prop.blocks_movement,
             level_prop.blocks_sight, level_prop.cover, level_prop.difficult, level_prop.dm_only
      from level_prop join level on level.id = level_prop.level_id
      where ${owned}
    `;
    yield* sql`
      insert into encounter_run_light (
        run_id, id, ordinal, x, y, bright, dim, tone, flicker, lit
      )
      select ${runId}, level_light.id, level_light.ordinal, level_light.x, level_light.y,
             level_light.bright, level_light.dim, level_light.tone, level_light.flicker,
             level_light.lit
      from level_light join level on level.id = level_light.level_id
      where ${owned}
    `;
    yield* sql`
      insert into encounter_run_region (run_id, id, ordinal, kind, squares, secret)
      select ${runId}, level_region.id, level_region.ordinal, level_region.kind,
             level_region.squares, level_region.secret
      from level_region join level on level.id = level_region.level_id
      where ${owned}
    `;
    return true;
  });

/**
 * Carry a carried fight's level to the fight that resumes it: the
 * predecessor's own copy, doors and lights as the DM left them, one
 * `insert … select` per table. The board row (with `ambient` and `floor`) is
 * the caller's copy of the predecessor's board. A fight on the plain grid has
 * no parts, and each statement copies none.
 */
export const carryLevel = (
  sql: SqlClient.SqlClient,
  runId: EncounterRunId,
  fromRunId: EncounterRunId,
) =>
  Effect.gen(function* () {
    yield* sql`
      insert into encounter_run_wall (
        run_id, id, ordinal, x1, y1, x2, y2, kind, door_state, low, revealed
      )
      select ${runId}, id, ordinal, x1, y1, x2, y2, kind, door_state, low, revealed
      from encounter_run_wall where encounter_run_wall.run_id = ${fromRunId}
    `;
    yield* sql`
      insert into encounter_run_prop (
        run_id, id, ordinal, kind, x, y, rotation, blocks_movement, blocks_sight, cover,
        difficult, dm_only
      )
      select ${runId}, id, ordinal, kind, x, y, rotation, blocks_movement, blocks_sight, cover,
             difficult, dm_only
      from encounter_run_prop where encounter_run_prop.run_id = ${fromRunId}
    `;
    yield* sql`
      insert into encounter_run_light (run_id, id, ordinal, x, y, bright, dim, tone, flicker, lit)
      select ${runId}, id, ordinal, x, y, bright, dim, tone, flicker, lit
      from encounter_run_light where encounter_run_light.run_id = ${fromRunId}
    `;
    yield* sql`
      insert into encounter_run_region (run_id, id, ordinal, kind, squares, secret)
      select ${runId}, id, ordinal, kind, squares, secret
      from encounter_run_region where encounter_run_region.run_id = ${fromRunId}
    `;
  });

/**
 * The fight's level as one `json` column, `level`, in the wire's spelling
 * (`RunBoardLevel`), or `null` on the plain grid. `encounter_run_board` must
 * be in scope. **The creator's board read only**: no player read names it.
 */
export const levelColumn = (sql: SqlClient.SqlClient): Statement.Fragment => sql`
  case when encounter_run_board.floor is null then null else json_build_object(
    'ambient', encounter_run_board.ambient,
    'floor', to_json(encounter_run_board.floor),
    'walls', coalesce((
      select json_agg(json_build_object(
        'id', w.id, 'x1', w.x1, 'y1', w.y1, 'x2', w.x2, 'y2', w.y2, 'kind', w.kind,
        'doorState', w.door_state, 'low', w.low, 'revealed', w.revealed
      ) order by w.ordinal)
      from encounter_run_wall w where w.run_id = encounter_run_board.run_id
    ), '[]'::json),
    'props', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 'kind', p.kind, 'x', p.x, 'y', p.y, 'rotation', p.rotation,
        'blocksMovement', p.blocks_movement, 'blocksSight', p.blocks_sight, 'cover', p.cover,
        'difficult', p.difficult, 'dmOnly', p.dm_only
      ) order by p.ordinal)
      from encounter_run_prop p where p.run_id = encounter_run_board.run_id
    ), '[]'::json),
    'lights', coalesce((
      select json_agg(json_build_object(
        'id', l.id, 'x', l.x, 'y', l.y, 'bright', l.bright, 'dim', l.dim, 'tone', l.tone,
        'flicker', l.flicker, 'lit', l.lit
      ) order by l.ordinal)
      from encounter_run_light l where l.run_id = encounter_run_board.run_id
    ), '[]'::json),
    'regions', coalesce((
      select json_agg(json_build_object(
        'id', r.id, 'kind', r.kind, 'squares', to_json(r.squares), 'secret', r.secret
      ) order by r.ordinal)
      from encounter_run_region r where r.run_id = encounter_run_board.run_id
    ), '[]'::json)
  ) end as level
`;

const decodeLevel = Schema.decodeUnknownEffect(Schema.NullOr(RunBoardLevel));

/** The fight's level as the geometry reads it, or `null` on the plain grid or no board. */
export const runLevel = (sql: SqlClient.SqlClient, runId: EncounterRunId) =>
  Effect.gen(function* () {
    const rows = yield* sql<{
      readonly board_columns: number;
      readonly board_rows: number;
      readonly feet_per_cell: number;
      readonly level: unknown;
    }>`
      select encounter_run_board.board_columns, encounter_run_board.board_rows,
             encounter_run_board.feet_per_cell, ${levelColumn(sql)}
      from encounter_run_board
      where encounter_run_board.run_id = ${runId}
    `;
    const row = rows[0];
    if (row === undefined) return null;
    const level = yield* decodeLevel(row.level).pipe(Effect.orDie);
    return level === null
      ? null
      : {
          level,
          layout: runLevelLayout(
            { columns: row.board_columns, rows: row.board_rows, feetPerCell: row.feet_per_cell },
            level,
          ),
        };
  });

/**
 * Every square of a level board no token may start on (`standable`), for
 * `startingSquares`' `taken`. Each square is asked against only the props on
 * it, so a large board with many props is one pass, not a pass per square.
 */
export const unstandable = (layout: LevelLayout): ReadonlyArray<BoardSquare> => {
  const on = new Map<number, Array<LevelLayout["props"][number]>>();
  for (const prop of layout.props) {
    const { column, row, width, height } = propFootprint(prop);
    for (let r = row; r < row + height; r++) {
      for (let c = column; c < column + width; c++) {
        const at = r * layout.columns + c;
        const here = on.get(at);
        if (here === undefined) on.set(at, [prop]);
        else here.push(prop);
      }
    }
  }
  const out: Array<BoardSquare> = [];
  for (let row = 0; row < layout.rows; row++) {
    for (let column = 0; column < layout.columns; column++) {
      const props = on.get(row * layout.columns + column) ?? [];
      if (!standable({ ...layout, props }, { column, row })) out.push({ column, row });
    }
  }
  return out;
};
