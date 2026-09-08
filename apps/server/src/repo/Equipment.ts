import {
  type AccountId,
  type CampaignId,
  CurrentActor,
  Equipment,
  type EquipmentBody,
  type EquipmentCost,
  type EquipmentFilterValues,
  type EquipmentId,
  type EquipmentLibraryCreate,
  type EquipmentLibraryUpdate,
  type EquipmentReference,
  type EquipmentSort,
  NotFound,
  type Page,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import {
  defined,
  dieOnSqlError,
  likeContains,
  type ProvenanceColumns,
  provenanceOf,
  setClause,
} from "./rows.js";
import {
  orderClause,
  orderColumn,
  type Ordering,
  pageClauses,
  pageLimit,
  pageOfRows,
  timeColumn,
} from "./paging.js";
import { libraryRowReadable, libraryRowWritable } from "./visibility.js";

interface EquipmentRow extends ProvenanceColumns {
  readonly id: EquipmentId;
  readonly campaign_id: CampaignId | null;
  readonly account_id: AccountId | null;
  readonly derived_from: EquipmentId | null;
  readonly source_corpus: string | null;
  readonly source_family: string | null;
  readonly source_key: string | null;
  readonly name: string;
  readonly category_index: string;
  readonly category_name: string;
  readonly cost_quantity: number;
  readonly cost_unit: string;
  readonly cost_gp: number;
  readonly weight: number | null;
  readonly weight_sort: number;
  readonly gear_category_index: string | null;
  readonly gear_category_name: string | null;
  readonly armor_category: string | null;
  readonly weapon_category: string | null;
  readonly weapon_range: string | null;
  readonly category_range: string | null;
  readonly tool_category: string | null;
  readonly vehicle_category: string | null;
  readonly armor_class_base: number | null;
  readonly armor_class_dex_bonus: boolean | null;
  readonly armor_class_max_bonus: number | null;
  readonly strength_minimum: number | null;
  readonly stealth_disadvantage: boolean | null;
  readonly damage_dice: string | null;
  readonly damage_type_index: string | null;
  readonly damage_type_name: string | null;
  readonly two_handed_damage_dice: string | null;
  readonly two_handed_damage_type_index: string | null;
  readonly two_handed_damage_type_name: string | null;
  readonly range_normal: number | null;
  readonly range_long: number | null;
  readonly throw_range_normal: number | null;
  readonly throw_range_long: number | null;
  readonly property_indexes: ReadonlyArray<string>;
  readonly property_names: ReadonlyArray<string>;
  readonly body: EquipmentBody;
}

export const toEquipment = (row: EquipmentRow): Equipment =>
  new Equipment({
    id: row.id,
    sourceKey: row.source_key,
    campaignId: row.campaign_id,
    accountId: row.account_id,
    derivedFrom: row.derived_from,
    name: row.name,
    categoryIndex: row.category_index,
    categoryName: row.category_name,
    costQuantity: row.cost_quantity,
    costUnit: row.cost_unit,
    costGp: row.cost_gp,
    weight: row.weight,
    gearCategoryIndex: row.gear_category_index,
    gearCategoryName: row.gear_category_name,
    armorCategory: row.armor_category,
    weaponCategory: row.weapon_category,
    weaponRange: row.weapon_range,
    categoryRange: row.category_range,
    toolCategory: row.tool_category,
    vehicleCategory: row.vehicle_category,
    armorClassBase: row.armor_class_base,
    armorClassDexBonus: row.armor_class_dex_bonus,
    armorClassMaxBonus: row.armor_class_max_bonus,
    strengthMinimum: row.strength_minimum,
    stealthDisadvantage: row.stealth_disadvantage,
    damageDice: row.damage_dice,
    damageTypeIndex: row.damage_type_index,
    damageTypeName: row.damage_type_name,
    twoHandedDamageDice: row.two_handed_damage_dice,
    rangeNormal: row.range_normal,
    rangeLong: row.range_long,
    throwRangeNormal: row.throw_range_normal,
    throwRangeLong: row.throw_range_long,
    propertyIndexes: row.property_indexes,
    propertyNames: row.property_names,
    equipment: row.body,
    ...provenanceOf(row),
  });

const encodeBody = (body: EquipmentBody): string => JSON.stringify(body);

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
      return 0;
  }
};

