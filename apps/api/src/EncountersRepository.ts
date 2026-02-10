import { SqlClient, SqlSchema } from "@effect/sql";
import { PostgresClient } from "@repo/adapter-postgres/PostgresClient";
import { Effect, flow, Schema } from "effect";
import { CreateEncounterPayload, Encounter } from "@repo/domain";

export class EncountersRepository extends Effect.Service<EncountersRepository>()(
  "api/EncountersRepository",
  {
    dependencies: [PostgresClient],
    effect: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const findAll = SqlSchema.findAll({
        Result: Encounter,
        Request: Schema.Struct({
          search: Schema.optional(Schema.NonEmptyTrimmedString),
        }),
        execute: (request) => sql`
          SELECT
            *
          FROM
            encounters
          WHERE
            (${"search" in request && request.search ? sql`name ILIKE '%' || ${request.search} || '%'` : sql`TRUE`})
        `,
      });

      const create = SqlSchema.single({
        Result: Encounter,
        Request: CreateEncounterPayload,
        execute: (request) => sql`
          INSERT INTO
            encounters ${sql.insert(request)}
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
