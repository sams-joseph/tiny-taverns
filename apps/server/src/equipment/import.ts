import { EquipmentBody } from "@taverns/api";
import { Effect, Schema } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import {
  beginRulesImport,
  FIVE_E_BITS_2014_SOURCE,
  sourceLinkFor,
  sourceRevisionFor,
  type SourceRevision,
} from "../ruleset/source.js";
import { SOURCE_REFERENCES } from "../ruleset/systemOptions.js";
import {
  DAMAGE_TYPE_RAW,
  EQUIPMENT_CATEGORY_RAW,
  EQUIPMENT_RAW,
  WEAPON_PROPERTY_RAW,
} from "./systemEquipment.js";

export interface ImportEquipmentResult {
  readonly inserted: number;
  readonly updated: number;
  readonly seen: number;
}

interface SourceRef {
  readonly index: string;
  readonly name: string;
  readonly url?: string;
}

export interface SystemEquipment {
  readonly sourceIndex: string;
  readonly sourceUrl?: string;
  readonly name: string;
  readonly category: SourceRef;
  readonly cost: { readonly quantity: number; readonly unit: string };
  readonly costGp: number;
  readonly weight: number | undefined;
  readonly gearCategory: SourceRef | undefined;
  readonly armorCategory: string | undefined;
  readonly weaponCategory: string | undefined;
  readonly weaponRange: string | undefined;
  readonly categoryRange: string | undefined;
  readonly toolCategory: string | undefined;
  readonly vehicleCategory: string | undefined;
  readonly armorClass: EquipmentBody["armorClass"];
  readonly strengthMinimum: number | undefined;
  readonly stealthDisadvantage: boolean | undefined;
  readonly damage: EquipmentBody["damage"];
  readonly twoHandedDamage: EquipmentBody["twoHandedDamage"];
  readonly range: EquipmentBody["range"];
  readonly throwRange: EquipmentBody["throwRange"];
  readonly properties: ReadonlyArray<SourceRef>;
  readonly body: EquipmentBody;
  readonly raw: Record<string, unknown>;
}

const decodeBody = Schema.decodeSync(EquipmentBody);

const sourceUrlFor = (url: string | undefined): string | undefined =>
  url === undefined ? undefined : `https://www.dnd5eapi.co${url}`;

const rawText = (row: Record<string, unknown>, key: string): string => {
  const value = row[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`equipment source ${key} is required`);
  }
  return value;
};

const rawNumber = (row: Record<string, unknown>, key: string): number => {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`equipment source ${key} must be a non-negative number`);
  }
  return value;
};

const optionalText = (row: Record<string, unknown>, key: string): string | undefined => {
  const value = row[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`equipment source ${key} must be text when present`);
  }
  return value;
};

const optionalNumber = (row: Record<string, unknown>, key: string): number | undefined => {
  const value = row[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`equipment source ${key} must be a non-negative number when present`);
  }
  return value;
};

const optionalBoolean = (row: Record<string, unknown>, key: string): boolean | undefined => {
  const value = row[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`equipment source ${key} must be boolean`);
  return value;
};

const optionalTexts = (
  row: Record<string, unknown>,
  key: string,
): ReadonlyArray<string> | undefined => {
  const value = row[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`equipment source ${key} must be an array of strings`);
  }
  return value;
};

const recordOf = (value: unknown, key: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`equipment ${key} is required`);
  }
  return value as Record<string, unknown>;
};

const optionalRecord = (
  row: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined => {
  const value = row[key];
  if (value === undefined) return undefined;
  return recordOf(value, key);
};

const refOf = (value: unknown, key: string): SourceRef => {
  const row = recordOf(value, key);
  const index = row.index;
  const name = row.name;
  const url = row.url;
  if (typeof index !== "string" || index.trim() === "") {
    throw new Error(`equipment ${key}.index is required`);
  }
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error(`equipment ${key}.name is required`);
  }
  if (url !== undefined && typeof url !== "string") {
    throw new Error(`equipment ${key}.url must be text`);
  }
  return { index, name, url };
};

