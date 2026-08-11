import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Beats: what actually happened at the table.
 *
 * One line of prose about what just happened, filed against the night it
 * happened on. *"The ferryman is called Cazril. He will not take coin, only a
 * name."* No title, no formatting, no reuse — that is the entire feature, and
 * the captain's framing ("a lightweight way for the DM to jot what actually
 * happened during play") is the specification. It closes the gap that makes a
 * recap read as a combat transcript: every `session_event` kind is combat, and
 * the DM's own questions in the fixtures — who is the ferryman, what did the
 * party decide about the crate — have no source that answers them after the
 * night.
 *
 * ### A table of its own, not a kind of `note`
 *
 * Decided by the captain, on the plan's evidence. `notes.list` has no filters,
 * so beats-as-notes would immediately fill the shipped campaign screen's Notes
 * tab and force a change to a surface that has nothing to do with this;
 * `NoteCreate.title` is a non-empty string, so the create contract would become
 * conditional on `kind`; and `note` would end up carrying two container columns
 * (`campaign_id` *and* `session_id`), which is the "two answers to which
 * container is this in" shape this schema refuses for nested tables.
 *
 * **The discipline attached to that decision: if a beat ever grows a title or
 * an attachment, that is the moment to merge it into `note`, because at that
 * point it is one.** Recorded so the eventual convergence is a deliberate step
 * rather than two prose tables drifting apart forever.
 *
 * A new `session_event` kind was ruled out on evidence rather than taste: the
 * log has no update or delete path by design (`0005_live_session.ts`), and a
 * beat jotted in three seconds at a dark table will contain a typo and will
 * need correcting. Appending a correction is a bad answer for the thing that
 * becomes the assistant's memory, and relaxing append-only is worse — the
 * stream is a cursor tail, so a client past `seq 12` would never see an edit
 * to it.
 *
 * A beat's nearest relatives here are `prep_item` (session-scoped, one string,
 * no title) and `session_event` (session-scoped, chronological, references a
 * run) — not `note`, which is campaign-scoped prep written before the night.
 *
 * **No text index yet, deliberately.** Beats are the prose the searchable
 * record will be built from, and the plan's step 4 adds the `tsvector` columns
 * to `note` and `beat` together with the search repository that queries them.
 * A generated column added here would be an index nothing reads.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // No `campaign_id`, like `prep_item` and for the same reason: a child whose
  // copy of "which campaign is this in" disagreed with its parent's would be
  // readable in a campaign it is not part of, and no `WHERE` clause would
  // notice. The read predicate walks beat → session → campaign with the
  // existing `nestedRowReadable` machinery, unchanged.
  //
  // `on delete cascade` from the session, matching `prep_item` and
  // `session_event`. A beat with no night is meaningless — but note the
  // consequence, which is new: once beats exist, deleting a session throws away
  // campaign history rather than just a checklist. `Sessions.remove` says so.
  yield* sql`
    create table beat (
      id                 uuid primary key default gen_random_uuid(),
      session_id         uuid not null references session (id) on delete cascade,
      encounter_run_id   uuid,
      body               text not null,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint beat_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
    )
  `;

  // The fight this beat happened during, when there was one.
  //
  // Composite, and it comes free: `encounter_run` already carries
  // `unique (id, session_id)` from `0005`, so naming both columns makes "a beat
  // on night 12 attached to night 13's fight" unrepresentable. Same trick as
  // `note_encounter_fkey`, and Postgres matches a composite key only when every
  // column is non-null, so a beat jotted with no fight running is simply
  // unconstrained.
  //
  // `on delete set null (encounter_run_id)` — the Postgres 15+ column list,
  // load-bearing exactly as it is on `note.encounter_id`: a bare `set null`
  // would null `session_id` too and hit its not-null. Deleting a fight detaches
  // the beat and keeps the prose, because the DM wrote it.
  yield* sql`
    alter table beat
      add constraint beat_run_fkey
      foreign key (encounter_run_id, session_id) references encounter_run (id, session_id)
      on delete set null (encounter_run_id)
  `;
  yield* sql`create index beat_session_id_idx on beat (session_id)`;
  yield* sql`create index beat_run_id_idx on beat (encounter_run_id) where encounter_run_id is not null`;

  // Jotting a beat rings the existing doorbell and puts a marker at the right
  // `seq`, so a recap can order beats against combat from the log alone and a
  // second surface re-reads. **The prose stays out of the payload**, which is
  // what keeps `payload` non-contractual — the beat itself is a row in `beat`,
  // and this is only a pointer in time to it.
  //
  // A beat jotted with no fight running carries no `encounter_run_id` and so
  // does not reach `/runs/:runId/events`, which filters on it. That is
  // acceptable: the runner is the only streaming surface, and it only exists
  // during a fight.
  yield* sql`alter table session_event drop constraint session_event_kind_check`;
  yield* sql`
    alter table session_event
      add constraint session_event_kind_check check (kind in (
        'run-started', 'run-updated', 'run-ended', 'run-carried', 'run-resumed',
        'combatant-added', 'combatant-updated', 'combatant-removed',
        'combatant-damaged', 'turn-advanced',
        'beat-added'
      ))
  `;
});
