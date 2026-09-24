import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Battle maps: every encounter's board, and the fifth kind of Hob-drawn image.
 *
 * ### `battle_map` — one per encounter, its own row
 *
 * A map belongs to exactly one encounter, by the captain's decision, and every
 * encounter has one: `Encounters.create` inserts both in one transaction, and
 * this migration gives every encounter made before it a blank board. The board
 * is `board_columns × board_rows` squares of `feet_per_cell` feet, laid over
 * the picture at `cell_px` and an offset in the original picture's pixels; a
 * map with no picture is the same board, so a fight always has one.
 *
 * **Its own row rather than columns on `encounter`**, for three reasons:
 *
 * - **Visibility.** A player reads a shared encounter (`rowReadable`), and the
 *   map is the creator's alone. Columns on `encounter` would put the setting
 *   line and the grid on a row a player's read selects, one forgotten column
 *   list away from the wire. On their own table no player read touches them.
 * - **The picture needs a subject.** `battle_map_image` is keyed to the map, so
 *   it cascades exactly with it, as every kind's image does with its subject.
 * - **Room for reuse.** The map has its own id, and the picture and the grid
 *   hang off it. Sharing one map between encounters later is one forward
 *   migration — an `encounter.map_id` pointer in place of
 *   `battle_map_one_per_encounter` — and no picture is re-keyed.
 *
 * **Bound to its encounter in its campaign** by `(encounter_id, campaign_id)`
 * against `encounter_id_campaign_key`, so a map can never name an encounter of
 * another table, and `unique (encounter_id)` makes it one per encounter. The
 * encounter's delete cascades the map, the map's cascades its picture, and the
 * picture's trigger queues its files.
 *
 * **The grid's shape is the column checks.** `offset < cell_px` is what "within
 * one square" means; the wire's `BattleMapAlignment` states the same rule.
 * Defaults are the drawn picture's own geometry: 1536 × 1024 at 64 px is 24 ×
 * 16 five-foot squares, 120 × 80 feet.
 *
 * **Not campaign content.** It has no `visibility` or `origin` of its own:
 * who may read it is the campaign's creator, through `CampaignCreatorActor`,
 * and where it came from is its encounter's provenance. It is in
 * `NOT_CONTENT` (`schema.test.ts`).
 *
 * **The setting line** is the one thing the picture is drawn from
 * (`BattleMap.ts` in `@taverns/api`). Absent is `null`, never blank, bounded
 * at the wire's `ENCOUNTER_SETTING_MAX`, as `0052_descriptions.ts` does.
 *
 * ### `battle_map_image`
 *
 * Every rule of `npc_image` (`0051`): one per map, ever; the same shapes;
 * `(map_id, campaign_id)` names the map in its campaign and `(campaign_id,
 * account_id)` names that campaign's creator as the account billed. So only
 * the creator's draw can be recorded, and a campaign's delete takes it too.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table battle_map (
      id                uuid primary key default gen_random_uuid(),
      encounter_id      uuid not null,
      campaign_id       uuid not null,
      setting           text
                          constraint battle_map_setting_shape
                          check (btrim(setting) <> '' and char_length(setting) <= 300),
      grid              text not null default 'square' check (grid in ('square', 'none')),
      board_columns     integer not null default 24 check (board_columns between 1 and 200),
      board_rows        integer not null default 16 check (board_rows between 1 and 200),
      feet_per_cell     integer not null default 5 check (feet_per_cell between 1 and 100),
      cell_px           double precision not null default 64
                          check (cell_px >= 8 and cell_px <= 1024),
      offset_x_px       double precision not null default 0,
      offset_y_px       double precision not null default 0,
      created_at        timestamptz not null default now(),
      updated_at        timestamptz not null default now(),
      constraint battle_map_encounter_fkey foreign key (encounter_id, campaign_id)
        references encounter (id, campaign_id) on delete cascade,
      constraint battle_map_one_per_encounter unique (encounter_id),
      constraint battle_map_id_campaign_key unique (id, campaign_id),
      constraint battle_map_offset_within_a_square
        check (offset_x_px >= 0 and offset_x_px < cell_px
               and offset_y_px >= 0 and offset_y_px < cell_px)
    )
  `;
  // The campaign's own cascade reaches maps through `encounter`; this index
  // serves the image key's lookups by campaign.
  yield* sql`create index battle_map_campaign on battle_map (campaign_id)`;

  // Every encounter already made gets its blank board, so "every encounter has
  // one" holds from here on. No setting: inventing one would be a guess.
  yield* sql`
    insert into battle_map (encounter_id, campaign_id)
    select encounter.id, encounter.campaign_id from encounter
  `;

  yield* sql`
    create table battle_map_image (
      id                uuid primary key default gen_random_uuid(),
      map_id            uuid not null,
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
      constraint battle_map_image_subject_fkey foreign key (map_id, campaign_id)
        references battle_map (id, campaign_id) on delete cascade,
      constraint battle_map_image_owner_fkey foreign key (campaign_id, account_id)
        references campaign (id, creator_account_id) on delete cascade,
      constraint battle_map_image_one_per_map unique (map_id),
      constraint battle_map_image_failure_shape
        check ((state = 'failed') = (failure is not null)),
      constraint battle_map_image_finished_shape
        check ((state = 'generating') = (finished_at is null)),
      constraint battle_map_image_sent_a_prompt
        check (state <> 'ready' or (prompt is not null and model is not null)),
      constraint battle_map_image_ready_shape
        check (state <> 'ready' or (content_sha256 is not null and original_type is not null
               and width is not null and height is not null
               and original_bytes is not null and stored_bytes is not null))
    )
  `;
  // No per-day indexes: the daily caps count the `image_spend` ledger
  // (`0055_image_spend.ts`), which `ImageRecords.start` writes for this kind as
  // for every other, and a map's delete leaves its spend where it is.
  //
  // The sweep reads only the rows still drawing.
  yield* sql`
    create index battle_map_image_generating on battle_map_image (created_at)
    where state = 'generating'
  `;
  // The campaign key's cascade looks rows up by campaign.
  yield* sql`
    create index battle_map_image_campaign on battle_map_image (campaign_id, account_id)
  `;

  yield* sql`
    create trigger battle_map_image_deleted
    after delete on battle_map_image
    for each row execute function hob_image_enqueue_deletion()
  `;
});
