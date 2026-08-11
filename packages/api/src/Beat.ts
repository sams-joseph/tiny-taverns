import { Schema } from "effect";
import { BeatId, EncounterRunId, SessionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * One line of prose about what just happened, filed against the night it
 * happened on.
 *
 * *"The ferryman is called Cazril. He will not take coin, only a name."* /
 * *"They left the crate unopened and buried it under the reeds."* No title, no
 * formatting, no reuse — **that is the entire feature**, and the temptation to
 * grow it into a capture framework should be refused: no templates, no types,
 * no entity extraction, no linking UI.
 *
 * It exists because every `session_event` kind is combat, so a recap assembled
 * from today's sources reads as a transcript of hit points. Beats are what make
 * the record — and the assistant's memory — about the story instead.
 *
 * ### Why not a note, and why not a log line
 *
 * Both settled by the captain, on evidence:
 *
 * |            | `note`                          | `beat`               |
 * | ---------- | ------------------------------- | -------------------- |
 * | written    | before the night, as prep       | during it, as record |
 * | scope      | campaign — reusable             | one session          |
 * | shape      | title + body + kind + attachment| body                 |
 * | read as    | a library                       | a chronology         |
 *
 * A beat is not a note with fewer fields; it is a log line with prose, and its
 * nearest relatives are `PrepItem` and `SessionEvent`. **The discipline that
 * came with the decision: if a beat ever grows a title or an attachment, merge
 * it into `note` at that point, because by then it is one.**
 *
 * And it is not a `SessionEventKind`, because `session_event` has no update or
 * delete path by design — a beat jotted in three seconds at a dark table will
 * need correcting, and appending a correction is a bad answer for the thing
 * that becomes the campaign's memory.
 *
 * There is no `campaignId` here because there is no such column: a beat reaches
 * its campaign through its session, and the read predicate walks the same path
 * rather than trusting a denormalised copy.
 */
export class Beat extends Schema.Class<Beat>("Beat")({
  id: BeatId,
  sessionId: SessionId,
  /**
   * The fight this happened during, if one was on the table — null otherwise,
   * and null again once that fight is deleted.
   *
   * A composite foreign key names the session as well, so a beat on one night
   * cannot attach to another night's fight. **Whether a beat knows which fight
   * it happened in is the one thing a capture design changes in this contract:**
   * captured on the runner it has a run, captured anywhere else it does not and
   * the timestamp carries the ordering.
   */
  encounterRunId: Schema.NullOr(EncounterRunId),
  body: Schema.String,
  /**
   * `dm` by default, like every row in the product, and there is no control on
   * the capture path that could say otherwise — capture must commit in one
   * keystroke. Whether beats are ever shared with players is deferred to the
   * player view; the column existing is what keeps that from being expensive.
   */
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * Long enough for a paragraph the DM types between initiative turns, bounded so
 * a runaway paste is a validation failure rather than a row nothing renders.
 */
const body = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 4000));

export const BeatCreate = Schema.Struct({
  body,
  /** Pass it when a fight is live; the composite key does the containment. */
  encounterRunId: Schema.optional(EncounterRunId),
  visibility: Schema.optional(Visibility),
});
export type BeatCreate = typeof BeatCreate.Type;

/**
 * Correcting one. **This is the argument that decided beats cannot be log
 * lines**, so it is the field that matters most here.
 *
 * There is deliberately no `encounterRunId`: attaching a beat to a fight after
 * the fact is a linking UI, which §3.1 of the plan rules out by name. A beat is
 * jotted where it is jotted.
 */
export const BeatUpdate = Schema.Struct({
  body: Schema.optional(body),
  visibility: Schema.optional(Visibility),
});
export type BeatUpdate = typeof BeatUpdate.Type;
