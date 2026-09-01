import { Effect } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import {
  classOptionForRef,
  FIVE_E_BITS_2014_SOURCE,
  sourceKeyFor,
  subclassForRef,
  type SourceRefLike,
} from "./source.js";
import {
  SYSTEM_CLASS_LEVELS,
  SYSTEM_FEATURES,
  SYSTEM_SUBCLASSES,
  type SystemClassLevel,
  type SystemFeature,
  type SystemSubclass,
} from "./systemProgression.js";

interface Count {
  readonly seen: number;
  readonly inserted: number;
  readonly updated: number;
}

export interface ImportClassProgressionResult {
  readonly subclasses: Count;
  readonly levels: Count;
  readonly features: Count;
}

const empty = (seen: number): Count => ({ seen, inserted: 0, updated: 0 });

const counted = (count: Count, inserted: boolean): Count => ({
  seen: count.seen,
  inserted: count.inserted + (inserted ? 1 : 0),
  updated: count.updated + (inserted ? 0 : 1),
});

const body = (value: Record<string, unknown>): string => JSON.stringify(value);

const classLevelBody = (level: SystemClassLevel): string =>
  body({
    ...(level.classSpecific === undefined ? {} : { classSpecific: level.classSpecific }),
    ...(level.subclassSpecific === undefined ? {} : { subclassSpecific: level.subclassSpecific }),
    ...(level.spellcasting === undefined ? {} : { spellcasting: level.spellcasting }),
    features: level.features,
  });

const featureBody = (feature: SystemFeature): string =>
  body({
    desc: feature.desc,
    prerequisites: feature.prerequisites,
    ...(feature.featureSpecific === undefined ? {} : { featureSpecific: feature.featureSpecific }),
    ...(feature.reference === undefined ? {} : { reference: feature.reference }),
  });

const classLevelId = (
  sql: SqlClient.SqlClient,
  classOptionId: string,
  subclassId: string | null,
  level: number,
): Effect.Effect<string, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows =
      subclassId === null
        ? yield* sql<{ readonly id: string }>`
            select id::text from class_level
            where class_option_id = ${classOptionId}
              and subclass_id is null
              and level = ${level}
              and campaign_id is null
              and account_id is null
            limit 1
          `
        : yield* sql<{ readonly id: string }>`
            select id::text from class_level
            where class_option_id = ${classOptionId}
              and subclass_id = ${subclassId}
              and level = ${level}
              and campaign_id is null
              and account_id is null
            limit 1
          `;
    const row = rows[0];
    if (row !== undefined) return row.id;

    if (subclassId !== null) {
      const fallback = yield* sql<{ readonly id: string }>`
        select id::text from class_level
        where class_option_id = ${classOptionId}
          and subclass_id is null
          and level = ${level}
          and campaign_id is null
          and account_id is null
        limit 1
      `;
      const baseLevel = fallback[0];
      if (baseLevel !== undefined) return baseLevel.id;
    }

    const owner = subclassId === null ? classOptionId : subclassId;
    throw new Error(`missing required class level ${owner} level ${String(level)}`);
  });

