import { SqlClient, SqlSchema } from "@effect/sql";
import { PostgresClient } from "@repo/adapter-postgres/PostgresClient";
import { Effect, flow, Schema } from "effect";
import { CreateUserPayload, User } from "@repo/domain/UsersApi";

export class UsersRepository extends Effect.Service<UsersRepository>()(
  "api/UsersRepository",
  {
    dependencies: [PostgresClient],
    effect: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const findAll = SqlSchema.findAll({
        Result: User,
        Request: Schema.Struct({
          search: Schema.optional(Schema.NonEmptyTrimmedString),
        }),
        execute: (request) => sql`
          SELECT
            *
          FROM
            users
          WHERE
            (${"search" in request && request.search ? sql`name ILIKE '%' || ${request.search} || '%'` : sql`TRUE`})
        `,
      });

      const create = SqlSchema.single({
        Result: User,
        Request: CreateUserPayload,
        execute: (request) => sql`
          INSERT INTO
            users ${sql.insert(request)}
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
