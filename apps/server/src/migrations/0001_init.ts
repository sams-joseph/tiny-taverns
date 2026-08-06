import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Foundation schema: accounts, campaigns, sessions, characters, notes.
 *
 * Migrations are forward-only — `effect/unstable/sql/Migrator` has no
 * down-migration concept and none is invented here. A mistake is corrected by a
 * new migration, never by reversing this one. Migration files are a historical
 * record, so the DDL is written out literally rather than generated from a
 * helper: what ran is what you can read.
 *
 * Every content-bearing table carries the same three-column tail:
 *
 *   visibility         — 'dm' by default, so a row nobody thought about is
 *                        invisible to a player rather than accidentally shared
 *   origin             — where the content came from
 *   assistant_turn_id  — set exactly when origin = 'assistant'
 *
 * `apps/server/test/schema.test.ts` fails if a future table omits any of them.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // The DM. Multi-tenancy is not the point — the seam needs an actor, and a
  // bearer token needs something to resolve to.
  yield* sql`
    create table account (
      id          uuid primary key default gen_random_uuid(),
      name        text not null,
      token_hash  text not null unique,
      created_at  timestamptz not null default now()
    )
  `;

  yield* sql`
    create table campaign (
      id                 uuid primary key default gen_random_uuid(),
      account_id         uuid not null references account (id) on delete cascade,
      name               text not null,
      party_name         text,
      player_count       integer not null default 0 check (player_count between 0 and 64),
      current_session_id uuid,
      archived_at        timestamptz,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint campaign_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`create index campaign_account_id_idx on campaign (account_id)`;

  yield* sql`
    create table session (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid not null references campaign (id) on delete cascade,
      number             integer not null check (number > 0),
      title              text,
      started_at         timestamptz,
      ended_at           timestamptz,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint session_number_unique unique (campaign_id, number),
      constraint session_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;

  // Circular by nature: the campaign points at the session it is running.
  // Added after `session` exists rather than deferred.
  yield* sql`
    alter table campaign
      add constraint campaign_current_session_id_fkey
      foreign key (current_session_id) references session (id) on delete set null
  `;

  yield* sql`
    create table character (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid not null references campaign (id) on delete cascade,
      name               text not null,
      player_name        text,
      descriptor         text,
      ac                 integer check (ac between 0 and 40),
      hp_max             integer check (hp_max between 0 and 10000),
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint character_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`create index character_campaign_id_idx on character (campaign_id)`;

  yield* sql`
    create table note (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid not null references campaign (id) on delete cascade,
      title              text not null,
      body               text not null default '',
      kind               text not null default 'note'
                           check (kind in ('note', 'read_aloud')),
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint note_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`create index note_campaign_id_idx on note (campaign_id)`;
});
