import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * An NPC's links, and a note's link to an NPC: the Cast's *Tied to* and
 * *Shows up in*.
 *
 * ### `npc_link`: the `note_link` shape, from an NPC
 *
 * An NPC is tied to the seats whose characters it is bound up with and shows
 * up in the encounters the DM says it does, many of each. Exactly one of
 * `encounter_id` and `campaign_character_id` is set, and every key names
 * `campaign_id`, so a link from an NPC in campaign A to an encounter or a seat
 * in campaign B is unrepresentable rather than checked
 * (`0069_note_links.ts`, which this follows rule for rule). The key to the NPC
 * is `npc_id_campaign_key` (`0051_npc_images.ts`); a Library original has no
 * campaign, so it cannot be linked at all.
 *
 * The per-target uniques are plain, not partial: Postgres treats nulls as
 * distinct, so `(npc_id, encounter_id)` constrains only the encounter rows,
 * and adding a link twice is one row.
 *
 * ### Its own table, not a column on `npc`
 *
 * Ties and appearances are the DM's prep, never a player's. A player reads a
 * shared NPC through its own select list (`repo/Npcs.ts`, `PlayerNpc`), and a
 * row in a table that no player read joins cannot reach one by a forgotten
 * column — the `0063_seat_prep.ts` reasoning.
 *
 * ### `note_link.npc_id`: which notes an NPC shows up in
 *
 * A note says what it is about; an NPC being one of those things is a third
 * kind of note link, not a second table pointing the other way, so a note's
 * *Linked* chips and an NPC's notes are one set of rows. The one-target check
 * widens to three.
 *
 * ### Deleting the target loses the link
 *
 * Every key cascades. The product archives an NPC rather than deleting it, and
 * archiving leaves its links alone, so restoring brings them back. A seat is
 * retired, not deleted, when its character leaves, so its links stay with it.
 *
 * ### Not campaign content
 *
 * No `visibility` or `origin` of its own: a link is an edge between two rows
 * that each answer those questions, read and written by nobody but the
 * campaign's creator through the creator proof — Hob has no tool for it. It is
 * in `NOT_CONTENT` (`schema.test.ts`).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table npc_link (
      id                     uuid primary key default gen_random_uuid(),
      npc_id                 uuid not null,
      campaign_id            uuid not null,
      encounter_id           uuid,
      campaign_character_id  uuid,
      created_at             timestamptz not null default now(),
      constraint npc_link_npc_fkey
        foreign key (npc_id, campaign_id) references npc (id, campaign_id) on delete cascade,
      constraint npc_link_encounter_fkey
        foreign key (encounter_id, campaign_id) references encounter (id, campaign_id)
        on delete cascade,
      constraint npc_link_seat_fkey
        foreign key (campaign_character_id, campaign_id)
        references campaign_character (id, campaign_id) on delete cascade,
      constraint npc_link_one_target
        check (num_nonnulls(encounter_id, campaign_character_id) = 1),
      constraint npc_link_encounter_key unique (npc_id, encounter_id),
      constraint npc_link_seat_key unique (npc_id, campaign_character_id)
    )
  `;
  yield* sql`create index npc_link_encounter_id_idx on npc_link (encounter_id) where encounter_id is not null`;
  yield* sql`
    create index npc_link_campaign_character_id_idx on npc_link (campaign_character_id)
      where campaign_character_id is not null
  `;

  yield* sql`
    alter table note_link
      add column npc_id uuid,
      add constraint note_link_npc_fkey
        foreign key (npc_id, campaign_id) references npc (id, campaign_id) on delete cascade,
      drop constraint note_link_one_target,
      add constraint note_link_one_target
        check (num_nonnulls(encounter_id, campaign_character_id, npc_id) = 1),
      add constraint note_link_npc_key unique (note_id, npc_id)
  `;
  yield* sql`create index note_link_npc_id_idx on note_link (npc_id) where npc_id is not null`;
});
