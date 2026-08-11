import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A fight can carry across nights.
 *
 * Settled by the captain: a session may end with an encounter still on the
 * table, and that fight continues into the next night. It reverses the
 * placeholder in `apps/web/src/session/finish.ts`, which refused the whole
 * situation and said in its own doc comment that the refusal was standing in
 * for this answer.
 *
 * **A carried fight is a second `encounter_run` row, not a reparented one.**
 * The predecessor is taken off the table with `ended_at` set and
 * `ended_reason = 'carried'`; the successor is created under the next session,
 * seeded by copying the predecessor's combatants, round, marker and visibility,
 * and linked back through `continued_from`. Four reasons, none of them taste:
 *
 * - `0005_live_session.ts` already says so in writing — "'a fight interrupted
 *   and resumed' (§1.4) is a second row here rather than an exception to this" —
 *   and so does the architecture report. Reparenting would contradict two
 *   written decisions with no new evidence.
 * - `ended_at` already means "off the table", not "resolved" (`EncounterRuns.end`
 *   is documented as *take the fight off the table*). Pausing at midnight **is**
 *   taking it off the table; only the *reason* is new.
 * - A reparented row would lie about which night it is. Its own `run-started`
 *   event stays filed under the old session while the row claims the new one,
 *   and `started_at` still holds the old night. The log is the assistant's
 *   memory, so "when was this fight?" would have two answers.
 * - `encounter_run` has no `campaign_id` (correctly — nested tables do not
 *   denormalise one), so nothing in the schema would refuse
 *   `update encounter_run set session_id = <another campaign's session>`.
 *   Under the second-run model the successor is an ordinary insert under the
 *   session in the path, guarded exactly like every other run.
 *
 * ### What this does to the two guarantees it reaches
 *
 * Both were re-examined against a run that outlives its session, and **neither
 * weakens**:
 *
 * - **`encounter_run_one_live_per_session`** (`0005`) is untouched and still
 *   exactly right. A carried run has `ended_at` set, so the night it was carried
 *   out of holds no live run, and the successor is the next night's single live
 *   one. The index goes on doing its one job: at most one candidate for
 *   `session.active_encounter_run_id`. (Under reparenting it *would* have needed
 *   re-examination — moving a live run into a session that already has one
 *   raises a raw unique violation the repository would have to translate.)
 * - **`campaign_current_session_id_fkey`** (`0006`) is untouched and not
 *   reopened. It constrains `campaign ↔ session`; a carried run is a
 *   `session ↔ encounter_run` question. A finished night with a carried fight is
 *   still finished and still cannot be current.
 *
 * What *does* move is the finish transition, and it moves **onto the server**:
 * `repo/Sessions.ts` now carries the live run in the same transaction that
 * stamps `ended_at`, beside `releaseIfFinished`. For the same reason that one
 * lives there — a client that forgets recreates the bug, and a second client
 * never sees it happen.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // The link back to the fight this one continues.
  //
  // **A provenance pointer, never an access path** — the same status as
  // `creature.derived_from` and `combatant.character_id`. Nothing is ever read
  // *through* it, so it surviving its ancestor's deletion as `null` costs
  // nothing.
  //
  // It cannot be a composite key, and the reason is worth writing down because
  // the trick works everywhere else in this schema: both ends are
  // `encounter_run`, and the only column they share to widen a key with is
  // `session_id` — which would force predecessor and successor into the *same*
  // session, the exact opposite of what this is for. Containment is therefore
  // enforced in `EncounterRuns.resume`, against `containedRowReadableById` —
  // the same predicate a read of that run would apply. Same shape as
  // `encounter_creature.creature_id`, for the same kind of reason.
  yield* sql`
    alter table encounter_run
      add column continued_from uuid references encounter_run (id) on delete set null
  `;

  // Why the fight came off the table.
  //
  // Not inferable, and that is the whole argument for the column: without it
  // every ended run looks resumable, and a recap would report a fight the party
  // is still standing in as concluded. `resolved` is the DM ending a fight on
  // purpose; `carried` is a night that finished over it.
  yield* sql`
    alter table encounter_run
      add column ended_reason text not null default 'resolved'
        check (ended_reason in ('resolved', 'carried'))
  `;
  // A live fight has no reason yet. `resolved` is the default rather than a
  // third "still running" value because it is what an ended run means with
  // nothing said about it, which is what every row already on disk is.
  yield* sql`
    alter table encounter_run
      add constraint encounter_run_reason_needs_end
      check (ended_reason = 'resolved' or ended_at is not null)
  `;

  // One fight, one continuation. Two nights both claiming to continue the same
  // fight is the state that would make "where did this go?" have two answers,
  // and a partial unique index refuses it against `psql` and against two
  // clients racing, not merely against the endpoint.
  yield* sql`
    create unique index encounter_run_one_successor
      on encounter_run (continued_from) where continued_from is not null
  `;
  // "Is there a fight waiting?" — a carried run with no successor yet, in this
  // campaign's sessions. One indexed query rather than a scan of every run.
  yield* sql`
    create index encounter_run_carried_idx
      on encounter_run (session_id) where ended_reason = 'carried'
  `;

  // Two new kinds, and they are kinds rather than a flag inside `run-ended`'s
  // payload for one reason: `SessionEvent.payload` is documented as "the
  // human-legible remainder … not a contract anything branches on", and a recap
  // that had to distinguish a paused fight from a finished one would be the
  // first thing to branch on it.
  //
  // `run-ended` keeps its meaning — the DM ended this fight on purpose.
  yield* sql`alter table session_event drop constraint session_event_kind_check`;
  yield* sql`
    alter table session_event
      add constraint session_event_kind_check check (kind in (
        'run-started', 'run-updated', 'run-ended', 'run-carried', 'run-resumed',
        'combatant-added', 'combatant-updated', 'combatant-removed',
        'combatant-damaged', 'turn-advanced'
      ))
  `;
});
