import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Character portraits: the record of the one picture Hob draws of a character
 * after it is made, and the outbox that deletes its files.
 *
 * ### `character_portrait`
 *
 * **One per character, ever** (`character_portrait_one_per_character`). The
 * captain's decision is a one-time draw with no redraw, so the second attempt
 * to start one is a conflict the insert absorbs, not a second bill.
 *
 * **Containment is the key, not a check.** `(character_id, account_id)`
 * references `character (id, account_id)`, so a portrait can only belong to a
 * character of the same account, and deleting the character cascades it.
 *
 * **It records what happened, including what did not.** `state` is
 * `generating` → `ready` | `failed`, and a failed row says which kind:
 * `refused` (provider moderation), `provider`, `timeout`, `interrupted` (the
 * process died mid-draw; the sweep in `repo/Images.ts` sets it), `storage`,
 * `skipped` (nothing to draw from: no race, class, appearance or background)
 * and `capped` (the daily limit was reached). `prompt` is exactly the text
 * sent, `model` the model it was sent to, and the token counts are the
 * provider's own usage, so cost is measured rather than estimated.
 *
 * **`storage_prefix` is written by the server**, from ids, at insert. It is the
 * one place the key layout lives in the database; the deletion trigger below
 * copies it rather than rebuilding it in SQL.
 *
 * **Not campaign content, so no content tail.** It is listed in
 * `NOT_CONTENT` (`schema.test.ts`): who may see a portrait is exactly who may
 * see its character, through the character's own read, and every row is the
 * image provider's work rather than a Hob turn's, so `visibility` and `origin`
 * would each be a second answer to a question the character already answers.
 *
 * ### `storage_deletion`
 *
 * Prefixes whose objects must go. **A trigger on `character_portrait` writes
 * one for every deleted row**, whatever deleted it — the character's delete
 * cascading, or anything later — in the same transaction, so a committed
 * delete cannot leave files nobody will ever remove. The portrait worker
 * drains it (`HobImages.drainDeletions`), and `ObjectStorage.deletePrefix` is
 * idempotent, so a drain that dies halfway is simply run again.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table character_portrait (
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
      constraint character_portrait_owner_fkey foreign key (character_id, account_id)
        references character (id, account_id) on delete cascade,
      constraint character_portrait_one_per_character unique (character_id),
      constraint character_portrait_failure_shape
        check ((state = 'failed') = (failure is not null)),
      constraint character_portrait_finished_shape
        check ((state = 'generating') = (finished_at is null)),
      constraint character_portrait_sent_a_prompt
        check (state <> 'ready' or (prompt is not null and model is not null)),
      constraint character_portrait_ready_shape
        check (state <> 'ready' or (content_sha256 is not null and original_type is not null
               and width is not null and height is not null
               and original_bytes is not null and stored_bytes is not null))
    )
  `;
  // The daily caps count rows by account and by day.
  yield* sql`create index character_portrait_account_day on character_portrait (account_id, created_at)`;
  yield* sql`create index character_portrait_day on character_portrait (created_at)`;
  // The sweep reads only the rows still drawing.
  yield* sql`
    create index character_portrait_generating on character_portrait (created_at)
    where state = 'generating'
  `;

  yield* sql`
    create table storage_deletion (
      id           uuid primary key default gen_random_uuid(),
      prefix       text not null,
      enqueued_at  timestamptz not null default now(),
      attempts     integer not null default 0,
      last_error   text,
      not_before   timestamptz not null default now()
    )
  `;
  yield* sql`create index storage_deletion_due on storage_deletion (not_before)`;

  yield* sql`
    create function character_portrait_enqueue_deletion() returns trigger
    language plpgsql as $$
    begin
      insert into storage_deletion (prefix) values (old.storage_prefix);
      return old;
    end
    $$
  `;
  yield* sql`
    create trigger character_portrait_deleted
    after delete on character_portrait
    for each row execute function character_portrait_enqueue_deletion()
  `;
});
