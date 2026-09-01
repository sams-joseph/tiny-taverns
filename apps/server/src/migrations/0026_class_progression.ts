import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The concrete 2014 class-progression domain: subclasses, class levels and
 * features, with the same three-owner snapshot model as the class rows they
 * hang off.
 *
 * No generic source graph comes back here. Each domain row keeps only the
 * stable source triplet, and every relationship is a concrete foreign key:
 * subclass -> class option, class level -> class/subclass, feature -> class
 * level, and spell_subclass -> subclass.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // `spell_subclass` was deliberately deferred until this concrete subclass
  // table existed. If an unreleased local database has the old stub from an
  // earlier draft, discard it before creating the real FK-backed join.
  yield* sql`drop table if exists spell_subclass`;

  yield* sql`
    alter table character_option
      add column scope_kind text generated always as (
        case
          when campaign_id is not null then 'campaign'
          when account_id is not null then 'account'
          else 'system'
        end
      ) stored
  `;
  yield* sql`
    alter table character_option
      add column scope_id uuid generated always as (
        coalesce(campaign_id, account_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ) stored
  `;
  yield* sql`
    alter table character_option
      add constraint character_option_scope_key
      unique (id, scope_kind, scope_id)
  `;

  yield* sql`
    create table subclass (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid references campaign (id) on delete cascade,
      account_id         uuid references account (id) on delete cascade,
      derived_from       uuid references subclass (id) on delete set null,
      source_corpus      text,
      source_family      text,
      source_key         text,
      class_option_id    uuid not null references character_option (id) on delete cascade,
      name               text not null,
      flavor             text,
      body               jsonb not null default '{}'::jsonb,
      scope_kind         text generated always as (
        case
          when campaign_id is not null then 'campaign'
          when account_id is not null then 'account'
          else 'system'
        end
      ) stored,
      scope_id           uuid generated always as (
        coalesce(campaign_id, account_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ) stored,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint subclass_nonempty
        check (btrim(name) <> ''),
      constraint subclass_source_key_all_or_nothing
        check (
          (source_corpus is null and source_family is null and source_key is null)
          or (
            btrim(source_corpus) <> ''
            and btrim(source_family) <> ''
            and btrim(source_key) <> ''
          )
        ),
      constraint subclass_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint subclass_one_owner
        check (campaign_id is null or account_id is null),
      constraint subclass_system_is_unowned
        check ((origin = 'system') = (campaign_id is null and account_id is null))
    )
  `;
  yield* sql`
    alter table subclass
      add constraint subclass_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;
  yield* sql`
    alter table subclass
      add constraint subclass_class_same_scope_fkey
      foreign key (class_option_id, scope_kind, scope_id)
      references character_option (id, scope_kind, scope_id)
      deferrable initially deferred
  `;
  yield* sql`alter table subclass add constraint subclass_scope_key unique (id, scope_kind, scope_id)`;
  yield* sql`
    alter table subclass
      add constraint subclass_class_scope_key unique (id, class_option_id, scope_kind, scope_id)
  `;
  yield* sql`create index subclass_campaign_id_idx on subclass (campaign_id)`;
  yield* sql`create index subclass_account_id_idx on subclass (account_id) where account_id is not null`;
  yield* sql`create index subclass_class_option_id_idx on subclass (class_option_id)`;
  yield* sql`create index subclass_derived_from_idx on subclass (derived_from) where derived_from is not null`;
  yield* sql`
    create unique index subclass_system_source_key
      on subclass (source_corpus, source_family, source_key)
      where campaign_id is null and account_id is null and source_key is not null
  `;

  yield* sql`
    create table class_level (
      id                    uuid primary key default gen_random_uuid(),
      campaign_id           uuid references campaign (id) on delete cascade,
      account_id            uuid references account (id) on delete cascade,
      derived_from          uuid references class_level (id) on delete set null,
      source_corpus         text,
      source_family         text,
      source_key            text,
      class_option_id       uuid not null references character_option (id) on delete cascade,
      subclass_id           uuid references subclass (id) on delete cascade,
      level                 integer not null check (level >= 1 and level <= 20),
      ability_score_bonuses integer,
      proficiency_bonus     integer,
      body                  jsonb not null default '{}'::jsonb,
      scope_kind            text generated always as (
        case
          when campaign_id is not null then 'campaign'
          when account_id is not null then 'account'
          else 'system'
        end
      ) stored,
      scope_id              uuid generated always as (
        coalesce(campaign_id, account_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ) stored,
      visibility            text not null default 'dm'
                              check (visibility in ('dm', 'shared')),
      origin                text not null default 'authored'
                              check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id     uuid,
      created_at            timestamptz not null default now(),
      updated_at            timestamptz not null default now(),
      constraint class_level_source_key_all_or_nothing
        check (
          (source_corpus is null and source_family is null and source_key is null)
          or (
            btrim(source_corpus) <> ''
            and btrim(source_family) <> ''
            and btrim(source_key) <> ''
          )
        ),
      constraint class_level_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint class_level_one_owner
        check (campaign_id is null or account_id is null),
      constraint class_level_system_is_unowned
        check ((origin = 'system') = (campaign_id is null and account_id is null)),
      constraint class_level_ability_score_bonuses_nonnegative
        check (ability_score_bonuses is null or ability_score_bonuses >= 0),
      constraint class_level_proficiency_bonus_positive
        check (proficiency_bonus is null or proficiency_bonus > 0)
    )
  `;
  yield* sql`
    alter table class_level
      add constraint class_level_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;
  yield* sql`
    alter table class_level
      add constraint class_level_class_same_scope_fkey
      foreign key (class_option_id, scope_kind, scope_id)
      references character_option (id, scope_kind, scope_id)
      deferrable initially deferred
  `;
  yield* sql`
    alter table class_level
      add constraint class_level_subclass_same_class_scope_fkey
      foreign key (subclass_id, class_option_id, scope_kind, scope_id)
      references subclass (id, class_option_id, scope_kind, scope_id)
      deferrable initially deferred
  `;
  yield* sql`alter table class_level add constraint class_level_scope_key unique (id, scope_kind, scope_id)`;
  yield* sql`
    create unique index class_level_system_source_key
      on class_level (source_corpus, source_family, source_key)
      where campaign_id is null and account_id is null and source_key is not null
  `;
  yield* sql`
    create unique index class_level_class_level_key
      on class_level (scope_kind, scope_id, class_option_id, level)
      where subclass_id is null
  `;
  yield* sql`
    create unique index class_level_subclass_level_key
      on class_level (scope_kind, scope_id, subclass_id, level)
      where subclass_id is not null
  `;
  yield* sql`create index class_level_campaign_id_idx on class_level (campaign_id)`;
  yield* sql`create index class_level_account_id_idx on class_level (account_id) where account_id is not null`;
  yield* sql`create index class_level_class_option_id_idx on class_level (class_option_id)`;
  yield* sql`create index class_level_subclass_id_idx on class_level (subclass_id) where subclass_id is not null`;
  yield* sql`create index class_level_derived_from_idx on class_level (derived_from) where derived_from is not null`;

  yield* sql`
    create table feature (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid references campaign (id) on delete cascade,
      account_id         uuid references account (id) on delete cascade,
      derived_from       uuid references feature (id) on delete set null,
      source_corpus      text,
      source_family      text,
      source_key         text,
      class_option_id    uuid not null references character_option (id) on delete cascade,
      subclass_id        uuid references subclass (id) on delete cascade,
      class_level_id     uuid references class_level (id) on delete set null,
      parent_feature_id  uuid references feature (id) on delete set null,
      name               text not null,
      level              integer not null check (level >= 1 and level <= 20),
      body               jsonb not null default '{}'::jsonb,
      scope_kind         text generated always as (
        case
          when campaign_id is not null then 'campaign'
          when account_id is not null then 'account'
          else 'system'
        end
      ) stored,
      scope_id           uuid generated always as (
        coalesce(campaign_id, account_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ) stored,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint feature_nonempty
        check (btrim(name) <> ''),
      constraint feature_source_key_all_or_nothing
        check (
          (source_corpus is null and source_family is null and source_key is null)
          or (
            btrim(source_corpus) <> ''
            and btrim(source_family) <> ''
            and btrim(source_key) <> ''
          )
        ),
      constraint feature_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint feature_one_owner
        check (campaign_id is null or account_id is null),
      constraint feature_system_is_unowned
        check ((origin = 'system') = (campaign_id is null and account_id is null))
    )
  `;
  yield* sql`
    alter table feature
      add constraint feature_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;
  yield* sql`
    alter table feature
      add constraint feature_class_same_scope_fkey
      foreign key (class_option_id, scope_kind, scope_id)
      references character_option (id, scope_kind, scope_id)
      deferrable initially deferred
  `;
  yield* sql`
    alter table feature
      add constraint feature_subclass_same_class_scope_fkey
      foreign key (subclass_id, class_option_id, scope_kind, scope_id)
      references subclass (id, class_option_id, scope_kind, scope_id)
      deferrable initially deferred
  `;
  yield* sql`
    alter table feature
      add constraint feature_level_same_scope_fkey
      foreign key (class_level_id, scope_kind, scope_id)
      references class_level (id, scope_kind, scope_id)
      deferrable initially deferred
  `;
  yield* sql`alter table feature add constraint feature_scope_key unique (id, scope_kind, scope_id)`;
  yield* sql`
    alter table feature
      add constraint feature_parent_same_scope_fkey
      foreign key (parent_feature_id, scope_kind, scope_id)
      references feature (id, scope_kind, scope_id)
      deferrable initially deferred
  `;
  yield* sql`
    create unique index feature_system_source_key
      on feature (source_corpus, source_family, source_key)
      where campaign_id is null and account_id is null and source_key is not null
  `;
  yield* sql`create index feature_campaign_id_idx on feature (campaign_id)`;
  yield* sql`create index feature_account_id_idx on feature (account_id) where account_id is not null`;
  yield* sql`create index feature_class_option_id_idx on feature (class_option_id)`;
  yield* sql`create index feature_subclass_id_idx on feature (subclass_id) where subclass_id is not null`;
  yield* sql`create index feature_class_level_id_idx on feature (class_level_id) where class_level_id is not null`;
  yield* sql`create index feature_parent_feature_id_idx on feature (parent_feature_id) where parent_feature_id is not null`;
  yield* sql`create index feature_derived_from_idx on feature (derived_from) where derived_from is not null`;

  yield* sql`
    create table spell_subclass (
      spell_id    uuid not null references spell (id) on delete cascade,
      subclass_id uuid not null references subclass (id),
      ordinal     integer not null default 0,
      primary key (spell_id, subclass_id),
      constraint spell_subclass_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index spell_subclass_subclass_id_idx on spell_subclass (subclass_id)`;
});
