import * as Campaign from "@app/domain/api/campaign-rpc";
import * as Chat from "@app/domain/api/chat-rpc";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { SqlSchema } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { CampaignModel } from "./campaign-model.js";
import { PgLive } from "./pg-live.js";

export class CampaignRepo extends Context.Service<CampaignRepo, {
  readonly create: (args: {
    readonly userId: string;
    readonly title: string;
    readonly defaultChatId: Chat.ChatId;
  }) => Effect.Effect<typeof CampaignModel.Type>;
  readonly findById: (
    campaignId: Campaign.CampaignId,
    userId: string,
  ) => Effect.Effect<typeof CampaignModel.Type, Campaign.CampaignNotFoundError>;
  readonly listByUser: (
    userId: string,
    cursor: Option.Option<DateTime.Utc>,
  ) => Effect.Effect<{ items: ReadonlyArray<typeof CampaignModel.Type>; hasMore: boolean; }>;
}>()("CampaignRepo", {
  make: Effect.gen(function*() {
    const sql = yield* SqlClient;

    const insertQuery = SqlSchema.findOne({
      Request: CampaignModel.insert,
      Result: CampaignModel,
      execute: (req) => sql`INSERT INTO campaigns ${sql.insert(req).returning("*")}`,
    });

    const findByIdQuery = SqlSchema.findOneOption({
      Request: Schema.Struct({ campaignId: Campaign.CampaignId, userId: Schema.String }),
      Result: CampaignModel,
      execute: ({ campaignId, userId }) =>
        sql`
        SELECT * FROM campaigns
        WHERE id = ${campaignId} AND user_id = ${userId}
      `,
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
      create: ({ userId, title, defaultChatId }) =>
        insertQuery(CampaignModel.insert.make({ userId, title, defaultChatId })).pipe(
          Effect.catchTags({
            SchemaError: Effect.die,
            SqlError: Effect.die,
            NoSuchElementError: Effect.die,
          }),
        ),

      findById: (campaignId, userId) =>
        findByIdQuery({ campaignId, userId }).pipe(
          Effect.catchTags({
            SchemaError: Effect.die,
            SqlError: Effect.die,
          }),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new Campaign.CampaignNotFoundError({ id: campaignId })),
              onSome: Effect.succeed,
            }),
          ),
        ),

      listByUser: (userId, cursor) =>
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
}) {
  static layer: Layer.Layer<CampaignRepo> = Layer.effect(this, this.make).pipe(
    Layer.provide(PgLive),
  );
}
