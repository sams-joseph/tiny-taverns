import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The live half of a character.
 *
 * `0012` gave `character` the shape `creature` has — a row half the product
 * reads and a document half it displays. This is the third group of columns,
 * and it moves the table into different territory: a character is no longer
 * prep data that goes stale when a fight starts, it is **live state**, written
 * every few seconds during play and streamed. The live-versus-durable reasoning
 * that governs `encounter_run` and `combatant` governs this table now and did
 * not before.
 *
 * ### Where a hit point lives
 *
 * **The character owns it. The combatant holds the fight's copy. One
 * transaction writes both.** Neither is derived from the other, and nothing is
 * ever read through the join — `combatant` keeps snapshotting every displayable
 * field, so the invariant that a fight survives its sources being tidied
 * (`0005_live_session.ts:109-113`) is untouched, and a recap of a fight from
 * three months ago still renders that night's numbers rather than today's.
 *
 * The alternative — drop `hp_current` from PC combatants and read through
 * `character_id` — was rejected for those three reasons together, the last of
 * which is disqualifying: the Chronicle is a record.
 *
 * `apps/server/src/repo/vitals.ts` is the one place both copies are written,
 * and the clamp is in SQL so two hits landing together total both.
 *
 * ### `hp_current` is nullable, and null is not zero and not full
 *
 * Null means *nobody has said*. A party that has never been damaged has never
 * needed a current number, and a backfill of `hp_current = hp_max` would be
 * writing a claim — that everyone walked in unhurt — into a column the DM will
 * trust. That is the same refusal `0012` made about parsing old descriptors.
 * So there is no backfill here, and every reader treats null as `hp_max`: it is
 * what a seed starts a combatant from and what a delta counts down from.
 *
 * `temp_hp` is `not null default 0` instead, because "no temporary hit points"
 * is the ordinary state of every character rather than something unsaid.
 *
 * ### The second idempotency index
 *
 * `session_event_request_id_key` (`0005`) is partial on `encounter_run_id is
 * not null`, so it cannot see a repeat of a write that happened outside a
 * fight — and damage outside a fight is exactly what this step adds. The second
 * index below is that index for the other half of the space: keyed on the
 * session, over the rows the first one deliberately excludes. The two are
 * disjoint by construction, so a live write is still covered once and only
 * once.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // The bounds are `combatant`'s, column for column, because these are the two
  // copies of one number and a value legal in one and refused by the other
  // would be a write-through that fails at the second statement.
  yield* sql`
    alter table character
      add column hp_current integer check (hp_current between 0 and 10000),
      add column temp_hp integer not null default 0 check (temp_hp between 0 and 10000),
      add column conditions text[] not null default '{}'
  `;

  // One more kind, dropped and re-added the way `0008` did it — the vocabulary
  // is closed because the runner and the recap branch on it.
  //
  // `character-updated` is a doorbell like every other kind rather than a
  // description: a consumer re-reads the character and never branches on the
  // payload, so one kind covers created, edited, damaged, healed and removed.
  // A character write with **no session open appends nothing at all**, which is
  // the settled decision and not a case anybody forgot.
  yield* sql`alter table session_event drop constraint session_event_kind_check`;
  yield* sql`
    alter table session_event
      add constraint session_event_kind_check check (kind in (
        'run-started', 'run-updated', 'run-ended', 'run-carried', 'run-resumed',
        'combatant-added', 'combatant-updated', 'combatant-removed',
        'combatant-damaged', 'turn-advanced',
        'beat-added', 'character-updated'
      ))
  `;

  // A repeat of an out-of-combat delta, refused the way an in-combat one is.
  //
  // Disjoint from `session_event_request_id_key` on purpose: that one covers
  // the rows with a run, this one covers the rows without. A live mutation
  // checks its own half before applying and this is the backstop for two taps
  // that race past the check together.
  yield* sql`
    create unique index session_event_session_request_id_key
      on session_event (session_id, request_id)
      where request_id is not null and encounter_run_id is null
  `;
});
