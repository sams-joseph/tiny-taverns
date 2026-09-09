import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Hob-assisted NPC awareness curation.
 *
 * Campaign Hob may use its DM-only research tools to propose one fact or memory
 * for a specific campaign NPC, but the proposal lands here as review state only.
 * Approval names this stored row and version, then creates an ordinary
 * `npc_knowledge_fact` or draft `npc_memory`; NPC agents still read only those
 * explicit approved surfaces and never gain Hob's campaign search toolkit.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table npc_knowledge_fact
      drop constraint if exists npc_knowledge_fact_source_kind_check
  `;
  yield* sql`
    alter table npc_knowledge_fact
      add constraint npc_knowledge_fact_source_kind_check
      check (source_kind in ('manual', 'note', 'beat', 'character', 'creature', 'npc', 'group_history', 'recap'))
  `;

  yield* sql`
    alter table npc_memory
      add column source_kind text not null default 'manual',
      add column source_id uuid,
      add column source_label text not null default '' check (length(source_label) <= 200)
  `;
  yield* sql`
    alter table npc_memory
      add constraint npc_memory_source_kind_check
      check (source_kind in ('manual', 'note', 'beat', 'character', 'creature', 'npc', 'group_history', 'recap'))
  `;

  yield* sql`
    create table npc_awareness_candidate (
      id                         uuid primary key default gen_random_uuid(),
      npc_id                     uuid not null references npc (id) on delete cascade,
      kind                       text not null check (kind in ('knowledge', 'memory')),
      body                       text not null check (length(body) between 1 and 4000),
      source_kind                text not null default 'manual'
                                   check (source_kind in ('manual', 'note', 'beat', 'character', 'creature', 'npc', 'group_history', 'recap')),
      source_id                  uuid,
      source_label               text not null default '' check (length(source_label) <= 200),
      source_excerpt             text not null default '' check (length(source_excerpt) <= 2000),
      rationale                  text not null default '' check (length(rationale) <= 2000),
      version                    integer not null default 1,
      state                      text not null default 'pending'
                                   check (state in ('pending', 'approved', 'rejected')),
      decided_by_account_id      uuid references account (id) on delete set null,
      decided_at                 timestamptz,
      rejection_reason           text check (rejection_reason is null or length(rejection_reason) <= 400),
      accepted_knowledge_fact_id uuid references npc_knowledge_fact (id) deferrable initially deferred,
      accepted_memory_id         uuid references npc_memory (id) deferrable initially deferred,
      visibility                 text not null default 'dm'
                                   check (visibility in ('dm', 'shared')),
      origin                     text not null default 'authored'
                                   check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id          uuid references assistant_turn (id) deferrable initially deferred,
      created_at                 timestamptz not null default now(),
      updated_at                 timestamptz not null default now(),
      constraint npc_awareness_candidate_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint npc_awareness_candidate_decision_shape
        check ((state = 'pending') = (decided_at is null and decided_by_account_id is null)),
      constraint npc_awareness_candidate_rejection_shape
        check ((state = 'rejected') = (rejection_reason is not null)),
      constraint npc_awareness_candidate_destination_shape
        check ((state = 'approved') = (num_nonnulls(accepted_knowledge_fact_id, accepted_memory_id) = 1)),
      constraint npc_awareness_candidate_destination_matches_kind
        check (
          (kind = 'knowledge' and accepted_memory_id is null) or
          (kind = 'memory' and accepted_knowledge_fact_id is null)
        )
    )
  `;
  yield* sql`create index npc_awareness_candidate_npc_id_idx on npc_awareness_candidate (npc_id, state, created_at desc, id desc)`;
});
