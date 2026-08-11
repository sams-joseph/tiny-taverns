import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A finished session cannot be a campaign's current session.
 *
 * §1.4 of the architecture calls the session lifecycle planned → running →
 * ended, and says ending "freezes `ended_at` **and clears
 * `campaign.current_session_id`**". Only the first half shipped: the client
 * stamped the end time, nothing moved the pointer, and the campaign screen —
 * which resolves the night it is preparing *from that pointer* — went on
 * loading the finished session forever. `StartRunDialog` invents a new session
 * only when there is not one, so the DM was locked into a night that was
 * already over with no way to start the next.
 *
 * The transition itself belongs to `repo/Sessions.ts`, which clears the pointer
 * in the same transaction that stamps the end. This file is what makes the bad
 * state **unrepresentable** rather than merely unwritten, so a second client, a
 * future endpoint or a hand-typed `psql` cannot recreate it.
 *
 * It is the `note_encounter_fkey` trick from `0003_prep_surface.ts` applied to a
 * predicate instead of to a container: widen both ends of the existing foreign
 * key with a column whose value encodes the thing that must be true, and let
 * the key refuse the combination that must not exist. `session.is_open` is
 * `ended_at is null`; the campaign's side is a constant `true` whenever it
 * points anywhere at all. So `(current_session_id, true)` has no row to match
 * the moment the session ends.
 *
 * Both columns are `generated always as … stored`, which is what keeps this
 * honest — there is no second copy of the answer for anyone to update wrongly,
 * and no writer can set them at all.
 *
 * **`deferrable initially deferred`, for the same reason
 * `encounter_creature.creature_id` is** (see `0004_bestiary.ts`): ending a
 * session and clearing the pointer are two statements, and neither order is
 * legal if the check fires immediately. Deferring lets the transaction settle
 * before it is judged. Under autocommit that is still the end of the single
 * statement, so a lone `update session set ended_at = …` on a current session
 * is refused on the spot rather than being a surprise at some later commit.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Campaigns already stuck on a finished session — the shipped defect, on
  // every database that has run one night to its end. The constraint below
  // cannot be added while one of these exists, and repairing them is exactly
  // what the fix would have done had it been there at the time.
  yield* sql`
    update campaign set current_session_id = null, updated_at = now()
    where current_session_id in (select id from session where ended_at is not null)
  `;

  yield* sql`
    alter table session
      add column is_open boolean generated always as (ended_at is null) stored
  `;
  // The referenced key. `id` alone is still the primary key, so this adds a
  // target for the wider foreign key without weakening anything.
  yield* sql`alter table session add constraint session_open_key unique (id, is_open)`;

  // `true` exactly when the campaign points at something. Null otherwise, which
  // is what leaves an unset pointer unconstrained: a MATCH SIMPLE foreign key
  // is not enforced when any of its columns is null, so "no current session"
  // needs no special case here — the same way an unattached note escapes
  // `note_encounter_fkey`.
  yield* sql`
    alter table campaign
      add column current_session_is_open boolean generated always as (
        case when current_session_id is null then null else true end
      ) stored
  `;

  yield* sql`alter table campaign drop constraint campaign_current_session_id_fkey`;
  // The `on delete set null` of the old key is gone, and it could not be kept:
  // Postgres refuses that action on a key containing a generated column. So
  // deleting a session that is current is now refused rather than silently
  // detaching, and `Sessions.remove` clears the pointer first — one more place
  // that says out loud what used to happen invisibly. A `delete from campaign`
  // is unaffected: it cascades into `session`, and by the end of the statement
  // the referencing row is gone too.
  yield* sql`
    alter table campaign
      add constraint campaign_current_session_id_fkey
      foreign key (current_session_id, current_session_is_open)
      references session (id, is_open)
      deferrable initially deferred
  `;
});
