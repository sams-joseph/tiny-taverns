import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * An encounter's Ready/Draft: the DM's own word that it is ready to run.
 *
 * On `encounter_prep`, not `encounter`, for `0060_encounter_prep.ts`'s reason:
 * it is the DM's plan for the scene, and a player reading a shared encounter
 * reads `encounter`. Whether the DM thinks their fight is finished is not the
 * table's to know.
 *
 * A stored flag rather than something computed from the roster, because it is
 * a judgement no column answers: a conversation has no creatures and may be
 * ready, and a full roster may still be missing its tactics. Every encounter
 * made before this is a draft — nobody has said otherwise, and `false` is what
 * the default says for every new one, Hob's accepted proposals included.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table encounter_prep add column ready boolean not null default false`;
});
