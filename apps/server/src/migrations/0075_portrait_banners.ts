import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Portrait banners: the wide picture of a character or a campaign NPC that a
 * card's portrait band shows, beside the square portrait its plates show.
 *
 * A square cut into a band some two and a half times wider than tall kept a
 * third of the picture, so a band showed a forehead. A banner is **its own
 * draw**, from the same prompt builder framed for a wide picture
 * (`HOUSE_BANNER_STYLE`), not a crop of the square, so it is its own record:
 * two more kinds (`characterBanner`, `npcBanner` in `images/kinds.ts`), and a
 * table each, for the reasons `0049_campaign_images.ts` gives for a table per
 * kind.
 *
 * ### `character_banner` and `npc_banner`
 *
 * Column for column and check for check `character_portrait` (`0048`) and
 * `npc_image` (`0051`): **one per subject, ever**, the same `state`/`failure`
 * shapes, the exact prompt and model, and a server-written `storage_prefix`.
 * `character_banner` is bound to its character and its owner by
 * `(character_id, account_id)`; `npc_banner` to its NPC in its campaign by
 * `(npc_id, campaign_id)` and to that campaign's creator by
 * `(campaign_id, account_id)`, so a Library original, which has no campaign,
 * can never have one. Each subject's delete cascades exactly its own banner,
 * and the row's delete queues its files through the one
 * `hob_image_enqueue_deletion()`.
 *
 * **No per-day indexes.** The daily caps count `image_spend` (`0055`), not
 * image rows, so these tables carry only the sweep's partial index and the
 * cascade's.
 *
 * **Nothing is backfilled.** A subject drawn before banners existed keeps its
 * square alone, and a band shows the square as it did. The banner is started
 * only beside the square's own start (`HobImages`), so an old NPC's next edit
 * does not draw one either.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table character_banner (
      id                uuid primary key default gen_random_uuid(),
      character_id      uuid not null,
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
      constraint character_banner_owner_fkey foreign key (character_id, account_id)
        references character (id, account_id) on delete cascade,
      constraint character_banner_one_per_character unique (character_id),
      constraint character_banner_failure_shape
        check ((state = 'failed') = (failure is not null)),
      constraint character_banner_finished_shape
        check ((state = 'generating') = (finished_at is null)),
      constraint character_banner_sent_a_prompt
        check (state <> 'ready' or (prompt is not null and model is not null)),
      constraint character_banner_ready_shape
        check (state <> 'ready' or (content_sha256 is not null and original_type is not null
               and width is not null and height is not null
               and original_bytes is not null and stored_bytes is not null))
    )
  `;
  yield* sql`
    create index character_banner_generating on character_banner (created_at)
    where state = 'generating'
  `;
  yield* sql`
    create trigger character_banner_deleted
    after delete on character_banner
    for each row execute function hob_image_enqueue_deletion()
  `;

  yield* sql`
    create table npc_banner (
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
      constraint npc_banner_subject_fkey foreign key (npc_id, campaign_id)
        references npc (id, campaign_id) on delete cascade,
      constraint npc_banner_owner_fkey foreign key (campaign_id, account_id)
        references campaign (id, creator_account_id) on delete cascade,
      constraint npc_banner_one_per_npc unique (npc_id),
      constraint npc_banner_failure_shape
        check ((state = 'failed') = (failure is not null)),
      constraint npc_banner_finished_shape
        check ((state = 'generating') = (finished_at is null)),
      constraint npc_banner_sent_a_prompt
        check (state <> 'ready' or (prompt is not null and model is not null)),
      constraint npc_banner_ready_shape
        check (state <> 'ready' or (content_sha256 is not null and original_type is not null
               and width is not null and height is not null
               and original_bytes is not null and stored_bytes is not null))
    )
  `;
  yield* sql`
    create index npc_banner_generating on npc_banner (created_at)
    where state = 'generating'
  `;
  // The campaign key's cascade looks rows up by campaign.
  yield* sql`create index npc_banner_campaign on npc_banner (campaign_id, account_id)`;
  yield* sql`
    create trigger npc_banner_deleted
    after delete on npc_banner
    for each row execute function hob_image_enqueue_deletion()
  `;
});
