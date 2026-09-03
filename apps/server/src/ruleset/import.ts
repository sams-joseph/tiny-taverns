import type {
  AbilityKey,
  ClassBody,
  KitChoice,
  KitLine,
  KitOption,
  StartingKit,
} from "@taverns/api";
import { ABILITY_KEYS } from "@taverns/api";
import { Effect } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import { syncSystemClassProgression } from "./progression.js";
import { FIVE_E_BITS_2014_SOURCE, sourceKeyFor } from "./source.js";
import { SYSTEM_FEATS, type SystemFeat } from "./systemFeats.js";
import { SOURCE_RAW, SYSTEM_OPTIONS, type SystemOption } from "./systemOptions.js";
import { syncImportedOptionRelationships, syncSystemVocabularies } from "./vocabularies.js";

/** What one run of the import did. Counts the domain `character_option` upserts. */
export interface ImportResult {
  readonly inserted: number;
  readonly updated: number;
}

interface EquipmentReference {
  readonly index: string;
  readonly quantity: number;
}

const maybeRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
};

const sourceIndexOf = (value: unknown): string | undefined => {
  const record = maybeRecord(value);
  const index = record?.index;
  return typeof index === "string" && index.trim() !== "" ? index : undefined;
};

const quantityOf = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;

const walkEquipmentOptions = (value: unknown, found: EquipmentReference[]): void => {
  const record = maybeRecord(value);
  if (record === undefined) {
    if (Array.isArray(value)) for (const item of value) walkEquipmentOptions(item, found);
    return;
  }

  const optionType = record.option_type;
  if (optionType === "counted_reference") {
    const index = sourceIndexOf(record.of);
    const quantity = quantityOf(record.count) ?? 1;
    if (index !== undefined) found.push({ index, quantity });
    return;
  }

  const equipmentIndex = sourceIndexOf(record.equipment);
  if (equipmentIndex !== undefined) {
    found.push({ index: equipmentIndex, quantity: quantityOf(record.quantity) ?? 1 });
  }

  for (const child of Object.values(record)) walkEquipmentOptions(child, found);
};

/**
 * `"wis"` → `"WIS"`: the source's `spellcasting.spellcasting_ability.index`,
 * which the importer used to drop — no sheet could say a spell save DC until
 * it reached `ClassBody.spellcastingAbility`.
 */
const spellcastingAbilityOf = (raw: unknown): AbilityKey | undefined => {
  const record = maybeRecord(raw);
  const index = sourceIndexOf(maybeRecord(record?.spellcasting)?.spellcasting_ability);
  const key = index?.toUpperCase();
  return key !== undefined && (ABILITY_KEYS as ReadonlyArray<string>).includes(key)
    ? (key as AbilityKey)
    : undefined;
};

const nameOf = (value: unknown): string | undefined => {
  const name = maybeRecord(value)?.name;
  return typeof name === "string" && name.trim() !== "" ? name : undefined;
};

/** *"Martial Weapons"* → *"Any martial weapon"*: what a category line is called on a sheet. */
const anyOf = (categoryName: string): string =>
  `Any ${categoryName.toLowerCase().replace(/s$/, "").replace(/foci$/, "focus")}`;

interface KitBuild {
  readonly equipmentId: (index: string) => Effect.Effect<string, SqlError.SqlError>;
}

/** One option node of the source's kit grammar, as the lines it carries. */
const kitLinesOf = (
  value: unknown,
  build: KitBuild,
): Effect.Effect<ReadonlyArray<KitLine>, SqlError.SqlError> =>
  Effect.gen(function* () {
    const record = maybeRecord(value);
    if (record === undefined) return [];
    switch (record.option_type) {
      case "counted_reference": {
        const index = sourceIndexOf(record.of);
        const name = nameOf(record.of);
        if (index === undefined || name === undefined) return [];
        const equipmentId = yield* build.equipmentId(index);
        return [
          {
            name,
            quantity: quantityOf(record.count) ?? 1,
            equipmentId: equipmentId as KitLine["equipmentId"],
          },
        ];
      }
      case "multiple": {
        const items = Array.isArray(record.items) ? record.items : [];
        const lines: Array<KitLine> = [];
        for (const item of items) lines.push(...(yield* kitLinesOf(item, build)));
        return lines;
      }
      case "choice":
        return yield* categoryLinesOf(record.choice, build);
      default:
        return [];
    }
  });

