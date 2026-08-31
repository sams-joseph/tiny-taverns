import { Effect } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import {
  beginRulesImport,
  FIVE_E_BITS_2014_SOURCE,
  sourceLinkFor,
  sourceRevisionFor,
  type SourceRevision,
} from "./source.js";
import {
  SOURCE_REFERENCES,
  SOURCE_SUBRACES,
  SYSTEM_OPTIONS,
  type SourceReference,
  type SystemOption,
} from "./systemOptions.js";

/** What one run of the import did. Counts the domain `character_option` upserts. */
export interface ImportResult {
  readonly inserted: number;
  readonly updated: number;
}

const sourceUrlFor = (url: string | undefined): string | undefined =>
  url === undefined ? undefined : `https://www.dnd5eapi.co${url}`;

const targetOf = (ref: SourceReference) => ({
  targetFamily: ref.family,
  targetIndex: ref.index,
});

const refsIn = (value: unknown): ReadonlyArray<SourceReference> => {
  const found: SourceReference[] = [];
  const walk = (item: unknown): void => {
    if (item !== null && typeof item === "object") {
      const row = item as {
        readonly index?: unknown;
        readonly name?: unknown;
        readonly url?: unknown;
      };
      if (
        typeof row.index === "string" &&
        typeof row.name === "string" &&
        typeof row.url === "string"
      ) {
        const match = row.url.match(/^\/api\/2014\/([^/]+)\//);
        if (match?.[1] !== undefined) {
          found.push({ family: match[1], index: row.index, name: row.name, url: row.url });
        }
      }
      if (Array.isArray(item)) for (const child of item) walk(child);
      else for (const child of Object.values(item)) walk(child);
    }
  };
  walk(value);
  return found;
};

const importReferencedEntity = (
  sql: SqlClient.SqlClient,
  context: Parameters<typeof sourceRevisionFor>[1],
  ref: SourceReference,
) =>
  sourceRevisionFor(sql, context, {
    family: ref.family,
    sourceIndex: ref.index,
    sourceUrl: sourceUrlFor(ref.url),
    name: ref.name,
    raw: ref.raw ?? ref,
  });

const importSubrace = (
  sql: SqlClient.SqlClient,
  context: Parameters<typeof sourceRevisionFor>[1],
  subrace: Record<string, unknown>,
): Effect.Effect<SourceRevision, SqlError.SqlError> =>
  sourceRevisionFor(sql, context, {
    family: "subraces",
    sourceIndex: String(subrace.index),
    sourceUrl: sourceUrlFor(typeof subrace.url === "string" ? subrace.url : undefined),
    name: String(subrace.name),
    raw: subrace,
  });

const linkAllReferences = (
  sql: SqlClient.SqlClient,
  context: Parameters<typeof sourceRevisionFor>[1],
  from: SourceRevision,
  raw: unknown,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    let ordinal = 0;
    for (const ref of refsIn(raw)) {
      yield* sourceLinkFor(sql, context, from, {
        relation: "references",
        ...targetOf(ref),
        ordinal,
        payload: { name: ref.name, url: ref.url },
      });
      ordinal += 1;
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
        const context = yield* beginRulesImport(sql, FIVE_E_BITS_2014_SOURCE);

        for (const ref of SOURCE_REFERENCES) {
          if (["classes", "races", "backgrounds", "subraces"].includes(ref.family)) continue;
          yield* importReferencedEntity(sql, context, ref);
        }

        const domainSources = new Map<string, SourceRevision>();
        for (const option of corpus) {
          const source = yield* sourceRevisionFor(sql, context, {
            family: option.sourceFamily,
            sourceIndex: option.sourceIndex,
            sourceUrl: sourceUrlFor(option.sourceUrl),
            name: option.name,
            raw: option.raw,
          });
          domainSources.set(`${option.sourceFamily}:${option.sourceIndex}`, source);
        }

        for (const subrace of SOURCE_SUBRACES) {
          const revision = yield* importSubrace(sql, context, subrace);
          yield* linkAllReferences(sql, context, revision, subrace);
          const race = (subrace.race ?? {}) as {
            readonly index?: unknown;
            readonly name?: unknown;
          };
          if (typeof race.index === "string") {
            yield* sourceLinkFor(sql, context, revision, {
              relation: "parent-race",
              targetFamily: "races",
              targetIndex: race.index,
              payload: { name: race.name },
            });
          }
        }

        for (const option of corpus) {
          const source = domainSources.get(`${option.sourceFamily}:${option.sourceIndex}`)!;
          yield* linkAllReferences(sql, context, source, option.raw);

          if (option.kind === "race") {
            for (const subrace of option.body.subraces) {
              const raw = SOURCE_SUBRACES.find((row) => row.name === subrace.name);
              if (typeof raw?.index === "string") {
                yield* sourceLinkFor(sql, context, source, {
                  relation: "subrace",
                  targetFamily: "subraces",
                  targetIndex: raw.index,
                  payload: { name: subrace.name },
                });
              }
            }
          }

          const rows = yield* sql<{ readonly inserted: boolean }>`
            insert into character_option (
              campaign_id, account_id, origin, source_entity_id, source_revision_id,
              kind, name, body, visibility
            )
            values (
              null,
              null,
              'system',
              ${source.sourceEntityId},
              ${source.sourceRevisionId},
              ${option.kind},
              ${option.name},
              ${JSON.stringify(option.body)},
              'shared'
            )
            on conflict (source_entity_id)
              where campaign_id is null and account_id is null and source_entity_id is not null
            do update set
              source_revision_id = excluded.source_revision_id,
              kind       = excluded.kind,
              name       = excluded.name,
              body       = excluded.body,
              updated_at = now()
            returning (xmax = 0) as inserted
          `;
          if (rows[0]?.inserted === true) inserted += 1;
          else updated += 1;
        }

        return { inserted, updated };
      }),
    );
  });
