import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

export const TodoId = Schema.UUID.pipe(Schema.brand("TodoId"));
export type TodoId = typeof TodoId.Type;

export const TodoIdFromString = Schema.UUID.pipe(Schema.compose(TodoId));

export class Todo extends Schema.Class<Todo>("Todo")({
  id: TodoId,
  text: Schema.NonEmptyTrimmedString,
  done: Schema.Boolean,
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
}) {}

export class TodoNotFound extends Schema.TaggedError<TodoNotFound>()(
  "TodoNotFound",
  {
    id: TodoId,
  },
) {}

export class TodosApiGroup extends HttpApiGroup.make("todos")
  .add(
    HttpApiEndpoint.get("getAllTodos", "/todos").addSuccess(Schema.Array(Todo)),
  )
  .add(
    HttpApiEndpoint.post("createTodo", "/todos")
      .addSuccess(Todo)
      .setPayload(Schema.Struct({ text: Schema.NonEmptyTrimmedString })),
    // ),
    //   )
    //   .add(
    //     HttpApiEndpoint.get("getTodoById", "/todos/:id")
    //       .addSuccess(Todo)
    //       .addError(TodoNotFound, { status: 404 })
    //       .setPath(Schema.Struct({ id: TodoIdFromString })),
    //   )
    //   .add(
    //     HttpApiEndpoint.patch("completeTodo", "/todos/:id")
    //       .addSuccess(Todo)
    //       .addError(TodoNotFound, { status: 404 })
    //       .setPath(Schema.Struct({ id: TodoIdFromString })),
    //   )
    //   .add(
    //     HttpApiEndpoint.del("removeTodo", "/todos/:id")
    //       .addSuccess(Schema.Void)
    //       .addError(TodoNotFound, { status: 404 })
    //       .setPath(Schema.Struct({ id: TodoIdFromString })),
  ) {}

export class TodosApi extends HttpApi.make("api").add(TodosApiGroup) {}
