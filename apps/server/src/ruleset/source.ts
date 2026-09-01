import { Effect } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";

export type ConcreteSourceId = string;

export interface RulesSourceDefinition {
  /** Stable corpus key stored on imported domain rows. */
  readonly corpus: string;
  /** Human label for code/docs only; source-document rows are no longer stored. */
  readonly label: string;
  /** Static attribution text; not a per-row provenance graph. */
  readonly attribution: string;
}

export interface SourceKey {
  readonly sourceCorpus: string;
  readonly sourceFamily: string;
  readonly sourceKey: string;
}

export interface SourceRefLike {
  readonly index: string;
  readonly name: string;
}

/** Project-authored starter creatures. They are source-keyed, but not SRD. */
export const TAVERNS_STARTER_SOURCE: RulesSourceDefinition = {
  corpus: "taverns-starter",
  label: "Tiny Taverns starter bundle",
  attribution: "Project-authored starter data bundled with Tiny Taverns.",
};

/** The pinned 2014 5e-bits/SRD snapshot used by the bundled rules corpora. */
export const FIVE_E_BITS_2014_SOURCE: RulesSourceDefinition = {
  corpus: "5e-bits-2014",
  label: "5e-bits 2014 SRD data",
  attribution:
    "Rules data transformed from 5e-bits/5e-database commit 5a7ee5a0489b26655d343e4a41e8f7942a887af2 (MIT). Underlying Dungeons & Dragons 5th Edition SRD 5.1 material is used under the Open Game License version 1.0a.",
};

const SOURCE_INDEX = /^[a-z0-9][a-z0-9._/-]*$/;

const requireText = (value: string, name: string): void => {
  if (value.trim() === "") throw new Error(`${name} is required`);
};

const validateSource = (source: RulesSourceDefinition): void => {
  requireText(source.corpus, "rules source corpus");
  requireText(source.label, "rules source label");
  requireText(source.attribution, "rules source attribution");
};

const validateKey = (family: string, sourceKey: string): void => {
  requireText(family, "rules source family");
  requireText(sourceKey, "rules source key");
  if (!SOURCE_INDEX.test(sourceKey)) {
    throw new Error(
      `rules source key must be a stable lowercase source key, got ${JSON.stringify(sourceKey)}`,
    );
  }
};

export const sourceKeyFor = (
  source: RulesSourceDefinition,
  family: string,
  sourceKey: string,
): SourceKey => {
  validateSource(source);
  validateKey(family, sourceKey);
  return { sourceCorpus: source.corpus, sourceFamily: family, sourceKey };
};

const sourceRefKey = (reference: SourceRefLike, family: string): SourceKey =>
  sourceKeyFor(FIVE_E_BITS_2014_SOURCE, family, reference.index);

const ensureName = (reference: SourceRefLike, relation: string): void => {
  requireText(reference.name, `${relation} name`);
};

export const magicSchoolForRef = (
  sql: SqlClient.SqlClient,
  reference: SourceRefLike,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceRefKey(reference, "magic-schools");
    ensureName(reference, "magic school");
    const rows = yield* sql<{ readonly id: ConcreteSourceId }>`
      insert into magic_school (source_corpus, source_key, name)
      values (${key.sourceCorpus}, ${key.sourceKey}, ${reference.name})
      on conflict (source_corpus, source_key)
      do update set name = excluded.name, updated_at = now()
      returning id::text
    `;
    return rows[0]!.id;
  });

export const abilityScoreForRef = (
  sql: SqlClient.SqlClient,
  reference: SourceRefLike,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceRefKey(reference, "ability-scores");
    ensureName(reference, "ability score");
    const rows = yield* sql<{ readonly id: ConcreteSourceId }>`
      insert into ability_score (source_corpus, source_key, name)
      values (${key.sourceCorpus}, ${key.sourceKey}, ${reference.name})
      on conflict (source_corpus, source_key)
      do update set name = excluded.name, updated_at = now()
      returning id::text
    `;
    return rows[0]!.id;
  });

export const damageTypeForRef = (
  sql: SqlClient.SqlClient,
  reference: SourceRefLike,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceRefKey(reference, "damage-types");
    ensureName(reference, "damage type");
    const rows = yield* sql<{ readonly id: ConcreteSourceId }>`
      insert into damage_type (source_corpus, source_key, name)
      values (${key.sourceCorpus}, ${key.sourceKey}, ${reference.name})
      on conflict (source_corpus, source_key)
      do update set name = excluded.name, updated_at = now()
      returning id::text
    `;
    return rows[0]!.id;
  });

export const damageTypeIdByKey = (
  sql: SqlClient.SqlClient,
  sourceKey: string,
): Effect.Effect<ConcreteSourceId | undefined, SqlError.SqlError> => {
  const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "damage-types", sourceKey);
  return Effect.gen(function* () {
    const rows = yield* sql<{ readonly id: ConcreteSourceId }>`
      select id::text from damage_type
      where source_corpus = ${key.sourceCorpus}
        and source_key = ${key.sourceKey}
      limit 1
    `;
    return rows[0]?.id;
  });
};

export const requireDamageTypeForRef = (
  sql: SqlClient.SqlClient,
  reference: SourceRefLike,
  relation: string,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const id = yield* damageTypeIdByKey(sql, reference.index);
    if (id === undefined) throw new Error(`missing required ${relation} ${reference.index}`);
    return id;
  });

