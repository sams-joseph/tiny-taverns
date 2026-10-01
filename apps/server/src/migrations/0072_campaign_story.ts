import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * A campaign's story: the story so far, and the *Previously* read to open the
 * next night.
 *
 * ### One row per campaign, replaced rather than versioned
 *
 * The Shared World's Story So Far keeps its superseded summaries
 * (`0030_group_history.ts`) because a world's members replace it by turns. A
 * campaign's story has one author, its creator, and what a replacement
 * replaces is already on the Hob turn that drafted it, so the table holds the
 * current story and nothing else: `unique (campaign_id)`, written by an
 * upsert, removed by a delete.
 *
 * ### Staleness is arithmetic
 *
 * `after_session_number` is the newest ended night the story was written
 * after — zero before any night has ended. "Update needed" is a newer ended
 * night than that, which is `lastWorldSeq`'s rule one table over: a number the
 * server stamps when it writes, never a flag somebody remembers to set, and
 * never a value a client or a model supplies.
 *
 * ### Campaign content, with the whole tail
 *
 * `visibility` defaults to `dm`, so a story is the creator's until they share
 * it; a player reads it only through its own narrow schema, and only when it
 * is shared. `origin` is `assistant` when the story is a Hob draft the creator
 * accepted (`repo/Proposals.ts`), with the turn it came from.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table campaign_story (
      id                    uuid primary key default gen_random_uuid(),
      campaign_id           uuid not null references campaign (id) on delete cascade,
      text                  text not null check (length(text) between 1 and 8000),
      previously            text check (length(previously) between 1 and 4000),
      after_session_number  integer not null check (after_session_number >= 0),
      visibility            text not null default 'dm' check (visibility in ('dm', 'shared')),
      origin                text not null default 'authored'
                              check (origin in ('authored', 'assistant')),
      assistant_turn_id     uuid,
      created_at            timestamptz not null default now(),
      updated_at            timestamptz not null default now(),
      constraint campaign_story_one_per_campaign unique (campaign_id),
      constraint campaign_story_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`
    alter table campaign_story
      add constraint campaign_story_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;
});