const costGp = (cost: EquipmentCost): number => cost.quantity * gpPerUnit(cost.unit);

const indexesOf = (references: ReadonlyArray<EquipmentReference>): ReadonlyArray<string> =>
  references.map((reference) => reference.index);

const namesOf = (references: ReadonlyArray<EquipmentReference>): ReadonlyArray<string> =>
  references.map((reference) => reference.name);

const compactReferences = (
  references: ReadonlyArray<EquipmentReference> | undefined,
): ReadonlyArray<EquipmentReference> => references ?? [];

const defaultBody = (payload: EquipmentLibraryCreate): EquipmentBody =>
  payload.equipment ??
  (defined({
    equipmentCategory: payload.equipmentCategory,
    cost: payload.cost,
    weight: payload.weight,
    gearCategory: payload.gearCategory,
    armorCategory: payload.armorCategory,
    armorClass: payload.armorClass,
    categoryRange: payload.categoryRange,
    damage: payload.damage,
    properties: payload.properties,
    range: payload.range,
    stealthDisadvantage: payload.stealthDisadvantage,
    strMinimum: payload.strMinimum,
    throwRange: payload.throwRange,
    toolCategory: payload.toolCategory,
    twoHandedDamage: payload.twoHandedDamage,
    vehicleCategory: payload.vehicleCategory,
    weaponCategory: payload.weaponCategory,
    weaponRange: payload.weaponRange,
    desc: [],
  }) as EquipmentBody);

const createColumns = (payload: EquipmentLibraryCreate, owner: Record<string, unknown>) => {
  const body = defaultBody(payload);
  const category = payload.equipmentCategory;
  const cost = payload.cost;
  const weight = payload.weight ?? body.weight;
  const gear = payload.gearCategory ?? body.gearCategory;
  const armor = payload.armorClass ?? body.armorClass;
  const damage = payload.damage ?? body.damage;
  const twoHanded = payload.twoHandedDamage ?? body.twoHandedDamage;
  const range = payload.range ?? body.range;
  const throwRange = payload.throwRange ?? body.throwRange;
  const properties = compactReferences(payload.properties ?? body.properties);
  const storedBody = {
    ...body,
    equipmentCategory: category,
    cost,
    weight,
    gearCategory: gear,
    armorCategory: payload.armorCategory ?? body.armorCategory,
    armorClass: armor,
    categoryRange: payload.categoryRange ?? body.categoryRange,
    damage,
    properties,
    range,
    stealthDisadvantage: payload.stealthDisadvantage ?? body.stealthDisadvantage,
    strMinimum: payload.strMinimum ?? body.strMinimum,
    throwRange,
    toolCategory: payload.toolCategory ?? body.toolCategory,
    twoHandedDamage: twoHanded,
    vehicleCategory: payload.vehicleCategory ?? body.vehicleCategory,
    weaponCategory: payload.weaponCategory ?? body.weaponCategory,
    weaponRange: payload.weaponRange ?? body.weaponRange,
  } satisfies EquipmentBody;
  return defined({
    ...owner,
    name: payload.name,
    category_index: category.index,
    category_name: category.name,
    cost_quantity: cost.quantity,
    cost_unit: cost.unit,
    cost_gp: costGp(cost),
    weight,
    weight_sort: weight ?? 0,
    gear_category_index: gear?.index,
    gear_category_name: gear?.name,
    armor_category: payload.armorCategory ?? body.armorCategory,
    weapon_category: payload.weaponCategory ?? body.weaponCategory,
    weapon_range: payload.weaponRange ?? body.weaponRange,
    category_range: payload.categoryRange ?? body.categoryRange,
    tool_category: payload.toolCategory ?? body.toolCategory,
    vehicle_category: payload.vehicleCategory ?? body.vehicleCategory,
    armor_class_base: armor?.base,
    armor_class_dex_bonus: armor?.dexBonus,
    armor_class_max_bonus: armor?.maxBonus,
    strength_minimum: payload.strMinimum ?? body.strMinimum,
    stealth_disadvantage: payload.stealthDisadvantage ?? body.stealthDisadvantage,
    damage_dice: damage?.damageDice,
    damage_type_index: damage?.damageType.index,
    damage_type_name: damage?.damageType.name,
    two_handed_damage_dice: twoHanded?.damageDice,
    two_handed_damage_type_index: twoHanded?.damageType.index,
    two_handed_damage_type_name: twoHanded?.damageType.name,
    range_normal: range?.normal,
    range_long: range?.long,
    throw_range_normal: throwRange?.normal,
    throw_range_long: throwRange?.long,
    property_indexes: indexesOf(properties),
    property_names: namesOf(properties),
    body: encodeBody(storedBody),
    visibility: "visibility" in payload ? payload.visibility : undefined,
  });
};

