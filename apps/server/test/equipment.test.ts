import { Actor, CurrentActor, type EquipmentCreate } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { servicesOver } from "../src/app.js";
import { importSystemEquipment, type ImportEquipmentResult } from "../src/equipment/import.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Groups } from "../src/repo/Groups.js";
import { EquipmentRepo } from "../src/repo/Equipment.js";
import { Invites } from "../src/repo/Invites.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

const database = migratedDatabase("taverns_test_equipment");
const services = servicesOver(database);
const runtime = ManagedRuntime.make(services.pipe(Layer.provideMerge(database)));
afterAll(() => runtime.dispose());

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    Accounts | Campaigns | Groups | EquipmentRepo | Invites | SqlClient.SqlClient
  >,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const attempt = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    Accounts | Campaigns | Groups | EquipmentRepo | Invites | SqlClient.SqlClient
  >,
) => runtime.runPromise(Effect.result(effect));

const sql = <A>(effect: (client: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  run(Effect.flatMap(SqlClient.SqlClient, effect));

let firstImport: ImportEquipmentResult;

beforeAll(async () => {
  firstImport = await run(importSystemEquipment());
}, 60_000);

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

const firstEquipmentNamed = (name: string) =>
  Effect.flatMap(EquipmentRepo, (equipment) =>
    Effect.map(equipment.library({ q: name, sort: "name", limit: 20 }), (page) => {
      const match = page.items.find((item) => item.name === name);
      if (match === undefined) throw new Error(`expected ${name}`);
      return match;
    }),
  );

const customEquipment = (name: string): EquipmentCreate => ({
  name,
  equipmentCategory: {
    index: "adventuring-gear",
    name: "Adventuring Gear",
  },
  cost: { quantity: 3, unit: "gp" },
  weight: 2,
  gearCategory: {
    index: "standard-gear",
    name: "Standard Gear",
  },
  equipment: {
    equipmentCategory: {
      index: "adventuring-gear",
      name: "Adventuring Gear",
    },
    cost: { quantity: 3, unit: "gp" },
    weight: 2,
    gearCategory: {
      index: "standard-gear",
      name: "Standard Gear",
    },
    desc: [`${name} looks ordinary until it matters.`],
  },
});

describe("2014 SRD mundane equipment", () => {
  it("imports exactly the pinned 237-row equipment corpus, idempotently and offline", async () => {
    expect(firstImport).toEqual({ seen: 237, inserted: 237, updated: 0 });

    const count = await sql(
      (client) => client<{ readonly count: number }>`
        select count(*)::int as count from equipment where origin = 'system'
      `,
    );
    expect(count).toEqual([{ count: 237 }]);

    await expect(run(importSystemEquipment())).resolves.toEqual({
      seen: 237,
      inserted: 0,
      updated: 237,
    });
  }, 60_000);

  it("records concrete relationships to categories, weapon properties, damage types and contained equipment", async () => {
    const links = await sql(
      (client) => client<{
        readonly relation: string;
        readonly target_family: string;
        readonly target_index: string;
        readonly resolved: boolean;
      }>`
        select 'equipment-category' as relation,
               'equipment-categories' as target_family,
               equipment_category.source_key as target_index,
               true as resolved
        from equipment
        join equipment_category on equipment_category.id = equipment.category_id
        where equipment.source_key = 'dagger'
        union all
        select 'damage-type' as relation,
               'damage-types' as target_family,
               damage_type.source_key as target_index,
               true as resolved
        from equipment
        join damage_type on damage_type.id = equipment.damage_type_id
        where equipment.source_key = 'dagger'
        union all
        select 'weapon-property' as relation,
               'weapon-properties' as target_family,
               weapon_property.source_key as target_index,
               true as resolved
        from equipment
        join equipment_property on equipment_property.equipment_id = equipment.id
        join weapon_property on weapon_property.id = equipment_property.weapon_property_id
        where equipment.source_key = 'dagger'
        union all
        select 'contains-equipment' as relation,
               contained.source_family as target_family,
               contained.source_key as target_index,
               true as resolved
        from equipment
        join equipment_content on equipment_content.equipment_id = equipment.id
        join equipment contained on contained.id = equipment_content.contained_equipment_id
        where equipment.source_key = 'explorers-pack'
        order by relation, target_index
      `,
    );

    expect(links).toEqual(
      expect.arrayContaining([
        {
          relation: "equipment-category",
          target_family: "equipment-categories",
          target_index: "weapon",
          resolved: true,
        },
        {
          relation: "damage-type",
          target_family: "damage-types",
          target_index: "piercing",
          resolved: true,
        },
        {
          relation: "weapon-property",
          target_family: "weapon-properties",
          target_index: "finesse",
          resolved: true,
        },
        {
          relation: "contains-equipment",
          target_family: "equipment",
          target_index: "backpack",
          resolved: true,
        },
      ]),
    );
  });

  it("preserves 2014's heterogeneous row and document shapes", async () => {
    const { actor } = await run(dmCampaign("The Equipment Table"));
    const page = await run(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.library({
            q: "restrained",
            categories: ["weapon"],
            weaponCategories: ["Martial"],
            weaponRanges: ["Ranged"],
            properties: ["special"],
            sort: "cost",
            limit: 10,
          }),
        ),
      ),
    );
    const net = page.items.find((item) => item.name === "Net");

    expect(net).toBeDefined();
    expect(net?.categoryIndex).toBe("weapon");
    expect(net?.weaponCategory).toBe("Martial");
    expect(net?.weaponRange).toBe("Ranged");
    expect(net?.throwRangeNormal).toBe(5);
    expect(net?.equipment.special?.[0]).toContain("restrained");

    const pack = await run(withActor(actor, firstEquipmentNamed("Explorer's Pack")));
    expect(pack.gearCategoryIndex).toBe("equipment-packs");
    expect(pack.equipment.contents?.map((content) => content.item.index)).toContain("backpack");

    const chainMail = await run(withActor(actor, firstEquipmentNamed("Chain Mail")));
    expect(chainMail.armorCategory).toBe("Heavy");
    expect(chainMail.armorClassBase).toBe(16);
    expect(chainMail.strengthMinimum).toBe(13);
    expect(chainMail.stealthDisadvantage).toBe(true);
  });

  it("filters one and many values for every equipment list query array", async () => {
    const { actor } = await run(dmCampaign("The Filter Table"));
    const cases = [
      { field: "categories", one: "weapon", two: "armor", names: ["Club", "Shield"] },
      {
        field: "gearCategories",
        one: "equipment-packs",
        two: "holy-symbols",
        names: ["Explorer's Pack", "Amulet"],
      },
      { field: "armorCategories", one: "Heavy", two: "Shield", names: ["Chain Mail", "Shield"] },
      { field: "weaponCategories", one: "Simple", two: "Martial", names: ["Club", "Longsword"] },
      { field: "weaponRanges", one: "Ranged", two: "Melee", names: ["Longbow", "Club"] },
      {
        field: "toolCategories",
        one: "Other Tools",
        two: "Gaming Sets",
        names: ["Thieves' Tools", "Dice Set"],
      },
      {
        field: "vehicleCategories",
        one: "Mounts and Other Animals",
        two: "Waterborne Vehicles",
        names: ["Warhorse", "Galley"],
      },
      { field: "properties", one: "finesse", two: "special", names: ["Dagger", "Net"] },
    ] as const;

    for (const item of cases) {
      const one = await run(
        withActor(
          actor,
          Effect.flatMap(EquipmentRepo, (equipment) =>
            equipment.library({ [item.field]: [item.one], limit: 200 }),
          ),
        ),
      );
      expect(
        one.items.map((equipment) => equipment.name),
        `one ${item.field}`,
      ).toContain(item.names[0]);

      const many = await run(
        withActor(
          actor,
          Effect.flatMap(EquipmentRepo, (equipment) =>
            equipment.library({ [item.field]: [item.one, item.two], limit: 200 }),
          ),
        ),
      );
      expect(
        many.items.map((equipment) => equipment.name),
        `many ${item.field}`,
      ).toEqual(expect.arrayContaining([...item.names]));
    }
  }, 60_000);

  it("keeps Library originals per reader: another account and a player see nothing", async () => {
    // The Library is the whole mundane-equipment surface since the instancing
    // decision of 2026-09-02 — no campaign list, no copy-in. The boundary
    // left to pin is the Library's own: originals are the writer's, and
    // another account's Library never shows them.
    const { actor: firstDm } = await run(dmCampaign("The Equipment Library"));
    const { actor: secondDm } = await run(dmCampaign("Another Equipment Library"));

    const original = await run(
      withActor(
        firstDm,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.libraryCreate(customEquipment("Fen's Private Crowbar")),
        ),
      ),
    );

    const mine = await run(
      withActor(
        firstDm,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.library({ q: "Fen's Private Crowbar" }),
        ),
      ),
    );
    const theirs = await run(
      withActor(
        secondDm,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.library({ q: "Fen's Private Crowbar" }),
        ),
      ),
    );

    expect(original.campaignId).toBeNull();
    expect(mine.items.map((item) => item.id)).toEqual([original.id]);
    expect(theirs.items).toEqual([]);
  });

  it("keeps system equipment immutable through the one write path left", async () => {
    // The Library is the only writable surface now, and a bundled row is
    // owned by nobody: `libraryRowWritable` compares `account_id` to the
    // credential's own, and a null never equals a uuid.
    const { actor } = await run(dmCampaign("The Immutable Equipment Table"));
    const system = await run(withActor(actor, firstEquipmentNamed("Dagger")));

    const libraryUpdate = await attempt(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.libraryUpdate(system.id, { name: "Dagger, but mine" }),
        ),
      ),
    );
    const libraryRemove = await attempt(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) => equipment.libraryRemove(system.id)),
      ),
    );

    expect(libraryUpdate._tag).toBe("Failure");
    expect(libraryRemove._tag).toBe("Failure");
  });

  it("resolves the 2014 background starting equipment references to real equipment source rows", async () => {
    await run(importSystemOptions());

    const links = await sql(
      (client) => client<{
        readonly target_family: string;
        readonly target_index: string;
        readonly quantity: number;
      }>`
        select equipment.source_family as target_family,
               equipment.source_key as target_index,
               character_option_equipment_reference.quantity
        from character_option
        join character_option_equipment_reference
          on character_option_equipment_reference.option_id = character_option.id
        join equipment on equipment.id = character_option_equipment_reference.equipment_id
        where character_option.source_family = 'backgrounds'
          and character_option.source_key = 'acolyte'
        order by equipment.source_family, equipment.source_key
      `,
    );

    expect(links).toEqual(
      expect.arrayContaining([
        { target_family: "equipment", target_index: "clothes-common", quantity: 1 },
        { target_family: "equipment", target_index: "pouch", quantity: 1 },
      ]),
    );
    expect(links.every((link) => link.target_family === "equipment")).toBe(true);

    // And the kit as structure on the body, every counted line naming the row
    // the reference table names — the same shape a class carries, off the same
    // reader, so the sheet's background lines are provenance from import.
    const kit = await sql(
      (client) => client<{
        readonly kit: {
          readonly fixed: ReadonlyArray<{ readonly name: string; readonly equipmentId?: string }>;
          readonly choices: ReadonlyArray<{
            readonly options: ReadonlyArray<{
              readonly lines: ReadonlyArray<Record<string, unknown>>;
            }>;
          }>;
        };
        readonly clothes: string;
        readonly pouch: string;
      }>`
        select body -> 'startingKit' as kit,
               (select id::text from equipment where source_key = 'clothes-common'
                  and campaign_id is null and account_id is null) as clothes,
               (select id::text from equipment where source_key = 'pouch'
                  and campaign_id is null and account_id is null) as pouch
        from character_option
        where source_family = 'backgrounds' and source_key = 'acolyte'
      `,
    );
    const row = kit[0]!;
    expect(row.kit.fixed).toEqual([
      { name: "Clothes, common", quantity: 1, equipmentId: row.clothes },
      { name: "Pouch", quantity: 1, equipmentId: row.pouch },
    ]);
    expect(row.kit.choices).toHaveLength(1);
    expect(row.kit.choices[0]?.options[0]?.lines).toEqual([
      {
        name: "Any holy symbol",
        quantity: 1,
        category: { index: "holy-symbols", name: "Holy Symbols" },
      },
    ]);
  }, 60_000);

  it("answers exactly the rows an `ids` filter names, and none for an empty list", async () => {
    const { actor } = await run(dmCampaign("The Sheet Table"));
    const club = await run(withActor(actor, firstEquipmentNamed("Club")));
    const shield = await run(withActor(actor, firstEquipmentNamed("Shield")));
    const named = await run(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.library({
            ids: [club.id, shield.id, "00000000-0000-4000-8000-000000000000" as never],
            limit: 200,
          }),
        ),
      ),
    );
    expect(named.items.map((item) => item.name).sort()).toEqual(["Club", "Shield"]);
    // The bundle's stable key rides on the wire now, so a weapon picked onto a
    // sheet keys its attack the way the starting kit does.
    expect(named.items.find((item) => item.name === "Club")?.sourceKey).toBe("club");

    const none = await run(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) => equipment.library({ ids: [], limit: 200 })),
      ),
    );
    expect(none.items).toEqual([]);

    // Bundle-only name resolution, for Hob's drafted kit: one row per name,
    // case-insensitively, and a name nothing answers is simply absent.
    const bundled = await run(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.bundledNamed(["club", "SHIELD", "a thing nobody sells", ""]),
        ),
      ),
    );
    expect(bundled.map((item) => item.name)).toEqual(["Club", "Shield"]);
  }, 60_000);
});
