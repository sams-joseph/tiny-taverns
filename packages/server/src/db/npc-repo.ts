import * as Campaign from "@app/domain/api/campaign-rpc";
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
import { makeWhereBuilder } from "./where-builder.js";

export class NpcRepo extends Context.Service<NpcRepo>()("NpcRepo", {
  make: Effect.gen(function*() {
    const sql = yield* SqlClient;

    const insertQuery = SqlSchema.findOne({
      Request: NpcModel.insert,
      Result: NpcModel,
      execute: (req) => sql`INSERT INTO npcs ${sql.insert(req).returning("*")}`,
    });

    const findByIdQuery = SqlSchema.findOneOption({
      Request: Schema.Struct({
        npcId: Npc.NpcId,
        userId: Schema.String,
        campaignId: Campaign.CampaignId,
      }),
      Result: NpcModel,
      execute: ({ npcId, userId, campaignId }) =>
        sql`
        SELECT * FROM npcs
        WHERE id = ${npcId} AND user_id = ${userId} AND campaign_id = ${campaignId}
      `,
    });

    const PAGE_SIZE = 50;

    const whereClause = makeWhereBuilder(sql, {
      userId_equals: (userId: string) => sql`user_id = ${userId}`,
      campaignId_equals: (campaignId: Campaign.CampaignId) => sql`campaign_id = ${campaignId}`,
    });

    const fetchQuery = SqlSchema.findAll({
      Request: Schema.Struct({
        userId: Schema.String,
        campaignId: Campaign.CampaignId,
        cursor: Schema.NullOr(Schema.DateTimeUtcFromString),
      }),
      Result: NpcModel,
      execute: ({ userId, campaignId, cursor }) =>
        sql`
        SELECT * FROM npcs
        ${
          whereClause({
            and: [
              { userId_equals: userId },
              { campaignId_equals: campaignId as Campaign.CampaignId },
            ],
          })
        }
          ${cursor !== null ? sql`AND updated_at < ${cursor}` : sql``}
        ORDER BY updated_at DESC
        LIMIT ${PAGE_SIZE + 1}
      `,
    });

    return {
      insert: (req: typeof NpcModel.insert.Type) =>
        insertQuery(req).pipe(
          Effect.catchTags({
            SchemaError: Effect.die,
            SqlError: Effect.die,
            NoSuchElementError: Effect.die,
          }),
        ),

      findById: (npcId: Npc.NpcId, userId: string, campaignId: Campaign.CampaignId) =>
        findByIdQuery({ npcId, userId, campaignId }).pipe(
          Effect.catchTags({
            SchemaError: Effect.die,
            SqlError: Effect.die,
          }),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new Npc.NpcNotFoundError({ id: npcId })),
              onSome: Effect.succeed,
            }),
          ),
        ),

      fetch: (
        userId: string,
        campaignId: Campaign.CampaignId,
        cursor: Option.Option<DateTime.Utc>,
      ) =>
        fetchQuery({
          userId,
          campaignId,
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
