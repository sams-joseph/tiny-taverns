import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A campaign's acts: named runs of nights on the Chronicle ("Act II · The salt
 * road", sessions 7–12).
 *
 * ### An act is where it starts, and nothing else
 *
 * A row is a title and the number of the night it begins at. Its end is the
 * night before the next act's start, and which nights it holds is arithmetic
 * over `session.number`, so there is no end column and no membership row that
 * could disagree with the numbers. `unique (campaign_id, first_session_number)`
 * makes two acts starting at one night unrepresentable.
 *
 * The start is a number, not a key to a `session` row. Nights are renumbered
 * and deleted; an act keyed to a row would move with a renumber or vanish with
 * a delete, and either would take the DM's title with it. A number keeps the
 * grouping stable, and a night that no longer exists leaves the act starting
 * at a gap, which groups exactly as before. `Acts.create` requires the night to
 * exist when the act is made, because "a night starts a new act" is the only
 * way the Chronicle makes one.
 *
 * ### Campaign content, with the whole tail
 *
 * An act's title is the DM's prose about the story and a player sees it only
 * once shared, so it carries `visibility` (default `dm`) and the provenance
 * pair like every content table, with the deferred key to `assistant_turn`
 * that `0010_assistant_conversation.ts` gave the rest. No toolkit writes one
 * yet; the columns are inert until something does, as they were everywhere
 * between `0001` and `0010`.
 *
 * Keyed to the campaign `on delete cascade`, so deleting a campaign takes its
 * acts with it.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table campaign_act (
      id                    uuid primary key default gen_random_uuid(),
      campaign_id           uuid not null references campaign (id) on delete cascade,
      title                 text not null
                              constraint campaign_act_title_shape
                              check (btrim(title) <> '' and char_length(title) <= 120),
      first_session_number  integer not null
                              constraint campaign_act_first_session_number_range
                              check (first_session_number between 1 and 100000),
      visibility            text not null default 'dm'
                              check (visibility in ('dm', 'shared')),
      origin                text not null default 'authored'
                              check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id     uuid,
      created_at            timestamptz not null default now(),
      updated_at            timestamptz not null default now(),
      constraint campaign_act_start_key unique (campaign_id, first_session_number),
      constraint campaign_act_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`
    alter table campaign_act
      add constraint campaign_act_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;
});
