import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A seat's DM prep: the creator's own hook and secret for the character
 * sitting in it — the party card's two notes.
 *
 * ### Its own table, never a column on the seat or the character
 *
 * `0060_encounter_prep.ts`'s reason, one row over. A player reads their own
 * seat and every shared one (`Party.list`), each with the whole character, so
 * a `hook` or `secret` column on `campaign_character` or `character` would put
 * the DM's plan for that character on a row a player's read selects, one
 * forgotten column list away from the wire. On their own table no player read
 * touches them; the creator reads them through `CampaignCreatorActor`.
 *
 * ### It hangs off the seat, and carries no campaign of its own
 *
 * The seat already answers which campaign this is, and the reads walk it
 * (`repo/SeatPrep.ts`), so the gate is the seat's creator predicate and a
 * retired seat's prep is unreachable exactly as the seat is. A copy of
 * `campaign_id` here would be a second answer that could disagree — the
 * `NestedTable` reason in `repo/visibility.ts`.
 *
 * ### A row only once something was written
 *
 * Unlike an encounter's, a seat's prep is not inserted with it: the creator's
 * list answers every live seat through a left join, so a seat with nothing
 * written reads as two `null`s and no backfill is needed. The first write
 * inserts the row. Absent is `null`, never blank, as `0052_descriptions.ts`
 * does.
 *
 * **Not campaign content.** No `visibility` or `origin` of its own: who may
 * read it is the campaign's creator, and nothing but the creator's own PATCH
 * writes it — Hob has no tool for it and search does not index it. It is in
 * `NOT_CONTENT` (`schema.test.ts`).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table campaign_character_prep (
      campaign_character_id uuid primary key
                              references campaign_character (id) on delete cascade,
      hook                  text
                              constraint campaign_character_prep_hook_shape
                              check (btrim(hook) <> '' and char_length(hook) <= 300),
      secret                text
                              constraint campaign_character_prep_secret_shape
                              check (btrim(secret) <> '' and char_length(secret) <= 300),
      created_at            timestamptz not null default now(),
      updated_at            timestamptz not null default now()
    )
  `;
});
