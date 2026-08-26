import {
  type AssistantTurnId,
  type Campaign,
  type CampaignId,
  CurrentActor,
  type HobAsk,
  HobBegun,
  HobDelta,
  HobDone,
  type HobEvent,
  HobFailure,
  type HobProposal,
  HobProposed,
  HobStatus,
  HobToolStep,
  type HobTurn,
  HobUnavailable,
  type NotFound,
} from "@taverns/api";
import { Cause, Context, Effect, type Filter, Layer, Ref, Result, Schema, Stream } from "effect";
import {
  AiError,
  Chat,
  LanguageModel,
  type Prompt,
  type Response,
  type Toolkit,
} from "effect/unstable/ai";
import { Campaigns } from "../repo/Campaigns.js";
import { Creatures } from "../repo/Creatures.js";
import { DmActors } from "../repo/DmActor.js";
import { HobThreads } from "../repo/HobThreads.js";
import { Recap } from "../repo/Recap.js";
import { Search } from "../repo/Search.js";
import { SessionEvents } from "../repo/SessionEvents.js";
import { Sessions } from "../repo/Sessions.js";
import { handlersFor, HobToolkit, type ProposalSlot } from "./toolkit.js";

/**
 * Hob answers.
 *
 * The whole of the assistant is this file and `toolkit.ts`: one prompt, one
 * `LanguageModel.streamText` call over the toolkit, and a translation from the
 * package's response parts into the events `HobEvent` declares. What is
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
 * ### The conversation is a row, and so is what Hob offers
 *
 * A thread and its turns live in `assistant_thread` / `assistant_turn` and are
 * read and written through `repo/HobThreads.ts` — one more repository, the same
 * predicates. So the question arrives as *one question and a thread id* rather
 * than as a transcript the client kept, and the answer is appended when the
 * stream ends, however it ends.
 *
 * What Hob **proposes** is saved on that turn and nowhere else. This file writes
 * no note, no beat and no encounter; `repo/Proposals.ts` does, when a human
 * accepts. That is the captain's *generate with approval* decision, and it is
 * structural here rather than remembered: the repositories this service holds
 * are all reads plus the transcript.
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
    | Campaigns
    | Creatures
    | DmActors
    | HobThreads
    | LanguageModel.LanguageModel
    | Recap
    | Search
    | SessionEvents
    | Sessions
  > =>
    Layer.effect(this)(
      Effect.gen(function* () {
        const languageModel = yield* LanguageModel.LanguageModel;
        const campaigns = yield* Campaigns;
        const dmActors = yield* DmActors;
        const threads = yield* HobThreads;
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

              // Asking is a write — a conversation is a row in the campaign —
              // so the DM check below refuses exactly whom `threads.start`
              // would, one line earlier and with the proof the toolkit needs.
              const dm = yield* dmActors.of(campaignId);

              // The conversation, resolved before a byte of stream exists — so
              // a thread this credential may not reach is a 404 exactly as an
              // unreachable campaign is, and the model is never called.
              const thread =
                ask.threadId === undefined
                  ? yield* threads.start(campaignId, ask.text)
                  : yield* threads.findById(campaignId, ask.threadId);
              const history = yield* threads.turns(campaignId, thread.id);

              yield* threads.append(campaignId, thread.id, {
                id: yield* freshTurnId,
                who: "user",
                text: ask.text,
              });

              // Generated here rather than by the column default, because the
              // client is told it in the `began` event before there is an
              // answer to save under it — that is the id an accept names.
              const answerId = yield* freshTurnId;

              const written = yield* Ref.make("");
              const broke = yield* Ref.make(false);
              const proposal: ProposalSlot = yield* Ref.make<HobProposal | undefined>(undefined);
              const finished = yield* Ref.make("stop");

              // Bound to *this* campaign and *this* actor, now — the stream
              // below is pulled after this effect has returned, so nothing may
              // be left to the ambient context. The proof is resolved here
              // rather than passed in because it is the pair, and one of the
              // tools reads the combat log.
              const handlers = yield* HobToolkit.toHandlers(
                handlersFor(repositories, dm, proposal),
              );
              const toolkit = yield* Effect.provideContext(HobToolkit, handlers);

              /**
               * Saves what Hob actually produced, however the stream ended.
               *
               * In a finalizer rather than at the end of the happy path,
               * because the interesting case is a DM who closed the tab
               * mid-answer: the half they read is still the half that was said,
               * and losing it would make the transcript disagree with what
               * happened. Best effort by construction — a turn that cannot be
               * saved must not turn a delivered answer into a failure — and
               * nothing at all is written when Hob produced neither words nor a
               * proposal, which reads correctly on reload as a question that
               * went unanswered.
               */
              const save = Effect.gen(function* () {
                const text = yield* Ref.get(written);
                const offered = yield* Ref.get(proposal);
                if (text === "" && offered === undefined) return;
                yield* threads.append(campaignId, thread.id, {
                  id: answerId,
                  who: "hob",
                  text,
                  proposal: offered,
                });
              }).pipe(Effect.provideService(CurrentActor, actor), Effect.ignore);

              /**
               * The proposal, then the end of the answer.
               *
               * `done` is emitted here rather than from the provider's own
               * `finish` part so that a proposal cannot arrive after it: a
               * client that trusts `done` closes the turn, and a card appended
               * to a closed turn is a card the DM has already scrolled past.
               *
               * An answer that already said `failed` gets no `done`: exactly one
               * of the two, ever. A proposal may still follow that `failed` —
               * a model that offered something good and then burned the round
               * budget looking for more really did offer it, and dropping the
               * card would leave the DM with a row on reload they never saw.
               *
               * **An answer that produced nothing at all is a failure too**, and
               * is the other half of the state `truncated` describes: a model
               * that reasoned, stopped, and emitted no word, no tool call and no
               * offer. Nothing is written to the thread in that case (`save`
               * refuses an empty turn), so a bare `done` leaves the DM with a
               * spinner that stopped and a transcript that will not remember it
               * happened. It is not diagnosable from the outside and it is one
               * sentence to say.
               */
              const tail = Stream.unwrap(
                Effect.map(
                  Effect.all([
                    Ref.get(proposal),
                    Ref.get(finished),
                    Ref.get(broke),
                    Ref.get(written),
                  ]),
                  ([offered, reason, failed, text]) =>
                    Stream.fromIterable<HobEvent>([
                      ...(offered === undefined
                        ? []
                        : [
                            {
                              event: "proposal" as const,
                              data: new HobProposed({ turnId: answerId, proposal: offered }),
                            },
                          ]),
                      ...(failed
                        ? []
                        : text === "" && offered === undefined
                          ? [silence]
                          : [{ event: "done" as const, data: new HobDone({ reason }) }]),
                    ]),
                ),
              );

              return Stream.fromIterable<HobEvent>([
                {
                  event: "began",
                  data: new HobBegun({ threadId: thread.id, turnId: answerId }),
                },
              ]).pipe(
                Stream.concat(
                  Stream.unwrap(
                    Effect.map(Chat.fromPrompt(promptFor(campaign, history, ask)), (chat) =>
                      round(chat, toolkit, MAX_ROUNDS, finished, proposal),
                    ),
                  ).pipe(Stream.tap((event) => note(written, broke, event))),
                ),
                Stream.concat(tail),
                Stream.provideService(LanguageModel.LanguageModel, languageModel),
                // A provider that dies mid-answer, a model that returns
                // nonsense the codec rejects: the DM is already reading a
                // half-written reply, so the only useful thing to do is say so
                // in the thread rather than tear the connection down.
                Stream.catchCause((cause) =>
                  Stream.unwrap(
                    Effect.as(
                      Effect.logWarning(`Hob's answer failed: ${describe(Cause.squash(cause))}`),
                      Stream.succeed(failure(apology(Cause.squash(cause)))),
                    ),
                  ),
                ),
                Stream.ensuring(save),
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
 * indecision as is worth paying for on a local model. **A recovered round is
 * charged to it like any other** — see `recover` — because a free retry is a
 * loop with no ceiling.
 *
 * Running out is reported to the DM rather than swallowed: an answer that stops
 * with no prose is a failure, and pretending otherwise is exactly the sort of
 * quiet wrongness this surface must not have. The one exception is a turn that
 * offered something, which is not an answer that stopped with nothing — see
 * `gotNowhere`, which is the whole of that judgement and the only place it is
 * made.
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
 *
 * The one reason that is *not* withheld is `length`. See `truncated`.
 */
const round = (
  chat: Chat.Service,
  toolkit: Toolkit.WithHandler<HobTools>,
  budget: number,
  finished: Ref.Ref<string>,
  /**
   * What Hob has offered so far, read and never written here.
   *
   * The only thing this loop asks of it is whether it is empty, and only when
   * the budget has run out — see {@link exhausted}. It is a `Ref` rather than a
   * boolean because it is filled by a tool handler *during* a round, so its
   * value at the moment the budget is spent is the only one that answers the
   * question.
   */
  proposal: ProposalSlot,
  /**
   * What to say before this round — empty for an ordinary one.
   *
   * The `Chat` carries the conversation, so a round normally has nothing of its
   * own to add. The exception is the correction below: a round that follows an
   * unreadable tool call has to tell the model what was wrong with it.
   */
  say: Prompt.RawInput = [],
): Stream.Stream<HobEvent, AiError.AiError | Schema.SchemaError, LanguageModel.LanguageModel> =>
  Stream.unwrap(
    Effect.map(Ref.make(false), (calledTool) =>
      chat.streamText({ prompt: say, toolkit }).pipe(
        Stream.filterMapEffect((part: Response.StreamPart<HobTools>) =>
          Effect.gen(function* () {
            if (part.type === "tool-call") yield* Ref.set(calledTool, true);
            if (part.type === "finish") {
              // The provider's reason for stopping is recorded rather than
              // emitted: `ask` puts `done` at the very end so the proposal
              // cannot land after it. `length` is the exception — it is not a
              // reason to record and move on, it is the end of the answer.
              yield* Ref.set(finished, part.reason);
              if (part.reason === "length") return Result.succeed(truncated);
              if (yield* Ref.get(calledTool)) {
                if (budget > 1) return Result.fail(part);
                return (yield* gotNowhere(proposal)) ? Result.succeed(ranOut) : Result.fail(part);
              }
              return Result.fail(part);
            }
            return toHobEvent(part);
          }),
        ),
        Stream.concat(
          Stream.unwrap(
            Effect.map(
              Effect.all([Ref.get(calledTool), Ref.get(finished)]),
              // A round the model was cut off in the middle of has no next
              // round: whatever it was going to ask for, it never finished
              // asking. Spending the rest of the budget re-truncating the same
              // answer costs the DM four provider calls to reach the same place.
              ([used, reason]) =>
                used && budget > 1 && reason !== "length"
                  ? round(chat, toolkit, budget - 1, finished, proposal)
                  : Stream.empty,
            ),
          ),
        ),
        // Outside the recursion on purpose, so it also covers a later round: a
        // model that gets one call right and the next one wrong is the ordinary
        // case, and the budget is already decremented by the time we are here.
        Stream.catch((error) => recover(chat, toolkit, budget, finished, proposal, error)),
      ),
    ),
  );

/**
 * Whether the budget running out is worth reporting: only if Hob got nowhere.
 *
 * **A turn that offered the DM something is not a turn that failed**, and
 * saying both is the one shape this surface must not have. Running out of
 * rounds after a `propose*` call used to emit `ranOut`'s "never got to an
 * answer" and then, one event later, the card that answered it: `tail` puts the
 * proposal at the very end so it cannot land after a `done`, so the apology
 * necessarily arrived first and read as a contradiction of the thing arriving
 * next. The measured 8B did exactly this — told the DM it never got there while
 * a good `proposeEncounter` was already on its way.
 *
 * What was lost in that case is the *sentence about* the offer, not the offer.
 * The card names itself and draws its own roster, so the honest report is the
 * card and a `done`: `tail` emits both, `broke` stays false, and `save` writes
 * a turn with a proposal and no words — a shape the panel already draws and
 * `promptFor`'s `offered()` already reads back.
 *
 * With nothing offered there is genuinely nothing to show, so the failure
 * stands. It is the same question `tail` asks about an empty answer, one layer
 * in: the difference between quiet and empty.
 *
 * It deliberately does *not* soften `truncated` or a provider error the same
 * way. Those are the model or the endpoint breaking mid-answer, which the DM
 * has to be told about whatever else landed — the DM can read the card and the
 * apology as two true things. "It never got to an answer" beside an answer is
 * the only pair that cannot both be true.
 */
const gotNowhere = (proposal: ProposalSlot): Effect.Effect<boolean> =>
  Effect.map(Ref.get(proposal), (offered) => offered === undefined);

/**
 * The model spent every round looking things up and never wrote a sentence.
 *
 * Only said when it also offered nothing — see {@link gotNowhere}.
 */
const ranOut: HobEvent = {
  event: "failed",
  data: new HobFailure({
    message: "Hob kept looking things up and never got to an answer. Ask again, more narrowly.",
  }),
};

/**
 * One tool call the framework could not read — handed back to the model instead
 * of ending the answer.
 *
 * **This is the defect that made every other failure in this area look like a
 * model problem.** A tool call's arguments are decoded against the tool's own
 * parameter schema *by the framework*, inside `streamText`, before any handler
 * of ours runs — so `failureMode: "return"`, which is how every refusal in this
 * toolkit reaches the model, does not apply to it. One bad argument therefore
 * failed the whole stream: nothing was saved to the thread, no tool step was
 * ever drawn, and the DM was shown a `SchemaError` naming every tool in the
 * toolkit. Measured in a real browser, twice, on two different models.
 *
 * A malformed argument is exactly the kind of failure a model can fix, and the
 * shipped convention for that is to tell it. So the correction goes back as a
 * message and the loop carries on with what is left of the budget — the same
 * budget, because a round spent getting the protocol wrong is a round the DM
 * paid for, and a free retry is a loop with no ceiling. When the budget is
 * gone it is a written sentence like every other failure here, never the
 * framework's own words.
 *
 * The correction is a `user` message rather than a `tool` result, and it has to
 * be: a tool result must answer a tool call the assistant made, and the call
 * that failed to decode never reached the history — `Chat.streamText` writes
 * back only the parts it decoded, so the malformed one is not there to answer.
 *
 * Everything that is *not* an unreadable call — a refused connection, a 500, a
 * rate limit — is re-raised untouched and becomes `ask`'s one `failed` event.
 * Retrying those here would spend the budget on a server that is not answering.
 */
const recover = (
  chat: Chat.Service,
  toolkit: Toolkit.WithHandler<HobTools>,
  budget: number,
  finished: Ref.Ref<string>,
  proposal: ProposalSlot,
  error: AiError.AiError | Schema.SchemaError,
): Stream.Stream<HobEvent, AiError.AiError | Schema.SchemaError, LanguageModel.LanguageModel> => {
  const detail = unreadableCall(error);
  if (detail === undefined) return Stream.fail(error);
  if (budget <= 1) {
    // The same question `exhausted` asks, and it is asked more often here: a
    // recovery is charged to the budget, so a model that offered something good
    // and then garbled one more call is a way to reach this that did not exist
    // before `recover` did.
    return Stream.unwrap(
      Effect.map(gotNowhere(proposal), (nowhere) =>
        nowhere ? Stream.succeed(unreadable) : Stream.empty,
      ),
    );
  }
  return Stream.unwrap(
    Effect.as(
      // The raw text is worth keeping and is not worth showing: it names every
      // tool in the toolkit and reads as a stack trace. It goes to the log,
      // where whoever is running the model can see which parameter the endpoint
      // could not express.
      Effect.logWarning(`Hob could not read a tool call, and asked again: ${detail}`),
      round(chat, toolkit, budget - 1, finished, proposal, [
        {
          role: "user" as const,
          content:
            "That tool call could not be read, so it did nothing. The problem was: " +
            `${detail}. Look at the tool's parameters and call it again with values ` +
            "that fit them, or answer without it. An optional parameter may be left " +
            "out altogether.",
        },
      ]),
    ),
  );
};

/**
 * Whether a failure is the model getting a tool call wrong, and what was wrong.
 *
 * Two shapes reach us, from two different points in `streamText`, and both mean
 * the same thing. `ToolParameterValidationError` is the decode `Toolkit.handle`
 * does before calling a handler. `InvalidOutputError` is the decode of the
 * response parts themselves, which is the one that actually fires here — the
 * whole chunk is decoded before any handler is forked, so a bad argument fails
 * there first and the handler never runs.
 *
 * Nothing else is treated as recoverable. `InvalidOutputError` is *only* raised
 * for output the codec refused, so widening this to "anything retryable" would
 * pull in rate limits and provider outages, which another round cannot fix.
 */
const unreadableCall = (error: AiError.AiError | Schema.SchemaError): string | undefined => {
  if (Schema.isSchemaError(error)) return complaint(error.message);
  if (!AiError.isAiError(error)) return undefined;
  const reason = error.reason;
  if (reason._tag === "ToolParameterValidationError") {
    return `${reason.toolName} — ${complaint(reason.description)}`;
  }
  return reason._tag === "InvalidOutputError" ? complaint(reason.description) : undefined;
};

/**
 * The part of a codec's complaint that is about the model's arguments.
 *
 * **The raw message is mostly noise, and the noise is the harmful half.** A
 * stream part is a union over every tool, so one bad argument produces one line
 * per tool that did *not* match — `Expected "listSessions", got
 * "proposeEncounter"`, and eight more like it — around the single line that
 * says what was actually wrong. Sent back whole, that is a page of context a
 * small model spends instead of thinking, and it reads as an instruction to
 * call `listSessions`. So the pairs whose path names `["params"]` are the ones
 * kept, with the response-part index dropped and the JSON pointer written the
 * way a model writes an argument.
 *
 * The fall-through is the first line, capped: for a call naming a tool that
 * does not exist there is no parameter path, and `Expected "searchCampaign",
 * got "frobnicate"` is still the useful sentence.
 */
const complaint = (description: string): string => {
  const lines = description.split("\n");
  const kept: Array<string> = [];
  for (let index = 1; index < lines.length; index++) {
    const path = /^\s*at \[\d+\]\["params"\](?<rest>.*)$/u.exec(lines[index] ?? "")?.groups?.rest;
    if (path === undefined) continue;
    const where = path.replaceAll(/\["([^"]*)"\]/gu, ".$1");
    kept.push(`${(lines[index - 1] ?? "").trim()} at ${where === "" ? "the arguments" : where}`);
  }
  const said = kept.length === 0 ? (lines[0] ?? description) : kept.join("; ");
  return said.length > 300 ? `${said.slice(0, 300)}…` : said;
};

/**
 * The model could not be got to speak the toolkit's own schema.
 *
 * The last thing said when a run of unreadable calls exhausts the budget. It
 * names the shape of the problem rather than the schema error, because the
 * schema error is a page long and is about our tools rather than about the
 * DM's question.
 */
const unreadable: HobEvent = {
  event: "failed",
  data: new HobFailure({
    message:
      "Hob kept reaching for the record with arguments this model could not spell, " +
      "and ran out of tries. Ask again in fewer words, or point it at a model that " +
      "handles tool calls better.",
  }),
};

/**
 * The model ran out of room, said in the one place the DM is looking.
 *
 * **This is the single most misdiagnosable state the assistant has, and it used
 * to be silent.** `HOB_MAX_TOKENS` caps *everything the model emits*, and on a
 * reasoning model — which is what a capable local 8B is in 2026 — most of that
 * is thinking the DM never sees. Reasoning parts are dropped on purpose
 * (`toHobEvent`), so a model that spends its whole budget deliberating and
 * never reaches its tool call produced, from the panel's point of view,
 * `began` … `done`: a spinner that stopped, reported as a completed answer.
 * Where the endpoint does not split reasoning out of `content` —
 * `llama-server --reasoning-format none`, and `auto` for a template it does not
 * recognise — the same run reads as *nothing but text deltas*, forever, with no
 * tool call ever. Both were measured against a real Qwen3-8B; see AGENTS.md.
 *
 * So the honest report is a failure, not a `done`. It costs the DM one sentence
 * and it names the knob, because the fix is a number in `apps/server/.env.local`
 * and nothing about the question they asked.
 */
const truncated: HobEvent = {
  event: "failed",
  data: new HobFailure({
    message:
      "The model ran out of room before it finished — on a model that reasons, the " +
      "thinking is spent out of the same budget and can use all of it before a tool " +
      "call. Raise HOB_MAX_TOKENS in apps/server/.env.local and ask again.",
  }),
};

/** The model stopped without saying anything. See `tail`. */
const silence: HobEvent = {
  event: "failed",
  data: new HobFailure({
    message:
      "The model stopped without saying anything — on a model that reasons, that " +
      "usually means it spent the whole answer thinking. Ask again, or raise " +
      "HOB_MAX_TOKENS in apps/server/.env.local.",
  }),
};

/** A turn id, minted before the row that carries it. See `HobThreads`. */
const freshTurnId: Effect.Effect<AssistantTurnId> = Effect.sync(
  () => crypto.randomUUID() as AssistantTurnId,
);

/**
 * Watches the answer go past: what was said, and whether it broke.
 *
 * The reply is accumulated because there is nothing to re-read — SSE is
 * write-only — so the transcript's copy is assembled from the same deltas the
 * DM saw, which is the only way the two can agree. **A failure sentence is not
 * accumulated**: it is the product apologising, not something Hob said, and a
 * transient provider error should not become a line of the campaign's record.
 */
const note = (
  written: Ref.Ref<string>,
  broke: Ref.Ref<boolean>,
  event: HobEvent,
): Effect.Effect<void> => {
  if (event.event === "delta") return Ref.update(written, (text) => text + event.data.text);
  if (event.event === "failed") return Ref.set(broke, true);
  return Effect.void;
};

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
    "Everything you say about what already exists in this campaign must come from a",
    "tool call. Search before you answer any question about a person, a place, a thing,",
    "a creature, or what happened at the table. Never state as fact a name, an event or",
    "a session you have not read: if the record does not say, say that it does not.",
    "",
    "When the DM asks you to make something new — an encounter, a note, read-aloud text,",
    "a line about what just happened — write it and offer it with proposeEncounter,",
    "proposeNote or proposeBeat. Nothing you offer is saved until the DM accepts it, so",
    "offer it rather than asking permission first. Offer one thing at a time, and say",
    "one short line about it: the DM is already looking at it.",
    "",
    "Quote the DM's own words when they answer the question — they wrote them and they",
    "are already the right length. Keep replies to a sentence or two unless asked for",
    "more; the DM is usually reading this mid-game.",
    "",
    "You can see this one campaign and only what this credential is allowed to read.",
    "That is not a restriction you can work around, and you should not try.",
  ].join("\n");

