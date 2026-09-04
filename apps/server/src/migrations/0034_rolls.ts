import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/** Browser-rolled character-sheet dice, filed under the night that was open. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table session add constraint session_id_campaign_key unique (id, campaign_id)`;

  yield* sql`
    create table character_roll (
      id                 uuid primary key default gen_random_uuid(),
      session_id         uuid not null references session (id) on delete cascade,
      campaign_id        uuid not null references campaign (id) on delete cascade,
      encounter_run_id   uuid,
      account_id         uuid not null references account (id) on delete restrict,
      character_id       uuid references character (id) on delete set null,
      label              text not null check (length(btrim(label)) > 0 and length(label) <= 80),
      notation           text not null check (length(btrim(notation)) > 0 and length(notation) <= 80),
      dice               integer[] not null check (cardinality(dice) between 1 and 40),
      kept               integer[] not null check (cardinality(kept) between 0 and 40),
      modifier           integer not null,
      total              integer not null,
      mode               text not null check (mode in ('normal', 'advantage', 'disadvantage')),
      critical           text check (critical in ('hit', 'miss')),
      request_id         text,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint character_roll_campaign_session_fkey
        foreign key (session_id, campaign_id) references session (id, campaign_id) on delete cascade,
      constraint character_roll_run_fkey
        foreign key (encounter_run_id, session_id) references encounter_run (id, session_id) on delete set null (encounter_run_id),
      constraint character_roll_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint character_roll_assistant_turn_fkey
        foreign key (assistant_turn_id) references assistant_turn (id)
        deferrable initially deferred
    )
  `;
  yield* sql`create index character_roll_session_created_idx on character_roll (session_id, created_at desc, id desc)`;
  yield* sql`create index character_roll_run_created_idx on character_roll (encounter_run_id, created_at desc, id desc) where encounter_run_id is not null`;
  yield* sql`create index character_roll_account_idx on character_roll (account_id)`;
  yield* sql`
    create unique index character_roll_request_key
      on character_roll (session_id, account_id, request_id)
      where request_id is not null
  `;

  yield* sql`alter table session_event drop constraint session_event_kind_check`;
  yield* sql`
    alter table session_event
      add constraint session_event_kind_check check (kind in (
        'run-started', 'run-updated', 'run-ended', 'run-carried', 'run-resumed',
        'combatant-added', 'combatant-updated', 'combatant-removed', 'combatant-damaged',
        'turn-advanced', 'character-updated', 'beat-added', 'roll-made'
      ))
  `;
});
