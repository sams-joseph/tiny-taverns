import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Fights on levels: an encounter names a level, and a fight on it keeps its
 * own copy (`LevelFight.ts` in `@taverns/api`).
 *
 * ### `encounter.level_id` — the campaign creator's own level, or none
 *
 * A level is account-owned (`0108_levels.ts`), and an encounter may name only
 * one its campaign's creator owns. That is two keys, not a check the writer
 * remembers: `(level_id, level_owner_id)` references `level (id,
 * account_id)`, and `(campaign_id, level_owner_id)` references `campaign (id,
 * creator_account_id)` (`campaign_creator_key`, `0049`). Another account's
 * level cannot be named by any statement, and `Encounters` answers a payload
 * naming one as `NotFound` before it writes, since saying the level exists is
 * itself a disclosure.
 *
 * Deleting the level sets both columns `null` (`on delete set null`): the
 * encounter goes back to its picture board. A fight already started keeps its
 * copy. The pointer grants nothing: nobody reads a level through it, and a
 * fight copies the level beneath the creator's own proof.
 *
 * ### The snapshot on `encounter_run_board`
 *
 * `start` copies the level, and `resume` the predecessor's copy, in one
 * `insert … select` per table inside the fight's transaction, the way `0058`
 * copies the grid. Editing or deleting the level never moves a fight.
 *
 * - The board row takes the level's size and scale, and `ambient` and
 *   `floor`, which are `null` together on a picture board. A level board has
 *   no picture (`map_id` is `null`), and its alignment is the plain grid
 *   (`64` pixels a square, no offset): the board is drawn on itself, and every
 *   tool that measures in the plane's pixels (tokens, fog, areas, effects)
 *   lands on the same squares the level is drawn on.
 * - `encounter_run_wall`, `_prop`, `_light` and `_region` copy the level's
 *   parts with their ids and order. Two columns are live: a wall's
 *   `door_state` (the DM opens, closes and locks doors) with `revealed` (a
 *   secret door the DM has shown the table), and a light's `lit`. Nothing
 *   resizes a fight's board, and the parts were on the level's board when
 *   copied, so they carry no board-bound checks of their own.
 *
 * Each part table hangs off the board by `run_id` `on delete cascade`, so the
 * run's delete takes them. None is selected by any player read: a player's
 * board names its columns (`PlayerTable.boardOf`), and a later phase narrows
 * the party's view of a level in SQL.
 *
 * ### `board-door-updated` and `board-light-updated`
 *
 * The DM's door and light writes append them, always `dm`: the player's table
 * draws nothing of a level yet, and a shared line about a secret door would
 * say there is one. The doorbell rings either way, so the DM's other tabs
 * re-read.
 *
 * All four part tables are in `NOT_CONTENT` (`schema.test.ts`).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table encounter
      add column level_id uuid,
      add column level_owner_id uuid,
      add constraint encounter_level_whole check ((level_id is null) = (level_owner_id is null)),
      add constraint encounter_level_fkey foreign key (level_id, level_owner_id)
        references level (id, account_id) on delete set null,
      add constraint encounter_level_owner_fkey foreign key (campaign_id, level_owner_id)
        references campaign (id, creator_account_id)
  `;
  yield* sql`create index encounter_level_idx on encounter (level_id) where level_id is not null`;

  yield* sql`
    alter table encounter_run_board
      add column ambient text
        constraint encounter_run_board_ambient_check check (ambient in ('bright', 'dim', 'dark')),
      add column floor smallint[],
      add constraint encounter_run_board_level_whole check ((ambient is null) = (floor is null)),
      add constraint encounter_run_board_floor_shape check (
        floor is null or (
          array_ndims(floor) = 1
          and cardinality(floor) = board_columns * board_rows
          and array_position(floor, null) is null
          and 0 <= all(floor) and 7 > all(floor)
        )
      )
  `;

  yield* sql`
    create table encounter_run_wall (
      run_id      uuid not null references encounter_run_board (run_id) on delete cascade,
      id          uuid not null,
      ordinal     integer not null,
      x1          double precision not null,
      y1          double precision not null,
      x2          double precision not null,
      y2          double precision not null,
      kind        text not null
                    constraint encounter_run_wall_kind_check
                    check (kind in ('wall', 'door', 'secretDoor')),
      door_state  text
                    constraint encounter_run_wall_door_state_check
                    check (door_state in ('open', 'closed', 'locked')),
      low         boolean not null,
      revealed    boolean not null default false,
      primary key (run_id, id),
      constraint encounter_run_wall_door_has_state check ((kind = 'wall') = (door_state is null)),
      constraint encounter_run_wall_revealed_secret check (not revealed or kind = 'secretDoor')
    )
  `;

  yield* sql`
    create table encounter_run_prop (
      run_id           uuid not null references encounter_run_board (run_id) on delete cascade,
      id               uuid not null,
      ordinal          integer not null,
      kind             text not null,
      x                integer not null,
      y                integer not null,
      rotation         smallint not null
                         constraint encounter_run_prop_rotation_check check (rotation between 0 and 3),
      blocks_movement  boolean,
      blocks_sight     boolean,
      cover            text
                         constraint encounter_run_prop_cover_check
                         check (cover in ('none', 'half', 'threeQuarters', 'total')),
      difficult        boolean,
      dm_only          boolean not null,
      primary key (run_id, id)
    )
  `;

  yield* sql`
    create table encounter_run_light (
      run_id   uuid not null references encounter_run_board (run_id) on delete cascade,
      id       uuid not null,
      ordinal  integer not null,
      x        double precision not null,
      y        double precision not null,
      bright   integer not null,
      dim      integer not null,
      tone     text not null,
      flicker  boolean not null,
      lit      boolean not null,
      primary key (run_id, id)
    )
  `;

  yield* sql`
    create table encounter_run_region (
      run_id   uuid not null references encounter_run_board (run_id) on delete cascade,
      id       uuid not null,
      ordinal  integer not null,
      kind     text not null,
      squares  integer[] not null,
      secret   boolean not null,
      primary key (run_id, id)
    )
  `;

  yield* sql`alter table session_event drop constraint session_event_kind_check`;
  yield* sql`
    alter table session_event
      add constraint session_event_kind_check check (kind in (
        'run-started', 'run-updated', 'run-ended', 'run-carried', 'run-resumed',
        'run-escalated',
        'combatant-added', 'combatant-updated', 'combatant-removed',
        'combatant-damaged', 'combatant-moved', 'turn-advanced', 'death-save',
        'beat-added', 'character-updated', 'roll-made',
        'hob-resource-spent', 'hob-resource-undone', 'hob-turn-kept', 'hob-turn-undone',
        'scene-updated', 'check-logged', 'check-removed',
        'board-fog-updated', 'board-area-updated',
        'board-door-updated', 'board-light-updated',
        'party-moved'
      ))
  `;
});