const refsOf = (row: Record<string, unknown>, key: string): ReadonlyArray<SourceRef> => {
  const value = row[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`equipment source ${key} must be an array`);
  return value.map((item) => refOf(item, key));
};

const costOf = (row: Record<string, unknown>): SystemEquipment["cost"] => {
  const cost = recordOf(row.cost, "cost");
  return { quantity: rawNumber(cost, "quantity"), unit: rawText(cost, "unit") };
};

const gpPerUnit = (unit: string): number => {
  switch (unit.toLowerCase()) {
    case "cp":
      return 0.01;
    case "sp":
      return 0.1;
    case "ep":
      return 0.5;
    case "gp":
      return 1;
    case "pp":
      return 10;
    default:
      throw new Error(`equipment cost unit ${unit} is not recognized`);
  }
};

const costGp = (cost: SystemEquipment["cost"]): number => cost.quantity * gpPerUnit(cost.unit);

const armorClassOf = (row: Record<string, unknown>): EquipmentBody["armorClass"] => {
  const armor = optionalRecord(row, "armor_class");
  if (armor === undefined) return undefined;
  const dex = armor.dex_bonus;
  if (typeof dex !== "boolean") throw new Error("equipment armor_class.dex_bonus is required");
  return {
    base: rawNumber(armor, "base"),
    dexBonus: dex,
    maxBonus: optionalNumber(armor, "max_bonus"),
  };
};

const rangeOf = (row: Record<string, unknown>, key: "range"): EquipmentBody["range"] => {
  const range = optionalRecord(row, key);
  if (range === undefined) return undefined;
  return { normal: rawNumber(range, "normal"), long: optionalNumber(range, "long") };
};

const throwRangeOf = (row: Record<string, unknown>): EquipmentBody["throwRange"] => {
  const range = optionalRecord(row, "throw_range");
  if (range === undefined) return undefined;
  return { normal: rawNumber(range, "normal"), long: rawNumber(range, "long") };
};

const speedOf = (row: Record<string, unknown>): EquipmentBody["speed"] => {
  const speed = optionalRecord(row, "speed");
  if (speed === undefined) return undefined;
  return { quantity: rawNumber(speed, "quantity"), unit: rawText(speed, "unit") };
};

const damageOf = (
  row: Record<string, unknown>,
  key: "damage" | "two_handed_damage",
): EquipmentBody["damage"] => {
  const damage = optionalRecord(row, key);
  if (damage === undefined) return undefined;
  return { damageDice: rawText(damage, "damage_dice"), damageType: refOf(damage.damage_type, key) };
};

const contentsOf = (row: Record<string, unknown>): EquipmentBody["contents"] => {
  const contents = row.contents;
  if (contents === undefined) return undefined;
  if (!Array.isArray(contents)) throw new Error("equipment source contents must be an array");
  return contents.map((item) => {
    const record = recordOf(item, "contents[]");
    return { item: refOf(record.item, "contents.item"), quantity: rawNumber(record, "quantity") };
  });
};

