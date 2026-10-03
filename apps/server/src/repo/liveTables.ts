import type { Actor, CampaignId } from "@taverns/api";
import type { SqlClient, Statement } from "effect/sql";
import {
  type Containment,
  inCampaign,
  type NestedTable,
  seatedByActor,
  under,
} from "./visibility.js";

/**
 * Where the live tables sit relative to the campaign that scopes them.
 *
 * Shared between `EncounterRuns`, `Combatants` and `SessionEvents` rather than
 * restated in each, for the reason the chain is data in the first place: three
 * copies of "a combatant is under a run is under a session" is three chances
 * for one of them to be wrong, and the wrong one would be a read that reaches
 * further than it should.
 */

/** `encounter_run` hangs off `session`, which is campaign-scoped. */
export const RUNS: NestedTable = {
  table: "encounter_run",
  parent: "session",
  foreignKey: "session_id",
};

export const RUN: Containment = under("encounter_run", "session_id", inCampaign("session"));

/** `combatant` hangs off `encounter_run` — two levels below the campaign. */
export const COMBATANTS: NestedTable = {
  table: "combatant",
  parent: "encounter_run",
  foreignKey: "encounter_run_id",
};

export const COMBATANT: Containment = under("combatant", "encounter_run_id", RUN);

/** The roster a run is seeded from. */
export const ROSTER: NestedTable = {
  table: "encounter_creature",
  parent: "encounter",
  foreignKey: "encounter_id",
};

/**
 * The initiative list, in the order it is read and advanced through.
 *
 * Highest first; a row with no number yet after every row with one (Postgres
 * sorts nulls *first* in a descending order, so `nulls last` is load-bearing).
 * Ties go to the higher initiative bonus, then to the players, which is the
 * table's rule (the captain's call; the SRD leaves ties to the GM). Then
 * oldest, then by id.
 *
 * The last terms are not decoration: `data.js:18-19` are two combatants who
 * both rolled 14, and without a total order the turn marker would advance to
 * whichever row Postgres happened to return first — which need not be the
 * same row twice. Turn order is state the DM reads aloud from; it has to be
 * the same every time anyone asks.
 *
 * **`created_at` does not separate the rows a single seed inserted.** Postgres
 * `now()` is transaction *start* time, so every combatant created by starting a
 * run carries the same timestamp to the microsecond and the tiebreak falls
 * straight through to `id`: two goblins with the same roll and the same bonus
 * are in a fixed but arbitrary order. That is harmless — the order is
 * *stable*, which is the property that matters. It is written down because the
 * alternative is someone later reading `created_at asc` as "the order they
 * were added" and building on a guarantee that is not there.
 */
export const initiativeOrder = (sql: SqlClient.SqlClient): Statement.Fragment =>
  sql`order by ${initiativeOrderKeys(sql)}`;

/** The keys of `initiativeOrder`, for a query that orders by more after them. */
export const initiativeOrderKeys = (sql: SqlClient.SqlClient): Statement.Fragment =>
  sql`combatant.initiative desc nulls last, combatant.initiative_bonus desc nulls last,
      (combatant.kind = 'pc') desc, combatant.created_at asc, combatant.id asc`;

/**
 * Over `encounter_run` in scope: a seated player's table shows this fight's
 * board — it is a fight (a conversation, a challenge or a hazard shows a
 * player no order, so no tokens either), it is shared, and the DM has turned
 * on *Share map* (`0067_run_map_sharing.ts`).
 */
export const boardShown = (sql: SqlClient.SqlClient): Statement.Fragment =>
  sql`(encounter_run.mode = 'combat'
    and encounter_run.visibility = 'shared' and encounter_run.map_shown)`;

/**
 * Over `combatant` in scope: its token stands on a square of its fight's board
 * that is under fog (`0087_run_board_fog.ts`). A token off the board stands
 * nowhere, so it is under no fog.
 */
export const underFog = (sql: SqlClient.SqlClient): Statement.Fragment =>
  sql`exists (select 1 from encounter_run_board
    where encounter_run_board.run_id = combatant.encounter_run_id
      and combatant.board_row * encounter_run_board.board_columns + combatant.board_column
          = any(encounter_run_board.fog_hidden))`;

/**
 * Over `combatant` in scope: fog hides this row from this reader — **its token
 * and its row of the order both**, so what a player cannot see on the board is
 * not in their initiative either. It stands under fog and is not the reader's
 * own character: a player always knows where they are, and their own row is
 * their seat at the table.
 *
 * It holds whether or not the DM shows the map. Fog says the party cannot see
 * what stands there, and turning off *Share map* takes the board away without
 * showing anybody what was under it.
 */
export const hiddenByFog = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment => sql`(${underFog(sql)} and not ${seatedByActor(sql, campaignId, actor)})`;

/**
 * Over `encounter_run` in scope: its fight is still on the table — the tail of
 * its carried chain (`continued_from` followed forward, through any number of
 * carries, to the run nothing continues) is unended, or was carried and waits
 * to be resumed. Only a tail that ended any other way ends the fight. Fog is a
 * live-board tool, so a reader that outlasts the fight (the recap) composes
 * `hiddenByFog` only under this. Following `continued_from` here only narrows
 * what a reader sees; it grants no reach.
 */
export const fightLive = (sql: SqlClient.SqlClient): Statement.Fragment =>
  sql`exists (
    with recursive chain as (
      select encounter_run.id, encounter_run.ended_at, encounter_run.ended_reason
      union all
      select next.id, next.ended_at, next.ended_reason from encounter_run next
      join chain on next.continued_from = chain.id
    )
    select 1 from chain
    where not exists (select 1 from encounter_run next where next.continued_from = chain.id)
      and (chain.ended_at is null or chain.ended_reason = 'carried'))`;

/**
 * Over `combatant` and its `encounter_run` in scope: this row's token is on a
 * player's board, if the row is in their order at all — the board is shown, it
 * is not a monster while hostile tokens are hidden, and it is not a monster
 * under fog. The player's table selects positions under it and a move's log
 * line is shared under it, so the two cannot disagree about which moves a
 * player can see. A player character under fog is still on its owner's board,
 * so it passes here and `hiddenByFog` takes it off everybody else's with its
 * row.
 */
export const tokenShown = (sql: SqlClient.SqlClient): Statement.Fragment =>
  sql`(${boardShown(sql)}
    and (combatant.kind = 'pc'
      or (not encounter_run.hostile_tokens_hidden and not ${underFog(sql)})))`;

/**
 * A fresh turn for whoever the marker just landed on: nothing spent, no feet
 * moved (`0086_turn_economy.ts`). **Every write that moves the marker onto a
 * combatant runs this in its own transaction** — `nextTurn`, `begin`, a
 * hand-set marker and the removal of whoever was up — so a creature's turn
 * starts unspent however it came round, and only the incoming row is touched:
 * a reaction spent off-turn stays spent until its own turn starts.
 *
 * Beneath the caller's gate, which has already proved the run writable; the
 * run in the `where` keeps the statement to that fight's row.
 */
export const freshTurn = (sql: SqlClient.SqlClient, runId: string, combatantId: string) =>
  sql`
    update combatant
    set action_used = false, bonus_used = false, reaction_used = false, feet_moved = 0,
        updated_at = now()
    where combatant.id = ${combatantId} and combatant.encounter_run_id = ${runId}
  `;
