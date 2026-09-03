import type {
  AccountId,
  CampaignId,
  CharacterOptionId,
  CharacterOptionSubraceId,
  KitEquipment,
  OptionClassLevel,
  OptionDetails,
  OptionFeatureGrant,
  OptionRelationsInput,
  OptionVocabulary,
  RuleAbilityScore,
  RuleChoiceKind,
  RuleLanguage,
  RuleProficiency,
  RuleSkill,
  RuleTrait,
  StartingKit,
} from "@taverns/api";
import { Effect } from "effect";
import { SqlClient, type SqlError, type Statement } from "effect/unstable/sql";
import { damageTypeIdByKey, FIVE_E_BITS_2014_SOURCE, sourceKeyFor } from "./source.js";
import {
  ABILITY_SCORE_RAW,
  LANGUAGE_RAW,
  PROFICIENCY_RAW,
  SKILL_RAW,
  TRAIT_RAW,
} from "./systemVocabularies.js";

interface SourceRef {
  readonly index: string;
  readonly name: string;
  readonly url?: string;
}

interface OwnerColumns {
  readonly campaign_id?: CampaignId;
  readonly account_id?: AccountId;
}

interface ChoiceOwner {
  readonly optionId?: CharacterOptionId;
  readonly subraceId?: CharacterOptionSubraceId;
  readonly traitId?: string;
}

const rawObject = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const rawText = (row: Record<string, unknown>, key: string): string => {
  const value = row[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${key} is required`);
  return value;
};

const optionalText = (row: Record<string, unknown>, key: string): string | undefined => {
  const value = row[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${key} must be text`);
  return value;
};

const rawNumber = (row: Record<string, unknown>, key: string): number => {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} is required`);
  return value;
};

const rawTexts = (row: Record<string, unknown>, key: string): ReadonlyArray<string> => {
  const value = row[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${key} must be a text array`);
  }
  return value;
};

const refsOf = (row: Record<string, unknown>, key: string): ReadonlyArray<SourceRef> => {
  const value = row[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value.map((item) => refOf(item, key));
};

const refOf = (value: unknown, label: string): SourceRef => {
  const row = rawObject(value, label);
  return {
    index: rawText(row, "index"),
    name: rawText(row, "name"),
    url: optionalText(row, "url"),
  };
};

const stripUrls = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripUrls);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "url" && key !== "sourceUrl")
        .map(([key, child]) => [key, stripUrls(child)]),
    );
  }
  return value;
};

const sourceFamilyFromUrl = (url: string | undefined): string | null => {
  const match = url?.match(/^\/api\/2014\/([^/]+)\//);
  return match?.[1] ?? null;
};

const abilityScoreIdByKey = (
  sql: SqlClient.SqlClient,
  sourceKey: string,
): Effect.Effect<string, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "ability-scores", sourceKey);
    const rows = yield* sql<{ readonly id: string }>`
      select id::text from ability_score
      where source_corpus = ${key.sourceCorpus}
        and source_key = ${key.sourceKey}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) throw new Error(`missing required ability score ${sourceKey}`);
    return row.id;
  });

const languageIdByKey = (
  sql: SqlClient.SqlClient,
  sourceKey: string,
): Effect.Effect<string, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "languages", sourceKey);
    const rows = yield* sql<{ readonly id: string }>`
      select id::text from language
      where source_corpus = ${key.sourceCorpus}
        and source_key = ${key.sourceKey}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) throw new Error(`missing required language ${sourceKey}`);
    return row.id;
  });

const skillIdByKey = (
  sql: SqlClient.SqlClient,
  sourceKey: string,
): Effect.Effect<string | null, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "skills", sourceKey);
    const rows = yield* sql<{ readonly id: string }>`
      select id::text from skill
      where source_corpus = ${key.sourceCorpus}
        and source_key = ${key.sourceKey}
      limit 1
    `;
    return rows[0]?.id ?? null;
  });

const proficiencyIdByKey = (
  sql: SqlClient.SqlClient,
  sourceKey: string,
): Effect.Effect<string, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "proficiencies", sourceKey);
    const rows = yield* sql<{ readonly id: string }>`
      select id::text from proficiency
      where source_corpus = ${key.sourceCorpus}
        and source_key = ${key.sourceKey}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) throw new Error(`missing required proficiency ${sourceKey}`);
    return row.id;
  });

const traitIdByKey = (
  sql: SqlClient.SqlClient,
  sourceKey: string,
  owner?: OwnerColumns,
): Effect.Effect<string, SqlError.SqlError> =>
  Effect.gen(function* () {
    const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "traits", sourceKey);
    const rows = yield* sql<{ readonly id: string }>`
      select id::text from racial_trait
      where source_corpus = ${key.sourceCorpus}
        and source_family = ${key.sourceFamily}
        and source_key = ${key.sourceKey}
        and campaign_id ${owner?.campaign_id === undefined ? sql`is null` : sql`= ${owner.campaign_id}`}
        and account_id ${owner?.account_id === undefined ? sql`is null` : sql`= ${owner.account_id}`}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) throw new Error(`missing required trait ${sourceKey}`);
    return row.id;
  });

const upsertAbilityScores = (sql: SqlClient.SqlClient): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    for (const row of ABILITY_SCORE_RAW) {
      const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "ability-scores", rawText(row, "index"));
      const body = stripUrls({ desc: rawTexts(row, "desc") });
      yield* sql`
        insert into ability_score (source_corpus, source_key, name, full_name, body)
        values (
          ${key.sourceCorpus},
          ${key.sourceKey},
          ${rawText(row, "name")},
          ${rawText(row, "full_name")},
          ${JSON.stringify(body)}
        )
        on conflict (source_corpus, source_key)
        do update set
          name       = excluded.name,
          full_name  = excluded.full_name,
          body       = excluded.body,
          updated_at = now()
      `;
    }
  });

const upsertLanguages = (sql: SqlClient.SqlClient): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    for (const row of LANGUAGE_RAW) {
      const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "languages", rawText(row, "index"));
      const speakers = rawTexts(row, "typical_speakers");
      yield* sql`
        insert into language (source_corpus, source_key, name, type, script, typical_speakers)
        values (
          ${key.sourceCorpus},
          ${key.sourceKey},
          ${rawText(row, "name")},
          ${rawText(row, "type")},
          ${optionalText(row, "script") ?? null},
          ${speakers}
        )
        on conflict (source_corpus, source_key)
        do update set
          name             = excluded.name,
          type             = excluded.type,
          script           = excluded.script,
          typical_speakers = excluded.typical_speakers,
          updated_at       = now()
      `;
    }
  });

const upsertSkills = (sql: SqlClient.SqlClient): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    for (const row of SKILL_RAW) {
      const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "skills", rawText(row, "index"));
      const ability = refOf(row.ability_score, "skill.ability_score");
      const abilityScoreId = yield* abilityScoreIdByKey(sql, ability.index);
      const body = stripUrls({ desc: rawTexts(row, "desc") });
      yield* sql`
        insert into skill (source_corpus, source_key, name, ability_score_id, body)
        values (${key.sourceCorpus}, ${key.sourceKey}, ${rawText(row, "name")}, ${abilityScoreId}, ${JSON.stringify(body)})
        on conflict (source_corpus, source_key)
        do update set
          name             = excluded.name,
          ability_score_id = excluded.ability_score_id,
          body             = excluded.body,
          updated_at       = now()
      `;
    }
  });