export const requireDamageTypeByKey = (
  sql: SqlClient.SqlClient,
  sourceKey: string,
  relation: string,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const id = yield* damageTypeIdByKey(sql, sourceKey);
    if (id === undefined) throw new Error(`missing required ${relation} ${sourceKey}`);
    return id;
  });

export const equipmentCategoryForRef = (
  sql: SqlClient.SqlClient,
  reference: SourceRefLike,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceRefKey(reference, "equipment-categories");
    ensureName(reference, "equipment category");
    const rows = yield* sql<{ readonly id: ConcreteSourceId }>`
      insert into equipment_category (source_corpus, source_key, name)
      values (${key.sourceCorpus}, ${key.sourceKey}, ${reference.name})
      on conflict (source_corpus, source_key)
      do update set name = excluded.name, updated_at = now()
      returning id::text
    `;
    return rows[0]!.id;
  });

export const weaponPropertyForRef = (
  sql: SqlClient.SqlClient,
  reference: SourceRefLike,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceRefKey(reference, "weapon-properties");
    ensureName(reference, "weapon property");
    const rows = yield* sql<{ readonly id: ConcreteSourceId }>`
      insert into weapon_property (source_corpus, source_key, name)
      values (${key.sourceCorpus}, ${key.sourceKey}, ${reference.name})
      on conflict (source_corpus, source_key)
      do update set name = excluded.name, updated_at = now()
      returning id::text
    `;
    return rows[0]!.id;
  });

export const magicItemRarityFor = (
  sql: SqlClient.SqlClient,
  sourceKey: string,
  name: string,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "magic-item-rarities", sourceKey);
    requireText(name, "magic item rarity name");
    const rows = yield* sql<{ readonly id: ConcreteSourceId }>`
      insert into magic_item_rarity (source_corpus, source_key, name)
      values (${key.sourceCorpus}, ${key.sourceKey}, ${name})
      on conflict (source_corpus, source_key)
      do update set name = excluded.name, updated_at = now()
      returning id::text
    `;
    return rows[0]!.id;
  });

export const proficiencyForRef = (
  sql: SqlClient.SqlClient,
  reference: SourceRefLike,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceRefKey(reference, "proficiencies");
    ensureName(reference, "proficiency");
    const rows = yield* sql<{ readonly id: ConcreteSourceId }>`
      insert into proficiency (source_corpus, source_key, name)
      values (${key.sourceCorpus}, ${key.sourceKey}, ${reference.name})
      on conflict (source_corpus, source_key)
      do update set name = excluded.name, updated_at = now()
      returning id::text
    `;
    return rows[0]!.id;
  });

export const proficiencyIdByKey = (
  sql: SqlClient.SqlClient,
  sourceKey: string,
): Effect.Effect<ConcreteSourceId | undefined, SqlError.SqlError> => {
  const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "proficiencies", sourceKey);
  return Effect.gen(function* () {
    const rows = yield* sql<{ readonly id: ConcreteSourceId }>`
      select id::text from proficiency
      where source_corpus = ${key.sourceCorpus}
        and source_key = ${key.sourceKey}
      limit 1
    `;
    return rows[0]?.id;
  });
};

export const requireProficiencyForRef = (
  sql: SqlClient.SqlClient,
  reference: SourceRefLike,
  relation: string,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const id = yield* proficiencyIdByKey(sql, reference.index);
    if (id === undefined) throw new Error(`missing required ${relation} ${reference.index}`);
    return id;
  });

export const conditionForRef = (
  sql: SqlClient.SqlClient,
  reference: SourceRefLike,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceRefKey(reference, "conditions");
    ensureName(reference, "condition");
    const rows = yield* sql<{ readonly id: ConcreteSourceId }>`
      insert into condition (source_corpus, source_key, name)
      values (${key.sourceCorpus}, ${key.sourceKey}, ${reference.name})
      on conflict (source_corpus, source_key)
      do update set name = excluded.name, updated_at = now()
      returning id::text
    `;
    return rows[0]!.id;
  });

export const conditionIdByKey = (
  sql: SqlClient.SqlClient,
  sourceKey: string,
): Effect.Effect<ConcreteSourceId | undefined, SqlError.SqlError> => {
  const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "conditions", sourceKey);
  return Effect.gen(function* () {
    const rows = yield* sql<{ readonly id: ConcreteSourceId }>`
      select id::text from condition
      where source_corpus = ${key.sourceCorpus}
        and source_key = ${key.sourceKey}
      limit 1
    `;
    return rows[0]?.id;
  });
};

export const requireConditionForRef = (
  sql: SqlClient.SqlClient,
  reference: SourceRefLike,
  relation: string,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const id = yield* conditionIdByKey(sql, reference.index);
    if (id === undefined) throw new Error(`missing required ${relation} ${reference.index}`);
    return id;
  });

export const classOptionForRef = (
  sql: SqlClient.SqlClient,
  reference: SourceRefLike,
): Effect.Effect<ConcreteSourceId, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceRefKey(reference, "classes");
    const rows = yield* sql<{ readonly id: ConcreteSourceId }>`
      select id::text from character_option
      where source_corpus = ${key.sourceCorpus}
        and source_family = ${key.sourceFamily}
        and source_key = ${key.sourceKey}
        and kind = 'class'
        and campaign_id is null
        and account_id is null
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) throw new Error(`missing required spell class ${reference.index}`);
    return row.id;
  });
