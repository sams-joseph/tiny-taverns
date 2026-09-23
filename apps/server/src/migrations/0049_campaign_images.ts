import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Campaign covers: the second kind of Hob-drawn image, beside the character
 * portrait of `0048_character_portraits.ts`.
 *
 * ### One table per kind, not one polymorphic table
 *
 * `campaign_image` is `character_portrait` with a different subject, and that
 * is deliberate. Each kind's row is bound to its subject by a **non-null
 * composite key** — here `(campaign_id, account_id)` to the campaign and its
 * creator — so "an image of nothing", "an image of two things" and "an image
 * billed to somebody who does not own its subject" are refused by the key
 * itself, and deleting the subject cascades exactly its own image. One table
 * with a nullable column per kind would need an exactly-one check and a
 * `kind` column kept in step with it, and every new kind would widen a table
 * every existing row lives in. With a table per kind, the next kind is one more
 * `create table` beside this one, and the existing rows are never touched.
 *
 * What the kinds share is shared in the server rather than here: one worker,
 * one signer and one set of statements, parameterised by the kind
 * (`apps/server/src/images/kinds.ts`), and **one daily budget** counted across
 * every kind's table (`repo/Images.ts`).
 *
 * ### `campaign_image`
 *
 * Every rule of `character_portrait` holds, for the same reasons: **one per
 * campaign, ever** (a second start is a conflict the insert absorbs, not a
 * second bill), the same `state`/`failure` shapes, the exact prompt and model,
 * the provider's token usage, and a server-written `storage_prefix`.
 *
 * **The account is the campaign's creator.** Only the creator's create starts
 * a draw, and `campaign_creator_key` below is what lets the composite key name
 * the pair; `creator_account_id` never changes, so the key never has to follow
 * an update.
 *
 * **Not campaign content, so no content tail.** Who may see a cover is exactly
 * who may read the campaign, through the campaign's own reads, and every row is
 * the provider's work rather than a Hob turn's. It is in `NOT_CONTENT`
 * (`schema.test.ts`) beside `character_portrait`.
 *
 * **Archiving leaves it alone.** A campaign is never deleted by the product —
 * only archived, and restored exactly as it was — so the cover stays with the
 * shelved campaign and comes back with it. Should a campaign row ever be
 * deleted, the cascade removes this row and the trigger below queues its files.
 *
 * ### The deletion trigger, generalised
 *
 * `hob_image_enqueue_deletion` is `character_portrait_enqueue_deletion` with a
 * name that belongs to every kind: it copies the deleted row's
 * `storage_prefix` into `storage_deletion`. The portrait trigger is moved onto
 * it, and the old function dropped, so every kind's table uses the one body.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table campaign
      add constraint campaign_creator_key unique (id, creator_account_id)
  `;

  yield* sql`
    create table campaign_image (
      id                uuid primary key default gen_random_uuid(),
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
      constraint campaign_image_owner_fkey foreign key (campaign_id, account_id)
        references campaign (id, creator_account_id) on delete cascade,
      constraint campaign_image_one_per_campaign unique (campaign_id),
      constraint campaign_image_failure_shape
        check ((state = 'failed') = (failure is not null)),
      constraint campaign_image_finished_shape
        check ((state = 'generating') = (finished_at is null)),
      constraint campaign_image_sent_a_prompt
        check (state <> 'ready' or (prompt is not null and model is not null)),
      constraint campaign_image_ready_shape
        check (state <> 'ready' or (content_sha256 is not null and original_type is not null
               and width is not null and height is not null
               and original_bytes is not null and stored_bytes is not null))
    )
  `;
  // The shared daily caps count every kind's rows by account and by day.
  yield* sql`create index campaign_image_account_day on campaign_image (account_id, created_at)`;
  yield* sql`create index campaign_image_day on campaign_image (created_at)`;
  // The sweep reads only the rows still drawing.
  yield* sql`
    create index campaign_image_generating on campaign_image (created_at)
    where state = 'generating'
  `;

  yield* sql`
    create function hob_image_enqueue_deletion() returns trigger
    language plpgsql as $$
    begin
      insert into storage_deletion (prefix) values (old.storage_prefix);
      return old;
    end
    $$
  `;
  yield* sql`drop trigger character_portrait_deleted on character_portrait`;
  yield* sql`drop function character_portrait_enqueue_deletion()`;
  yield* sql`
    create trigger character_portrait_deleted
    after delete on character_portrait
    for each row execute function hob_image_enqueue_deletion()
  `;
  yield* sql`
    create trigger campaign_image_deleted
    after delete on campaign_image
    for each row execute function hob_image_enqueue_deletion()
  `;
});
