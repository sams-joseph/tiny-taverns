import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Level visits: a campaign's live state of one of its creator's levels, which
 * outlives nights and which a fight will borrow (`LevelVisit.ts` in
 * `@taverns/api`). The dungeon is split from the fight: doors, lights,
 * reveals, fog, what the party has seen and where it stands belong to the
 * visit, and a fight on the level keeps its own copy as it always has
 * (`0109_level_fights.ts`).
 *
 * ### `level_visit` — one per campaign and level, for good
 *
 * A visit names its level by the two keys `encounter.level_id` uses (`0109`):
 * `(level_id, level_owner_id)` references `level (id, account_id)`, and
 * `(campaign_id, level_owner_id)` references `campaign (id,
 * creator_account_id)` (`campaign_creator_key`, `0049`), so only the
 * campaign's creator's own level can be named. Deleting the level sets both
 * `null` and leaves the visit: it is a copy, taken when it was opened, in one
 * `insert … select` per table as a fight's start takes one (`levelFights.ts`'
 * `copyLevelParts`). An edit to the level reaches only a visit opened after
 * it.
 *
 * `(campaign_id, level_id)` is unique: returning to a level finds it as the
 * party left it, and the DM's *Reset level* is a real delete of the visit
 * (the maintainer's decision of 2026-10-22). The row carries the level's
 * name, size, scale, ambient and floor with the shape checks
 * `encounter_run_board` has, the DM's fog (`fog_hidden`, `0087`'s spelling),
 * and the party's vision (`party_sees`, `party_seen`, `0110`'s). Those two
 * are never `null`: the open writes them in its own transaction.
 *
 * It is the campaign's, `on delete cascade` with it, and no content: who
 * reads it is the creator, behind the proof. It has no provenance pair,
 * because a visit is a live-play record and Hob does not open one (AGENTS.md,
 * the standing exceptions).
 *
 * `(id, campaign_id)` and `(id, campaign_id, board_columns, board_rows)` are
 * unique for the composite keys below.
 *
 * ### The parts and the tokens
 *
 * `level_visit_wall`, `_prop`, `_light` and `_region` mirror
 * `encounter_run_wall` and its siblings column for column, `revealed`
 * (`0112`) included, keyed `(visit_id, id)` off the visit `on delete
 * cascade`. Nothing resizes a visit's board and the parts were on the level's
 * board when copied, so, as on a fight's copy, they carry no board-bound
 * checks.
 *
 * `level_visit_token` is where each seat's character stands on the visit,
 * one row per seat. Its key to the seat is `(seat_id, campaign_id) →
 * campaign_character (id, campaign_id)` (`0069`), so a seat at another table
 * cannot stand here, and to the visit `(visit_id, campaign_id, board_columns,
 * board_rows)`, so the token's own check keeps it on the board (`0108`'s
 * idiom). Both cascade. A seat retires (`left_at`) rather than being deleted,
 * so its token is deleted by the retiring write (`levelVisits.ts`'
 * `dropSeatTokens`), not by the key.
 *
 * ### `campaign.table_visit_id` — which visit is on the table
 *
 * A pointer, not a flag per visit, so two visits can never both be on the
 * table. It is on the campaign rather than the night because a visit outlives
 * nights. `(table_visit_id, id) → level_visit (id, campaign_id) on delete set
 * null (table_visit_id)`: only this campaign's visit can be named, and
 * deleting the visit takes it off the table.
 *
 * ### `encounter_run.level_visit_id` — the visit a fight borrowed
 *
 * Written when a fight starts from a visit (a later phase). `on delete set
 * null`: rolls and ended fights are deleted only with their night, so a fight
 * keeps its own copy and loses only the pointer when its visit is reset. That
 * the run's night is the visit's campaign's is checked by the writer (run →
 * session → campaign). A partial unique index holds at most one live fight
 * (`ended_at is null`) per visit; deleting a visit a live fight borrows is
 * refused by the repository.
 *
 * ### `encounter_creature_spot` — where a placed creature stands
 *
 * One square per instance of a roster line: `ordinal` is the instance,
 * `0 … count - 1`. The key carries the line's `count` from `encounter_creature
 * (id, count)` `on update cascade` (`encounter_creature_count_key`), so its
 * check holds `ordinal < count`; lowering a line's count deletes the spots
 * past it first (`EncounterCreatures.update`). Bounds against the encounter's
 * level are not a key, since a level can be resized: a spot off the board or
 * on a square no token may stand on is ignored when the fight starts. The
 * repository clears an encounter's spots when its level changes.
 *
 * Every new table is in `NOT_CONTENT` (`schema.test.ts`).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table level_visit (
      id              uuid primary key default gen_random_uuid(),
      campaign_id     uuid not null references campaign (id) on delete cascade,
      level_id        uuid,
      level_owner_id  uuid,
      name            text not null
                        constraint level_visit_name_shape
                        check (btrim(name) <> '' and char_length(name) <= 120),
      board_columns   integer not null
                        constraint level_visit_board_columns_check
                        check (board_columns between 1 and 200),
      board_rows      integer not null
                        constraint level_visit_board_rows_check check (board_rows between 1 and 200),
      feet_per_cell   integer not null
                        constraint level_visit_feet_per_cell_check
                        check (feet_per_cell between 1 and 100),
      ambient         text not null
                        constraint level_visit_ambient_check
                        check (ambient in ('bright', 'dim', 'dark')),
      floor           smallint[] not null,
      fog_hidden      integer[] not null default '{}',
      party_sees      integer[] not null default '{}',
      party_seen      integer[] not null default '{}',
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now(),
      constraint level_visit_id_campaign_key unique (id, campaign_id),
      constraint level_visit_board_key unique (id, campaign_id, board_columns, board_rows),
      constraint level_visit_once unique (campaign_id, level_id),
      constraint level_visit_level_whole check ((level_id is null) = (level_owner_id is null)),
      constraint level_visit_level_fkey foreign key (level_id, level_owner_id)
        references level (id, account_id) on delete set null,
      constraint level_visit_level_owner_fkey foreign key (campaign_id, level_owner_id)
        references campaign (id, creator_account_id),
      constraint level_visit_floor_shape check (
        array_ndims(floor) = 1
        and cardinality(floor) = board_columns * board_rows
        and array_position(floor, null) is null
        and 0 <= all(floor) and 7 > all(floor)
      ),
      constraint level_visit_fog_on_the_board check (
        array_position(fog_hidden, null) is null
        and 0 <= all(fog_hidden) and board_columns * board_rows > all(fog_hidden)
      ),
      constraint level_visit_vision_shape check (
        array_ndims(party_sees) is null or (
          array_ndims(party_sees) = 1
          and array_position(party_sees, null) is null
          and 0 <= all(party_sees) and board_columns * board_rows > all(party_sees)
        )
      ),
      constraint level_visit_seen_shape check (
        array_ndims(party_seen) is null or (
          array_ndims(party_seen) = 1
          and array_position(party_seen, null) is null
          and 0 <= all(party_seen) and board_columns * board_rows > all(party_seen)
        )
      )
    )
  `;
  yield* sql`create index level_visit_level_idx on level_visit (level_id) where level_id is not null`;

  yield* sql`
    create table level_visit_wall (
      visit_id    uuid not null references level_visit (id) on delete cascade,
      id          uuid not null,
      ordinal     integer not null,
      x1          double precision not null,
      y1          double precision not null,
      x2          double precision not null,
      y2          double precision not null,
      kind        text not null
                    constraint level_visit_wall_kind_check
                    check (kind in ('wall', 'door', 'secretDoor')),
      door_state  text
                    constraint level_visit_wall_door_state_check
                    check (door_state in ('open', 'closed', 'locked')),
      low         boolean not null,
      revealed    boolean not null default false,
      primary key (visit_id, id),
      constraint level_visit_wall_door_has_state check ((kind = 'wall') = (door_state is null)),
      constraint level_visit_wall_revealed_secret check (not revealed or kind = 'secretDoor')
    )
  `;

  yield* sql`
    create table level_visit_prop (
      visit_id         uuid not null references level_visit (id) on delete cascade,
      id               uuid not null,
      ordinal          integer not null,
      kind             text not null,
      x                integer not null,
      y                integer not null,
      rotation         smallint not null
                         constraint level_visit_prop_rotation_check check (rotation between 0 and 3),
      blocks_movement  boolean,
      blocks_sight     boolean,
      cover            text
                         constraint level_visit_prop_cover_check
                         check (cover in ('none', 'half', 'threeQuarters', 'total')),
      difficult        boolean,
      dm_only          boolean not null,
      primary key (visit_id, id)
    )
  `;

  yield* sql`
    create table level_visit_light (
      visit_id  uuid not null references level_visit (id) on delete cascade,
      id        uuid not null,
      ordinal   integer not null,
      x         double precision not null,
      y         double precision not null,
      bright    integer not null,
      dim       integer not null,
      tone      text not null,
      flicker   boolean not null,
      lit       boolean not null,
      primary key (visit_id, id)
    )
  `;

  yield* sql`
    create table level_visit_region (
      visit_id  uuid not null references level_visit (id) on delete cascade,
      id        uuid not null,
      ordinal   integer not null,
      kind      text not null,
      squares   integer[] not null,
      secret    boolean not null,
      revealed  boolean not null default false,
      primary key (visit_id, id),
      constraint level_visit_region_revealed_secret check (not revealed or secret)
    )
  `;

  yield* sql`
    create table level_visit_token (
      visit_id       uuid not null,
      campaign_id    uuid not null,
      seat_id        uuid not null,
      board_columns  integer not null,
      board_rows     integer not null,
      board_column   integer not null,
      board_row      integer not null,
      primary key (visit_id, seat_id),
      constraint level_visit_token_visit_fkey
        foreign key (visit_id, campaign_id, board_columns, board_rows)
        references level_visit (id, campaign_id, board_columns, board_rows)
        on delete cascade on update cascade,
      constraint level_visit_token_seat_fkey foreign key (seat_id, campaign_id)
        references campaign_character (id, campaign_id) on delete cascade,
      constraint level_visit_token_on_the_board check (
        board_column >= 0 and board_column < board_columns
        and board_row >= 0 and board_row < board_rows
      )
    )
  `;
  yield* sql`create index level_visit_token_seat_idx on level_visit_token (seat_id)`;

  yield* sql`
    alter table campaign
      add column table_visit_id uuid,
      add constraint campaign_table_visit_fkey foreign key (table_visit_id, id)
        references level_visit (id, campaign_id) on delete set null (table_visit_id)
  `;

  yield* sql`
    alter table encounter_run
      add column level_visit_id uuid references level_visit (id) on delete set null
  `;
  yield* sql`
    create index encounter_run_level_visit_idx on encounter_run (level_visit_id)
      where level_visit_id is not null
  `;
  yield* sql`
    create unique index encounter_run_level_visit_live on encounter_run (level_visit_id)
      where level_visit_id is not null and ended_at is null
  `;

  yield* sql`
    alter table encounter_creature
      add constraint encounter_creature_count_key unique (id, count)
  `;
  yield* sql`
    create table encounter_creature_spot (
      encounter_creature_id  uuid not null,
      count                  integer not null,
      ordinal                integer not null,
      board_column           integer not null,
      board_row              integer not null,
      primary key (encounter_creature_id, ordinal),
      constraint encounter_creature_spot_line_fkey foreign key (encounter_creature_id, count)
        references encounter_creature (id, count) on delete cascade on update cascade,
      constraint encounter_creature_spot_instance check (ordinal >= 0 and ordinal < count),
      constraint encounter_creature_spot_square check (
        board_column between 0 and 199 and board_row between 0 and 199
      )
    )
  `;
});
