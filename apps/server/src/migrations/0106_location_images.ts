import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * A place's picture, and where it sits on its parent's.
 *
 * ### `location.pin_x`, `pin_y`
 *
 * Where a place stands on its parent's picture, as fractions of that
 * picture's width and height, so a pin survives an uploaded picture of any
 * size. Both or neither, and only for a place that has a parent: a top-level
 * place has no picture to stand on. The owner sets it, since the parent is
 * the owner's too (`location_parent_fkey`). A re-parent clears it
 * (`Locations.update`): a pin on one map means nothing on another.
 *
 * ### `location_image`
 *
 * The eighth kind of Hob-drawn picture, with every rule of `battle_map_image`
 * (`0057`, `0091`): one per place, ever; the same shapes; the upload source.
 * `(location_id, account_id)` against the place's `(id, account_id)` names its
 * owner as the account billed, so only the owner's draw or upload can be
 * recorded, and the place's delete cascades it. Who may see it is whoever may
 * read the place: its reads mint the URLs. Never cropped (`kinds.ts`), because
 * the pins are fractions of the whole picture.
 *
 * `image_upload.subject` gains `location`.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table location
      add column pin_x double precision,
      add column pin_y double precision,
      add constraint location_pin_shape check (
        (pin_x is null and pin_y is null)
        or (pin_x between 0 and 1 and pin_y between 0 and 1 and parent_id is not null)
      )
  `;

  yield* sql`
    create table location_image (
      id                uuid primary key default gen_random_uuid(),
      location_id       uuid not null,
      account_id        uuid not null,
      state             text not null default 'generating'
                          check (state in ('generating', 'ready', 'failed')),
      failure           text
                          constraint location_image_failure_check check (failure in (
                            'refused', 'provider', 'timeout', 'interrupted', 'storage',
                            'skipped', 'capped', 'removed'
                          )),
      source            text not null default 'drawn' check (source in ('drawn', 'upload')),
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
      constraint location_image_subject_fkey foreign key (location_id, account_id)
        references location (id, account_id) on delete cascade,
      constraint location_image_one_per_location unique (location_id),
      constraint location_image_failure_shape
        check ((state = 'failed') = (failure is not null)),
      constraint location_image_finished_shape
        check ((state = 'generating') = (finished_at is null)),
      constraint location_image_sent_a_prompt
        check (state <> 'ready' or source = 'upload' or (prompt is not null and model is not null)),
      constraint location_image_ready_shape
        check (state <> 'ready' or (content_sha256 is not null and original_type is not null
               and width is not null and height is not null
               and original_bytes is not null and stored_bytes is not null))
    )
  `;
  yield* sql`
    create index location_image_generating on location_image (created_at)
    where state = 'generating'
  `;
  yield* sql`
    create trigger location_image_deleted
    after delete on location_image
    for each row execute function hob_image_enqueue_deletion()
  `;

  yield* sql`alter table image_upload drop constraint image_upload_subject_check`;
  yield* sql`
    alter table image_upload add constraint image_upload_subject_check
      check (subject in ('character', 'npc', 'campaign', 'sharedWorld', 'battleMap', 'location'))
  `;
});
