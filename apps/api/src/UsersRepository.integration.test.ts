import { PgContainer } from "./lib/test-utils/pg-container.js";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { UsersRepository } from "./UsersRepository.js";

const layer = UsersRepository.DefaultWithoutDependencies.pipe(
  Layer.provide(PgContainer.Live),
);

it.layer(layer, { timeout: "30 seconds" })("UsersRepository", (it) => {
  it.effect(
    "should create a user",
    Effect.fnUntraced(function* () {
      const repo = yield* UsersRepository;
      const user = yield* repo.create({
        name: "test-user",
      });

      expect(user).toBeDefined();
      expect(user.name).toBe("test-user");
    }),
  );

  it.effect(
    "should find all users",
    Effect.fnUntraced(function* () {
      const repo = yield* UsersRepository;
      const createdUser = yield* repo.create({
        name: "test-user-find",
      });

      const users = yield* repo.findAll({});

      expect(users.length).toBeGreaterThan(0);
      expect(users).toContainEqual(createdUser);
    }),
  );
});
