import { Schema } from "effect";
import { Beat } from "./Beat.js";
import { Combatant } from "./Combatant.js";
import { EncounterRun } from "./EncounterRun.js";
import { EncounterRunId, SessionId } from "./Ids.js";
import { Note } from "./Note.js";
import { PrepItem } from "./PrepItem.js";
import { Session } from "./Session.js";

/**
 * The other end of a fight that crossed a night.
 *
 * A carried fight is two `encounter_run` rows — see `EncounterRunResume` and
 * `0007_run_carryover.ts` — and `continuedFrom` is the only thing that says
 * they are one fight. That pointer alone is not enough for a recap to be
 * legible, though: *"resumed from round 4 of session 12"* needs the round the
 * **other** run is on and the number of the night it belongs to, neither of
 * which is on the row holding the pointer.
 *
 * `round` is that other run's round, and it means different things at the two
 * ends because the two runs are in different states. Looking *back*, the
 * predecessor is ended and its round is frozen at the moment the night finished
 * — the round the fight paused on. Looking *forward*, the successor is a fight
 * that may still be going, so its round is where it has got to since.
 */
export class RecapRunLink extends Schema.Class<RecapRunLink>("RecapRunLink")({
  runId: EncounterRunId,
  sessionId: SessionId,
  /** The night that run belongs to, as the DM numbers their nights. */
  sessionNumber: Schema.Int,
  round: Schema.Int,
}) {}

/**
 * One fight, as the recap tells it.
 *
 * Everything about the fight itself is `run` rather than restated here: the
 * name it was fought under, the round it reached, when it started and ended,
 * and — the field the whole carry-over model exists for — `endedReason`, which
 * is what separates *"the DM finished this"* from *"the night finished around
 * it"*. A recap that had to guess between those would report a fight the party
 * is still standing in as concluded.
 *
 * The three states a client renders from `run` and the two links:
 *
 * | run.endedAt | run.endedReason | continuedInto | reads as                      |
 * | ----------- | --------------- | ------------- | ----------------------------- |
 * | null        | `resolved`      | null          | still on the table            |
 * | set         | `resolved`      | null          | fought to a finish            |
 * | set         | `carried`       | null          | paused at round N, waiting    |
 * | set         | `carried`       | set           | paused at round N, picked up  |
 *
 * and `continuedFrom` set is the other half of the last two — *"resumed from
 * round 4"* — read from the night this fight came **into**.
 */
export class RecapFight extends Schema.Class<RecapFight>("RecapFight")({
  run: EncounterRun,
  /**
   * Who was in it when it came off the table, in initiative order.
   *
   * The list is the state at read time, not a replay: a combatant at zero hit
   * points is one who ended the fight down, which is what `hpCurrent` says
   * without a derived flag beside it to disagree with. **Who was removed
   * mid-fight is deliberately not here** — `combatant` rows are really deleted
   * and `session_event.combatant_id` is `on delete set null`, so no shipped
   * source still holds their name. The plan sketched that column; inventing it
   * would mean either reconstructing names from `payload`, which is documented
   * as non-contractual, or a new write. Reading `GET …/log` still shows that
   * somebody left.
   */
  combatants: Schema.Array(Combatant),
  /** The fight this one continues, when it was picked up from an earlier night. */
  continuedFrom: Schema.NullOr(RecapRunLink),
  /** The night that picked this one up, when a later one did. */
  continuedInto: Schema.NullOr(RecapRunLink),
}) {}

/**
 * What happened on the night of session N.
 *
 * **Assembled per read from retained detail, and never written down.** No
 * stored summary, no model call in the read path, nothing that discards the
 * detail it was made from — the captain's standing constraint, because the
 * first time a one-line summary exists is the last time anyone reads the
 * material under it, and this is the assistant's memory. The recap is a *view*
 * over the sources; the sources stay the truth.
 *
 * It draws on **three sources plus one**, which is the captain's decision on
 * where the story comes from:
 *
 * | field      | source              | what it answers                          |
 * | ---------- | ------------------- | ---------------------------------------- |
 * | `session`  | `session`           | which night, and how long it ran          |
 * | `fights`   | `encounter_run`     | what was fought, and how each one ended   |
 * | `beats`    | `beat`              | what actually happened, in the DM's words |
 * | `notes`    | `note`              | the prose that was read out               |
 * | `prepDone` | `prep_item`         | which of the night's questions got answered |
 *
 * The reason it is not just the fights: every `session_event` kind is combat,
 * so a recap assembled from the shipped log reads as a transcript of hit
 * points. *"Who is the ferryman"* and *"what did the party decide about the
 * crate"* are answered by `beats` and by nothing else.
 *
 * **There is no duration field**, though a recap plainly wants one:
 * `session.startedAt` and `session.endedAt` already answer it, and a third
 * number that must agree with two others is a second answer waiting to be
 * wrong. The same reasoning keeps every fight's round count on `run.round`
 * rather than beside it.
 *
 * Two consumers, which is the whole reason this is assembled on the server
 * rather than composed in the client the way `campaign/load.ts` composes a
 * screen: the Chronicle screen is one, and the assistant's `sessionRecap` tool
 * is the other. Composed client-side, the assistant would re-implement it, and
 * the two would answer *"what happened last session"* differently.
 */
export class SessionRecap extends Schema.Class<SessionRecap>("SessionRecap")({
  session: Session,
  /** Oldest first — the order the night was played in. */
  fights: Schema.Array(RecapFight),
  /**
   * Every beat of the night, oldest first and **verbatim**.
   *
   * Quoted, never paraphrased: they are already the DM's own words at the right
   * length, and rewriting them is the one thing that could make a recap worse
   * than the raw material. Each carries its own `encounterRunId`, so a client
   * that wants to file a beat under the fight it happened in can, without the
   * recap deciding that for it.
   */
  beats: Schema.Array(Beat),
  /**
   * The checklist lines that got ticked.
   *
   * *"Pick a name for the ferryman ✓"* is itself a fact about the night — it
   * says a question the DM went in with got answered. The unticked ones are
   * not here: they are what the next night inherits, which is the prep
   * screen's business rather than the record's.
   */
  prepDone: Schema.Array(PrepItem),
  /**
   * The notes attached to an encounter that actually ran tonight.
   *
   * Notes are campaign-scoped prep, mostly written before the night, so *"which
   * ones were part of this night"* needs an answer that is not a guess. This is
   * the structural one: a note hanging off an encounter one of tonight's fights
   * was started from is the read-aloud the DM read out. The alternative —
   * every note created between `startedAt` and `endedAt` — is a heuristic over
   * a timestamp, and it is wrong every time the DM preps at lunchtime or tidies
   * up on Sunday.
   *
   * The cost is stated rather than hidden: a read-aloud improvised from an
   * unattached note is missing, and if recaps read thin in practice the answer
   * is to add the second set **labelled differently**, not to widen this one.
   */
  notes: Schema.Array(Note),
}) {}
