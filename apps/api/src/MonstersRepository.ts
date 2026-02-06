import { SqlClient, SqlSchema } from "@effect/sql";
import { Monster } from "@repo/domain/MonstersApi";
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
        Request: Schema.Void,
        execute: () => sql`
          SELECT
            *
          FROM
            monsters
        `,
      });

      return {
        findAll: flow(findAll, Effect.orDie),
      } as const;
    }),
  },
) {}
