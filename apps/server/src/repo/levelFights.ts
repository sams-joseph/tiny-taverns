import {
  type Actor,
  type BoardSquare,
  darkvisionOf,
  type EncounterId,
  type EncounterRunId,
  LEVEL_PROP_KINDS,
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

/**
 * Recompute what the party sees of a fight's level and write it through:
 * `party_sees` to `partyVision` over the fight's copy, as the table knows its
 * secret doors (`tableSight`), and `party_seen` to itself with that added. In
 * the caller's transaction, after its own write, so the vision is the board's
 * as that write leaves it. `null` on a fight with no level.
 *
 * **The viewers** are the fight's player characters standing on the board
 * whose character still holds a live seat at the campaign: a seat is how a
 * person is at the table, and an allied NPC looks for nobody. Each sees with
 * its character's darkvision (`darkvisionOf` over the sheet's traits). The
 * traits are read here for the geometry and never returned.
 *
 * The board row is locked first, so two writes in one fight compute their
 * vision one after the other, each over what the other committed.
 */
export const refreshPartyVision = (sql: SqlClient.SqlClient, runId: EncounterRunId) =>
  Effect.gen(function* () {
    const locked = yield* sql<{ readonly run_id: string }>`
      select encounter_run_board.run_id from encounter_run_board
      where encounter_run_board.run_id = ${runId} and encounter_run_board.floor is not null
      for update
    `;
    if (locked.length === 0) return null;
    const level = yield* runLevel(sql, runId);
    if (level === null) return null;
    const viewers = yield* sql<{
      readonly board_column: number;
      readonly board_row: number;
      readonly traits: unknown;
    }>`
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
    `;
    const sees = partyVision(
      level.layout,
      viewers.map((viewer) => ({
        square: { column: viewer.board_column, row: viewer.board_row },
        darkvision: darkvisionOf(traitsOf(viewer.traits)),
      })),
      tableSight(level.level),
    );
    const rows = yield* sql<{ readonly changed: boolean; readonly shown: boolean }>`
      update encounter_run_board
      set party_sees = ${intArray([...sees])},
          party_seen = array(
            select square
            from unnest(
              coalesce(encounter_run_board.party_seen, '{}') || ${intArray([...sees])}
            ) square
            group by square order by square
          )
      where encounter_run_board.run_id = ${runId}
      returning (old.party_sees is distinct from new.party_sees
                 or old.party_seen is distinct from new.party_seen) as changed,
        (select ${boardShown(sql)} from encounter_run
          where encounter_run.id = encounter_run_board.run_id) as shown
    `;
    const row = rows[0];
    const refreshed: PartyVisionRefresh | null =
      row === undefined ? null : { changed: row.changed, shown: row.shown };
    return refreshed;
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
 * The squares the party has seen of a fight's level with the DM's fog taken
 * out: the `seen` a seated player's table is sent (`playerLevelColumn`), and
 * what a player's walk is held to (`partyWalk`). Empty with no vision yet.
 */
export const partySeen = (sql: SqlClient.SqlClient, runId: EncounterRunId) =>
  Effect.map(
    sql<{ readonly seen: ReadonlyArray<number> | null }>`
      select v.seen from encounter_run_board cross join lateral ${partyView(sql)}
      where encounter_run_board.run_id = ${runId}
    `,
    (rows): ReadonlyArray<number> => rows[0]?.seen ?? [],
  );

/** Each prop kind's size, for the player's level read: the kit's (`PROP_KINDS`), as one parameter. */
const PROP_SIZES = JSON.stringify(
  LEVEL_PROP_KINDS.map((kind) => ({
    kind,
    width: PROP_KINDS[kind].width,
    height: PROP_KINDS[kind].height,
  })),
);

/**
 * The fight's level as a seated player's table has it (`PlayerLiveLevel`), as
 * one `json` column, `level`, or `null` on the plain grid.
 * `encounter_run_board` must be in scope.
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
 * - regions that are not secret, clipped to the seen squares, none left empty.
 *
 * `seen_at` is the seen set as one flag per square, so each part's test is a
 * subscript rather than a scan of the array.
 */
export const playerLevelColumn = (sql: SqlClient.SqlClient): Statement.Fragment => {
  const columns = sql`encounter_run_board.board_columns`;
  const rows = sql`encounter_run_board.board_rows`;
  return sql`
    case when encounter_run_board.floor is null then null else (
      select json_build_object(
        'ambient', encounter_run_board.ambient,
        'sees', to_json(v.sees),
        'seen', to_json(v.seen),
        'floor', to_json(array(
          select encounter_run_board.floor[square + 1] from unnest(v.seen) square
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
          from encounter_run_wall w
          where w.run_id = encounter_run_board.run_id and ${wallTouchesSeen(sql)}
        ), '[]'::json),
        'props', coalesce((
          select json_agg(json_build_object(
            'id', p.id, 'kind', p.kind, 'x', p.x, 'y', p.y, 'rotation', p.rotation,
            'blocksMovement', p.blocks_movement, 'blocksSight', p.blocks_sight,
            'cover', p.cover, 'difficult', p.difficult
          ) order by p.ordinal)
          from encounter_run_prop p
          join jsonb_to_recordset(${PROP_SIZES}::jsonb) as kit(kind text, width int, height int)
            on kit.kind = p.kind
          where p.run_id = encounter_run_board.run_id
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
          from encounter_run_light l
          where l.run_id = encounter_run_board.run_id and l.lit and ${lightOnSeen(sql)}
        ), '[]'::json),
        'regions', coalesce((
          select json_agg(json_build_object(
            'id', clipped.id, 'kind', clipped.kind, 'squares', to_json(clipped.squares)
          ) order by clipped.ordinal)
          from (
            select g.id, g.kind, g.ordinal,
                   array(select square from unnest(g.squares) square
                         where v.seen_at[square + 1] order by square) as squares
            from encounter_run_region g
            where g.run_id = encounter_run_board.run_id and not g.secret
          ) clipped
          where cardinality(clipped.squares) > 0
        ), '[]'::json)
      )
      from ${partyView(sql)}
    ) end as level
  `;
};

/**
 * Over `encounter_run_board`: what the party has seen of its level with the
 * DM's fog taken out, as a row source `v (seen, sees, seen_at)`: the explored
 * squares and those in sight now, ascending, and `seen_at`, one flag per
 * square (`seen_at[square + 1]`). Empty while the board has no vision yet.
 */
const partyView = (sql: SqlClient.SqlClient): Statement.Fragment => sql`(
  select fogless.seen, fogless.sees,
         array(
           select seen_square.square is not null
           from generate_series(
             0, encounter_run_board.board_columns * encounter_run_board.board_rows - 1
           ) every_square
           left join unnest(fogless.seen) as seen_square(square)
             on seen_square.square = every_square
           order by every_square
         ) as seen_at
  from (
    select array(
             select unnest(encounter_run_board.party_seen)
             except select unnest(encounter_run_board.fog_hidden)
             order by 1) as seen,
           array(
             select unnest(encounter_run_board.party_sees)
             except select unnest(encounter_run_board.fog_hidden)
             order by 1) as sees
  ) fogless
) v`;

/**
 * Over `encounter_run_wall w`, `encounter_run_board` and `partyView`'s `v`:
 * the wall touches a seen square. An axis-aligned wall touches the squares it
 * runs along or through; a slanted one, the squares its line crosses inside,
 * not those it only meets at a corner. Only the squares about the wall's box
 * are asked.
 */
const wallTouchesSeen = (sql: SqlClient.SqlClient): Statement.Fragment => {
  const columns = sql`encounter_run_board.board_columns`;
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
           least(encounter_run_board.board_rows - 1, ceil(${y1})::int)) r
    where (case when w.x1 = w.x2 then c <= ${x0} and c + 1 >= ${x0}
                else c < ${x1} and c + 1 > ${x0} end)
      and (case when w.y1 = w.y2 then r <= ${y0} and r + 1 >= ${y0}
                else r < ${y1} and r + 1 > ${y0} end)
      and (w.x1 = w.x2 or w.y1 = w.y2
        or (least(${corners}) < 0 and greatest(${corners}) > 0))
      and v.seen_at[r * ${columns} + c + 1]
  )`;
};

/** Over `encounter_run_light l`, `encounter_run_board` and `partyView`'s `v`: the light stands on a seen square. */
const lightOnSeen = (sql: SqlClient.SqlClient): Statement.Fragment => sql`
  v.seen_at[least(floor(l.y)::int, encounter_run_board.board_rows - 1)
              * encounter_run_board.board_columns
            + least(floor(l.x)::int, encounter_run_board.board_columns - 1) + 1]`;

/**
 * Whether the party has seen a part of the fight's level, with the DM's fog
 * taken out: the wall touches a seen square, or the light stands on one. What
 * a door's or a light's log line is shared under, so the table is told of a
 * change to a part it has seen, and of no other.
 */
export const partSeen = (
  sql: SqlClient.SqlClient,
  runId: EncounterRunId,
  part: { readonly wallId: string } | { readonly lightId: string },
) =>
  Effect.map(
    "wallId" in part
      ? sql<{ readonly seen: boolean }>`
          select ${wallTouchesSeen(sql)} as seen
          from encounter_run_wall w
          join encounter_run_board on encounter_run_board.run_id = w.run_id
          cross join lateral ${partyView(sql)}
          where w.run_id = ${runId} and w.id = ${part.wallId}
        `
      : sql<{ readonly seen: boolean }>`
          select ${lightOnSeen(sql)} as seen
          from encounter_run_light l
          join encounter_run_board on encounter_run_board.run_id = l.run_id
          cross join lateral ${partyView(sql)}
          where l.run_id = ${runId} and l.id = ${part.lightId}
        `,
    (rows) => rows[0]?.seen === true,
  );