const updateColumns = (patch: EquipmentLibraryUpdate): Record<string, unknown> => {
  const body = patch.equipment;
  const category = patch.equipmentCategory ?? body?.equipmentCategory;
  const cost = patch.cost ?? body?.cost;
  const weight = patch.weight ?? body?.weight;
  const gear = patch.gearCategory ?? body?.gearCategory;
  const armor = patch.armorClass ?? body?.armorClass;
  const damage = patch.damage ?? body?.damage;
  const twoHanded = patch.twoHandedDamage ?? body?.twoHandedDamage;
  const range = patch.range ?? body?.range;
  const throwRange = patch.throwRange ?? body?.throwRange;
  const properties = patch.properties ?? body?.properties;
  const storedBody =
    body === undefined
      ? undefined
      : encodeBody({
          ...body,
          equipmentCategory: category ?? body.equipmentCategory,
          cost: cost ?? body.cost,
          weight: weight ?? body.weight,
          gearCategory: gear ?? body.gearCategory,
          armorCategory: patch.armorCategory ?? body.armorCategory,
          armorClass: armor ?? body.armorClass,
          categoryRange: patch.categoryRange ?? body.categoryRange,
          damage: damage ?? body.damage,
          properties: properties ?? body.properties,
          range: range ?? body.range,
          stealthDisadvantage: patch.stealthDisadvantage ?? body.stealthDisadvantage,
          strMinimum: patch.strMinimum ?? body.strMinimum,
          throwRange: throwRange ?? body.throwRange,
          toolCategory: patch.toolCategory ?? body.toolCategory,
          twoHandedDamage: twoHanded ?? body.twoHandedDamage,
          vehicleCategory: patch.vehicleCategory ?? body.vehicleCategory,
          weaponCategory: patch.weaponCategory ?? body.weaponCategory,
          weaponRange: patch.weaponRange ?? body.weaponRange,
        });
  return defined({
    name: patch.name,
    category_index: category?.index,
    category_name: category?.name,
    cost_quantity: cost?.quantity,
    cost_unit: cost?.unit,
    cost_gp: cost === undefined ? undefined : costGp(cost),
    weight,
    weight_sort: weight,
    gear_category_index: gear?.index,
    gear_category_name: gear?.name,
    armor_category: patch.armorCategory ?? body?.armorCategory,
    weapon_category: patch.weaponCategory ?? body?.weaponCategory,
    weapon_range: patch.weaponRange ?? body?.weaponRange,
    category_range: patch.categoryRange ?? body?.categoryRange,
    tool_category: patch.toolCategory ?? body?.toolCategory,
    vehicle_category: patch.vehicleCategory ?? body?.vehicleCategory,
    armor_class_base: armor?.base,
    armor_class_dex_bonus: armor?.dexBonus,
    armor_class_max_bonus: armor?.maxBonus,
    strength_minimum: patch.strMinimum ?? body?.strMinimum,
    stealth_disadvantage: patch.stealthDisadvantage ?? body?.stealthDisadvantage,
    damage_dice: damage?.damageDice,
    damage_type_index: damage?.damageType.index,
    damage_type_name: damage?.damageType.name,
    two_handed_damage_dice: twoHanded?.damageDice,
    two_handed_damage_type_index: twoHanded?.damageType.index,
    two_handed_damage_type_name: twoHanded?.damageType.name,
    range_normal: range?.normal,
    range_long: range?.long,
    throw_range_normal: throwRange?.normal,
    throw_range_long: throwRange?.long,
    property_indexes: properties === undefined ? undefined : indexesOf(properties),
    property_names: properties === undefined ? undefined : namesOf(properties),
    body: storedBody,
    visibility: "visibility" in patch ? patch.visibility : undefined,
  });
};

