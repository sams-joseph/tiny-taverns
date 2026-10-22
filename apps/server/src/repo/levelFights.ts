import {
  type Actor,
  type BoardSquare,
  darkvisionOf,
  type EncounterId,
  type EncounterRunId,
  LEVEL_PROP_KINDS,
  type LevelId,
  type LevelLayout,
  PROP_KINDS,
  partyVision,
  propFootprint,
  RunBoardLevel,
  runLevelLayout,
  type SessionId,
  standable,
  tableSight,
} from "@taverns/api";
import { Effect, Schema } from "effect";
import type { SqlClient, SqlError, Statement } from "effect/sql";
import { boardShown } from "./liveTables.js";
import { intArray, uuidArray } from "./rows.js";
import { appendEvent } from "./SessionEvents.js";
import { levelOwned } from "./visibility.js";

/**
 * A fight's copy of its level (`0109_level_fights.ts`): the copy at start and
 * at resume, the board column that reads it back, and what a move or a start
 * needs of it. The DM's live writes to it are `RunBoards`'. A campaign's visit
 * of a level (`0113_level_visits.ts`) is the same copy in tables of its own,
 * so the copy, the read and the vision here take either (`BoardTables`).
 *
 * Every statement here is beneath its caller's gate, which has already proved
 * the run or the visit (and, at start, the encounter) the creator's in this
 * transaction.
 */

/**
 * Where a copy of a level lives: a fight's board (`encounter_run_board` and
 * its parts, `0109_level_fights.ts`) or a campaign's visit (`level_visit` and
 * its parts, `0113_level_visits.ts`). Both spell the board's size, scale,
 * ambient, floor, fog and vision with the same columns, and their part tables
 * mirror each other, so one statement serves either, named through these
 * identifiers. Never built from input: the two values below are the only ones.
 */
export interface BoardTables {
  /** The board row's table, and its key column the parts point at. */
  readonly board: string;
  readonly boardKey: string;
  readonly wall: string;
  readonly prop: string;
  readonly light: string;
  readonly region: string;
  /** Each part table's column naming its board row. */
  readonly partKey: string;
  /**
   * The board row's column holding the fog it started with, which a fog
   * `reset` goes back to (`0087`'s `fog_start`), or `null` for a board that
   * started with none: a visit is opened unfogged.
   */
  readonly fogStart: string | null;
}

export const RUN_BOARD: BoardTables = {
  board: "encounter_run_board",
  boardKey: "run_id",
  wall: "encounter_run_wall",
  prop: "encounter_run_prop",
  light: "encounter_run_light",
  region: "encounter_run_region",
  partKey: "run_id",
  fogStart: "fog_start",
};

export const VISIT_BOARD: BoardTables = {
  board: "level_visit",
  boardKey: "id",
  wall: "level_visit_wall",
  prop: "level_visit_prop",
  light: "level_visit_light",
  region: "level_visit_region",
  partKey: "visit_id",
  fogStart: null,
};

/**
 * Copy a level's walls, props, lights and regions beside a board row the
 * caller has just written from it, in one `insert … select` per table, with
 * their ids and order; `revealed` starts false. The caller holds the level
 * `for share` until its transaction ends, so the copy is of one level, whole,
 * and each statement names the owner's predicate again. The one copy of a
 * level that a fight's start and a visit's open both take.
 */
