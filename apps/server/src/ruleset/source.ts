import { createHash } from "node:crypto";
import { Effect } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";

export type RulesSourceDocumentId = string;
export type RulesImportRunId = string;
export type RulesSourceEntityId = string;
export type RulesSourceEntityRevisionId = string;

export interface RulesSourceDocumentDefinition {
  readonly system: string;
  readonly edition: string;
  readonly documentName: string;
  readonly documentVersion: string;
  readonly license: string;
  readonly sourceUrl: string;
  readonly attribution: string;
}

export interface RulesSourceDefinition {
  readonly document: RulesSourceDocumentDefinition;
  readonly provider: string;
  readonly providerVersion?: string;
  readonly providerCommit?: string;
}

export interface RulesImportContext {
  readonly documentId: RulesSourceDocumentId;
  readonly importRunId: RulesImportRunId;
}

export interface SourceEntityInput {
  readonly family: string;
  readonly sourceIndex: string;
  readonly sourceUrl?: string;
  readonly name: string;
  readonly raw: unknown;
}

export interface SourceRevision {
  readonly sourceEntityId: RulesSourceEntityId;
  readonly sourceRevisionId: RulesSourceEntityRevisionId;
  readonly contentHash: string;
}

export interface SourceLinkInput {
  readonly relation: string;
  readonly targetFamily: string;
  readonly targetIndex: string;
  readonly ordinal?: number;
  readonly payload?: unknown;
}

/**
 * The bestiary starter rows remain project-authored. They are source-keyed, but
 * they are not 5e-bits data and not SRD content; the character rules importer
 * below uses its own 2014 source document and attribution.
 */
export const TAVERNS_STARTER_SOURCE: RulesSourceDefinition = {
  document: {
    system: "taverns",
    edition: "project",
    documentName: "Tiny Taverns starter bundle",
    documentVersion: "1",
    license: "project-authored",
    sourceUrl: "internal:taverns/starter-bundle",
    attribution: "Project-authored starter data bundled with Tiny Taverns.",
  },
  provider: "taverns-starter-importer",
  providerVersion: "1",
};

/**
 * Metadata for the pinned 2014 5e-bits/SRD source used by the ruleset, spell
 * and equipment importers. Each importer reads a checked-in local snapshot; none
 * fetches at runtime.
 */
export const FIVE_E_BITS_2014_SOURCE: RulesSourceDefinition = {
  document: {
    system: "dnd-5e-srd",
    edition: "2014",
    documentName: "5e-bits 2014 SRD data",
    documentVersion: "5e-database 5.10.0+5a7ee5a0489b26655d343e4a41e8f7942a887af2",
    license: "5e-bits MIT project data; underlying SRD 5.1 content under OGL-1.0a",
    sourceUrl:
      "https://github.com/5e-bits/5e-database/tree/5a7ee5a0489b26655d343e4a41e8f7942a887af2/src/2014/en",
    attribution:
      "Rules data transformed from 5e-bits/5e-database commit 5a7ee5a0489b26655d343e4a41e8f7942a887af2 (MIT). Underlying Dungeons & Dragons 5th Edition SRD 5.1 material is used under the Open Game License version 1.0a.",
  },
  provider: "5e-bits-transform",
  providerVersion: "5e-database 5.10.0",
  providerCommit: "5a7ee5a0489b26655d343e4a41e8f7942a887af2",
};

const SOURCE_INDEX = /^[a-z0-9][a-z0-9._/-]*$/;

const requireText = (value: string, name: string): void => {
  if (value.trim() === "") throw new Error(`${name} is required`);
};

const validateSource = (source: RulesSourceDefinition): void => {
  requireText(source.document.system, "rules source system");
  requireText(source.document.edition, "rules source edition");
  requireText(source.document.documentName, "rules source documentName");
  requireText(source.document.documentVersion, "rules source documentVersion");
  requireText(source.document.license, "rules source license");
  requireText(source.document.sourceUrl, "rules source sourceUrl");
  requireText(source.document.attribution, "rules source attribution");
  requireText(source.provider, "rules source provider");
};

const validateEntity = (input: SourceEntityInput): void => {
  requireText(input.family, "rules source family");
  requireText(input.sourceIndex, "rules source sourceIndex");
  requireText(input.name, "rules source name");
  if (!SOURCE_INDEX.test(input.sourceIndex)) {
    throw new Error(
      `rules source sourceIndex must be a stable lowercase source key, got ${JSON.stringify(
        input.sourceIndex,
      )}`,
    );
  }
};

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
};

