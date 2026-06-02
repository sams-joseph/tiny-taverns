import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { SqlModel, SqlSchema } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { CampaignModel } from "./campaign-model.js";
import { PgLive } from "./pg-live.js";

export class CampaignRepo extends Context.Service<CampaignRepo>()(
  "CampaignRepo",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      const repo = yield* SqlModel.makeRepository(CampaignModel, {
        tableName: "campaigns",
        spanPrefix: "CampaignRepo",
        idColumn: "id",
      });

      const PAGE_SIZE = 50;

      const listQuery = SqlSchema.findAll({
        Request: Schema.Struct({
          userId: Schema.String,
          cursor: Schema.NullOr(Schema.DateTimeUtcFromString),
        }),
        Result: CampaignModel,
        execute: ({ userId, cursor }) =>
          sql`
        SELECT * FROM campaigns
        WHERE user_id = ${userId}
          ${cursor !== null ? sql`AND updated_at < ${cursor}` : sql``}
        ORDER BY updated_at DESC
        LIMIT ${PAGE_SIZE + 1}
      `,
      });

      return {
        ...repo,

        fetch: (userId: string, cursor: Option.Option<DateTime.Utc>) =>
          listQuery({ userId, cursor: Option.getOrNull(cursor) }).pipe(
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
  },
) {
  static layer: Layer.Layer<CampaignRepo> = Layer.effect(this, this.make).pipe(
    Layer.provide(PgLive),
  );
}
