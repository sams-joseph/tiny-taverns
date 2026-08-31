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

/**
 * The current starter rows are project-authored. They are source-keyed now, but
 * they are not 5e-bits data and not SRD content; a future 2014 importer will
 * insert a different source document with a real 2014 edition and attribution.
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
 * Metadata for the planned 2014 source. Current starter importers do not use it;
 * tests assert they keep their project-authored identity until a real 2014
 * importer lands beside the required source files and notices.
 */
export const FIVE_E_BITS_2014_SOURCE: RulesSourceDefinition = {
  document: {
    system: "dnd-5e-srd",
    edition: "2014",
    documentName: "5e-bits 2014 SRD data",
    documentVersion: "5e-database 5.10.0",
    license: "5e-bits MIT project data; underlying SRD 5.1 content under OGL-1.0a",
    sourceUrl: "https://github.com/5e-bits/5e-database",
    attribution:
      "Data transformed from 5e-bits/5e-database under its MIT license, with underlying SRD 5.1 rules content under the Open Gaming License 1.0a. Include the full required notices before copied SRD content ships.",
  },
  provider: "5e-bits-transform",
  providerVersion: "5e-database 5.10.0",
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
