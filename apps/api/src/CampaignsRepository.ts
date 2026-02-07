import { SqlClient, SqlSchema } from "@effect/sql";
import { PostgresClient } from "@repo/adapter-postgres/PostgresClient";
import { Effect, flow, Schema } from "effect";
import { Campaign, CreateCampaignPayload } from "@repo/domain";

export class CampaignsRepository extends Effect.Service<CampaignsRepository>()(
  "api/CampaignsRepository",
  {
    dependencies: [PostgresClient],
    effect: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const findAll = SqlSchema.findAll({
        Result: Campaign,
        Request: Schema.Struct({
          search: Schema.optional(Schema.NonEmptyTrimmedString),
        }),
        execute: (request) => sql`
          SELECT
            *
          FROM
            campaigns
          WHERE
            (${"search" in request && request.search ? sql`name ILIKE '%' || ${request.search} || '%'` : sql`TRUE`})
        `,
      });

      const create = SqlSchema.single({
        Result: Campaign,
        Request: CreateCampaignPayload,
        execute: (request) => sql`
          INSERT INTO
            campaigns ${sql.insert(request)}
          RETURNING
            *
        `,
      });

      return {
        findAll: (queryParams: { search?: string | undefined }) =>
          findAll(queryParams).pipe(
            Effect.catchTags({
              ParseError: Effect.die,
              SqlError: Effect.die,
            }),
          ),
        create: flow(create, Effect.orDie),
      } as const;
    }),
  },
) {}
