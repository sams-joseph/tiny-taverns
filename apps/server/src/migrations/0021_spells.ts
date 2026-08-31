import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The 2014 SRD spell corpus as a concrete, copyable table.
 *
 * It is deliberately **not** a `character_option` kind: spells are a large
 * searchable corpus with their own filters — level, school, ritual,
 * concentration and class — and with a display document shaped nothing like a
 * class, race or background. The ownership columns are the Library model the
 * product already proved for `creature` and `character_option`: the bundle is
 * unowned, a Library original belongs to an account, and a campaign holds
 * copied state.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table spell (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid references campaign (id) on delete cascade,
      account_id         uuid references account (id) on delete cascade,
      derived_from       uuid references spell (id) on delete set null,
      source_entity_id   uuid,
      source_revision_id uuid,
      name               text not null,
      level              integer not null check (level >= 0 and level <= 9),
      school_index       text not null,
      school_name        text not null,
      ritual             boolean not null default false,
      concentration      boolean not null default false,
      casting_time       text not null,
      spell_range        text not null,
      duration           text not null,
      class_indexes      text[] not null default '{}'::text[],
      class_names        text[] not null default '{}'::text[],
      subclass_indexes   text[] not null default '{}'::text[],
      subclass_names     text[] not null default '{}'::text[],
      body               jsonb not null default '{}'::jsonb,
      search             tsvector generated always as (
        setweight(to_tsvector('english', name), 'A') ||
        setweight(to_tsvector('english', school_name), 'B') ||
        setweight(jsonb_to_tsvector('english', body, '["string"]'), 'C')
      ) stored,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint spell_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint spell_one_owner
        check (campaign_id is null or account_id is null),
      constraint spell_system_is_unowned
        check ((origin = 'system') = (campaign_id is null and account_id is null)),
      constraint spell_source_provenance_pair
        check ((source_entity_id is null) = (source_revision_id is null))
    )
  `;

  yield* sql`
    alter table spell
      add constraint spell_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;

  yield* sql`
    alter table spell
      add constraint spell_source_entity_fkey
      foreign key (source_entity_id) references rules_source_entity (id)
  `;

  yield* sql`
    alter table spell
      add constraint spell_source_revision_pair_fkey
      foreign key (source_revision_id, source_entity_id)
      references rules_source_entity_revision (id, entity_id)
  `;

  yield* sql`create index spell_campaign_id_idx on spell (campaign_id)`;
  yield* sql`
    create index spell_account_id_idx on spell (account_id)
      where account_id is not null
  `;
  yield* sql`
    create index spell_derived_from_idx on spell (derived_from)
      where derived_from is not null
  `;
  yield* sql`
    create index spell_source_revision_id_idx on spell (source_revision_id)
      where source_revision_id is not null
  `;
  yield* sql`
    create index spell_source_entity_id_idx on spell (source_entity_id)
      where source_entity_id is not null
  `;
  yield* sql`
    create unique index spell_system_source_entity_key
      on spell (source_entity_id)
      where campaign_id is null and account_id is null and source_entity_id is not null
  `;

  yield* sql`create index spell_search_idx on spell using gin (search)`;
  yield* sql`create index spell_level_idx on spell (level)`;
  yield* sql`create index spell_school_index_idx on spell (school_index)`;
  yield* sql`create index spell_class_indexes_idx on spell using gin (class_indexes)`;
  yield* sql`create index spell_ritual_idx on spell (ritual)`;
  yield* sql`create index spell_concentration_idx on spell (concentration)`;
});
