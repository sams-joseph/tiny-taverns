import { Schema } from "effect";

/**
 * Hob: the assistant, on the wire.
 *
 * **Hob gets tools, not a context blob**, and that is the one architectural
 * rule this whole surface exists to keep. Nothing on this page carries campaign
 * material into the model: `HobAsk` is the thread the DM typed and nothing
 * else, and every fact in an answer arrives through a tool call that is an
 * ordinary actor-scoped repository read — the same call the HTTP API makes.
 * Because those reads require `CurrentActor` at the type level, Hob cannot
 * reach outside the campaign in the path or above the role in the credential,
 * and that is enforced by the compiler rather than by a sentence in a prompt.
 *
 * A pre-assembled context blob would be a *second* data path with its own
 * filtering, which is precisely the retrofit every decision in this repo has
 * been avoiding. See `apps/server/src/assistant/` for the toolkit.
 *
 * ### Unconfigured is a supported mode, not a broken one
 *
 * Exactly like hosted sign-in (`IdentityProvider.disabled`): with no model
 * endpoint configured the server starts, the suite passes, and `status`
 * answers `available: false`. The panel then renders the line it already
 * renders — *nothing is behind this panel* — instead of a composer that
 * swallows a question. `ask` in that state is a declared `HobUnavailable`, not
 * a stack trace.
 */

/**
 * Whether anything is behind the panel, and what.
 *
 * `model` is the configured model id and is `null` whenever `available` is
 * false. It is not decoration: a DM who has pointed the server at a local
 * server wants to see *which* model answered, and it is the one line that
 * distinguishes "no endpoint configured" from "configured, pointed at the
 * wrong model".
 */
export class HobStatus extends Schema.Class<HobStatus>("HobStatus")({
  available: Schema.Boolean,
  model: Schema.NullOr(Schema.String),
  /**
   * The campaign Hob is bound to, by name.
   *
   * Here because the panel draws a *"Knows"* strip and the strip must be true:
   * it is the one thing Hob can say it knows without asking, and the endpoint
   * has already read the row to authorise the request. Everything else the
   * delivered strip shows — the party, the fight on the table — would be a
   * second data path for a decoration, which is the whole thing this surface
   * refuses.
   */
  campaign: Schema.String,
}) {}

/**
 * Who said a line — the panel's own vocabulary, not the model provider's.
 *
 * `hob` rather than `assistant` because that is what `HobTurn` in `apps/web`
 * already calls it, and mapping to a provider's role names is one `switch` in
 * the one file that talks to a provider.
 */
export const HobWho = Schema.Literals(["user", "hob"]);
export type HobWho = typeof HobWho.Type;

/**
 * One line of the thread. Plain text; artifacts are not built yet.
 *
 * A `Schema.Struct` rather than a `Schema.Class`, like every other request
 * payload here — a class's `Type` is the *instance*, so a client passing a
 * plain object would fail the declaration check locally and never reach the
 * network. Response schemas are classes; payload schemas are structs.
 */
export const HobMessage = Schema.Struct({
  who: HobWho,
  text: Schema.String.check(Schema.isLengthBetween(1, 4000)),
});
export type HobMessage = typeof HobMessage.Type;

/**
 * A question, with the thread it belongs to.
 *
 * **The client sends the thread; the server stores none of it.** There is no
 * `assistant_turn` table yet and this is why: that column exists so a *saved*
 * row can point at the turn that produced it, and nothing writes an
 * `origin: "assistant"` row until the accept path ships. A turn table with no
 * row pointing at it is a table with no reader, and the captain's decision is
 * that nothing enters the campaign without an explicit accept — so an unkept
 * answer is not a row, exactly as an unkept Chronicle draft is not one.
 *
 * The bound on `messages` is a real limit rather than a formality: a local
 * model has a context window measured in thousands of tokens, and forty turns
 * of prose plus a tool result already crowds it.
 */
export const HobAsk = Schema.Struct({
  /** Oldest first, ending with the question just asked. */
  messages: Schema.Array(HobMessage).check(Schema.isLengthBetween(1, 40)),
});
export type HobAsk = typeof HobAsk.Type;

/** A slice of the answer, as it is generated. */
export class HobDelta extends Schema.Class<HobDelta>("HobDelta")({
  text: Schema.String,
}) {}

/** Whether Hob has asked a tool for something, or heard back. */
export const HobToolPhase = Schema.Literals(["called", "answered"]);
export type HobToolPhase = typeof HobToolPhase.Type;

/**
 * Hob reaching for the record.
 *
 * On the wire because it is the honest account of where an answer came from:
 * a DM who is told the ferryman is called Cazril should be able to see that it
 * was read out of their own notes rather than invented. It is also the only
 * thing that makes a slow first token legible — a local model spends its first
 * seconds deciding to search.
 *
 * `detail` is a short, already-rendered line ("ferryman", "3 results"), not a
 * payload. The tool's parameters and result belong to the model; restating
 * them here would make a client branch on a shape that is the toolkit's to
 * change.
 */
export class HobToolStep extends Schema.Class<HobToolStep>("HobToolStep")({
  /** The tool's name, as the toolkit declares it — `searchCampaign`. */
  name: Schema.String,
  phase: HobToolPhase,
  detail: Schema.String,
}) {}

/** The answer is complete. `reason` is the provider's finish reason. */
export class HobDone extends Schema.Class<HobDone>("HobDone")({
  reason: Schema.String,
}) {}

/**
 * Generation failed part-way.
 *
 * An event inside a 200 rather than a status, because by the time this can
 * happen the response has already begun — the *authorization* answer is a real
 * 404 before a single byte of stream, exactly as `live.events` arranges it.
 */
export class HobFailure extends Schema.Class<HobFailure>("HobFailure")({
  message: Schema.String,
}) {}

/**
 * The answer, as SSE.
 *
 * `events` mode rather than `data` mode, for the reason `LiveEvent` records:
 * `data` mode fixes the event name to `message`, and the name is the
 * discriminant a client branches on.
 *
 * **No `id` line, and none is wanted.** The live log's `id` carries
 * `session_event.seq` so a reconnecting client can resume; an answer is not a
 * log and has no cursor. A dropped Hob stream is re-asked, not resumed — which
 * is also why there are no heartbeats here: the connection lives for one
 * answer, and a tool step is the traffic that proves it is alive.
 */
export const HobEvent = Schema.Union([
  Schema.Struct({
    event: Schema.Literal("delta"),
    data: Schema.fromJsonString(HobDelta),
  }),
  Schema.Struct({
    event: Schema.Literal("tool"),
    data: Schema.fromJsonString(HobToolStep),
  }),
  Schema.Struct({
    event: Schema.Literal("done"),
    data: Schema.fromJsonString(HobDone),
  }),
  Schema.Struct({
    event: Schema.Literal("failed"),
    data: Schema.fromJsonString(HobFailure),
  }),
]);
export type HobEvent = typeof HobEvent.Type;

/**
 * No model endpoint is configured, so there is nothing to ask.
 *
 * A declared error rather than a 500, and 503 rather than 404, because the
 * campaign is fine and the request was well formed — the *server* is missing a
 * part, and saying so is what lets the panel print one honest sentence. It is
 * the wire half of `IdentityProvider.disabled`: an opt-in dependency that is
 * absent must degrade, not break.
 */
export class HobUnavailable extends Schema.ErrorClass<HobUnavailable>("HobUnavailable")(
  {
    _tag: Schema.tag("HobUnavailable"),
    message: Schema.String,
  },
  { httpApiStatus: 503 },
) {}
