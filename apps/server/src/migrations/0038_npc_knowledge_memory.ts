import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * NPC builder slice 2: explicit knowledge and creator-approved memory.
 *
 * Both tables hang off the campaign NPC instance, not a Library source and not
 * Hob. Knowledge is a copied fact with source provenance; prompt assembly never
 * reads through `source_id`, so edited/deleted/stale sources cannot leak fresh
 * content. Memory has a draft → approved → retired lifecycle; only active
 * approved rows enter context. Retiring/forgetting stamps a column rather than
 * deleting so the creator keeps useful provenance and audit.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table npc_knowledge_fact (
      id                 uuid primary key default gen_random_uuid(),
      npc_id             uuid not null references npc (id) on delete cascade,
      body               text not null check (length(body) between 1 and 4000),
      source_kind        text not null default 'manual'
                           check (source_kind in ('manual', 'note', 'beat', 'group_history', 'recap')),
      source_id          uuid,
      source_label       text not null default '' check (length(source_label) <= 200),
      retired_at         timestamptz,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid references assistant_turn (id) deferrable initially deferred,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint npc_knowledge_fact_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`create index npc_knowledge_fact_npc_id_idx on npc_knowledge_fact (npc_id, retired_at, created_at, id)`;

  yield* sql`
    create table npc_memory (
      id                 uuid primary key default gen_random_uuid(),
      npc_id             uuid not null references npc (id) on delete cascade,
      body               text not null check (length(body) between 1 and 4000),
      status             text not null default 'draft'
                           check (status in ('draft', 'approved', 'retired')),
      source_thread_id   uuid references npc_thread (id) on delete set null,
      source_turn_id     uuid references npc_turn (id) on delete set null,
      approved_at        timestamptz,
      retired_at         timestamptz,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid references assistant_turn (id) deferrable initially deferred,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint npc_memory_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint npc_memory_approved_has_time
        check ((status = 'approved') = (approved_at is not null and retired_at is null)),
      constraint npc_memory_retired_has_time
        check ((status = 'retired') = (retired_at is not null))
    )
  `;
  yield* sql`create index npc_memory_npc_id_idx on npc_memory (npc_id, status, created_at, id)`;
});
