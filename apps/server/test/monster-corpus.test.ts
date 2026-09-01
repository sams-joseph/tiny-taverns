import { Actor, CurrentActor, NotFound } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { servicesOver } from "../src/app.js";
import { importSystemMonsters, type ImportMonstersResult } from "../src/bestiary/import.js";
import { MONSTER_RAW } from "../src/bestiary/systemMonsters.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Creatures } from "../src/repo/Creatures.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { migratedDatabase } from "./support/database.js";

const database = migratedDatabase("taverns_test_monster_corpus");
const services = servicesOver(database);
const runtime = ManagedRuntime.make(services.pipe(Layer.provideMerge(database)));
afterAll(() => runtime.dispose());

type Requirements = Accounts | Campaigns | Creatures | SqlClient.SqlClient;

const run = <A, E>(effect: Effect.Effect<A, E, Requirements>) =>
  runtime.runPromise(effect.pipe(Effect.orDie));

const attempt = <A, E>(effect: Effect.Effect<A, E, Requirements>) =>
  runtime.runPromise(Effect.result(effect));

const sql = <A>(effect: (client: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  run(Effect.flatMap(SqlClient.SqlClient, effect));

let firstImport: ImportMonstersResult;
let actor: Actor;

beforeAll(async () => {
  await run(importSystemEquipment());
  await run(importSystemOptions());
  await run(importSystemSpells());
  firstImport = await run(importSystemMonsters());
  const issued = await run(Effect.flatMap(Accounts, (accounts) => accounts.issue("Monster DM")));
  actor = new Actor({ accountId: issued.accountId, campaignId: null });
}, 60_000);

const asActor = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, CurrentActor, actor);

const rawNamed = (index: string): Record<string, unknown> => {
  const row = MONSTER_RAW.find((monster) => monster.index === index);
  if (row === undefined) throw new Error(`missing fixture ${index}`);
  return row;
};

describe("2014 SRD monsters", () => {
  it("imports exactly the pinned 334 monster corpus, idempotently and offline", async () => {
    expect(firstImport).toEqual({ seen: 334, inserted: 334, updated: 0 });

    const rows = await sql(
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

    await expect(run(importSystemMonsters())).resolves.toEqual({
      seen: 334,
      inserted: 0,
      updated: 334,
    });
  }, 60_000);

  it("maps the full stat block while keeping filterable values in columns", async () => {
    const result = await run(
      asActor(
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
      ),
    );

    const dragon = result.items.find((creature) => creature.name === "Adult Red Dragon");
    expect(dragon).toBeDefined();
    expect(dragon?.cr).toBe("17");
    expect(dragon?.hp).toBe(256);
    expect(dragon?.damageImmunities).toContain("fire");
    expect(dragon?.movementModes).toContain("fly");
    expect(dragon?.legendary).toBe(true);
    expect(dragon?.statBlock.actions?.some((action) => action.name === "Fire Breath")).toBe(true);
    expect(dragon?.statBlock.legendaryActions?.length).toBeGreaterThan(0);
  });

  it("records concrete relationships to proficiencies, conditions, damage types, spells, equipment and forms", async () => {
    const links = await sql(
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
  });

  it("does not let a stranger read bundled monsters through a campaign they cannot reach", async () => {
    const campaign = await run(
      asActor(
        Effect.flatMap(Campaigns, (campaigns) =>
          campaigns.create({ name: "The Monster Gate", visibility: "shared" }),
        ),
      ),
    );
    const issued = await run(Effect.flatMap(Accounts, (accounts) => accounts.issue("Stranger")));
    const stranger = new Actor({ accountId: issued.accountId, campaignId: null });
    const result = await attempt(
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
  });

  it("copies an SRD monster as a campaign snapshot that does not follow source updates", async () => {
    const campaign = await run(
      asActor(
        Effect.flatMap(Campaigns, (campaigns) =>
          campaigns.create({ name: "The Snapshot Gate", visibility: "shared" }),
        ),
      ),
    );
    const sourcePage = await run(
      asActor(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.library({ q: "Adult Red Dragon", sort: "name", limit: 5 }),
        ),
      ),
    );
    const source = sourcePage.items.find((creature) => creature.name === "Adult Red Dragon");
    if (source === undefined) throw new Error("expected Adult Red Dragon source row");

    const copy = await run(
      asActor(
        Effect.flatMap(Creatures, (creatures) => creatures.derive(campaign.id, source.id, {})),
      ),
    );
    const lineage = await sql(
      (client) => client<{
        readonly id: string;
        readonly source_corpus: string;
        readonly source_family: string;
        readonly source_key: string;
      }>`
        select id::text, source_corpus, source_family, source_key
        from creature
        where id = any(${[source.id, copy.id]})
      `,
    );
    const sourceLineage = lineage.find((row) => row.id === source.id);
    const copyLineage = lineage.find((row) => row.id === copy.id);
    if (sourceLineage === undefined || copyLineage === undefined) {
      throw new Error("expected source and copied creature rows");
    }

    const changed = {
      ...rawNamed("adult-red-dragon"),
      name: "Adult Red Dragon, Revised",
      hit_points: 333,
    };
    await expect(run(importSystemMonsters([changed]))).resolves.toEqual({
      seen: 1,
      inserted: 0,
      updated: 1,
    });

    const reread = await run(
      asActor(Effect.flatMap(Creatures, (creatures) => creatures.findById(campaign.id, copy.id))),
    );
    const originalPage = await run(
      asActor(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.library({ q: "Adult Red Dragon, Revised", sort: "name", limit: 5 }),
        ),
      ),
    );

    expect(reread.name).toBe("Adult Red Dragon");
    expect(reread.hp).toBe(256);
    expect(reread.derivedFrom).toBe(source.id);
    expect(copyLineage.source_corpus).toBe(sourceLineage.source_corpus);
    expect(copyLineage.source_family).toBe(sourceLineage.source_family);
    expect(copyLineage.source_key).toBe(sourceLineage.source_key);
    expect(
      originalPage.items.find((creature) => creature.name === "Adult Red Dragon, Revised")?.hp,
    ).toBe(333);
  }, 60_000);

  it("uses source identity for updates, so a source rename updates one row", async () => {
    const renamed = { ...rawNamed("aboleth"), name: "Aboleth, Renamed By Source" };
    await expect(run(importSystemMonsters([renamed]))).resolves.toEqual({
      seen: 1,
      inserted: 0,
      updated: 1,
    });

    const rows = await sql(
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
  });

  it("fails the import when a required source target is missing", async () => {
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

    await expect(runtime.runPromise(importSystemMonsters([broken]))).rejects.toThrow(
      /missing required monster-proficiency skill-never-imported/,
    );
  });
});
