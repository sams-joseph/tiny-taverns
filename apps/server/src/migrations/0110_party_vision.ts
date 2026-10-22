import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Shared party vision: what the party sees of a fight's level, written by the
 * server beside the fight's copy (`0109_level_fights.ts`).
 *
 * ### `party_sees` and `party_seen` on `encounter_run_board`
 *
 * - `party_sees`: the squares the party sees now, `LevelGeometry.partyVision`
 *   over the party's viewers on the fight's copy, as the table knows its
 *   secret doors (`tableSight`).
 * - `party_seen`: every square the party has seen in this fight, `party_sees`
 *   included. It only grows, and a resumed fight carries its predecessor's.
 *
 * Both are `row * board_columns + column`, ascending and distinct, as
 * `fog_hidden` is spelled, and only a level board has them: a picture board's
 * are `null`. A level board's are `null` until its first vision write, which
 * a fight's start and resume make in their own transaction; a level fight
 * already on the table gets its vision at its next write, since a migration
 * cannot run the geometry. Until then its tokens show as they did and its
 * players are sent no square of the level.
 *
 * **Recomputed in the transaction of every write that can change them**
 * (`levelFights.ts`' `refreshPartyVision`): the fight's start and resume, a
 * combatant added, removed, moved or put back, a door opened, closed, locked,
 * revealed or hidden, and a light lit or snuffed. The viewers are the party's
 * player characters on the board that still hold a live seat; an allied NPC
 * looks for nobody. A viewer's darkvision is its character's
 * (`LevelFight.darkvisionOf`).
 *
 * The DM's fog (`fog_hidden`) stays an override on top: a player's read takes
 * fogged squares out of both arrays before it narrows anything by them.
 *
 * ### `board-vision-updated`
 *
 * A contentless line, `shared`, appended when a write changed what the party
 * sees (or a secret door they have seen was revealed or hidden, or a creature
 * they saw walked out of sight) while the table is shown the board and the
 * write's own line is not shared: it is how a player's doorbell rings for a
 * door, a light or a move whose own line is the DM's.
 *
 * A plain door's `board-door-updated` and a light's `board-light-updated` are
 * now shared when the party has seen the part (`levelFights.ts`' `partSeen`)
 * and the table is shown the board; a secret door's line stays the DM's.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table encounter_run_board
      add column party_sees integer[],
      add column party_seen integer[]
  `;
  yield* sql`
    alter table encounter_run_board
      add constraint encounter_run_board_vision_on_level check (
        floor is not null or (party_sees is null and party_seen is null)
      ),
      add constraint encounter_run_board_vision_shape check (
        party_sees is null or (
          array_ndims(party_sees) is null or (
            array_ndims(party_sees) = 1
            and array_position(party_sees, null) is null
            and 0 <= all(party_sees) and board_columns * board_rows > all(party_sees)
          )
        )
      ),
      add constraint encounter_run_board_seen_shape check (
        party_seen is null or (
          array_ndims(party_seen) is null or (
            array_ndims(party_seen) = 1
            and array_position(party_seen, null) is null
            and 0 <= all(party_seen) and board_columns * board_rows > all(party_seen)
          )
        )
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
        'board-door-updated', 'board-light-updated', 'board-vision-updated',
        'party-moved'
      ))
  `;
});
