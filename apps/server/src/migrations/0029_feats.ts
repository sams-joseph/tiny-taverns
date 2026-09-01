import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The 2014 feat corpus as its own copyable Library table.
 *
 * Feats share the three-owner Library/campaign snapshot model used by the other
 * rules corpora. Their descriptions and ability-score prerequisites are child
 * rows, so a campaign copy remains coherent after the system corpus is imported
 * again and prerequisite identity is a real FK rather than a name in prose.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table feat (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid references campaign (id) on delete cascade,
      account_id         uuid references account (id) on delete cascade,
      derived_from       uuid references feat (id) on delete set null,
      source_corpus      text,
      source_family      text,
      source_key         text,
      name               text not null,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint feat_nonempty check (btrim(name) <> ''),
      constraint feat_source_key_triplet
        check (
          (source_corpus is null and source_family is null and source_key is null)
          or (
            source_corpus is not null and source_family is not null and source_key is not null
            and btrim(source_corpus) <> '' and btrim(source_family) <> '' and btrim(source_key) <> ''
          )
        ),
      constraint feat_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint feat_one_owner
        check (campaign_id is null or account_id is null),
      constraint feat_system_is_unowned
        check ((origin = 'system') = (campaign_id is null and account_id is null))
    )
  `;

  yield* sql`
    alter table feat
      add constraint feat_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;

  yield* sql`create index feat_campaign_id_idx on feat (campaign_id)`;
  yield* sql`create index feat_account_id_idx on feat (account_id) where account_id is not null`;
  yield* sql`create index feat_derived_from_idx on feat (derived_from) where derived_from is not null`;
  yield* sql`
    create unique index feat_system_source_key
      on feat (source_corpus, source_family, source_key)
      where campaign_id is null and account_id is null and source_key is not null
  `;

  yield* sql`
    create table feat_description (
      id         uuid primary key default gen_random_uuid(),
      feat_id    uuid not null references feat (id) on delete cascade,
      ordinal    integer not null default 0,
      text       text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint feat_description_ordinal_nonnegative check (ordinal >= 0),
      constraint feat_description_feat_ordinal unique (feat_id, ordinal)
    )
  `;
  yield* sql`create index feat_description_feat_id_idx on feat_description (feat_id)`;

  yield* sql`
    create table feat_prerequisite_group (
      id         uuid primary key default gen_random_uuid(),
      feat_id    uuid not null references feat (id) on delete cascade,
      ordinal    integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint feat_prerequisite_group_ordinal_nonnegative check (ordinal >= 0),
      constraint feat_prerequisite_group_feat_ordinal unique (feat_id, ordinal),
      constraint feat_prerequisite_group_id_feat_key unique (id, feat_id)
    )
  `;
  yield* sql`create index feat_prerequisite_group_feat_id_idx on feat_prerequisite_group (feat_id)`;

  yield* sql`
    create table feat_prerequisite_ability_score (
      id               uuid primary key default gen_random_uuid(),
      feat_id          uuid not null references feat (id) on delete cascade,
      group_id         uuid not null,
      ability_score_id uuid not null references ability_score (id),
      minimum_score    integer not null,
      ordinal          integer not null default 0,
      created_at       timestamptz not null default now(),
      updated_at       timestamptz not null default now(),
      constraint feat_prerequisite_ability_score_minimum check (minimum_score between 1 and 30),
      constraint feat_prerequisite_ability_score_ordinal_nonnegative check (ordinal >= 0),
      constraint feat_prerequisite_ability_score_group_fkey
        foreign key (group_id, feat_id)
        references feat_prerequisite_group (id, feat_id)
        on delete cascade,
      constraint feat_prerequisite_ability_score_once_per_group
        unique (group_id, ability_score_id)
    )
  `;
  yield* sql`create index feat_prerequisite_ability_score_feat_id_idx on feat_prerequisite_ability_score (feat_id)`;
  yield* sql`create index feat_prerequisite_ability_score_ability_idx on feat_prerequisite_ability_score (ability_score_id)`;
});
