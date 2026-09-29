import {
  CurrentActor,
  Equipment,
  type EquipmentBody,
  type EquipmentCost,
  EquipmentFilterValues,
  EquipmentId,
  type EquipmentLibraryCreate,
  type EquipmentLibraryUpdate,
  type EquipmentReference,
  type EquipmentSort,
  NotFound,
  type Page,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema, type Statement } from "effect/unstable/sql";
import {
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  likeContains,
  orNotFound,
  setClause,
  timestampColumns,
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

/**
 * An `equipment` row as the wire reads it, decoded off `select *` by
 * `SqlSchema`: the document is `body`, and the `source_*` and denormalised
 * damage-type columns the wire does not carry are dropped by the decode.
 */
const equipmentFields = { ...Equipment.fields, ...timestampColumns } as const;
const EquipmentRow = classFromColumns(Equipment, equipmentFields, { equipment: "body" });

/**
 * A page's row: the same columns plus `weight_sort`, the `weight` ordering's
 * key, which is not on the wire and is not always `weight` (a row with none
 * sorts as 0). The page answers the `Equipment` built from the rest.
 */
const EquipmentPageRow = fromColumns(
  Schema.Struct({ ...equipmentFields, weightSort: Schema.Number }),
  { equipment: "body" },
);
type EquipmentPageRow = typeof EquipmentPageRow.Type;

const EquipmentFilterRequest = Schema.toType(EquipmentFilterValues);
/** The written columns, as `createColumns` and `updateColumns` build them. */
const Columns = Schema.Record(Schema.String, Schema.Unknown);

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

const orderingsOf = (
  sql: SqlClient.SqlClient,
): Record<EquipmentSort, Ordering<EquipmentPageRow>> => {
  const name = orderColumn<EquipmentPageRow>(sql, sql`equipment.name`, "text", (row) => row.name);
  const id = orderColumn<EquipmentPageRow>(sql, sql`equipment.id`, "uuid", (row) => row.id);
  return {
    name: [name, id],
    recent: [
      timeColumn<EquipmentPageRow>(
        sql,
        sql`equipment.created_at`,
        (row) => DateTime.toDateUtc(row.createdAt),
        "desc",
      ),
      name,
      id,
    ],
    cost: [
      orderColumn<EquipmentPageRow>(
        sql,
        sql`equipment.cost_gp`,
        "double precision",
        (row) => row.costGp,
      ),
      name,
      id,
    ],
    weight: [
      orderColumn<EquipmentPageRow>(
        sql,
        sql`equipment.weight_sort`,
        "double precision",
        (row) => row.weightSort,
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

      const inLibraryPage = SqlSchema.findAll({
        Request: EquipmentFilterRequest,
        Result: EquipmentPageRow,
        execute: (filter) =>
          Effect.flatMap(Effect.service(CurrentActor), (actor) => {
            const [, ordering] = orderingFor(filter);
            return sql`
              select * from equipment
              where ${sql.and([
                libraryRowReadable(sql, "equipment", actor),
                ...narrowedBy(sql, filter),
                ...pageClauses(sql, ordering, filter.cursor),
              ])}
              order by ${orderClause(sql, ordering)}
              limit ${pageLimit(filter.limit)}
            `;
          }),
      });
      const bundled = SqlSchema.findAll({
        Request: Schema.toType(Schema.Array(Schema.String)),
        Result: EquipmentRow,
        execute: (wanted) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select * from equipment
              where equipment.campaign_id is null
                and equipment.account_id is null
                and lower(equipment.name) = any(${[...wanted]})
                and ${libraryRowReadable(sql, "equipment", actor)}
              order by lower(equipment.name), equipment.id
            `,
          ),
      });
      /** One row this Library reads — its own originals and the bundle — by id. */
      const inLibrary = SqlSchema.findOne({
        Request: Schema.toType(EquipmentId),
        Result: EquipmentRow,
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select * from equipment
              where equipment.id = ${id}
                and ${libraryRowReadable(sql, "equipment", actor)}
            `,
          ),
      });
      /** A new original. `account_id` comes from the actor, in `createColumns`'s owner. */
      const insertOriginal = SqlSchema.findOne({
        Request: Schema.toType(Columns),
        Result: EquipmentRow,
        execute: (columns) => sql`insert into equipment ${sql.insert(columns)} returning *`,
      });
      const updateOriginal = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ id: EquipmentId, columns: Columns })),
        Result: EquipmentRow,
        execute: ({ id, columns }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update equipment set ${setClause(sql, columns)}
              where equipment.id = ${id}
                and ${libraryRowWritable(sql, "equipment", actor)}
              returning *
            `,
          ),
      });
      const removeOriginal = SqlSchema.findOne({
        Request: Schema.toType(EquipmentId),
        Result: fromColumns(Schema.Struct({ id: EquipmentId })),
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              delete from equipment
              where equipment.id = ${id}
                and ${libraryRowWritable(sql, "equipment", actor)}
              returning equipment.id
            `,
          ),
      });

      return {
        library: (filter) =>
          dieOnSqlError(
            Effect.map(inLibraryPage(filter), (rows) => {
              const [sort, ordering] = orderingFor(filter);
              // The decode has checked every field; the key is all that is left over.
              return pageOfRows(
                rows,
                filter.limit,
                ordering,
                sort,
                ({ weightSort: _, ...fields }) => new Equipment(fields, { disableChecks: true }),
              );
            }),
          ),

        bundledNamed: (names) => {
          const wanted = [
            ...new Set(names.map((name) => name.trim().toLowerCase()).filter((n) => n !== "")),
          ];
          return wanted.length === 0 ? Effect.succeed([]) : dieOnSqlError(bundled(wanted));
        },

        libraryFindById: (id) => dieOnSqlError(inLibrary(id).pipe(orNotFound("equipment", id))),

        libraryCreate: (payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // An insert answers with its row; not getting one is a defect.
              return yield* insertOriginal(
                createColumns(payload, { account_id: actor.accountId }),
              ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
            }),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            updateOriginal({ id, columns: updateColumns(patch) }).pipe(orNotFound("equipment", id)),
          ),

        libraryRemove: (id) =>
          dieOnSqlError(Effect.asVoid(removeOriginal(id).pipe(orNotFound("equipment", id)))),
      };
    }),
  );
}
