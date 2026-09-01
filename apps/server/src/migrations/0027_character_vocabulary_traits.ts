import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The concrete 2014 character vocabulary slice: abilities, skills, languages,
 * proficiencies and racial traits, plus the FK-backed grants and choices that
 * races, subraces, backgrounds and traits point at.
 *
 * It keeps the existing `character_option` shape: a race still contains its
 * subraces in the document for creation, but each imported subrace also gets a
 * contained row so relationship joins never use a label as identity. Campaign
 * copies receive copied child rows and trait snapshots; character creation does
 * not automatically apply any of these grants in this slice.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table ability_score add column full_name text`;
  yield* sql`alter table ability_score add column body jsonb not null default '{}'::jsonb`;

  yield* sql`
    create table language (
      id               uuid primary key default gen_random_uuid(),
      source_corpus    text not null,
      source_key       text not null,
      name             text not null,
      type             text not null,
      script           text,
      typical_speakers text[] not null default '{}',
      created_at       timestamptz not null default now(),
      updated_at       timestamptz not null default now(),
      constraint language_nonempty
        check (
          btrim(source_corpus) <> '' and
          btrim(source_key) <> '' and
          btrim(name) <> '' and
          btrim(type) <> ''
        ),
      constraint language_source_key unique (source_corpus, source_key)
    )
  `;

  yield* sql`
    create table skill (
      id               uuid primary key default gen_random_uuid(),
      source_corpus    text not null,
      source_key       text not null,
      name             text not null,
      ability_score_id uuid not null references ability_score (id),
      body             jsonb not null default '{}'::jsonb,
      created_at       timestamptz not null default now(),
      updated_at       timestamptz not null default now(),
      constraint skill_nonempty
        check (btrim(source_corpus) <> '' and btrim(source_key) <> '' and btrim(name) <> ''),
      constraint skill_source_key unique (source_corpus, source_key)
    )
  `;
  yield* sql`create index skill_ability_score_id_idx on skill (ability_score_id)`;

  yield* sql`alter table proficiency add column type text not null default 'Other'`;
  yield* sql`alter table proficiency add column reference_family text`;
  yield* sql`alter table proficiency add column reference_key text`;
  yield* sql`alter table proficiency add column skill_id uuid references skill (id)`;
  yield* sql`alter table proficiency add column ability_score_id uuid references ability_score (id)`;
  yield* sql`create index proficiency_skill_id_idx on proficiency (skill_id) where skill_id is not null`;
  yield* sql`
    create index proficiency_ability_score_id_idx
      on proficiency (ability_score_id) where ability_score_id is not null
  `;
  yield* sql`
    alter table proficiency add constraint proficiency_reference_key_pair
      check ((reference_family is null) = (reference_key is null))
  `;

  yield* sql`
    create table racial_trait (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid references campaign (id) on delete cascade,
      account_id         uuid references account (id) on delete cascade,
      derived_from       uuid references racial_trait (id) on delete set null,
      source_corpus      text,
      source_family      text,
      source_key         text,
      parent_trait_id    uuid,
      name               text not null,
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
      constraint racial_trait_nonempty check (btrim(name) <> ''),
      constraint racial_trait_source_key_all_or_nothing
        check (
          (source_corpus is null and source_family is null and source_key is null)
          or (
            btrim(source_corpus) <> '' and
            btrim(source_family) <> '' and
            btrim(source_key) <> ''
          )
        ),
      constraint racial_trait_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint racial_trait_one_owner
        check (campaign_id is null or account_id is null),
      constraint racial_trait_system_is_unowned
        check ((origin = 'system') = (campaign_id is null and account_id is null))
    )
  `;
  yield* sql`
    alter table racial_trait
      add constraint racial_trait_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;
  yield* sql`alter table racial_trait add constraint racial_trait_scope_key unique (id, scope_kind, scope_id)`;
  yield* sql`
    alter table racial_trait
      add constraint racial_trait_parent_same_scope_fkey
      foreign key (parent_trait_id, scope_kind, scope_id)
      references racial_trait (id, scope_kind, scope_id)
      deferrable initially deferred
  `;
  yield* sql`create index racial_trait_campaign_id_idx on racial_trait (campaign_id)`;
  yield* sql`create index racial_trait_account_id_idx on racial_trait (account_id) where account_id is not null`;
  yield* sql`create index racial_trait_derived_from_idx on racial_trait (derived_from) where derived_from is not null`;
  yield* sql`create index racial_trait_parent_trait_id_idx on racial_trait (parent_trait_id) where parent_trait_id is not null`;
  yield* sql`
    create unique index racial_trait_system_source_key
      on racial_trait (source_corpus, source_family, source_key)
      where campaign_id is null and account_id is null and source_key is not null
  `;

  yield* sql`
    create table character_option_subrace (
      id            uuid primary key default gen_random_uuid(),
      option_id     uuid not null references character_option (id) on delete cascade,
      source_corpus text,
      source_family text,
      source_key    text,
      name          text not null,
      body          jsonb not null default '{}'::jsonb,
      ordinal       integer not null default 0,
      created_at    timestamptz not null default now(),
      updated_at    timestamptz not null default now(),
      constraint character_option_subrace_nonempty check (btrim(name) <> ''),
      constraint character_option_subrace_ordinal_nonnegative check (ordinal >= 0),
      constraint character_option_subrace_source_key_all_or_nothing
        check (
          (source_corpus is null and source_family is null and source_key is null)
          or (
            btrim(source_corpus) <> '' and
            btrim(source_family) <> '' and
            btrim(source_key) <> ''
          )
        ),
      constraint character_option_subrace_source_key unique (option_id, source_corpus, source_family, source_key),
      constraint character_option_subrace_id_option_key unique (id, option_id)
    )
  `;
  yield* sql`create index character_option_subrace_option_id_idx on character_option_subrace (option_id)`;

  const childOwnerCheck = (table: string): string => `
    alter table ${table}
      add constraint ${table}_subrace_belongs_to_option_fkey
      foreign key (subrace_id, option_id)
      references character_option_subrace (id, option_id)
      on delete cascade
  `;

  yield* sql`
    create table character_option_ability_bonus (
      id               uuid primary key default gen_random_uuid(),
      option_id        uuid not null references character_option (id) on delete cascade,
      subrace_id       uuid,
      ability_score_id uuid not null references ability_score (id),
      amount           integer not null,
      ordinal          integer not null default 0,
      constraint character_option_ability_bonus_amount_positive check (amount > 0),
      constraint character_option_ability_bonus_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql.unsafe(childOwnerCheck("character_option_ability_bonus"));
  yield* sql`create index character_option_ability_bonus_ability_score_id_idx on character_option_ability_bonus (ability_score_id)`;

  yield* sql`
    create table character_option_language (
      id          uuid primary key default gen_random_uuid(),
      option_id   uuid not null references character_option (id) on delete cascade,
      subrace_id  uuid,
      language_id uuid not null references language (id),
      ordinal     integer not null default 0,
      constraint character_option_language_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql.unsafe(childOwnerCheck("character_option_language"));
  yield* sql`create index character_option_language_language_id_idx on character_option_language (language_id)`;

  yield* sql`
    create table character_option_proficiency (
      id             uuid primary key default gen_random_uuid(),
      option_id      uuid not null references character_option (id) on delete cascade,
      subrace_id     uuid,
      proficiency_id uuid not null references proficiency (id),
      ordinal        integer not null default 0,
      constraint character_option_proficiency_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql.unsafe(childOwnerCheck("character_option_proficiency"));
  yield* sql`create index character_option_proficiency_proficiency_id_idx on character_option_proficiency (proficiency_id)`;

  yield* sql`
    create table character_option_trait (
      id         uuid primary key default gen_random_uuid(),
      option_id  uuid not null references character_option (id) on delete cascade,
      subrace_id uuid,
      trait_id   uuid not null references racial_trait (id),
      ordinal    integer not null default 0,
      constraint character_option_trait_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql.unsafe(childOwnerCheck("character_option_trait"));
  yield* sql`create index character_option_trait_trait_id_idx on character_option_trait (trait_id)`;

  yield* sql`
    create table racial_trait_proficiency (
      trait_id       uuid not null references racial_trait (id) on delete cascade,
      proficiency_id uuid not null references proficiency (id),
      ordinal        integer not null default 0,
      primary key (trait_id, proficiency_id, ordinal),
      constraint racial_trait_proficiency_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index racial_trait_proficiency_proficiency_id_idx on racial_trait_proficiency (proficiency_id)`;

  yield* sql`
    create table racial_trait_damage_type (
      trait_id       uuid not null references racial_trait (id) on delete cascade,
      damage_type_id uuid not null references damage_type (id),
      relation       text not null,
      ordinal        integer not null default 0,
      primary key (trait_id, relation, damage_type_id, ordinal),
      constraint racial_trait_damage_type_relation check (relation in ('damage', 'resistance')),
      constraint racial_trait_damage_type_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index racial_trait_damage_type_damage_type_id_idx on racial_trait_damage_type (damage_type_id)`;

  yield* sql`
    create table rule_choice_group (
      id          uuid primary key default gen_random_uuid(),
      option_id   uuid references character_option (id) on delete cascade,
      subrace_id  uuid,
      trait_id    uuid references racial_trait (id) on delete cascade,
      kind        text not null check (kind in ('ability-score', 'language', 'proficiency', 'trait')),
      choose      integer not null,
      description text,
      ordinal     integer not null default 0,
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now(),
      constraint rule_choice_group_owner
        check (
          (trait_id is not null and option_id is null and subrace_id is null)
          or
          (trait_id is null and option_id is not null)
        ),
      constraint rule_choice_group_choose_positive check (choose > 0),
      constraint rule_choice_group_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`
    alter table rule_choice_group
      add constraint rule_choice_group_subrace_belongs_to_option_fkey
      foreign key (subrace_id, option_id)
      references character_option_subrace (id, option_id)
      on delete cascade
  `;
  yield* sql`create index rule_choice_group_option_id_idx on rule_choice_group (option_id) where option_id is not null`;
  yield* sql`create index rule_choice_group_trait_id_idx on rule_choice_group (trait_id) where trait_id is not null`;

  yield* sql`
    create table rule_choice_ability (
      group_id         uuid not null references rule_choice_group (id) on delete cascade,
      ability_score_id uuid not null references ability_score (id),
      amount           integer not null,
      ordinal          integer not null default 0,
      primary key (group_id, ability_score_id, ordinal),
      constraint rule_choice_ability_amount_positive check (amount > 0),
      constraint rule_choice_ability_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index rule_choice_ability_ability_score_id_idx on rule_choice_ability (ability_score_id)`;

  yield* sql`
    create table rule_choice_language (
      group_id    uuid not null references rule_choice_group (id) on delete cascade,
      language_id uuid not null references language (id),
      ordinal     integer not null default 0,
      primary key (group_id, language_id, ordinal),
      constraint rule_choice_language_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index rule_choice_language_language_id_idx on rule_choice_language (language_id)`;

  yield* sql`
    create table rule_choice_proficiency (
      group_id       uuid not null references rule_choice_group (id) on delete cascade,
      proficiency_id uuid not null references proficiency (id),
      ordinal        integer not null default 0,
      primary key (group_id, proficiency_id, ordinal),
      constraint rule_choice_proficiency_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index rule_choice_proficiency_proficiency_id_idx on rule_choice_proficiency (proficiency_id)`;

  yield* sql`
    create table rule_choice_trait (
      group_id uuid not null references rule_choice_group (id) on delete cascade,
      trait_id uuid not null references racial_trait (id),
      ordinal  integer not null default 0,
      primary key (group_id, trait_id, ordinal),
      constraint rule_choice_trait_ordinal_nonnegative check (ordinal >= 0)
    )
  `;
  yield* sql`create index rule_choice_trait_trait_id_idx on rule_choice_trait (trait_id)`;
});
