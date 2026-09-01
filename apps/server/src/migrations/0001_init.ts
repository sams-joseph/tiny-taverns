import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Foundation schema: accounts, groups, campaigns, participation, sessions,
 * characters, notes.
 *
 * Migrations are forward-only — `effect/unstable/sql/Migrator` has no
 * down-migration concept and none is invented here. A mistake is corrected by a
 * new migration, never by reversing this one.
 *
 * **This file is a clean baseline, not a history.** The group architecture of
 * 2026-09-01 was designed against a disposable database, so the final
 * constraints are written directly here rather than reached through
 * alter-table archaeology. A database that ran the old ledger keeps the old
 * ledger and must be reset (`pnpm db:reset`, or `db:reset:fresh` without
 * Docker) — the migrator skips ids at or below the highest applied, so an old
 * database silently keeps the old shape and the server must not be pointed at
 * one.
 *
 * ### The model, in one place
 *
 * - A **group** (`play_group` — `group` is a keyword) is the top-level social
 *   container: users, campaigns, shared history. It has one owner, who manages
 *   membership and invitations.
 * - **Group membership is eligibility, not participation.** A live member may
 *   create campaigns in the group and reads group-level surfaces; a campaign's
 *   content needs that campaign's own participant row.
 * - A **campaign** belongs to exactly one group and has exactly one creator,
 *   who is its sole DM. There is **no role column anywhere** — creator-ness is
 *   `campaign.creator_account_id`, owner-ness is `play_group.owner_account_id`,
 *   and every other live participant is a player.
 * - A **character** is account-owned and top-level, and its playable state is
 *   canonical across every campaign that seats it (the captain's continuity
 *   decision): level, hit points, conditions, inventory and the sheet carry
 *   across tables. `campaign_character` is the party join — lifecycle, display
 *   snapshots and campaign-scoped visibility — never a fork of playable state.
 *   History still snapshots: `combatant` copies display fields at seed time.
 *
 * ### The constraint idiom
 *
 * Lifecycle invariants are composite foreign keys onto generated columns, the
 * `0006_session_finished.ts` trick: widen both ends of a key with a generated
 * boolean encoding the thing that must be true, and let the key refuse the
 * combination that must not exist. `deferrable initially deferred` wherever the
 * pair is written as two statements of one transaction.
 *
 * Three chains of it here:
 *
 *   play_group.owner_account_id  → live group_member     (owner is a member)
 *   campaign.creator_account_id  → live group_member     (creator is eligible)
 *   campaign.creator_account_id  → live campaign_member  (creator participates)
 *   campaign_member              → live group_member     (participation needs eligibility)
 *   campaign_character (active)  → live campaign_member  (a seat needs participation)
 *
 * The referencing side of the conditional ones uses `nullif(<live>, false)` so
 * a *retired* row stops referencing anything — Postgres skips a composite FK
 * with any null column — while a live row must match a live target. Revoking a
 * group membership while a campaign participation is live is therefore refused
 * unless the same transaction revokes the participation too, which is exactly
 * the ordering `repo/Groups.ts` writes.
 *
 * Every content-bearing table carries the same three-column tail:
 *
 *   visibility         — 'dm' by default, so a row nobody thought about is
 *                        invisible to a player rather than accidentally shared
 *   origin             — where the content came from
 *   assistant_turn_id  — set exactly when origin = 'assistant'
 *
 * `apps/server/test/schema.test.ts` fails if a future table omits any of them.
 * (`character` carries the tail too, but its `visibility` is the owner's
 * default for new seats — the campaign-scoped answer lives on
 * `campaign_character`.)
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // An account. The seam needs an actor, and a bearer token needs something to
  // resolve to.
  yield* sql`
    create table account (
      id          uuid primary key default gen_random_uuid(),
      name        text not null,
      token_hash  text not null unique,
      created_at  timestamptz not null default now()
    )
  `;

  yield* sql`
    create table play_group (
      id                uuid primary key default gen_random_uuid(),
      owner_account_id  uuid not null references account (id) on delete restrict,
      name              text not null,
      archived_at       timestamptz,
      created_at        timestamptz not null default now(),
      updated_at        timestamptz not null default now()
    )
  `;
  yield* sql`create index play_group_owner_idx on play_group (owner_account_id)`;

  // Membership of a group. `revoked_at` rather than a delete, so a membership
  // that ends leaves a trace; every predicate tests `revoked_at is null`.
  //
  // `is_active` is the referenced end of every "requires a live member" key.
  // It is `revoked_at is null` — true or false, never null — so revoking a
  // member *changes the key* and any live referencing row refuses the revoke.
  yield* sql`
    create table group_member (
      group_id    uuid not null references play_group (id) on delete cascade,
      account_id  uuid not null references account (id) on delete cascade,
      created_at  timestamptz not null default now(),
      revoked_at  timestamptz,
      is_active   boolean generated always as (revoked_at is null) stored,
      primary key (group_id, account_id),
      constraint group_member_active_key unique (group_id, account_id, is_active)
    )
  `;
  yield* sql`
    create index group_member_account_idx
      on group_member (account_id) where revoked_at is null
  `;

  // The owner is always a live member. Deferred, because the group and its
  // owner's membership are two statements of one transaction.
  yield* sql`
    alter table play_group
      add column owner_is_member boolean generated always as (true) stored
  `;
  yield* sql`
    alter table play_group
      add constraint play_group_owner_is_member
      foreign key (id, owner_account_id, owner_is_member)
      references group_member (group_id, account_id, is_active)
      deferrable initially deferred
  `;

  yield* sql`
    create table campaign (
      id                  uuid primary key default gen_random_uuid(),
      group_id            uuid not null references play_group (id) on delete cascade,
      creator_account_id  uuid not null references account (id) on delete restrict,
      name                text not null,
      party_name          text,
      player_count        integer not null default 0 check (player_count between 0 and 64),
      current_session_id  uuid,
      archived_at         timestamptz,
      visibility          text not null default 'dm'
                            check (visibility in ('dm', 'shared')),
      origin              text not null default 'authored'
                            check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id   uuid,
      created_at          timestamptz not null default now(),
      updated_at          timestamptz not null default now(),
      constraint campaign_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint campaign_group_key unique (id, group_id)
    )
  `;
  yield* sql`create index campaign_group_idx on campaign (group_id)`;
  yield* sql`create index campaign_creator_idx on campaign (creator_account_id)`;

  // The creator must be a live member of the group the campaign is in.
  yield* sql`
    alter table campaign
      add column creator_in_group boolean generated always as (true) stored
  `;
  yield* sql`
    alter table campaign
      add constraint campaign_creator_in_group
      foreign key (group_id, creator_account_id, creator_in_group)
      references group_member (group_id, account_id, is_active)
      deferrable initially deferred
  `;

  // Participation: the explicit subset of group members at this table. It has
  // **no role column** — the creator's row is a participation like any other,
  // and DM-ness is `campaign.creator_account_id`, asked per pair in SQL.
  //
  // `group_id` is denormalised onto the row *and bound by a composite key* to
  // the campaign's own group, so the group_member reference below cannot name
  // a different group than the campaign is in.
  //
  // `in_group` is `nullif(revoked_at is null, false)` — true while live, null
  // once revoked — so a revoked participation stops requiring anything and a
  // live one pins its group membership: revoking the group membership first is
  // refused until the same transaction revokes this row too.
  yield* sql`
    create table campaign_member (
      campaign_id  uuid not null,
      group_id     uuid not null,
      account_id   uuid not null references account (id) on delete cascade,
      created_at   timestamptz not null default now(),
      revoked_at   timestamptz,
      is_active    boolean generated always as (revoked_at is null) stored,
      in_group     boolean generated always as (nullif(revoked_at is null, false)) stored,
      primary key (campaign_id, account_id),
      constraint campaign_member_active_key unique (campaign_id, account_id, is_active),
      constraint campaign_member_campaign_fkey
        foreign key (campaign_id, group_id)
        references campaign (id, group_id) on delete cascade,
      constraint campaign_member_requires_group_member
        foreign key (group_id, account_id, in_group)
        references group_member (group_id, account_id, is_active)
        deferrable initially deferred
    )
  `;
  yield* sql`
    create index campaign_member_account_idx
      on campaign_member (account_id) where revoked_at is null
  `;

  // The creator always participates in their own campaign, and that
  // participation can never be revoked while the campaign exists.
  yield* sql`
    alter table campaign
      add column creator_is_member boolean generated always as (true) stored
  `;
  yield* sql`
    alter table campaign
      add constraint campaign_creator_is_campaign_member
      foreign key (id, creator_account_id, creator_is_member)
      references campaign_member (campaign_id, account_id, is_active)
      deferrable initially deferred
  `;

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
