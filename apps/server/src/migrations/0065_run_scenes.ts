import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A run is played by its encounter's kind, and a scene keeps its own state.
 *
 * ### `encounter_run.mode`
 *
 * Combat, social, challenge or hazard: the encounter's kind, snapshotted by
 * `start` for the reason `encounter_name` is — a later edit to the template
 * must not change a scene already on the table. `resume` copies it; `escalate`
 * turns a conversation into a fight and is the only thing that ever changes
 * it. Every run on file was played as a fight, whatever its encounter's kind,
 * because a fight was all the runner could play; `combat` is the backfill and
 * the truth.
 *
 * ### `encounter_run_scene` — one per run, the creator's alone
 *
 * The beats (the encounter's tactic lines, each tickable), a snapshot of the
 * skill challenge's or the hazard's numbers, the DM's note on the NPC's
 * attitude, and a hazard's stages. All of it is copied from, or sits beside,
 * `encounter_prep`, which is the creator's alone; so this is too.
 *
 * **Its own table rather than columns on `encounter_run`**, which a player's
 * recap and table read (`runColumns`): `0058_encounter_run_boards.ts`'s reason,
 * one table over. On its own table no player read touches it. Like the board,
 * `start` and `resume` insert it, and every run already on file gets an empty
 * one here — nothing invented, since none of those runs was played as a scene.
 *
 * `stage` lies within `stages`, structurally: a hazard cannot be in its fourth
 * hour of three.
 *
 * ### `encounter_run_check` — the log of checks and saves
 *
 * Who made it (`combatant_id`, composite to the run so it can only name a
 * combatant *in this run*; `set null (combatant_id)` so removing the combatant
 * keeps the line, named by `display_name`), a skill or a save's ability —
 * exactly one — the total and the DC when there were numbers, the outcome, and
 * for a hazard the stage it was made in. One save per combatant per stage
 * (`encounter_run_check_one_per_stage`); a wrong one is removed, not doubled.
 * `request_id` makes a double-tapped *Log check* one row.
 *
 * A real delete removes a check logged by mistake — the log of what the DM
 * *did* is `session_event`, which keeps `check-removed`.
 *
 * Neither table is campaign content: the creator proof decides who reads them
 * and their provenance is their run's. Both are in `NOT_CONTENT`
 * (`schema.test.ts`).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table encounter_run
      add column mode text not null default 'combat'
        constraint encounter_run_mode_known
        check (mode in ('combat', 'social', 'challenge', 'hazard'))
  `;

  yield* sql`
    create table encounter_run_scene (
      run_id            uuid primary key references encounter_run (id) on delete cascade,
      beats             jsonb not null default '[]'::jsonb
                          constraint encounter_run_scene_beats_shape
                          check (jsonb_typeof(beats) = 'array'),
      challenge         jsonb
                          constraint encounter_run_scene_challenge_shape
                          check (challenge is null
                                 or (jsonb_typeof(challenge) = 'object'
                                     and challenge ->> 'kind' in ('challenge', 'hazard'))),
      attitude          text
                          constraint encounter_run_scene_attitude_known
                          check (attitude in ('hostile', 'indifferent', 'friendly')),
      stages            integer
                          constraint encounter_run_scene_stages_range
                          check (stages between 1 and 100),
      stage             integer,
      created_at        timestamptz not null default now(),
      updated_at        timestamptz not null default now(),
      constraint encounter_run_scene_stage_within
        check (stage is null or (stages is not null and stage between 1 and stages))
    )
  `;

  yield* sql`insert into encounter_run_scene (run_id) select encounter_run.id from encounter_run`;

  yield* sql`
    create table encounter_run_check (
      id                uuid primary key default gen_random_uuid(),
      encounter_run_id  uuid not null references encounter_run (id) on delete cascade,
      combatant_id      uuid,
      display_name      text not null,
      skill             text
                          constraint encounter_run_check_skill_shape
                          check (btrim(skill) <> '' and char_length(skill) <= 40),
      save_ability      text
                          constraint encounter_run_check_save_known
                          check (save_ability in ('STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA')),
      total             integer,
      dc                integer check (dc between 1 and 30),
      outcome           text not null check (outcome in ('success', 'failure')),
      stage             integer check (stage >= 1),
      request_id        text,
      created_at        timestamptz not null default now(),
      constraint encounter_run_check_skill_or_save check (num_nonnulls(skill, save_ability) = 1),
      constraint encounter_run_check_combatant_fkey
        foreign key (combatant_id, encounter_run_id) references combatant (id, encounter_run_id)
        on delete set null (combatant_id)
    )
  `;
  yield* sql`
    create index encounter_run_check_run on encounter_run_check (encounter_run_id, created_at, id)
  `;
  yield* sql`
    create index encounter_run_check_combatant on encounter_run_check (combatant_id)
      where combatant_id is not null
  `;
  yield* sql`
    create unique index encounter_run_check_one_per_stage
      on encounter_run_check (encounter_run_id, combatant_id, stage)
      where stage is not null and combatant_id is not null
  `;
  yield* sql`
    create unique index encounter_run_check_request_id_key
      on encounter_run_check (encounter_run_id, request_id)
      where request_id is not null
  `;

  yield* sql`alter table session_event drop constraint session_event_kind_check`;
  yield* sql`
    alter table session_event
      add constraint session_event_kind_check check (kind in (
        'run-started', 'run-updated', 'run-ended', 'run-carried', 'run-resumed',
        'run-escalated',
        'combatant-added', 'combatant-updated', 'combatant-removed',
        'combatant-damaged', 'combatant-moved', 'turn-advanced',
        'beat-added', 'character-updated', 'roll-made',
        'hob-resource-spent', 'hob-resource-undone',
        'scene-updated', 'check-logged', 'check-removed'
      ))
  `;
});
