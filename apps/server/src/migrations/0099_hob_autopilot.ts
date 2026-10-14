import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Hob's autopilot for one fight: `encounter_run.hob_autopilot_driver`.
 *
 * While it is set, the DM's runner takes each monster's turn on its own: the
 * recharge dice, the ask, the keep and the next turn, through the endpoints a
 * press uses. There is no server-side job; the browser drives.
 *
 * ### The switch is the lease
 *
 * One nullable column rather than a boolean and a lease beside it. Null is
 * off. A value is on, and names the one runner tab that drives (an id the tab
 * keeps in `sessionStorage`), so a laptop and a phone at one fight do not both
 * ask Hob for the same turn. Any other tab of the DM's says autopilot is
 * driven elsewhere and offers to drive here, which writes its own id. There is
 * no heartbeat and no expiry: a closed tab leaves the switch on with nobody
 * driving, the other tab says so, and a person takes over or turns it off.
 *
 * ### The creator's, and not carried
 *
 * Written only through the creator's run update, logged `dm` whatever the
 * fight's Share says, and selected by no player read (`runColumns` against
 * `playerRunColumns`). `resume` does not copy it, as it does not copy
 * `allow_hob_direct_writes` (`0035`): the fight is picked up on another night,
 * usually from another tab, and a switch that keeps turns without a press is
 * one the DM turns on again for the night they are watching.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table encounter_run add column hob_autopilot_driver uuid`;
});
