import { PgContainer } from "./lib/test-utils/pg-container.js";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CharactersRepository } from "./CharactersRepository.js";

const layer = CharactersRepository.DefaultWithoutDependencies.pipe(
  Layer.provide(PgContainer.Live),
);

it.layer(layer, { timeout: "30 seconds" })("CharactersRepository", (it) => {
  it.effect(
    "should create a character",
    Effect.fnUntraced(function* () {
      const repo = yield* CharactersRepository;
      const newCharacter = yield* repo.create({
        name: "test-create",
        kind: "npc",
        npcMetadata: {
          role: "test-role",
          location: "test-location",
          voice: "test-voice",
          constraints: ["test-constraints"],
        },
      });

      expect(newCharacter).toBeDefined();
      expect(newCharacter.name).toBe("test-create");
    }),
  );

  it.effect(
    "should find all characters",
    Effect.fnUntraced(function* () {
      const repo = yield* CharactersRepository;
      const createdCharacter = yield* repo.create({
        name: "test-create",
        kind: "npc",
        npcMetadata: {
          role: "test-role",
          location: "test-location",
          voice: "test-voice",
          constraints: ["test-constraints"],
        },
      });

      const characters = yield* repo.findAll({});

      expect(characters.length).toBeGreaterThan(0);
      expect(characters).toContainEqual(createdCharacter);
    }),
  );
});
