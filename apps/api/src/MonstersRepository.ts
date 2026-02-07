import { SqlClient, SqlSchema } from "@effect/sql";
import { Monster, CreateMonsterPayload } from "@repo/domain/MonstersApi";
import { PostgresClient } from "@repo/adapter-postgres/PostgresClient";
import { Effect, flow, Schema } from "effect";

export class MonstersRepository extends Effect.Service<MonstersRepository>()(
  "api/MonstersRepository",
  {
    dependencies: [PostgresClient],
    effect: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const findAll = SqlSchema.findAll({
        Result: Monster,
        Request: Schema.Struct({
          search: Schema.optional(Schema.NonEmptyTrimmedString),
        }),
        execute: (request) => sql`
          SELECT
            *
          FROM
            monsters
          WHERE
            (${"search" in request && request.search ? sql`name ILIKE '%' || ${request.search} || '%'` : sql`TRUE`})
        `,
      });

      const create = SqlSchema.single({
        Result: Monster,
        Request: CreateMonsterPayload,
        execute: (request) => sql`
          INSERT INTO
            monsters ${sql.insert(request)}
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