/** A `from.option_set_type === "equipment_category"` node: one line the player picks from. */
const categoryLinesOf = (
  value: unknown,
  build: KitBuild,
): Effect.Effect<ReadonlyArray<KitLine>, SqlError.SqlError> =>
  Effect.gen(function* () {
    const record = maybeRecord(value);
    const from = maybeRecord(record?.from);
    if (from === undefined) return [];
    if (from.option_set_type === "equipment_category") {
      const index = sourceIndexOf(from.equipment_category);
      const name = nameOf(from.equipment_category);
      if (index === undefined || name === undefined) return [];
      return [
        { name: anyOf(name), quantity: quantityOf(record?.choose) ?? 1, category: { index, name } },
      ];
    }
    const options = Array.isArray(from.options) ? from.options : [];
    const lines: Array<KitLine> = [];
    for (const option of options) lines.push(...(yield* kitLinesOf(option, build)));
    return lines;
  });

const kitLabel = (lines: ReadonlyArray<KitLine>): string =>
  lines.length === 0
    ? "Nothing"
    : lines
        .map((line) => (line.quantity > 1 ? `${String(line.quantity)} × ${line.name}` : line.name))
        .join(", ");

/**
 * The class's starting kit, structured off the source's own grammar: the
 * fixed `starting_equipment` lines, then one `KitChoice` per
 * `starting_equipment_options` entry with a `KitOption` per side. A side is a
 * counted item, a bundle of them (`multiple`), or a category the player picks
 * from; each equipment index is resolved to the bundled row's id in the same
 * transaction, so a kit line is provenance the moment it is written. Absent
 * when the source lists nothing.
 */
const startingKitOf = (
  raw: unknown,
  build: KitBuild,
): Effect.Effect<StartingKit | undefined, SqlError.SqlError> =>
  Effect.gen(function* () {
    const record = maybeRecord(raw);
    const fixed: Array<KitLine> = [];
    const starting = Array.isArray(record?.starting_equipment) ? record.starting_equipment : [];
    for (const item of starting) {
      const row = maybeRecord(item);
      const index = sourceIndexOf(row?.equipment);
      const name = nameOf(row?.equipment);
      if (index === undefined || name === undefined) continue;
      const equipmentId = yield* build.equipmentId(index);
      fixed.push({
        name,
        quantity: quantityOf(row?.quantity) ?? 1,
        equipmentId: equipmentId as KitLine["equipmentId"],
      });
    }
    const choices: Array<KitChoice> = [];
    const options = Array.isArray(record?.starting_equipment_options)
      ? record.starting_equipment_options
      : [];
    for (const entry of options) {
      const choice = maybeRecord(entry);
      const from = maybeRecord(choice?.from);
      const desc = typeof choice?.desc === "string" ? choice.desc : "";
      let sides: Array<KitOption> = [];
      if (from?.option_set_type === "equipment_category") {
        const lines = yield* categoryLinesOf(choice, build);
        sides = [{ label: kitLabel(lines), lines }];
      } else {
        const nodes = Array.isArray(from?.options) ? from.options : [];
        for (const node of nodes) {
          const lines = yield* kitLinesOf(node, build);
          sides.push({ label: kitLabel(lines), lines });
        }
      }
      if (sides.length > 0) choices.push({ desc, options: sides });
    }
    return fixed.length === 0 && choices.length === 0 ? undefined : { fixed, choices };
  });

/** The snapshot's class body plus the two keys read off its raw record. */
const classBodyOf = (
  sql: SqlClient.SqlClient,
  option: SystemOption & { readonly kind: "class" },
): Effect.Effect<ClassBody, SqlError.SqlError> =>
  Effect.gen(function* () {
    const spellcastingAbility = spellcastingAbilityOf(option.raw);
    const startingKit = yield* startingKitOf(option.raw, {
      equipmentId: (index) => systemEquipmentId(sql, index),
    });
    return {
      ...option.body,
      ...(spellcastingAbility === undefined ? {} : { spellcastingAbility }),
      ...(startingKit === undefined ? {} : { startingKit }),
    };
  });

