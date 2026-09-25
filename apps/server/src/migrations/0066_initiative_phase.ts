import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The initiative phase: a fight starts with no numbers and collects them before
 * round 1.
 *
 * ### `encounter_run.phase`
 *
 * `initiative` while the numbers arrive, `turns` once the DM starts round 1.
 * `not null default 'turns'`, so every fight already written — seeded at 0 and
 * played from its first moment — is a fight taking turns, exactly as it was.
 * `start` writes `initiative` for a new fight.
 *
 * Nobody is up while initiative is being rolled, and the schema says so rather
 * than the repository remembering it: `encounter_run_nobody_up_while_rolling`.
 *
 * ### `combatant.initiative` may be absent
 *
 * The seed used to write 0 for everybody, which read as a number somebody had
 * rolled. It now writes nothing, and the default goes too, so a row with no
 * number says so. Existing rows keep theirs.
 *
 * ### `combatant.initiative_bonus`
 *
 * What the combatant adds to a d20, snapshotted at seed time from the sheet or
 * the stat block, as every other displayable field on the row is. It is what
 * "roll for them" adds, and it breaks ties (`repo/liveTables.ts`). Existing
 * rows have none: nothing snapshotted it when they were seeded, and guessing it
 * now from a sheet that may have changed since would be a backfilled guess.
 *
 * ### `combatant.initiative_set_by`
 *
 * Who wrote the number, `dm` or `player`: a player may enter their own
 * character's number from their Table, and may correct it until the DM writes
 * one. Null exactly when there is no number, which the check holds. Every
 * existing number was the DM's.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table encounter_run
      add column phase text not null default 'turns'
        constraint encounter_run_phase_check check (phase in ('initiative', 'turns'))
  `;
  yield* sql`
    alter table encounter_run
      add constraint encounter_run_nobody_up_while_rolling
        check (phase = 'turns' or active_combatant_id is null)
  `;

  yield* sql`alter table combatant alter column initiative drop not null`;
  yield* sql`alter table combatant alter column initiative drop default`;
  yield* sql`
    alter table combatant
      add column initiative_bonus integer
        constraint combatant_initiative_bonus_check check (initiative_bonus between -20 and 30)
  `;
  yield* sql`
    alter table combatant
      add column initiative_set_by text
        constraint combatant_initiative_set_by_check
        check (initiative_set_by in ('dm', 'player'))
  `;
  yield* sql`update combatant set initiative_set_by = 'dm' where initiative is not null`;
  yield* sql`
    alter table combatant
      add constraint combatant_initiative_set_by_follows
        check ((initiative is null) = (initiative_set_by is null))
  `;
});
