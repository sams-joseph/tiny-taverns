import { describe, expect } from "@effect/vitest";
import {
  type Ability,
  asBackgroundOption,
  asClassOption,
  asRaceOption,
  type ClassOption,
  CurrentActor,
  levelGrantsFor,
  optionNamed,
  type RaceOption,
  startingSheetBody,
  subraceNamed,
  withLevel,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { Accounts } from "../src/Accounts.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Options } from "../src/repo/Options.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { anAccount } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Creation and a level change are one rule.** For every class the 2014
 * import brings, at every level from 1 to 20, a sheet composed at level 1 and
 * moved to N by `withLevel` is the sheet composed at N, and moving it back
 * down is the sheet composed at 1. Over the real imported corpus, hydrated the
 * way the create form and Hob read it, so a class table, a subclass or an
 * overlay entry the two paths read differently fails here first.
 *
 * Whole bodies are compared, not a chosen half: the hit points are not on the
 * body, the scores do not move with level, and every pick is empty on both
 * sides, so everything left is the derived half.
 */
const services = Layer.mergeAll(Accounts.layer, Options.layer).pipe(
  Layer.provideMerge(migratedDatabase("taverns_test_level_grants")),
);

const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment();
  yield* importSystemOptions();
  const reader = yield* anAccount("Odile");
  const options = yield* Effect.provideService(
    Effect.flatMap(Options, (service) => service.core({})),
    CurrentActor,
    reader,
  );
  return { options };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "level-grants.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

/** The standard array, in the order the cells are drawn. */
const ABILITIES: ReadonlyArray<Ability> = (["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const).map(
  (label, index) => {
    const score = [15, 14, 13, 12, 10, 8][index]!;
    const modifier = Math.floor((score - 10) / 2);
    return {
      label,
      score: String(score),
      modifier: modifier < 0 ? String(modifier) : `+${String(modifier)}`,
    };
  },
);

/** Races whose overlay lines scale with level, and one with none, taken in turn. */
const RACES = [
  { race: "Dragonborn", subrace: undefined },
  { race: "Half-Orc", subrace: undefined },
  { race: "Dwarf", subrace: "Hill Dwarf" },
] as const;

describeLayer(
  "level-grants",
  shared,
  (it) => {
    describe("composing at N and moving from 1 to N", () => {
      it.effect("agree for every imported class, subclass and level", () =>
        Effect.gen(function* () {
          const { options } = yield* Fixture;
          const classes = options.flatMap((option) => asClassOption(option) ?? []);
          expect(classes.map((option) => option.name).sort()).toEqual([
            "Barbarian",
            "Bard",
            "Cleric",
            "Druid",
            "Fighter",
            "Monk",
            "Paladin",
            "Ranger",
            "Rogue",
            "Sorcerer",
            "Warlock",
            "Wizard",
          ]);
          const background = asBackgroundOption(optionNamed(options, "background", "Acolyte"));
          expect(background).toBeDefined();

          classes.forEach((classOption: ClassOption, index) => {
            const { race, subrace } = RACES[index % RACES.length]!;
            const raceOption: RaceOption | undefined = asRaceOption(
              optionNamed(options, "race", race),
            );
            expect(raceOption).toBeDefined();
            const subclass = classOption.details?.subclasses?.[0]?.name;
            expect(subclass).toBeDefined();
            const composed = (level: number) =>
              startingSheetBody({
                classOption,
                raceOption,
                subrace,
                backgroundOption: background,
                background: background?.name,
                subclass,
                abilities: ABILITIES,
                level,
              }).body;
            const one = composed(1);
            const grants = (level: number) =>
              levelGrantsFor({
                classOption,
                raceOption,
                subraceName: subraceNamed(raceOption?.body, subrace)?.name,
                subclass,
                abilities: one.abilities,
                level,
              });
            const equipment = classOption.details?.equipment;

            for (let level = 1; level <= 20; level += 1) {
              const at = composed(level);
              const up = withLevel(one, { from: grants(1), to: grants(level), equipment });
              expect(
                up,
                `${classOption.name} (${subclass ?? "no subclass"}) moved from 1 to ${String(level)}`,
              ).toEqual(at);
              const down = withLevel(at, { from: grants(level), to: grants(1), equipment });
              expect(
                down,
                `${classOption.name} (${subclass ?? "no subclass"}) moved from ${String(level)} to 1`,
              ).toEqual(one);
            }

            // The subclass the identity names is granted, every feature by level 20.
            const twenty = composed(20);
            for (const feature of classOption.details?.subclasses?.[0]?.features ?? []) {
              expect(twenty.traits).toContainEqual(
                expect.objectContaining({ featureId: feature.id, derived: true }),
              );
            }
          });
        }),
      );
    });
  },
  { timeout: "120 seconds" },
);