const optionEquipmentReferences = (raw: unknown): ReadonlyArray<EquipmentReference> => {
  const found: EquipmentReference[] = [];
  const record = maybeRecord(raw);
  const starting = record?.starting_equipment;
  if (Array.isArray(starting)) {
    for (const item of starting) {
      const row = maybeRecord(item);
      const index = sourceIndexOf(row?.equipment);
      if (index !== undefined) found.push({ index, quantity: quantityOf(row?.quantity) ?? 1 });
    }
  }

  const options = record?.starting_equipment_options;
  if (Array.isArray(options)) for (const option of options) walkEquipmentOptions(option, found);

  return found;
};

const systemEquipmentId = (
  sql: SqlClient.SqlClient,
  sourceIndex: string,
): Effect.Effect<string, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<{ readonly id: string }>`
      select id::text from equipment
      where source_corpus = ${FIVE_E_BITS_2014_SOURCE.corpus}
        and source_family = 'equipment'
        and source_key = ${sourceIndex}
        and campaign_id is null
        and account_id is null
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) throw new Error(`missing required option equipment ${sourceIndex}`);
    return row.id;
  });

const syncOptionEquipmentReferences = (
  sql: SqlClient.SqlClient,
  optionId: string,
  raw: unknown,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    yield* sql`delete from character_option_equipment_reference where option_id = ${optionId}`;
    for (const [ordinal, reference] of optionEquipmentReferences(raw).entries()) {
      const equipmentId = yield* systemEquipmentId(sql, reference.index);
      yield* sql`
        insert into character_option_equipment_reference (option_id, equipment_id, quantity, ordinal)
        values (${optionId}, ${equipmentId}, ${reference.quantity}, ${ordinal})
        on conflict do nothing
      `;
    }
  });

/**
 * Writes the pinned 2014 5e-bits classes, races (with contained subraces) and SRD background into
 * `character_option` as global `system` rows. The source is a local, generated snapshot of
 * 5e-database commit 5a7ee5a0489b26655d343e4a41e8f7942a887af2; no runtime fetch is performed.
 */
export interface ImportFeatsResult {
  readonly inserted: number;
  readonly updated: number;
  readonly prerequisites: number;
}

const abilityScoreIdByKey = (
  sql: SqlClient.SqlClient,
  sourceIndex: string,
): Effect.Effect<string, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<{ readonly id: string }>`
      select id::text from ability_score
      where source_corpus = ${FIVE_E_BITS_2014_SOURCE.corpus}
        and source_key = ${sourceIndex}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) throw new Error(`missing required feat ability ${sourceIndex}`);
    return row.id;
  });

export const syncFeatDefinition = (
  sql: SqlClient.SqlClient,
  featId: string,
  feat: SystemFeat,
): Effect.Effect<number, SqlError.SqlError> =>
  Effect.gen(function* () {
    yield* sql`delete from feat_description where feat_id = ${featId}`;
    for (const [ordinal, text] of feat.description.entries()) {
      yield* sql`
        insert into feat_description (feat_id, ordinal, text)
        values (${featId}, ${ordinal}, ${text})
      `;
    }

    yield* sql`delete from feat_prerequisite_group where feat_id = ${featId}`;
    if (feat.prerequisites.length === 0) return 0;
    const group = yield* sql<{ readonly id: string }>`
      insert into feat_prerequisite_group (feat_id, ordinal)
      values (${featId}, 0)
      returning id::text
    `;
    const groupId = group[0]!.id;
    for (const [ordinal, prerequisite] of feat.prerequisites.entries()) {
      const abilityId = yield* abilityScoreIdByKey(sql, prerequisite.abilityIndex);
      yield* sql`
        insert into feat_prerequisite_ability_score (
          feat_id, group_id, ability_score_id, minimum_score, ordinal
        )
        values (${featId}, ${groupId}, ${abilityId}, ${prerequisite.minimumScore}, ${ordinal})
      `;
    }
    return feat.prerequisites.length;
  });