const featureIdForSourceIndex = (
  sql: SqlClient.SqlClient,
  sourceIndex: string,
): Effect.Effect<string, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "features", sourceIndex);
    const rows = yield* sql<{ readonly id: string }>`
      select id::text from feature
      where source_corpus = ${key.sourceCorpus}
        and source_family = ${key.sourceFamily}
        and source_key = ${key.sourceKey}
        and campaign_id is null
        and account_id is null
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) throw new Error(`missing required feature ${sourceIndex}`);
    return row.id;
  });

const featureIdForRef = (
  sql: SqlClient.SqlClient,
  reference: SourceRefLike,
): Effect.Effect<string, SqlError.SqlError> => featureIdForSourceIndex(sql, reference.index);

export const syncSystemClassProgression = (
  sql: SqlClient.SqlClient,
  input: {
    readonly subclasses?: ReadonlyArray<SystemSubclass>;
    readonly levels?: ReadonlyArray<SystemClassLevel>;
    readonly features?: ReadonlyArray<SystemFeature>;
  } = {},
): Effect.Effect<ImportClassProgressionResult, SqlError.SqlError> =>
  Effect.gen(function* () {
    const subclasses: ReadonlyArray<SystemSubclass> = input.subclasses ?? SYSTEM_SUBCLASSES;
    const levels: ReadonlyArray<SystemClassLevel> = input.levels ?? SYSTEM_CLASS_LEVELS;
    const features: ReadonlyArray<SystemFeature> = input.features ?? SYSTEM_FEATURES;
    let subclassCount = empty(subclasses.length);
    let levelCount = empty(levels.length);
    let featureCount = empty(features.length);

    for (const subclass of subclasses) {
      const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "subclasses", subclass.sourceIndex);
      const classOptionId = yield* classOptionForRef(sql, subclass.class);
      const rows = yield* sql<{ readonly inserted: boolean }>`
        insert into subclass (
          campaign_id, account_id, origin, source_corpus, source_family, source_key,
          class_option_id, name, flavor, body, visibility
        ) values (
          null,
          null,
          'system',
          ${key.sourceCorpus},
          ${key.sourceFamily},
          ${key.sourceKey},
          ${classOptionId},
          ${subclass.name},
          ${subclass.flavor ?? null},
          ${JSON.stringify({ desc: subclass.desc })},
          'shared'
        )
        on conflict (source_corpus, source_family, source_key)
          where campaign_id is null and account_id is null and source_key is not null
        do update set
          class_option_id = excluded.class_option_id,
          name            = excluded.name,
          flavor          = excluded.flavor,
          body            = excluded.body,
          updated_at      = now()
        returning (xmax = 0) as inserted
      `;
      subclassCount = counted(subclassCount, rows[0]?.inserted ?? false);
    }

    for (const level of levels) {
      const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "class-levels", level.sourceIndex);
      const classOptionId = yield* classOptionForRef(sql, level.class);
      const subclassId =
        level.subclass === undefined ? null : yield* subclassForRef(sql, level.subclass);
      const rows = yield* sql<{ readonly inserted: boolean }>`
        insert into class_level (
          campaign_id, account_id, origin, source_corpus, source_family, source_key,
          class_option_id, subclass_id, level, ability_score_bonuses, proficiency_bonus,
          body, visibility
        ) values (
          null,
          null,
          'system',
          ${key.sourceCorpus},
          ${key.sourceFamily},
          ${key.sourceKey},
          ${classOptionId},
          ${subclassId},
          ${level.level},
          ${level.abilityScoreBonuses ?? null},
          ${level.proficiencyBonus ?? null},
          ${classLevelBody(level)},
          'shared'
        )
        on conflict (source_corpus, source_family, source_key)
          where campaign_id is null and account_id is null and source_key is not null
        do update set
          class_option_id       = excluded.class_option_id,
          subclass_id           = excluded.subclass_id,
          level                 = excluded.level,
          ability_score_bonuses = excluded.ability_score_bonuses,
          proficiency_bonus     = excluded.proficiency_bonus,
          body                  = excluded.body,
          updated_at            = now()
        returning (xmax = 0) as inserted
      `;
      levelCount = counted(levelCount, rows[0]?.inserted ?? false);
    }

    for (const feature of features) {
      const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "features", feature.sourceIndex);
      const classOptionId = yield* classOptionForRef(sql, feature.class);
      const subclassId =
        feature.subclass === undefined ? null : yield* subclassForRef(sql, feature.subclass);
      const levelId = yield* classLevelId(sql, classOptionId, subclassId, feature.level);
      const rows = yield* sql<{ readonly inserted: boolean }>`
        insert into feature (
          campaign_id, account_id, origin, source_corpus, source_family, source_key,
          class_option_id, subclass_id, class_level_id, name, level, body, visibility
        ) values (
          null,
          null,
          'system',
          ${key.sourceCorpus},
          ${key.sourceFamily},
          ${key.sourceKey},
          ${classOptionId},
          ${subclassId},
          ${levelId},
          ${feature.name},
          ${feature.level},
          ${featureBody(feature)},
          'shared'
        )
        on conflict (source_corpus, source_family, source_key)
          where campaign_id is null and account_id is null and source_key is not null
        do update set
          class_option_id   = excluded.class_option_id,
          subclass_id       = excluded.subclass_id,
          class_level_id    = excluded.class_level_id,
          name              = excluded.name,
          level             = excluded.level,
          body              = excluded.body,
          updated_at        = now()
        returning (xmax = 0) as inserted
      `;
      featureCount = counted(featureCount, rows[0]?.inserted ?? false);
    }

    for (const feature of features) {
      if (feature.parent === undefined) continue;
      const childId = yield* featureIdForSourceIndex(sql, feature.sourceIndex);
      const parentId = yield* featureIdForRef(sql, feature.parent);
      yield* sql`update feature set parent_feature_id = ${parentId} where id = ${childId}`;
    }

    return { subclasses: subclassCount, levels: levelCount, features: featureCount };
  });

export const importClassProgression = (
  input: {
    readonly subclasses?: ReadonlyArray<SystemSubclass>;
    readonly levels?: ReadonlyArray<SystemClassLevel>;
    readonly features?: ReadonlyArray<SystemFeature>;
  } = {},
): Effect.Effect<ImportClassProgressionResult, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql.withTransaction(syncSystemClassProgression(sql, input));
  });