const transformedEquipment = (row: Record<string, unknown>): SystemEquipment => {
  const category = refOf(row.equipment_category, "equipment_category");
  const cost = costOf(row);
  const gearCategory =
    row.gear_category === undefined ? undefined : refOf(row.gear_category, "gear_category");
  const properties = refsOf(row, "properties");
  const damage = damageOf(row, "damage");
  const twoHandedDamage = damageOf(row, "two_handed_damage");
  const range = rangeOf(row, "range");
  const throwRange = throwRangeOf(row);
  const armorClass = armorClassOf(row);
  const body = decodeBody({
    equipmentCategory: category,
    cost,
    desc: optionalTexts(row, "desc"),
    weight: optionalNumber(row, "weight"),
    gearCategory,
    armorCategory: optionalText(row, "armor_category"),
    armorClass,
    capacity: optionalText(row, "capacity"),
    categoryRange: optionalText(row, "category_range"),
    contents: contentsOf(row),
    damage,
    image: optionalText(row, "image"),
    properties,
    quantity: optionalNumber(row, "quantity"),
    range,
    special: optionalTexts(row, "special"),
    speed: speedOf(row),
    stealthDisadvantage: optionalBoolean(row, "stealth_disadvantage"),
    strMinimum: optionalNumber(row, "str_minimum"),
    throwRange,
    toolCategory: optionalText(row, "tool_category"),
    twoHandedDamage,
    vehicleCategory: optionalText(row, "vehicle_category"),
    weaponCategory: optionalText(row, "weapon_category"),
    weaponRange: optionalText(row, "weapon_range"),
    sourceUrl: typeof row.url === "string" ? sourceUrlFor(row.url) : undefined,
  });

  return {
    sourceIndex: rawText(row, "index"),
    sourceUrl: typeof row.url === "string" ? sourceUrlFor(row.url) : undefined,
    name: rawText(row, "name"),
    category,
    cost,
    costGp: costGp(cost),
    weight: body.weight,
    gearCategory,
    armorCategory: body.armorCategory,
    weaponCategory: body.weaponCategory,
    weaponRange: body.weaponRange,
    categoryRange: body.categoryRange,
    toolCategory: body.toolCategory,
    vehicleCategory: body.vehicleCategory,
    armorClass,
    strengthMinimum: body.strMinimum,
    stealthDisadvantage: body.stealthDisadvantage,
    damage,
    twoHandedDamage,
    range,
    throwRange,
    properties,
    body,
    raw: row,
  };
};

const sourceFamilyOf = (url: string | undefined): string | undefined =>
  url?.match(/^\/api\/2014\/([^/]+)\//)?.[1];

const referenceRows = (): ReadonlyArray<{
  readonly family: string;
  readonly row: Record<string, unknown>;
}> => [
  ...EQUIPMENT_CATEGORY_RAW.map((row) => ({ family: "equipment-categories", row })),
  ...WEAPON_PROPERTY_RAW.map((row) => ({ family: "weapon-properties", row })),
  ...DAMAGE_TYPE_RAW.map((row) => ({ family: "damage-types", row })),
];

const importReferencedEntity = (
  sql: SqlClient.SqlClient,
  context: Parameters<typeof sourceRevisionFor>[1],
  family: string,
  row: Record<string, unknown>,
) =>
  sourceRevisionFor(sql, context, {
    family,
    sourceIndex: rawText(row, "index"),
    sourceUrl: sourceUrlFor(typeof row.url === "string" ? row.url : undefined),
    name: rawText(row, "name"),
    raw: row,
  });

const linkReference = (
  sql: SqlClient.SqlClient,
  context: Parameters<typeof sourceRevisionFor>[1],
  from: SourceRevision,
  relation: string,
  reference: SourceRef | undefined,
  ordinal = 0,
): Effect.Effect<void, SqlError.SqlError> => {
  if (reference === undefined) return Effect.void;
  const family = sourceFamilyOf(reference.url);
  if (family === undefined) {
    return Effect.die(
      new Error(`equipment ${relation} reference ${reference.index} has no family`),
    );
  }
  return sourceLinkFor(sql, context, from, {
    relation,
    targetFamily: family,
    targetIndex: reference.index,
    ordinal,
    payload: { name: reference.name, url: reference.url },
  });
};

const linkEquipment = (
  sql: SqlClient.SqlClient,
  context: Parameters<typeof sourceRevisionFor>[1],
  revision: SourceRevision,
  equipment: SystemEquipment,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    yield* linkReference(sql, context, revision, "equipment-category", equipment.category);
    yield* linkReference(sql, context, revision, "gear-category", equipment.gearCategory);
    yield* linkReference(sql, context, revision, "damage-type", equipment.damage?.damageType);
    yield* linkReference(
      sql,
      context,
      revision,
      "two-handed-damage-type",
      equipment.twoHandedDamage?.damageType,
    );
    for (const [ordinal, property] of equipment.properties.entries()) {
      yield* linkReference(sql, context, revision, "weapon-property", property, ordinal);
    }
    for (const [ordinal, content] of (equipment.body.contents ?? []).entries()) {
      yield* linkReference(sql, context, revision, "contains-equipment", content.item, ordinal);
    }
  });

