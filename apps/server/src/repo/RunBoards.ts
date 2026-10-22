import {
  areaSquares,
  areaToward,
  type BoardAreaSet,
  type BoardDoorUpdate,
  type BoardFogUpdate,
  type BoardLightUpdate,
  Conflict,
  EncounterRunBoard,
  EncounterRunId,
  type LevelPartId,
  NotFound,
  SessionId,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlError, SqlSchema } from "effect/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import { boardShown, clearArea, RUNS } from "./liveTables.js";
import { classFromColumns, dieOnSqlError, fromColumns, intArray, orNotFound } from "./rows.js";
import { levelColumn, partSeen, refreshPartyVision, ringVision } from "./levelFights.js";
import { appendEvent, requestAlreadyApplied } from "./SessionEvents.js";
import { nestedRowWritable } from "./visibility.js";

/**
 * A fight's board (`encounter_run_board`, `0058_encounter_run_boards.ts`) —
 * **the creator's alone**, so every method takes a `CampaignCreatorActor` and
 * still composes the nested run's predicate beneath it. The player's view of
 * the board is `repo/PlayerTable.ts`'s, a schema of its own.
 *
 * Its fog of war, its pinned area template, and its level's doors and lights
 * are written here, because each write answers with the board.
 */

/**
 * A fight's fog as the wire spells it: the squares in `fog_hidden`, each
 * `row * board_columns + column` (`0087_run_board_fog.ts`), as `{column, row}`
 * in reading order. `encounter_run_board` must be in scope.
 */
export const fogColumn = (sql: SqlClient.SqlClient) => sql`
  coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'column', square % encounter_run_board.board_columns,
         'row', square / encounter_run_board.board_columns)
       order by square)
     from unnest(encounter_run_board.fog_hidden) as square),
    '[]'::jsonb
  ) as fog
`;

/**
 * The area template pinned on a fight's board as the wire spells it
 * (`BoardArea`), or `null` when nothing is pinned. A fight that is over has
 * nothing pinned: a template is where a spell lands now
 * (`0090_run_board_area.ts`), and both ends clear it (`clearArea`).
 * `encounter_run_board` must be in scope.
 */
export const areaColumn = (sql: SqlClient.SqlClient) => sql`
  case when encounter_run_board.area_shape is not null
  then jsonb_build_object(
         'shape', encounter_run_board.area_shape,
         'feet', encounter_run_board.area_feet,
         'origin', jsonb_build_object(
           'column', encounter_run_board.area_origin_column,
           'row', encounter_run_board.area_origin_row))
       || case when encounter_run_board.area_toward_column is null then '{}'::jsonb
          else jsonb_build_object('toward', jsonb_build_object(
            'column', encounter_run_board.area_toward_column,
            'row', encounter_run_board.area_toward_row)) end
  end as area
`;

/** A board's two dimensions, which the wire calls `columns` and `rows`. */
export const boardColumns = { columns: "board_columns", rows: "board_rows" } as const;

/** `encounter_run_board`, as the creator reads it. */
const RunBoardRow = classFromColumns(EncounterRunBoard, EncounterRunBoard.fields, boardColumns);

