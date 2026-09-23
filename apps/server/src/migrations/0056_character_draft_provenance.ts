import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A Hob-drafted character outlives the campaign it was drafted at.
 *
 * `0010` made every content table's `assistant_turn_id` a `no action` key
 * paired with `(origin = 'assistant') = (assistant_turn_id is not null)`, so an
 * accepted row pins the turn that produced it. For every table but one that is
 * free: a note, a beat or an encounter is deleted with its campaign in the same
 * cascade as the conversation that proposed it.
 *
 * `character` is the exception. It is account-owned and survives the campaign
 * (only its seat goes), but a character a player kept from a drafting thread at
 * that table names a turn in a thread that `on delete cascade` takes with the
 * campaign. Deleting the campaign would then fail at COMMIT.
 *
 * So for this table alone the key becomes `on delete set null`, and the check
 * becomes the one direction that still holds: a turn pointer means the row is
 * the assistant's. `origin = 'assistant'` with no turn is a character Hob drafted
 * whose conversation was deleted with its campaign. The row still says where its
 * content came from; it can no longer say which turn. Referential actions are
 * not deferred, so the pointer empties inside the cascade that deletes the turn.
 *
 * Dropped and written again, like `0053`, so the statement is the same on every
 * database whatever shape `0001` left it in.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table character
      drop constraint if exists character_assistant_turn_fkey,
      add constraint character_assistant_turn_fkey
        foreign key (assistant_turn_id) references assistant_turn (id)
        on delete set null
        deferrable initially deferred
  `;

  yield* sql`
    alter table character
      drop constraint if exists character_assistant_provenance,
      add constraint character_assistant_provenance
        check (assistant_turn_id is null or origin = 'assistant')
  `;
});
