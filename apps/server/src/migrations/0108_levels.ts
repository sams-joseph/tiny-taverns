import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Levels: an account's battle maps, built of a floor and the walls, props,
 * lights and regions on it (`Level.ts` in `@taverns/api`).
 *
 * ### `level` — account-owned and top-level, like a location
 *
 * A level belongs to the account that made it and to no campaign or world;
 * the Library's Levels shelf is the owner's read of their own and every write.
 * `(id, account_id)` is unique so a later pointer to a level (an encounter's)
 * can be a same-owner key, as a location placement's is.
 *
 * **The floor is an array, the rest are tables.** One `smallint` per square,
 * `row * columns + column` as `fog_hidden` is spelled (`0087`), each an index
 * into `LEVEL_MATERIALS`: 40,000 rows for a 200 × 200 floor would be absurd,
 * and a floor is never secret. Walls, props, lights and regions are rows, not
 * one `jsonb` document, because a player's view of a fight on a level must be
 * narrowed in SQL: a secret door reads as a wall until revealed, a trap is
 * the DM's, a DM-only prop is never sent (AGENTS.md rule 1).
 *
 * **A save replaces the document.** `version` is the optimistic-concurrency
 * counter `Levels.save` checks and bumps under the row's lock; the parts are
 * deleted and written again in that transaction. `ordinal` keeps each list in
 * the order it was saved, so the document round-trips.
 *
 * **Provenance, no visibility.** Who may read a level is its owner, no
 * dm/shared switch answers that. It carries the provenance pair because a
 * person may keep a Hob draft of one, with the turn's key `set null` as
 * `location`'s is. Absent prose is `null`, never blank (`0052`).
 *
 * ### Everything stays on the board
 *
 * Each part carries its level's `board_columns` and `board_rows` through its
 * key to `level (id, columns, rows)` `on update cascade` — a key carrying a
 * column a check needs, as `encounter_prep`'s does (`0060`) — so its own check
 * can say it is on the board. Wall endpoints are grid vertices (halves
 * allowed) within `0..columns` and `0..rows`; a prop's footprint, turned by
 * its rotation, is inside; a light is inside; a region's squares are on the
 * board. Resizing a level whose parts would fall off fails, which is why a
 * save deletes the parts before it moves the size.
 *
 * The material count (`7 > all(floor)`), the kinds, and the prop footprints
 * (`level_prop_size`) restate `LevelKit.ts`: the kit appends, and an appended
 * material or prop kind needs a migration that widens these.
 * `levels.test.ts` holds the footprints and kinds to `PROP_KINDS`.
 *
 * All five tables are in `NOT_CONTENT` (`schema.test.ts`).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table level (
      id                 uuid primary key default gen_random_uuid(),
      account_id         uuid not null references account (id) on delete cascade,
      name               text not null
                           constraint level_name_shape
                           check (btrim(name) <> '' and char_length(name) <= 120),
      description        text
                           constraint level_description_shape
                           check (btrim(description) <> '' and char_length(description) <= 2000),
      columns            integer not null
                           constraint level_columns_check check (columns between 1 and 200),
      rows               integer not null
                           constraint level_rows_check check (rows between 1 and 200),
      feet_per_cell      integer not null default 5
                           constraint level_feet_per_cell_check check (feet_per_cell between 1 and 100),
      ambient            text not null default 'bright'
                           constraint level_ambient_check check (ambient in ('bright', 'dim', 'dark')),
      floor              smallint[] not null,
      version            integer not null default 1,
      origin             text not null default 'authored'
                           constraint level_origin_check check (origin in ('authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint level_id_account_key unique (id, account_id),
      constraint level_board_key unique (id, columns, rows),
      constraint level_floor_shape check (
        array_ndims(floor) = 1
        and cardinality(floor) = columns * rows
        and array_position(floor, null) is null
        and 0 <= all(floor) and 7 > all(floor)
      ),
      constraint level_assistant_turn_fkey foreign key (assistant_turn_id)
        references assistant_turn (id) on delete set null deferrable initially deferred,
      constraint level_assistant_provenance
        check (assistant_turn_id is null or origin = 'assistant')
    )
  `;
  yield* sql`create index level_account_idx on level (account_id)`;

  yield* sql`
    create table level_wall (
      level_id       uuid not null,
      id             uuid not null,
      ordinal        integer not null,
      board_columns  integer not null,
      board_rows     integer not null,
      x1             double precision not null,
      y1             double precision not null,
      x2             double precision not null,
      y2             double precision not null,
      kind           text not null
                       constraint level_wall_kind_check check (kind in ('wall', 'door', 'secretDoor')),
      door_state     text
                       constraint level_wall_door_state_check
                       check (door_state in ('open', 'closed', 'locked')),
      low            boolean not null default false,
      primary key (level_id, id),
      constraint level_wall_level_fkey foreign key (level_id, board_columns, board_rows)
        references level (id, columns, rows) on delete cascade on update cascade,
      constraint level_wall_door_has_state check ((kind = 'wall') = (door_state is null)),
      constraint level_wall_on_vertices check (
        x1 * 2 = trunc(x1 * 2) and y1 * 2 = trunc(y1 * 2)
        and x2 * 2 = trunc(x2 * 2) and y2 * 2 = trunc(y2 * 2)
      ),
      constraint level_wall_on_the_board check (
        x1 between 0 and board_columns and x2 between 0 and board_columns
        and y1 between 0 and board_rows and y2 between 0 and board_rows
      ),
      constraint level_wall_has_length check (x1 <> x2 or y1 <> y2)
    )
  `;

  // A prop kind's unrotated footprint, `{width, height}` in squares: the kit's
  // (`PROP_KINDS`), restated for the check below.
  yield* sql`
    create function level_prop_size(kind text) returns integer[]
    language sql immutable strict parallel safe
    return case kind
      when 'table' then array[2, 1]
      when 'bookshelf' then array[2, 1]
      when 'bed' then array[1, 2]
      when 'altar' then array[2, 1]
      when 'tree' then array[2, 2]
      when 'rug' then array[2, 3]
      else array[1, 1]
    end
  `;

  yield* sql`
    create table level_prop (
      level_id         uuid not null,
      id               uuid not null,
      ordinal          integer not null,
      board_columns    integer not null,
      board_rows       integer not null,
      kind             text not null
                         constraint level_prop_kind_check check (kind in (
                           'crate', 'barrel', 'table', 'chair', 'pillar', 'statue', 'brazier',
                           'rubble', 'chest', 'bookshelf', 'bed', 'altar', 'tree', 'boulder',
                           'bush', 'rug'
                         )),
      x                integer not null,
      y                integer not null,
      rotation         smallint not null
                         constraint level_prop_rotation_check check (rotation between 0 and 3),
      blocks_movement  boolean,
      blocks_sight     boolean,
      cover            text
                         constraint level_prop_cover_check
                         check (cover in ('none', 'half', 'threeQuarters', 'total')),
      difficult        boolean,
      dm_only          boolean not null default false,
      primary key (level_id, id),
      constraint level_prop_level_fkey foreign key (level_id, board_columns, board_rows)
        references level (id, columns, rows) on delete cascade on update cascade,
      -- Odd quarter turns swap width and height.
      constraint level_prop_on_the_board check (
        x >= 0 and y >= 0
        and x + (level_prop_size(kind))[1 + rotation % 2] <= board_columns
        and y + (level_prop_size(kind))[2 - rotation % 2] <= board_rows
      )
    )
  `;

  yield* sql`
    create table level_light (
      level_id       uuid not null,
      id             uuid not null,
      ordinal        integer not null,
      board_columns  integer not null,
      board_rows     integer not null,
      x              double precision not null,
      y              double precision not null,
      bright         integer not null
                       constraint level_light_bright_check check (bright between 0 and 120),
      dim            integer not null
                       constraint level_light_dim_check check (dim between 0 and 120),
      tone           text not null
                       constraint level_light_tone_check
                       check (tone in ('fire', 'arcane', 'moon', 'radiant')),
      flicker        boolean not null default false,
      lit            boolean not null default true,
      primary key (level_id, id),
      constraint level_light_level_fkey foreign key (level_id, board_columns, board_rows)
        references level (id, columns, rows) on delete cascade on update cascade,
      constraint level_light_on_the_board check (
        x between 0 and board_columns and y between 0 and board_rows
      )
    )
  `;

  yield* sql`
    create table level_region (
      level_id       uuid not null,
      id             uuid not null,
      ordinal        integer not null,
      board_columns  integer not null,
      board_rows     integer not null,
      kind           text not null
                       constraint level_region_kind_check check (kind in (
                         'difficult', 'magicalDarkness', 'heavyObscurement', 'hazard', 'trap'
                       )),
      squares        integer[] not null,
      secret         boolean not null default false,
      primary key (level_id, id),
      constraint level_region_level_fkey foreign key (level_id, board_columns, board_rows)
        references level (id, columns, rows) on delete cascade on update cascade,
      constraint level_region_on_the_board check (
        array_ndims(squares) = 1
        and cardinality(squares) >= 1
        and array_position(squares, null) is null
        and 0 <= all(squares) and board_columns * board_rows > all(squares)
      )
    )
  `;
});
