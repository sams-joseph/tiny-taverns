import { Actor, CurrentActor, NotFound } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { servicesOver } from "../src/app.js";
import { importSystemMonsters, type ImportMonstersResult } from "../src/bestiary/import.js";
import { MONSTER_RAW } from "../src/bestiary/systemMonsters.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Creatures } from "../src/repo/Creatures.js";
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
        join rules_source_entity on rules_source_entity.id = creature.source_entity_id
        join rules_source_document on rules_source_document.id = rules_source_entity.document_id
        where creature.origin = 'system'
          and creature.campaign_id is null
          and creature.account_id is null
          and rules_source_entity.family = 'monsters'
          and rules_source_document.system = 'dnd-5e-srd'
          and rules_source_document.document_version = '5e-database 5.10.0+5a7ee5a0489b26655d343e4a41e8f7942a887af2'
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

  it("records source links to proficiencies, conditions, damage types, spells, equipment and forms", async () => {
    const links = await sql(
      (client) => client<{
        readonly monster: string;
        readonly relation: string;
        readonly target_family: string;
        readonly target_index: string;
      }>`
        select monster.source_index as monster,
               rules_source_link.relation,
               rules_source_link.target_family,
               rules_source_link.target_index
        from rules_source_link
        join rules_source_entity_revision on rules_source_entity_revision.id = rules_source_link.from_revision_id
        join rules_source_entity monster on monster.id = rules_source_entity_revision.entity_id
        where monster.family = 'monsters'
          and monster.source_index = any(${["archmage", "animated-armor", "assassin", "vampire-vampire"]})
        order by monster.source_index, rules_source_link.relation, rules_source_link.ordinal
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
        readonly source_entity_id: string;
        readonly source_revision_id: string;
      }>`
        select id::text, source_entity_id::text, source_revision_id::text
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
    expect(copyLineage.source_entity_id).toBe(sourceLineage.source_entity_id);
    expect(copyLineage.source_revision_id).toBe(sourceLineage.source_revision_id);
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
        select count(*)::int as count, max(creature.name) as name
        from creature
        join rules_source_entity on rules_source_entity.id = creature.source_entity_id
        where rules_source_entity.family = 'monsters'
          and rules_source_entity.source_index = 'aboleth'
        group by rules_source_entity.source_index
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
      /missing required source link target proficiencies\/skill-never-imported/,
    );
  });
});
