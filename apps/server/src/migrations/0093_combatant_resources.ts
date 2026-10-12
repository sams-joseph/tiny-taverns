import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * What a monster has spent over its fight: legendary actions this round,
 * recharge abilities waiting on their roll, X/day uses and spell slots.
 *
 * **Spent, not left.** The stat block says how many there are
 * (`packages/api/src/NpcResources.ts`, `npcLimits`) and the row says how many
 * are gone, so nothing spent is the ordinary state and the column default:
 * every combatant already in a fight is correct as it stands, a row never
 * snapshots a maximum it would have to read the creature for (`creature_id`
 * is provenance, never an access path), and the start of a creature's turn
 * gives its legendary actions back by zeroing a count (`freshTurn`).
 *
 * - `legendary_spent`: legendary actions taken since its own last turn began.
 * - `recharge_spent`: the keys of recharge abilities used and not yet
 *   recharged, a set, as `conditions` is.
 * - `uses_spent` / `slots_spent`: key to a count, an object; a key with
 *   nothing spent is absent rather than zero.
 *
 * The creator's alone, as the turn's spending is (`0086_turn_economy.ts`): no
 * player read selects them, and `resume` copies them.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    alter table combatant
      add column legendary_spent integer not null default 0
        constraint combatant_legendary_spent_range check (legendary_spent between 0 and 100),
      add column recharge_spent text[] not null default '{}',
      add column uses_spent jsonb not null default '{}'::jsonb
        constraint combatant_uses_spent_object check (jsonb_typeof(uses_spent) = 'object'),
      add column slots_spent jsonb not null default '{}'::jsonb
        constraint combatant_slots_spent_object check (jsonb_typeof(slots_spent) = 'object')
  `;
});
