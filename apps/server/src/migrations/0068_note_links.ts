import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A note's links: the encounters and the seats it is about, many of each.
 *
 * ### Beside the attachment, not instead of it
 *
 * `note.encounter_id` is the read-aloud's one encounter (`0003_prep_surface.ts`)
 * and the runner, the recap and the player's table all read it. A link says
 * only "this note is about that", so it is its own row and the attachment is
 * untouched: nothing that reads the read-aloud learns a second answer.
 *
 * ### One row per target, every key composite
 *
 * Exactly one of `encounter_id` and `campaign_character_id` is set. Each
 * foreign key names `campaign_id`, and so does the key to the note, so a link
 * from a note in campaign A to an encounter or a seat in campaign B is
 * unrepresentable rather than checked — the `note_encounter_fkey` reason
 * (`docs/internals/data-model.md`). The copy of `campaign_id` cannot disagree
 * with the note's because the note's key includes it; that is what the two
 * `unique (id, campaign_id)` constraints below are for.
 *
 * The per-target uniques are plain, not partial: Postgres treats nulls as
 * distinct, so `(note_id, encounter_id)` constrains only the encounter rows,
 * and adding a link twice is one row.
 *
 * ### Deleting the target loses the link, never the note
 *
 * Every key cascades. The note is the DM's prose and outlives what it was
 * about, as a read-aloud outlives its encounter. A seat is retired, not
 * deleted, when its character leaves, so its links stay with it.
 *
 * ### Not campaign content
 *
 * No `visibility` or `origin` of its own: a link is an edge between two rows
 * that each answer those questions, read only by the note's creator through
 * the creator proof, and written by nobody but the creator — Hob has no tool
 * for it. It is in `NOT_CONTENT` (`schema.test.ts`).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table note add constraint note_id_campaign_key unique (id, campaign_id)`;
  yield* sql`
    alter table campaign_character
      add constraint campaign_character_id_campaign_key unique (id, campaign_id)
  `;

  yield* sql`
    create table note_link (
      id                     uuid primary key default gen_random_uuid(),
      note_id                uuid not null,
      campaign_id            uuid not null,
      encounter_id           uuid,
      campaign_character_id  uuid,
      created_at             timestamptz not null default now(),
      constraint note_link_note_fkey
        foreign key (note_id, campaign_id) references note (id, campaign_id) on delete cascade,
      constraint note_link_encounter_fkey
        foreign key (encounter_id, campaign_id) references encounter (id, campaign_id)
        on delete cascade,
      constraint note_link_seat_fkey
        foreign key (campaign_character_id, campaign_id)
        references campaign_character (id, campaign_id) on delete cascade,
      constraint note_link_one_target
        check (num_nonnulls(encounter_id, campaign_character_id) = 1),
      constraint note_link_encounter_key unique (note_id, encounter_id),
      constraint note_link_seat_key unique (note_id, campaign_character_id)
    )
  `;
  yield* sql`create index note_link_encounter_id_idx on note_link (encounter_id) where encounter_id is not null`;
  yield* sql`
    create index note_link_campaign_character_id_idx on note_link (campaign_character_id)
      where campaign_character_id is not null
  `;
});
