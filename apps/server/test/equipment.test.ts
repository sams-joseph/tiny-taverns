import { Actor, CurrentActor, NotFound, type EquipmentCreate } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { servicesOver } from "../src/app.js";
import { importSystemEquipment, type ImportEquipmentResult } from "../src/equipment/import.js";
import { EQUIPMENT_RAW } from "../src/equipment/systemEquipment.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Groups } from "../src/repo/Groups.js";
import { EquipmentRepo } from "../src/repo/Equipment.js";
import { Invites } from "../src/repo/Invites.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { aPlayerAt, createCampaign } from "./support/actors.js";
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
    const { actor, campaign } = await run(dmCampaign("The Equipment Table"));
    const page = await run(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.list(campaign.id, {
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
    const { actor, campaign } = await run(dmCampaign("The Filter Table"));
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
            equipment.list(campaign.id, { [item.field]: [item.one], limit: 200 }),
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
            equipment.list(campaign.id, { [item.field]: [item.one, item.two], limit: 200 }),
          ),
        ),
      );
      expect(
        many.items.map((equipment) => equipment.name),
        `many ${item.field}`,
      ).toEqual(expect.arrayContaining([...item.names]));
    }
  }, 60_000);

  it("keeps Library originals out of other accounts, players and campaigns until copied", async () => {
    const { actor: firstDm, campaign } = await run(dmCampaign("The Equipment Library"));
    const { actor: secondDm } = await run(dmCampaign("Another Equipment Library"));
    const player = await run(aPlayerAt(campaign.id, "Equipment Player"));

    const original = await run(
      withActor(
        firstDm,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.libraryCreate(customEquipment("Fen's Private Crowbar")),
        ),
      ),
    );

    const campaignBeforeCopy = await run(
      withActor(
        firstDm,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.list(campaign.id, { q: "Fen's Private Crowbar" }),
        ),
      ),
    );
    const strangerLibrary = await run(
      withActor(
        secondDm,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.library({ q: "Fen's Private Crowbar" }),
        ),
      ),
    );
    const playerBeforeCopy = await run(
      withActor(
        player,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.list(campaign.id, { q: "Fen's Private Crowbar" }),
        ),
      ),
    );

    expect(campaignBeforeCopy.items).toEqual([]);
    expect(strangerLibrary.items).toEqual([]);
    expect(playerBeforeCopy.items).toEqual([]);

    const copy = await run(
      withActor(
        firstDm,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.derive(campaign.id, original.id, {}),
        ),
      ),
    );
    const campaignAfterCopy = await run(
      withActor(
        firstDm,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.list(campaign.id, { q: "Fen's Private Crowbar" }),
        ),
      ),
    );
    const playerAfterDmOnlyCopy = await run(
      withActor(
        player,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.list(campaign.id, { q: "Fen's Private Crowbar" }),
        ),
      ),
    );

    expect(copy.campaignId).toBe(campaign.id);
    expect(copy.accountId).toBeNull();
    expect(copy.derivedFrom).toBe(original.id);
    expect(campaignAfterCopy.items.map((item) => item.id)).toEqual([copy.id]);
    expect(playerAfterDmOnlyCopy.items).toEqual([]);
  });

  it("rejects using a campaign copy as the source for another campaign", async () => {
    const { actor, campaign: first } = await run(dmCampaign("The First Equipment Table"));
    const campaigns = await run(
      createCampaign({ name: "The Second Equipment Table", visibility: "shared" }).pipe(
        Effect.provideService(CurrentActor, actor),
      ),
    );
    const source = await run(withActor(actor, firstEquipmentNamed("Rope, hempen (50 feet)")));
    const firstCopy = await run(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) => equipment.derive(first.id, source.id, {})),
      ),
    );

    const result = await attempt(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.derive(campaigns.id, firstCopy.id, {}),
        ),
      ),
    );

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
    expect(result._tag === "Failure" && (result.failure as NotFound).resource).toBe("equipment");
  });

  it("keeps system equipment immutable through both Library and campaign writes", async () => {
    const { actor, campaign } = await run(dmCampaign("The Immutable Equipment Table"));
    const system = await run(withActor(actor, firstEquipmentNamed("Dagger")));

    const libraryUpdate = await attempt(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.libraryUpdate(system.id, { name: "Dagger, but mine" }),
        ),
      ),
    );
    const campaignUpdate = await attempt(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.update(campaign.id, system.id, { name: "Dagger, but in a campaign" }),
        ),
      ),
    );
    const campaignRemove = await attempt(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) => equipment.remove(campaign.id, system.id)),
      ),
    );

    expect(libraryUpdate._tag).toBe("Failure");
    expect(campaignUpdate._tag).toBe("Failure");
    expect(campaignRemove._tag).toBe("Failure");
  });

  it("copies equipment as a campaign snapshot and does not follow later source updates", async () => {
    const { actor, campaign } = await run(dmCampaign("The Equipment Snapshot"));
    const source = await run(withActor(actor, firstEquipmentNamed("Dagger")));
    const copy = await run(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.derive(campaign.id, source.id, { name: "Salt Road Dagger" }),
        ),
      ),
    );

    const revised = EQUIPMENT_RAW.map((item) =>
      item.index === "dagger"
        ? { ...item, name: "Dagger, Revised", desc: ["This source row changed."] }
        : item,
    );
    await run(importSystemEquipment(revised));

    const copiedAgain = await run(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) => equipment.findById(campaign.id, copy.id)),
      ),
    );
    const revisedSource = await run(withActor(actor, firstEquipmentNamed("Dagger, Revised")));
    const sourceKeys = await sql(
      (client) => client<{
        readonly copy_key: string;
        readonly source_key: string;
      }>`
        select copy.source_key as copy_key,
               system.source_key as source_key
        from equipment copy
        join equipment system
          on system.source_corpus = copy.source_corpus
         and system.source_family = copy.source_family
         and system.source_key = copy.source_key
        where copy.id = ${copy.id}
          and system.campaign_id is null
          and system.account_id is null
      `,
    );

    expect(copiedAgain.name).toBe("Salt Road Dagger");
    expect(copiedAgain.equipment.desc).toEqual(source.equipment.desc);
    expect(revisedSource.id).toBe(source.id);
    expect(sourceKeys).toEqual([{ copy_key: "dagger", source_key: "dagger" }]);
  }, 60_000);

  it("leaves a campaign copy standing when its Library original is deleted", async () => {
    const { actor, campaign } = await run(dmCampaign("The Equipment Delete Snapshot"));
    const original = await run(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.libraryCreate(customEquipment("Discarded Original Gear")),
        ),
      ),
    );
    const copy = await run(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) =>
          equipment.derive(campaign.id, original.id, {}),
        ),
      ),
    );

    await run(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) => equipment.libraryRemove(original.id)),
      ),
    );

    const stillThere = await run(
      withActor(
        actor,
        Effect.flatMap(EquipmentRepo, (equipment) => equipment.findById(campaign.id, copy.id)),
      ),
    );

    expect(stillThere.name).toBe("Discarded Original Gear");
    expect(stillThere.derivedFrom).toBeNull();
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
  }, 60_000);
});
