import { PgContainer } from "./lib/test-utils/pg-container.js";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { MonstersRepository } from "./MonstersRepository.js";

const layer = MonstersRepository.DefaultWithoutDependencies.pipe(
  Layer.provide(PgContainer.Live),
);

const baseMonster = {
  name: "test-monster",
  size: "medium",
  kind: "beast",
  subtype: "test-subtype",
  alignment: "neutral",
  ac: 12,
  hpAvg: 8,
  hpFormula: "1d8",
  str: 10,
  dex: 12,
  con: 10,
  int: 6,
  wis: 10,
  cha: 8,
  cr: 18,
  xp: 50,
  proficiencyBonus: 2,
  passivePerception: 10,
  languages: "none",
  senses: "darkvision 60 ft.",
  source: "test-source",
} as const;

it.layer(layer, { timeout: "30 seconds" })("MonstersRepository", (it) => {
  it.effect(
    "should create a monster",
    Effect.fnUntraced(function* () {
      const repo = yield* MonstersRepository;
      const monster = yield* repo.create(baseMonster);

      expect(monster).toBeDefined();
      expect(monster.name).toBe("test-monster");
      expect(monster.kind).toBe("beast");
    }),
  );

  it.effect(
    "should find all monsters",
    Effect.fnUntraced(function* () {
      const repo = yield* MonstersRepository;
      const createdMonster = yield* repo.create({
        ...baseMonster,
        name: "test-monster-find",
      });

      const monsters = yield* repo.findAll({});

      expect(monsters.length).toBeGreaterThan(0);
      expect(monsters).toContainEqual(createdMonster);
    }),
  );
});
