import {
  Actor,
  type CampaignId,
  Conflict,
  CurrentActor,
  type EncounterId,
  LEVEL_FEET_PER_CELL_DEFAULT,
  Level,
  LevelAmbient,
  type LevelCreate,
  LevelId,
  LevelLight,
  LevelProp,
  LevelRegion,
  type LevelSave,
  LevelSummary,
  LevelUse,
  LevelWall,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { placedOnLevel } from "./LevelVisits.js";
import { watchPlacement } from "./placements.js";
import {
  type AssistantOrigin,
  assistantColumns,
  classFromColumns,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  proseColumn,
  smallintArray,
  timestampColumns,
} from "./rows.js";
import { levelOwned } from "./visibility.js";

const origin = Schema.Literals(["authored", "assistant"]);

/** The `level` row, without its parts. */
const HeaderRow = fromColumns(
  Schema.Struct({
    id: LevelId,
    name: Schema.String,
    description: Schema.NullOr(Schema.String),
    columns: Schema.Int,
    rows: Schema.Int,
    feetPerCell: Schema.Int,
    ambient: LevelAmbient,
    floor: Schema.Array(Schema.Int),
    version: Schema.Int,
    origin,
    ...timestampColumns,
  }),
);

/** Each part's columns, by the wire's own field list. */
const WallRow = fromColumns(Schema.Struct(LevelWall.fields));
const PropRow = fromColumns(Schema.Struct(LevelProp.fields));
const LightRow = fromColumns(Schema.Struct(LevelLight.fields));
const RegionRow = fromColumns(Schema.Struct(LevelRegion.fields));

const SummaryRow = classFromColumns(LevelSummary, {
  ...LevelSummary.fields,
  ...timestampColumns,
});

const UseRow = classFromColumns(LevelUse, LevelUse.fields);

const OwnedRequest = Schema.toType(Schema.Struct({ actor: Actor, id: LevelId }));

/**
 * The asker's levels: the Library's Levels shelf, and the one copy of every
 * read and write a level has in this phase.
 *
 * Every statement names `levelOwned` (`repo/visibility.ts`), so another
 * account's level is `NotFound` and never fetched. A part is read or written
 * only beside a level that predicate just returned.
 */
export class Levels extends Context.Service<
  Levels,
  {
    /** The asker's own levels, by name, with how much is on each. */
    readonly library: Effect.Effect<ReadonlyArray<LevelSummary>, never, CurrentActor>;
    readonly findById: (id: LevelId) => Effect.Effect<Level, NotFound, CurrentActor>;
    /**
     * A new, empty level of the asker's: every square `void`, bright, nothing
     * on it. `from` is the accept path's, and only its — see `Notes.create`;
     * an encounter's create passes its own, so a kept Hob encounter's level
     * carries the turn too.
     */
    readonly create: (
      payload: LevelCreate,
      from?: AssistantOrigin,
    ) => Effect.Effect<Level, never, CurrentActor>;
    /**
     * Replaces the whole document under the row's lock and bumps `version`. A
     * `version` that is not the level's is a `Conflict`, and nothing is written.
     */
    readonly save: (
      id: LevelId,
      payload: LevelSave,
    ) => Effect.Effect<Level, NotFound | Conflict, CurrentActor>;
    /**
     * The level and every part of it. Each encounter naming it goes back to
     * the plain grid (`on delete set null`), its placement gone, which each
     * campaign's visit of the level tells on an open night and rings; a fight
     * already started keeps its own copy (`0109_level_fights.ts`), and one
     * holding a visit refuses nothing.
     */
    readonly remove: (id: LevelId) => Effect.Effect<void, NotFound, CurrentActor>;
    /**
     * The encounters naming the level, with their campaigns, by campaign then
     * encounter: what the delete confirmation lists. An encounter may name
     * only its campaign's creator's level, so each is the owner's own.
     */
    readonly uses: (id: LevelId) => Effect.Effect<ReadonlyArray<LevelUse>, NotFound, CurrentActor>;
  }
>()("Levels") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;

      const shelf = SqlSchema.findAll({
        Request: Schema.toType(Actor),
        Result: SummaryRow,
        execute: (actor) => sql`
          select level.id, level.name, level.description, level.columns, level.rows,
                 level.feet_per_cell, level.origin, level.created_at, level.updated_at,
                 (select count(*)::int from level_wall where level_wall.level_id = level.id)
                   as wall_count,
                 (select count(*)::int from level_prop where level_prop.level_id = level.id)
                   as prop_count,
                 (select count(*)::int from level_light where level_light.level_id = level.id)
                   as light_count,
                 (select count(*)::int from level_region where level_region.level_id = level.id)
                   as region_count
          from level
          where ${levelOwned(sql, actor)}
          order by lower(level.name), level.id
        `,
      });
      const header = SqlSchema.findOne({
        Request: OwnedRequest,
        Result: HeaderRow,
        execute: ({ actor, id }) => sql`
          select level.* from level
          where level.id = ${id} and ${levelOwned(sql, actor)}
        `,
      });
      // The parts of a level `header` has just returned to this actor, in the
      // order they were saved. The predicate is named again so no statement
      // here reads a part without it.
      const partsOf = <S extends Schema.Top>(table: string, Result: S) =>
        SqlSchema.findAll({
          Request: OwnedRequest,
          Result,
          execute: ({ actor, id }) => sql`
            select ${sql(table)}.* from ${sql(table)}
            join level on level.id = ${sql(table)}.level_id
            where level.id = ${id} and ${levelOwned(sql, actor)}
            order by ${sql(table)}.ordinal
          `,
        });
      // The encounters pointing at a level `header` has just returned to this
      // actor: the owner key makes each its campaign's creator's, who is them.
      const usedBy = SqlSchema.findAll({
        Request: OwnedRequest,
        Result: UseRow,
        execute: ({ actor, id }) => sql`
          select encounter.id as encounter_id, encounter.name as encounter_name,
                 campaign.id as campaign_id, campaign.name as campaign_name
          from level
          join encounter on encounter.level_id = level.id
            and encounter.level_owner_id = level.account_id
          join campaign on campaign.id = encounter.campaign_id
          where level.id = ${id} and ${levelOwned(sql, actor)}
          order by lower(campaign.name), campaign.id, lower(encounter.name), encounter.id
        `,
      });
      const walls = partsOf("level_wall", WallRow);
      const props = partsOf("level_prop", PropRow);
      const lights = partsOf("level_light", LightRow);
      const regions = partsOf("level_region", RegionRow);

      const read = (id: LevelId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const level = yield* header({ actor, id }).pipe(orNotFound("level", id));
          const request = { actor, id };
          return new Level(
            {
              ...level,
              walls: yield* walls(request),
              props: yield* props(request),
              lights: yield* lights(request),
              regions: yield* regions(request),
            },
            { disableChecks: true },
          );
        });

      /**
       * The document's parts as one JSON parameter per kind, each row with
       * its `ordinal`: a part list runs to thousands, and a region's squares
       * are a ragged array per row, which no typed column array carries.
       */
      const rowsOf = <Part extends object>(parts: ReadonlyArray<Part>) =>
        JSON.stringify(parts.map((part, ordinal) => ({ ...part, ordinal })));

      /** Writes the document's parts beside a level that has none, in its order. */
      const writeParts = (id: LevelId, level: LevelSave) =>
        Effect.gen(function* () {
          const { columns, rows } = level;
          if (level.walls.length > 0) {
            yield* sql`
              insert into level_wall
                (level_id, id, ordinal, board_columns, board_rows,
                 x1, y1, x2, y2, kind, door_state, low)
              select ${id}, part.id, part.ordinal, ${columns}, ${rows},
                     part.x1, part.y1, part.x2, part.y2, part."kind", part."doorState", part.low
              from jsonb_to_recordset(${rowsOf(level.walls)}::jsonb) as part(
                id uuid, ordinal int, x1 float8, y1 float8, x2 float8, y2 float8,
                "kind" text, "doorState" text, low boolean
              )
            `;
          }
          if (level.props.length > 0) {
            yield* sql`
              insert into level_prop
                (level_id, id, ordinal, board_columns, board_rows, kind, x, y, rotation,
                 blocks_movement, blocks_sight, cover, difficult, dm_only)
              select ${id}, part.id, part.ordinal, ${columns}, ${rows},
                     part."kind", part.x, part.y, part.rotation, part."blocksMovement",
                     part."blocksSight", part.cover, part.difficult, part."dmOnly"
              from jsonb_to_recordset(${rowsOf(level.props)}::jsonb) as part(
                id uuid, ordinal int, "kind" text, x int, y int, rotation smallint,
                "blocksMovement" boolean, "blocksSight" boolean, cover text,
                difficult boolean, "dmOnly" boolean
              )
            `;
          }
          if (level.lights.length > 0) {
            yield* sql`
              insert into level_light
                (level_id, id, ordinal, board_columns, board_rows,
                 x, y, bright, dim, tone, flicker, lit)
              select ${id}, part.id, part.ordinal, ${columns}, ${rows},
                     part.x, part.y, part.bright, part.dim, part.tone, part.flicker, part.lit
              from jsonb_to_recordset(${rowsOf(level.lights)}::jsonb) as part(
                id uuid, ordinal int, x float8, y float8, bright int, dim int,
                tone text, flicker boolean, lit boolean
              )
            `;
          }
          if (level.regions.length > 0) {
            yield* sql`
              insert into level_region
                (level_id, id, ordinal, board_columns, board_rows, kind, squares, secret)
              select ${id}, part.id, part.ordinal, ${columns}, ${rows}, part."kind",
                     array(select jsonb_array_elements_text(part.squares)::int), part.secret
              from jsonb_to_recordset(${rowsOf(level.regions)}::jsonb) as part(
                id uuid, ordinal int, "kind" text, squares jsonb, secret boolean
              )
            `;
          }
        });

      return {
        library: dieOnSqlError(Effect.flatMap(CurrentActor, (actor) => shelf(actor))),

        findById: (id) => dieOnSqlError(read(id)),

        create: (payload, from) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const provenance = assistantColumns(from);
                // Every square `void`, built in SQL rather than sent.
                const made = yield* sql<{ readonly id: LevelId }>`
                  insert into level
                    (account_id, name, description, columns, rows, feet_per_cell, floor,
                     origin, assistant_turn_id)
                  values (
                    ${actor.accountId}, ${payload.name.trim()},
                    ${proseColumn(payload.description) ?? null}, ${payload.columns},
                    ${payload.rows}, ${payload.feetPerCell ?? LEVEL_FEET_PER_CELL_DEFAULT},
                    array_fill(0::smallint, array[${payload.columns * payload.rows}::int]),
                    ${(provenance.origin as string | undefined) ?? "authored"},
                    ${(provenance.assistant_turn_id as string | undefined) ?? null}
                  )
                  returning level.id
                `;
                // An insert answers with its row; not reading it back is a defect.
                return yield* read(made[0]!.id).pipe(Effect.orDie);
              }),
            ),
          ),

        save: (id, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const current = yield* sql<{
                  readonly version: number;
                  readonly columns: number;
                  readonly rows: number;
                }>`
                  select level.version, level.columns, level.rows from level
                  where level.id = ${id} and ${levelOwned(sql, actor)}
                  for update
                `;
                if (current.length === 0) return yield* new NotFound({ resource: "level", id });
                if (current[0]!.version !== payload.version) {
                  return yield* new Conflict({
                    message: `the level was saved since version ${String(payload.version)}; it is at version ${String(current[0]!.version)}`,
                  });
                }
                // The parts go first: each carries the board's size through its
                // key, and a resize with a part still standing off the new
                // board would be refused.
                yield* sql`delete from level_wall where level_id = ${id}`;
                yield* sql`delete from level_prop where level_id = ${id}`;
                yield* sql`delete from level_light where level_id = ${id}`;
                yield* sql`delete from level_region where level_id = ${id}`;
                yield* sql`
                  update level set
                    name = ${payload.name.trim()},
                    description = ${proseColumn(payload.description) ?? null},
                    columns = ${payload.columns},
                    rows = ${payload.rows},
                    feet_per_cell = ${payload.feetPerCell},
                    ambient = ${payload.ambient},
                    floor = ${smallintArray(payload.floor)},
                    version = level.version + 1,
                    updated_at = now()
                  where level.id = ${id} and ${levelOwned(sql, actor)}
                `;
                yield* writeParts(id, payload);
                // The one thing outside the level stored as its square
                // numbers, `row * columns + column`: each encounter's trigger
                // area on it (`0115_encounter_placement.ts`). A new width
                // renumbers every square, so each is carried to the same
                // column and row, those now off the board dropped, and an
                // area left with none is none. A placed creature's spot is a
                // column and a row, and a fight's or a visit's copy never
                // resizes, so nothing else follows.
                const was = current[0]!;
                if (was.columns !== payload.columns || was.rows !== payload.rows) {
                  yield* sql`
                    update encounter_prep set
                      trigger_squares = (
                        select array_agg(moved.square order by moved.square)
                        from (
                          select distinct
                                 (square / ${was.columns}) * ${payload.columns}
                                   + square % ${was.columns} as square
                          from unnest(encounter_prep.trigger_squares) square
                          where square % ${was.columns} < ${payload.columns}
                            and square / ${was.columns} < ${payload.rows}
                        ) moved
                      ),
                      updated_at = now()
                    from encounter, level
                    where encounter_prep.encounter_id = encounter.id
                      and encounter.level_id = level.id
                      and encounter.level_owner_id = level.account_id
                      and encounter_prep.trigger_squares is not null
                      and level.id = ${id} and ${levelOwned(sql, actor)}
                  `;
                }
                return yield* read(id).pipe(Effect.orDie);
              }),
            ),
          ),

        // The level goes from each encounter naming it, across the owner's
        // campaigns, and with it each one's placement, which the campaign's
        // visit of the level stops showing (`watchPlacement`, as
        // `Encounters.remove` tells it). The locks are taken in the order
        // every placement write takes them: the encounters (`placementOf`, a
        // fight's start), then the level (`writePlacement`'s and
        // `copyLevel`'s `for share`), then the visits. A fight holding a
        // visit refuses nothing here: it plays on its own copy, and its
        // table is not rung (`watchPlacement` asks `held`).
        remove: (id) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const named = yield* sql<{
                  readonly id: EncounterId;
                  readonly campaign_id: CampaignId;
                  readonly name: string;
                  readonly placed: boolean;
                }>`
                  select encounter.id, encounter.campaign_id, encounter.name,
                         (${placedOnLevel(sql)}) as placed
                  from encounter
                  join level on level.id = encounter.level_id
                    and level.account_id = encounter.level_owner_id
                  where level.id = ${id} and ${levelOwned(sql, actor)}
                  order by encounter.id
                  for no key update of encounter
                `;
                const held = yield* sql<{ readonly id: string }>`
                  select level.id from level
                  where level.id = ${id} and ${levelOwned(sql, actor)}
                  for update
                `;
                if (held.length === 0) return yield* new NotFound({ resource: "level", id });
                // Each encounter naming it goes back to none, so its placed
                // creatures' squares and its trigger area go first, squares
                // of this level (`0113_level_visits.ts`,
                // `0115_encounter_placement.ts`): one encounter at a time,
                // each told while the visit still names the level, which the
                // delete sets null.
                const nights = new Set<SessionId>();
                for (const encounter of named) {
                  const told = yield* watchPlacement(sql, {
                    campaignId: encounter.campaign_id,
                    encounter,
                    levelIds: [id],
                  });
                  yield* sql`
                    delete from encounter_creature_spot
                    using encounter_creature
                    where encounter_creature_spot.encounter_creature_id = encounter_creature.id
                      and encounter_creature.encounter_id = ${encounter.id}
                  `;
                  yield* sql`
                    update encounter_prep set trigger_squares = null
                    where encounter_prep.encounter_id = ${encounter.id}
                      and encounter_prep.trigger_squares is not null
                  `;
                  const night = yield* told(encounter.placed);
                  if (night !== null) nights.add(night);
                }
                // Every part's key cascades from the level. A visit of it
                // keeps its own copy (`on delete set null`).
                yield* sql`delete from level where level.id = ${id} and ${levelOwned(sql, actor)}`;
                return nights;
              }),
            ),
          ).pipe(
            // Each visit's doorbell, once the delete has committed.
            Effect.flatMap((nights) => Effect.forEach(nights, live.touched, { discard: true })),
          ),

        uses: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* header({ actor, id }).pipe(orNotFound("level", id));
              return yield* usedBy({ actor, id });
            }),
          ),
      };
    }),
  ).pipe(Layer.provide(LiveEvents.layer));
}
