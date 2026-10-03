import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * A conversation's name, which Hob gives it.
 *
 * `title` stays what it was — the question that started the thread, shortened
 * — and is what the conversations list shows until a name exists, or when
 * none ever does (no model, a model that said nothing usable). `name` is
 * written once, after the first answer, by `assistant/HobNamer.ts`, and never
 * by a request: no payload carries one. It describes the conversation and
 * nothing in the record, which is why it needs no accept.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table assistant_thread
      add column name text,
      add constraint assistant_thread_name_length
        check (name is null or char_length(name) between 1 and 80)
  `;
});
