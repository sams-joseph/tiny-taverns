import { Schema } from "effect";
import { Beat } from "./Beat.js";
import { Difficulty, Encounter } from "./Encounter.js";
import { AssistantThreadId, AssistantTurnId, CampaignId, CreatureId } from "./Ids.js";
import { Note, NoteKind } from "./Note.js";

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
 * ### The conversation is the server's, and so is the proposal
 *
 * A thread and its turns are rows (`assistant_thread`, `assistant_turn`),
 * campaign-scoped through the ordinary predicates. So `HobAsk` carries **one
 * question and a thread id**, not a transcript: a client cannot forge what was
 * said, a reload does not lose the conversation, and `assistant_turn_id` — inert
 * on every content table since the first migration — finally points at a row.
 *
 * A **proposal is not a row in the campaign.** It is stored on the turn that
 * produced it and rendered for review; `accept` is the only thing that
 * materialises a note, a beat or an encounter, and it writes `origin:
 * "assistant"` with that turn's id. Nothing else in the server ever writes that
 * origin — Hob has no write tool and no `SqlClient`, so "nothing enters the
 * campaign without an explicit human accept" is a property of the wiring rather
 * than a rule someone has to keep. See the captain's decision in
 * `decisions/assistant-generation.md` (option C, *generate with approval*).
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

/** One line of a thread, whoever said it. Bounded so a paste is a 400, not a row. */
const turnText = Schema.String.check(Schema.isLengthBetween(1, 4000));

/**
 * One creature on a proposed roster, resolved.
 *
 * `creatureId` is the half that matters — accepting inserts an
 * `encounter_creature` row pointing at it, through the same reachability check
 * `EncounterCreatures.create` applies to a DM's own roster edit. The other three
 * are the *display* half, resolved out of the bestiary when the proposal was
 * made so the card can be drawn without a second read per line. They are a
 * snapshot in exactly the sense `combatant.display_name` is: a creature renamed
 * between proposing and accepting leaves the card reading what Hob showed, and
 * the accepted roster still points at the row.
 */
export const HobRosterLine = Schema.Struct({
  creatureId: CreatureId,
  count: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99 })),
  name: Schema.String,
  /** As the DM says it — `"1/4"`. See the bestiary notes on `Creature.cr`. */
  cr: Schema.String,
  hp: Schema.Int,
});
export type HobRosterLine = typeof HobRosterLine.Type;

/**
 * What Hob is offering to add to the campaign, if the DM says yes.
 *
 * **Three members, because there are three accept targets**, and each is one
 * shipped table: a `note` (prep prose or read-aloud), a `beat` (the DM's line
 * about what happened), an `encounter` (a template and its roster). The union
 * is discriminated on `target` for the reason `SearchHit` is discriminated on
 * `source` — `roster` exists only on an encounter and `title` only on the thing
 * that has one, and a nullable field the client renders anyway is the failure
 * this schema style exists to prevent.
 *
 * It is deliberately **not** a general artifact framework. The delivered
 * `ChatParts.jsx` draws eight kinds; the ones that are not one of these three
 * have nowhere to go, so proposing one would be a card whose *Save to session*
 * button could only lie.
 */
export const HobProposal = Schema.Union([
  Schema.Struct({
    target: Schema.Literal("note"),
    title: Schema.String,
    body: Schema.String,
    kind: NoteKind,
  }),
  Schema.Struct({
    target: Schema.Literal("beat"),
    body: Schema.String,
  }),
  Schema.Struct({
    target: Schema.Literal("encounter"),
    name: Schema.String,
    difficulty: Schema.NullOr(Difficulty),
    tags: Schema.Array(Schema.String),
    roster: Schema.Array(HobRosterLine),
  }),
]);
export type HobProposal = typeof HobProposal.Type;

/**
 * One conversation, as a row.
 *
 * `title` is the first question, shortened. It is not decoration: a thread is
 * the unit the panel resumes and the unit a future picker would list, and a
 * conversation with no name is one nobody can choose between. There is no
 * picker drawn yet — the panel resumes the newest thread — so this is the one
 * field here that is ahead of a surface, and it costs a `substring`.
 */
