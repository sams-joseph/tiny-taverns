import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The conversation with Hob, and the row every `assistant_turn_id` has been
 * waiting nine migrations to point at.
 *
 * Two gaps closed by one migration, because they were always one thing.
 * `0001_init.ts` gave every content-bearing table `origin` and
 * `assistant_turn_id` with a check tying them together, and said out loud that
 * they were inert until the assistant shipped. They were also *unenforceable*:
 * the column had no referent, so a row claiming `origin = 'assistant'` could
 * name any uuid at all and nothing would notice. Persisting the conversation is
 * what turns that check from a shape into a fact.
 *
 * ### Two tables, both content-bearing
 *
 * A thread is campaign-scoped and a turn hangs off a thread, so the visibility
 * seam applies with **no new predicate**: `rowReadable`/`rowWritable` for the
 * thread, the existing `NestedTable` machinery for the turn — the same shape as
 * `prep_item` under `session`. Both carry the standard visibility/provenance
 * tail, because a DM's conversation is campaign content: it holds their prose
 * and Hob's, and `apps/server/test/schema.test.ts` is right to insist.
 *
 * A hob turn is `origin = 'assistant'` with `assistant_turn_id = id` — the turn
 * that produced this text is this turn. That reads as a curiosity and is the
 * honest answer: `who` says who spoke, `origin` says where the content came
 * from, and a hob turn would otherwise have to claim it was `authored`, which is
 * a lie in the one table whose entire purpose is provenance.
 *
 * ### The proposal lives here, not in the campaign
 *
 * `proposal` is the whole of what Hob offered, as `jsonb`, on the turn that
 * offered it. **A proposal is not a row in the campaign** — that is the
 * captain's decision (`decisions/assistant-generation.md`, option C) and the
 * reason generation was permitted at all. `accepted_at` is the moment a human
 * said yes; until it is set there is no note, no beat and no encounter anywhere,
 * and an abandoned proposal decays into a line of transcript.
 *
 * Storing it server-side is what makes the provenance *trustworthy* rather than
 * decorative. If accept took the content as a payload, any client could post
 * arbitrary prose and have it recorded as the assistant's — so the accept
 * endpoint takes no content at all and materialises what this column holds.
 *
 * ### The foreign keys, and why they are deferrable
 *
 * Every content table's `assistant_turn_id` becomes a real reference. Two
 * consequences worth knowing:
 *
 * - **An accepted row pins the turn that produced it.** The action is the
 *   default `no action`, so a turn cannot be deleted out from under a note that
 *   points at it, and deleting a *thread* containing such a turn is refused
 *   rather than cascading provenance away. There is no thread-delete endpoint,
 *   so today that is a guarantee rather than an error path.
 * - **`deferrable initially deferred`**, for exactly the reason
 *   `encounter_creature.creature_id` is (`0004_bestiary.ts`): `delete from
 *   campaign` cascades into `note` and into `assistant_turn` in one statement,
 *   and an immediate `no action` fires before the referencing rows are gone.
 *   Deferring moves the check to the end of the transaction — which, under
 *   autocommit, is still the end of that statement, so a lone
 *   `delete from assistant_turn` is still refused on the spot.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // `title` is the first question, shortened — see `HobThread`. Not nullable:
  // a thread with no name is one nothing can list.
  yield* sql`
    create table assistant_thread (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid not null references campaign (id) on delete cascade,
      title              text not null,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint assistant_thread_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;
  yield* sql`create index assistant_thread_campaign_id_idx on assistant_thread (campaign_id)`;

  // No `campaign_id`, like `prep_item` and `beat`: the read predicate walks
  // turn → thread → campaign, so there is one answer to which campaign a turn
  // is in rather than a denormalised copy that can disagree with its parent.
  //
  // `body` is `text not null` and may be empty — a turn Hob produced nothing but
  // a proposal for is a real turn. `proposal` and `accepted_at` are the two
  // columns this whole feature is about.
  yield* sql`
    create table assistant_turn (
      id                 uuid primary key default gen_random_uuid(),
      thread_id          uuid not null references assistant_thread (id) on delete cascade,
      who                text not null check (who in ('user', 'hob')),
      body               text not null default '',
      proposal           jsonb,
      accepted_at        timestamptz,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint assistant_turn_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      -- Only Hob proposes, and nothing is accepted that was never proposed.
      -- Both are unrepresentable rather than merely unlikely.
      constraint assistant_turn_only_hob_proposes
        check (proposal is null or who = 'hob'),
      constraint assistant_turn_accepted_was_proposed
        check (accepted_at is null or proposal is not null)
    )
  `;
  yield* sql`
    create index assistant_turn_thread_id_idx
      on assistant_turn (thread_id, created_at, id)
  `;

  // The pointer, made real. Every table `schema.test.ts` calls content-bearing,
  // including the two above — a hob turn points at itself, and an accepted
  // note points at the turn that wrote it.
  //
  // Written as a loop over a literal list rather than as fourteen copies, which
  // is the one place this file departs from "the DDL is written out literally"
  // (`0001_init.ts`): the statements differ only in the table name, so the list
  // *is* the record of what ran, and fourteen hand-copied blocks is fourteen
  // chances to paste the wrong constraint name into the right table.
  const contentTables = [
    "assistant_thread",
    "assistant_turn",
    "beat",
    "campaign",
    "character",
    "combatant",
    "creature",
    "encounter",
    "encounter_creature",
    "encounter_run",
    "note",
    "prep_item",
    "session",
    "session_event",
  ];
  for (const table of contentTables) {
    yield* sql`
      alter table ${sql(table)}
        add constraint ${sql(`${table}_assistant_turn_fkey`)}
        foreign key (assistant_turn_id) references assistant_turn (id)
        deferrable initially deferred
    `;
  }
});
