import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * The DM explores a level visit (`0113_level_visits.ts`): moves the party's
 * tokens, opens doors, lights lights, reveals secrets and paints fog on the
 * visit's copy, with no fight on it. What those writes need of the schema.
 *
 * ### `entry` — where the party comes in
 *
 * A region kind of its own: the squares a visit stands the party on when it
 * is opened (`LevelVisits.open`), falling back to the left edge on a level
 * with none. It is the DM's overlay and has no rule of its own: nothing in
 * the geometry reads it, so it changes no move and no sight, a fight on the
 * level ignores it, and a seated player's read never sends it
 * (`playerLevelColumn`). It is never secret, since a secret is something
 * the table can be shown and an entry is not. `level_region_kind_check` is
 * the one kind check: a fight's copy (`encounter_run_region`, `0109`) and a
 * visit's (`level_visit_region`, `0113`) carry what the level held and have
 * none to widen.
 *
 * ### `session_event.level_visit_id` — a visit's lines in the night's log
 *
 * A visit outlives nights, so its writes are logged on whichever night is
 * open (the campaign's current session, started and not ended), and with
 * none open a visit write appends nothing and rings nothing, as a character
 * edit with no night appends nothing (`0014`). The pointer is `on delete set
 * null`: the log is never deleted with what it describes, and *Reset level*
 * leaves the lines as history with the pointer gone, as a deleted run does.
 * That the night is the visit's campaign's is the writer's (both are read
 * off the same campaign row). `(level_visit_id, seq)` is the DM's visit
 * stream's cursor, as `(encounter_run_id, seq)` is a fight's.
 *
 * The `visit-*` kinds are its lines, each the DM's own in this phase.
 *
 * ### `level_visit_request` — a visit write is idempotent with no night
 *
 * A live write's `requestId` is recorded on its log line, and a repeat is
 * answered from the ledger that line keeps (`session_event_request_id_key`).
 * A visit write with no night open writes no line, so a visit keeps a ledger
 * of its own: one row per request applied, `on delete cascade` with the
 * visit. The write inserts its row first, `on conflict do nothing`, so a
 * repeat finds the row and changes nothing, and two sends that race wait on
 * the key for the first to commit.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table level_region drop constraint level_region_kind_check`;
  yield* sql`
    alter table level_region
      add constraint level_region_kind_check check (kind in (
        'difficult', 'magicalDarkness', 'heavyObscurement', 'hazard', 'trap', 'entry'
      )),
      add constraint level_region_entry_not_secret check (kind <> 'entry' or not secret)
  `;

  yield* sql`
    alter table session_event
      add column level_visit_id uuid references level_visit (id) on delete set null
  `;
  yield* sql`
    create index session_event_level_visit_seq_idx on session_event (level_visit_id, seq)
      where level_visit_id is not null
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
        'hob-resource-spent', 'hob-resource-undone', 'hob-turn-kept', 'hob-turn-undone',
        'scene-updated', 'check-logged', 'check-removed',
        'board-fog-updated', 'board-area-updated',
        'board-door-updated', 'board-light-updated', 'board-vision-updated',
        'board-region-updated',
        'party-moved',
        'visit-opened', 'visit-tabled', 'visit-token-moved', 'visit-door-updated',
        'visit-light-updated', 'visit-region-updated', 'visit-fog-updated',
        'visit-vision-updated'
      ))
  `;

  yield* sql`
    create table level_visit_request (
      visit_id    uuid not null references level_visit (id) on delete cascade,
      request_id  text not null
                    constraint level_visit_request_id_shape
                    check (char_length(request_id) between 1 and 128),
      created_at  timestamptz not null default now(),
      primary key (visit_id, request_id)
    )
  `;
});
