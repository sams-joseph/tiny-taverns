import {
  type AccountId,
  type CampaignId,
  CurrentActor,
  MagicItem,
  type MagicItemBody,
  type MagicItemFilterValues,
  type MagicItemId,
  type MagicItemLibraryCreate,
  type MagicItemLibraryUpdate,
  type MagicItemReference,
  type MagicItemSort,
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

interface MagicItemRow extends ProvenanceColumns {
  readonly id: MagicItemId;
  readonly campaign_id: CampaignId | null;
  readonly account_id: AccountId | null;
  readonly derived_from: MagicItemId | null;
  readonly source_corpus: string | null;
  readonly source_family: string | null;
  readonly source_key: string | null;
  readonly name: string;
  readonly category_index: string;
  readonly category_name: string;
  readonly rarity_index: string;
  readonly rarity_name: string;
  readonly rarity_sort: number;
  readonly requires_attunement: boolean;
  readonly attunement_requirement: string | null;
  readonly is_variant: boolean;
  readonly variant_count: number;
  readonly base_item_id: MagicItemId | null;
  readonly base_item_name: string | null;
  readonly variant_ids: ReadonlyArray<MagicItemId>;
  readonly variant_names: ReadonlyArray<string>;
  readonly image: string | null;
  readonly body: MagicItemBody;
}

export const toMagicItem = (row: MagicItemRow): MagicItem =>
  new MagicItem({
    id: row.id,
    campaignId: row.campaign_id,
    accountId: row.account_id,
    derivedFrom: row.derived_from,
    name: row.name,
    categoryIndex: row.category_index,
    categoryName: row.category_name,
    rarityIndex: row.rarity_index,
    rarityName: row.rarity_name,
    raritySort: row.rarity_sort,
    requiresAttunement: row.requires_attunement,
    attunementRequirement: row.attunement_requirement,
    isVariant: row.is_variant,
    variantCount: row.variant_count,
    baseItemId: row.base_item_id,
    baseItemName: row.base_item_name,
    variantIds: row.variant_ids,
    variantNames: row.variant_names,
    image: row.image,
    magicItem: row.body,
    ...provenanceOf(row),
  });

const encodeBody = (body: MagicItemBody): string => JSON.stringify(body);

const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const RARITY_SORT: Record<string, number> = {
  common: 10,
  uncommon: 20,
  rare: 30,
  "very-rare": 40,
  legendary: 50,
  artifact: 60,
  varies: 70,
};

const sourceRef = (index: string, name: string): MagicItemReference => ({ index, name });

const defaultBody = (payload: MagicItemLibraryCreate): MagicItemBody => {
  const category = payload.equipmentCategory;
  const rarity = payload.rarity;
  const requires = payload.requiresAttunement ?? payload.magicItem?.requiresAttunement ?? false;
  const requirement = requires
    ? (payload.attunementRequirement ?? payload.magicItem?.attunementRequirement)
    : undefined;
  return {
    ...(payload.magicItem ?? {}),
    item: payload.magicItem?.item ?? sourceRef(slug(payload.name), payload.name),
    equipmentCategory: category,
    rarity,
    desc: payload.desc ?? payload.magicItem?.desc ?? [],
    image: payload.image ?? payload.magicItem?.image,
    requiresAttunement: requires,
    attunementRequirement: requirement,
    variant: false,
    variants: [],
    baseItem: undefined,
  };
};

const storedBody = (
  body: MagicItemBody,
  fields: {
    readonly name: string;
    readonly category: MagicItemReference;
    readonly rarity: MagicItemReference;
    readonly requiresAttunement: boolean;
    readonly attunementRequirement: string | undefined;
    readonly desc: ReadonlyArray<string> | undefined;
    readonly image: string | undefined;
  },
): MagicItemBody => ({
  ...body,
  item: { ...(body.item ?? sourceRef(slug(fields.name), fields.name)), name: fields.name },
  equipmentCategory: fields.category,
  rarity: fields.rarity,
  desc: fields.desc ?? body.desc ?? [],
  image: fields.image ?? body.image,
  requiresAttunement: fields.requiresAttunement,
  attunementRequirement: fields.requiresAttunement ? fields.attunementRequirement : undefined,
  variant: false,
  variants: [],
  baseItem: undefined,
});

const createColumns = (payload: MagicItemLibraryCreate, owner: Record<string, unknown>) => {
  const category = payload.equipmentCategory;
  const rarity = payload.rarity;
  const body = defaultBody(payload);
  const requiresAttunement = body.requiresAttunement ?? false;
  const attunementRequirement = requiresAttunement ? body.attunementRequirement : undefined;
  const stored = storedBody(body, {
    name: payload.name,
    category,
    rarity,
    requiresAttunement,
    attunementRequirement,
    desc: payload.desc,
    image: payload.image,
  });
  return defined({
    ...owner,
    name: payload.name,
    category_index: category.index,
    category_name: category.name,
    rarity_index: rarity.index,
    rarity_name: rarity.name,
    rarity_sort: RARITY_SORT[rarity.index] ?? 100,
    requires_attunement: requiresAttunement,
    attunement_requirement: attunementRequirement,
    is_variant: false,
    variant_count: 0,
    image: stored.image,
    body: encodeBody(stored),
    visibility: "visibility" in payload ? payload.visibility : undefined,
  });
};

const updateColumns = (patch: MagicItemLibraryUpdate): Record<string, unknown> => {
  const body = patch.magicItem;
  const name = patch.name ?? body?.item.name;
  const category = patch.equipmentCategory ?? body?.equipmentCategory;
  const rarity = patch.rarity ?? body?.rarity;
  const requires = patch.requiresAttunement ?? body?.requiresAttunement;
  const attunementRequirement =
    requires === false ? null : (patch.attunementRequirement ?? body?.attunementRequirement);
  const stored =
    body === undefined
      ? undefined
      : encodeBody(
          storedBody(body, {
            name: name ?? body.item.name,
            category: category ?? body.equipmentCategory,
            rarity: rarity ?? body.rarity,
            requiresAttunement: requires ?? body.requiresAttunement ?? false,
            attunementRequirement: attunementRequirement ?? undefined,
            desc: patch.desc ?? body.desc,
            image: patch.image ?? body.image,
          }),
        );
  return defined({
    name: patch.name,
    category_index: category?.index,
    category_name: category?.name,
    rarity_index: rarity?.index,
    rarity_name: rarity?.name,
    rarity_sort: rarity === undefined ? undefined : (RARITY_SORT[rarity.index] ?? 100),
    requires_attunement: requires,
    attunement_requirement: attunementRequirement,
    image: patch.image ?? body?.image,
    body: stored,
    visibility: "visibility" in patch ? patch.visibility : undefined,
  });
};

const matchesQuery = (sql: SqlClient.SqlClient, query: string): Statement.Fragment =>
  sql.or([
    sql`magic_item.name ilike ${likeContains(query)}`,
    sql`magic_item.search @@ websearch_to_tsquery('english', ${query})`,
  ]);

const variantClause = (
  sql: SqlClient.SqlClient,
  states: NonNullable<MagicItemFilterValues["variantStates"]>,
): Statement.Fragment =>
  sql.or(
    states.map((state) => {
      switch (state) {
        case "base":
          return sql`magic_item.variant_count > 0`;
        case "variant":
          return sql`magic_item.is_variant`;
        case "standalone":
          return sql`not magic_item.is_variant and magic_item.variant_count = 0`;
      }
    }),
  );

const narrowedBy = (
  sql: SqlClient.SqlClient,
  filter: MagicItemFilterValues,
): ReadonlyArray<Statement.Fragment> => {
  const clauses: Array<Statement.Fragment> = [];
  if (filter.q !== undefined && filter.q.trim() !== "") {
    clauses.push(matchesQuery(sql, filter.q.trim()));
  }
  if (filter.categories !== undefined && filter.categories.length > 0) {
    clauses.push(sql`magic_item.category_index = any(${filter.categories})`);
  }
  if (filter.rarities !== undefined && filter.rarities.length > 0) {
    clauses.push(sql`magic_item.rarity_index = any(${filter.rarities})`);
  }
  if (
    filter.attunement !== undefined &&
    filter.attunement.length > 0 &&
    filter.attunement.length < 2
  ) {
    clauses.push(
      filter.attunement[0] === "required"
        ? sql`magic_item.requires_attunement`
        : sql`not magic_item.requires_attunement`,
    );
  }
  if (
    filter.variantStates !== undefined &&
    filter.variantStates.length > 0 &&
    filter.variantStates.length < 3
  ) {
    clauses.push(variantClause(sql, filter.variantStates));
  }
  return clauses;
};

const orderingsOf = (sql: SqlClient.SqlClient): Record<MagicItemSort, Ordering<MagicItemRow>> => {
  const name = orderColumn<MagicItemRow>(sql, sql`magic_item.name`, "text", (row) => row.name);
  const id = orderColumn<MagicItemRow>(sql, sql`magic_item.id`, "uuid", (row) => row.id);
  return {
    name: [name, id],
    recent: [
      timeColumn<MagicItemRow>(sql, sql`magic_item.created_at`, (row) => row.created_at, "desc"),
      name,
      id,
    ],
    rarity: [
      orderColumn<MagicItemRow>(
        sql,
        sql`magic_item.rarity_sort`,
        "double precision",
        (row) => row.rarity_sort,
      ),
      name,
      id,
    ],
  };
};

const selectExtras = (
  sql: SqlClient.SqlClient,
  childPredicate: Statement.Fragment,
): Statement.Fragment => sql`
  magic_item.*,
  magic_item_base.name as base_item_name,
  coalesce(array(
    select magic_item_variant.id
    from magic_item magic_item_variant
    where magic_item_variant.base_item_id = magic_item.id
      and ${childPredicate}
    order by magic_item_variant.name, magic_item_variant.id
  ), '{}'::uuid[]) as variant_ids,
  coalesce(array(
    select magic_item_variant.name
    from magic_item magic_item_variant
    where magic_item_variant.base_item_id = magic_item.id
      and ${childPredicate}
    order by magic_item_variant.name, magic_item_variant.id
  ), '{}'::text[]) as variant_names
`;

/**
 * The 2014 SRD magic-item hoard, plus an account's own originals.
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
 * lives in `EncounterCreatures.create`, and magic items have no per-campaign
 * consumer at all — so the campaign-scoped methods (`list`, `findById`,
 * `create`, `update`, `remove`, `derive`) are gone with their endpoints.
 */
export class MagicItems extends Context.Service<
  MagicItems,
  {
    readonly library: (
      filter: MagicItemFilterValues,
    ) => Effect.Effect<Page<MagicItem, MagicItemSort>, never, CurrentActor>;
    readonly libraryFindById: (id: MagicItemId) => Effect.Effect<MagicItem, NotFound, CurrentActor>;
    readonly libraryCreate: (
      payload: MagicItemLibraryCreate,
    ) => Effect.Effect<MagicItem, never, CurrentActor>;
    readonly libraryUpdate: (
      id: MagicItemId,
      patch: MagicItemLibraryUpdate,
    ) => Effect.Effect<MagicItem, NotFound, CurrentActor>;
    readonly libraryRemove: (id: MagicItemId) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("MagicItems") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const orderings = orderingsOf(sql);
      const orderingFor = (filter: MagicItemFilterValues) => {
        const sort = filter.cursor?.o ?? filter.sort ?? "name";
        return [sort, orderings[sort]] as const;
      };

      const libraryExtras = (actor: Parameters<typeof libraryRowReadable>[2]) =>
        selectExtras(sql, libraryRowReadable(sql, "magic_item_variant", actor));

      return {
        library: (filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const [sort, ordering] = orderingFor(filter);
              const rows = yield* sql<MagicItemRow>`
                select ${libraryExtras(actor)}
                from magic_item
                left join magic_item magic_item_base
                  on magic_item_base.id = magic_item.base_item_id
                 and ${libraryRowReadable(sql, "magic_item_base", actor)}
                where ${sql.and([
                  libraryRowReadable(sql, "magic_item", actor),
                  ...narrowedBy(sql, filter),
                  ...pageClauses(sql, ordering, filter.cursor),
                ])}
                order by ${orderClause(sql, ordering)}
                limit ${pageLimit(filter.limit)}
              `;
              return pageOfRows(rows, filter.limit, ordering, sort, toMagicItem);
            }),
          ),

        libraryFindById: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<MagicItemRow>`
                select ${libraryExtras(actor)}
                from magic_item
                left join magic_item magic_item_base
                  on magic_item_base.id = magic_item.base_item_id
                 and ${libraryRowReadable(sql, "magic_item_base", actor)}
                where magic_item.id = ${id}
                  and ${libraryRowReadable(sql, "magic_item", actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "magic_item", id });
              return toMagicItem(rows[0]!);
            }),
          ),

        libraryCreate: (payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<MagicItemRow>`
                insert into magic_item ${sql.insert(createColumns(payload, { account_id: actor.accountId }))}
                returning *, null::text as base_item_name, '{}'::uuid[] as variant_ids, '{}'::text[] as variant_names
              `;
              return toMagicItem(rows[0]!);
            }),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<MagicItemRow>`
                update magic_item set ${setClause(sql, updateColumns(patch))}
                where magic_item.id = ${id}
                  and ${libraryRowWritable(sql, "magic_item", actor)}
                returning *, null::text as base_item_name, '{}'::uuid[] as variant_ids, '{}'::text[] as variant_names
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "magic_item", id });
              return toMagicItem(rows[0]!);
            }),
          ),

        libraryRemove: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: MagicItemId }>`
                delete from magic_item
                where magic_item.id = ${id}
                  and ${libraryRowWritable(sql, "magic_item", actor)}
                returning magic_item.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "magic_item", id });
            }),
          ),
      };
    }),
  );
}
