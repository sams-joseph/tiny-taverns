import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer, Stream } from "effect";
import { DomainApi } from "@repo/domain";
import { MonstersApi } from "@repo/domain/MonstersApi";
import { TodosApi } from "@repo/domain/TodosApi";
import { MonstersRepository } from "./MonstersRepository.js";
import { TodosRepository } from "./TodosRepository.js";

const TodosApiLive = HttpApiBuilder.group(TodosApi, "todos", (handlers) =>
  Effect.gen(function* () {
    const todos = yield* TodosRepository;
    return (
      handlers
        .handle("getAllTodos", () => todos.findAll())
        // .handle("getTodoById", ({ path: { id } }) => todos.getById(id))
        .handle("createTodo", ({ payload }) => todos.create(payload))
    );
    // .handle("completeTodo", ({ path: { id } }) => todos.complete(id))
    // .handle("removeTodo", ({ path: { id } }) => todos.remove(id));
  }),
);

const MonstersApiLive = HttpApiBuilder.group(
  MonstersApi,
  "monsters",
  (handlers) =>
    Effect.gen(function* () {
      const monsters = yield* MonstersRepository;
      return handlers
        .handle("getAllMonsters", ({ urlParams }) =>
          monsters.findAll(urlParams),
        )
        .handle("createMonster", ({ payload }) => monsters.create(payload));
    }),
);

export const ApiLive = HttpApiBuilder.api(DomainApi).pipe(
  Layer.provide(TodosApiLive),
  Layer.provide(MonstersApiLive),
);
