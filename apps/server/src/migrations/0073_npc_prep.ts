import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * An NPC's DM prep: how they stand toward the party, whether they still
 * stand at all, where the party can find them, and the night the party first
 * met them — the Cast card's badges and lines.
 *
 * ### Its own table, never a column on the NPC
 *
 * `0063_seat_prep.ts`'s reason, one row over. A player reads a shared NPC
 * (`Npcs.playerList`, the table chat in `NpcThreads`), and the NPC agent's
 * prompt is compiled from the row, so an `attitude` or `whereabouts` column on
 * `npc` would put the DM's plan on a row a player's read selects, one
 * forgotten column list away from the wire. On their own table no player read
 * touches them; the creator reads them through `CampaignCreatorActor`
 * (`repo/NpcPrep.ts`).
 *
 * The drawn attitude is not `persona.intent.attitude`: that line is public
 * persona, the NPC's own voice about the party, and a shared NPC speaks it.
 * This one is the DM's label, for a badge and a filter.
 *
 * ### It carries the campaign, and every key names it
 *
 * Unlike a seat's prep this row holds `campaign_id`, because the night the
 * party first met the NPC must be a night of *this* campaign: the key to
 * `session` names the campaign, as `note_link`'s keys do (`0069_note_links.ts`),
 * so a first meeting at another table is unrepresentable rather than checked.
 * The copy cannot disagree with the NPC's because the key to `npc` includes it
 * (`npc_id_campaign_key`, `0051_npc_images.ts`), which also refuses a Library
 * original, whose campaign is null. The reads still walk the NPC for the gate.
 *
 * ### A row only once something was written
 *
 * As a seat's: the creator's list answers every NPC through a left join, so an
 * NPC with nothing written reads as nulls and no backfill is needed. The first
 * write inserts the row. Absent is `null`, never blank. Deleting the night the
 * party met them forgets the meeting and nothing else (`set null` on that one
 * column); deleting the NPC deletes its prep.
 *
 * The nights the NPC was at the table are not stored here: they are the
 * NPC's `session_shared` threads (`0041_npc_session_shared_chat.ts`), read
 * beside this row.
 *
 * **Not campaign content.** No `visibility` or `origin` of its own: who may
 * read it is the campaign's creator, and nothing but the creator's own PATCH
 * writes it — Hob reads it through `getNpc` on the creator's toolkit and has no
 * tool that writes it, and search does not index it. It is in `NOT_CONTENT`
 * (`schema.test.ts`).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table npc_prep (
      npc_id          uuid primary key,
      campaign_id     uuid not null,
      attitude        text
                        constraint npc_prep_attitude_check
                        check (attitude in ('friendly', 'indifferent', 'hostile')),
      status          text
                        constraint npc_prep_status_check
                        check (status in ('alive', 'dead', 'captive', 'unknown')),
      whereabouts     text
                        constraint npc_prep_whereabouts_shape
                        check (btrim(whereabouts) <> '' and char_length(whereabouts) <= 200),
      met_session_id  uuid,
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now(),
      constraint npc_prep_npc_fkey
        foreign key (npc_id, campaign_id) references npc (id, campaign_id) on delete cascade,
      constraint npc_prep_met_session_fkey
        foreign key (met_session_id, campaign_id) references session (id, campaign_id)
        on delete set null (met_session_id)
    )
  `;
  yield* sql`
    create index npc_prep_met_session_id_idx on npc_prep (met_session_id)
      where met_session_id is not null
  `;
});
