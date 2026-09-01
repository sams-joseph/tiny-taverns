import { MagicItemBody } from "@taverns/api";
import { Effect, Schema } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import { EQUIPMENT_CATEGORY_RAW } from "../equipment/systemEquipment.js";
import {
  equipmentCategoryForRef,
  FIVE_E_BITS_2014_SOURCE,
  magicItemRarityFor,
  sourceKeyFor,
} from "../ruleset/source.js";
import { MAGIC_ITEM_RAW } from "./systemMagicItems.js";

export interface ImportMagicItemsResult {
  readonly inserted: number;
  readonly updated: number;
  readonly seen: number;
}

interface SourceRef {
  readonly index: string;
  readonly name: string;
  readonly url?: string;
}

export interface SystemMagicItem {
  readonly sourceIndex: string;
  readonly name: string;
  readonly equipmentCategory: SourceRef;
  readonly rarity: SourceRef;
  readonly raritySort: number;
  readonly requiresAttunement: boolean;
  readonly attunementRequirement: string | null;
  readonly isVariant: boolean;
  readonly variants: ReadonlyArray<SourceRef>;
  readonly baseItem?: SourceRef;
  readonly image?: string;
  readonly body: MagicItemBody;
  readonly raw: Record<string, unknown>;
}

const decodeBody = Schema.decodeSync(MagicItemBody);

const RARITY_SORT: Record<string, number> = {
  common: 10,
  uncommon: 20,
  rare: 30,
  "very-rare": 40,
  legendary: 50,
  artifact: 60,
  varies: 70,
};

const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const rawText = (row: Record<string, unknown>, key: string): string => {
  const value = row[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`magic item source ${key} is required`);
  }
  return value;
};

const optionalText = (row: Record<string, unknown>, key: string): string | undefined => {
  const value = row[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`magic item source ${key} must be text`);
  return value;
};

const rawBoolean = (row: Record<string, unknown>, key: string): boolean => {
  const value = row[key];
  if (typeof value !== "boolean") throw new Error(`magic item source ${key} must be boolean`);
  return value;
};

const rawTexts = (row: Record<string, unknown>, key: string): ReadonlyArray<string> => {
  const value = row[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`magic item source ${key} must be an array of strings`);
  }
  return value;
};

const refOf = (value: unknown, key: string): SourceRef => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`magic item ${key} is required`);
  }
  const record = value as Record<string, unknown>;
  const index = record.index;
  const name = record.name;
  const url = record.url;
  if (typeof index !== "string" || index.trim() === "") {
    throw new Error(`magic item ${key}.index is required`);
  }
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error(`magic item ${key}.name is required`);
  }
  if (url !== undefined && typeof url !== "string") {
    throw new Error(`magic item ${key}.url must be text`);
  }
  return { index, name, url };
};

const refsOf = (row: Record<string, unknown>, key: string): ReadonlyArray<SourceRef> => {
  const value = row[key];
  if (!Array.isArray(value)) throw new Error(`magic item source ${key} must be an array`);
  return value.map((item) => refOf(item, key));
};

const rarityOf = (row: Record<string, unknown>): SourceRef => {
  const value = row.rarity;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("magic item rarity is required");
  }
  const record = value as Record<string, unknown>;
  const name = record.name;
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("magic item rarity.name is required");
  }
  return { index: slug(name), name };
};

const attunementOf = (
  desc: ReadonlyArray<string>,
): { readonly requires: boolean; readonly requirement: string | null } => {
  const first = desc[0] ?? "";
  const match = first.match(/\((requires attunement[^)]*)\)/i);
  if (match === null) return { requires: false, requirement: null };
  return { requires: true, requirement: match[1]!.trim() };
};

const transformedMagicItems = (
  raw: ReadonlyArray<Record<string, unknown>>,
): ReadonlyArray<SystemMagicItem> => {
  const rowsByIndex = new Map<string, Record<string, unknown>>();
  for (const row of raw) {
    const index = rawText(row, "index");
    if (rowsByIndex.has(index)) throw new Error(`duplicate magic item source index ${index}`);
    rowsByIndex.set(index, row);
  }

  const baseByVariant = new Map<string, SourceRef>();
  for (const row of raw) {
    const base = {
      index: rawText(row, "index"),
      name: rawText(row, "name"),
    };
    for (const variant of refsOf(row, "variants")) {
      if (!rowsByIndex.has(variant.index)) {
        throw new Error(`magic item ${base.index} references missing variant ${variant.index}`);
      }
      if (baseByVariant.has(variant.index)) {
        throw new Error(`magic item variant ${variant.index} is referenced by more than one base`);
      }
      baseByVariant.set(variant.index, base);
    }
  }

  return raw
    .map((row) => {
      const sourceIndex = rawText(row, "index");
      const name = rawText(row, "name");
      const desc = rawTexts(row, "desc");
      const equipmentCategory = refOf(row.equipment_category, "equipment_category");
      const rarity = rarityOf(row);
      const raritySort = RARITY_SORT[rarity.index] ?? 100;
      const variants = refsOf(row, "variants");
      const isVariant = rawBoolean(row, "variant");
      const baseItem = baseByVariant.get(sourceIndex);
      if (isVariant && baseItem === undefined) {
        throw new Error(`magic item variant ${sourceIndex} is missing its base item`);
      }
      if (!isVariant && baseItem !== undefined) {
        throw new Error(`magic item ${sourceIndex} is listed as a variant but is not marked one`);
      }
      if (isVariant && variants.length > 0) {
        throw new Error(`magic item variant ${sourceIndex} cannot also list variants`);
      }
      const attunement = attunementOf(desc);
      const image = optionalText(row, "image");
      const body = decodeBody({
        item: { index: sourceIndex, name },
        equipmentCategory,
        rarity,
        desc,
        image,
        requiresAttunement: attunement.requires,
        attunementRequirement: attunement.requirement ?? undefined,
        variant: isVariant,
        variants,
        baseItem,
      });
      return {
        sourceIndex,
        name,
        equipmentCategory,
        rarity,
        raritySort,
        requiresAttunement: attunement.requires,
        attunementRequirement: attunement.requirement,
        isVariant,
        variants,
        baseItem,
        image,
        body,
        raw: row,
      };
    })
    .sort((left, right) => Number(left.isVariant) - Number(right.isVariant));
};

