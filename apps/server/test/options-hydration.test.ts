import { describe, expect } from "@effect/vitest";
import { Actor, type CharacterOption, CurrentActor, type OptionVocabulary } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { Statement } from "effect/unstable/sql";
import { Accounts } from "../src/Accounts.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Options } from "../src/repo/Options.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { aCampaignBy, anAccount, aPlayerAt } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

/**
 * **An option list costs the same number of statements whatever its length.**
 *
 * `Options` hydrates every row's `details` from a dozen child tables, and it
 * used to do that one option at a time: sixteen statements per option, 354 for
 * the bundle's 22, on the read the create form's pickers make and the one every
 * player-panel and account-panel Hob turn makes before it starts. The set-based
 * reader (`optionDetailsReader`) reads each child table once for every id.
 *
 * Two things are pinned here, and neither is visible in a response:
 *
 *   1. **The count does not grow with the list.** Measured with
 *      `Statement.CurrentTransformer`, which sees every statement the effect
 *      puts on the wire and nothing any other fiber does.
 *   2. **Reading many at once answers what reading each alone does.** Filing
 *      children under their parent in JS is where a set-based read can go wrong
 *      — a choice group attached through a racial trait belongs to every option
 *      carrying that trait — so every option in the list is compared with the
 *      same option read on its own.
 */
const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  CampaignCreatorActors.layer,
  Groups.layer,
  Invites.layer,
  Options.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_options_hydration")));

const as =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/** What `effect` answers, and the text of every statement it ran to answer it. */
const counted = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const statements: Array<string> = [];
    const value = yield* Effect.provideService(effect, Statement.CurrentTransformer, (statement) =>
      Effect.sync(() => {
        statements.push(statement.compile()[0]);
        return statement;
      }),
    );
    return { value, statements };
  });

/**
 * The bundle, a creator whose Library adds a homebrew race, and a player at
 * the creator's table.
 *
 * The homebrew race attaches the bundle's *Extra Language* trait — the Elf's,
 * and the one racial trait with a choice group of the language kind — so that
 * trait's group is offered by two options in one list. It also carries choice
 * groups of its own, one per kind of member the reader files by group.
 */
const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment();
  yield* importSystemOptions();
  const options = yield* Options;

  const dm = yield* anAccount("Jo");
  const campaign = yield* aCampaignBy(dm, { name: "The Salt Road", visibility: "shared" });
  const player = yield* aPlayerAt(campaign.id, "Pim");

  const vocabulary: OptionVocabulary = yield* as(dm)(options.libraryVocabulary());
  const named = <T extends { readonly name: string }>(rows: ReadonlyArray<T>, name: string) =>
    rows.find((row) => row.name === name)!;
  const homebrew = yield* as(dm)(
    options.libraryCreate({
      kind: "race",
      name: "Tidewalker",
      body: {
        speed: 30,
        size: "Medium",
        abilityBonuses: [{ ability: "WIS", amount: 2 }],
        hpPerLevel: 0,
        traits: [],
        subraces: [],
      },
      relations: {
        languageIds: [named(vocabulary.languages, "Common").id],
        traitIds: [named(vocabulary.traits, "Extra Language").id],
        choices: [
          {
            kind: "ability-score",
            choose: 1,
            abilityBonuses: [{ abilityScoreId: named(vocabulary.abilities, "CON").id, amount: 1 }],
          },
          { kind: "language", choose: 1, languageIds: [named(vocabulary.languages, "Elvish").id] },
          {
            kind: "proficiency",
            choose: 1,
            proficiencyIds: [named(vocabulary.proficiencies, "Skill: Athletics").id],
          },
          { kind: "trait", choose: 1, traitIds: [named(vocabulary.traits, "Darkvision").id] },
        ],
      },
    }),
  );
  return { dm, player, campaign, homebrew };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "options-hydration.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

