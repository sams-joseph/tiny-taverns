import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Hob direct resource writes, gated by a live fight.
 *
 * The switch lives on `encounter_run` because the capability exists only while
 * that fight is on the table. The audit row records the exact resource counter
 * before and after Hob moved it, linked to the assistant turn that made the tool
 * call, so the DM has a visible inverse without making the assistant a content
 * creator.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table encounter_run
      add column allow_hob_direct_writes boolean not null default false
  `;

  yield* sql`
    create table hob_direct_resource_update (
      id                 uuid primary key default gen_random_uuid(),
      session_id         uuid not null references session (id) on delete cascade,
      encounter_run_id   uuid not null references encounter_run (id) on delete cascade,
      combatant_id       uuid references combatant (id) on delete set null,
      character_id       uuid references character (id) on delete set null,
      character_name     text not null,
      resource_id        text not null,
      resource_name      text not null,
      resource_max       integer not null check (resource_max between 0 and 10000),
      amount             integer not null check (amount between 1 and 10000),
      before_used        integer not null check (before_used between 0 and 10000),
      after_used         integer not null check (after_used between 0 and 10000),
      assistant_turn_id  uuid not null,
      tool_call_id       text,
      undone_at          timestamptz,
      undone_by_account_id uuid references account (id) on delete set null,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint hob_direct_resource_update_run_session_fkey
        foreign key (encounter_run_id, session_id) references encounter_run (id, session_id)
        on delete cascade,
      constraint hob_direct_resource_update_turn_fkey
        foreign key (assistant_turn_id) references assistant_turn (id)
        deferrable initially deferred,
      constraint hob_direct_resource_update_used_order
        check (after_used >= before_used)
    )
  `;
  yield* sql`create index hob_direct_resource_update_run_created_idx on hob_direct_resource_update (encounter_run_id, created_at desc, id desc)`;
  yield* sql`create index hob_direct_resource_update_character_idx on hob_direct_resource_update (character_id) where character_id is not null`;
  yield* sql`
    create unique index hob_direct_resource_update_tool_call_key
      on hob_direct_resource_update (assistant_turn_id, tool_call_id)
      where tool_call_id is not null
  `;

  yield* sql`alter table session_event drop constraint session_event_kind_check`;
  yield* sql`
    alter table session_event
      add constraint session_event_kind_check check (kind in (
        'run-started', 'run-updated', 'run-ended', 'run-carried', 'run-resumed',
        'combatant-added', 'combatant-updated', 'combatant-removed',
        'combatant-damaged', 'turn-advanced',
        'beat-added', 'character-updated', 'roll-made',
        'hob-resource-spent', 'hob-resource-undone'
      ))
  `;
});
