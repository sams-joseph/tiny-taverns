import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Source identity for imported rules material, without changing any gameplay
 * surface yet.
 *
 * `origin = 'system'` answers one Taverns question: the row is bundled with the
 * product, owned by nobody and immutable through every HTTP write path. It does
 * **not** answer which book, edition, repository, extractor or content hash a
 * row came from. That distinction becomes load-bearing as soon as a broad SRD
 * corpus arrives: names can change, two source rows can share a name, and an
 * update to a source document may update the unowned system row while leaving a
 * campaign's copied row exactly as it was.
 *
 * This migration adds that second layer and points the two SRD-shaped domain
 * tables at it. It deliberately does not import 5e-bits/SRD content and does
 * not change any reader: existing rows get nullable provenance columns, and the
 * current starter importers fill them with a Taverns-authored source document.
 * The future 2014 5e-bits/SRD importer gets edition/document/revision slots to
 * write into without relitigating ownership or visibility.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table rules_source_document (
      id                 uuid primary key default gen_random_uuid(),
      system             text not null,
      edition            text not null,
      document_name      text not null,
      document_version   text not null,
      license            text not null,
      source_url         text not null,
      attribution        text not null,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint rules_source_document_nonempty
        check (
          btrim(system) <> '' and
          btrim(edition) <> '' and
          btrim(document_name) <> '' and
          btrim(document_version) <> '' and
          btrim(license) <> '' and
          btrim(source_url) <> '' and
          btrim(attribution) <> ''
        ),
      constraint rules_source_document_identity_key
        unique (system, edition, document_version)
    )
  `;

  yield* sql`
    create table rules_import_run (
      id                 uuid primary key default gen_random_uuid(),
      document_id        uuid not null references rules_source_document (id),
      provider           text not null,
      provider_version   text,
      provider_commit    text,
      imported_at        timestamptz not null default now(),
      constraint rules_import_run_provider_nonempty
        check (btrim(provider) <> '')
    )
  `;
  yield* sql`create index rules_import_run_document_id_idx on rules_import_run (document_id)`;

  yield* sql`
    create table rules_source_entity (
      id                 uuid primary key default gen_random_uuid(),
      document_id        uuid not null references rules_source_document (id),
      family             text not null,
      source_index       text not null,
      source_url         text,
      name               text not null,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint rules_source_entity_nonempty
        check (btrim(family) <> '' and btrim(source_index) <> '' and btrim(name) <> ''),
      constraint rules_source_entity_identity_key
        unique (document_id, family, source_index)
    )
  `;
  yield* sql`create index rules_source_entity_document_family_idx on rules_source_entity (document_id, family)`;

  yield* sql`
    create table rules_source_entity_revision (
      id                 uuid primary key default gen_random_uuid(),
      entity_id          uuid not null references rules_source_entity (id) on delete cascade,
      import_run_id      uuid not null references rules_import_run (id),
      content_hash       text not null,
      raw                jsonb not null,
      imported_at        timestamptz not null default now(),
      constraint rules_source_entity_revision_hash_nonempty
        check (btrim(content_hash) <> ''),
      constraint rules_source_entity_revision_identity_key
        unique (entity_id, content_hash),
      constraint rules_source_entity_revision_pair_key
        unique (id, entity_id)
    )
  `;
  yield* sql`
    create index rules_source_entity_revision_entity_id_idx
      on rules_source_entity_revision (entity_id, imported_at desc)
  `;
  yield* sql`
    create index rules_source_entity_revision_import_run_id_idx
      on rules_source_entity_revision (import_run_id)
  `;

  yield* sql`
    create table rules_source_link (
      id                 uuid primary key default gen_random_uuid(),
      from_revision_id   uuid not null references rules_source_entity_revision (id) on delete cascade,
      relation           text not null,
      to_entity_id       uuid references rules_source_entity (id),
      target_family      text not null,
      target_index       text not null,
      ordinal            integer not null default 0,
      payload            jsonb not null default '{}'::jsonb,
      constraint rules_source_link_nonempty
        check (btrim(relation) <> '' and btrim(target_family) <> '' and btrim(target_index) <> ''),
      constraint rules_source_link_unique_target
        unique (from_revision_id, relation, ordinal, target_family, target_index)
    )
  `;
  yield* sql`create index rules_source_link_to_entity_id_idx on rules_source_link (to_entity_id)`;

  yield* sql`alter table creature add column source_entity_id uuid`;
  yield* sql`alter table creature add column source_revision_id uuid`;
  yield* sql`
    alter table creature
      add constraint creature_source_entity_fkey
      foreign key (source_entity_id) references rules_source_entity (id)
  `;
  yield* sql`
    alter table creature
      add constraint creature_source_revision_pair_fkey
      foreign key (source_revision_id, source_entity_id)
      references rules_source_entity_revision (id, entity_id)
  `;
  yield* sql`
    alter table creature
      add constraint creature_source_provenance_pair
        check ((source_entity_id is null) = (source_revision_id is null))
  `;
  yield* sql`
    create index creature_source_revision_id_idx on creature (source_revision_id)
      where source_revision_id is not null
  `;
  yield* sql`
    create index creature_source_entity_id_idx on creature (source_entity_id)
      where source_entity_id is not null
  `;
  yield* sql`
    create unique index creature_system_source_entity_key
      on creature (source_entity_id)
      where campaign_id is null and account_id is null and source_entity_id is not null
  `;

  yield* sql`alter table character_option add column source_entity_id uuid`;
  yield* sql`alter table character_option add column source_revision_id uuid`;
  yield* sql`
    alter table character_option
      add constraint character_option_source_entity_fkey
      foreign key (source_entity_id) references rules_source_entity (id)
  `;
  yield* sql`
    alter table character_option
      add constraint character_option_source_revision_pair_fkey
      foreign key (source_revision_id, source_entity_id)
      references rules_source_entity_revision (id, entity_id)
  `;
  yield* sql`
    alter table character_option
      add constraint character_option_source_provenance_pair
        check ((source_entity_id is null) = (source_revision_id is null))
  `;
  yield* sql`
    create index character_option_source_revision_id_idx on character_option (source_revision_id)
      where source_revision_id is not null
  `;
  yield* sql`
    create index character_option_source_entity_id_idx on character_option (source_entity_id)
      where source_entity_id is not null
  `;
  yield* sql`
    create unique index character_option_system_source_entity_key
      on character_option (source_entity_id)
      where campaign_id is null and account_id is null and source_entity_id is not null
  `;

  // Names are display/search values now, not bundled identity. Dropping these
  // unique indexes is what lets two source entities share a display name, and
  // the fresh source-keyed importer does not need a transition index or backfill
  // because existing development data is disposable for this foundation slice.
  yield* sql`drop index creature_system_name_key`;
  yield* sql`drop index character_option_system_name_key`;
});
