import {
  type AccountId,
  type CampaignId,
  CurrentActor,
  Feat,
  type FeatDerive,
  type FeatFilterValues,
  type FeatId,
  type FeatLibraryCreate,
  type FeatLibraryUpdate,
  type FeatPrerequisiteAbility,
  type FeatPrerequisiteAbilityInput,
  type FeatPrerequisiteGroupId,
  type FeatSort,
  type FeatUpdate,
  NotFound,
  type Page,
  type RuleAbilityScore,
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
  ensureCampaignWritable,
  libraryRowReadable,
  libraryRowWritable,
  rowWritable,
} from "./visibility.js";

interface FeatRow extends ProvenanceColumns {
  readonly id: FeatId;
  readonly campaign_id: CampaignId | null;
  readonly account_id: AccountId | null;
  readonly derived_from: FeatId | null;
  readonly source_corpus: string | null;
  readonly source_family: string | null;
  readonly source_key: string | null;
  readonly name: string;
}

interface DescriptionRow {
  readonly text: string;
}

interface PrerequisiteRow {
  readonly ability_score_id: RuleAbilityScore["id"];
  readonly ability_index: string;
  readonly ability_name: string;
  readonly ability_full_name: string | null;
  readonly ability_body: { readonly desc?: ReadonlyArray<string> };
  readonly minimum_score: number;
  readonly group_id: FeatPrerequisiteGroupId;
  readonly group_ordinal: number;
  readonly ordinal: number;
}

const toAbility = (row: PrerequisiteRow): RuleAbilityScore => ({
  id: row.ability_score_id,
  index: row.ability_index,
  name: row.ability_name,
  fullName: row.ability_full_name ?? row.ability_name,
  desc: row.ability_body.desc ?? [],
});

const toFeat = (
  row: FeatRow,
  description: ReadonlyArray<string>,
  prerequisites: ReadonlyArray<PrerequisiteRow>,
): Feat =>
  new Feat({
    id: row.id,
    campaignId: row.campaign_id,
    accountId: row.account_id,
    derivedFrom: row.derived_from,
    sourceIndex: row.source_key,
    name: row.name,
    description,
    prerequisites: prerequisites.map((prerequisite): FeatPrerequisiteAbility => ({
      abilityScoreId: prerequisite.ability_score_id,
      ability: toAbility(prerequisite),
      minimumScore: prerequisite.minimum_score,
      groupId: prerequisite.group_id,
      groupOrdinal: prerequisite.group_ordinal,
      ordinal: prerequisite.ordinal,
    })),
    ...provenanceOf(row),
  });

const featColumns = (table = "feat"): string => `${table}.*`;

const matchesQuery = (sql: SqlClient.SqlClient, query: string): Statement.Fragment =>
  sql.or([
    sql`feat.name ilike ${likeContains(query)}`,
    sql`exists (
      select 1 from feat_description
      where feat_description.feat_id = feat.id
        and feat_description.text ilike ${likeContains(query)}
    )`,
  ]);

const narrowedBy = (
  sql: SqlClient.SqlClient,
  filter: FeatFilterValues,
): ReadonlyArray<Statement.Fragment> =>
  filter.q === undefined || filter.q.trim() === "" ? [] : [matchesQuery(sql, filter.q.trim())];

const orderingsOf = (sql: SqlClient.SqlClient): Record<FeatSort, Ordering<FeatRow>> => {
  const name = orderColumn<FeatRow>(sql, sql`lower(feat.name)`, "text", (row) =>
    row.name.toLowerCase(),
  );
  const id = orderColumn<FeatRow>(sql, sql`feat.id`, "uuid", (row) => row.id);
  return {
    name: [name, id],
    recent: [
      timeColumn<FeatRow>(sql, sql`feat.created_at`, (row) => row.created_at, "desc"),
      name,
      id,
    ],
  };
};

const patchColumns = (patch: FeatDerive | FeatLibraryUpdate | FeatUpdate) =>
  defined({
    name: patch.name,
    visibility: "visibility" in patch ? patch.visibility : undefined,
  });