/**
 * How much of a saved conversation is sent back to the model.
 *
 * A thread is durable now and can run to hundreds of turns; a local model's
 * context window is measured in thousands of tokens, and forty turns of prose
 * plus a tool result already crowds it. So the *record* is complete and the
 * *prompt* is the recent end of it — the same distinction the recap makes
 * between what is retained and what is read back.
 */
const RECENT_TURNS = 40;

/**
 * What Hob offered on a turn, as one line of the conversation it was part of.
 *
 * **A proposal is half of what was said, and leaving it out made Hob forget its
 * own work.** The card is on the DM's screen and in `assistant_turn.proposal`,
 * but the prompt was assembled from `text` alone — so "make that harder" or
 * "did you save that?" reached a model that could see a sentence about an
 * encounter and nothing about which creatures were in it. Worse, a turn where
 * Hob offered a card and said *nothing* was dropped entirely, which is exactly
 * what `proposeEncounter`'s own instruction ("say one short line and stop")
 * makes likely.
 *
 * It is bracketed and written in the second person so it reads as a note about
 * what happened rather than as prose Hob said out loud — the transcript's one
 * voice belongs to the deltas the DM actually saw.
 *
 * The roster carries its `creatureId`s because they are the one thing a
 * follow-up cannot re-derive without spending another round searching for
 * creatures the model has already been shown. `accepted` is here for the same
 * reason it is on the wire: an offer the DM kept and an offer still sitting
 * there are different facts, and only one of them is a row in the campaign.
 */
