import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The 2014 SRD magic item corpus as its own copyable table.
 *
 * Magic items are not mundane equipment. They need rarity, attunement and
 * variant/base navigation, and a campaign still holds snapshots copied from an
 * account Library or from the bundled unowned corpus.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table magic_item (
      id                       uuid primary key default gen_random_uuid(),
      campaign_id              uuid references campaign (id) on delete cascade,
      account_id               uuid references account (id) on delete cascade,
      derived_from             uuid references magic_item (id) on delete set null,
      source_entity_id         uuid,
      source_revision_id       uuid,
      name                     text not null,
      category_index           text not null,
      category_name            text not null,
      rarity_index             text not null,
      rarity_name              text not null,
      rarity_sort              integer not null check (rarity_sort >= 0),
      requires_attunement      boolean not null default false,
      attunement_requirement   text,
      is_variant               boolean not null default false,
      base_item_id             uuid,
      variant_count            integer not null default 0 check (variant_count >= 0),
      image                    text,
      body                     jsonb not null default '{}'::jsonb,
      scope_kind               text generated always as (
        case
          when campaign_id is not null then 'campaign'
          when account_id is not null then 'account'
          else 'system'
        end
      ) stored,
      scope_id                 uuid generated always as (
        coalesce(campaign_id, account_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ) stored,
      search                   tsvector generated always as (
        setweight(to_tsvector('english', name), 'A') ||
        setweight(to_tsvector('english', category_name || ' ' || rarity_name || ' ' || coalesce(attunement_requirement, '')), 'B') ||
        setweight(jsonb_to_tsvector('english', body, '["string"]'), 'C')
      ) stored,
      visibility               text not null default 'dm'
                                 check (visibility in ('dm', 'shared')),
      origin                   text not null default 'authored'
                                 check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id        uuid,
      created_at               timestamptz not null default now(),
      updated_at               timestamptz not null default now(),
      constraint magic_item_nonempty
        check (
          btrim(name) <> '' and
          btrim(category_index) <> '' and btrim(category_name) <> '' and
          btrim(rarity_index) <> '' and btrim(rarity_name) <> ''
        ),
      constraint magic_item_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint magic_item_one_owner
        check (campaign_id is null or account_id is null),
      constraint magic_item_system_is_unowned
        check ((origin = 'system') = (campaign_id is null and account_id is null)),
      constraint magic_item_source_provenance_pair
        check ((source_entity_id is null) = (source_revision_id is null)),
      constraint magic_item_attunement_text
        check (requires_attunement or attunement_requirement is null),
      constraint magic_item_variant_has_base
        check (is_variant = (base_item_id is not null)),
      constraint magic_item_variant_not_base
        check (not is_variant or variant_count = 0),
      constraint magic_item_base_not_self
        check (base_item_id is null or base_item_id <> id)
    )
  `;

  yield* sql`
    alter table magic_item
      add constraint magic_item_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;

  yield* sql`
    alter table magic_item
      add constraint magic_item_source_entity_fkey
      foreign key (source_entity_id) references rules_source_entity (id)
  `;

  yield* sql`
    alter table magic_item
      add constraint magic_item_source_revision_pair_fkey
      foreign key (source_revision_id, source_entity_id)
      references rules_source_entity_revision (id, entity_id)
  `;

  yield* sql`
    alter table magic_item
      add constraint magic_item_scope_key
      unique (id, scope_kind, scope_id)
  `;

  yield* sql`
    alter table magic_item
      add constraint magic_item_base_same_scope_fkey
      foreign key (base_item_id, scope_kind, scope_id)
      references magic_item (id, scope_kind, scope_id)
      deferrable initially deferred
  `;

  yield* sql`create index magic_item_campaign_id_idx on magic_item (campaign_id)`;
  yield* sql`
    create index magic_item_account_id_idx on magic_item (account_id)
      where account_id is not null
  `;
  yield* sql`
    create index magic_item_derived_from_idx on magic_item (derived_from)
      where derived_from is not null
  `;
  yield* sql`
    create index magic_item_base_item_id_idx on magic_item (base_item_id)
      where base_item_id is not null
  `;
  yield* sql`
    create index magic_item_source_revision_id_idx on magic_item (source_revision_id)
      where source_revision_id is not null
  `;
  yield* sql`
    create index magic_item_source_entity_id_idx on magic_item (source_entity_id)
      where source_entity_id is not null
  `;
  yield* sql`
    create unique index magic_item_system_source_entity_key
      on magic_item (source_entity_id)
      where campaign_id is null and account_id is null and source_entity_id is not null
  `;

  yield* sql`create index magic_item_search_idx on magic_item using gin (search)`;
  yield* sql`create index magic_item_category_index_idx on magic_item (category_index)`;
  yield* sql`create index magic_item_rarity_index_idx on magic_item (rarity_index)`;
  yield* sql`create index magic_item_requires_attunement_idx on magic_item (requires_attunement)`;
  yield* sql`create index magic_item_is_variant_idx on magic_item (is_variant)`;
  yield* sql`create index magic_item_variant_count_idx on magic_item (variant_count)`;
});
