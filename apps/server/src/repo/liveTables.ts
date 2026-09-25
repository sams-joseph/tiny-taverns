import type { SqlClient, Statement } from "effect/unstable/sql";
import { type Containment, inCampaign, type NestedTable, under } from "./visibility.js";

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
