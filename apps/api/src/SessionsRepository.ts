import { SqlClient, SqlSchema } from "@effect/sql";
import { PostgresClient } from "@repo/adapter-postgres/PostgresClient";
import { Effect, flow, Schema } from "effect";
import {
  Session,
  SessionId,
  CreateSessionPayload,
  SessionNote,
} from "@repo/domain";

export class SessionsRepository extends Effect.Service<SessionsRepository>()(
  "api/SessionsRepository",
  {
    dependencies: [PostgresClient],
    effect: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const findAll = SqlSchema.findAll({
        Result: Session,
        Request: Schema.Struct({}),
        execute: () => sql`
          SELECT
            *
          FROM
            sessions
          ORDER BY
            created_at DESC
        `,
      });

      const findById = SqlSchema.single({
        Result: Session,
        Request: Schema.Struct({ id: SessionId }),
        execute: (request) => sql`
          SELECT
            *
          FROM
            sessions
          WHERE
            id = ${request.id}
        `,
      });

      const create = SqlSchema.single({
        Result: Session,
        Request: CreateSessionPayload,
        execute: (request) => sql`
          INSERT INTO
            sessions ${sql.insert(request)}
          RETURNING
            *
        `,
      });

      const addNote = SqlSchema.single({
        Result: Session,
        Request: Schema.Struct({
          sessionId: SessionId,
          note: SessionNote,
        }),
        execute: (request) => sql`
          UPDATE
            sessions
          SET
            notes = notes || ${JSON.stringify([request.note])}::jsonb,
            updated_at = NOW()
          WHERE
            id = ${request.sessionId}
          RETURNING
            *
        `,
      });

      return {
        findAll: () =>
          findAll({}).pipe(
            Effect.catchTags({
              ParseError: Effect.die,
              SqlError: Effect.die,
            }),
          ),
        findById: flow(findById, Effect.orDie),
        create: flow(create, Effect.orDie),
        addNote: (sessionId: SessionId, note: SessionNote) =>
          addNote({ sessionId, note }).pipe(Effect.orDie),
      } as const;
    }),
  },
) {}
