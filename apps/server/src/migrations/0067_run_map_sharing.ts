import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Showing a fight's board to the table: `encounter_run.map_shown` and
 * `encounter_run.hostile_tokens_hidden`.
 *
 * ### A second switch beside Share, not a second meaning of it
 *
 * `encounter_run.visibility` is the fight's Share switch and gates everything a
 * player reads of it. `map_shown` is the DM's *Share map*, and it narrows
 * further: the board reaches a player's table (`repo/PlayerTable.ts`) only
 * while the fight is shared **and** the map is shown **and** the reader holds a
 * seat. Turning Share off hides the board with the rest of the fight without
 * touching this column, so turning it back on shows what the DM last chose.
 * It defaults to `false`, as Share does: fail closed.
 *
 * ### Hostile tokens hidden is one switch over every monster
 *
 * `hostile_tokens_hidden` is the map's *Hide from players*: while it is on, no
 * NPC row has a token on a player's board, though its row stays in the order.
 * A combatant's own `visibility` still removes its row, and with the row its
 * token. Also `false` by default: it hides only what the order already shows.
 *
 * Both are columns on `encounter_run` because they are facts about the fight a
 * player sits in, and nothing in them is the DM's prose; a player's recap
 * reads the row whole (`runColumns`).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table encounter_run
      add column map_shown boolean not null default false,
      add column hostile_tokens_hidden boolean not null default false
  `;
});
