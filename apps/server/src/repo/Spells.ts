import {
  type AccountId,
  type CampaignId,
  CurrentActor,
  NotFound,
  type Page,
  Spell,
  type SpellBody,
  type SpellCreate,
  type SpellFilterValues,
  type SpellId,
  type SpellLibraryCreate,
  type SpellLibraryUpdate,
  type SpellReference,
  type SpellSort,
  type SpellUpdate,
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
import {
  copyableIntoCampaign,
  corpusRowReadable,
  ensureCampaignReadable,
  ensureCampaignWritable,
  libraryRowReadable,
  libraryRowWritable,
  rowWritable,
} from "./visibility.js";

interface SpellRow extends ProvenanceColumns {
  readonly id: SpellId;
  readonly campaign_id: CampaignId | null;
  readonly account_id: AccountId | null;
  readonly derived_from: SpellId | null;
  readonly source_corpus: string | null;
  readonly source_family: string | null;
  readonly source_key: string | null;
  readonly name: string;
  readonly level: number;
  readonly school_index: string;
  readonly school_name: string;
  readonly ritual: boolean;
  readonly concentration: boolean;
  readonly casting_time: string;
  readonly spell_range: string;
  readonly duration: string;
  readonly class_indexes: ReadonlyArray<string>;
  readonly class_names: ReadonlyArray<string>;
  readonly subclass_indexes: ReadonlyArray<string>;
  readonly subclass_names: ReadonlyArray<string>;
  readonly body: SpellBody;
}

export const toSpell = (row: SpellRow): Spell =>
  new Spell({
    id: row.id,
    campaignId: row.campaign_id,
    accountId: row.account_id,
    derivedFrom: row.derived_from,
    name: row.name,
    level: row.level,
    schoolIndex: row.school_index,
    schoolName: row.school_name,
    ritual: row.ritual,
    concentration: row.concentration,
    castingTime: row.casting_time,
    range: row.spell_range,
    duration: row.duration,
    classIndexes: row.class_indexes,
    classNames: row.class_names,
    subclassIndexes: row.subclass_indexes,
    subclassNames: row.subclass_names,
    spell: row.body,
    ...provenanceOf(row),
  });

const encodeBody = (body: SpellBody): string => JSON.stringify(body);

const compactReferences = (
  references: ReadonlyArray<SpellReference> | undefined,
): ReadonlyArray<SpellReference> => references ?? [];

const defaultBody = (payload: SpellCreate | SpellLibraryCreate): SpellBody =>
  payload.spell ?? {
    desc: [],
    components: [],
    school: payload.school,
    classes: compactReferences(payload.classes),
    subclasses: compactReferences(payload.subclasses),
  };

const indexesOf = (references: ReadonlyArray<SpellReference>): ReadonlyArray<string> =>
  references.map((reference) => reference.index);

const namesOf = (references: ReadonlyArray<SpellReference>): ReadonlyArray<string> =>
  references.map((reference) => reference.name);

const createColumns = (
  payload: SpellCreate | SpellLibraryCreate,
  owner: Record<string, unknown>,
) => {
  const body = defaultBody(payload);
  const school = payload.school;
  const classes = compactReferences(payload.classes ?? body.classes);
  const subclasses = compactReferences(payload.subclasses ?? body.subclasses);
  return defined({
    ...owner,
    name: payload.name,
    level: payload.level,
    school_index: school.index,
    school_name: school.name,
    ritual: payload.ritual,
    concentration: payload.concentration,
    casting_time: payload.castingTime,
    spell_range: payload.range,
    duration: payload.duration,
    class_indexes: indexesOf(classes),
    class_names: namesOf(classes),
    subclass_indexes: indexesOf(subclasses),
    subclass_names: namesOf(subclasses),
    body: encodeBody({ ...body, school, classes, subclasses }),
    visibility: "visibility" in payload ? payload.visibility : undefined,
  });
};

const updateColumns = (patch: SpellUpdate | SpellLibraryUpdate): Record<string, unknown> => {
  const school = patch.school ?? patch.spell?.school;
  const classes = patch.classes ?? patch.spell?.classes;
  const subclasses = patch.subclasses ?? patch.spell?.subclasses;
  return defined({
    name: patch.name,
    level: patch.level,
    school_index: school?.index,
    school_name: school?.name,
    ritual: patch.ritual,
    concentration: patch.concentration,
    casting_time: patch.castingTime,
    spell_range: patch.range,
    duration: patch.duration,
    class_indexes: classes === undefined ? undefined : indexesOf(classes),
    class_names: classes === undefined ? undefined : namesOf(classes),
    subclass_indexes: subclasses === undefined ? undefined : indexesOf(subclasses),
    subclass_names: subclasses === undefined ? undefined : namesOf(subclasses),
    body:
      patch.spell &&
      encodeBody({
        ...patch.spell,
        school: school ?? patch.spell.school,
        classes: classes ?? patch.spell.classes,
        subclasses: subclasses ?? patch.spell.subclasses,
      }),
    visibility: "visibility" in patch ? patch.visibility : undefined,
  });
};

const matchesQuery = (sql: SqlClient.SqlClient, query: string): Statement.Fragment =>
  sql.or([
    sql`spell.name ilike ${likeContains(query)}`,
    sql`spell.search @@ websearch_to_tsquery('english', ${query})`,
  ]);

const narrowedBy = (
  sql: SqlClient.SqlClient,
  filter: SpellFilterValues,
): ReadonlyArray<Statement.Fragment> => {
  const clauses: Array<Statement.Fragment> = [];
  if (filter.q !== undefined && filter.q.trim() !== "") {
    clauses.push(matchesQuery(sql, filter.q.trim()));
  }
  if (filter.levels !== undefined && filter.levels.length > 0) {
    clauses.push(sql`spell.level = any(${filter.levels.map((level) => Number(level))})`);
  }
  if (filter.schools !== undefined && filter.schools.length > 0) {
    clauses.push(sql`spell.school_index = any(${filter.schools})`);
  }
  if (filter.classes !== undefined && filter.classes.length > 0) {
    clauses.push(sql`spell.class_indexes && ${filter.classes}`);
  }
  if (filter.ritual !== undefined) clauses.push(sql`spell.ritual = ${filter.ritual}`);
  if (filter.concentration !== undefined) {
    clauses.push(sql`spell.concentration = ${filter.concentration}`);
  }
  return clauses;
};

const orderingsOf = (sql: SqlClient.SqlClient): Record<SpellSort, Ordering<SpellRow>> => {
  const name = orderColumn<SpellRow>(sql, sql`spell.name`, "text", (row) => row.name);
  const id = orderColumn<SpellRow>(sql, sql`spell.id`, "uuid", (row) => row.id);
  return {
    name: [name, id],
    recent: [
      timeColumn<SpellRow>(sql, sql`spell.created_at`, (row) => row.created_at, "desc"),
      name,
      id,
    ],
    level: [
      orderColumn<SpellRow>(sql, sql`spell.level`, "double precision", (row) => row.level),
      name,
      id,
    ],
  };
};

export class Spells extends Context.Service<
  Spells,
  {
    readonly list: (
      campaignId: CampaignId,
      filter: SpellFilterValues,
    ) => Effect.Effect<Page<Spell, SpellSort>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      id: SpellId,
    ) => Effect.Effect<Spell, NotFound, CurrentActor>;
    readonly create: (
      campaignId: CampaignId,
      payload: SpellCreate,
    ) => Effect.Effect<Spell, NotFound, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      id: SpellId,
      patch: SpellUpdate,
    ) => Effect.Effect<Spell, NotFound, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      id: SpellId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
    readonly derive: (
      campaignId: CampaignId,
      id: SpellId,
      patch: SpellUpdate,
    ) => Effect.Effect<Spell, NotFound, CurrentActor>;
    readonly library: (
      filter: SpellFilterValues,
    ) => Effect.Effect<Page<Spell, SpellSort>, never, CurrentActor>;
    readonly libraryFindById: (id: SpellId) => Effect.Effect<Spell, NotFound, CurrentActor>;
    readonly libraryCreate: (
      payload: SpellLibraryCreate,
    ) => Effect.Effect<Spell, never, CurrentActor>;
    readonly libraryUpdate: (
      id: SpellId,
      patch: SpellLibraryUpdate,
    ) => Effect.Effect<Spell, NotFound, CurrentActor>;
    readonly libraryRemove: (id: SpellId) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Spells") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const orderings = orderingsOf(sql);
      const orderingFor = (filter: SpellFilterValues) => {
        const sort = filter.cursor?.o ?? filter.sort ?? "level";
        return [sort, orderings[sort]] as const;
      };

      const readable = (campaignId: CampaignId, id: SpellId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<SpellRow>`
          select * from spell
          where spell.id = ${id}
            and ${corpusRowReadable(sql, "spell", campaignId, actor)}
        `;
          if (rows.length === 0) return yield* new NotFound({ resource: "spell", id });
          return rows[0]!;
        });

      const copyable = (campaignId: CampaignId, id: SpellId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<SpellRow>`
          select * from spell
          where spell.id = ${id}
            and ${copyableIntoCampaign(sql, "spell", campaignId, actor)}
        `;
          if (rows.length === 0) return yield* new NotFound({ resource: "spell", id });
          return rows[0]!;
        });

      return {
        list: (campaignId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const [sort, ordering] = orderingFor(filter);
              const rows = yield* sql<SpellRow>`
              select * from spell
              where ${sql.and([
                corpusRowReadable(sql, "spell", campaignId, actor),
                ...narrowedBy(sql, filter),
                ...pageClauses(sql, ordering, filter.cursor),
              ])}
              order by ${orderClause(sql, ordering)}
              limit ${pageLimit(filter.limit)}
            `;
              return pageOfRows(rows, filter.limit, ordering, sort, toSpell);
            }),
          ),

        findById: (campaignId, id) => dieOnSqlError(Effect.map(readable(campaignId, id), toSpell)),

        create: (campaignId, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                const rows = yield* sql<SpellRow>`
                insert into spell ${sql.insert(createColumns(payload, { campaign_id: campaignId }))}
                returning *
              `;
                return toSpell(rows[0]!);
              }),
            ),
          ),

        update: (campaignId, id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<SpellRow>`
              update spell set ${setClause(sql, updateColumns(patch))}
              where spell.id = ${id}
                and ${rowWritable(sql, "spell", campaignId, actor)}
              returning *
            `;
              if (rows.length === 0) return yield* new NotFound({ resource: "spell", id });
              return toSpell(rows[0]!);
            }),
          ),

        remove: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: SpellId }>`
              delete from spell
              where spell.id = ${id}
                and ${rowWritable(sql, "spell", campaignId, actor)}
              returning spell.id
            `;
              if (rows.length === 0) return yield* new NotFound({ resource: "spell", id });
            }),
          ),

        derive: (campaignId, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                const source = yield* copyable(campaignId, id);
                const school = patch.school ??
                  patch.spell?.school ?? {
                    index: source.school_index,
                    name: source.school_name,
                  };
                const classes = patch.classes ?? patch.spell?.classes ?? source.body.classes;
                const subclasses =
                  patch.subclasses ?? patch.spell?.subclasses ?? source.body.subclasses;
                const body = patch.spell ?? source.body;
                const rows = yield* sql<SpellRow>`
                insert into spell ${sql.insert(
                  defined({
                    campaign_id: campaignId,
                    derived_from: source.id,
                    source_corpus: source.source_corpus,
                    source_family: source.source_family,
                    source_key: source.source_key,
                    name: patch.name ?? source.name,
                    level: patch.level ?? source.level,
                    school_index: school.index,
                    school_name: school.name,
                    ritual: patch.ritual ?? source.ritual,
                    concentration: patch.concentration ?? source.concentration,
                    casting_time: patch.castingTime ?? source.casting_time,
                    spell_range: patch.range ?? source.spell_range,
                    duration: patch.duration ?? source.duration,
                    class_indexes: indexesOf(classes),
                    class_names: namesOf(classes),
                    subclass_indexes: indexesOf(subclasses),
                    subclass_names: namesOf(subclasses),
                    body: encodeBody({ ...body, school, classes, subclasses }),
                    visibility: patch.visibility,
                  }),
                )}
                returning *
              `;
                const copy = rows[0]!;
                yield* sql`
                  insert into spell_subclass (spell_id, subclass_id, ordinal)
                  select ${copy.id}, subclass_id, ordinal
                  from spell_subclass
                  where spell_id = ${source.id}
                  on conflict do nothing
                `;
                return toSpell(copy);
              }),
            ),
          ),

        library: (filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const [sort, ordering] = orderingFor(filter);
              const rows = yield* sql<SpellRow>`
              select * from spell
              where ${sql.and([
                libraryRowReadable(sql, "spell", actor),
                ...narrowedBy(sql, filter),
                ...pageClauses(sql, ordering, filter.cursor),
              ])}
              order by ${orderClause(sql, ordering)}
              limit ${pageLimit(filter.limit)}
            `;
              return pageOfRows(rows, filter.limit, ordering, sort, toSpell);
            }),
          ),

        libraryFindById: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<SpellRow>`
              select * from spell
              where spell.id = ${id}
                and ${libraryRowReadable(sql, "spell", actor)}
            `;
              if (rows.length === 0) return yield* new NotFound({ resource: "spell", id });
              return toSpell(rows[0]!);
            }),
          ),

        libraryCreate: (payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<SpellRow>`
              insert into spell ${sql.insert(createColumns(payload, { account_id: actor.accountId }))}
              returning *
            `;
              return toSpell(rows[0]!);
            }),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<SpellRow>`
              update spell set ${setClause(sql, updateColumns(patch))}
              where spell.id = ${id}
                and ${libraryRowWritable(sql, "spell", actor)}
              returning *
            `;
              if (rows.length === 0) return yield* new NotFound({ resource: "spell", id });
              return toSpell(rows[0]!);
            }),
          ),

        libraryRemove: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: SpellId }>`
              delete from spell
              where spell.id = ${id}
                and ${libraryRowWritable(sql, "spell", actor)}
              returning spell.id
            `;
              if (rows.length === 0) return yield* new NotFound({ resource: "spell", id });
            }),
          ),
      };
    }),
  );
}
