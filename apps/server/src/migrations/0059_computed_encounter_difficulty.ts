import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * An encounter's difficulty is computed, never stored.
 *
 * `0003_prep_surface.ts` gave `encounter` a `difficulty` the DM picked from
 * the four DMG bands. The captain's call of 2026-09-25 was *computed only*:
 * the band is the DMG's arithmetic over the roster's XP and the seated
 * party's levels (`packages/api/src/EncounterDifficulty.ts`), done on every
 * read, and a band typed beside it would be a second answer that disagrees
 * the first time a goblin is added.
 *
 * Dropped rather than left unread: a column no code reads is a value a later
 * reader mistakes for the answer. The DM's old picks are not carried anywhere,
 * and nothing is lost that the roster and the party do not already say.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table encounter drop column difficulty`;
});
