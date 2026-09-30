import { describe, expect } from "@effect/vitest";
import { Actor, CurrentActor, MagicItemId, type MagicItemCreate } from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Accounts } from "../src/Accounts.js";
import { servicesOver } from "../src/app.js";
import { importSystemMagicItems } from "../src/magic-items/import.js";
import { MAGIC_ITEM_RAW } from "../src/magic-items/systemMagicItems.js";
import { MagicItems } from "../src/repo/MagicItems.js";
import { createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

const database = migratedDatabase("taverns_test_magic_items");
const services = servicesOver(database).pipe(Layer.provideMerge(database));

const sql = <A>(effect: (client: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, effect).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  const firstImport = yield* importSystemMagicItems();
  return { firstImport };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "magic-items.test/Fixture",
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

const itemWithSourceIndex = (sourceIndex: string) =>
  Effect.gen(function* () {
    const rows = yield* Effect.flatMap(
      SqlClient.SqlClient,
      (client) => client<{ readonly id: string }>`
        select id::text
        from magic_item
        where source_corpus = '5e-bits-2014'
          and source_family = 'magic-items'
          and source_key = ${sourceIndex}
      `,
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error(`expected ${sourceIndex}`);
    return yield* Effect.flatMap(MagicItems, (magicItems) =>
      magicItems.libraryFindById(Schema.decodeSync(MagicItemId)(id)),
    );
  });

const customItem = (name: string): MagicItemCreate => ({
  name,
  equipmentCategory: {
    index: "wondrous-items",
    name: "Wondrous Items",
  },
  rarity: { index: "uncommon", name: "Uncommon" },
  requiresAttunement: true,
  attunementRequirement: "requires attunement by a friendly ghost",
  desc: [`${name} hums when moonlight touches it.`],
  magicItem: {
    item: { index: `homebrew-${name.toLowerCase().replaceAll(" ", "-")}`, name },
    equipmentCategory: {
      index: "wondrous-items",
      name: "Wondrous Items",
    },
    rarity: { index: "uncommon", name: "Uncommon" },
    desc: [`${name} hums when moonlight touches it.`],
    requiresAttunement: true,
    attunementRequirement: "requires attunement by a friendly ghost",
    variant: true,
    variants: [{ index: "someone-elses-variant", name: "Someone Else's Variant" }],
  },
});

describeLayer("magic-items", shared, (it) => {
  describe("2014 SRD magic items", () => {
    it.effect("imports exactly the pinned 362 magic item corpus, idempotently and offline", () =>
      Effect.gen(function* () {
        const { firstImport } = yield* Fixture;
        expect(firstImport).toEqual({ seen: 362, inserted: 362, updated: 0 });

        const count = yield* sql(
          (client) => client<{ readonly count: number }>`
            select count(*)::int as count from magic_item where origin = 'system'
          `,
        );
        expect(count).toEqual([{ count: 362 }]);

        expect(yield* importSystemMagicItems().pipe(Effect.orDie)).toEqual({
          seen: 362,
          inserted: 0,
          updated: 362,
        });
      }),
    );

    it.effect("records concrete equipment-category, variant and base relationships", () =>
      Effect.gen(function* () {
        const links = yield* sql(
          (client) => client<{
            readonly item: string;
            readonly relation: string;
            readonly target_family: string;
            readonly target_index: string;
          }>`
            select magic_item.source_key as item,
                   'equipment-category' as relation,
                   'equipment-categories' as target_family,
                   equipment_category.source_key as target_index
            from magic_item
            join equipment_category on equipment_category.id = magic_item.category_id
            where magic_item.source_key in ('ammunition', 'ammunition-1')
            union all
            select base.source_key as item,
                   'magic-item-variant' as relation,
                   variant.source_family as target_family,
                   variant.source_key as target_index
            from magic_item_variant
            join magic_item base on base.id = magic_item_variant.base_item_id
            join magic_item variant on variant.id = magic_item_variant.variant_item_id
            where base.source_key = 'ammunition'
            union all
            select variant.source_key as item,
                   'magic-item-base' as relation,
                   base.source_family as target_family,
                   base.source_key as target_index
            from magic_item variant
            join magic_item base on base.id = variant.base_item_id
            where variant.source_key = 'ammunition-1'
            order by item, relation, target_index
          `,
        );

        expect(links).toEqual(
          expect.arrayContaining([
            {
              item: "ammunition",
              relation: "equipment-category",
              target_family: "equipment-categories",
              target_index: "ammunition",
            },
            {
              item: "ammunition",
              relation: "magic-item-variant",
              target_family: "magic-items",
              target_index: "ammunition-1",
            },
            {
              item: "ammunition-1",
              relation: "magic-item-base",
              target_family: "magic-items",
              target_index: "ammunition",
            },
          ]),
        );
      }),
    );

    it.effect("models variants by source identity and rejects a missing required target", () =>
      Effect.gen(function* () {
        const { actor } = yield* dmCampaign("The Variant Vault").pipe(Effect.orDie);
        const ammunition = yield* withActor(actor, itemWithSourceIndex("ammunition")).pipe(
          Effect.orDie,
        );
        const plusOne = yield* withActor(actor, itemWithSourceIndex("ammunition-1")).pipe(
          Effect.orDie,
        );

        expect(ammunition.isVariant).toBe(false);
        expect(ammunition.variantCount).toBeGreaterThan(0);
        expect(ammunition.variantIds).toContain(plusOne.id);
        expect(plusOne.isVariant).toBe(true);
        expect(plusOne.baseItemId).toBe(ammunition.id);
        expect(plusOne.baseItemName).toBe(ammunition.name);

        const rawBase = MAGIC_ITEM_RAW.find((item) => item.index === "ammunition");
        if (rawBase === undefined) throw new Error("expected raw Ammunition");
        const bad = yield* Effect.exit(importSystemMagicItems([rawBase]));
        expect(bad._tag).toBe("Failure");
      }),
    );

    it.effect("filters in SQL by one-value arrays, attunement and variant state", () =>
      Effect.gen(function* () {
        const { actor } = yield* dmCampaign("The Item Filters").pipe(Effect.orDie);
        const page = yield* withActor(
          actor,
          Effect.flatMap(MagicItems, (magicItems) =>
            magicItems.library({
              q: "weapon",
              categories: ["weapon"],
              rarities: ["rare"],
              attunement: ["none"],
              variantStates: ["variant"],
              sort: "rarity",
              limit: 20,
            }),
          ),
        ).pipe(Effect.orDie);

        expect(page.items.map((item) => item.name)).toContain("Weapon, +2");
        expect(page.items.every((item) => item.categoryIndex === "weapon")).toBe(true);
        expect(page.items.every((item) => item.rarityIndex === "rare")).toBe(true);
        expect(page.items.every((item) => !item.requiresAttunement)).toBe(true);
        expect(page.items.every((item) => item.isVariant)).toBe(true);
      }),
    );

    it.effect("keeps Library originals per reader: another account's Library shows nothing", () =>
      Effect.gen(function* () {
        // The Library is the whole magic-item surface since the instancing
        // decision of 2026-09-02 — no campaign list, no copy-in, no per-campaign
        // sharing. The boundary left to pin is the Library's own.
        const { actor: firstDm } = yield* dmCampaign("The Private Hoard").pipe(Effect.orDie);
        const { actor: secondDm } = yield* dmCampaign("The Other Hoard").pipe(Effect.orDie);

        const original = yield* withActor(
          firstDm,
          Effect.flatMap(MagicItems, (magicItems) =>
            magicItems.libraryCreate(customItem("Fen's Lantern Ring")),
          ),
        ).pipe(Effect.orDie);

        const mine = yield* withActor(
          firstDm,
          Effect.flatMap(MagicItems, (magicItems) =>
            magicItems.library({ q: "Fen's Lantern Ring" }),
          ),
        ).pipe(Effect.orDie);
        const theirs = yield* withActor(
          secondDm,
          Effect.flatMap(MagicItems, (magicItems) =>
            magicItems.library({ q: "Fen's Lantern Ring" }),
          ),
        ).pipe(Effect.orDie);

        expect(original.isVariant).toBe(false);
        expect(original.variantCount).toBe(0);
        expect(original.campaignId).toBeNull();
        expect(mine.items.map((item) => item.id)).toEqual([original.id]);
        expect(theirs.items).toEqual([]);
      }),
    );

    it.effect("refuses a variant/base relation that crosses ownership scopes", () =>
      Effect.gen(function* () {
        const { actor } = yield* dmCampaign("The Cross-Scope Vault").pipe(Effect.orDie);
        const base = yield* withActor(actor, itemWithSourceIndex("ammunition")).pipe(Effect.orDie);
        const result = yield* Effect.result(
          withActor(
            actor,
            Effect.flatMap(
              SqlClient.SqlClient,
              (client) =>
                client`
                insert into magic_item (
                  account_id, name, category_index, category_name, rarity_index, rarity_name,
                  rarity_sort, requires_attunement, is_variant, base_item_id, variant_count, body
                ) values (
                  ${actor.accountId}, 'Cross-scope Arrow', 'ammunition', 'Ammunition', 'rare', 'Rare',
                  30, false, true, ${base.id}, 0, ${JSON.stringify({
                    item: { index: "cross-scope-arrow", name: "Cross-scope Arrow" },
                    equipmentCategory: { index: "ammunition", name: "Ammunition" },
                    rarity: { index: "rare", name: "Rare" },
                    desc: [],
                    variant: true,
                    variants: [],
                  })}
                )
              `,
            ),
          ),
        );

        expect(result._tag).toBe("Failure");
      }),
    );
  });
});
