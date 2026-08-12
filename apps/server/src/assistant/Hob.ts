import {
  type Campaign,
  type CampaignId,
  CurrentActor,
  type HobAsk,
  HobDelta,
  HobDone,
  type HobEvent,
  HobFailure,
  HobStatus,
  HobToolStep,
  HobUnavailable,
  type NotFound,
} from "@taverns/api";
import {
  Cause,
  Context,
  Effect,
  type Filter,
  Layer,
  Ref,
  Result,
  type Schema,
  Stream,
} from "effect";
import {
  type AiError,
  Chat,
  LanguageModel,
  type Prompt,
  type Response,
  type Toolkit,
} from "effect/unstable/ai";
import { Campaigns } from "../repo/Campaigns.js";
import { Creatures } from "../repo/Creatures.js";
import { Recap } from "../repo/Recap.js";
import { Search } from "../repo/Search.js";
import { SessionEvents } from "../repo/SessionEvents.js";
import { Sessions } from "../repo/Sessions.js";
import { handlersFor, HobToolkit } from "./toolkit.js";

/**
 * Hob answers.
 *
 * The whole of the assistant is this file and `toolkit.ts`: one prompt, one
 * `LanguageModel.streamText` call over the toolkit, and a translation from the
 * package's response parts into the four events `HobEvent` declares. What is
 * *not* here is the interesting part — no SQL, no visibility predicate, no
 * assembled context, and no second answer to what an actor may read.
 *
 * ### Grounding: tools, never a blob
 *
 * The prompt carries the DM's thread and the campaign's own name. It carries no
 * notes, no beats, no recap and no creature — every fact in an answer arrives
 * through a tool call that is an ordinary actor-scoped repository read. That is
 * the architectural rule, and the reason for it is not tidiness: a
 * pre-assembled context blob is a second data path with its own filtering, and
 * the day it disagrees with the predicate is the day the assistant leaks. See
 * `toolkit.ts` for how the campaign is closed over rather than parameterised.
 *
 * ### Two layers, one of which answers nothing
 *
 * `Hob.unavailable` is the shipped default and it mirrors
 * `IdentityProvider.disabled` exactly: with no model endpoint configured the
 * server boots, the suite passes, `status` says `available: false`, and `ask`
 * is a declared `HobUnavailable` rather than a stack trace. That is what keeps
 * the model an opt-in dependency instead of a mandatory one.
 */

export class Hob extends Context.Service<
  Hob,
  {
    /**
     * Whether anything is behind the panel, for one campaign.
     *
     * The campaign is read for the same reason `ask` reads it — it is the
     * authorization gate, so an unreachable one is a `NotFound` rather than a
     * disclosure that the assistant is switched on — and its name goes back in
     * the answer because the panel's context strip must be true.
     */
    readonly status: (campaignId: CampaignId) => Effect.Effect<HobStatus, NotFound, CurrentActor>;
    /**
     * Answer, in pieces.
     *
     * The `Effect` half is where authorization lives — an unreadable campaign
     * is a `NotFound` and an unconfigured server a `HobUnavailable`, both
     * before a byte of stream exists, so a denial is a status and not an event
     * inside a 200. The `Stream` half cannot fail: once the answer has started
     * the only honest report of a mid-flight failure is a `failed` event in the
     * transcript the DM is already reading.
     */
    readonly ask: (
      campaignId: CampaignId,
      ask: HobAsk,
    ) => Effect.Effect<Stream.Stream<HobEvent>, NotFound | HobUnavailable, CurrentActor>;
  }