const syncDescription = (
  sql: SqlClient.SqlClient,
  featId: FeatId,
  description: ReadonlyArray<string>,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    yield* sql`delete from feat_description where feat_id = ${featId}`;
    for (const [ordinal, text] of description.entries()) {
      yield* sql`
        insert into feat_description (feat_id, ordinal, text)
        values (${featId}, ${ordinal}, ${text})
      `;
    }
  }).pipe(dieOnSqlError);

const syncPrerequisites = (
  sql: SqlClient.SqlClient,
  featId: FeatId,
  prerequisites: ReadonlyArray<FeatPrerequisiteAbilityInput>,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    yield* sql`delete from feat_prerequisite_group where feat_id = ${featId}`;
    if (prerequisites.length === 0) return;
    const group = yield* sql<{ readonly id: FeatPrerequisiteGroupId }>`
      insert into feat_prerequisite_group (feat_id, ordinal)
      values (${featId}, 0)
      returning id::text
    `;
    const groupId = group[0]!.id;
    for (const [ordinal, prerequisite] of prerequisites.entries()) {
      yield* sql`
        insert into feat_prerequisite_ability_score (
          feat_id, group_id, ability_score_id, minimum_score, ordinal
        )
        values (
          ${featId}, ${groupId}, ${prerequisite.abilityScoreId}, ${prerequisite.minimumScore}, ${ordinal}
        )
      `;
    }
  }).pipe(dieOnSqlError);

const copyChildren = (
  sql: SqlClient.SqlClient,
  sourceId: FeatId,
  copyId: FeatId,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const descriptions = yield* sql<DescriptionRow>`
      select text from feat_description where feat_id = ${sourceId} order by ordinal, id
    `;
    yield* syncDescription(
      sql,
      copyId,
      descriptions.map((row) => row.text),
    );

    const groups = yield* sql<{
      readonly id: FeatPrerequisiteGroupId;
      readonly ordinal: number;
    }>`
      select id::text, ordinal from feat_prerequisite_group
      where feat_id = ${sourceId}
      order by ordinal, id
    `;
    for (const group of groups) {
      const copied = yield* sql<{ readonly id: FeatPrerequisiteGroupId }>`
        insert into feat_prerequisite_group (feat_id, ordinal)
        values (${copyId}, ${group.ordinal})
        returning id::text
      `;
      const prereqs = yield* sql<{
        readonly ability_score_id: string;
        readonly minimum_score: number;
        readonly ordinal: number;
      }>`
        select ability_score_id::text, minimum_score, ordinal
        from feat_prerequisite_ability_score
        where group_id = ${group.id}
        order by ordinal, id
      `;
      for (const prerequisite of prereqs) {
        yield* sql`
          insert into feat_prerequisite_ability_score (
            feat_id, group_id, ability_score_id, minimum_score, ordinal
          ) values (
            ${copyId}, ${copied[0]!.id}, ${prerequisite.ability_score_id},
            ${prerequisite.minimum_score}, ${prerequisite.ordinal}
          )
        `;
      }
    }
  }).pipe(dieOnSqlError);