const offered = (turn: HobTurn): string | undefined => {
  const proposal = turn.proposal;
  if (proposal === null) return undefined;
  const kept = turn.acceptedAt === null ? "not yet accepted" : "accepted by the DM";
  switch (proposal.target) {
    case "note":
      return `[You offered the DM a ${
        proposal.kind === "read_aloud" ? "read-aloud note" : "note"
      } called "${proposal.title}" — ${kept}: ${proposal.body}]`;
    case "beat":
      return `[You offered the DM a beat — ${kept}: ${proposal.body}]`;
    case "encounter": {
      const band = proposal.difficulty === null ? "" : `, ${proposal.difficulty}`;
      const tags = proposal.tags.length === 0 ? "" : `, tagged ${proposal.tags.join(", ")}`;
      const roster = proposal.roster
        .map((line) => `${line.count} × ${line.name} (CR ${line.cr}, id ${line.creatureId})`)
        .join("; ");
      return `[You offered the DM an encounter called "${proposal.name}"${band}${tags} — ${kept}: ${roster}]`;
    }
  }
};

const promptFor = (
  campaign: Campaign,
  history: ReadonlyArray<HobTurn>,
  ask: HobAsk,
): Prompt.RawInput => [
  { role: "system" as const, content: systemPrompt(campaign) },
  ...history.slice(-RECENT_TURNS).flatMap((turn) => {
    // A turn that carries neither words nor an offer has nothing a prompt can
    // use, and an empty message is a shape some providers reject outright.
    const content = [turn.text, offered(turn)].filter((part) => part !== undefined && part !== "");
    return content.length === 0
      ? []
      : [
          {
            role: turn.who === "user" ? ("user" as const) : ("assistant" as const),
            content: content.join("\n\n"),
          },
        ];
  }),
  { role: "user" as const, content: ask.text },
];