const upsertProficiencies = (sql: SqlClient.SqlClient): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    for (const row of PROFICIENCY_RAW) {
      const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "proficiencies", rawText(row, "index"));
      const reference = refOf(row.reference, "proficiency.reference");
      const referenceFamily = sourceFamilyFromUrl(reference.url);
      const skillId =
        referenceFamily === "skills" ? yield* skillIdByKey(sql, reference.index) : null;
      const abilityScoreId =
        referenceFamily === "ability-scores"
          ? yield* abilityScoreIdByKey(sql, reference.index)
          : null;
      yield* sql`
        insert into proficiency (
          source_corpus, source_key, name, type, reference_family, reference_key, skill_id, ability_score_id
        )
        values (
          ${key.sourceCorpus},
          ${key.sourceKey},
          ${rawText(row, "name")},
          ${rawText(row, "type")},
          ${referenceFamily},
          ${reference.index},
          ${skillId},
          ${abilityScoreId}
        )
        on conflict (source_corpus, source_key)
        do update set
          name             = excluded.name,
          type             = excluded.type,
          reference_family = excluded.reference_family,
          reference_key    = excluded.reference_key,
          skill_id         = excluded.skill_id,
          ability_score_id = excluded.ability_score_id,
          updated_at       = now()
      `;
    }
  });

const choiceRecord = (choice: unknown): Record<string, unknown> => rawObject(choice, "choice");

const choiceKindOf = (choice: Record<string, unknown>): RuleChoiceKind | undefined => {
  const type = choice.type;
  if (type === "languages") return "language";
  if (type === "proficiencies") return "proficiency";
  if (type === "ability_bonuses") return "ability-score";
  return undefined;
};

const optionsArray = (choice: Record<string, unknown>): ReadonlyArray<Record<string, unknown>> => {
  const from = rawObject(choice.from, "choice.from");
  if (from.option_set_type === "resource_list") return [];
  if (from.option_set_type !== "options_array") return [];
  const options = from.options;
  if (!Array.isArray(options)) throw new Error("choice options must be an array");
  return options.map((option) => rawObject(option, "choice option"));
};

const choiceRefs = (choice: Record<string, unknown>): ReadonlyArray<SourceRef> => {
  const from = rawObject(choice.from, "choice.from");
  if (from.option_set_type === "resource_list") {
    const url = optionalText(from, "resource_list_url") ?? "";
    if (url.endsWith("/languages")) {
      return LANGUAGE_RAW.map((row) => ({
        index: rawText(row, "index"),
        name: rawText(row, "name"),
      }));
    }
    return [];
  }
  return optionsArray(choice).flatMap((option) => {
    if (option.option_type !== "reference") return [];
    return [refOf(option.item, "choice option item")];
  });
};

const abilityChoiceRefs = (
  choice: Record<string, unknown>,
): ReadonlyArray<{ readonly reference: SourceRef; readonly amount: number }> =>
  optionsArray(choice).flatMap((option) => {
    if (option.option_type !== "ability_bonus") return [];
    return [
      {
        reference: refOf(option.ability_score, "ability choice"),
        amount: rawNumber(option, "bonus"),
      },
    ];
  });

const insertChoiceGroup = (
  sql: SqlClient.SqlClient,
  owner: ChoiceOwner,
  kind: RuleChoiceKind,
  choice: Record<string, unknown>,
  ordinal: number,
): Effect.Effect<string, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<{ readonly id: string }>`
      insert into rule_choice_group (option_id, subrace_id, trait_id, kind, choose, description, ordinal)
      values (
        ${owner.optionId ?? null},
        ${owner.subraceId ?? null},
        ${owner.traitId ?? null},
        ${kind},
        ${rawNumber(choice, "choose")},
        ${optionalText(choice, "desc") ?? null},
        ${ordinal}
      )
      returning id::text
    `;
    const groupId = rows[0]!.id;
    if (kind === "ability-score") {
      for (const [optionOrdinal, option] of abilityChoiceRefs(choice).entries()) {
        const abilityScoreId = yield* abilityScoreIdByKey(sql, option.reference.index);
        yield* sql`
          insert into rule_choice_ability (group_id, ability_score_id, amount, ordinal)
          values (${groupId}, ${abilityScoreId}, ${option.amount}, ${optionOrdinal})
        `;
      }
    }
    if (kind === "language") {
      for (const [optionOrdinal, reference] of choiceRefs(choice).entries()) {
        const languageId = yield* languageIdByKey(sql, reference.index);
        yield* sql`
          insert into rule_choice_language (group_id, language_id, ordinal)
          values (${groupId}, ${languageId}, ${optionOrdinal})
        `;
      }
    }
    if (kind === "proficiency") {
      for (const [optionOrdinal, reference] of choiceRefs(choice).entries()) {
        const proficiencyId = yield* proficiencyIdByKey(sql, reference.index);
        yield* sql`
          insert into rule_choice_proficiency (group_id, proficiency_id, ordinal)
          values (${groupId}, ${proficiencyId}, ${optionOrdinal})
        `;
      }
    }
    if (kind === "trait") {
      for (const [optionOrdinal, reference] of choiceRefs(choice).entries()) {
        const traitId = yield* traitIdByKey(
          sql,
          reference.index,
          owner.traitId === undefined ? undefined : {},
        );
        yield* sql`
          insert into rule_choice_trait (group_id, trait_id, ordinal)
          values (${groupId}, ${traitId}, ${optionOrdinal})
        `;
      }
    }
    return groupId;
  });

const insertMaybeChoice = (
  sql: SqlClient.SqlClient,
  owner: ChoiceOwner,
  choice: unknown,
  ordinal: number,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    if (choice === undefined) return;
    const row = choiceRecord(choice);
    const kind = choiceKindOf(row);
    if (kind !== undefined) yield* insertChoiceGroup(sql, owner, kind, row, ordinal);
  });

const insertTraitChoice = (
  sql: SqlClient.SqlClient,
  traitId: string,
  choice: unknown,
  ordinal: number,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    if (choice === undefined) return;
    const row = choiceRecord(choice);
    yield* insertChoiceGroup(sql, { traitId }, "trait", row, ordinal);
  });

const traitSpecific = (row: Record<string, unknown>): Record<string, unknown> =>
  row.trait_specific === undefined ? {} : rawObject(row.trait_specific, "trait_specific");

