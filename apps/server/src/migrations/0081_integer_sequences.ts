import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The two ordinal sequences become `integer`, and so do the columns they fill.
 *
 * `session_event.seq` (`0005`) and the Chronicle's `group_history_entry.group_seq`
 * and `group_history_summary.last_group_seq` (`0030`) were `bigint`. Every
 * reader narrowed them to the wire's `Int` anyway, and the driver hands `int8`
 * back as a JS `bigint`, so the width was a decode step on every read for a
 * range no table here comes near. As `integer` they read as numbers.
 *
 * A sequence's type bounds what `nextval` may hand out; the column's bounds
 * what it holds. Both change, the sequence first, so a value the column could
 * not hold is refused by the sequence rather than by an insert. Values already
 * written are kept, and each sequence carries on from where it was. A database
 * whose sequence has passed 2^31 - 1 refuses the change and keeps its schema.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter sequence session_event_seq as integer`;
  yield* sql`alter table session_event alter column seq type integer`;

  yield* sql`alter sequence group_history_seq as integer`;
  yield* sql`alter table group_history_entry alter column group_seq type integer`;
  yield* sql`alter table group_history_summary alter column last_group_seq type integer`;
});