const failure = (message: string): HobEvent => ({
  event: "failed",
  data: new HobFailure({ message: message === "" ? "The model stopped answering." : message }),
});

/**
 * Whatever went wrong, as a sentence written for the person reading the panel.
 *
 * **Nothing a framework, a provider or a codec wrote may reach this surface**,
 * and that is a rule about the surface rather than about any one bug.
 * `HobFailure.message` is rendered verbatim inside a conversation the DM is
 * having; a stack frame, a URL or a schema error listing every tool in the
 * toolkit is not a thing Hob says, and the DM cannot act on any of it. The
 * shipped failures here — `truncated`, `silence`, `unreadable` — are all
 * written sentences that name the knob when there is one, and this is the same
 * standard applied to the errors nobody anticipated.
 *
 * The branches are the ones a DM can do something about, and the fall-through
 * is deliberately vague rather than helpfully raw. The detail is not lost: it
 * is logged beside this, which is where somebody running a model can read it.
 */
const apology = (error: unknown): string => {
  if (AiError.isAiError(error)) {
    switch (error.reason._tag) {
      case "NetworkError":
        return (
          "Hob could not reach the model. Check that the endpoint in HOB_API_URL is " +
          "running, then ask again."
        );
      case "InternalProviderError":
        return "The model endpoint failed while answering. Try again in a moment.";
      case "AuthenticationError":
        return "The model endpoint refused Hob's credential. Check HOB_API_KEY.";
      case "RateLimitError":
      case "QuotaExhaustedError":
        return "The model turned Hob away for asking too often. Try again in a moment.";
      case "ContentPolicyError":
        return "The model refused to answer that one.";
      case "InvalidOutputError":
      case "StructuredOutputError":
      case "ToolParameterValidationError":
      case "InvalidToolResultError":
      case "ToolResultEncodingError":
        return (
          "Hob could not make sense of what the model sent back. Ask again, or point " +
          "the server at a model that handles tool calls better."
        );
      default:
        break;
    }
  }
  return "Something went wrong while Hob was answering. Ask again.";
};

/** The same thing again for the log, where the whole of it is useful. */
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
    case "error":
      // The provider's own mid-stream error part. Same rule as `apology`: the
      // DM reads a sentence, not whatever the endpoint put on the wire.
      return Result.succeed(failure(apology(part.error)));
    default:
      return Result.fail(part);
  }
};