const upsertTraits = (sql: SqlClient.SqlClient): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    for (const row of TRAIT_RAW) {
      const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "traits", rawText(row, "index"));
      const body = stripUrls({ desc: rawTexts(row, "desc"), traitSpecific: traitSpecific(row) });
      yield* sql`
        insert into racial_trait (
          campaign_id, account_id, origin, source_corpus, source_family, source_key,
          parent_trait_id, name, body, visibility
        )
        values (
          null,
          null,
          'system',
          ${key.sourceCorpus},
          ${key.sourceFamily},
          ${key.sourceKey},
          null,
          ${rawText(row, "name")},
          ${JSON.stringify(body)},
          'shared'
        )
        on conflict (source_corpus, source_family, source_key)
          where campaign_id is null and account_id is null and source_key is not null
        do update set
          name       = excluded.name,
          body       = excluded.body,
          updated_at = now()
      `;
    }

    for (const row of TRAIT_RAW) {
      const parent = row.parent === undefined ? undefined : refOf(row.parent, "trait.parent");
      if (parent === undefined) continue;
      const parentId = yield* traitIdByKey(sql, parent.index);
      const id = yield* traitIdByKey(sql, rawText(row, "index"));
      yield* sql`update racial_trait set parent_trait_id = ${parentId} where id = ${id}`;
    }

    for (const row of TRAIT_RAW) {
      const traitId = yield* traitIdByKey(sql, rawText(row, "index"));
      yield* sql`delete from rule_choice_group where trait_id = ${traitId}`;
      yield* sql`delete from racial_trait_proficiency where trait_id = ${traitId}`;
      yield* sql`delete from racial_trait_damage_type where trait_id = ${traitId}`;

      for (const [ordinal, reference] of refsOf(row, "proficiencies").entries()) {
        const proficiencyId = yield* proficiencyIdByKey(sql, reference.index);
        yield* sql`
          insert into racial_trait_proficiency (trait_id, proficiency_id, ordinal)
          values (${traitId}, ${proficiencyId}, ${ordinal})
        `;
      }

      yield* insertMaybeChoice(sql, { traitId }, row.proficiency_choices, 0);
      yield* insertMaybeChoice(sql, { traitId }, row.language_options, 1);
      yield* insertTraitChoice(sql, traitId, traitSpecific(row).subtrait_options, 2);

      const damage = rawObject(row, "trait").trait_specific;
      const damageRecord =
        damage === undefined ? undefined : rawObject(damage, "trait_specific").damage_type;
      if (damageRecord !== undefined) {
        const damageRef = refOf(damageRecord, "trait damage type");
        const maybeDamageId = yield* damageTypeIdByKey(sql, damageRef.index);
        if (maybeDamageId !== undefined) {
          yield* sql`
            insert into racial_trait_damage_type (trait_id, damage_type_id, relation, ordinal)
            values (${traitId}, ${maybeDamageId}, 'damage', 0)
            on conflict do nothing
          `;
        }
      }
    }
  });

/** Import the five concrete vocabularies this slice owns. */
export const syncSystemVocabularies = (
  sql: SqlClient.SqlClient,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    yield* upsertAbilityScores(sql);
    yield* upsertLanguages(sql);
    yield* upsertSkills(sql);
    yield* upsertProficiencies(sql);
    yield* upsertTraits(sql);
  });

const clearOptionRelationships = (
  sql: SqlClient.SqlClient,
  optionId: CharacterOptionId,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    yield* sql`delete from rule_choice_group where option_id = ${optionId}`;
    yield* sql`delete from character_option_ability_bonus where option_id = ${optionId}`;
    yield* sql`delete from character_option_language where option_id = ${optionId}`;
    yield* sql`delete from character_option_proficiency where option_id = ${optionId}`;
    yield* sql`delete from character_option_trait where option_id = ${optionId}`;
    yield* sql`delete from character_option_subrace where option_id = ${optionId}`;
  });

const insertAbilityBonuses = (
  sql: SqlClient.SqlClient,
  optionId: CharacterOptionId,
  subraceId: CharacterOptionSubraceId | null,
  bonuses: ReadonlyArray<unknown>,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    for (const [ordinal, value] of bonuses.entries()) {
      const row = rawObject(value, "ability bonus");
      const ability = refOf(row.ability_score, "ability bonus ability_score");
      const abilityScoreId = yield* abilityScoreIdByKey(sql, ability.index);
      yield* sql`
        insert into character_option_ability_bonus (option_id, subrace_id, ability_score_id, amount, ordinal)
        values (${optionId}, ${subraceId}, ${abilityScoreId}, ${rawNumber(row, "bonus")}, ${ordinal})
      `;
    }
  });

const insertOptionLanguages = (
  sql: SqlClient.SqlClient,
  optionId: CharacterOptionId,
  subraceId: CharacterOptionSubraceId | null,
  references: ReadonlyArray<SourceRef>,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    for (const [ordinal, reference] of references.entries()) {
      const languageId = yield* languageIdByKey(sql, reference.index);
      yield* sql`
        insert into character_option_language (option_id, subrace_id, language_id, ordinal)
        values (${optionId}, ${subraceId}, ${languageId}, ${ordinal})
      `;
    }
  });

const insertOptionProficiencies = (
  sql: SqlClient.SqlClient,
  optionId: CharacterOptionId,
  subraceId: CharacterOptionSubraceId | null,
  references: ReadonlyArray<SourceRef>,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    for (const [ordinal, reference] of references.entries()) {
      const proficiencyId = yield* proficiencyIdByKey(sql, reference.index);
      yield* sql`
        insert into character_option_proficiency (option_id, subrace_id, proficiency_id, ordinal)
        values (${optionId}, ${subraceId}, ${proficiencyId}, ${ordinal})
      `;
    }
  });

const insertOptionTraits = (
  sql: SqlClient.SqlClient,
  optionId: CharacterOptionId,
  subraceId: CharacterOptionSubraceId | null,
  references: ReadonlyArray<SourceRef>,
  owner?: OwnerColumns,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    for (const [ordinal, reference] of references.entries()) {
      const traitId = yield* traitIdByKey(sql, reference.index, owner);
      yield* sql`
        insert into character_option_trait (option_id, subrace_id, trait_id, ordinal)
        values (${optionId}, ${subraceId}, ${traitId}, ${ordinal})
      `;
    }
  });

