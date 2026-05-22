import * as Npc from "@app/domain/api/npc-rpc";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { SqlSchema } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { NpcModel } from "./npc-model.js";
import { PgLive } from "./pg-live.js";

export class NpcRepo extends Context.Service<
  NpcRepo,
  {
    readonly create: (args: {
      readonly userId: string;
      readonly title: string;
    }) => Effect.Effect<typeof NpcModel.Type>;
    readonly findById: (
      npcId: Npc.NpcId,
      userId: string,
    ) => Effect.Effect<typeof NpcModel.Type, Npc.NpcNotFoundError>;
    readonly listByUser: (
      userId: string,
      cursor: Option.Option<DateTime.Utc>,
    ) => Effect.Effect<{
      items: ReadonlyArray<typeof NpcModel.Type>;
      hasMore: boolean;
    }>;
    readonly delete: (
      NpcId: Npc.NpcId,
      userId: string,
    ) => Effect.Effect<void, Npc.NpcNotFoundError>;
  }
>()("NpcRepo", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient;

    const insertQuery = SqlSchema.findOne({
      Request: NpcModel.insert,
      Result: NpcModel,
      execute: (req) => sql`INSERT INTO npcs ${sql.insert(req).returning("*")}`,
    });

    const findByIdQuery = SqlSchema.findOneOption({
      Request: Schema.Struct({ NpcId: Npc.NpcId, userId: Schema.String }),
      Result: NpcModel,
      execute: ({ NpcId, userId }) =>
        sql`
        SELECT * FROM npcs
        WHERE id = ${NpcId} AND user_id = ${userId}
      `,
    });

    const PAGE_SIZE = 50;

    const listQuery = SqlSchema.findAll({
      Request: Schema.Struct({
        userId: Schema.String,
        cursor: Schema.NullOr(Schema.DateTimeUtcFromString),
      }),
      Result: NpcModel,
      execute: ({ userId, cursor }) =>
        sql`
        SELECT * FROM npcs
        WHERE user_id = ${userId}
          ${cursor !== null ? sql`AND updated_at < ${cursor}` : sql``}
        ORDER BY updated_at DESC
        LIMIT ${PAGE_SIZE + 1}
      `,
    });

    const deleteQuery = SqlSchema.findOneOption({
      Request: Schema.Struct({ NpcId: Npc.NpcId, userId: Schema.String }),
      Result: Schema.Struct({ id: Npc.NpcId }),
      execute: ({ NpcId, userId }) =>
        sql`
        DELETE FROM npcs
        WHERE id = ${NpcId} AND user_id = ${userId}
        RETURNING id
      `,
    });

    return {
      create: ({ userId, title }) =>
        insertQuery(
          NpcModel.insert.make({
            userId,
            title,
          }),
        ).pipe(
          Effect.catchTags({
            SchemaError: Effect.die,
            SqlError: Effect.die,
            NoSuchElementError: Effect.die,
          }),
        ),

      findById: (NpcId, userId) =>
        findByIdQuery({ NpcId, userId }).pipe(
          Effect.catchTags({
            SchemaError: Effect.die,
            SqlError: Effect.die,
          }),
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(new Npc.NpcNotFoundError({ id: NpcId })),
              onSome: Effect.succeed,
            }),
          ),
        ),

      listByUser: (userId, cursor) =>
        listQuery({
          userId,
          cursor: Option.getOrNull(cursor),
        }).pipe(
          Effect.catchTags({
            SchemaError: Effect.die,
            SqlError: Effect.die,
          }),
          Effect.map((rows) => ({
            items: rows.slice(0, PAGE_SIZE),
            hasMore: rows.length > PAGE_SIZE,
          })),
        ),

      delete: (NpcId, userId) =>
        deleteQuery({ NpcId, userId }).pipe(
          Effect.catchTags({
            SchemaError: Effect.die,
            SqlError: Effect.die,
          }),
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(new Npc.NpcNotFoundError({ id: NpcId })),
              onSome: () => Effect.void,
            }),
          ),
        ),
    };
  }),
}) {
  static layer: Layer.Layer<NpcRepo> = Layer.effect(this, this.make).pipe(
    Layer.provide(PgLive),
  );
}