const matchesQuery = (sql: SqlClient.SqlClient, query: string): Statement.Fragment =>
  sql.or([
    sql`equipment.name ilike ${likeContains(query)}`,
    sql`equipment.search @@ websearch_to_tsquery('english', ${query})`,
  ]);

const narrowedBy = (
  sql: SqlClient.SqlClient,
  filter: EquipmentFilterValues,
): ReadonlyArray<Statement.Fragment> => {
  const clauses: Array<Statement.Fragment> = [];
  if (filter.q !== undefined && filter.q.trim() !== "") {
    clauses.push(matchesQuery(sql, filter.q.trim()));
  }
  if (filter.ids !== undefined) {
    // Exactly these rows — a sheet asking for the rows its gear names. An
    // empty list is an empty answer, not the whole shelf.
    clauses.push(
      filter.ids.length === 0 ? sql`false` : sql`equipment.id = any(${[...filter.ids]})`,
    );
  }
  if (filter.categories !== undefined && filter.categories.length > 0) {
    clauses.push(sql`equipment.category_index = any(${filter.categories})`);
  }
  if (filter.gearCategories !== undefined && filter.gearCategories.length > 0) {
    clauses.push(sql`equipment.gear_category_index = any(${filter.gearCategories})`);
  }
  if (filter.armorCategories !== undefined && filter.armorCategories.length > 0) {
    clauses.push(sql`equipment.armor_category = any(${filter.armorCategories})`);
  }
  if (filter.weaponCategories !== undefined && filter.weaponCategories.length > 0) {
    clauses.push(sql`equipment.weapon_category = any(${filter.weaponCategories})`);
  }
  if (filter.weaponRanges !== undefined && filter.weaponRanges.length > 0) {
    clauses.push(sql`equipment.weapon_range = any(${filter.weaponRanges})`);
  }
  if (filter.toolCategories !== undefined && filter.toolCategories.length > 0) {
    clauses.push(sql`equipment.tool_category = any(${filter.toolCategories})`);
  }
  if (filter.vehicleCategories !== undefined && filter.vehicleCategories.length > 0) {
    clauses.push(sql`equipment.vehicle_category = any(${filter.vehicleCategories})`);
  }
  if (filter.properties !== undefined && filter.properties.length > 0) {
    clauses.push(sql`equipment.property_indexes && ${filter.properties}`);
  }
  return clauses;
};

const orderingsOf = (sql: SqlClient.SqlClient): Record<EquipmentSort, Ordering<EquipmentRow>> => {
  const name = orderColumn<EquipmentRow>(sql, sql`equipment.name`, "text", (row) => row.name);
  const id = orderColumn<EquipmentRow>(sql, sql`equipment.id`, "uuid", (row) => row.id);
  return {
    name: [name, id],
    recent: [
      timeColumn<EquipmentRow>(sql, sql`equipment.created_at`, (row) => row.created_at, "desc"),
      name,
      id,
    ],
    cost: [
      orderColumn<EquipmentRow>(
        sql,
        sql`equipment.cost_gp`,
        "double precision",
        (row) => row.cost_gp,
      ),
      name,
      id,
    ],
    weight: [
      orderColumn<EquipmentRow>(
        sql,
        sql`equipment.weight_sort`,
        "double precision",
        (row) => row.weight_sort,
      ),
      name,
      id,
    ],
  };
};

/**
 * The 2014 mundane equipment corpus, plus an account's own originals.
 *
 * | method           | predicate            |
 * | ---------------- | -------------------- |
 * | `library`        | `libraryRowReadable` |
 * | `libraryFindById`| `libraryRowReadable` |
 * | `libraryCreate`  | owner from the actor |
 * | `libraryUpdate`  | `libraryRowWritable` |
 * | `libraryRemove`  | `libraryRowWritable` |
 *
 * The Library is this corpus's entire surface. Campaign copies became internal
 * plumbing with the instancing decision of 2026-09-02 — creature instancing
 * lives in `EncounterCreatures.create`, and equipment has no per-campaign
 * consumer at all — so the campaign-scoped methods (`list`, `findById`,
 * `create`, `update`, `remove`, `derive`) are gone with their endpoints.
 */