/**
 * Writes the complete pinned 2014 5e-bits feat corpus. The pinned upstream file
 * contains one feat, Grappler; a changed count here means the vendored evidence
 * in `systemFeats.ts` needs to be regenerated deliberately.
 */
export const importSystemFeats = (
  corpus: ReadonlyArray<SystemFeat> = SYSTEM_FEATS,
): Effect.Effect<ImportFeatsResult, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        let inserted = 0;
        let updated = 0;
        let prerequisites = 0;

        yield* syncSystemVocabularies(sql);

        for (const feat of corpus) {
          const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "feats", feat.sourceIndex);
          const rows = yield* sql<{ readonly id: string; readonly inserted: boolean }>`
            insert into feat (
              campaign_id, account_id, origin, source_corpus, source_family, source_key,
              name, visibility
            )
            values (
              null, null, 'system', ${key.sourceCorpus}, ${key.sourceFamily}, ${key.sourceKey},
              ${feat.name}, 'shared'
            )
            on conflict (source_corpus, source_family, source_key)
              where campaign_id is null and account_id is null and source_key is not null
            do update set
              name = excluded.name,
              updated_at = now()
            returning id::text, (xmax = 0) as inserted
          `;
          const row = rows[0];
          if (row === undefined) throw new Error(`feat ${feat.sourceIndex} was not written`);
          prerequisites += yield* syncFeatDefinition(sql, row.id, feat);
          if (row.inserted === true) inserted += 1;
          else updated += 1;
        }

        return { inserted, updated, prerequisites };
      }),
    );
  });

export const importSystemOptions = (
  corpus: ReadonlyArray<SystemOption> = SYSTEM_OPTIONS,
): Effect.Effect<ImportResult, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        let inserted = 0;
        let updated = 0;

        yield* syncSystemVocabularies(sql);

        for (const option of corpus) {
          const key = sourceKeyFor(
            FIVE_E_BITS_2014_SOURCE,
            option.sourceFamily,
            option.sourceIndex,
          );

          /**
           * A class body carries two things the snapshot's literal body does
           * not and its raw record does: the casting ability, and the kit as
           * structure. Both are read off `raw` here so the generated snapshot
           * stays what the source said, and re-running the import settles them
           * on a database that predates them — the upsert below rewrites
           * `body` whole.
           */
          const body: ClassBody | SystemOption["body"] =
            option.kind === "class" ? yield* classBodyOf(sql, option) : option.body;
          const rows = yield* sql<{ readonly id: string; readonly inserted: boolean }>`
            insert into character_option (
              campaign_id, account_id, origin, source_corpus, source_family, source_key,
              kind, name, body, visibility
            )
            values (
              null,
              null,
              'system',
              ${key.sourceCorpus},
              ${key.sourceFamily},
              ${key.sourceKey},
              ${option.kind},
              ${option.name},
              ${JSON.stringify(body)},
              'shared'
            )
            on conflict (source_corpus, source_family, source_key)
              where campaign_id is null and account_id is null and source_key is not null
            do update set
              kind       = excluded.kind,
              name       = excluded.name,
              body       = excluded.body,
              updated_at = now()
            returning id::text, (xmax = 0) as inserted
          `;
          const row = rows[0];
          if (row === undefined) throw new Error(`option ${option.sourceIndex} was not written`);
          yield* syncOptionEquipmentReferences(sql, row.id, option.raw);
          yield* syncImportedOptionRelationships(
            sql,
            row.id as never,
            option.kind,
            option.raw as Record<string, unknown>,
            SOURCE_RAW.subraces,
          );
          if (row.inserted === true) inserted += 1;
          else updated += 1;
        }

        // The concrete class-progression import hangs off the class rows above.
        // Keep the return shape as the domain option count: callers and tests
        // that seed a tiny custom corpus are asserting those rows, not the 709
        // child rows in the bundled progression.
        if (corpus === SYSTEM_OPTIONS) yield* syncSystemClassProgression(sql);

        return { inserted, updated };
      }),
    );
  });