const referenceRows = (): ReadonlyArray<{
  readonly family: string;
  readonly row: Record<string, unknown>;
}> => [...EQUIPMENT_CATEGORY_RAW.map((row) => ({ family: "equipment-categories", row }))];

const registerReferenceRows = (sql: SqlClient.SqlClient): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    for (const { family, row } of referenceRows()) {
      if (family === "equipment-categories")
        yield* equipmentCategoryForRef(sql, refOf(row, family));
    }
  });

const syncMagicItemVariants = (
  sql: SqlClient.SqlClient,
  ids: ReadonlyMap<string, string>,
  item: SystemMagicItem,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    const baseId = ids.get(item.sourceIndex);
    if (baseId === undefined) throw new Error(`missing magic item ${item.sourceIndex}`);
    yield* sql`delete from magic_item_variant where base_item_id = ${baseId}`;
    for (const [ordinal, variant] of item.variants.entries()) {
      const variantId = ids.get(variant.index);
      if (variantId === undefined) {
        throw new Error(
          `magic item ${item.sourceIndex} references missing variant ${variant.index}`,
        );
      }
      yield* sql`
        insert into magic_item_variant (base_item_id, variant_item_id, ordinal)
        values (${baseId}, ${variantId}, ${ordinal})
      `;
    }
  });

/**
 * Writes the pinned 2014 5e-bits magic item corpus into `magic_item` as global
 * `system` rows. The source is the checked-in snapshot in `systemMagicItems.ts`;
 * this import performs no network access, and a fresh database should end with
 * exactly 362 rows.
 */
export const importSystemMagicItems = (
  raw: ReadonlyArray<Record<string, unknown>> = MAGIC_ITEM_RAW,
): Effect.Effect<ImportMagicItemsResult, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const items = transformedMagicItems(raw);

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        let inserted = 0;
        let updated = 0;

        yield* registerReferenceRows(sql);

        const ids = new Map<string, string>();
        for (const item of items) {
          const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "magic-items", item.sourceIndex);
          const baseId = item.baseItem === undefined ? null : ids.get(item.baseItem.index);
          if (item.baseItem !== undefined && baseId === undefined) {
            throw new Error(
              `magic item ${item.sourceIndex} could not find base ${item.baseItem.index}`,
            );
          }
          const categoryId = yield* equipmentCategoryForRef(sql, item.equipmentCategory);
          const rarityId = yield* magicItemRarityFor(sql, item.rarity.index, item.rarity.name);

          const rows = yield* sql<{ readonly id: string; readonly inserted: boolean }>`
            insert into magic_item (
              campaign_id, account_id, origin, source_corpus, source_family, source_key,
              category_id, rarity_id,
              name, category_index, category_name, rarity_index, rarity_name, rarity_sort,
              requires_attunement, attunement_requirement, is_variant, base_item_id,
              variant_count, image, body, visibility
            ) values (
              null,
              null,
              'system',
              ${key.sourceCorpus},
              ${key.sourceFamily},
              ${key.sourceKey},
              ${categoryId},
              ${rarityId},
              ${item.name},
              ${item.equipmentCategory.index},
              ${item.equipmentCategory.name},
              ${item.rarity.index},
              ${item.rarity.name},
              ${item.raritySort},
              ${item.requiresAttunement},
              ${item.attunementRequirement},
              ${item.isVariant},
              ${baseId},
              ${item.variants.length},
              ${item.image},
              ${JSON.stringify(item.body)},
              'shared'
            )
            on conflict (source_corpus, source_family, source_key)
              where campaign_id is null and account_id is null and source_key is not null
            do update set
              category_id           = excluded.category_id,
              rarity_id             = excluded.rarity_id,
              name                  = excluded.name,
              category_index        = excluded.category_index,
              category_name         = excluded.category_name,
              rarity_index          = excluded.rarity_index,
              rarity_name           = excluded.rarity_name,
              rarity_sort           = excluded.rarity_sort,
              requires_attunement   = excluded.requires_attunement,
              attunement_requirement = excluded.attunement_requirement,
              is_variant            = excluded.is_variant,
              base_item_id          = excluded.base_item_id,
              variant_count         = excluded.variant_count,
              image                 = excluded.image,
              body                  = excluded.body,
              updated_at            = now()
            returning id::text, (xmax = 0) as inserted
          `;
          const row = rows[0];
          if (row === undefined) throw new Error(`magic item ${item.sourceIndex} was not written`);
          ids.set(item.sourceIndex, row.id);
          if (row.inserted) inserted += 1;
          else updated += 1;
        }

        for (const item of items) {
          yield* syncMagicItemVariants(sql, ids, item);
        }

        return { inserted, updated, seen: items.length };
      }),
    );
  });