export class RunBoards extends Context.Service<
  RunBoards,
  {
    /**
     * A fight's board, or `null` for a fight that has none; `NotFound` for a
     * run that is not in this creator's session.
     */
    readonly forRun: (
      creator: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
    ) => Effect.Effect<EncounterRunBoard | null, NotFound>;
    /**
     * Hide or reveal squares of a fight's board under fog of war — the DM's
     * alone, as the board is. `Conflict` for a fight with no board and for a
     * square off it. A repeated `requestId` changes nothing and answers the
     * board as it stands.
     *
     * The log line is shared while a player's table shows the board
     * (`liveTables.ts`' `boardShown`), so their doorbell rings and they re-read
     * a table that fog has changed; otherwise it is the DM's own.
     */
    readonly updateFog: (
      creator: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      update: BoardFogUpdate,
    ) => Effect.Effect<EncounterRunBoard, NotFound | Conflict>;
    /**
     * Pin an area template on a fight's board, replacing what was pinned, or
     * clear it — the DM's alone, as the board is. `Conflict` for a fight that
     * is over or has no board, a square off the board, and a template that
     * covers none of it (`areaSquares`). A repeated `requestId` changes
     * nothing and answers the board as it stands; clearing a board with
     * nothing pinned writes nothing and logs nothing.
     *
     * The log line is shared while a player's table shows the board
     * (`liveTables.ts`' `boardShown`), so their doorbell rings and they re-read
     * a table that carries the template; otherwise it is the DM's own.
     */
    readonly setArea: (
      creator: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      update: BoardAreaSet,
    ) => Effect.Effect<EncounterRunBoard, NotFound | Conflict>;
    /**
     * Open, close or lock a door of the fight's level, or reveal or hide a
     * secret one — the DM's alone, as the board is, written through in one
     * transaction with a `board-door-updated` line and the doorbell.
     * `NotFound` for a wall the fight's level does not have; `Conflict` for a
     * fight that is over or not on a level, a plain wall, and a reveal of a
     * door that is not secret. A repeated `requestId` changes nothing.
     *
     * The party's vision is recomputed in the same transaction
     * (`levelFights.ts`' `refreshPartyVision`). The line is shared only for a
     * plain door touching a square the party has seen, while the table is
     * shown the board; a secret door's line is always the DM's own, since a
     * shared line about one would say there is one. When the line is the
     * DM's but what the table draws changed, a contentless
     * `board-vision-updated` rings the players instead (`ringVision`).
     */
    readonly updateDoor: (
      creator: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      wallId: LevelPartId,
      update: BoardDoorUpdate,
    ) => Effect.Effect<EncounterRunBoard, NotFound | Conflict>;
    /**
     * Light or snuff a light of the fight's level: `updateDoor`'s rules, with
     * `board-light-updated`, shared for a light standing on a square the
     * party has seen.
     */
    readonly updateLight: (
      creator: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      lightId: LevelPartId,
      update: BoardLightUpdate,
    ) => Effect.Effect<EncounterRunBoard, NotFound | Conflict>;
  }