export const copyLevelParts = (
  sql: SqlClient.SqlClient,
  target: BoardTables,
  targetId: string,
  levelId: LevelId,
  actor: Actor,
) =>
  Effect.gen(function* () {
    const owned = sql`level.id = ${levelId} and ${levelOwned(sql, actor)}`;
    const key = sql(target.partKey);
    yield* sql`
      insert into ${sql(target.wall)} (${key}, id, ordinal, x1, y1, x2, y2, kind, door_state, low)
      select ${targetId}, level_wall.id, level_wall.ordinal, level_wall.x1, level_wall.y1,
             level_wall.x2, level_wall.y2, level_wall.kind, level_wall.door_state, level_wall.low
      from level_wall join level on level.id = level_wall.level_id
      where ${owned}
    `;
    yield* sql`
      insert into ${sql(target.prop)} (
        ${key}, id, ordinal, kind, x, y, rotation, blocks_movement, blocks_sight, cover,
        difficult, dm_only
      )
      select ${targetId}, level_prop.id, level_prop.ordinal, level_prop.kind, level_prop.x,
             level_prop.y, level_prop.rotation, level_prop.blocks_movement,
             level_prop.blocks_sight, level_prop.cover, level_prop.difficult, level_prop.dm_only
      from level_prop join level on level.id = level_prop.level_id
      where ${owned}
    `;
    yield* sql`
      insert into ${sql(target.light)} (
        ${key}, id, ordinal, x, y, bright, dim, tone, flicker, lit
      )
      select ${targetId}, level_light.id, level_light.ordinal, level_light.x, level_light.y,
             level_light.bright, level_light.dim, level_light.tone, level_light.flicker,
             level_light.lit
      from level_light join level on level.id = level_light.level_id
      where ${owned}
    `;
    yield* sql`
      insert into ${sql(target.region)} (${key}, id, ordinal, kind, squares, secret)
      select ${targetId}, level_region.id, level_region.ordinal, level_region.kind,
             level_region.squares, level_region.secret
      from level_region join level on level.id = level_region.level_id
      where ${owned}
    `;
  });

/**
 * Copy the encounter's level onto a new fight's board: the board row with the
 * level's size, scale, ambient and floor, then its parts (`copyLevelParts`).
 * The level is read through the encounter's own pointer and the owner's
 * predicate, so a pointer can reach only the creator's level. Answers whether
 * a level was copied: `false` for an encounter that names none, whose fight
 * gets the plain grid instead.
 */
