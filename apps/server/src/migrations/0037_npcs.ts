import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The campaign's cast: `npc`, `npc_thread`, `npc_turn`.
 *
 * Slice 1 of the NPC builder (captain's decisions of 2026-09-04): a structured,
 * bounded persona a creator builds inside a campaign and rehearses with. No
 * Library source, no group share, no player channel, no tools — and the schema
 * is shaped so each of those is a later column rather than a rewrite.
 *
 * ### `npc` is campaign-owned, and `derived_from` is already here
 *
 * `campaign_id not null`: an NPC instance belongs to one table, like a note.
 * There is deliberately **no `account_id`** yet — a Library original is slice 4,
 * and when it lands it is the three-owner idiom `creature` follows (`0015`), not
 * a shortcut through this column. `derived_from` is nullable now so that a
 * campaign snapshot made from a source can point back at it without the table
 * changing shape; it is provenance, never read through, and survives its
 * source's deletion as `null` — the `creature.derived_from` rule.
 *
 * ### Two documents, two columns, on purpose
 *
 * `persona` is the public half — identity, voice, intent, boundaries. Private
 * material — secrets and creator-only instructions — is its own column
 * (`private_material`) so a later audience excludes it **by not selecting it**,
 * which is the secret-boundary decision made structural: a player-facing prompt
 * that never had the column in its `SELECT` cannot leak it however the model is
 * asked. Both are `jsonb` with typed shapes on the wire (`packages/api/src/Npc.ts`).
 *
 * `version` is `character`'s optimistic-concurrency counter (`0014`), bumped by
 * every UPDATE; a caller may send `expectedVersion` back and be refused with a
 * `Conflict`. `archived_at` is the reversible soft delete — transcripts hang
 * off an NPC and are worth keeping.
 *
 * ### The conversation is its own pair of tables
 *
 * Not `assistant_thread`: an NPC conversation is not Hob's, offers no
 * proposals, and carries a `channel`. The check on `channel` names **one**
 * value in this slice — `rehearsal`, the creator talking to their own NPC — so
 * a player or session channel is a migration with a privacy decision behind it
 * rather than a string somebody writes. A thread hangs off its NPC and a turn
 * off its thread with no denormalised `campaign_id`, for the reason `prep_item`
 * and `assistant_turn` have none: one answer to which campaign a row is in.
 *
 * An NPC turn records the prompt template version and a token estimate — the
 * audit the design asks for — and **never the assembled prompt**, which carries
 * private campaign material. `who = 'npc'` rows are `origin = 'assistant'`
 * pointing at nothing: `assistant_turn_id` is Hob's provenance and an NPC turn
 * is not Hob's, so the tail's check is relaxed on this one table to *assistant
 * rows may carry no turn* while still forbidding an authored row that names one.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table npc (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid not null references campaign (id) on delete cascade,
      derived_from       uuid references npc (id) on delete set null,
      name               text not null check (length(name) between 1 and 80),
      role               text not null default '' check (length(role) <= 120),
      persona            jsonb not null default '{}'::jsonb,
      private_material   jsonb not null default '{}'::jsonb,
      version            integer not null default 1,
      archived_at        timestamptz,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid references assistant_turn (id) deferrable initially deferred,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint npc_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`create index npc_campaign_id_idx on npc (campaign_id, archived_at)`;
  yield* sql`create index npc_campaign_name_idx on npc (campaign_id, lower(name))`;

  yield* sql`
    create table npc_thread (
      id                 uuid primary key default gen_random_uuid(),
      npc_id             uuid not null references npc (id) on delete cascade,
      channel            text not null default 'rehearsal'
                           check (channel in ('rehearsal')),
      title              text not null,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid references assistant_turn (id) deferrable initially deferred,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint npc_thread_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`create index npc_thread_npc_id_idx on npc_thread (npc_id, updated_at desc, id desc)`;

  // `template_version` and `prompt_tokens` are set only on the NPC's own turns
  // (`npc_turn_template_on_npc_turns`), which is the audit trail: which
  // versioned template produced this line, and roughly how much it was shown.
  yield* sql`
    create table npc_turn (
      id                 uuid primary key default gen_random_uuid(),
      thread_id          uuid not null references npc_thread (id) on delete cascade,
      who                text not null check (who in ('user', 'npc')),
      body               text not null default '',
      template_version   text,
      prompt_tokens      integer check (prompt_tokens >= 0),
      model              text,
      finish_reason      text,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid references assistant_turn (id) deferrable initially deferred,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint npc_turn_assistant_provenance
        check (origin = 'assistant' or assistant_turn_id is null),
      constraint npc_turn_npc_rows_are_generated
        check ((who = 'npc') = (origin = 'assistant')),
      constraint npc_turn_template_on_npc_turns
        check (who = 'npc' or (template_version is null and prompt_tokens is null))
    )
  `;
  yield* sql`create index npc_turn_thread_id_idx on npc_turn (thread_id, created_at, id)`;
});