>()("RunBoards") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;

      const run = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, sessionId: SessionId, runId: EncounterRunId }),
        ),
        Result: fromColumns(Schema.Struct({ id: EncounterRunId })),
        execute: ({ campaign, actor, sessionId, runId }) => sql`
          select encounter_run.id from encounter_run
          where encounter_run.id = ${runId}
            and ${nestedRowWritable(sql, RUNS, sessionId, campaign, actor)}
        `,
      });
      // Read only beneath `run`, which proves the fight the creator's first.
      const board = SqlSchema.findOneOption({
        Request: Schema.toType(Schema.Struct({ runId: EncounterRunId })),
        Result: RunBoardRow,
        execute: ({ runId }) => sql`
          select encounter_run_board.board_columns, encounter_run_board.board_rows,
                 encounter_run_board.feet_per_cell, ${fogColumn(sql)},
                 ${areaColumn(sql)}, ${levelColumn(sql)}
          from encounter_run_board
          where encounter_run_board.run_id = ${runId}
        `,
      });

      /**
       * The fight as a door or light write finds it, held `for share` so it
       * cannot end under the write (`end` waits), as `setArea` holds it.
       * Beneath the caller's proof that the run is this creator's.
       */
      const levelFight = (runId: EncounterRunId) =>
        Effect.gen(function* () {
          const fights = yield* sql<{ readonly ended: boolean; readonly on_level: boolean }>`
            select encounter_run.ended_at is not null as ended,
                   coalesce(encounter_run_board.floor is not null, false) as on_level
            from encounter_run
            left join encounter_run_board on encounter_run_board.run_id = encounter_run.id
            where encounter_run.id = ${runId}
            for share of encounter_run
          `;
          const fight = fights[0]!;
          if (fight.ended) return yield* new Conflict({ message: "this fight is over" });
          if (!fight.on_level) {
            return yield* new Conflict({ message: "this fight is not on a level" });
          }
        });

      /**
       * The fight's fog, rewritten as one set: the whole-board change first,
       * then `hide` added and `reveal` taken out, distinct and in order. A
       * square is `row * board_columns + column`, the column's own spelling.
       */
      const fog = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            runId: EncounterRunId,
            whole: Schema.Literals(["revealAll", "coverAll", "reset", "none"]),
            hide: Schema.Array(Schema.Int),
            reveal: Schema.Array(Schema.Int),
          }),
        ),
        Result: fromColumns(Schema.Struct({ hidden: Schema.Int, shown: Schema.Boolean })),
        execute: ({ runId, whole, hide, reveal }) => sql`
          update encounter_run_board
          set fog_hidden = array(
            select distinct square
            from unnest(
              case ${whole}::text
                when 'revealAll' then '{}'::integer[]
                when 'coverAll' then array(
                  select generate_series(0, board_columns * board_rows - 1))
                when 'reset' then fog_start
                else fog_hidden
              end || ${intArray([...hide])}
            ) as square
            where square <> all(${intArray([...reveal])})
            order by square
          )
          where run_id = ${runId}
          returning cardinality(fog_hidden) as hidden,
            (select ${boardShown(sql)} from encounter_run
              where encounter_run.id = encounter_run_board.run_id) as shown
        `,
      });

      return {
        forRun: (creator, sessionId, runId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* run({ ...asked(creator), sessionId, runId }).pipe(
                orNotFound("encounter_run", runId),
              );
              return Option.getOrNull(yield* board({ runId }));
            }),
          ),

        updateFog: (creator, sessionId, runId, update) => {
          const current = Effect.flatMap(board({ runId }), (found) =>
            Option.match(found, {
              onNone: () => Effect.fail(new Conflict({ message: "this fight has no board" })),
              onSome: Effect.succeed,
            }),
          );
          return dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* run({ ...asked(creator), sessionId, runId }).pipe(
                    orNotFound("encounter_run", runId),
                  );
                  if (yield* requestAlreadyApplied(sql, runId, update.requestId)) {
                    return yield* current;
                  }

                  // The board's size, locked for the rest of this write, so
                  // two strokes of the brush land one after the other.
                  const boards = yield* sql<{
                    readonly board_columns: number;
                    readonly board_rows: number;
                  }>`
                    select encounter_run_board.board_columns, encounter_run_board.board_rows
                    from encounter_run_board
                    where encounter_run_board.run_id = ${runId}
                    for update
                  `;
                  const size = boards[0];
                  if (size === undefined) {
                    return yield* new Conflict({ message: "this fight has no board" });
                  }
                  const squares = [...(update.hide ?? []), ...(update.reveal ?? [])];
                  if (
                    squares.some(
                      (square) =>
                        square.column >= size.board_columns || square.row >= size.board_rows,
                    )
                  ) {
                    return yield* new Conflict({ message: "that square is off the board" });
                  }
                  const index = (square: { readonly column: number; readonly row: number }) =>
                    square.row * size.board_columns + square.column;

                  const changed = yield* fog({
                    runId,
                    whole: update.revealAll
                      ? "revealAll"
                      : update.coverAll
                        ? "coverAll"
                        : update.reset
                          ? "reset"
                          : "none",
                    hide: (update.hide ?? []).map(index),
                    reveal: (update.reveal ?? []).map(index),
                  }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "board-fog-updated",
                    encounterRunId: runId,
                    payload: { hidden: changed.hidden },
                    requestId: update.requestId,
                    visibility: changed.shown ? "shared" : "dm",
                  });
                  return yield* current;
                }),
              )
              .pipe(
                // Two sends of one stroke that raced past the idempotency
                // check; the unique index refuses the second, as for a move.
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? current
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          );
        },

        setArea: (creator, sessionId, runId, update) => {
          const current = Effect.flatMap(board({ runId }), (found) =>
            Option.match(found, {
              onNone: () => Effect.fail(new Conflict({ message: "this fight has no board" })),
              onSome: Effect.succeed,
            }),
          );
          return dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* run({ ...asked(creator), sessionId, runId }).pipe(
                    orNotFound("encounter_run", runId),
                  );
                  if (yield* requestAlreadyApplied(sql, runId, update.requestId)) {
                    return yield* current;
                  }

                  // The fight as this pin finds it, held `for share` so it
                  // cannot end under the write; `end` waits.
                  const fights = yield* sql<{
                    readonly ended: boolean;
                    readonly shown: boolean;
                    readonly board_columns: number | null;
                    readonly board_rows: number | null;
                    readonly feet_per_cell: number | null;
                  }>`
                    select encounter_run.ended_at is not null as ended,
                           ${boardShown(sql)} as shown,
                           encounter_run_board.board_columns, encounter_run_board.board_rows,
                           encounter_run_board.feet_per_cell
                    from encounter_run
                    left join encounter_run_board on encounter_run_board.run_id = encounter_run.id
                    where encounter_run.id = ${runId}
                    for share of encounter_run
                  `;
                  // Proved writable above, in this transaction.
                  const fight = fights[0]!;
                  if (fight.ended) {
                    return yield* new Conflict({ message: "this fight is over" });
                  }
                  if (
                    fight.board_columns === null ||
                    fight.board_rows === null ||
                    fight.feet_per_cell === null
                  ) {
                    return yield* new Conflict({ message: "this fight has no board" });
                  }
                  const size = { columns: fight.board_columns, rows: fight.board_rows };

                  const area = update.area;
                  if (area === null) {
                    // Nothing pinned is nothing to clear, and nothing to log.
                    if ((yield* clearArea(sql, runId)).length === 0) return yield* current;
                  } else {
                    const toward = areaToward(area);
                    if (
                      [area.origin, toward].some(
                        (square) => square.column >= size.columns || square.row >= size.rows,
                      )
                    ) {
                      return yield* new Conflict({ message: "that square is off the board" });
                    }
                    const covered = areaSquares(size, {
                      shape: area.shape,
                      feet: area.feet,
                      feetPerCell: fight.feet_per_cell,
                      origin: area.origin,
                      toward,
                    });
                    if (covered.length === 0) {
                      return yield* new Conflict({
                        message: "that area covers no square of this board",
                      });
                    }
                    const aimed = "toward" in area ? area.toward : null;
                    yield* sql`
                      update encounter_run_board
                      set area_shape = ${area.shape}, area_feet = ${area.feet},
                          area_origin_column = ${area.origin.column},
                          area_origin_row = ${area.origin.row},
                          area_toward_column = ${aimed?.column ?? null},
                          area_toward_row = ${aimed?.row ?? null}
                      where encounter_run_board.run_id = ${runId}
                    `;
                  }
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "board-area-updated",
                    encounterRunId: runId,
                    payload: { area },
                    requestId: update.requestId,
                    visibility: fight.shown ? "shared" : "dm",
                  });
                  return yield* current;
                }),
              )
              .pipe(
                // Two sends of one pin that raced past the idempotency check;
                // the unique index refuses the second, as for a move.
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? current
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          );
        },

        updateDoor: (creator, sessionId, runId, wallId, update) => {
          const current = Effect.flatMap(board({ runId }), (found) =>
            Option.match(found, {
              onNone: () => Effect.fail(new Conflict({ message: "this fight has no board" })),
              onSome: Effect.succeed,
            }),
          );
          return dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* run({ ...asked(creator), sessionId, runId }).pipe(
                    orNotFound("encounter_run", runId),
                  );
                  if (yield* requestAlreadyApplied(sql, runId, update.requestId)) {
                    return yield* current;
                  }
                  yield* levelFight(runId);
                  const walls = yield* sql<{ readonly kind: string }>`
                    select encounter_run_wall.kind from encounter_run_wall
                    where encounter_run_wall.run_id = ${runId} and encounter_run_wall.id = ${wallId}
                    for update
                  `;
                  const wall = walls[0];
                  if (wall === undefined)
                    return yield* new NotFound({ resource: "wall", id: wallId });
                  if (wall.kind === "wall") {
                    return yield* new Conflict({ message: "that wall is not a door" });
                  }
                  if (update.revealed !== undefined && wall.kind !== "secretDoor") {
                    return yield* new Conflict({ message: "only a secret door is revealed" });
                  }
                  const changed = yield* sql<{
                    readonly door_state: string;
                    readonly revealed: boolean;
                    readonly was_revealed: boolean;
                  }>`
                    update encounter_run_wall
                    set door_state = coalesce(${update.doorState ?? null}::text, door_state),
                        revealed = coalesce(${update.revealed ?? null}::boolean, revealed)
                    where encounter_run_wall.run_id = ${runId} and encounter_run_wall.id = ${wallId}
                    returning encounter_run_wall.door_state, encounter_run_wall.revealed,
                      old.revealed as was_revealed
                  `;
                  // What the party sees through it now, then whether the table
                  // is told: a plain door they have seen, on a board they are
                  // shown. A secret door's line is the DM's whatever happens.
                  const vision = yield* refreshPartyVision(sql, runId);
                  const seen = yield* partSeen(sql, runId, { wallId });
                  const lineShared = vision?.shown === true && wall.kind === "door" && seen;
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "board-door-updated",
                    encounterRunId: runId,
                    payload: {
                      wallId,
                      doorState: changed[0]!.door_state,
                      revealed: changed[0]!.revealed,
                    },
                    requestId: update.requestId,
                    visibility: lineShared ? "shared" : "dm",
                  });
                  yield* ringVision(sql, {
                    sessionId,
                    runId,
                    vision,
                    lineShared,
                    // A secret door they have seen turned from wall to door,
                    // or back: their table draws it differently now.
                    force: seen && changed[0]!.revealed !== changed[0]!.was_revealed,
                  });
                  return yield* current;
                }),
              )
              .pipe(
                // Two sends of one press that raced past the idempotency
                // check; the unique index refuses the second, as for a move.
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? current
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          );
        },

        updateLight: (creator, sessionId, runId, lightId, update) => {
          const current = Effect.flatMap(board({ runId }), (found) =>
            Option.match(found, {
              onNone: () => Effect.fail(new Conflict({ message: "this fight has no board" })),
              onSome: Effect.succeed,
            }),
          );
          return dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* run({ ...asked(creator), sessionId, runId }).pipe(
                    orNotFound("encounter_run", runId),
                  );
                  if (yield* requestAlreadyApplied(sql, runId, update.requestId)) {
                    return yield* current;
                  }
                  yield* levelFight(runId);
                  const changed = yield* sql<{ readonly id: string }>`
                    update encounter_run_light set lit = ${update.lit}
                    where encounter_run_light.run_id = ${runId}
                      and encounter_run_light.id = ${lightId}
                    returning encounter_run_light.id
                  `;
                  if (changed.length === 0) {
                    return yield* new NotFound({ resource: "light", id: lightId });
                  }
                  // What the party sees by it now, then whether the table is
                  // told: a light standing where they have seen, on a board
                  // they are shown.
                  const vision = yield* refreshPartyVision(sql, runId);
                  const lineShared =
                    vision?.shown === true && (yield* partSeen(sql, runId, { lightId }));
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "board-light-updated",
                    encounterRunId: runId,
                    payload: { lightId, lit: update.lit },
                    requestId: update.requestId,
                    visibility: lineShared ? "shared" : "dm",
                  });
                  yield* ringVision(sql, { sessionId, runId, vision, lineShared });
                  return yield* current;
                }),
              )
              .pipe(
                // Two sends of one press that raced past the idempotency
                // check; the unique index refuses the second, as for a move.
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? current
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          );
        },
      };
    }),
  );
}
