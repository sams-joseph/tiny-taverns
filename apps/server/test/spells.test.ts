import { describe, expect } from "@effect/vitest";
import { Actor, CurrentActor, type SpellCreate } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { Accounts } from "../src/Accounts.js";
import { servicesOver } from "../src/app.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Spells } from "../src/repo/Spells.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

const database = migratedDatabase("taverns_test_spells");
const services = servicesOver(database).pipe(Layer.provideMerge(database));

const sql = <A>(effect: (client: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, effect).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment();
  yield* importSystemOptions();
  const firstImport = yield* importSystemSpells();
  return { firstImport };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "spells.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

const dmCampaign = (name: string) =>
  Effect.gen(function* () {
    const accounts = yield* Accounts;
    const issued = yield* accounts.issue(`${name} DM`);
    const actor = new Actor({ accountId: issued.accountId, scope: { _tag: "account" } });
    const campaign = yield* Effect.provideService(
      createCampaign({ name, visibility: "shared" }),
      CurrentActor,
      actor,
    );
    return { actor, campaign };
  });

const withActor = <A, E, R>(actor: Actor, effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, CurrentActor, actor);

const customSpell = (name: string, classIndex = "wizard"): SpellCreate => ({
  name,
  level: 1,
  school: { index: "evocation", name: "Evocation" },
  ritual: false,
  concentration: false,
  castingTime: "1 action",
  range: "Self",
  duration: "Instantaneous",
  classes: [{ index: classIndex, name: "Wizard" }],
  spell: {
    desc: [`${name} flashes once.`],
    components: ["V", "S"],
    school: { index: "evocation", name: "Evocation" },
    classes: [{ index: classIndex, name: "Wizard" }],
    subclasses: [],
  },
});

describeLayer("spells", shared, (it) => {
  describe("2014 SRD spells", () => {
    it.effect("imports exactly the pinned 319 spell corpus, idempotently and offline", () =>
      Effect.gen(function* () {
        const { firstImport } = yield* Fixture;
        expect(firstImport).toEqual({ seen: 319, inserted: 319, updated: 0 });

        const count = yield* sql(
          (client) => client<{ readonly count: number }>`
            select count(*)::int as count from spell where origin = 'system'
          `,
        );
        expect(count).toEqual([{ count: 319 }]);

        expect(yield* importSystemSpells().pipe(Effect.orDie)).toEqual({
          seen: 319,
          inserted: 0,
          updated: 319,
        });
      }),
    );

    it.effect(
      "records concrete relationships to schools, classes, damage types and DC abilities",
      () =>
        Effect.gen(function* () {
          const links = yield* sql(
            (client) => client<{
              readonly relation: string;
              readonly target_family: string;
              readonly target_index: string;
            }>`
            select 'school' as relation, 'magic-schools' as target_family, magic_school.source_key as target_index
            from spell
            join magic_school on magic_school.id = spell.school_id
            where spell.source_key = 'fireball'
            union all
            select 'dc-type' as relation, 'ability-scores' as target_family, ability_score.source_key as target_index
            from spell
            join ability_score on ability_score.id = spell.dc_ability_id
            where spell.source_key = 'fireball'
            union all
            select 'class' as relation, character_option.source_family as target_family, character_option.source_key as target_index
            from spell
            join spell_class on spell_class.spell_id = spell.id
            join character_option on character_option.id = spell_class.class_option_id
            where spell.source_key = 'fireball'
            union all
            select 'damage-type' as relation, 'damage-types' as target_family, damage_type.source_key as target_index
            from spell
            join spell_damage_type on spell_damage_type.spell_id = spell.id
            join damage_type on damage_type.id = spell_damage_type.damage_type_id
            where spell.source_key = 'fireball'
            union all
            select 'subclass' as relation, subclass.source_family as target_family, subclass.source_key as target_index
            from spell
            join spell_subclass on spell_subclass.spell_id = spell.id
            join subclass on subclass.id = spell_subclass.subclass_id
            where spell.source_key = 'acid-arrow'
            order by relation, target_index
          `,
          );

          expect(links).toEqual(
            expect.arrayContaining([
              { relation: "school", target_family: "magic-schools", target_index: "evocation" },
              { relation: "class", target_family: "classes", target_index: "sorcerer" },
              { relation: "class", target_family: "classes", target_index: "wizard" },
              { relation: "damage-type", target_family: "damage-types", target_index: "fire" },
              { relation: "dc-type", target_family: "ability-scores", target_index: "dex" },
              { relation: "subclass", target_family: "subclasses", target_index: "land" },
              { relation: "subclass", target_family: "subclasses", target_index: "lore" },
            ]),
          );
        }),
    );

    it.effect("filters in SQL by one-value arrays and spell-specific booleans", () =>
      Effect.gen(function* () {
        const { actor } = yield* dmCampaign("The Spell Road");
        const page = yield* withActor(
          actor,
          Effect.flatMap(Spells, (spells) =>
            spells.library({
              q: "explosion of flame",
              levels: ["3"],
              schools: ["evocation"],
              classes: ["wizard"],
              concentration: false,
              ritual: false,
              sort: "level",
              limit: 10,
            }),
          ),
        );

        expect(page.items.map((spell) => spell.name)).toContain("Fireball");
        expect(page.items.every((spell) => spell.level === 3)).toBe(true);
        expect(page.items.every((spell) => spell.schoolIndex === "evocation")).toBe(true);
        expect(page.items.every((spell) => spell.classIndexes.includes("wizard"))).toBe(true);
        expect(page.items.every((spell) => !spell.ritual && !spell.concentration)).toBe(true);
      }),
    );

    it.effect("scopes the Library per reader: originals and the bundle, nobody else's", () =>
      Effect.gen(function* () {
        // The Library is the whole spell surface since the instancing decision of
        // 2026-09-02 — there is no campaign spell list to gate, copy into, or
        // share from, so what is left to pin is the Library boundary itself.
        const { actor: firstDm } = yield* dmCampaign("The Private Grimoire");
        const { actor: secondDm } = yield* dmCampaign("The Other Grimoire");

        const original = yield* withActor(
          firstDm,
          Effect.flatMap(Spells, (spells) =>
            spells.libraryCreate(customSpell("Fen's Private Bolt")),
          ),
        );

        const mine = yield* withActor(
          firstDm,
          Effect.flatMap(Spells, (spells) => spells.library({ q: "Fen's Private Bolt" })),
        );
        const theirs = yield* withActor(
          secondDm,
          Effect.flatMap(Spells, (spells) => spells.library({ q: "Fen's Private Bolt" })),
        );

        expect(mine.items.map((spell) => spell.id)).toEqual([original.id]);
        expect(original.campaignId).toBeNull();
        expect(theirs.items).toEqual([]);
      }),
    );
  });
});
