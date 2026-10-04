import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Uploaded pictures: a person's own file in place of the one Hob draws.
 *
 * ### An upload is a row in the kind's own table
 *
 * Every image table gains `source`, `'drawn'` or `'upload'`. An uploaded
 * picture is a `ready` row like a drawn one, so the subject's reads, the
 * signer, the routes and the deletion trigger serve it unchanged. It sent no
 * prompt, so `sent_a_prompt` now holds only for a drawn row; it costs nothing,
 * so it writes no `image_spend`.
 *
 * Replacing a picture deletes the old row (its trigger queues the old files)
 * and inserts the new one in the same transaction, so `one per subject` still
 * holds. A draw still running when its row is replaced finds no row to store
 * into, and stores nothing.
 *
 * ### `removed` is a failure, not a delete
 *
 * Taking a picture off sets its row to `failed/removed` and queues its files.
 * Deleting the row instead would read as "never recorded", and an NPC's next
 * edit starts the draw of any NPC with no record: removing would buy a redraw.
 * Uploading again replaces the removed row.
 *
 * ### `image_upload`: a ticket and its file
 *
 * One row per file a person was told where to send. It names the subject the
 * file is for, the type and exact length the URL was signed for, and where it
 * lands (`storage_prefix`, under `uploads/{account}/{upload}`). It is not
 * content and never on the wire past its id; the account's own reads are the
 * only reads.
 *
 * - **`pending` until applied or expired.** Applying marks it `applied`; the
 *   worker's sweep marks a pending one past `expires_at` `expired`. Both queue
 *   the file's prefix in the same transaction: the raw file is never kept,
 *   because the picture's own rows hold everything shown, re-encoded without
 *   the file's metadata.
 * - **Kept after that, as the daily count.** The account's uploads per UTC day
 *   are counted from these rows, so the row outlives its file.
 * - **The subject has no foreign key.** Five kinds of subject, and whether
 *   the account still owns it is asked again, under lock, when the upload is
 *   applied. The account cascades; its trigger queues the prefix again, which
 *   `deletePrefix` takes as a no-op when it is already gone.
 */

const IMAGE_TABLES = [
  "character_portrait",
  "character_banner",
  "campaign_image",
  "shared_world_image",
  "npc_image",
  "npc_banner",
  "battle_map_image",
];

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  for (const table of IMAGE_TABLES) {
    yield* sql`
      alter table ${sql(table)}
        add column source text not null default 'drawn'
          check (source in ('drawn', 'upload'))
    `;
    yield* sql`alter table ${sql(table)} drop constraint ${sql(`${table}_sent_a_prompt`)}`;
    yield* sql`
      alter table ${sql(table)} add constraint ${sql(`${table}_sent_a_prompt`)}
        check (state <> 'ready' or source = 'upload' or (prompt is not null and model is not null))
    `;
    yield* sql`alter table ${sql(table)} drop constraint ${sql(`${table}_failure_check`)}`;
    yield* sql`
      alter table ${sql(table)} add constraint ${sql(`${table}_failure_check`)}
        check (failure in (
          'refused', 'provider', 'timeout', 'interrupted', 'storage', 'skipped', 'capped',
          'removed'
        ))
    `;
  }

  yield* sql`
    create table image_upload (
      id              uuid primary key default gen_random_uuid(),
      account_id      uuid not null references account (id) on delete cascade,
      subject         text not null
                        check (subject in ('character', 'npc', 'campaign', 'sharedWorld', 'battleMap')),
      subject_id      uuid not null,
      content_type    text not null
                        check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
      content_length  integer not null check (content_length > 0),
      storage_prefix  text not null,
      state           text not null default 'pending'
                        check (state in ('pending', 'applied', 'expired')),
      created_at      timestamptz not null default now(),
      expires_at      timestamptz not null,
      finished_at     timestamptz,
      constraint image_upload_finished_shape check ((state = 'pending') = (finished_at is null))
    )
  `;
  yield* sql`create index image_upload_account_day on image_upload (account_id, created_at)`;
  yield* sql`create index image_upload_pending on image_upload (expires_at) where state = 'pending'`;
  yield* sql`
    create trigger image_upload_deleted
    after delete on image_upload
    for each row execute function hob_image_enqueue_deletion()
  `;
});