export class Feats extends Context.Service<
  Feats,
  {
    readonly list: (
      campaignId: CampaignId,
      filter: FeatFilterValues,
    ) => Effect.Effect<Page<Feat, FeatSort>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      id: FeatId,
    ) => Effect.Effect<Feat, NotFound, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      id: FeatId,
      patch: FeatUpdate,
    ) => Effect.Effect<Feat, NotFound, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      id: FeatId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
    readonly derive: (
      campaignId: CampaignId,
      id: FeatId,
      patch: FeatDerive,
    ) => Effect.Effect<Feat, NotFound, CurrentActor>;
    readonly library: (
      filter: FeatFilterValues,
    ) => Effect.Effect<Page<Feat, FeatSort>, never, CurrentActor>;
    readonly libraryFindById: (id: FeatId) => Effect.Effect<Feat, NotFound, CurrentActor>;
    readonly libraryCreate: (
      payload: FeatLibraryCreate,
    ) => Effect.Effect<Feat, never, CurrentActor>;
    readonly libraryUpdate: (
      id: FeatId,
      patch: FeatLibraryUpdate,
    ) => Effect.Effect<Feat, NotFound, CurrentActor>;
    readonly libraryRemove: (id: FeatId) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Feats") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const orderings = orderingsOf(sql);
      const orderingFor = (filter: FeatFilterValues) => {
        const sort = filter.cursor?.o ?? filter.sort ?? "name";
        return [sort, orderings[sort]] as const;
      };

      const descriptionsFor = (featId: FeatId) =>
        sql<DescriptionRow>`select text from feat_description where feat_id = ${featId} order by ordinal, id`;

      const prerequisitesFor = (featId: FeatId) =>
        sql<PrerequisiteRow>`
          select
            ability_score.id::text as ability_score_id,
            ability_score.source_key as ability_index,
            ability_score.name as ability_name,
            ability_score.full_name as ability_full_name,
            ability_score.body as ability_body,
            feat_prerequisite_ability_score.minimum_score,
            feat_prerequisite_group.id::text as group_id,
            feat_prerequisite_group.ordinal as group_ordinal,
            feat_prerequisite_ability_score.ordinal
          from feat_prerequisite_group
          join feat_prerequisite_ability_score
            on feat_prerequisite_ability_score.group_id = feat_prerequisite_group.id
          join ability_score on ability_score.id = feat_prerequisite_ability_score.ability_score_id
          where feat_prerequisite_group.feat_id = ${featId}
          order by feat_prerequisite_group.ordinal, feat_prerequisite_ability_score.ordinal,
            feat_prerequisite_ability_score.id
        `;

      const hydrate = (row: FeatRow): Effect.Effect<Feat, never> =>
        Effect.gen(function* () {
          const descriptions = yield* descriptionsFor(row.id).pipe(dieOnSqlError);
          const prerequisites = yield* prerequisitesFor(row.id).pipe(dieOnSqlError);
          return toFeat(
            row,
            descriptions.map((description) => description.text),
            prerequisites,
          );
        });

      const readable = (campaignId: CampaignId, id: FeatId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<FeatRow>`
            select ${sql.unsafe(featColumns())}
            from feat
            where feat.id = ${id}
              and ${corpusRowReadable(sql, "feat", campaignId, actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "feat", id });
          return rows[0]!;
        });

      const copyable = (campaignId: CampaignId, id: FeatId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<FeatRow>`
            select ${sql.unsafe(featColumns())}
            from feat
            where feat.id = ${id}
              and ${copyableIntoCampaign(sql, "feat", campaignId, actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "feat", id });
          return rows[0]!;
        });

      return {
        list: (campaignId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const [sort, ordering] = orderingFor(filter);
              const rows = yield* sql<FeatRow>`
                select ${sql.unsafe(featColumns())}
                from feat
                where ${sql.and([
                  corpusRowReadable(sql, "feat", campaignId, actor),
                  ...narrowedBy(sql, filter),
                  ...pageClauses(sql, ordering, filter.cursor),
                ])}
                order by ${orderClause(sql, ordering)}
                limit ${pageLimit(filter.limit)}
              `;
              const hydrated = yield* Effect.all(rows.map(hydrate), { concurrency: "unbounded" });
              const byId = new Map(hydrated.map((feat) => [feat.id, feat]));
              return pageOfRows(rows, filter.limit, ordering, sort, (row) => byId.get(row.id)!);
            }),
          ),

        findById: (campaignId, id) =>
          dieOnSqlError(Effect.flatMap(readable(campaignId, id), hydrate)),

        update: (campaignId, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const rows = yield* sql<FeatRow>`
                  update feat
                  set ${setClause(sql, patchColumns(patch))}
                  where feat.id = ${id}
                    and ${rowWritable(sql, "feat", campaignId, actor)}
                  returning ${sql.unsafe(featColumns())}
                `;
                if (rows.length === 0) return yield* new NotFound({ resource: "feat", id });
                if (patch.description !== undefined)
                  yield* syncDescription(sql, rows[0]!.id, patch.description);
                if (patch.prerequisites !== undefined)
                  yield* syncPrerequisites(sql, rows[0]!.id, patch.prerequisites);
                return yield* hydrate(rows[0]!);
              }),
            ),
          ),

        remove: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: FeatId }>`
                delete from feat
                where feat.id = ${id}
                  and ${rowWritable(sql, "feat", campaignId, actor)}
                returning feat.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "feat", id });
            }),
          ),

        derive: (campaignId, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                const source = yield* copyable(campaignId, id);
                const rows = yield* sql<FeatRow>`
                  insert into feat ${sql.insert(
                    defined({
                      campaign_id: campaignId,
                      derived_from: source.id,
                      source_corpus: source.source_corpus,
                      source_family: source.source_family,
                      source_key: source.source_key,
                      name: patch.name ?? source.name,
                      visibility: patch.visibility,
                    }),
                  )}
                  returning ${sql.unsafe(featColumns())}
                `;
                const copy = rows[0]!;
                if (patch.description === undefined && patch.prerequisites === undefined) {
                  yield* copyChildren(sql, source.id, copy.id);
                } else {
                  if (patch.description === undefined) {
                    const descriptions = yield* descriptionsFor(source.id);
                    yield* syncDescription(
                      sql,
                      copy.id,
                      descriptions.map((description) => description.text),
                    );
                  } else yield* syncDescription(sql, copy.id, patch.description);
                  if (patch.prerequisites === undefined) {
                    const prerequisites = yield* prerequisitesFor(source.id);
                    yield* syncPrerequisites(
                      sql,
                      copy.id,
                      prerequisites.map((prerequisite) => ({
                        abilityScoreId: prerequisite.ability_score_id,
                        minimumScore: prerequisite.minimum_score,
                      })),
                    );
                  } else yield* syncPrerequisites(sql, copy.id, patch.prerequisites);
                }
                return yield* hydrate(copy);
              }),
            ),
          ),

        library: (filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const [sort, ordering] = orderingFor(filter);
              const rows = yield* sql<FeatRow>`
                select ${sql.unsafe(featColumns())}
                from feat
                where ${sql.and([
                  libraryRowReadable(sql, "feat", actor),
                  ...narrowedBy(sql, filter),
                  ...pageClauses(sql, ordering, filter.cursor),
                ])}
                order by ${orderClause(sql, ordering)}
                limit ${pageLimit(filter.limit)}
              `;
              const hydrated = yield* Effect.all(rows.map(hydrate), { concurrency: "unbounded" });
              const byId = new Map(hydrated.map((feat) => [feat.id, feat]));
              return pageOfRows(rows, filter.limit, ordering, sort, (row) => byId.get(row.id)!);
            }),
          ),

        libraryFindById: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<FeatRow>`
                select ${sql.unsafe(featColumns())}
                from feat
                where feat.id = ${id}
                  and ${libraryRowReadable(sql, "feat", actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "feat", id });
              return yield* hydrate(rows[0]!);
            }),
          ),

        libraryCreate: (payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const rows = yield* sql<FeatRow>`
                  insert into feat ${sql.insert({ account_id: actor.accountId, name: payload.name })}
                  returning ${sql.unsafe(featColumns())}
                `;
                yield* syncDescription(sql, rows[0]!.id, payload.description ?? []);
                yield* syncPrerequisites(sql, rows[0]!.id, payload.prerequisites ?? []);
                return yield* hydrate(rows[0]!);
              }),
            ),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const rows = yield* sql<FeatRow>`
                  update feat
                  set ${setClause(sql, patchColumns(patch))}
                  where feat.id = ${id}
                    and ${libraryRowWritable(sql, "feat", actor)}
                  returning ${sql.unsafe(featColumns())}
                `;
                if (rows.length === 0) return yield* new NotFound({ resource: "feat", id });
                if (patch.description !== undefined)
                  yield* syncDescription(sql, rows[0]!.id, patch.description);
                if (patch.prerequisites !== undefined)
                  yield* syncPrerequisites(sql, rows[0]!.id, patch.prerequisites);
                return yield* hydrate(rows[0]!);
              }),
            ),
          ),

        libraryRemove: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: FeatId }>`
                delete from feat
                where feat.id = ${id}
                  and ${libraryRowWritable(sql, "feat", actor)}
                returning feat.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "feat", id });
            }),
          ),
      };
    }),
  );
}
