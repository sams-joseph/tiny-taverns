import { SqlClient, SqlSchema } from "@effect/sql";
import { PostgresClient } from "@repo/adapter-postgres/PostgresClient";
import { Effect, flow, Schema } from "effect";
import { Character, CreateCharacterPayload } from "@repo/domain";

export class CharactersRepository extends Effect.Service<CharactersRepository>()(
  "api/CharactersRepository",
  {
    dependencies: [PostgresClient],
    effect: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const findAll = SqlSchema.findAll({
        Result: Character,
        Request: Schema.Struct({
          search: Schema.optional(Schema.NonEmptyTrimmedString),
        }),
        execute: (request) => sql`
          SELECT
            *
          FROM
            characters
          WHERE
            (${"search" in request && request.search ? sql`name ILIKE '%' || ${request.search} || '%'` : sql`TRUE`})
        `,
      });

      const create = SqlSchema.single({
        Result: Character,
        Request: CreateCharacterPayload,
        execute: (request) => sql`
          INSERT INTO
            characters ${sql.insert(request)}
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