export const syncImportedOptionRelationships = (
  sql: SqlClient.SqlClient,
  optionId: CharacterOptionId,
  kind: "class" | "race" | "background",
  raw: Record<string, unknown>,
  subraceRaw: ReadonlyArray<Record<string, unknown>>,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    yield* clearOptionRelationships(sql, optionId);

    if (kind === "class") {
      yield* insertOptionProficiencies(sql, optionId, null, refsOf(raw, "proficiencies"));
      const choices = raw.proficiency_choices;
      if (Array.isArray(choices)) {
        for (const [ordinal, choice] of choices.entries()) {
          yield* insertMaybeChoice(sql, { optionId }, choice, ordinal);
        }
      }
      return;
    }

    if (kind === "background") {
      yield* insertOptionProficiencies(sql, optionId, null, refsOf(raw, "starting_proficiencies"));
      yield* insertMaybeChoice(sql, { optionId }, raw.language_options, 0);
      return;
    }

    const bonuses = raw.ability_bonuses;
    if (Array.isArray(bonuses)) yield* insertAbilityBonuses(sql, optionId, null, bonuses);
    yield* insertOptionLanguages(sql, optionId, null, refsOf(raw, "languages"));
    yield* insertMaybeChoice(sql, { optionId }, raw.language_options, 0);
    yield* insertMaybeChoice(sql, { optionId }, raw.ability_bonus_options, 1);
    yield* insertOptionTraits(sql, optionId, null, refsOf(raw, "traits"));

    for (const [ordinal, reference] of refsOf(raw, "subraces").entries()) {
      const full = subraceRaw.find((row) => rawText(row, "index") === reference.index);
      if (full === undefined) throw new Error(`missing required subrace ${reference.index}`);
      const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "subraces", reference.index);
      const body = stripUrls({ desc: optionalText(full, "desc") ?? "" });
      const rows = yield* sql<{ readonly id: CharacterOptionSubraceId }>`
        insert into character_option_subrace (
          option_id, source_corpus, source_family, source_key, name, body, ordinal
        )
        values (
          ${optionId},
          ${key.sourceCorpus},
          ${key.sourceFamily},
          ${key.sourceKey},
          ${reference.name},
          ${JSON.stringify(body)},
          ${ordinal}
        )
        returning id::text
      `;
      const subraceId = rows[0]!.id;
      const subraceBonuses = full.ability_bonuses;
      if (Array.isArray(subraceBonuses)) {
        yield* insertAbilityBonuses(sql, optionId, subraceId, subraceBonuses);
      }
      yield* insertOptionTraits(sql, optionId, subraceId, refsOf(full, "racial_traits"));
    }
  });

const syncInputChoices = (
  sql: SqlClient.SqlClient,
  optionId: CharacterOptionId,
  choices: NonNullable<OptionRelationsInput["choices"]>,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    for (const [ordinal, choice] of choices.entries()) {
      const rows = yield* sql<{ readonly id: string }>`
        insert into rule_choice_group (option_id, kind, choose, description, ordinal)
        values (${optionId}, ${choice.kind}, ${choice.choose}, ${choice.desc ?? null}, ${ordinal})
        returning id::text
      `;
      const groupId = rows[0]!.id;
      for (const [childOrdinal, ability] of (choice.abilityBonuses ?? []).entries()) {
        yield* sql`
          insert into rule_choice_ability (group_id, ability_score_id, amount, ordinal)
          values (${groupId}, ${ability.abilityScoreId}, ${ability.amount}, ${childOrdinal})
        `;
      }
      for (const [childOrdinal, languageId] of (choice.languageIds ?? []).entries()) {
        yield* sql`
          insert into rule_choice_language (group_id, language_id, ordinal)
          values (${groupId}, ${languageId}, ${childOrdinal})
        `;
      }
      for (const [childOrdinal, proficiencyId] of (choice.proficiencyIds ?? []).entries()) {
        yield* sql`
          insert into rule_choice_proficiency (group_id, proficiency_id, ordinal)
          values (${groupId}, ${proficiencyId}, ${childOrdinal})
        `;
      }
      for (const [childOrdinal, traitId] of (choice.traitIds ?? []).entries()) {
        yield* sql`
          insert into rule_choice_trait (group_id, trait_id, ordinal)
          values (${groupId}, ${traitId}, ${childOrdinal})
        `;
      }
    }
  });

/** Replace the option-level concrete relationships a user authored through controls. */
export const syncOptionRelationsInput = (
  sql: SqlClient.SqlClient,
  optionId: CharacterOptionId,
  relations: OptionRelationsInput | undefined,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    if (relations === undefined) return;
    yield* sql`delete from rule_choice_group where option_id = ${optionId} and subrace_id is null`;
    yield* sql`delete from character_option_language where option_id = ${optionId} and subrace_id is null`;
    yield* sql`delete from character_option_proficiency where option_id = ${optionId} and subrace_id is null`;
    yield* sql`delete from character_option_trait where option_id = ${optionId} and subrace_id is null`;

    for (const [ordinal, languageId] of (relations.languageIds ?? []).entries()) {
      yield* sql`
        insert into character_option_language (option_id, language_id, ordinal)
        values (${optionId}, ${languageId}, ${ordinal})
      `;
    }
    for (const [ordinal, proficiencyId] of (relations.proficiencyIds ?? []).entries()) {
      yield* sql`
        insert into character_option_proficiency (option_id, proficiency_id, ordinal)
        values (${optionId}, ${proficiencyId}, ${ordinal})
      `;
    }
    for (const [ordinal, traitId] of (relations.traitIds ?? []).entries()) {
      yield* sql`
        insert into character_option_trait (option_id, trait_id, ordinal)
        values (${optionId}, ${traitId}, ${ordinal})
      `;
    }
    yield* syncInputChoices(sql, optionId, relations.choices ?? []);
  });

const traitRow = (
  sql: SqlClient.SqlClient,
  traitId: string,
): Effect.Effect<
  {
    readonly id: string;
    readonly campaign_id: CampaignId | null;
    readonly account_id: AccountId | null;
    readonly source_corpus: string | null;
    readonly source_family: string | null;
    readonly source_key: string | null;
    readonly parent_trait_id: string | null;
    readonly name: string;
    readonly body: Record<string, unknown>;
    readonly visibility: string;
    readonly origin: string;
  },
  SqlError.SqlError
> =>
  Effect.gen(function* () {
    const rows = yield* sql<{
      readonly id: string;
      readonly campaign_id: CampaignId | null;
      readonly account_id: AccountId | null;
      readonly source_corpus: string | null;
      readonly source_family: string | null;
      readonly source_key: string | null;
      readonly parent_trait_id: string | null;
      readonly name: string;
      readonly body: Record<string, unknown>;
      readonly visibility: string;
      readonly origin: string;
    }>`select * from racial_trait where id = ${traitId}`;
    const row = rows[0];
    if (row === undefined) throw new Error(`missing trait ${traitId}`);
    return row;
  });