/** Stable JSON for content hashes and raw source snapshots. */
export const stableJson = (value: unknown): string => JSON.stringify(stable(value));

/** A content-addressed hash; the prefix keeps the algorithm in the value. */
export const sourceContentHash = (value: unknown): string =>
  `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;

/** Opens one source import run and upserts the document-level attribution. */
export const beginRulesImport = (
  sql: SqlClient.SqlClient,
  source: RulesSourceDefinition,
): Effect.Effect<RulesImportContext, SqlError.SqlError> =>
  Effect.gen(function* () {
    validateSource(source);
    const documents = yield* sql<{ readonly id: RulesSourceDocumentId }>`
      insert into rules_source_document (
        system, edition, document_name, document_version, license, source_url, attribution
      )
      values (
        ${source.document.system},
        ${source.document.edition},
        ${source.document.documentName},
        ${source.document.documentVersion},
        ${source.document.license},
        ${source.document.sourceUrl},
        ${source.document.attribution}
      )
      on conflict (system, edition, document_version)
      do update set
        document_name = excluded.document_name,
        license       = excluded.license,
        source_url    = excluded.source_url,
        attribution   = excluded.attribution,
        updated_at    = now()
      returning id
    `;
    const documentId = documents[0]!.id;
    const runs = yield* sql<{ readonly id: RulesImportRunId }>`
      insert into rules_import_run (
        document_id, provider, provider_version, provider_commit
      )
      values (
        ${documentId},
        ${source.provider},
        ${source.providerVersion ?? null},
        ${source.providerCommit ?? null}
      )
      returning id
    `;
    return { documentId, importRunId: runs[0]!.id };
  });

/**
 * Upserts one source entity and returns the exact revision that this import's
 * projected domain row reflects.
 */
export const sourceRevisionFor = (
  sql: SqlClient.SqlClient,
  context: RulesImportContext,
  input: SourceEntityInput,
): Effect.Effect<SourceRevision, SqlError.SqlError> =>
  Effect.gen(function* () {
    validateEntity(input);
    const raw = JSON.parse(stableJson(input.raw)) as unknown;
    const contentHash = sourceContentHash(raw);
    const entities = yield* sql<{ readonly id: RulesSourceEntityId }>`
      insert into rules_source_entity (document_id, family, source_index, source_url, name)
      values (
        ${context.documentId},
        ${input.family},
        ${input.sourceIndex},
        ${input.sourceUrl ?? null},
        ${input.name}
      )
      on conflict (document_id, family, source_index)
      do update set
        source_url = excluded.source_url,
        name       = excluded.name,
        updated_at = now()
      returning id
    `;
    const sourceEntityId = entities[0]!.id;
    const revisions = yield* sql<{ readonly id: RulesSourceEntityRevisionId }>`
      insert into rules_source_entity_revision (entity_id, import_run_id, content_hash, raw)
      values (${sourceEntityId}, ${context.importRunId}, ${contentHash}, ${JSON.stringify(raw)})
      on conflict (entity_id, content_hash)
      do update set raw = excluded.raw
      returning id
    `;
    return { sourceEntityId, sourceRevisionId: revisions[0]!.id, contentHash };
  });

/** Records one relationship observed in the imported source. */
export const sourceLinkFor = (
  sql: SqlClient.SqlClient,
  context: RulesImportContext,
  from: SourceRevision,
  input: SourceLinkInput,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    validateEntity({
      family: input.targetFamily,
      sourceIndex: input.targetIndex,
      name: input.targetIndex,
      raw: {},
    });
    const targets = yield* sql<{ readonly id: RulesSourceEntityId }>`
      select id from rules_source_entity
      where document_id = ${context.documentId}
        and family = ${input.targetFamily}
        and source_index = ${input.targetIndex}
      limit 1
    `;
    yield* sql`
      insert into rules_source_link (
        from_revision_id, relation, to_entity_id, target_family, target_index, ordinal, payload
      )
      values (
        ${from.sourceRevisionId},
        ${input.relation},
        ${targets[0]?.id ?? null},
        ${input.targetFamily},
        ${input.targetIndex},
        ${input.ordinal ?? 0},
        ${JSON.stringify(input.payload ?? {})}
      )
      on conflict (from_revision_id, relation, ordinal, target_family, target_index)
      do update set
        to_entity_id = excluded.to_entity_id,
        payload      = excluded.payload
    `;
  });