>()("Hob") {
  /**
   * No model endpoint is configured.
   *
   * It still resolves the campaign, so a request naming someone else's campaign
   * gets the same `NotFound` it would get with a model attached — "the
   * assistant is switched off here" must not be a way to probe which campaigns
   * exist.
   */
  static readonly unavailable: Layer.Layer<Hob, never, Campaigns> = Layer.effect(this)(
    Effect.gen(function* () {
      const campaigns = yield* Campaigns;
      return {
        status: (campaignId) =>
          Effect.map(
            campaigns.findById(campaignId),
            (campaign) => new HobStatus({ available: false, model: null, campaign: campaign.name }),
          ),
        ask: (campaignId) =>
          Effect.andThen(
            campaigns.findById(campaignId),
            Effect.fail(
              new HobUnavailable({
                message:
                  "Hob has no model behind it. Set HOB_API_URL and HOB_MODEL in " +
                  "apps/server/.env.local (see .env.example) and restart the server.",
              }),
            ),
          ),
      };
    }),
  );

  /**
   * Hob with a model behind it.
   *
   * `model` is only carried so `status` can say which one answered; the
   * `LanguageModel` service is already bound to it by the layer that provided
   * it, and this service never chooses a model.
   */
  static readonly layer = (options: {
    readonly model: string;
  }): Layer.Layer<
    Hob,
    never,
    Campaigns | Creatures | LanguageModel.LanguageModel | Recap | Search | SessionEvents | Sessions
  > =>
    Layer.effect(this)(
      Effect.gen(function* () {
        const languageModel = yield* LanguageModel.LanguageModel;
        const campaigns = yield* Campaigns;
        const repositories = {
          search: yield* Search,
          sessions: yield* Sessions,
          recap: yield* Recap,
          creatures: yield* Creatures,
          events: yield* SessionEvents,
        };

        return {
          status: (campaignId) =>
            Effect.map(
              campaigns.findById(campaignId),
              (campaign) =>
                new HobStatus({
                  available: true,
                  model: options.model,
                  campaign: campaign.name,
                }),
            ),

          ask: (campaignId, ask) =>
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // The authorization gate, and the only thing read out of the
              // campaign row: its name, for the prompt. A `NotFound` here is
              // answered as a 404 before the response body opens.
              const campaign = yield* campaigns.findById(campaignId);

              // Bound to *this* campaign and *this* actor, now — the stream
              // below is pulled after this effect has returned, so nothing may
              // be left to the ambient context.
              const handlers = yield* HobToolkit.toHandlers(
                handlersFor(repositories, campaignId, actor),
              );
              const toolkit = yield* Effect.provideContext(HobToolkit, handlers);

              return Stream.unwrap(
                Effect.map(Chat.fromPrompt(promptFor(campaign, ask)), (chat) =>
                  round(chat, toolkit, MAX_ROUNDS),
                ),
              ).pipe(
                Stream.provideService(LanguageModel.LanguageModel, languageModel),
                // A provider that dies mid-answer, a model that returns
                // nonsense the codec rejects: the DM is already reading a
                // half-written reply, so the only useful thing to do is say so
                // in the thread rather than tear the connection down.
                Stream.catchCause((cause) =>
                  Stream.succeed(failure(describe(Cause.squash(cause)))),
                ),
              );
            }),
        };
      }),
    );
}

/**
 * How many provider round-trips one question may cost.
 *
 * **`LanguageModel.streamText` is one round-trip, not an agent loop**, and that
 * is the single most surprising thing about this package: it resolves the tool
 * calls a step asked for and emits their results, and then it stops. The
 * results are never sent back to the model. So a question answered from the
 * record needs at least two — one to ask for a search, one to read what came
 * back and write a sentence — and this loop is what supplies them.
 *
 * Four allows a model to look twice and then answer, which is as much
 * indecision as is worth paying for on a local model. Running out is reported
 * to the DM rather than swallowed: an answer that stops with no prose is a
 * failure, and pretending otherwise is exactly the sort of quiet wrongness this
 * surface must not have.
 */
const MAX_ROUNDS = 4;

type HobTools = Toolkit.Tools<typeof HobToolkit>;

/**
 * One round-trip, plus whatever further rounds its tool calls make necessary.
 *
 * The `Chat` is what carries the conversation across rounds — it appends each
 * step's parts, tool calls and tool results alike, to the history the next
 * round sends. That is bookkeeping worth borrowing rather than repeating.
 *
 * The `finish` part is deliberately withheld from a round that asked for a
 * tool. It genuinely is the end of *that* provider call, but it is not the end
 * of the answer, and a `done` event arriving before the prose would close the
 * turn on a client that trusts it. The framework defers finish parts until
 * every tool handler has completed, so by the time one arrives here the flag
 * below is already accurate.
 */