const copyTraitToOwner = (
  sql: SqlClient.SqlClient,
  sourceTraitId: string,
  owner: OwnerColumns,
  seen: Map<string, string>,
): Effect.Effect<string, SqlError.SqlError> =>
  Effect.gen(function* () {
    const existing = seen.get(sourceTraitId);
    if (existing !== undefined) return existing;

    const source = yield* traitRow(sql, sourceTraitId);
    const already = yield* sql<{ readonly id: string }>`
      select id::text from racial_trait
      where derived_from = ${sourceTraitId}
        and campaign_id ${owner.campaign_id === undefined ? sql`is null` : sql`= ${owner.campaign_id}`}
        and account_id ${owner.account_id === undefined ? sql`is null` : sql`= ${owner.account_id}`}
      limit 1
    `;
    if (already[0] !== undefined) {
      seen.set(sourceTraitId, already[0].id);
      return already[0].id;
    }

    const parentCopy =
      source.parent_trait_id === null
        ? null
        : yield* copyTraitToOwner(sql, source.parent_trait_id, owner, seen);
    const rows = yield* sql<{ readonly id: string }>`
      insert into racial_trait ${sql.insert({
        campaign_id: owner.campaign_id ?? null,
        account_id: owner.account_id ?? null,
        derived_from: source.id,
        source_corpus: source.source_corpus,
        source_family: source.source_family,
        source_key: source.source_key,
        parent_trait_id: parentCopy,
        name: source.name,
        body: JSON.stringify(source.body),
        visibility: source.visibility,
        origin: source.origin === "system" ? "authored" : source.origin,
      })}
      returning id::text
    `;
    const copyId = rows[0]!.id;
    seen.set(sourceTraitId, copyId);

    const profs = yield* sql<{ readonly proficiency_id: string; readonly ordinal: number }>`
      select proficiency_id::text, ordinal from racial_trait_proficiency
      where trait_id = ${sourceTraitId}
      order by ordinal
    `;
    for (const row of profs) {
      yield* sql`
        insert into racial_trait_proficiency (trait_id, proficiency_id, ordinal)
        values (${copyId}, ${row.proficiency_id}, ${row.ordinal})
      `;
    }

    const groups = yield* sql<{
      readonly id: string;
      readonly kind: RuleChoiceKind;
      readonly choose: number;
      readonly description: string | null;
      readonly ordinal: number;
    }>`
      select id::text, kind, choose, description, ordinal from rule_choice_group
      where trait_id = ${sourceTraitId}
      order by ordinal
    `;
    for (const group of groups) {
      const next = yield* sql<{ readonly id: string }>`
        insert into rule_choice_group (trait_id, kind, choose, description, ordinal)
        values (${copyId}, ${group.kind}, ${group.choose}, ${group.description}, ${group.ordinal})
        returning id::text
      `;
      const groupId = next[0]!.id;
      yield* copyChoiceChildren(sql, group.id, groupId, owner, seen);
    }
    return copyId;
  });

const copyChoiceChildren = (
  sql: SqlClient.SqlClient,
  sourceGroupId: string,
  targetGroupId: string,
  owner: OwnerColumns,
  seen: Map<string, string>,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    const abilities = yield* sql<{
      readonly ability_score_id: string;
      readonly amount: number;
      readonly ordinal: number;
    }>`
      select ability_score_id::text, amount, ordinal from rule_choice_ability
      where group_id = ${sourceGroupId}
      order by ordinal
    `;
    for (const row of abilities) {
      yield* sql`
        insert into rule_choice_ability (group_id, ability_score_id, amount, ordinal)
        values (${targetGroupId}, ${row.ability_score_id}, ${row.amount}, ${row.ordinal})
      `;
    }
    const languages = yield* sql<{ readonly language_id: string; readonly ordinal: number }>`
      select language_id::text, ordinal from rule_choice_language
      where group_id = ${sourceGroupId}
      order by ordinal
    `;
    for (const row of languages) {
      yield* sql`
        insert into rule_choice_language (group_id, language_id, ordinal)
        values (${targetGroupId}, ${row.language_id}, ${row.ordinal})
      `;
    }
    const profs = yield* sql<{ readonly proficiency_id: string; readonly ordinal: number }>`
      select proficiency_id::text, ordinal from rule_choice_proficiency
      where group_id = ${sourceGroupId}
      order by ordinal
    `;
    for (const row of profs) {
      yield* sql`
        insert into rule_choice_proficiency (group_id, proficiency_id, ordinal)
        values (${targetGroupId}, ${row.proficiency_id}, ${row.ordinal})
      `;
    }
    const traits = yield* sql<{ readonly trait_id: string; readonly ordinal: number }>`
      select trait_id::text, ordinal from rule_choice_trait
      where group_id = ${sourceGroupId}
      order by ordinal
    `;
    for (const row of traits) {
      const traitId = yield* copyTraitToOwner(sql, row.trait_id, owner, seen);
      yield* sql`
        insert into rule_choice_trait (group_id, trait_id, ordinal)
        values (${targetGroupId}, ${traitId}, ${row.ordinal})
      `;
    }
  });

/** Copy every concrete child row from one option to a new campaign/account snapshot. */
export const copyOptionRelationships = (
  sql: SqlClient.SqlClient,
  sourceOptionId: CharacterOptionId,
  targetOptionId: CharacterOptionId,
  owner: OwnerColumns,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    const seenTraits = new Map<string, string>();
    const subraceMap = new Map<string, CharacterOptionSubraceId>();

    const subraces = yield* sql<{
      readonly id: CharacterOptionSubraceId;
      readonly source_corpus: string | null;
      readonly source_family: string | null;
      readonly source_key: string | null;
      readonly name: string;
      readonly body: Record<string, unknown>;
      readonly ordinal: number;
    }>`
      select id::text, source_corpus, source_family, source_key, name, body, ordinal
      from character_option_subrace
      where option_id = ${sourceOptionId}
      order by ordinal
    `;
    for (const source of subraces) {
      const rows = yield* sql<{ readonly id: CharacterOptionSubraceId }>`
        insert into character_option_subrace (
          option_id, source_corpus, source_family, source_key, name, body, ordinal
        )
        values (
          ${targetOptionId},
          ${source.source_corpus},
          ${source.source_family},
          ${source.source_key},
          ${source.name},
          ${JSON.stringify(source.body)},
          ${source.ordinal}
        )
        returning id::text
      `;
      subraceMap.set(source.id, rows[0]!.id);
    }

    const abilities = yield* sql<{
      readonly subrace_id: CharacterOptionSubraceId | null;
      readonly ability_score_id: string;
      readonly amount: number;
      readonly ordinal: number;
    }>`
      select subrace_id::text, ability_score_id::text, amount, ordinal
      from character_option_ability_bonus
      where option_id = ${sourceOptionId}
      order by ordinal
    `;
    for (const row of abilities) {
      yield* sql`
        insert into character_option_ability_bonus (option_id, subrace_id, ability_score_id, amount, ordinal)
        values (${targetOptionId}, ${row.subrace_id === null ? null : subraceMap.get(row.subrace_id)}, ${row.ability_score_id}, ${row.amount}, ${row.ordinal})
      `;
    }

    const languages = yield* sql<{
      readonly subrace_id: CharacterOptionSubraceId | null;
      readonly language_id: string;
      readonly ordinal: number;
    }>`
      select subrace_id::text, language_id::text, ordinal
      from character_option_language
      where option_id = ${sourceOptionId}
      order by ordinal
    `;
    for (const row of languages) {
      yield* sql`
        insert into character_option_language (option_id, subrace_id, language_id, ordinal)
        values (${targetOptionId}, ${row.subrace_id === null ? null : subraceMap.get(row.subrace_id)}, ${row.language_id}, ${row.ordinal})
      `;
    }

    const profs = yield* sql<{
      readonly subrace_id: CharacterOptionSubraceId | null;
      readonly proficiency_id: string;
      readonly ordinal: number;
    }>`
      select subrace_id::text, proficiency_id::text, ordinal
      from character_option_proficiency
      where option_id = ${sourceOptionId}
      order by ordinal
    `;
    for (const row of profs) {
      yield* sql`
        insert into character_option_proficiency (option_id, subrace_id, proficiency_id, ordinal)
        values (${targetOptionId}, ${row.subrace_id === null ? null : subraceMap.get(row.subrace_id)}, ${row.proficiency_id}, ${row.ordinal})
      `;
    }

    const traits = yield* sql<{
      readonly subrace_id: CharacterOptionSubraceId | null;
      readonly trait_id: string;
      readonly ordinal: number;
    }>`
      select subrace_id::text, trait_id::text, ordinal
      from character_option_trait
      where option_id = ${sourceOptionId}
      order by ordinal
    `;
    for (const row of traits) {
      const traitId = yield* copyTraitToOwner(sql, row.trait_id, owner, seenTraits);
      yield* sql`
        insert into character_option_trait (option_id, subrace_id, trait_id, ordinal)
        values (${targetOptionId}, ${row.subrace_id === null ? null : subraceMap.get(row.subrace_id)}, ${traitId}, ${row.ordinal})
      `;
    }

    const groups = yield* sql<{
      readonly id: string;
      readonly subrace_id: CharacterOptionSubraceId | null;
      readonly kind: RuleChoiceKind;
      readonly choose: number;
      readonly description: string | null;
      readonly ordinal: number;
    }>`
      select id::text, subrace_id::text, kind, choose, description, ordinal
      from rule_choice_group
      where option_id = ${sourceOptionId}
      order by ordinal
    `;
    for (const group of groups) {
      const rows = yield* sql<{ readonly id: string }>`
        insert into rule_choice_group (option_id, subrace_id, kind, choose, description, ordinal)
        values (${targetOptionId}, ${group.subrace_id === null ? null : subraceMap.get(group.subrace_id)}, ${group.kind}, ${group.choose}, ${group.description}, ${group.ordinal})
        returning id::text
      `;
      yield* copyChoiceChildren(sql, group.id, rows[0]!.id, owner, seenTraits);
    }
  });

