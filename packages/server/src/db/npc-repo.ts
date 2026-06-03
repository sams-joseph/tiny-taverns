import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { SqlModel, SqlSchema } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { NpcModel } from "./npc-model.js";
import { PgLive } from "./pg-live.js";
import { makeWhereBuilder } from "./where-builder.js";

export class NpcRepo extends Context.Service<NpcRepo>()("NpcRepo", {
  make: Effect.gen(function*() {
    const sql = yield* SqlClient;

    const repo = yield* SqlModel.makeRepository(NpcModel, {
      tableName: "npcs",
      spanPrefix: "NpcRepo",
      idColumn: "id",
    });

    const PAGE_SIZE = 50;

    const whereClause = makeWhereBuilder(sql, {
      userId_equals: (userId: string) => sql`user_id = ${userId}`,
    });

    const fetchQuery = SqlSchema.findAll({
      Request: Schema.Struct({
        userId: Schema.String,
        cursor: Schema.NullOr(Schema.DateTimeUtcFromString),
      }),
      Result: NpcModel,
      execute: ({ userId, cursor }) =>
        sql`
        SELECT * FROM npcs
        ${whereClause({ userId_equals: userId })}
          ${cursor !== null ? sql`AND updated_at < ${cursor}` : sql``}
        ORDER BY updated_at DESC
        LIMIT ${PAGE_SIZE + 1}
      `,
    });

    return {
      ...repo,

      fetch: (userId: string, cursor: Option.Option<DateTime.Utc>) =>
        fetchQuery({
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
    };
  }),
}) {
  static layer: Layer.Layer<NpcRepo> = Layer.effect(this, this.make).pipe(
    Layer.provide(PgLive),
  );
}
