import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * The DM's rolls as the runner's log: what a roll was for, who made it at
 * whom, and how an attack came out (the maintainer's decision D4 of
 * 2026-10-02, the DM's rolls and attack results kept and shown to the DM only).
 *
 * `kind` is `plain` for every existing row, which is what each was. The two
 * combatant pointers are composite with the roll's own `encounter_run_id`, the
 * turn marker's trick (`0005_live_session.ts`): a roll can only name a
 * combatant of the fight it was rolled in. Removing that combatant from the
 * fight clears the pointer and keeps the roll, whose label still says who it
 * was. `target_ac` and `outcome` are what the browser saw; the server stores
 * them and recomputes nothing.
 *
 * The visibility rule needs no column: a roll with no character is now
 * inserted `dm` (`repo/Rolls.ts`), and the read predicate already keeps a
 * `dm` row to the creator and the roller.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table character_roll
      add column kind text not null default 'plain'
        constraint character_roll_kind_check
          check (kind in ('attack', 'damage', 'death-save', 'concentration', 'plain')),
      add column combatant_id uuid,
      add column target_combatant_id uuid,
      add column target_ac smallint
        constraint character_roll_target_ac_range check (target_ac between 0 and 40),
      add column outcome text
        constraint character_roll_outcome_check check (outcome in ('hit', 'miss', 'crit', 'fumble')),
      add constraint character_roll_combatant_fkey
        foreign key (combatant_id, encounter_run_id) references combatant (id, encounter_run_id)
        on delete set null (combatant_id),
      add constraint character_roll_target_combatant_fkey
        foreign key (target_combatant_id, encounter_run_id) references combatant (id, encounter_run_id)
        on delete set null (target_combatant_id)
  `;
});
