import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Inspiration: the DM's award, held by the character until it is spent.
 *
 * On `character`, beside `temp_hp` and `conditions`, because it is the same
 * kind of value: live state the table sets during play, which the player reads
 * on their own sheet and a seat-mate reads wherever they read the character.
 * It is written only by the creator through the seat (`PartySeatUpdate`), as
 * the rest of the live half is, and there is no combatant copy — nothing in a
 * fight draws it.
 *
 * `not null default false`, as `temp_hp` is `default 0`: "not inspired" is the
 * ordinary state of every character, so every existing row is not inspired
 * rather than unknown.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table character add column inspiration boolean not null default false`;
});
