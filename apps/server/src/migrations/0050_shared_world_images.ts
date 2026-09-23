import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Shared World covers: the third kind of Hob-drawn image, beside the character
 * portrait (`0048`) and the campaign cover (`0049_campaign_images.ts`, which
 * says why each kind has a table of its own).
 *
 * ### `shared_world_image`
 *
 * `campaign_image` with a Shared World as its subject, and every rule of it
 * holds for the same reasons: **one per world, ever**, the same
 * `state`/`failure` shapes, the exact prompt and model, the provider's token
 * usage, and a server-written `storage_prefix`.
 *
 * **The subject is a `play_group` row, and the account is its owner.** Only the
 * owner's create — founding a world, or promoting a campaign's hidden context
 * into one — starts a draw, and `play_group_owner_key` below is what lets the
 * composite key name the pair. `owner_account_id` never changes, so the key
 * never has to follow an update. A hidden context is a `play_group` row too, but
 * nothing draws one: the draw starts only once the row is an explicit world.
 *
 * **Not world content, so no content tail.** Who may see a cover is exactly who
 * may read the world, through the world's own reads; it is in `NOT_CONTENT`
 * (`schema.test.ts`) beside the other kinds.
 *
 * **Archiving leaves it alone.** The product never deletes a Shared World, only
 * archives one (and only an empty one), and restores it exactly as it was. The
 * one `play_group` delete there is removes a hidden context after its campaign
 * connects elsewhere, and a hidden context has no cover. Should a world row
 * ever be deleted, the cascade removes this row and the shared trigger queues
 * its files.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table play_group
      add constraint play_group_owner_key unique (id, owner_account_id)
  `;

  yield* sql`
    create table shared_world_image (
      id                uuid primary key default gen_random_uuid(),
      group_id          uuid not null,
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
      constraint shared_world_image_owner_fkey foreign key (group_id, account_id)
        references play_group (id, owner_account_id) on delete cascade,
      constraint shared_world_image_one_per_world unique (group_id),
      constraint shared_world_image_failure_shape
        check ((state = 'failed') = (failure is not null)),
      constraint shared_world_image_finished_shape
        check ((state = 'generating') = (finished_at is null)),
      constraint shared_world_image_sent_a_prompt
        check (state <> 'ready' or (prompt is not null and model is not null)),
      constraint shared_world_image_ready_shape
        check (state <> 'ready' or (content_sha256 is not null and original_type is not null
               and width is not null and height is not null
               and original_bytes is not null and stored_bytes is not null))
    )
  `;
  // The shared daily caps count every kind's rows by account and by day.
  yield* sql`
    create index shared_world_image_account_day on shared_world_image (account_id, created_at)
  `;
  yield* sql`create index shared_world_image_day on shared_world_image (created_at)`;
  // The sweep reads only the rows still drawing.
  yield* sql`
    create index shared_world_image_generating on shared_world_image (created_at)
    where state = 'generating'
  `;

  yield* sql`
    create trigger shared_world_image_deleted
    after delete on shared_world_image
    for each row execute function hob_image_enqueue_deletion()
  `;
});
