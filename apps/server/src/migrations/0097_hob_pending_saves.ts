import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * A save a kept Hob turn could not roll, waiting on the DM.
 *
 * Hob never rolls for a player, so when a monster's save-for-damage catches a
 * party member (or a monster whose stat block writes no save) the keep rolls
 * the damage once and leaves one row here per such target: the DC and ability,
 * the source's success word, the damage it rolled and its types, and who it
 * is for. The DM enters the total from the runner's card and the server
 * resolves it: full or half (or none) through the damage statement, stamped
 * with the turn the save belongs to (`repo/NpcTurns.ts`).
 *
 * A row is pending, resolved (`total`, `succeeded`, `resolved_at` together) or
 * lapsed: the fight ended with it outstanding, or its turn was undone, and no
 * damage was ever applied for it. It goes with its turn, and so with its run.
 * A target removed from the fight keeps its name here and loses its pointer,
 * which lapses nothing by itself but cannot be resolved.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table hob_pending_save (
      id                     uuid primary key default gen_random_uuid(),
      hob_npc_turn_id        uuid not null references hob_npc_turn (id) on delete cascade,
      encounter_run_id       uuid not null references encounter_run (id) on delete cascade,
      combatant_id           uuid,
      target_name            text not null,
      option_name            text not null,
      ability                text not null,
      dc                     integer not null check (dc between 0 and 40),
      on_success             text not null,
      amount                 integer not null check (amount >= 0),
      damage_types           text[] not null default '{}',
      total                  integer,
      succeeded              boolean,
      resolved_at            timestamptz,
      resolved_by_account_id uuid references account (id) on delete set null,
      lapsed_at              timestamptz,
      created_at             timestamptz not null default now(),
      updated_at             timestamptz not null default now(),
      constraint hob_pending_save_combatant_fkey
        foreign key (combatant_id, encounter_run_id) references combatant (id, encounter_run_id)
        on delete set null (combatant_id),
      constraint hob_pending_save_resolved_whole
        check ((resolved_at is null) = (total is null) and (total is null) = (succeeded is null)),
      constraint hob_pending_save_one_end
        check (resolved_at is null or lapsed_at is null)
    )
  `;
  yield* sql`create index hob_pending_save_turn_idx on hob_pending_save (hob_npc_turn_id)`;
  yield* sql`
    create index hob_pending_save_open_idx on hob_pending_save (encounter_run_id)
      where resolved_at is null and lapsed_at is null
  `;
});
