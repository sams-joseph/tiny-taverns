import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Group history: the shared record of what has happened across a group's
 * campaigns — report §3.5, under the captain's group-architecture decisions of
 * 2026-09-01.
 *
 * **Entries are copies, not views.** A recap shared to the group is rendered
 * to prose and stored here; it is never read back through the campaign, so
 * archiving or deleting the campaign later cannot take the group's memory with
 * it — the source pointers go null and the body stands. That is the same
 * snapshot rule `combatant` and `campaign_character` follow, applied to the
 * group's chronicle.
 *
 * **Ordering across campaigns is acceptance order** (`group_seq`, one global
 * sequence per database — a cursor only has to increase, `session_event.seq`'s
 * argument), with `occurred_at` as a display field. Two campaigns playing the
 * same night have no in-fiction order unless a human supplies one; nothing
 * here invents it.
 *
 * **There is no `visibility` column, and that is the design rather than an
 * omission.** An entry exists because somebody admitted it to the group; a
 * `dm`/`shared` axis is a statement about a campaign's players and there is no
 * campaign here for it to be about. Group membership is the whole gate
 * (`groupReadable`), which is why both tables sit in `schema.test.ts`'s
 * `NOT_CONTENT` — deliberately, with provenance still carried, because an
 * entry can be the assistant's the day group Hob proposes one.
 *
 * **Summaries are derived and replaceable; entries are canonical.** At most
 * one summary per group is `accepted` (the partial unique index); rebuilding
 * produces a new `draft`, accepting it supersedes the old one, and
 * `last_group_seq` records how much of the record it has read — so "the
 * summary is stale" is arithmetic over the sequence, not a flag somebody
 * remembers to set.
 *
 * `campaign_id` is provenance, so it deliberately does not share a composite
 * foreign key with `group_id`. A campaign may later leave this Shared World;
 * the accepted copy stays here and keeps naming its source until that source
 * is deleted, when the ordinary `on delete set null` snapshot rule applies.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`create sequence group_history_seq`;

  yield* sql`
    create table group_history_entry (
      id                     uuid primary key default gen_random_uuid(),
      group_id               uuid not null references play_group (id) on delete cascade,
      campaign_id            uuid references campaign (id) on delete set null,
      session_id             uuid references session (id) on delete set null,
      source_kind            text not null check (source_kind in
                               ('recap', 'beat', 'note', 'fight', 'manual', 'character', 'summary_edit')),
      source_id              uuid,
      group_seq              bigint not null default nextval('group_history_seq'),
      occurred_at            timestamptz,
      accepted_at            timestamptz not null default now(),
      title                  text,
      body                   text not null,
      facts                  jsonb not null default '{}'::jsonb,
      origin                 text not null default 'authored'
                               check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id      uuid,
      created_by_account_id  uuid references account (id) on delete set null,
      created_at             timestamptz not null default now(),
      updated_at             timestamptz not null default now(),
      constraint group_history_entry_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`create index group_history_entry_group_idx on group_history_entry (group_id, group_seq)`;
  yield* sql`
    alter table group_history_entry
      add constraint group_history_entry_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;

  yield* sql`
    create table group_history_summary (
      id                       uuid primary key default gen_random_uuid(),
      group_id                 uuid not null references play_group (id) on delete cascade,
      status                   text not null check (status in ('draft', 'accepted', 'superseded')),
      last_group_seq           bigint not null,
      text                     text not null,
      origin                   text not null default 'assistant'
                                 check (origin in ('authored', 'assistant')),
      assistant_turn_id        uuid,
      accepted_by_account_id   uuid references account (id) on delete set null,
      accepted_at              timestamptz,
      created_at               timestamptz not null default now(),
      updated_at               timestamptz not null default now(),
      constraint group_history_summary_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`
    alter table group_history_summary
      add constraint group_history_summary_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;
  yield* sql`
    create unique index group_history_one_current_summary
      on group_history_summary (group_id)
      where status = 'accepted'
  `;
});