describeLayer("options-hydration", shared, (it) => {
  describe("an option list", () => {
    it.effect("runs the same statements for one option as for every option", () =>
      Effect.gen(function* () {
        const { dm, player, campaign } = yield* Fixture;
        const [core, library, creator, seated] = yield* Effect.gen(function* () {
          const options = yield* Options;
          const sizes = <A, E, R>(read: (kind?: "background") => Effect.Effect<A, E, R>) =>
            Effect.all([counted(read("background")), counted(read())]);
          return [
            yield* as(dm)(sizes((kind) => options.core(kind === undefined ? {} : { kind }))),
            yield* as(dm)(sizes((kind) => options.library(kind === undefined ? {} : { kind }))),
            yield* as(dm)(
              sizes((kind) => options.list(campaign.id, kind === undefined ? {} : { kind })),
            ),
            yield* as(player)(
              sizes((kind) => options.list(campaign.id, kind === undefined ? {} : { kind })),
            ),
          ] as const;
        });

        for (const [one, all] of [core, library, creator, seated]) {
          expect(one.value).toHaveLength(1);
          expect(all.value.length).toBeGreaterThanOrEqual(22);
          // The text differs — the kind filter, and one arm per kit category in
          // the equipment read — but not how many round trips it takes.
          expect(all.statements).toHaveLength(one.statements.length);
        }
        // One read of the rows and fifteen of their children: eleven keyed by
        // option, four by choice group — and, for a campaign's list, the gate that
        // makes an unreachable campaign a 404 rather than an empty picker.
        expect(core[1].statements).toHaveLength(1 + 15);
        expect(library[1].statements).toHaveLength(1 + 15);
        expect(creator[1].statements).toHaveLength(2 + 15);
        expect(seated[1].statements).toHaveLength(2 + 15);
      }),
    );

    it.effect("answers for each option what reading that option alone does", () =>
      Effect.gen(function* () {
        const { dm, homebrew } = yield* Fixture;
        const [listed, alone] = yield* Effect.gen(function* () {
          const options = yield* Options;
          const listed = yield* as(dm)(options.library({}));
          const alone = yield* Effect.forEach(listed, (option) =>
            as(dm)(options.libraryFindById(option.id)),
          );
          return [listed, alone] as const;
        });

        expect(listed.map((option) => option.id)).toContain(homebrew.id);
        expect(listed).toEqual(alone);

        const choices = (option: CharacterOption | undefined) =>
          (option?.details?.choices ?? []).map((group) => `${group.owner}:${group.kind}`);
        const byName = (name: string) => listed.find((option) => option.name === name);
        // The trait's group is offered by both options that carry the trait.
        expect(choices(byName("Elf"))).toContain("trait:language");
        expect(choices(byName("Tidewalker"))).toEqual([
          "option:ability-score",
          "option:language",
          "option:proficiency",
          "option:trait",
          "trait:language",
        ]);
        // Its own groups carry the members it was written with, and the trait's
        // group is the Elf's, members and all.
        const own = byName("Tidewalker")?.details?.choices ?? [];
        expect(own.slice(0, 4).map((group) => group.abilities.length)).toEqual([1, 0, 0, 0]);
        expect(own.slice(0, 4).map((group) => group.languages.length)).toEqual([0, 1, 0, 0]);
        expect(own.slice(0, 4).map((group) => group.proficiencies.length)).toEqual([0, 0, 1, 0]);
        expect(own.slice(0, 4).map((group) => group.traits.length)).toEqual([0, 0, 0, 1]);
        expect(own[4]).toEqual(
          byName("Elf")?.details?.choices.find((group) => group.owner === "trait"),
        );
        expect(own[4]?.languages.length).toBeGreaterThan(0);
      }),
    );

    it.effect("reads a race whose twelfth trait grants a proficiency", () =>
      Effect.gen(function* () {
        const { dm } = yield* Fixture;
        const { race, listed, found } = yield* Effect.gen(function* () {
          const options = yield* Options;
          const vocabulary = yield* as(dm)(options.libraryVocabulary());
          const keenSenses = vocabulary.traits.find((trait) => trait.name === "Keen Senses")!;
          const fillers = vocabulary.traits
            .filter((trait) => trait.id !== keenSenses.id)
            .slice(0, 11)
            .map((trait) => trait.id);
          const race = yield* as(dm)(
            options.libraryCreate({
              kind: "race",
              name: "Longshanks",
              body: {
                speed: 30,
                size: "Medium",
                abilityBonuses: [],
                hpPerLevel: 0,
                traits: [],
                subraces: [],
              },
              relations: { traitIds: [...fillers, keenSenses.id] },
            }),
          );
          const listed = yield* as(dm)(options.library({ kind: "race" }));
          const found = yield* as(dm)(options.libraryFindById(race.id));
          return { race, listed, found };
        });

        const fromListed = listed.find((option) => option.id === race.id);
        expect(fromListed).toEqual(found);
        const granted = (found.details?.proficiencies ?? []).filter(
          (grant) => grant.sourceTrait?.name === "Keen Senses",
        );
        expect(granted.map((grant) => grant.proficiency.name)).toEqual(["Skill: Perception"]);
        expect(granted.map((grant) => grant.ordinal)).toEqual([10_000]);
      }),
    );

    it.effect("answers a creator and a player alike for every option both can read", () =>
      Effect.gen(function* () {
        const { dm, player, campaign } = yield* Fixture;
        const [creator, seated] = yield* Effect.gen(function* () {
          const options = yield* Options;
          return [
            yield* as(dm)(options.list(campaign.id, {})),
            yield* as(player)(options.list(campaign.id, {})),
          ] as const;
        });

        const ids = new Set(seated.map((option) => option.id));
        expect(ids.size).toBeGreaterThanOrEqual(22);
        expect(creator.filter((option) => ids.has(option.id))).toEqual(seated);
      }),
    );
  });
});
