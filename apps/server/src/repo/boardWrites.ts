import {
  type BoardDoorUpdate,
  type BoardFogUpdate,
  Conflict,
  type LevelDoorState,
  type LevelLightTone,
  type LevelPartId,
  type LevelRegionKind,
  NotFound,
} from "@taverns/api";
import { Effect } from "effect";
import type { SqlClient, Statement } from "effect/sql";
import type { BoardTables } from "./levelFights.js";
import { intArray } from "./rows.js";

/**
 * The DM's hand on a copy of a level: its fog, its doors, its lights and its
 * secret regions, as one statement each over either board (`BoardTables`): a
 * fight's (`RunBoards`) and a campaign's visit (`LevelVisits`). One
 * implementation, two boards; what each write logs, whom it tells and when it
 * is refused for its board's state is the caller's.
 *
 * Every statement here is beneath its caller's gate, which has already proved
 * the board the creator's in this transaction.
 */

/** A door's state and reveal after a write and before it, and what kind of door it is. */
export interface DoorChange {
  readonly kind: "door" | "secretDoor";
  readonly door_state: LevelDoorState;
  readonly revealed: boolean;
  readonly was_door_state: LevelDoorState;
  readonly was_revealed: boolean;
}

/**
 * Open, close or lock a door of the board's level, or reveal or hide a secret
 * one. `NotFound` for a wall the board does not have; `Conflict` for a plain
 * wall and a reveal of a door that is not secret. The wall is locked first.
 */
export const writeDoor = (
  sql: SqlClient.SqlClient,
  tables: BoardTables,
  boardId: string,
  wallId: LevelPartId,
  update: BoardDoorUpdate,
) =>
  Effect.gen(function* () {
    const wall = sql(tables.wall);
    const here = sql`${wall}.${sql(tables.partKey)} = ${boardId} and ${wall}.id = ${wallId}`;
    const walls = yield* sql<{ readonly kind: "wall" | "door" | "secretDoor" }>`
      select ${wall}.kind from ${wall} where ${here} for update
    `;
    const found = walls[0];
    if (found === undefined) return yield* new NotFound({ resource: "wall", id: wallId });
    if (found.kind === "wall") return yield* new Conflict({ message: "that wall is not a door" });
    if (update.revealed !== undefined && found.kind !== "secretDoor") {
      return yield* new Conflict({ message: "only a secret door is revealed" });
    }
    const changed = yield* sql<Omit<DoorChange, "kind">>`
      update ${wall}
      set door_state = coalesce(${update.doorState ?? null}::text, door_state),
          revealed = coalesce(${update.revealed ?? null}::boolean, revealed)
      where ${here}
      returning ${wall}.door_state, ${wall}.revealed,
        old.door_state as was_door_state, old.revealed as was_revealed
    `;
    const change: DoorChange = { kind: found.kind, ...changed[0]! };
    return change;
  });

/**
 * What the table is told of a door write, either board's: `shared`, whether
 * the write's own line is the table's, and `force`, whether the table is rung
 * anyway because it draws the door differently now. `seen` is whether the
 * party has seen the door (`partSeen`, after the vision was recomputed);
 * `shown`, whether a player's table shows the board.
 *
 * The table knows a door as open or shut: a locked door reads as closed to it
 * (`playerLevelColumn`), so a lock is never news to it. The line is shared
 * for a door they have seen, on a board they are shown, that opened or shut
 * with no lock in it: a plain door, or a secret door that stood revealed
 * before and after. Its finding or hiding, and any lock, is the DM's line,
 * and the table is rung for a door it has seen that it draws differently: a
 * secret door turned from wall to door or back, or a door it knows opened or
 * shut.
 */
export const doorTold = (
  after: DoorChange,
  seen: boolean,
  shown: boolean,
): { readonly shared: boolean; readonly force: boolean } => {
  const asTable = (state: LevelDoorState) => (state === "locked" ? "closed" : state);
  const tableMoved = asTable(after.door_state) !== asTable(after.was_door_state);
  const noLock = after.door_state !== "locked" && after.was_door_state !== "locked";
  const knownDoor = after.kind === "door" || (after.revealed && after.was_revealed);
  return {
    shared: shown && seen && knownDoor && tableMoved && noLock,
    force:
      seen &&
      (after.revealed !== after.was_revealed ||
        ((after.kind === "door" || after.revealed) && tableMoved)),
  };
};