export class EquipmentRepo extends Context.Service<
  EquipmentRepo,
  {
    readonly library: (
      filter: EquipmentFilterValues,
    ) => Effect.Effect<Page<Equipment, EquipmentSort>, never, CurrentActor>;
    readonly libraryFindById: (id: EquipmentId) => Effect.Effect<Equipment, NotFound, CurrentActor>;
    readonly libraryCreate: (
      payload: EquipmentLibraryCreate,
    ) => Effect.Effect<Equipment, never, CurrentActor>;
    readonly libraryUpdate: (
      id: EquipmentId,
      patch: EquipmentLibraryUpdate,
    ) => Effect.Effect<Equipment, NotFound, CurrentActor>;
    readonly libraryRemove: (id: EquipmentId) => Effect.Effect<void, NotFound, CurrentActor>;
    /**
     * The bundled rows called exactly these names, case-insensitively — what
     * Hob's `proposeCharacter` resolves a drafted kit against. **Bundle only**
     * (`campaign_id` and `account_id` both null): a model naming *"Pouch"*
     * means the SRD's pouch, and an original somebody typed into their
     * Library under the same name is not what a draft should silently link.
     * Every match is returned, so the caller can tell one row from an
     * ambiguity; a name with two bundled rows stays free text there.
     */
    readonly bundledNamed: (
      names: ReadonlyArray<string>,
    ) => Effect.Effect<ReadonlyArray<Equipment>, never, CurrentActor>;
  }
>()("EquipmentRepo") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const orderings = orderingsOf(sql);
      const orderingFor = (filter: EquipmentFilterValues) => {
        const sort = filter.cursor?.o ?? filter.sort ?? "name";
        return [sort, orderings[sort]] as const;
      };

      return {
        library: (filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const [sort, ordering] = orderingFor(filter);
              const rows = yield* sql<EquipmentRow>`
              select * from equipment
              where ${sql.and([
                libraryRowReadable(sql, "equipment", actor),
                ...narrowedBy(sql, filter),
                ...pageClauses(sql, ordering, filter.cursor),
              ])}
              order by ${orderClause(sql, ordering)}
              limit ${pageLimit(filter.limit)}
            `;
              return pageOfRows(rows, filter.limit, ordering, sort, toEquipment);
            }),
          ),

        bundledNamed: (names) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const wanted = [
                ...new Set(names.map((name) => name.trim().toLowerCase()).filter((n) => n !== "")),
              ];
              if (wanted.length === 0) return [];
              const actor = yield* CurrentActor;
              const rows = yield* sql<EquipmentRow>`
              select * from equipment
              where equipment.campaign_id is null
                and equipment.account_id is null
                and lower(equipment.name) = any(${wanted})
                and ${libraryRowReadable(sql, "equipment", actor)}
              order by lower(equipment.name), equipment.id
            `;
              return rows.map(toEquipment);
            }),
          ),

        libraryFindById: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<EquipmentRow>`
              select * from equipment
              where equipment.id = ${id}
                and ${libraryRowReadable(sql, "equipment", actor)}
            `;
              if (rows.length === 0) return yield* new NotFound({ resource: "equipment", id });
              return toEquipment(rows[0]!);
            }),
          ),

        libraryCreate: (payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<EquipmentRow>`
              insert into equipment ${sql.insert(createColumns(payload, { account_id: actor.accountId }))}
              returning *
            `;
              return toEquipment(rows[0]!);
            }),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<EquipmentRow>`
              update equipment set ${setClause(sql, updateColumns(patch))}
              where equipment.id = ${id}
                and ${libraryRowWritable(sql, "equipment", actor)}
              returning *
            `;
              if (rows.length === 0) return yield* new NotFound({ resource: "equipment", id });
              return toEquipment(rows[0]!);
            }),
          ),

        libraryRemove: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: EquipmentId }>`
              delete from equipment
              where equipment.id = ${id}
                and ${libraryRowWritable(sql, "equipment", actor)}
              returning equipment.id
            `;
              if (rows.length === 0) return yield* new NotFound({ resource: "equipment", id });
            }),
          ),
      };
    }),
  );
}
