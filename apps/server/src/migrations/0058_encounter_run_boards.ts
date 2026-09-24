import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A fight keeps its board: `encounter_run_board`, one per run.
 *
 * ### The grid is a snapshot; the picture is read through the map
 *
 * `start` copies the encounter's map's grid onto the run's board, and `resume`
 * copies the predecessor's board onto the successor. The fight reads its own
 * copy thereafter, so editing the encounter's grid — on its page, mid-fight or
 * a month later — changes the next fight on it and never this one. It is
 * `encounter_run.encounter_name`'s rule, and `combatant`'s seed-time snapshot:
 * a run is a record of the night it happened, and a later edit to the template
 * must not rewrite the board it was played on. It is also what the play
 * feature's tokens will need — a position in squares only means something
 * against a board that does not move under it.
 *
 * The picture is not copied. It is drawn once and never redrawn, so reading it
 * through `map_id` is reading the same picture; only its arrival (Hob finishing
 * the draw after the fight began) can change what the fight shows, and that is
 * the picture the fight was always meant to have.
 *
 * ### Its own table rather than columns on `encounter_run`
 *
 * `0057_battle_maps.ts`'s reason, one table over: a player's recap reads
 * `encounter_run.*` (`Recap.ts`), and the board is the creator's alone. On its
 * own table no player read touches it. `run_id` is the key, so it is one per
 * run, and the run's delete (with its session) takes it.
 *
 * ### When the map goes
 *
 * `map_id` is `on delete set null`: deleting the encounter cascades its map and
 * the map's picture, and the fight keeps its grid on the blank surface — the
 * same board with no picture, which a map Hob never drew already is. The run is
 * a record, so its board outlives its template exactly as `encounter_name`
 * does. A plain key to `battle_map (id)` rather than the composite
 * `(id, campaign_id)`: a nested table carries no `campaign_id`
 * (`0005_live_session.ts`), so containment is `EncounterRuns`' insert — it
 * copies only a map of the encounter it just proved readable, or its
 * predecessor's board — and `BattleMaps.forRun` binds the map to the campaign
 * again on every read.
 *
 * ### Backfill
 *
 * A run already on file takes its encounter's grid as it stands now, which is
 * the only answer there is; a run whose encounter is gone gets no board, and
 * the runner shows none. Nothing is invented.
 *
 * Not campaign content, like `battle_map`: the creator proof decides who reads
 * it and its provenance is its run's. It is in `NOT_CONTENT` (`schema.test.ts`).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table encounter_run_board (
      run_id            uuid primary key references encounter_run (id) on delete cascade,
      map_id            uuid references battle_map (id) on delete set null,
      grid              text not null check (grid in ('square', 'none')),
      board_columns     integer not null check (board_columns between 1 and 200),
      board_rows        integer not null check (board_rows between 1 and 200),
      feet_per_cell     integer not null check (feet_per_cell between 1 and 100),
      cell_px           double precision not null check (cell_px >= 8 and cell_px <= 1024),
      offset_x_px       double precision not null,
      offset_y_px       double precision not null,
      created_at        timestamptz not null default now(),
      constraint encounter_run_board_offset_within_a_square
        check (offset_x_px >= 0 and offset_x_px < cell_px
               and offset_y_px >= 0 and offset_y_px < cell_px)
    )
  `;
  // The map's delete sets its boards' pointer to null, which looks them up by map.
  yield* sql`
    create index encounter_run_board_map on encounter_run_board (map_id) where map_id is not null
  `;

  yield* sql`
    insert into encounter_run_board (
      run_id, map_id, grid, board_columns, board_rows, feet_per_cell,
      cell_px, offset_x_px, offset_y_px
    )
    select encounter_run.id, battle_map.id, battle_map.grid, battle_map.board_columns,
           battle_map.board_rows, battle_map.feet_per_cell, battle_map.cell_px,
           battle_map.offset_x_px, battle_map.offset_y_px
    from encounter_run
    join battle_map on battle_map.encounter_id = encounter_run.encounter_id
  `;
});