const requireResolvedLinks = (
  sql: SqlClient.SqlClient,
  context: Parameters<typeof sourceRevisionFor>[1],
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    const unresolved = yield* sql<{
      readonly relation: string;
      readonly target_family: string;
      readonly target_index: string;
    }>`
      select rules_source_link.relation,
             rules_source_link.target_family,
             rules_source_link.target_index
      from rules_source_link
      join rules_source_entity_revision
        on rules_source_entity_revision.id = rules_source_link.from_revision_id
      where rules_source_entity_revision.import_run_id = ${context.importRunId}
        and rules_source_link.to_entity_id is null
      order by rules_source_link.relation, rules_source_link.target_family, rules_source_link.target_index
    `;
    if (unresolved.length > 0) {
      throw new Error(
        `equipment source links did not resolve: ${unresolved
          .map((row) => `${row.relation}:${row.target_family}/${row.target_index}`)
          .join(", ")}`,
      );
    }
  });

const validateRulesetEquipmentReferences = (equipment: ReadonlyArray<SystemEquipment>): void => {
  const equipmentIndexes = new Set(equipment.map((item) => item.sourceIndex));
  const categoryIndexes = new Set(
    EQUIPMENT_CATEGORY_RAW.map((row) => (typeof row.index === "string" ? row.index : "")),
  );
  const missing = SOURCE_REFERENCES.filter((reference) => {
    if (reference.family === "equipment") return !equipmentIndexes.has(reference.index);
    if (reference.family === "equipment-categories") return !categoryIndexes.has(reference.index);
    return false;
  });
  if (missing.length > 0) {
    throw new Error(
      `ruleset starting equipment references are missing from the equipment source: ${missing
        .map((reference) => `${reference.family}/${reference.index}`)
        .join(", ")}`,
    );
  }
};

const rowsFor = (corpus: ReadonlyArray<Record<string, unknown>>): ReadonlyArray<SystemEquipment> =>
  corpus.map(transformedEquipment);

/**
 * Writes the pinned 2014 5e-bits mundane equipment corpus into `equipment` as
 * global `system` rows. The import is entirely offline: this file reads the
 * checked-in generated snapshot in `systemEquipment.ts` and records source
 * entity/revision/link rows for every relationship the equipment source names.
 */