const abilityRows = (
  sql: SqlClient.SqlClient,
): Effect.Effect<ReadonlyArray<RuleAbilityScore>, SqlError.SqlError> =>
  sql<RuleAbilityScore>`
    select id::text, source_key as index, name, coalesce(full_name, name) as "fullName",
           coalesce(body -> 'desc', '[]'::jsonb) as desc
    from ability_score
    order by source_key
  `;

const languageRows = (
  sql: SqlClient.SqlClient,
): Effect.Effect<ReadonlyArray<RuleLanguage>, SqlError.SqlError> =>
  sql<RuleLanguage>`
    select id::text, source_key as index, name, type, script, typical_speakers as "typicalSpeakers"
    from language
    order by lower(name)
  `;

const skillRows = (
  sql: SqlClient.SqlClient,
): Effect.Effect<ReadonlyArray<RuleSkill>, SqlError.SqlError> =>
  sql<RuleSkill>`
    select skill.id::text,
           skill.source_key as index,
           skill.name,
           skill.ability_score_id::text as "abilityScoreId",
           jsonb_build_object(
             'id', ability_score.id::text,
             'index', ability_score.source_key,
             'name', ability_score.name,
             'fullName', coalesce(ability_score.full_name, ability_score.name),
             'desc', coalesce(ability_score.body -> 'desc', '[]'::jsonb)
           ) as ability,
           coalesce(skill.body -> 'desc', '[]'::jsonb) as desc
    from skill
    join ability_score on ability_score.id = skill.ability_score_id
    order by lower(skill.name)
  `;

const proficiencyRows = (
  sql: SqlClient.SqlClient,
): Effect.Effect<ReadonlyArray<RuleProficiency>, SqlError.SqlError> =>
  sql<RuleProficiency>`
    select id::text, source_key as index, name, type,
           reference_family as "referenceFamily",
           reference_key as "referenceKey",
           skill_id::text as "skillId",
           ability_score_id::text as "abilityScoreId"
    from proficiency
    order by type, lower(name)
  `;

const traitRowsFor = (
  sql: SqlClient.SqlClient,
  where: Statement.Fragment,
): Effect.Effect<ReadonlyArray<RuleTrait>, SqlError.SqlError> =>
  sql<RuleTrait>`
    select id::text,
           source_key as index,
           name,
           parent_trait_id::text as "parentTraitId",
           coalesce(body -> 'desc', '[]'::jsonb) as desc
    from racial_trait
    where ${where}
    order by lower(name)
  `;

export const libraryVocabulary = (
  sql: SqlClient.SqlClient,
  accountId: AccountId,
): Effect.Effect<OptionVocabulary, SqlError.SqlError> =>
  Effect.gen(function* () {
    const [abilities, languages, skills, proficiencies, traits] = yield* Effect.all([
      abilityRows(sql),
      languageRows(sql),
      skillRows(sql),
      proficiencyRows(sql),
      traitRowsFor(
        sql,
        sql`campaign_id is null and (account_id is null or account_id = ${accountId})`,
      ),
    ]);
    return { abilities, languages, skills, proficiencies, traits };
  });

export const campaignVocabulary = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
): Effect.Effect<OptionVocabulary, SqlError.SqlError> =>
  Effect.gen(function* () {
    const [abilities, languages, skills, proficiencies, traits] = yield* Effect.all([
      abilityRows(sql),
      languageRows(sql),
      skillRows(sql),
      proficiencyRows(sql),
      traitRowsFor(
        sql,
        sql`account_id is null and (campaign_id is null or campaign_id = ${campaignId})`,
      ),
    ]);
    return { abilities, languages, skills, proficiencies, traits };
  });

