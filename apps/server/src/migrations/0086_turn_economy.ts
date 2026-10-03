import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * This turn's spending on a combatant, and the campaign's diagonal rule that
 * counts its movement.
 *
 * ### What a turn has spent, on the fight's own row
 *
 * `action_used`, `bonus_used` and `reaction_used` are the DM's ticks, and
 * `feet_moved` is what `Combatants.move` has counted while this combatant was
 * up. They are the runner's, the maintainer's decision D2 of 2026-10-02, which
 * reverses the character sheet's "nothing tracked per turn" for the fight
 * alone: the sheet still keeps no per-turn state. The server clears the row of
 * whoever becomes up (`freshTurn` in `repo/liveTables.ts`), so a reload and a
 * second tab read the same turn. Every existing row starts unspent.
 *
 * The narrowing is in the select lists, as for a position
 * (`0064_combatant_positions.ts`): no player read names these columns.
 *
 * ### The diagonal rule is the table's
 *
 * `campaign.diagonal_rule` is how a diagonal step counts on every board of the
 * campaign (`DiagonalRule` in `packages/api/src/BattleMap.ts`): `five`, the
 * SRD's grid rule and the default, or `alternating` 5/10.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table combatant
      add column action_used boolean not null default false,
      add column bonus_used boolean not null default false,
      add column reaction_used boolean not null default false,
      add column feet_moved integer not null default 0
        constraint combatant_feet_moved_range check (feet_moved >= 0)
  `;

  yield* sql`
    alter table campaign
      add column diagonal_rule text not null default 'five'
        constraint campaign_diagonal_rule_check check (diagonal_rule in ('five', 'alternating'))
  `;
});
