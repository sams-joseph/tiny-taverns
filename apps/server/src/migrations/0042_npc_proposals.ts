import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * NPC builder slice 6: bounded proposals.
 *
 * An NPC may suggest a memory, note or beat during a user-initiated creator
 * rehearsal or shared-session conversation. The suggestion is a durable review
 * row, not destination state: acceptance names this row only and materialises
 * through the ordinary repositories. Player-direct private chats deliberately
 * produce no proposals, so creator review never exposes a private transcript.
 *
 * `npc_turn_id` is the model-turn provenance for this table. The older
 * `assistant_turn_id` tail remains Hob's pointer and is kept nullable; the
 * proposal's own source is the NPC turn, so no fake Hob turn is minted.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table npc_proposal (
      id                     uuid primary key default gen_random_uuid(),
      campaign_id            uuid not null references campaign (id) on delete cascade,
      npc_id                 uuid not null references npc (id) on delete cascade,
      thread_id              uuid not null references npc_thread (id) on delete cascade,
      npc_turn_id            uuid not null references npc_turn (id) on delete cascade,
      proposed_by_account_id uuid references account (id) on delete set null,
      kind                   text not null check (kind in ('memory', 'note', 'beat')),
      content                jsonb not null,
      state                  text not null default 'pending'
                               check (state in ('pending', 'accepted', 'rejected')),
      decided_by_account_id  uuid references account (id) on delete set null,
      decided_at             timestamptz,
      rejection_reason       text check (rejection_reason is null or length(rejection_reason) <= 400),
      accepted_memory_id     uuid references npc_memory (id) on delete set null,
      accepted_note_id       uuid references note (id) on delete set null,
      accepted_beat_id       uuid references beat (id) on delete set null,
      visibility             text not null default 'dm'
                               check (visibility in ('dm', 'shared')),
      origin                 text not null default 'authored'
                               check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id      uuid references assistant_turn (id) deferrable initially deferred,
      created_at             timestamptz not null default now(),
      updated_at             timestamptz not null default now(),
      constraint npc_proposal_assistant_provenance
        check (origin = 'assistant' or assistant_turn_id is null),
      constraint npc_proposal_turn_is_source
        unique (npc_turn_id),
      constraint npc_proposal_decision_shape
        check ((state = 'pending') = (decided_at is null and decided_by_account_id is null)),
      constraint npc_proposal_one_destination
        check (num_nonnulls(accepted_memory_id, accepted_note_id, accepted_beat_id) <= 1),
      constraint npc_proposal_destination_matches_state
        check ((state = 'accepted') = (num_nonnulls(accepted_memory_id, accepted_note_id, accepted_beat_id) = 1)),
      constraint npc_proposal_rejection_matches_state
        check ((state = 'rejected') = (rejection_reason is not null))
    )
  `;
  yield* sql`create index npc_proposal_npc_id_idx on npc_proposal (npc_id, state, created_at desc, id desc)`;
  yield* sql`create index npc_proposal_campaign_id_idx on npc_proposal (campaign_id, state, created_at desc, id desc)`;
});