export class HobThread extends Schema.Class<HobThread>("HobThread")({
  id: AssistantThreadId,
  campaignId: CampaignId,
  title: Schema.String,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * One line of a persisted conversation.
 *
 * `proposal` is null on every user turn and on most of Hob's — it is set only
 * when Hob offered something, and **its presence is not its acceptance**.
 * `acceptedAt` is the difference between a card the DM is looking at and a row
 * in their campaign, which is the whole safety property: an unkept proposal is
 * a turn with a `proposal` and no `acceptedAt`, and no note, beat or encounter
 * anywhere.
 *
 * There is no `origin` or `visibility` on the wire though the columns exist. A
 * turn's origin is `who` said it, and a conversation is DM-only by the column
 * default; restating either here would be two answers to one question.
 */
export class HobTurn extends Schema.Class<HobTurn>("HobTurn")({
  id: AssistantTurnId,
  threadId: AssistantThreadId,
  who: HobWho,
  text: Schema.String,
  proposal: Schema.NullOr(HobProposal),
  /** When the DM accepted it into the campaign, or null. */
  acceptedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * A question, and the conversation it belongs to.
 *
 * **The thread is a row, so the client sends an id rather than a transcript.**
 * That is the fix for the gap this replaced: the old payload carried every
 * message, which meant a reload lost the conversation, a client could rewrite
 * what it had been told, and there was nothing for `assistant_turn_id` to point
 * at. The server reads the thread it owns, appends the question, and appends the
 * answer when it has one.
 *
 * `threadId` absent starts a new thread — which is what the panel's *New thread*
 * button does, and what a first question does.
 */
export const HobAsk = Schema.Struct({
  threadId: Schema.optional(AssistantThreadId),
  text: turnText,
});
export type HobAsk = typeof HobAsk.Type;

/**
 * The thread and the turn this answer is being written into, said first.
 *
 * Emitted before the model is called at all, because the client needs both ids
 * before it needs a word of the answer: the thread id is what the *next*
 * question continues, and the turn id is what an accept names. Sending them at
 * the end would mean a dropped connection loses the thread the question was
 * already saved to.
 */
export class HobBegun extends Schema.Class<HobBegun>("HobBegun")({
  threadId: AssistantThreadId,
  /** The turn Hob's answer will be saved as, and the one an accept names. */
  turnId: AssistantTurnId,
}) {}

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

/**
 * Hob has proposed something, and it is saved on the turn named here.
 *
 * The turn id is repeated rather than assumed from `began`, because it is the
 * id an accept has to name and a client should not have to remember which of
 * two events carried it.
 */
export class HobProposed extends Schema.Class<HobProposed>("HobProposed")({
  turnId: AssistantTurnId,
  proposal: HobProposal,
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
    event: Schema.Literal("began"),
    data: Schema.fromJsonString(HobBegun),
  }),
  Schema.Struct({
    event: Schema.Literal("delta"),
    data: Schema.fromJsonString(HobDelta),
  }),
  Schema.Struct({
    event: Schema.Literal("tool"),
    data: Schema.fromJsonString(HobToolStep),
  }),
  /**
   * Hob has something to offer. Sent once the answer is written, so the card
   * arrives with the sentence that introduces it rather than ahead of it.
   */
  Schema.Struct({
    event: Schema.Literal("proposal"),
    data: Schema.fromJsonString(HobProposed),
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
 * What accepting a proposal produced.
 *
 * The whole row, not an id: the client has just changed the campaign and the
 * cheapest honest thing to hand back is the thing it made — carrying its
 * `origin: "assistant"` and the `assistantTurnId` that answers where it came
 * from. Discriminated on `accepted` for the same reason `HobProposal` is on
 * `target`.
 */
export const HobAccepted = Schema.Union([
  Schema.Struct({ accepted: Schema.Literal("note"), note: Note }),
  Schema.Struct({ accepted: Schema.Literal("beat"), beat: Beat }),
  Schema.Struct({ accepted: Schema.Literal("encounter"), encounter: Encounter }),
]);
export type HobAccepted = typeof HobAccepted.Type;

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
