import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Fog of war on a fight's board: the squares the DM has hidden from players.
 *
 * ### Two sets of squares on the board's own row
 *
 * `fog_hidden` is the fog as it stands; `fog_start` is what *Reset* puts back.
 * Each is a set of squares spelled `row * board_columns + column`, which is a
 * stable name for a square because nothing resizes a fight's board after it is
 * made (`0058_encounter_run_boards.ts`). They are columns on
 * `encounter_run_board` rather than a table of their own so that `resume`'s one
 * `insert … select` carries them with the grid, and so the run's delete takes
 * them without a cascade of its own.
 *
 * A fight starts clear: both default to empty. Authored fog — painted on the
 * encounter's map in prep and copied into `fog_start` at start — is a later
 * piece of work, and `fog_start` is where it lands.
 *
 * ### Every square is on the board
 *
 * The check refuses a square off the board, and the write keeps each set
 * distinct and sorted, so a set is never a list with repeats for a reader to
 * tidy.
 *
 * ### What fog hides, and from whom
 *
 * A player's table drops the token and the initiative row of a creature
 * standing under fog, except the player's own character; that rule is
 * `liveTables.ts`' `hiddenByFog`. The DM sees everything.
 *
 * ### `board-fog-updated`
 *
 * The DM's fog writes append it, shared while a player's table shows the board
 * so their doorbell rings, and the DM's own line otherwise.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table encounter_run_board
      add column fog_hidden integer[] not null default '{}',
      add column fog_start integer[] not null default '{}',
      add constraint encounter_run_board_fog_on_the_board check (
        array_position(fog_hidden, null) is null
        and array_position(fog_start, null) is null
        and 0 <= all(fog_hidden) and board_columns * board_rows > all(fog_hidden)
        and 0 <= all(fog_start) and board_columns * board_rows > all(fog_start)
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
        'hob-resource-spent', 'hob-resource-undone',
        'scene-updated', 'check-logged', 'check-removed',
        'board-fog-updated'
      ))
  `;
});
