import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The 2014 rules compendium as copyable reference articles.
 *
 * A `rule_article` follows the same three-owner Library model as creatures,
 * character options, spells, equipment and magic items: system rows are
 * unowned, Library originals belong to an account, and a campaign holds
 * snapshots. The ordered `rule_section` rows hang off the article, so a copied
 * article remains coherent even when the system corpus is imported again.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table rule_article (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid references campaign (id) on delete cascade,
      account_id         uuid references account (id) on delete cascade,
      derived_from       uuid references rule_article (id) on delete set null,
      source_corpus      text,
      source_family      text,
      source_key         text,
      name               text not null,
      body               jsonb not null default '[]'::jsonb,
      search             tsvector generated always as (
        setweight(to_tsvector('english', name), 'A') ||
        setweight(jsonb_to_tsvector('english', body, '["string"]'), 'B')
      ) stored,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint rule_article_nonempty check (btrim(name) <> ''),
      constraint rule_article_source_key_triplet
        check (
          (source_corpus is null and source_family is null and source_key is null)
          or (
            source_corpus is not null and source_family is not null and source_key is not null
            and btrim(source_corpus) <> '' and btrim(source_family) <> '' and btrim(source_key) <> ''
          )
        ),
      constraint rule_article_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint rule_article_one_owner
        check (campaign_id is null or account_id is null),
      constraint rule_article_system_is_unowned
        check ((origin = 'system') = (campaign_id is null and account_id is null))
    )
  `;

  yield* sql`
    alter table rule_article
      add constraint rule_article_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;

  yield* sql`create index rule_article_campaign_id_idx on rule_article (campaign_id)`;
  yield* sql`
    create index rule_article_account_id_idx on rule_article (account_id)
      where account_id is not null
  `;
  yield* sql`
    create index rule_article_derived_from_idx on rule_article (derived_from)
      where derived_from is not null
  `;
  yield* sql`
    create unique index rule_article_system_source_key
      on rule_article (source_corpus, source_family, source_key)
      where campaign_id is null and account_id is null and source_key is not null
  `;
  yield* sql`create index rule_article_search_idx on rule_article using gin (search)`;

  yield* sql`
    create table rule_section (
      id                uuid primary key default gen_random_uuid(),
      article_id        uuid not null references rule_article (id) on delete cascade,
      parent_section_id uuid,
      source_corpus     text,
      source_family     text,
      source_key        text,
      title             text not null,
      body              jsonb not null default '[]'::jsonb,
      ordinal           integer not null default 0,
      search            tsvector generated always as (
        setweight(to_tsvector('english', title), 'A') ||
        setweight(jsonb_to_tsvector('english', body, '["string"]'), 'B')
      ) stored,
      created_at        timestamptz not null default now(),
      updated_at        timestamptz not null default now(),
      constraint rule_section_nonempty check (btrim(title) <> ''),
      constraint rule_section_ordinal_nonnegative check (ordinal >= 0),
      constraint rule_section_source_key_triplet
        check (
          (source_corpus is null and source_family is null and source_key is null)
          or (
            source_corpus is not null and source_family is not null and source_key is not null
            and btrim(source_corpus) <> '' and btrim(source_family) <> '' and btrim(source_key) <> ''
          )
        ),
      constraint rule_section_article_source_key unique (article_id, source_corpus, source_family, source_key),
      constraint rule_section_id_article_key unique (id, article_id)
    )
  `;

  yield* sql`
    alter table rule_section
      add constraint rule_section_parent_same_article_fkey
      foreign key (parent_section_id, article_id)
      references rule_section (id, article_id)
      deferrable initially deferred
  `;

  yield* sql`create index rule_section_article_id_idx on rule_section (article_id)`;
  yield* sql`
    create index rule_section_parent_section_id_idx on rule_section (parent_section_id)
      where parent_section_id is not null
  `;
  yield* sql`
    create index rule_section_source_key_idx on rule_section (source_corpus, source_family, source_key)
      where source_key is not null
  `;
  yield* sql`create index rule_section_search_idx on rule_section using gin (search)`;
});