/**
 * Light or snuff a light of the board's level, answering what it is (for its
 * log line's preset). `NotFound` for a light the board does not have.
 */
export const writeLight = (
  sql: SqlClient.SqlClient,
  tables: BoardTables,
  boardId: string,
  lightId: LevelPartId,
  lit: boolean,
) =>
  Effect.gen(function* () {
    const light = sql(tables.light);
    const changed = yield* sql<{
      readonly bright: number;
      readonly dim: number;
      readonly tone: LevelLightTone;
    }>`
      update ${light} set lit = ${lit}
      where ${light}.${sql(tables.partKey)} = ${boardId} and ${light}.id = ${lightId}
      returning ${light}.bright, ${light}.dim, ${light}.tone
    `;
    const row = changed[0];
    if (row === undefined) return yield* new NotFound({ resource: "light", id: lightId });
    return row;
  });

/**
 * Reveal a secret region of the board's level to the table, or hide it again,
 * answering its kind and whether it stood revealed before. `NotFound` for a
 * region the board does not have; `Conflict` for one that is not secret.
 */
export const writeRegion = (
  sql: SqlClient.SqlClient,
  tables: BoardTables,
  boardId: string,
  regionId: LevelPartId,
  revealed: boolean,
) =>
  Effect.gen(function* () {
    const region = sql(tables.region);
    const here = sql`${region}.${sql(tables.partKey)} = ${boardId} and ${region}.id = ${regionId}`;
    const regions = yield* sql<{
      readonly kind: LevelRegionKind;
      readonly secret: boolean;
      readonly revealed: boolean;
    }>`
      select ${region}.kind, ${region}.secret, ${region}.revealed
      from ${region} where ${here} for update
    `;
    const found = regions[0];
    if (found === undefined) return yield* new NotFound({ resource: "region", id: regionId });
    if (!found.secret) return yield* new Conflict({ message: "only a secret region is revealed" });
    yield* sql`update ${region} set revealed = ${revealed} where ${here}`;
    return { kind: found.kind, wasRevealed: found.revealed };
  });

/**
 * Rewrite the board's fog as one set: the whole-board change first (clear it,
 * cover it, or back to the fog it started with), then `hide` added and
 * `reveal` taken out, distinct and in order. A square is `row * board_columns
 * + column`, the column's own spelling. The board row is locked first, so two
 * strokes of the brush land one after the other.
 *
 * Answers how many squares are under fog now and `shown`, a fragment over the
 * board row the caller reads in the same statement; `null` for a board id
 * with no row. `Conflict` for a square off the board.
 */
export const writeFog = (
  sql: SqlClient.SqlClient,
  tables: BoardTables,
  boardId: string,
  update: BoardFogUpdate,
  shown: Statement.Fragment,
) =>
  Effect.gen(function* () {
    const board = sql(tables.board);
    const where = sql`${board}.${sql(tables.boardKey)} = ${boardId}`;
    const boards = yield* sql<{ readonly board_columns: number; readonly board_rows: number }>`
      select ${board}.board_columns, ${board}.board_rows from ${board} where ${where} for update
    `;
    const size = boards[0];
    if (size === undefined) return null;
    const squares = [...(update.hide ?? []), ...(update.reveal ?? [])];
    if (
      squares.some((square) => square.column >= size.board_columns || square.row >= size.board_rows)
    ) {
      return yield* new Conflict({ message: "that square is off the board" });
    }
    const index = (square: { readonly column: number; readonly row: number }) =>
      square.row * size.board_columns + square.column;
    const start = tables.fogStart === null ? sql`'{}'::integer[]` : sql(tables.fogStart);
    const whole = update.revealAll
      ? sql`'{}'::integer[]`
      : update.coverAll
        ? sql`array(select generate_series(0, board_columns * board_rows - 1))`
        : update.reset
          ? start
          : sql`fog_hidden`;
    const rows = yield* sql<{ readonly hidden: number; readonly shown: boolean }>`
      update ${board}
      set fog_hidden = array(
        select distinct square
        from unnest(${whole} || ${intArray((update.hide ?? []).map(index))}) as square
        where square <> all(${intArray((update.reveal ?? []).map(index))})
        order by square
      )
      where ${where}
      returning cardinality(fog_hidden) as hidden, ${shown} as shown
    `;
    return rows[0]!;
  });
