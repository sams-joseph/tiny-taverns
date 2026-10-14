import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Which side a combatant fights on: `combatant.side` and the roster line's
 * `encounter_creature.side`, each `party` or `foes`.
 *
 * ### Not `kind`
 *
 * `kind` says what a row *is*: a `pc` makes death saves, falls `Unconscious`
 * and keeps its turns at zero; an `npc` at zero is out. Until now it also
 * decided the side: which edge a token starts on, the runner's *Party* or
 * *Hostile* badge, the hostiles-standing count, which tokens
 * `hostile_tokens_hidden` hides. A guard captain fighting beside the party, a
 * charmed ogre, or a Cast NPC who is the party's ally is an `npc` on the
 * party's side, so the two are columns of their own. `side` changes none of
 * what `kind` decides.
 *
 * ### Every row, backfilled from `kind`
 *
 * A `pc` was on the party's side and anything else was a foe, so the backfill
 * is exact. Both columns then default to `foes`, beside `kind`'s default of
 * `npc`, so a row inserted behind the repository fails closed the way it
 * already did. Every path that inserts a combatant names its side anyway
 * (`start` from the seat or the roster line, `resume` from the row it copies,
 * an add by hand from its payload or its kind), and the form or the proposal
 * names a roster line's when it is the party's.
 *
 * ### The creator's
 *
 * No player read selects either column. The one place a player can infer a
 * side is the board: a party-side token is shown while hostile tokens are
 * hidden (`tokenShown`, `repo/liveTables.ts`), since the switch hides the
 * party's foes and nothing else.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table combatant
      add column side text not null default 'foes'
        constraint combatant_side_check check (side in ('party', 'foes'))
  `;
  yield* sql`update combatant set side = 'party' where kind = 'pc'`;

  yield* sql`
    alter table encounter_creature
      add column side text not null default 'foes'
        constraint encounter_creature_side_check check (side in ('party', 'foes'))
  `;
});
