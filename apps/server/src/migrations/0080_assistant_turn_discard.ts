import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * The card's other two answers: *Discard*, and *Open it* after a keep.
 *
 * `discarded_at` is a person turning a proposal down. The proposal stays on
 * its turn — the record keeps what was offered, and Hob's prompt reads it back
 * as turned down — but it is no longer an offer: an accept refuses it and the
 * panel no longer draws it. A turn is kept or discarded, never both, and only
 * a turn that proposed something can be either, which is the same shape
 * `assistant_turn_accepted_was_proposed` (`0010`) gave the accept.
 *
 * `kept` is what the accept made — `HobKept`, the kind and the ids its screen
 * is addressed by — written in the accept's own transaction, so a kept card
 * opens what it made after a reload. A pointer, never an access path: the
 * screen reads the row through its own actor-scoped read. Every turn kept
 * before this has none, and its card has no *Open it*.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table assistant_turn
      add column discarded_at timestamptz,
      add column kept jsonb,
      add constraint assistant_turn_discarded_was_proposed
        check (discarded_at is null or proposal is not null),
      add constraint assistant_turn_kept_or_discarded
        check (accepted_at is null or discarded_at is null),
      add constraint assistant_turn_kept_was_accepted
        check (kept is null or accepted_at is not null)
  `;
});