export const importSystemEquipment = (
  corpus: ReadonlyArray<Record<string, unknown>> = EQUIPMENT_RAW,
): Effect.Effect<ImportEquipmentResult, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const equipment = rowsFor(corpus);
    validateRulesetEquipmentReferences(equipment);

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        let inserted = 0;
        let updated = 0;
        const context = yield* beginRulesImport(sql, FIVE_E_BITS_2014_SOURCE);

        for (const { family, row } of referenceRows()) {
          yield* importReferencedEntity(sql, context, family, row);
        }

        const domainSources = new Map<string, SourceRevision>();
        for (const item of equipment) {
          const source = yield* sourceRevisionFor(sql, context, {
            family: "equipment",
            sourceIndex: item.sourceIndex,
            sourceUrl: item.sourceUrl,
            name: item.name,
            raw: item.raw,
          });
          domainSources.set(item.sourceIndex, source);
        }

        for (const item of equipment) {
          const source = domainSources.get(item.sourceIndex)!;
          yield* linkEquipment(sql, context, source, item);

          const rows = yield* sql<{ readonly inserted: boolean }>`
            insert into equipment (
              campaign_id, account_id, origin, source_entity_id, source_revision_id,
              name, category_index, category_name, cost_quantity, cost_unit, cost_gp,
              weight, weight_sort, gear_category_index, gear_category_name,
              armor_category, weapon_category, weapon_range, category_range,
              tool_category, vehicle_category, armor_class_base, armor_class_dex_bonus,
              armor_class_max_bonus, strength_minimum, stealth_disadvantage,
              damage_dice, damage_type_index, damage_type_name,
              two_handed_damage_dice, two_handed_damage_type_index, two_handed_damage_type_name,
              range_normal, range_long, throw_range_normal, throw_range_long,
              property_indexes, property_names, body, visibility
            )
            values (
              null,
              null,
              'system',
              ${source.sourceEntityId},
              ${source.sourceRevisionId},
              ${item.name},
              ${item.category.index},
              ${item.category.name},
              ${item.cost.quantity},
              ${item.cost.unit},
              ${item.costGp},
              ${item.weight ?? null},
              ${item.weight ?? 0},
              ${item.gearCategory?.index ?? null},
              ${item.gearCategory?.name ?? null},
              ${item.armorCategory ?? null},
              ${item.weaponCategory ?? null},
              ${item.weaponRange ?? null},
              ${item.categoryRange ?? null},
              ${item.toolCategory ?? null},
              ${item.vehicleCategory ?? null},
              ${item.armorClass?.base ?? null},
              ${item.armorClass?.dexBonus ?? null},
              ${item.armorClass?.maxBonus ?? null},
              ${item.strengthMinimum ?? null},
              ${item.stealthDisadvantage ?? null},
              ${item.damage?.damageDice ?? null},
              ${item.damage?.damageType.index ?? null},
              ${item.damage?.damageType.name ?? null},
              ${item.twoHandedDamage?.damageDice ?? null},
              ${item.twoHandedDamage?.damageType.index ?? null},
              ${item.twoHandedDamage?.damageType.name ?? null},
              ${item.range?.normal ?? null},
              ${item.range?.long ?? null},
              ${item.throwRange?.normal ?? null},
              ${item.throwRange?.long ?? null},
              ${item.properties.map((property) => property.index)},
              ${item.properties.map((property) => property.name)},
              ${JSON.stringify(item.body)},
              'shared'
            )
            on conflict (source_entity_id)
              where campaign_id is null and account_id is null and source_entity_id is not null
            do update set
              source_revision_id            = excluded.source_revision_id,
              name                          = excluded.name,
              category_index                = excluded.category_index,
              category_name                 = excluded.category_name,
              cost_quantity                 = excluded.cost_quantity,
              cost_unit                     = excluded.cost_unit,
              cost_gp                       = excluded.cost_gp,
              weight                        = excluded.weight,
              weight_sort                   = excluded.weight_sort,
              gear_category_index           = excluded.gear_category_index,
              gear_category_name            = excluded.gear_category_name,
              armor_category                = excluded.armor_category,
              weapon_category               = excluded.weapon_category,
              weapon_range                  = excluded.weapon_range,
              category_range                = excluded.category_range,
              tool_category                 = excluded.tool_category,
              vehicle_category              = excluded.vehicle_category,
              armor_class_base              = excluded.armor_class_base,
              armor_class_dex_bonus         = excluded.armor_class_dex_bonus,
              armor_class_max_bonus         = excluded.armor_class_max_bonus,
              strength_minimum              = excluded.strength_minimum,
              stealth_disadvantage          = excluded.stealth_disadvantage,
              damage_dice                   = excluded.damage_dice,
              damage_type_index             = excluded.damage_type_index,
              damage_type_name              = excluded.damage_type_name,
              two_handed_damage_dice        = excluded.two_handed_damage_dice,
              two_handed_damage_type_index  = excluded.two_handed_damage_type_index,
              two_handed_damage_type_name   = excluded.two_handed_damage_type_name,
              range_normal                  = excluded.range_normal,
              range_long                    = excluded.range_long,
              throw_range_normal            = excluded.throw_range_normal,
              throw_range_long              = excluded.throw_range_long,
              property_indexes              = excluded.property_indexes,
              property_names                = excluded.property_names,
              body                          = excluded.body,
              updated_at                    = now()
            returning (xmax = 0) as inserted
          `;
          if (rows[0]?.inserted === true) inserted += 1;
          else updated += 1;
        }

        yield* requireResolvedLinks(sql, context);
        return { seen: equipment.length, inserted, updated };
      }),
    );
  });
