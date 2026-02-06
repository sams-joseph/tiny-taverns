import { SqlClient, SqlSchema } from "@effect/sql";
import { Todo, TodoId, TodoNotFound } from "@repo/domain/TodosApi";
import { PostgresClient } from "@repo/adapter-postgres/PostgresClient";
import { Effect, flow, Schema } from "effect";

const CreateTodoInput = Todo.pipe(Schema.pick("text"));

export class TodosRepository extends Effect.Service<TodosRepository>()(
  "api/TodosRepository",
  {
    dependencies: [PostgresClient],
    effect: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const findAll = SqlSchema.findAll({
        Result: Todo,
        Request: Schema.Void,
        execute: () => sql`
        SELECT
          *
        FROM
          todos
      `,
      });

      const create = SqlSchema.single({
        Result: Todo,
        Request: CreateTodoInput,
        execute: (request) => sql`
        INSERT INTO
          todos ${sql.insert({ ...request, done: false })}
        RETURNING
          *
      `,
      });

      return {
        findAll: flow(findAll, Effect.orDie),
        create: flow(create, Effect.orDie),
      } as const;
    }),
  },
) {}
