import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * **A background is a third kind of `character_option`** — and this migration is
 * the whole of what the schema had to do about it.
 *
 * One check constraint widened. No column on `character_option`, no column on
 * `character`, no index, no backfill and no data. That is `0017`'s own bet
 * paying out — *"one `note` table with a `kind`… adding a background is then a
 * new `kind` value rather than a migration plus a repository plus an API group
 * plus a screen"* — and it is worth recording that it held, because the next
 * time somebody argues for a fourth table this is the evidence.
 *
 * ### Why a background needed no column when it is the one that changes numbers
 *
 * The 2024 ruleset moved the ability score increases off the species and onto
 * the background, so this is the entity that changes a new character's armour
 * class and hit points most. It still earns no column, by the rule
 * `character` and `creature` both follow: **a field earns a column when
 * something in the product reads it** — a screen filters or sorts on it, a
 * predicate uses it, the seed copies it. Nothing filters backgrounds by what
 * they grant; `seedFor` reads the increases once, out of a row already in hand,
 * at the moment a character is created. So the grant is document, like a hit
 * die and hit points per level before it.
 *
 * ### And `character` gains nothing either — not even a `background` column
 *
 * A character's background is `sheet.identity.background` and stays there. It
 * is where it already was (`0012`), nothing filters or sorts on it, and it is
 * not one of the three the generated `descriptor` column is built from — adding
 * a fourth would be a migration for a string only the sheet's header draws,
 * which `Character.ts` already refuses for `subclass` in as many words.
 *
 * So an existing character keeps whatever free text is in that key, resolves to
 * no option (`optionNamed` is exact, case aside, and refuses fuzzy matching),
 * renders exactly as it did, and is one ordinary edit away from a label that
 * does resolve. There is nothing here to backfill and nothing that could be
 * backfilled without guessing.
 *
 * ### The constraint is dropped and re-added rather than altered
 *
 * Postgres has no *widen this check* statement; a `check` is replaced. The two
 * statements are separate `sql` calls because the pg driver's extended protocol
 * rejects two statements in one query, and they are safe in this order because
 * a migration runs inside the migrator's own transaction — there is no window
 * in which the table is unconstrained that another session can see.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table character_option
      drop constraint character_option_kind_check
  `;

  yield* sql`
    alter table character_option
      add constraint character_option_kind_check
      check (kind in ('class', 'species', 'background'))
  `;
});
