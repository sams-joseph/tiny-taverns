import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * A monster's turn Hob proposed, **kept**: the DM said yes on the runner and
 * the server carried it out (`repo/NpcTurns.ts`).
 *
 * `hob_npc_turn` is the record of one kept turn: the assistant turn whose
 * proposal it carried out (one each, so a double-tapped keep cannot make two),
 * the combatant who acted, and `outcome`, what came of it (`NpcTurnOutcome`):
 * each die, each hit and save, who dropped, and what was left to the DM. It
 * goes with its run, as the run's other live rows do.
 *
 * `hob_npc_turn_row` is a snapshot of every combatant the turn touched, the
 * columns the turn can move as they stood before it and after it, so an undo
 * can put back exactly what the turn changed and refuse when something has
 * moved since. A combatant removed from the fight keeps its name here and
 * loses its pointer.
 *
 * The rolls and log lines the keep writes carry `origin = 'assistant'` and the
 * turn through the provenance columns `character_roll` (`0034`) and
 * `session_event` (`0005`) already have. A monster target's saving throw is a
 * roll of the new kind `save`; the turn's narration is the new `hob-turn-kept`
 * line, written at the acting creature's visibility.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table hob_npc_turn (
      id                   uuid primary key default gen_random_uuid(),
      session_id           uuid not null references session (id) on delete cascade,
      encounter_run_id     uuid not null,
      assistant_turn_id    uuid not null,
      combatant_id         uuid,
      outcome              jsonb not null,
      undone_at            timestamptz,
      undone_by_account_id uuid references account (id) on delete set null,
      created_at           timestamptz not null default now(),
      updated_at           timestamptz not null default now(),
      constraint hob_npc_turn_run_session_fkey
        foreign key (encounter_run_id, session_id) references encounter_run (id, session_id)
        on delete cascade,
      constraint hob_npc_turn_combatant_fkey
        foreign key (combatant_id, encounter_run_id) references combatant (id, encounter_run_id)
        on delete set null (combatant_id),
      constraint hob_npc_turn_turn_fkey
        foreign key (assistant_turn_id) references assistant_turn (id)
        deferrable initially deferred,
      constraint hob_npc_turn_one_per_proposal unique (assistant_turn_id)
    )
  `;
  yield* sql`create index hob_npc_turn_run_created_idx on hob_npc_turn (encounter_run_id, created_at desc, id desc)`;

  yield* sql`
    create table hob_npc_turn_row (
      id               uuid primary key default gen_random_uuid(),
      hob_npc_turn_id  uuid not null references hob_npc_turn (id) on delete cascade,
      combatant_id     uuid references combatant (id) on delete set null,
      combatant_name   text not null,
      before           jsonb not null,
      after            jsonb not null
    )
  `;
  yield* sql`create index hob_npc_turn_row_turn_idx on hob_npc_turn_row (hob_npc_turn_id)`;
  yield* sql`create index hob_npc_turn_row_combatant_idx on hob_npc_turn_row (combatant_id) where combatant_id is not null`;

  yield* sql`alter table character_roll drop constraint character_roll_kind_check`;
  yield* sql`
    alter table character_roll
      add constraint character_roll_kind_check
        check (kind in ('attack', 'damage', 'save', 'death-save', 'concentration', 'plain'))
  `;

  yield* sql`alter table session_event drop constraint session_event_kind_check`;
  yield* sql`
    alter table session_event
      add constraint session_event_kind_check check (kind in (
        'run-started', 'run-updated', 'run-ended', 'run-carried', 'run-resumed',
        'run-escalated',
        'combatant-added', 'combatant-updated', 'combatant-removed',
        'combatant-damaged', 'combatant-moved', 'turn-advanced', 'death-save',
        'beat-added', 'character-updated', 'roll-made',
        'hob-resource-spent', 'hob-resource-undone', 'hob-turn-kept',
        'scene-updated', 'check-logged', 'check-removed',
        'board-fog-updated', 'board-area-updated'
      ))
  `;
});