export const copyLevel = (
  sql: SqlClient.SqlClient,
  runId: EncounterRunId,
  encounterId: EncounterId,
  actor: Actor,
) =>
  Effect.gen(function* () {
    // Held `for share` until this transaction ends: a delete or a save of the
    // level waits, so every statement below copies the one level the lookup
    // found, whole. A level deleted first is no longer named, and the fight
    // gets the plain grid.
    const named = yield* sql<{ readonly id: LevelId }>`
      select level.id from encounter
      join level on level.id = encounter.level_id and level.account_id = encounter.level_owner_id
      where encounter.id = ${encounterId} and ${levelOwned(sql, actor)}
      for share of level
    `;
    const levelId = named[0]?.id;
    if (levelId === undefined) return false;
    const boards = yield* sql<{ readonly run_id: string }>`
      insert into encounter_run_board (
        run_id, board_columns, board_rows, feet_per_cell, ambient, floor
      )
      select ${runId}, level.columns, level.rows, level.feet_per_cell, level.ambient, level.floor
      from level
      where level.id = ${levelId} and ${levelOwned(sql, actor)}
      returning encounter_run_board.run_id
    `;
    // No board row copied: the level went between the lookup and the copy.
    // The caller writes the plain grid, and no part is copied without it.
    if (boards.length === 0) return false;
    yield* copyLevelParts(sql, RUN_BOARD, runId, levelId, actor);
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
      insert into encounter_run_region (run_id, id, ordinal, kind, squares, secret, revealed)
      select ${runId}, id, ordinal, kind, squares, secret, revealed
      from encounter_run_region where encounter_run_region.run_id = ${fromRunId}
    `;
    // What the party explored stays explored (`0110_party_vision.ts`); what
    // it sees is the resuming fight's own, written once its tokens stand.
    yield* sql`
      update encounter_run_board
      set party_seen = predecessor.party_seen
      from encounter_run_board predecessor
      where encounter_run_board.run_id = ${runId}
        and predecessor.run_id = ${fromRunId}
        and encounter_run_board.floor is not null
    `;
  });

/**
 * A board's level as one `json` column, `level`, in the wire's spelling
 * (`RunBoardLevel`), or `null` on the plain grid. The board's table must be in
 * scope. **The creator's read only**: no player read names it.
 */
export const boardLevelColumn = (
  sql: SqlClient.SqlClient,
  tables: BoardTables,
): Statement.Fragment => {
  const board = sql(tables.board);
  const owner = sql`${board}.${sql(tables.boardKey)}`;
  const key = sql(tables.partKey);
  return sql`
    case when ${board}.floor is null then null else json_build_object(
      'ambient', ${board}.ambient,
      'floor', to_json(${board}.floor),
      'walls', coalesce((
        select json_agg(json_build_object(
          'id', w.id, 'x1', w.x1, 'y1', w.y1, 'x2', w.x2, 'y2', w.y2, 'kind', w.kind,
          'doorState', w.door_state, 'low', w.low, 'revealed', w.revealed
        ) order by w.ordinal)
        from ${sql(tables.wall)} w where w.${key} = ${owner}
      ), '[]'::json),
      'props', coalesce((
        select json_agg(json_build_object(
          'id', p.id, 'kind', p.kind, 'x', p.x, 'y', p.y, 'rotation', p.rotation,
          'blocksMovement', p.blocks_movement, 'blocksSight', p.blocks_sight, 'cover', p.cover,
          'difficult', p.difficult, 'dmOnly', p.dm_only
        ) order by p.ordinal)
        from ${sql(tables.prop)} p where p.${key} = ${owner}
      ), '[]'::json),
      'lights', coalesce((
        select json_agg(json_build_object(
          'id', l.id, 'x', l.x, 'y', l.y, 'bright', l.bright, 'dim', l.dim, 'tone', l.tone,
          'flicker', l.flicker, 'lit', l.lit
        ) order by l.ordinal)
        from ${sql(tables.light)} l where l.${key} = ${owner}
      ), '[]'::json),
      'regions', coalesce((
        select json_agg(json_build_object(
          'id', r.id, 'kind', r.kind, 'squares', to_json(r.squares), 'secret', r.secret,
          'revealed', r.revealed
        ) order by r.ordinal)
        from ${sql(tables.region)} r where r.${key} = ${owner}
      ), '[]'::json)
    ) end as level
  `;
};

/** A fight's level (`boardLevelColumn` over `encounter_run_board`). */
export const levelColumn = (sql: SqlClient.SqlClient): Statement.Fragment =>
  boardLevelColumn(sql, RUN_BOARD);

const decodeLevel = Schema.decodeUnknownEffect(Schema.NullOr(RunBoardLevel));

/** The fight's level as the geometry reads it, or `null` on the plain grid or no board. */
export const runLevel = (sql: SqlClient.SqlClient, runId: EncounterRunId) =>
  boardLevel(sql, RUN_BOARD, runId);

/** A board's level as the geometry reads it, or `null` on the plain grid or no board. */
export const boardLevel = (sql: SqlClient.SqlClient, tables: BoardTables, id: string) =>
  Effect.gen(function* () {
    const board = sql(tables.board);
    const rows = yield* sql<{
      readonly board_columns: number;
      readonly board_rows: number;
      readonly feet_per_cell: number;
      readonly level: unknown;
    }>`
      select ${board}.board_columns, ${board}.board_rows, ${board}.feet_per_cell,
             ${boardLevelColumn(sql, tables)}
      from ${board}
      where ${board}.${sql(tables.boardKey)} = ${id}
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

// ---------------------------------------------------------------------------
// Party vision (`0110_party_vision.ts`)

/** What a refresh found: whether the arrays moved, and whether a player's table shows the board. */
export interface PartyVisionRefresh {
  readonly changed: boolean;
  readonly shown: boolean;
}

/** A sheet's traits read defensively: only a trait's name and text matter here. */
export const traitsOf = (
  value: unknown,
): ReadonlyArray<{ readonly name: string; readonly text?: string }> =>
  Array.isArray(value)
    ? value.flatMap((trait: unknown) =>
        typeof trait === "object" &&
        trait !== null &&
        "name" in trait &&
        typeof trait.name === "string"
          ? [
              {
                name: trait.name,
                ...("text" in trait && typeof trait.text === "string" ? { text: trait.text } : {}),
              },
            ]
          : [],
      )
    : [];

/** Where one of the party's eyes stands, with its character's sheet traits. */
export interface VisionViewer {
  readonly board_column: number;
  readonly board_row: number;
  readonly traits: unknown;
}

/**
 * Recompute what the party sees of a board's level and write it through:
 * `party_sees` to `partyVision` over the copy, as the table knows its secret
 * doors (`tableSight`), and `party_seen` to itself with that added. In the
 * caller's transaction, after its own write, so the vision is the board's as
 * that write leaves it. `null` on a board with no level.
 *
 * `viewers` answers where the party's eyes stand. Each sees with its
 * character's darkvision (`darkvisionOf` over the sheet's traits); the traits
 * are read here for the geometry and never returned. `shown`, over the board
 * row, is whether a player's table shows the board.
 *
 * The board row is locked first, so two writes on one board compute their
 * vision one after the other, each over what the other committed.
 */
export const refreshBoardVision = (
  sql: SqlClient.SqlClient,
  args: {
    readonly tables: BoardTables;
    readonly id: string;
    readonly viewers: Effect.Effect<ReadonlyArray<VisionViewer>, SqlError.SqlError>;
    readonly shown: Statement.Fragment;
  },
) =>
  Effect.gen(function* () {
    const board = sql(args.tables.board);
    const where = sql`${board}.${sql(args.tables.boardKey)} = ${args.id}`;
    const locked = yield* sql`
      select 1 from ${board} where ${where} and ${board}.floor is not null for update
    `;
    if (locked.length === 0) return null;
    const level = yield* boardLevel(sql, args.tables, args.id);
    if (level === null) return null;
    const viewers = yield* args.viewers;
    const sees = partyVision(
      level.layout,
      viewers.map((viewer) => ({
        square: { column: viewer.board_column, row: viewer.board_row },
        darkvision: darkvisionOf(traitsOf(viewer.traits)),
      })),
      tableSight(level.level),
    );
    const rows = yield* sql<{ readonly changed: boolean; readonly shown: boolean }>`
      update ${board}
      set party_sees = ${intArray([...sees])},
          party_seen = array(
            select square
            from unnest(coalesce(${board}.party_seen, '{}') || ${intArray([...sees])}) square
            group by square order by square
          )
      where ${where}
      returning (old.party_sees is distinct from new.party_sees
                 or old.party_seen is distinct from new.party_seen) as changed,
        ${args.shown} as shown
    `;
    const row = rows[0];
    const refreshed: PartyVisionRefresh | null =
      row === undefined ? null : { changed: row.changed, shown: row.shown };
    return refreshed;
  });

/**
 * `refreshBoardVision` over a fight's copy. **The viewers** are the fight's
 * player characters standing on the board whose character still holds a live
 * seat at the campaign: a seat is how a person is at the table, and an allied
 * NPC looks for nobody.
 */
export const refreshPartyVision = (sql: SqlClient.SqlClient, runId: EncounterRunId) =>
  refreshBoardVision(sql, {
    tables: RUN_BOARD,
    id: runId,
    viewers: sql<VisionViewer>`
      select combatant.board_column, combatant.board_row, character.body -> 'traits' as traits
      from combatant
      join encounter_run on encounter_run.id = combatant.encounter_run_id
      join session on session.id = encounter_run.session_id
      join character on character.id = combatant.character_id
      where combatant.encounter_run_id = ${runId}
        and combatant.kind = 'pc'
        and combatant.board_column is not null and combatant.board_row is not null
        and exists (
          select 1 from campaign_character seat
          where seat.campaign_id = session.campaign_id
            and seat.character_id = combatant.character_id
            and seat.left_at is null
        )
    `,
    shown: sql`(select ${boardShown(sql)} from encounter_run
                where encounter_run.id = encounter_run_board.run_id)`,
  });

/**
 * Ring the players' doorbell for a change to what the party sees: a shared,
 * contentless `board-vision-updated` line, when the vision changed (or
 * `force`: what the table is told of a part it has seen changed) while the
 * table is shown the board, and the write's own line is not already shared.
 * Otherwise nothing: the DM's doorbell rings from the write itself.
 */
export const ringVision = (
  sql: SqlClient.SqlClient,
  args: {
    readonly sessionId: SessionId;
    readonly runId: EncounterRunId;
    readonly vision: PartyVisionRefresh | null;
    readonly lineShared: boolean;
    readonly force?: boolean;
  },
): Effect.Effect<void> =>
  args.vision === null ||
  !args.vision.shown ||
  args.lineShared ||
  !(args.vision.changed || args.force === true)
    ? Effect.void
    : Effect.asVoid(
        appendEvent(sql, {
          sessionId: args.sessionId,
          kind: "board-vision-updated",
          encounterRunId: args.runId,
          payload: {},
          visibility: "shared",
        }),
      );

/** `refreshPartyVision`, then `ringVision` for it; answers the refresh. */
export const refreshAndRing = (
  sql: SqlClient.SqlClient,
  args: {
    readonly sessionId: SessionId;
    readonly runId: EncounterRunId;
    readonly lineShared: boolean;
  },
) =>
  Effect.flatMap(refreshPartyVision(sql, args.runId), (vision) =>
    Effect.as(ringVision(sql, { ...args, vision }), vision),
  );

/** A live fight on a level, by its run and its night. */
export interface LevelFightRef {
  readonly runId: EncounterRunId;
  readonly sessionId: SessionId;
}

/**
 * The live (not ended) level fights with a player character combatant for any
 * of these characters: the fights whose party vision a seat's retirement can
 * change, since only a live-seated character is a viewer
 * (`refreshPartyVision`). Read before the write that retires the seat or
 * deletes the character, so a deleted character's fights are still found.
 */
export const levelFightsOf = (
  sql: SqlClient.SqlClient,
  characterIds: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<LevelFightRef>, SqlError.SqlError> =>
  characterIds.length === 0
    ? Effect.succeed([])
    : Effect.map(
        sql<{ readonly run_id: EncounterRunId; readonly session_id: SessionId }>`
          select distinct encounter_run.id as run_id, encounter_run.session_id
          from combatant
          join encounter_run on encounter_run.id = combatant.encounter_run_id
          join encounter_run_board on encounter_run_board.run_id = encounter_run.id
          where combatant.kind = 'pc'
            and combatant.character_id = any(${uuidArray(characterIds)})
            and encounter_run.ended_at is null
            and encounter_run_board.floor is not null
          order by encounter_run.id
        `,
        (rows) => rows.map((row) => ({ runId: row.run_id, sessionId: row.session_id })),
      );

/**
 * Recompute each fight's party vision after a seat left the table, in the
 * caller's transaction, ringing the players' doorbell where it changed.
 * Answers the nights to `touched` once the caller has committed.
 */
export const refreshFights = (
  sql: SqlClient.SqlClient,
  fights: ReadonlyArray<LevelFightRef>,
): Effect.Effect<ReadonlyArray<SessionId>, SqlError.SqlError> =>
  Effect.as(
    Effect.forEach(
      fights,
      (fight) =>
        refreshAndRing(sql, { sessionId: fight.sessionId, runId: fight.runId, lineShared: false }),
      { discard: true },
    ),
    [...new Set(fights.map((fight) => fight.sessionId))],
  );

/**
 * The squares the party has seen of a board's level with the DM's fog taken
 * out: the `seen` a seated player's table is sent (`playerLevelColumn`), and
 * what a player's walk is held to (`partyWalk`). Empty with no vision yet.
 */
export const partySeen = (sql: SqlClient.SqlClient, tables: BoardTables, id: string) => {
  const board = sql(tables.board);
  return Effect.map(
    sql<{ readonly seen: ReadonlyArray<number> | null }>`
      select v.seen from ${board} cross join lateral ${partyView(sql, tables)}
      where ${board}.${sql(tables.boardKey)} = ${id}
    `,
    (rows): ReadonlyArray<number> => rows[0]?.seen ?? [],
  );
};

/** Each prop kind's size, for the player's level read: the kit's (`PROP_KINDS`), as one parameter. */
const PROP_SIZES = JSON.stringify(
  LEVEL_PROP_KINDS.map((kind) => ({
    kind,
    width: PROP_KINDS[kind].width,
    height: PROP_KINDS[kind].height,
  })),
);

/**
 * A board's level as a seated player's table has it (`PlayerLiveLevel`), as
 * one `json` column, `level`, or `null` on the plain grid: a fight's
 * (`PlayerLiveBoard.level`) or the visit on the table's
 * (`PlayerLevelVisit.level`). The board's table must be in scope.
 *
 * Narrowed here, in SQL, against the board's arrays with the DM's fog taken
 * out (`seen`, `sees`). Every part is selected only through them, and the
 * columns that say what a player is not told (a prop's `dm_only`, a light's
 * `lit`, a region's `secret`, a secret door's kind and state until it is
 * revealed) are not selected at all:
 *
 * - the floor of each seen square, in `seen`'s order;
 * - walls touching a seen square: an axis-aligned wall touches the squares it
 *   runs along or through, a slanted one the squares its line crosses inside
 *   (not those it only meets at a corner); an unrevealed secret door goes as a
 *   plain `wall` with no door state, and a locked door as `closed` (whether a
 *   door is locked is learnt by trying it, at the table);
 * - props that are not DM-only with a footprint square seen;
 * - lights that are lit and stand on a seen square. A light's glow reaching a
 *   seen square does not send it: where a torch stands is learnt by seeing
 *   its square, as a lit room is seen without its lamp;
 * - regions that are not secret, or are secret and revealed by the DM
 *   (`0112_run_region_reveal.ts`), clipped to the seen squares, none left
 *   empty; never an `entry`, the DM's overlay (`0114_level_visit_writes.ts`).
 *
 * `seen_at` is the seen set as one flag per square, so each part's test is a
 * subscript rather than a scan of the array.
 */
export const playerLevelColumn = (
  sql: SqlClient.SqlClient,
  tables: BoardTables,
): Statement.Fragment => {
  const board = sql(tables.board);
  const owner = sql`${board}.${sql(tables.boardKey)}`;
  const key = sql(tables.partKey);
  const columns = sql`${board}.board_columns`;
  const rows = sql`${board}.board_rows`;
  return sql`
    case when ${board}.floor is null then null else (
      select json_build_object(
        'ambient', ${board}.ambient,
        'sees', to_json(v.sees),
        'seen', to_json(v.seen),
        'floor', to_json(array(
          select ${board}.floor[square + 1] from unnest(v.seen) square
          order by square
        )),
        'walls', coalesce((
          select json_agg(json_build_object(
            'id', w.id, 'x1', w.x1, 'y1', w.y1, 'x2', w.x2, 'y2', w.y2,
            'kind', case when w.kind = 'secretDoor' and not w.revealed then 'wall' else w.kind end,
            'doorState',
              case when w.kind = 'secretDoor' and not w.revealed then null
                   when w.door_state = 'locked' then 'closed'
                   else w.door_state end,
            'low', w.low
          ) order by w.ordinal)
          from ${sql(tables.wall)} w
          where w.${key} = ${owner} and ${wallTouchesSeen(sql, tables)}
        ), '[]'::json),
        'props', coalesce((
          select json_agg(json_build_object(
            'id', p.id, 'kind', p.kind, 'x', p.x, 'y', p.y, 'rotation', p.rotation,
            'blocksMovement', p.blocks_movement, 'blocksSight', p.blocks_sight,
            'cover', p.cover, 'difficult', p.difficult
          ) order by p.ordinal)
          from ${sql(tables.prop)} p
          join jsonb_to_recordset(${PROP_SIZES}::jsonb) as kit(kind text, width int, height int)
            on kit.kind = p.kind
          where p.${key} = ${owner}
            and not p.dm_only
            and exists (
              select 1
              from generate_series(p.x,
                     p.x - 1 + case when p.rotation % 2 = 1 then kit.height else kit.width end) c,
                   generate_series(p.y,
                     p.y - 1 + case when p.rotation % 2 = 1 then kit.width else kit.height end) r
              where c < ${columns} and r < ${rows}
                and v.seen_at[r * ${columns} + c + 1]
            )
        ), '[]'::json),
        'lights', coalesce((
          select json_agg(json_build_object(
            'id', l.id, 'x', l.x, 'y', l.y, 'bright', l.bright, 'dim', l.dim, 'tone', l.tone,
            'flicker', l.flicker
          ) order by l.ordinal)
          from ${sql(tables.light)} l
          where l.${key} = ${owner} and l.lit and ${lightOnSeen(sql, tables)}
        ), '[]'::json),
        'regions', coalesce((
          select json_agg(json_build_object(
            'id', clipped.id, 'kind', clipped.kind, 'squares', to_json(clipped.squares)
          ) order by clipped.ordinal)
          from (
            select g.id, g.kind, g.ordinal,
                   array(select square from unnest(g.squares) square
                         where v.seen_at[square + 1] order by square) as squares
            from ${sql(tables.region)} g
            where g.${key} = ${owner} and (not g.secret or g.revealed)
              and g.kind <> 'entry'
          ) clipped
          where cardinality(clipped.squares) > 0
        ), '[]'::json)
      )
      from ${partyView(sql, tables)}
    ) end as level
  `;
};

/**
 * Over the board's row: what the party has seen of its level with the DM's
 * fog taken out, as a row source `v (seen, sees, seen_at)`: the explored
 * squares and those in sight now, ascending, and `seen_at`, one flag per
 * square (`seen_at[square + 1]`). Empty while the board has no vision yet.
 */
const partyView = (sql: SqlClient.SqlClient, tables: BoardTables): Statement.Fragment => {
  const board = sql(tables.board);
  return sql`(
  select fogless.seen, fogless.sees,
         array(
           select seen_square.square is not null
           from generate_series(
             0, ${board}.board_columns * ${board}.board_rows - 1
           ) every_square
           left join unnest(fogless.seen) as seen_square(square)
             on seen_square.square = every_square
           order by every_square
         ) as seen_at
  from (
    select array(
             select unnest(${board}.party_seen)
             except select unnest(${board}.fog_hidden)
             order by 1) as seen,
           array(
             select unnest(${board}.party_sees)
             except select unnest(${board}.fog_hidden)
             order by 1) as sees
  ) fogless
) v`;
};

/**
 * Over a board's wall `w`, its board row and `partyView`'s `v`: the wall
 * touches a seen square. An axis-aligned wall touches the squares it runs
 * along or through; a slanted one, the squares its line crosses inside, not
 * those it only meets at a corner. Only the squares about the wall's box are
 * asked.
 */
const wallTouchesSeen = (sql: SqlClient.SqlClient, tables: BoardTables): Statement.Fragment => {
  const board = sql(tables.board);
  const columns = sql`${board}.board_columns`;
  const x0 = sql`least(w.x1, w.x2)`;
  const x1 = sql`greatest(w.x1, w.x2)`;
  const y0 = sql`least(w.y1, w.y2)`;
  const y1 = sql`greatest(w.y1, w.y2)`;
  /** Which side of the wall's line a corner of square `(c, r)` is on: 0 on it. */
  const side = (dx: 0 | 1, dy: 0 | 1) =>
    sql`((w.x2 - w.x1) * (r + ${dy} - w.y1) - (w.y2 - w.y1) * (c + ${dx} - w.x1))`;
  const corners = sql.csv([side(0, 0), side(1, 0), side(0, 1), side(1, 1)]);
  return sql`exists (
    select 1
    from generate_series(
           greatest(0, floor(${x0})::int - 1), least(${columns} - 1, ceil(${x1})::int)) c,
         generate_series(
           greatest(0, floor(${y0})::int - 1),
           least(${board}.board_rows - 1, ceil(${y1})::int)) r
    where (case when w.x1 = w.x2 then c <= ${x0} and c + 1 >= ${x0}
                else c < ${x1} and c + 1 > ${x0} end)
      and (case when w.y1 = w.y2 then r <= ${y0} and r + 1 >= ${y0}
                else r < ${y1} and r + 1 > ${y0} end)
      and (w.x1 = w.x2 or w.y1 = w.y2
        or (least(${corners}) < 0 and greatest(${corners}) > 0))
      and v.seen_at[r * ${columns} + c + 1]
  )`;
};

/** Over a board's light `l`, its board row and `partyView`'s `v`: the light stands on a seen square. */
const lightOnSeen = (sql: SqlClient.SqlClient, tables: BoardTables): Statement.Fragment => {
  const board = sql(tables.board);
  return sql`
  v.seen_at[least(floor(l.y)::int, ${board}.board_rows - 1)
              * ${board}.board_columns
            + least(floor(l.x)::int, ${board}.board_columns - 1) + 1]`;
};

/**
 * Whether the party has seen a part of a board's level, with the DM's fog
 * taken out: the wall touches a seen square, the light stands on one, or the
 * region has one. What a door's or a light's log line is shared under, and
 * what rings the table for a region revealed or hidden, so the table is told
 * of a change to a part it has seen, and of no other.
 */
export const partSeen = (
  sql: SqlClient.SqlClient,
  tables: BoardTables,
  id: string,
  part: { readonly wallId: string } | { readonly lightId: string } | { readonly regionId: string },
) => {
  const board = sql(tables.board);
  const key = sql(tables.partKey);
  const onBoard = (alias: string) =>
    sql`join ${board} on ${board}.${sql(tables.boardKey)} = ${sql(alias)}.${key}
        cross join lateral ${partyView(sql, tables)}`;
  return Effect.map(
    "wallId" in part
      ? sql<{ readonly seen: boolean }>`
          select ${wallTouchesSeen(sql, tables)} as seen
          from ${sql(tables.wall)} w ${onBoard("w")}
          where w.${key} = ${id} and w.id = ${part.wallId}
        `
      : "regionId" in part
        ? sql<{ readonly seen: boolean }>`
          select exists (
                   select 1 from unnest(g.squares) square where v.seen_at[square + 1]
                 ) as seen
          from ${sql(tables.region)} g ${onBoard("g")}
          where g.${key} = ${id} and g.id = ${part.regionId}
        `
        : sql<{ readonly seen: boolean }>`
          select ${lightOnSeen(sql, tables)} as seen
          from ${sql(tables.light)} l ${onBoard("l")}
          where l.${key} = ${id} and l.id = ${part.lightId}
        `,
    (rows) => rows[0]?.seen === true,
  );
};