const round = (
  chat: Chat.Service,
  toolkit: Toolkit.WithHandler<HobTools>,
  budget: number,
): Stream.Stream<HobEvent, AiError.AiError | Schema.SchemaError, LanguageModel.LanguageModel> =>
  Stream.unwrap(
    Effect.map(Ref.make(false), (calledTool) =>
      chat.streamText({ prompt: [], toolkit }).pipe(
        Stream.filterMapEffect((part: Response.StreamPart<HobTools>) =>
          Effect.gen(function* () {
            if (part.type === "tool-call") yield* Ref.set(calledTool, true);
            if (part.type === "finish" && (yield* Ref.get(calledTool))) {
              return budget > 1
                ? Result.fail(part)
                : Result.succeed(
                    failure(
                      "Hob kept looking things up and never got to an answer. Ask again, " +
                        "more narrowly.",
                    ),
                  );
            }
            return toHobEvent(part);
          }),
        ),
        Stream.concat(
          Stream.unwrap(
            Effect.map(Ref.get(calledTool), (used) =>
              used && budget > 1 ? round(chat, toolkit, budget - 1) : Stream.empty,
            ),
          ),
        ),
      ),
    ),
  );

/**
 * What Hob is told about itself, and what it is not.
 *
 * Short on purpose: this ships against locally hosted models, where every
 * sentence of preamble is context a small model spends instead of reading a
 * tool result. The one thing worth the tokens is the instruction not to invent
 * — a hallucinated proper noun in a campaign record is the standing product
 * risk the captain's generation decision names, and recall is exactly where it
 * is cheapest to say so.
 *
 * The campaign's name is here and nothing else from the row. It is a label, not
 * material: it lets Hob say "the Salt Road" instead of "this campaign", and it
 * is already in the request path.
 */
const systemPrompt = (campaign: Campaign): string =>
  [
    "You are Hob, the assistant behind the bar in Tiny Taverns — a tool for the person",
    `running a tabletop roleplaying game. You are helping them run "${campaign.name}".`,
    "",
    "Everything you say about this campaign must come from a tool call. Search before",
    "you answer any question about a person, a place, a thing, a creature, or what",
    "happened at the table. Never invent a name, a fact or a session: if the record",
    "does not say, say that it does not, and offer to look somewhere else.",
    "",
    "Quote the DM's own words when they answer the question — they wrote them and they",
    "are already the right length. Keep replies to a sentence or two unless asked for",
    "more; the DM is usually reading this mid-game.",
    "",
    "You can see this one campaign and only what this credential is allowed to read.",
    "That is not a restriction you can work around, and you should not try.",
  ].join("\n");

const promptFor = (campaign: Campaign, ask: HobAsk): Prompt.RawInput => [
  { role: "system" as const, content: systemPrompt(campaign) },
  ...ask.messages.map((message) => ({
    role: message.who === "user" ? ("user" as const) : ("assistant" as const),
    content: message.text,
  })),
];

const failure = (message: string): HobEvent => ({
  event: "failed",
  data: new HobFailure({ message: message === "" ? "The model stopped answering." : message }),
});

/** Whatever a cause carried, as one line a DM can read. */
const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * One short line about a tool call, for the panel.
 *
 * Deliberately a *rendering* rather than a payload: the parameters and the
 * result belong to the model, and a client that branched on their shape would
 * be coupled to the toolkit. A count is what a DM wants to know — "it looked,
 * and it found three things".
 */
const detailOf = (value: unknown): string => {
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "result" : "results"}`;
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object") {
    const first = Object.values(value).find((entry) => typeof entry === "string");
    return typeof first === "string" ? first : "";
  }
  return "";
};

/**
 * The package's response parts, as the four events the panel understands.
 *
 * Most parts are dropped. `tool-params-start/delta/end` are the provider
 * streaming a JSON argument blob a character at a time — real, and nothing a
 * DM should watch. Reasoning parts are dropped for a stronger reason: a local
 * model's chain of thought is not an answer, and putting it in the transcript
 * would make the panel's one honest voice into two.
 */
const toHobEvent: Filter.Filter<Response.StreamPart<HobTools>, HobEvent> = (part) => {
  switch (part.type) {
    case "text-delta":
      return Result.succeed({
        event: "delta" as const,
        data: new HobDelta({ text: part.delta }),
      });
    case "tool-call":
      return Result.succeed({
        event: "tool" as const,
        data: new HobToolStep({
          name: part.name,
          phase: "called",
          detail: detailOf(part.params),
        }),
      });
    case "tool-result":
      return Result.succeed({
        event: "tool" as const,
        data: new HobToolStep({
          name: part.name,
          phase: "answered",
          detail: part.isFailure ? "nothing it could read" : detailOf(part.encodedResult),
        }),
      });
    case "finish":
      return Result.succeed({
        event: "done" as const,
        data: new HobDone({ reason: part.reason }),
      });
    case "error":
      return Result.succeed(failure(describe(part.error)));
    default:
      return Result.fail(part);
  }
};
