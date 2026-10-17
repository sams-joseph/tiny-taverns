import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * What an attack was, on the roll that made it (`AttackDelivery.ts`,
 * `packages/api`): how it was delivered, on an attack's to-hit, and its damage
 * type, on the to-hit and each damage roll. The board draws an attack from
 * them, an arrow or a bolt of fire from the attacker to the target.
 *
 * Both null on every existing row, which nobody recorded them for, and on any
 * roll whose line could not say: the board then draws only the hit. The checks
 * are the two closed vocabularies, so a value the board has no drawing for can
 * never be stored.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table character_roll
      add column delivery text
        constraint character_roll_delivery_check
          check (delivery in ('melee-weapon', 'ranged-weapon', 'melee-spell', 'ranged-spell')),
      add column damage_type text
        constraint character_roll_damage_type_check
          check (damage_type in (
            'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
            'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'
          ))
  `;
});