export const optionDetailsFor = (
  sql: SqlClient.SqlClient,
  optionId: CharacterOptionId,
): Effect.Effect<OptionDetails, SqlError.SqlError> =>
  Effect.gen(function* () {
    const subraces = yield* sql<OptionDetails["subraces"][number]>`
      select id::text, name, source_key as index, ordinal
      from character_option_subrace
      where option_id = ${optionId}
      order by ordinal
    `;
    const abilityBonuses = yield* sql<OptionDetails["abilityBonuses"][number]>`
      select jsonb_build_object(
               'id', ability_score.id::text,
               'index', ability_score.source_key,
               'name', ability_score.name,
               'fullName', coalesce(ability_score.full_name, ability_score.name),
               'desc', coalesce(ability_score.body -> 'desc', '[]'::jsonb)
             ) as ability,
             character_option_ability_bonus.amount,
             character_option_ability_bonus.ordinal,
             character_option_ability_bonus.subrace_id::text as "subraceId",
             character_option_subrace.name as "subraceName"
      from character_option_ability_bonus
      join ability_score on ability_score.id = character_option_ability_bonus.ability_score_id
      left join character_option_subrace on character_option_subrace.id = character_option_ability_bonus.subrace_id
      where character_option_ability_bonus.option_id = ${optionId}
      order by character_option_ability_bonus.subrace_id nulls first, character_option_ability_bonus.ordinal
    `;
    const languages = yield* sql<OptionDetails["languages"][number]>`
      select jsonb_build_object(
               'id', language.id::text,
               'index', language.source_key,
               'name', language.name,
               'type', language.type,
               'script', language.script,
               'typicalSpeakers', language.typical_speakers
             ) as language,
             character_option_language.ordinal,
             character_option_language.subrace_id::text as "subraceId",
             character_option_subrace.name as "subraceName"
      from character_option_language
      join language on language.id = character_option_language.language_id
      left join character_option_subrace on character_option_subrace.id = character_option_language.subrace_id
      where character_option_language.option_id = ${optionId}
      order by character_option_language.subrace_id nulls first, character_option_language.ordinal
    `;
    const proficiencies = yield* sql<OptionDetails["proficiencies"][number]>`
      select jsonb_build_object(
               'id', proficiency.id::text,
               'index', proficiency.source_key,
               'name', proficiency.name,
               'type', proficiency.type,
               'referenceFamily', proficiency.reference_family,
               'referenceKey', proficiency.reference_key,
               'skillId', proficiency.skill_id::text,
               'abilityScoreId', proficiency.ability_score_id::text
             ) as proficiency,
             case
               when source_trait.id is null then null
               else jsonb_build_object(
                 'id', source_trait.id::text,
                 'index', source_trait.source_key,
                 'name', source_trait.name,
                 'parentTraitId', source_trait.parent_trait_id::text,
                 'desc', coalesce(source_trait.body -> 'desc', '[]'::jsonb)
               )
             end as "sourceTrait",
             source.ordinal,
             source.subrace_id::text as "subraceId",
             character_option_subrace.name as "subraceName"
      from (
        select option_id, subrace_id, proficiency_id, ordinal, null::uuid as source_trait_id
        from character_option_proficiency
        where option_id = ${optionId}
        union all
        select character_option_trait.option_id,
               character_option_trait.subrace_id,
               racial_trait_proficiency.proficiency_id,
               character_option_trait.ordinal * 1000 + racial_trait_proficiency.ordinal as ordinal,
               character_option_trait.trait_id as source_trait_id
        from character_option_trait
        join racial_trait_proficiency on racial_trait_proficiency.trait_id = character_option_trait.trait_id
        where character_option_trait.option_id = ${optionId}
      ) as source
      join proficiency on proficiency.id = source.proficiency_id
      left join racial_trait as source_trait on source_trait.id = source.source_trait_id
      left join character_option_subrace on character_option_subrace.id = source.subrace_id
      order by source.subrace_id nulls first, source.ordinal
    `;
    const traits = yield* sql<OptionDetails["traits"][number]>`
      select jsonb_build_object(
               'id', racial_trait.id::text,
               'index', racial_trait.source_key,
               'name', racial_trait.name,
               'parentTraitId', racial_trait.parent_trait_id::text,
               'desc', coalesce(racial_trait.body -> 'desc', '[]'::jsonb)
             ) as trait,
             character_option_trait.ordinal,
             character_option_trait.subrace_id::text as "subraceId",
             character_option_subrace.name as "subraceName"
      from character_option_trait
      join racial_trait on racial_trait.id = character_option_trait.trait_id
      left join character_option_subrace on character_option_subrace.id = character_option_trait.subrace_id
      where character_option_trait.option_id = ${optionId}
      order by character_option_trait.subrace_id nulls first, character_option_trait.ordinal
    `;

    const groupRows = yield* sql<{
      readonly id: string;
      readonly owner: "option" | "subrace" | "trait";
      readonly ownerName: string | null;
      readonly kind: RuleChoiceKind;
      readonly choose: number;
      readonly desc: string | null;
      readonly ordinal: number;
    }>`
      select rule_choice_group.id::text,
             case
               when rule_choice_group.trait_id is not null then 'trait'
               when rule_choice_group.subrace_id is not null then 'subrace'
               else 'option'
             end as owner,
             coalesce(character_option_subrace.name, racial_trait.name) as "ownerName",
             rule_choice_group.kind,
             rule_choice_group.choose,
             rule_choice_group.description as desc,
             rule_choice_group.ordinal
      from rule_choice_group
      left join character_option_subrace on character_option_subrace.id = rule_choice_group.subrace_id
      left join racial_trait on racial_trait.id = rule_choice_group.trait_id
      where rule_choice_group.option_id = ${optionId}
         or rule_choice_group.trait_id in (
              select trait_id from character_option_trait where option_id = ${optionId}
            )
      order by owner, "ownerName" nulls first, rule_choice_group.ordinal
    `;

    const choices: Array<OptionDetails["choices"][number]> = [];
    for (const group of groupRows) {
      const abilities = yield* sql<OptionDetails["abilityBonuses"][number]>`
        select jsonb_build_object(
                 'id', ability_score.id::text,
                 'index', ability_score.source_key,
                 'name', ability_score.name,
                 'fullName', coalesce(ability_score.full_name, ability_score.name),
                 'desc', coalesce(ability_score.body -> 'desc', '[]'::jsonb)
               ) as ability,
               rule_choice_ability.amount,
               rule_choice_ability.ordinal,
               null::text as "subraceId",
               null::text as "subraceName"
        from rule_choice_ability
        join ability_score on ability_score.id = rule_choice_ability.ability_score_id
        where rule_choice_ability.group_id = ${group.id}
        order by rule_choice_ability.ordinal
      `;
      const groupLanguages = yield* sql<RuleLanguage>`
        select language.id::text, language.source_key as index, language.name, language.type, language.script,
               language.typical_speakers as "typicalSpeakers"
        from rule_choice_language
        join language on language.id = rule_choice_language.language_id
        where rule_choice_language.group_id = ${group.id}
        order by rule_choice_language.ordinal
      `;
      const groupProfs = yield* sql<RuleProficiency>`
        select proficiency.id::text, proficiency.source_key as index, proficiency.name, proficiency.type,
               proficiency.reference_family as "referenceFamily",
               proficiency.reference_key as "referenceKey",
               proficiency.skill_id::text as "skillId",
               proficiency.ability_score_id::text as "abilityScoreId"
        from rule_choice_proficiency
        join proficiency on proficiency.id = rule_choice_proficiency.proficiency_id
        where rule_choice_proficiency.group_id = ${group.id}
        order by rule_choice_proficiency.ordinal
      `;
      const groupTraits = yield* sql<RuleTrait>`
        select racial_trait.id::text, racial_trait.source_key as index, racial_trait.name,
               racial_trait.parent_trait_id::text as "parentTraitId",
               coalesce(racial_trait.body -> 'desc', '[]'::jsonb) as desc
        from rule_choice_trait
        join racial_trait on racial_trait.id = rule_choice_trait.trait_id
        where rule_choice_trait.group_id = ${group.id}
        order by rule_choice_trait.ordinal
      `;
      choices.push({
        id: group.id as never,
        owner: group.owner,
        ownerName: group.ownerName,
        kind: group.kind,
        choose: group.choose,
        desc: group.desc,
        ordinal: group.ordinal,
        abilities,
        languages: groupLanguages,
        proficiencies: groupProfs,
        traits: groupTraits,
      });
    }

    /**
     * The class's own level-1 grants, off the progression domain. Top-level
     * only — a `parent_feature_id` names a pick inside a granted feature
     * (*Fighting Style: Archery* under *Fighting Style*), which is the
     * player's to make later, not the sheet's to start with. Empty for races
     * and backgrounds by construction, and absent from the wire when empty so
     * a non-class option's `details` does not grow two keys that mean nothing.
     */
    const levelOneFeatures = yield* sql<OptionFeatureGrant>`
      select feature.id::text,
             feature.source_key as index,
             feature.name,
             coalesce(feature.body -> 'desc', '[]'::jsonb) as desc
      from feature
      where feature.class_option_id = ${optionId}
        and feature.level = 1
        and feature.subclass_id is null
        and feature.parent_feature_id is null
      order by lower(feature.name)
    `;
    const levelOne = yield* sql<{ readonly proficiency_bonus: number | null }>`
      select class_level.proficiency_bonus
      from class_level
      where class_level.class_option_id = ${optionId}
        and class_level.level = 1
        and class_level.subclass_id is null
      limit 1
    `;
    const proficiencyBonus = levelOne[0]?.proficiency_bonus ?? null;

    /**
     * The class table, one row per level with no prose — see
     * `OptionClassLevel`. Only numeric `classSpecific` values and only the
     * non-zero ones, because every level of a class carries every key and a
     * reader treats absent as zero; slots trimmed of trailing zeros the same
     * way. Empty for races and backgrounds by construction.
     */
    const levelRows = yield* sql<{
      readonly level: number;
      readonly proficiency_bonus: number | null;
      readonly body: { readonly classSpecific?: unknown; readonly spellcasting?: unknown };
    }>`
      select level, proficiency_bonus, body
      from class_level
      where class_option_id = ${optionId}
        and subclass_id is null
      order by level
    `;
    const featureRows = yield* sql<{
      readonly id: string;
      readonly index: string | null;
      readonly name: string;
      readonly level: number;
    }>`
      select id::text, source_key as index, name, level
      from feature
      where class_option_id = ${optionId}
        and subclass_id is null
        and parent_feature_id is null
      order by level, lower(name)
    `;
    const classLevels: Array<OptionClassLevel> = levelRows.map((row) => {
      const table = maybeObject(row.body.spellcasting);
      const slots = Array.from({ length: 9 }, (_, i) =>
        numberAt(table, `spell_slots_level_${String(i + 1)}`),
      );
      while (slots.length > 0 && slots[slots.length - 1] === 0) slots.pop();
      const cantripsKnown = numberAt(table, "cantrips_known");
      const spellsKnown = numberAt(table, "spells_known");
      const spellcasting =
        table === undefined
          ? undefined
          : {
              ...(cantripsKnown === 0 ? {} : { cantripsKnown }),
              ...(spellsKnown === 0 ? {} : { spellsKnown }),
              slots,
            };
      const counters = Object.entries(maybeObject(row.body.classSpecific) ?? {}).flatMap(
        ([key, value]): ReadonlyArray<readonly [string, number]> =>
          typeof value === "number" && Number.isFinite(value) && value !== 0 ? [[key, value]] : [],
      );
      return {
        level: row.level,
        proficiencyBonus: row.proficiency_bonus,
        ...(spellcasting === undefined ? {} : { spellcasting }),
        ...(counters.length === 0 ? {} : { classSpecific: Object.fromEntries(counters) }),
        features: featureRows
          .filter((feature) => feature.level === row.level)
          .map((feature) => ({
            id: feature.id as never,
            index: feature.index,
            name: feature.name,
          })),
      };
    });

    /**
     * The kit's rows, and the members of every category the kit lets the
     * player pick from — the weapon columns a fresh sheet derives an attack
     * from. The reference table names the counted rows; the categories are
     * read off the body's `startingKit`, spelled against the same columns
     * `inCategory` reads on the client, so the picker's members and the
     * composer's check cannot disagree.
     */
    const kitBody = yield* sql<{ readonly kit: StartingKit | null }>`
      select body -> 'startingKit' as kit from character_option where id = ${optionId}
    `;
    const categories = new Set<string>();
    for (const choice of kitBody[0]?.kit?.choices ?? []) {
      for (const side of choice.options) {
        for (const line of side.lines)
          if (line.category !== undefined) categories.add(line.category.index);
      }
    }
    const equipment = yield* sql<KitEquipment>`
      select equipment.id::text,
             equipment.source_key as index,
             equipment.name,
             equipment.weapon_category as "weaponCategory",
             equipment.weapon_range as "weaponRange",
             equipment.category_range as "categoryRange",
             equipment.armor_category as "armorCategory",
             equipment.damage_dice as "damageDice",
             equipment.damage_type_name as "damageType",
             equipment.two_handed_damage_dice as "twoHandedDamageDice",
             equipment.range_normal as "rangeNormal",
             equipment.range_long as "rangeLong",
             equipment.throw_range_normal as "throwRangeNormal",
             equipment.throw_range_long as "throwRangeLong",
             equipment.property_names as properties,
             equipment.weight,
             equipment.gear_category_index as "gearCategoryIndex",
             equipment.tool_category as "toolCategory"
      from equipment
      where equipment.campaign_id is null
        and equipment.account_id is null
        and (
          equipment.id in (
            select equipment_id from character_option_equipment_reference
            where option_id = ${optionId}
          )
          or ${categoryMembers(sql, [...categories])}
        )
      order by lower(equipment.name)
    `;

    return {
      subraces,
      abilityBonuses,
      languages,
      proficiencies,
      traits,
      choices,
      ...(levelOneFeatures.length === 0 ? {} : { levelOneFeatures }),
      ...(proficiencyBonus === null ? {} : { proficiencyBonus }),
      ...(equipment.length === 0 ? {} : { equipment }),
      ...(classLevels.length === 0 ? {} : { classLevels }),
    };
  });

