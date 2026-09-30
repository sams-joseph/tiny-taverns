import { describe, expect } from "@effect/vitest";
import { CurrentActor, NotFound, NpcSheetPut, sheetFromStatBlock } from "@taverns/api";
import { Cause, Context, Effect, Exit, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { servicesOver } from "../src/app.js";
import { importSystemMonsters } from "../src/bestiary/import.js";
import { MONSTER_RAW } from "../src/bestiary/systemMonsters.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Creatures } from "../src/repo/Creatures.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { Encounters } from "../src/repo/Encounters.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { anAccount, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

const database = migratedDatabase("taverns_test_monster_corpus");
const services = servicesOver(database).pipe(Layer.provideMerge(database));

const sql = <A>(effect: (client: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, effect).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment();
  yield* importSystemOptions();
  yield* importSystemSpells();
  const firstImport = yield* importSystemMonsters();
  const actor = yield* anAccount("Monster DM");
  return { firstImport, actor };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "monster-corpus.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

const asActor = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.flatMap(Fixture, ({ actor }) => Effect.provideService(effect, CurrentActor, actor));

const rawNamed = (index: string): Record<string, unknown> => {
  const row = MONSTER_RAW.find((monster) => monster.index === index);
  if (row === undefined) throw new Error(`missing fixture ${index}`);
  return row;
};

describeLayer("monster-corpus", shared, (it) => {
  describe("2014 SRD monsters", () => {
    it.effect("imports exactly the pinned 334 monster corpus, idempotently and offline", () =>
      Effect.gen(function* () {
        const { firstImport } = yield* Fixture;
        expect(firstImport).toEqual({ seen: 334, inserted: 334, updated: 0 });

        const rows = yield* sql(
          (client) => client<{ readonly count: number }>`
        select count(*)::int as count
        from creature
        where origin = 'system'
          and campaign_id is null
          and account_id is null
          and source_corpus = '5e-bits-2014'
          and source_family = 'monsters'
      `,
        );
        expect(rows).toEqual([{ count: 334 }]);

        expect(yield* importSystemMonsters().pipe(Effect.orDie)).toEqual({
          seen: 334,
          inserted: 0,
          updated: 334,
        });
      }),
    );

    it.effect("maps the full stat block while keeping filterable values in columns", () =>
      Effect.gen(function* () {
        const result = yield* asActor(
          Effect.flatMap(Creatures, (creatures) =>
            creatures.library({
              q: "Fire Breath",
              crMin: 17,
              crMax: 17,
              damageImmunities: ["fire"],
              movementModes: ["fly"],
              legendary: true,
              sort: "name",
              limit: 10,
            }),
          ),
        );

        const dragon = result.items.find((creature) => creature.name === "Adult Red Dragon");
        expect(dragon).toBeDefined();
        expect(dragon?.cr).toBe("17");
        expect(dragon?.hp).toBe(256);
        expect(dragon?.damageImmunities).toContain("fire");
        expect(dragon?.movementModes).toContain("fly");
        expect(dragon?.legendary).toBe(true);
        expect(dragon?.statBlock.actions?.some((action) => action.name === "Fire Breath")).toBe(
          true,
        );
        expect(dragon?.statBlock.legendaryActions?.length).toBeGreaterThan(0);
      }),
    );

    it.effect("translates every SRD humanoid into an NPC sheet the wire accepts", () =>
      Effect.gen(function* () {
        const humanoids = yield* asActor(
          Effect.flatMap(Creatures, (creatures) =>
            creatures.library({ types: ["humanoid"], sort: "name", limit: 200 }),
          ),
        );
        const bundled = humanoids.items.filter((creature) => creature.accountId === null);
        // The 50 humanoids of the pinned snapshot, the 21 NPC blocks among them.
        expect(bundled.filter((creature) => creature.subtype === "any race")).toHaveLength(21);

        const decodePut = Schema.decodeUnknownSync(NpcSheetPut);
        for (const creature of bundled) {
          const started = sheetFromStatBlock(creature);
          expect(() => decodePut(started), creature.name).not.toThrow();
          expect(started.cr, creature.name).toBe(creature.cr);
          expect(started.sheet.abilities, creature.name).toHaveLength(6);
        }

        const veteran = bundled.find((creature) => creature.name === "Veteran");
        const sheet = veteran === undefined ? undefined : sheetFromStatBlock(veteran);
        expect(sheet).toMatchObject({ ac: 17, hpMax: 58, cr: "3" });
        expect(sheet?.sheet.skills).toContainEqual({
          name: "Athletics",
          ability: "STR",
          bonus: "+5",
          proficient: true,
        });
        expect(sheet?.sheet.actions).toContainEqual(
          expect.objectContaining({
            name: "Longsword",
            hit: "+5",
            dice: "1d8+3",
            source: "weapon",
          }),
        );

        const captain = bundled.find((creature) => creature.name === "Bandit Captain");
        const captainSheet = captain === undefined ? undefined : sheetFromStatBlock(captain).sheet;
        expect(captainSheet?.abilities.find((cell) => cell.label === "DEX")).toMatchObject({
          save: "+5",
          proficient: true,
        });
        expect(captainSheet?.actions).toContainEqual(
          expect.objectContaining({ name: "Parry", cost: "reaction" }),
        );
      }),
    );

    it.effect(
      "records concrete relationships to proficiencies, conditions, damage types, spells, equipment and forms",
      () =>
        Effect.gen(function* () {
          const links = yield* sql(
            (client) => client<{
              readonly monster: string;
              readonly relation: string;
              readonly target_family: string;
              readonly target_index: string;
            }>`
        select creature.source_key as monster,
               'proficiency' as relation,
               'proficiencies' as target_family,
               proficiency.source_key as target_index
        from creature
        join creature_proficiency on creature_proficiency.creature_id = creature.id
        join proficiency on proficiency.id = creature_proficiency.proficiency_id
        where creature.source_key = 'archmage'
        union all
        select creature.source_key as monster,
               'spell' as relation,
               spell.source_family as target_family,
               spell.source_key as target_index
        from creature
        join creature_spell on creature_spell.creature_id = creature.id
        join spell on spell.id = creature_spell.spell_id
        where creature.source_key = 'archmage'
        union all
        select creature.source_key as monster,
               'condition-immunity' as relation,
               'conditions' as target_family,
               condition.source_key as target_index
        from creature
        join creature_condition_immunity on creature_condition_immunity.creature_id = creature.id
        join condition on condition.id = creature_condition_immunity.condition_id
        where creature.source_key = 'animated-armor'
        union all
        select creature.source_key as monster,
               'damage-immunity' as relation,
               'damage-types' as target_family,
               damage_type.source_key as target_index
        from creature
        join creature_damage_type on creature_damage_type.creature_id = creature.id
        join damage_type on damage_type.id = creature_damage_type.damage_type_id
        where creature.source_key = 'animated-armor'
          and creature_damage_type.relation = 'immunity'
        union all
        select creature.source_key as monster,
               'armor' as relation,
               equipment.source_family as target_family,
               equipment.source_key as target_index
        from creature
        join creature_armor_equipment on creature_armor_equipment.creature_id = creature.id
        join equipment on equipment.id = creature_armor_equipment.equipment_id
        where creature.source_key = 'assassin'
        union all
        select creature.source_key as monster,
               'form' as relation,
               form.source_family as target_family,
               form.source_key as target_index
        from creature
        join creature_form on creature_form.creature_id = creature.id
        join creature form on form.id = creature_form.form_id
        where creature.source_key = 'vampire-vampire'
        order by monster, relation, target_index
      `,
          );

          expect(links).toEqual(
            expect.arrayContaining([
              {
                monster: "archmage",
                relation: "proficiency",
                target_family: "proficiencies",
                target_index: "skill-arcana",
              },
              {
                monster: "archmage",
                relation: "spell",
                target_family: "spells",
                target_index: "mage-armor",
              },
              {
                monster: "animated-armor",
                relation: "condition-immunity",
                target_family: "conditions",
                target_index: "blinded",
              },
              {
                monster: "animated-armor",
                relation: "damage-immunity",
                target_family: "damage-types",
                target_index: "poison",
              },
              {
                monster: "assassin",
                relation: "armor",
                target_family: "equipment",
                target_index: "studded-leather-armor",
              },
              {
                monster: "vampire-vampire",
                relation: "form",
                target_family: "monsters",
                target_index: "vampire-bat",
              },
            ]),
          );
        }),
    );

    it.effect(
      "does not let a stranger read bundled monsters through a campaign they cannot reach",
      () =>
        Effect.gen(function* () {
          const campaign = yield* asActor(
            createCampaign({ name: "The Monster Gate", visibility: "shared" }),
          );
          const stranger = yield* anAccount("Stranger");
          const result = yield* Effect.result(
            Effect.provideService(
              Effect.flatMap(Creatures, (creatures) =>
                creatures.list(campaign.id, { q: "Adult Red Dragon", limit: 5 }),
              ),
              CurrentActor,
              stranger,
            ),
          );

          expect(result._tag).toBe("Failure");
          expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
        }),
    );

    it.effect("uses an SRD monster in an encounter by direct reference, updated in place", () =>
      Effect.gen(function* () {
        // Since the instancing decision of 2026-09-02 a bundled row is referenced
        // directly by a roster — the bundle is immutable to users and updated only
        // by the pinned importer, so a re-import reaches the prep that names it,
        // which is a version upgrade doing its job. What history is immune to is
        // guarded one level down: a fight's combatants snapshot at seed time.
        const campaign = yield* asActor(
          createCampaign({ name: "The Snapshot Gate", visibility: "shared" }),
        );
        const sourcePage = yield* asActor(
          Effect.flatMap(Creatures, (creatures) =>
            creatures.list(campaign.id, { q: "Adult Red Dragon", sort: "name", limit: 5 }),
          ),
        );
        const source = sourcePage.items.find((creature) => creature.name === "Adult Red Dragon");
        if (source === undefined) throw new Error("expected Adult Red Dragon source row");

        const line = yield* asActor(
          Effect.gen(function* () {
            const encounters = yield* Encounters;
            const roster = yield* EncounterCreatures;
            const encounter = yield* encounters.create(campaign.id, { name: "The gate opens" });
            return yield* roster.create(campaign.id, encounter.id, { creatureId: source.id });
          }),
        );
        expect(line.creatureId).toBe(source.id);

        const changed = {
          ...rawNamed("adult-red-dragon"),
          name: "Adult Red Dragon, Revised",
          hit_points: 333,
        };
        expect(yield* importSystemMonsters([changed]).pipe(Effect.orDie)).toEqual({
          seen: 1,
          inserted: 0,
          updated: 1,
        });

        // One row, updated in place — reachable at the campaign under its new
        // name, with the roster still pointing at it.
        const reread = yield* asActor(
          Effect.flatMap(Creatures, (creatures) =>
            creatures.findById(campaign.id, line.creatureId),
          ),
        );
        expect(reread.id).toBe(source.id);
        expect(reread.name).toBe("Adult Red Dragon, Revised");
        expect(reread.hp).toBe(333);
      }),
    );

    it.effect("uses source identity for updates, so a source rename updates one row", () =>
      Effect.gen(function* () {
        const renamed = { ...rawNamed("aboleth"), name: "Aboleth, Renamed By Source" };
        expect(yield* importSystemMonsters([renamed]).pipe(Effect.orDie)).toEqual({
          seen: 1,
          inserted: 0,
          updated: 1,
        });

        const rows = yield* sql(
          (client) => client<{ readonly count: number; readonly name: string }>`
        select count(*)::int as count, max(name) as name
        from creature
        where source_corpus = '5e-bits-2014'
          and source_family = 'monsters'
          and source_key = 'aboleth'
        group by source_key
      `,
        );

        expect(rows).toEqual([{ count: 1, name: "Aboleth, Renamed By Source" }]);
      }),
    );

    it.effect("fails the import when a required source target is missing", () =>
      Effect.gen(function* () {
        const proficiencies = [
          {
            value: 2,
            proficiency: {
              index: "skill-never-imported",
              name: "Skill: Never Imported",
              url: "/api/2014/proficiencies/skill-never-imported",
            },
          },
        ];
        const broken = { ...rawNamed("ape"), proficiencies };

        const exit = yield* Effect.exit(importSystemMonsters([broken]));
        expect(() => {
          if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
        }).toThrow(/missing required monster-proficiency skill-never-imported/);
      }),
    );
  });
});
