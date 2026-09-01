import { Effect } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import { syncSystemClassProgression } from "./progression.js";
import { FIVE_E_BITS_2014_SOURCE, sourceKeyFor } from "./source.js";
import { SYSTEM_OPTIONS, type SystemOption } from "./systemOptions.js";

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
export const importSystemOptions = (
  corpus: ReadonlyArray<SystemOption> = SYSTEM_OPTIONS,
): Effect.Effect<ImportResult, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        let inserted = 0;
        let updated = 0;

        for (const option of corpus) {
          const key = sourceKeyFor(
            FIVE_E_BITS_2014_SOURCE,
            option.sourceFamily,
            option.sourceIndex,
          );

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
              ${JSON.stringify(option.body)},
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