const maybeObject = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const numberAt = (record: Record<string, unknown> | undefined, key: string): number => {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

/**
 * The 2014 kit categories the class sources name, as a `where` fragment over
 * the row's own columns — the SQL spelling of `@taverns/api`'s `inCategory`.
 * An unknown category matches nothing rather than everything.
 */
const categoryMembers = (
  sql: SqlClient.SqlClient,
  categories: ReadonlyArray<string>,
): Statement.Fragment => {
  const clauses = categories.map((category) => {
    switch (category) {
      case "martial-weapons":
        return sql`equipment.weapon_category = 'Martial'`;
      case "simple-weapons":
        return sql`equipment.weapon_category = 'Simple'`;
      case "martial-melee-weapons":
        return sql`equipment.category_range = 'Martial Melee'`;
      case "martial-ranged-weapons":
        return sql`equipment.category_range = 'Martial Ranged'`;
      case "simple-melee-weapons":
        return sql`equipment.category_range = 'Simple Melee'`;
      case "simple-ranged-weapons":
        return sql`equipment.category_range = 'Simple Ranged'`;
      case "musical-instruments":
        return sql`equipment.tool_category = 'Musical Instrument'`;
      case "artisans-tools":
        return sql`equipment.tool_category = 'Artisan''s Tools'`;
      default:
        return sql`equipment.gear_category_index = ${category}`;
    }
  });
  return clauses.length === 0 ? sql`false` : sql.or(clauses);
};
