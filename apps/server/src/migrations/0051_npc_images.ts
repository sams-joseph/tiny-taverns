import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * NPC portraits: the fourth kind of Hob-drawn image, beside the character
 * portrait (`0048`), the campaign cover (`0049`) and the Shared World cover
 * (`0050`), and one more table for the reasons `0049_campaign_images.ts` gives
 * for a table per kind.
 *
 * ### `npc_image`
 *
 * Every rule of `campaign_image` holds: **one per NPC, ever**, the same
 * `state`/`failure` shapes, the exact prompt and model, the provider's token
 * usage and a server-written `storage_prefix`.
 *
 * **Bound to a campaign NPC and its campaign's creator by two composite keys.**
 * `(npc_id, campaign_id)` names the NPC *in* its campaign, and
 * `(campaign_id, account_id)` names that campaign's creator as the account the
 * draw is billed to. So the row refuses an image of nothing, an image of an NPC
 * filed under another campaign, and an image billed to anybody but the creator.
 * A Library original has no campaign (`campaign_id is null`), so the first key
 * cannot name one: **a Library source is never drawn**, and a copy of it into a
 * cast is drawn as it lands. `npc_id_campaign_key` below is what lets the key
 * name the pair; an NPC never changes campaign, so the key never has to follow
 * an update.
 *
 * **Not campaign content, so no content tail.** Who may see a portrait is who
 * may read the NPC, through the NPC's own reads, and every row is the
 * provider's work rather than a Hob turn's. It is in `NOT_CONTENT`
 * (`schema.test.ts`) beside the other kinds.
 *
 * **Archiving leaves it alone.** The product archives a campaign NPC rather
 * than deleting it, and restoring brings the portrait back as it was. Should an
 * NPC row be deleted — its campaign deleted, or a delete the product adds
 * later — the cascade removes this row and the shared trigger queues its files.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table npc add constraint npc_id_campaign_key unique (id, campaign_id)`;

  yield* sql`
    create table npc_image (
      id                uuid primary key default gen_random_uuid(),
      npc_id            uuid not null,
      campaign_id       uuid not null,
      account_id        uuid not null,
      state             text not null default 'generating'
                          check (state in ('generating', 'ready', 'failed')),
      failure           text check (failure in (
                          'refused', 'provider', 'timeout', 'interrupted', 'storage',
                          'skipped', 'capped'
                        )),
      prompt            text,
      model             text,
      input_tokens      integer check (input_tokens is null or input_tokens >= 0),
      output_tokens     integer check (output_tokens is null or output_tokens >= 0),
      storage_prefix    text not null,
      original_type     text,
      content_sha256    bytea,
      width             integer,
      height            integer,
      original_bytes    integer,
      stored_bytes      integer,
      created_at        timestamptz not null default now(),
      updated_at        timestamptz not null default now(),
      finished_at       timestamptz,
      constraint npc_image_subject_fkey foreign key (npc_id, campaign_id)
        references npc (id, campaign_id) on delete cascade,
      constraint npc_image_owner_fkey foreign key (campaign_id, account_id)
        references campaign (id, creator_account_id) on delete cascade,
      constraint npc_image_one_per_npc unique (npc_id),
      constraint npc_image_failure_shape
        check ((state = 'failed') = (failure is not null)),
      constraint npc_image_finished_shape
        check ((state = 'generating') = (finished_at is null)),
      constraint npc_image_sent_a_prompt
        check (state <> 'ready' or (prompt is not null and model is not null)),
      constraint npc_image_ready_shape
        check (state <> 'ready' or (content_sha256 is not null and original_type is not null
               and width is not null and height is not null
               and original_bytes is not null and stored_bytes is not null))
    )
  `;
  // The shared daily caps count every kind's rows by account and by day.
  yield* sql`create index npc_image_account_day on npc_image (account_id, created_at)`;
  yield* sql`create index npc_image_day on npc_image (created_at)`;
  // The sweep reads only the rows still drawing.
  yield* sql`
    create index npc_image_generating on npc_image (created_at)
    where state = 'generating'
  `;
  // The campaign key's cascade looks rows up by campaign.
  yield* sql`create index npc_image_campaign on npc_image (campaign_id, account_id)`;

  yield* sql`
    create trigger npc_image_deleted
    after delete on npc_image
    for each row execute function hob_image_enqueue_deletion()
  `;
});
