import {
  type AssistantTurnId,
  type Campaign,
  type CampaignId,
  CurrentActor,
  GroupHobStatus,
  type GroupId,
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
import { Cause, Context, Effect, Layer, Option, Ref, Result, Schema, Stream } from "effect";
import {
  AiError,
  Chat,
  LanguageModel,
  type Prompt,
  type Response,
  type Tool,
  type Toolkit,
} from "effect/unstable/ai";
import { Campaigns } from "../repo/Campaigns.js";
import { GroupHistory } from "../repo/GroupHistory.js";
import { Groups } from "../repo/Groups.js";
import { Creatures } from "../repo/Creatures.js";
import { CampaignCreatorActors } from "../repo/CreatorActor.js";
import { EquipmentRepo } from "../repo/Equipment.js";
import { type HobDirectResourceContext, HobDirectWrites } from "../repo/HobDirectWrites.js";
import { HobThreads } from "../repo/HobThreads.js";
import { NpcKnowledge } from "../repo/NpcKnowledge.js";
import { NpcMemories } from "../repo/NpcMemories.js";
import { NpcAwareness, type NpcAwarenessDraft } from "../repo/NpcAwareness.js";
import { Npcs } from "../repo/Npcs.js";
import { Options } from "../repo/Options.js";
import { Recap } from "../repo/Recap.js";
import { Search } from "../repo/Search.js";
import { SessionEvents } from "../repo/SessionEvents.js";
import { Sessions } from "../repo/Sessions.js";
import { Spells } from "../repo/Spells.js";
import {
  type AwarenessSlot,
  type CharacterVocabulary,
  dmBindWithDirect,
  dmHandlersFor,
  groupHandlersFor,
  GroupToolkit,
  HobToolkit,
  NO_VOCABULARY,
  playerBindListing,
  playerBindOver,
  type ProposalSlot,
  vocabularyOf,
} from "./toolkit.js";

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
    /** `status`, for the group surface — gated on live group membership. */
    readonly groupStatus: (
      groupId: GroupId,
    ) => Effect.Effect<GroupHobStatus, NotFound, CurrentActor>;
    /**
     * Group Hob answers — the canonical-record surface. Same protocol as
     * `ask`, over the group toolkit and the group's shared thread; see
     * `decision-group-hob-boundary.md` for what it may and may not know.
     */
    readonly askGroup: (
      groupId: GroupId,
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
  static readonly unavailable: Layer.Layer<Hob, never, Campaigns | Groups> = Layer.effect(this)(
    Effect.gen(function* () {
      const campaigns = yield* Campaigns;
      const groups = yield* Groups;
      const off = new HobUnavailable({
        message:
          "Hob has no model behind it. Set HOB_API_URL and HOB_MODEL in " +
          "apps/server/.env.local (see .env.example) and restart the server.",
      });
      return {
        status: (campaignId) =>
          Effect.map(
            campaigns.findById(campaignId),
            (campaign) => new HobStatus({ available: false, model: null, campaign: campaign.name }),
          ),
        ask: (campaignId) => Effect.andThen(campaigns.findById(campaignId), Effect.fail(off)),
        // Same shape as the campaign pair: the group is still resolved, so
        // "the assistant is off" is not a cheaper way to probe which groups
        // exist.
        groupStatus: (groupId) =>
          Effect.map(
            groups.findById(groupId),
            (group) => new GroupHobStatus({ available: false, model: null, group: group.name }),
          ),
        askGroup: (groupId) => Effect.andThen(groups.findById(groupId), Effect.fail(off)),
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
    | CampaignCreatorActors
    | EquipmentRepo
    | GroupHistory
    | Groups
    | HobThreads
    | NpcKnowledge
    | NpcMemories
    | NpcAwareness
    | Npcs
    | LanguageModel.LanguageModel
    | Options
    | Recap
    | Search
    | SessionEvents
    | Sessions
    | Spells
  > =>
    Layer.effect(this)(
      Effect.gen(function* () {
        const languageModel = yield* LanguageModel.LanguageModel;
        const campaigns = yield* Campaigns;
        const groups = yield* Groups;
        const dmActors = yield* CampaignCreatorActors;
        const threads = yield* HobThreads;
        const repositories = {
          search: yield* Search,
          sessions: yield* Sessions,
          recap: yield* Recap,
          creatures: yield* Creatures,
          npcs: yield* Npcs,
          npcKnowledge: yield* NpcKnowledge,
          npcMemories: yield* NpcMemories,
          npcAwareness: yield* NpcAwareness,
          events: yield* SessionEvents,
          directWrites: Option.getOrUndefined(yield* Effect.serviceOption(HobDirectWrites)),
          // The seventh, and the one no tool handler calls: a campaign's
          // classes, races and backgrounds decide the *shape* of
          // `proposeCharacter`, so they are read before the toolkit exists
          // rather than from inside it.
          options: yield* Options,
          // The spell picker rules are shared with Hob's draft through this repository.
          spells: yield* Spells,
          // The bundled equipment a drafted kit's names resolve against, so a
          // model saying "Scimitar" links the SRD's scimitar rather than
          // leaving a name nothing on the sheet can read.
          equipment: yield* EquipmentRepo,
          // The group context: the chronicle and the summary for the DM's two
          // group tools, and the whole record for group Hob's.
          history: yield* GroupHistory,
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

              /**
               * Which of the two Hobs is answering, resolved once.
               *
               * The `CampaignCreatorActor` proof is what the DM's toolkit needs; its absence
               * is what says this is a player, and the two are told apart by
               * exactly one read. It is sound *because the campaign has already
               * been resolved above*: `campaigns.findById` composes
               * `campaignReadable`, so by the time this runs the actor is
               * either the DM or a live member of a shared campaign, and
               * `dmActors.of` failing means the second. A failure here is never
               * "the campaign is not yours" — that answer has already been
               * given.
               *
               * Before the captain reversed *players do not talk to Hob*, this
               * line was the refusal: a player got the `NotFound` that
               * `threads.start` would have given them one line later. What
               * replaces the refusal is a narrower surface rather than a
               * looser one — a two-tool toolkit, a thread of their own, and the
               * same row-level predicate underneath.
               *
               * **The proof alone stopped being enough when creators became
               * character authors** (the continuity decision): the drafting
               * composer is one surface everybody shares, so `ask.intent` says
               * which surface is asking and the proof only decides the panel's
               * side. A creator drafting a character is acting as themselves,
               * not as the campaign — they get the drafting toolkit and a
               * thread of their own, exactly as a player does, and the
               * campaign's shared conversation never sees their character
               * description. See `HobAsk` in `@taverns/api`.
               */
              const dm = yield* Effect.result(dmActors.of(campaignId));
              const creator =
                Result.isSuccess(dm) && ask.intent !== "character" ? dm.success : undefined;
              const reach = creator !== undefined ? ("dm" as const) : ("own" as const);

              // The conversation, resolved before a byte of stream exists — so
              // a thread this credential may not reach is a 404 exactly as an
              // unreachable campaign is, and the model is never called. The
              // reach is what makes a player's thread theirs and the DM's the
              // campaign's; the two sets are disjoint by predicate, so neither
              // can resume the other's evening.
              const thread =
                ask.threadId === undefined
                  ? yield* threads.start(reach, campaignId, ask.text)
                  : yield* threads.findById(reach, campaignId, ask.threadId);
              const history = yield* threads.turns(reach, campaignId, thread.id);

              yield* threads.append(reach, campaignId, thread.id, {
                id: yield* freshTurnId,
                who: "user",
                text: ask.text,
              });

              // Generated here rather than by the column default, because the
              // client is told it in the `began` event before there is an
              // answer to save under it — that is the id an accept names.
              const answerId = yield* freshTurnId;

              const written = yield* Ref.make("");
              const touchedDirect = yield* Ref.make(false);
              const broke = yield* Ref.make(false);
              /**
               * Whether a build tool was *reached for* — as opposed to reached.
               *
               * Read in one place, by {@link wouldNotBuild}'s gate, and it is
               * what keeps that report true rather than merely plausible: a
               * model that called `proposeEncounter` and had it refused (an
               * invented creature id, a second offer in one turn) did reach for
               * its build tools, so "it did not" would be a sentence about the
               * wrong thing. Set from the event stream rather than threaded
               * through `round`, because the tool step is already an event by
               * the time it passes `note`.
               */
              const reachedForOne = yield* Ref.make(false);
              const proposal: ProposalSlot = yield* Ref.make<HobProposal | undefined>(undefined);
              const awareness: AwarenessSlot = yield* Ref.make<ReadonlyArray<NpcAwarenessDraft>>(
                [],
              );
              const finished = yield* Ref.make("stop");

              /**
               * This campaign's classes, races and backgrounds — **one extra
               * read, and only for a player.**
               *
               * `proposeCharacter` is built from it, and only the player's
               * toolkit has one, so a DM's question costs exactly what it did
               * before. That is the design's second stated cost paid at its
               * smallest: capped by `OPTION_LIMIT`, against `corpusRowReadable`
               * — the same predicate and the same method the create form's own
               * pickers read through, so an option Hob may offer is exactly an
               * option the player could have picked by hand.
               *
               * Read **here** rather than inside the stream, for two reasons
               * that both matter: `CurrentActor` is still ambient at this point
               * (the stream is pulled after this effect returns, which is why
               * every handler re-provides it), and a `NotFound` here is still a
               * 404 before a byte of body — it cannot be, since
               * `campaigns.findById` has already answered, but the shape is
               * what keeps that true if it ever could.
               */
              const vocabulary: CharacterVocabulary =
                creator !== undefined
                  ? NO_VOCABULARY
                  : vocabularyOf(yield* repositories.options.list(campaignId, {}));
              const directContext =
                creator === undefined || repositories.directWrites === undefined
                  ? undefined
                  : yield* repositories.directWrites.currentTargets(creator);

              // Bound to *this* campaign and *this* actor, now — the stream
              // below is pulled after this effect has returned, so nothing may
              // be left to the ambient context. The proof is resolved above
              // rather than passed in because it is the pair, and two of the
              // DM's tools read a DM-only projection.
              //
              // **Two toolkits, not one narrowed at the handler.** A toolkit is
              // what the provider is shown, so a player bound to the DM's would
              // be *offered* `getCreature` — a stat block — whatever the
              // handler behind it did. See `toolkit.ts`.
              const asked = <Tools extends AnyTools>(
                tools: Effect.Effect<Toolkit.WithHandler<Tools>>,
                system: string,
              ) =>
                conversation(tools, system, history, ask, finished, {
                  proposal,
                  awareness,
                  touchedDirect,
                });

              /**
               * Which of the three surfaces answers, decided once.
               *
               * The DM's is module-level and unchanged. The player's is built
               * per request, and which of *its* two shapes depends on whether
               * this campaign's vocabulary fits in a grammar — see
               * `OPTION_ENUM_CAP`. Three branches rather than a flag because
               * the two player shapes carry different tools and `Toolkit` is
               * invariant in its tool record; the branch is where the cost of
               * the fallback is visible, which is where it belongs.
               */
              const answering: Stream.Stream<
                HobEvent,
                AiError.AiError | Schema.SchemaError,
                LanguageModel.LanguageModel
              > =
                creator !== undefined
                  ? directContext === undefined || directContext.targets.length === 0
                    ? asked(
                        Effect.flatMap(
                          HobToolkit.toHandlers(
                            dmHandlersFor(repositories, creator, proposal, awareness),
                          ),
                          (bound) => Effect.provideContext(HobToolkit, bound),
                        ),
                        dmPrompt(campaign),
                      )
                    : asked(
                        dmBindWithDirect(
                          repositories,
                          creator,
                          proposal,
                          awareness,
                          directContext,
                          thread.id,
                          answerId,
                          touchedDirect,
                        ),
                        dmPrompt(campaign, directContext),
                      )
                  : vocabulary.listed
                    ? asked(
                        playerBindListing(repositories, actor, campaignId, proposal, vocabulary),
                        playerPrompt(campaign),
                      )
                    : asked(
                        playerBindOver(repositories, actor, campaignId, proposal, vocabulary),
                        playerPrompt(campaign),
                      );

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
                const candidates = yield* Ref.get(awareness);
                const touched = yield* Ref.get(touchedDirect);
                if (text === "" && offered === undefined && !touched && candidates.length === 0)
                  return;
                yield* threads.append(reach, campaignId, thread.id, {
                  id: answerId,
                  who: "hob",
                  text,
                  proposal: offered,
                });
                if (creator !== undefined) {
                  yield* Effect.forEach(
                    candidates,
                    (candidate) =>
                      repositories.npcAwareness.recordFromHob(creator, answerId, candidate),
                    { discard: true },
                  );
                }
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
                    Ref.get(reachedForOne),
                    Ref.get(touchedDirect),
                    Ref.get(awareness),
                  ]),
                  ([offered, reason, failed, text, reached, touched, candidates]) =>
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
                        : text === "" &&
                            offered === undefined &&
                            !touched &&
                            candidates.length === 0
                          ? [silence]
                          : offered === undefined &&
                              candidates.length === 0 &&
                              !reached &&
                              wouldNotBuild(reach, ask.text, text)
                            ? [unbuilt(reach)]
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
                  answering.pipe(Stream.tap((event) => note(written, broke, reachedForOne, event))),
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

          groupStatus: (groupId) =>
            Effect.map(
              groups.findById(groupId),
              (group) =>
                new GroupHobStatus({ available: true, model: options.model, group: group.name }),
            ),

          /**
           * The group surface — `ask`'s protocol over the group toolkit and
           * the group's one shared conversation.
           *
           * Deliberately a parallel implementation rather than `ask` bent
           * around a third branch: `ask` interleaves the DM/player fork, the
           * vocabulary read and the proof at half a dozen points, and a
           * version generic over all three scopes would bury the one thing
           * worth reading here — that this surface holds **no campaign
           * repository at all**. Its toolkit reaches the chronicle, the
           * summary, the directory and the canonical timeline, and nothing
           * else exists to leak. The streaming machinery (`conversation`,
           * `note`, the tail's ordering rules) is the shared code; what is
           * duplicated is the assembly, and `hob-group.test.ts` measures the
           * result at the wire.
           */
          askGroup: (groupId, ask) =>
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // The authorization gate, and the only thing read off the group
              // row: its name, for the prompt. `groupReadable` underneath, so
              // a stranger's 404 arrives before a byte of body.
              const group = yield* groups.findById(groupId);

              const thread =
                ask.threadId === undefined
                  ? yield* threads.start("group", groupId, ask.text)
                  : yield* threads.findById("group", groupId, ask.threadId);
              const history = yield* threads.turns("group", groupId, thread.id);

              yield* threads.append("group", groupId, thread.id, {
                id: yield* freshTurnId,
                who: "user",
                text: ask.text,
              });

              const answerId = yield* freshTurnId;
              const written = yield* Ref.make("");
              const broke = yield* Ref.make(false);
              const reachedForOne = yield* Ref.make(false);
              const proposal: ProposalSlot = yield* Ref.make<HobProposal | undefined>(undefined);
              const finished = yield* Ref.make("stop");

              const answering: Stream.Stream<
                HobEvent,
                AiError.AiError | Schema.SchemaError,
                LanguageModel.LanguageModel
              > = conversation(
                Effect.flatMap(
                  GroupToolkit.toHandlers(
                    groupHandlersFor(
                      { history: repositories.history, groups },
                      actor,
                      groupId,
                      proposal,
                    ),
                  ),
                  (bound) => Effect.provideContext(GroupToolkit, bound),
                ),
                groupPrompt(group.name),
                history,
                ask,
                finished,
                { proposal },
              );

              const save = Effect.gen(function* () {
                const text = yield* Ref.get(written);
                const offered = yield* Ref.get(proposal);
                if (text === "" && offered === undefined) return;
                yield* threads.append("group", groupId, thread.id, {
                  id: answerId,
                  who: "hob",
                  text,
                  proposal: offered,
                });
              }).pipe(Effect.provideService(CurrentActor, actor), Effect.ignore);

              // `ask`'s tail, with the DM's build-report gates: group chat is
              // general chat, so silence is the default and only an explicit
              // build ask earns the "built nothing" sentence.
              const tail = Stream.unwrap(
                Effect.map(
                  Effect.all([
                    Ref.get(proposal),
                    Ref.get(finished),
                    Ref.get(broke),
                    Ref.get(written),
                    Ref.get(reachedForOne),
                  ]),
                  ([offered, reason, failed, text, reached]) =>
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
                          : offered === undefined && !reached && wouldNotBuild("dm", ask.text, text)
                            ? [unbuilt("dm")]
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
                  answering.pipe(Stream.tap((event) => note(written, broke, reachedForOne, event))),
                ),
                Stream.concat(tail),
                Stream.provideService(LanguageModel.LanguageModel, languageModel),
                Stream.catchCause((cause) =>
                  Stream.unwrap(
                    Effect.as(
                      Effect.logWarning(
                        `Hob's group answer failed: ${describe(Cause.squash(cause))}`,
                      ),
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
 * One question, over whichever toolkit is answering.
 *
 * It exists so that the DM's branch and the player's branch produce **the same
 * type** — a `Stream<HobEvent>` — rather than two toolkits `round` would have
 * to unify. Everything inside it is generic over the tool set for the reason
 * {@link AnyTools} gives: the loop is about the protocol, not about which tools
 * exist.
 */
const conversation = <Tools extends AnyTools>(
  bind: Effect.Effect<Toolkit.WithHandler<Tools>>,
  system: string,
  history: ReadonlyArray<HobTurn>,
  ask: HobAsk,
  finished: Ref.Ref<string>,
  outputs: OutputSlots,
): Stream.Stream<HobEvent, AiError.AiError | Schema.SchemaError, LanguageModel.LanguageModel> =>
  Stream.unwrap(
    Effect.map(
      Effect.all([bind, Chat.fromPrompt(promptFor(system, history, ask))]),
      ([toolkit, chat]) => round(chat, toolkit, MAX_ROUNDS, finished, outputs),
    ),
  );

interface OutputSlots {
  readonly proposal: ProposalSlot;
  readonly awareness?: AwarenessSlot;
  readonly touchedDirect?: Ref.Ref<boolean>;
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

/**
 * The tools of *whichever* toolkit answered.
 *
 * `round`, `recover` and `toHobEvent` are generic over this rather than bound
 * to `HobToolkit`, and that is the whole cost of a second toolkit here: the
 * loop, the recovery and the part-to-event translation are about the protocol,
 * not about which tools exist, so none of them has an opinion about the shape.
 * The two toolkits are `HobToolkit` (the DM's nine) and `PlayerToolkit` (a
 * player's two); see `toolkit.ts` for why a narrower toolkit rather than a
 * narrower handler.
 */
type AnyTools = Record<string, Tool.Any>;

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
const round = <Tools extends AnyTools>(
  chat: Chat.Service,
  toolkit: Toolkit.WithHandler<Tools>,
  budget: number,
  finished: Ref.Ref<string>,
  /**
   * What Hob has offered or changed so far, read and never written here.
   *
   * The only thing this loop asks of it is whether it is empty, and only when
   * the budget has run out — see {@link exhausted}. It is made of `Ref`s rather
   * than booleans because handlers fill them *during* a round, so their value at
   * the moment the budget is spent is the only one that answers the question.
   */
  outputs: OutputSlots,
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
      // The one cast in this file, and what it asserts is checkable by reading
      // `toolkit.ts`. `streamText`'s error and requirement channels are
      // `AiError | HandlerError<Tools[keyof Tools]>` and `LanguageModel |
      // HandlerServices<…> | ResultDecodingServices<…>`; over a *resolved*
      // toolkit both extras compute to `never` — every tool's parameter,
      // success and failure schema is plain (no encoding or decoding services)
      // and every handler's requirements are discharged by `bind`'s `as`, which
      // provides `CurrentActor` before the effect leaves the handler. Over an
      // unresolved `Tools` those conditionals simply stay deferred, so TS
      // cannot see the `never` it would compute a line later. It held for the
      // one concrete toolkit that used to be here and it holds for both now;
      // `hob.test.ts` drives each of them end to end.
      (
        chat.streamText({ prompt: say, toolkit }) as Stream.Stream<
          Response.StreamPart<Tools>,
          AiError.AiError | Schema.SchemaError,
          LanguageModel.LanguageModel
        >
      ).pipe(
        // The type arguments are named rather than inferred: `filterMapEffect`
        // takes its element type from the stream through `NoInfer`, and
        // `Response.StreamPart<Tools>` over an unresolved `Tools` gives it
        // nothing to resolve against, so it picks one member of the union.
        Stream.filterMapEffect<
          Response.StreamPart<Tools>,
          HobEvent,
          Response.StreamPart<Tools>,
          never,
          never
        >(
          (
            part: Response.StreamPart<Tools>,
          ): Effect.Effect<Result.Result<HobEvent, Response.StreamPart<Tools>>> =>
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
                  return (yield* gotNowhere(outputs)) ? Result.succeed(ranOut) : Result.fail(part);
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
                  ? round(chat, toolkit, budget - 1, finished, outputs)
                  : Stream.empty,
            ),
          ),
        ),
        // Outside the recursion on purpose, so it also covers a later round: a
        // model that gets one call right and the next one wrong is the ordinary
        // case, and the budget is already decremented by the time we are here.
        Stream.catch((error) => recover(chat, toolkit, budget, finished, outputs, error)),
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
const gotNowhere = (outputs: OutputSlots): Effect.Effect<boolean> =>
  Effect.map(
    Effect.all([
      Ref.get(outputs.proposal),
      outputs.awareness === undefined ? Effect.succeed([]) : Ref.get(outputs.awareness),
      outputs.touchedDirect === undefined ? Effect.succeed(false) : Ref.get(outputs.touchedDirect),
    ]),
    ([offered, candidates, touched]) =>
      offered === undefined && candidates.length === 0 && !touched,
  );

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
const recover = <Tools extends AnyTools>(
  chat: Chat.Service,
  toolkit: Toolkit.WithHandler<Tools>,
  budget: number,
  finished: Ref.Ref<string>,
  outputs: OutputSlots,
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
      Effect.map(gotNowhere(outputs), (nowhere) =>
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
      round(chat, toolkit, budget - 1, finished, outputs, [
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

/**
 * ## The model would not use its build tools, said out loud
 *
 * **The failure this whole block exists for is the one that says nothing.** A
 * DM asks for an encounter, the model answers in prose, and the panel shows a
 * plausible sentence and no card — with nothing anywhere saying Hob tried to
 * build something and did not. `round` drops a finish that called no tool and
 * stopped cleanly, which is exactly right for an ordinary prose answer and is
 * exactly why this is invisible. It is also common rather than rare: with every
 * tool offered, the captain's own configured 4B chose a `propose*` tool **once
 * in five attempts**, and character drafting ships on that path.
 *
 * Two signatures, both measured (`data/tav-hob-no-proposal-card/report.md`) and
 * both implemented below:
 *
 * 1. **the model printed the call** — a fenced block naming a `propose*` tool
 *    inside the reply, rather than calling it. Seen at 4B and at 1B;
 * 2. **a build was asked for and none was made.**
 *
 * ### Three gates, and every one of them is structural
 *
 * The report is emitted from `tail`, which reads what the whole answer
 * produced, so all three are properties of where the check sits rather than
 * rules somebody has to keep:
 *
 * - **nothing was offered.** The proposal slot is read at the very end, after
 *   the last round, so this report cannot land beside a card. That is the same
 *   pair `gotNowhere` refuses and it must not be reintroduced here: *"it did
 *   not build anything"* beside the thing it built is the one shape this
 *   surface must never have.
 * - **nothing else already failed.** `broke` is set by `note` on any `failed`
 *   event, so a truncation, an unreadable call, an exhausted budget or a
 *   provider error is said once and this stays quiet. One apology per answer.
 * - **no build tool call arrived.** A model that called `proposeEncounter` and
 *   had it *refused* — an invented creature id, a second offer in one turn —
 *   made a usable call and got an answer it could read, so this stays quiet
 *   there: the refusal went back to the model, which usually explains itself. A
 *   call the framework could not *decode* is the other way round — nothing
 *   reached a handler, `recover` handed the complaint back, and if the model
 *   then answers in prose the person is in exactly the state this reports. Which
 *   is why the sentence says *a usable build tool call* rather than naming what
 *   the model did or did not reach for.
 *
 * ### And the fourth gate is a judgement, so it is deliberately timid
 *
 * **A false positive here is worse than a miss.** Somebody talking to Hob about
 * their campaign who never asked it to build anything must not be told the
 * model refused, so the two surfaces answer *"was a build asked for"*
 * differently — and the asymmetry is a fact about the surfaces rather than a
 * hedge:
 *
 * - **the DM's panel is general chat**, so silence is the default and
 *   {@link askedForABuild} has to opt in: a present-tense make-verb, then one
 *   of the things this toolkit can build within a few words of it. It misses
 *   plenty (*"give me a name for the ferryman"* is a build ask and does not
 *   match), which is the direction to miss in;
 * - **a player's is the character-drafting composer and nothing else** — its
 *   own prompt is *draft, do not interview*, and its input is normally a
 *   paragraph describing somebody, with no verb in it at all. So the default
 *   there is that a draft was wanted, and the exclusion is
 *   {@link aQuestionAboutIt}: a follow-up like *"what did you give her for
 *   skills?"* is a question about the draft, not a request for another.
 */

/**
 * Whether a tool builds something, by the one convention this toolkit keeps.
 *
 * Every tool that fills the proposal slot is named `propose*` — the DM's three
 * and the player's one — so this needs no list to fall out of step with, and
 * `hob.test.ts` pins the convention over both toolkits.
 */
const isBuildTool = (name: string): boolean => /^propose[A-Z]/.test(name);

/** A fenced block, as a model writes one. */
const FENCED = /```[\s\S]*?```/g;

/**
 * Parameter names a `propose*` tool takes and nothing a person writes does.
 *
 * A fingerprint of this toolkit's own schemas, and the second half of signature
 * 1 — because the measured 4B fence names the *arguments* and leaves the tool's
 * name in the prose above it, which the first half cannot see. Three camelCase
 * identifiers that a model only ever emits when it is writing out a call it did
 * not make; `hob.test.ts` pins that each is really in a published schema, so
 * the fingerprint cannot quietly stop matching anything.
 */
const BUILD_ARGUMENTS: ReadonlyArray<string> = [
  "creatureId",
  "abilityOrder",
  "readAloud",
  "sourceExcerpt",
];

/**
 * Signature 1: the model wrote the tool call out instead of making it.
 *
 * Two measured shapes, and neither subsumes the other:
 *
 * - **the name in call position** — `proposeEncounter "The Marsh Encounter":
 *   …`, which is what a 1B put in the panel as ordinary reply text, and
 *   `proposeCharacter({…})`. The character after the name is the whole of the
 *   discrimination: a model saying *"I offered it with proposeEncounter."*
 *   about a call it really made must stay quiet, and it does;
 * - **the arguments in a fence** — *"```json { "name": "Goblin Ambush",
 *   "creatures": [ { "creatureId": …"*, measured at 4B, where the tool's name
 *   is in the sentence before the block rather than in it.
 *
 * Exported for the tests, which drive it over both.
 */
export const printedTheCall = (said: string): boolean =>
  /\bpropose[A-Z][A-Za-z]*\s*["'({:]/.test(said) ||
  (said.match(FENCED) ?? []).some(
    (block) => block.includes("{") && BUILD_ARGUMENTS.some((name) => block.includes(name)),
  );

/**
 * Verbs that ask for something to be made, in the strong sense.
 *
 * Present tense and imperative only. *"wrote"*, *"made"* and *"built"* are what
 * a question about the record uses, and leaving them out is most of what keeps
 * *"who wrote this note?"* quiet.
 */
const MAKE_VERBS: ReadonlyArray<string> = [
  "make",
  "build",
  "write",
  "write up",
  "draft",
  "create",
  "generate",
  "invent",
  "design",
  "sketch",
  "compose",
  "prep",
  "prepare",
  "come up with",
  "put together",
  "throw together",
  "whip up",
  "cook up",
  "roll up",
];

/**
 * Verbs that ask for one weakly, and therefore need a concrete noun.
 *
 * *"give me an encounter"* is a build ask; *"give me something to read about
 * the ferryman"* is not, and the difference is only the noun — which is why
 * {@link VAGUE_NOUNS} is offered to {@link MAKE_VERBS} and not to these.
 */
const WANT_VERBS: ReadonlyArray<string> = [
  "give me",
  "give us",
  "need",
  "want",
  "propose",
  "suggest",
  "add",
];

/** The things the DM's toolkit can build, in the words a DM uses for them. */
const DM_NOUNS: ReadonlyArray<string> = [
  "encounter",
  "encounters",
  "fight",
  "fights",
  "combat",
  "battle",
  "battles",
  "ambush",
  "skirmish",
  "monster",
  "monsters",
  "note",
  "notes",
  "read-aloud",
  "read aloud",
  "boxed text",
  "beat",
  "beats",
];

/** *"build me something"* names no table and is still a build ask. */
const VAGUE_NOUNS: ReadonlyArray<string> = ["something", "anything", "one", "it"];

/**
 * Words that turn a make-verb just after them into a question about the record.
 *
 * *"did I write a note about the ferryman"* and *"what did you make her"* both
 * carry a verb from the list above and neither is asking for anything new.
 */
const RECORD_MARKERS: ReadonlyArray<string> = [
  "did",
  "didn't",
  "what",
  "who",
  "who's",
  "when",
  "where",
  "which",
  "why",
  "how",
  "have",
  "has",
  "had",
  "already",
];

/** How far after a verb its object may sit before the pair stops meaning much. */
const OBJECT_WINDOW = 6;

/** Openers that make a sentence a question rather than a request. */
const QUESTION_OPENERS: ReadonlyArray<string> = [
  "what",
  "who",
  "when",
  "where",
  "which",
  "why",
  "how",
  "did",
  "does",
  "do",
  "is",
  "are",
  "was",
  "were",
  "have",
  "has",
];

/** Lower-cased words, keeping the hyphen in *read-aloud* and the apostrophe. */
const words = (text: string): ReadonlyArray<string> =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .split(" ")
    .filter((word) => word !== "");

/** Whether `phrase` — one word or several — begins at `at`. */
const phraseAt = (tokens: ReadonlyArray<string>, at: number, phrase: string): boolean =>
  phrase.split(" ").every((part, step) => tokens[at + step] === part);

/** The longest of `phrases` beginning at `at`, so *"write up"* beats *"write"*. */
const longestAt = (
  phrases: ReadonlyArray<string>,
  tokens: ReadonlyArray<string>,
  at: number,
): string | undefined =>
  phrases
    .filter((phrase) => phraseAt(tokens, at, phrase))
    .sort((left, right) => right.length - left.length)[0];

/**
 * Signature 2, on the DM's side: they asked for one of the things Hob builds.
 *
 * A make-verb or a want-verb, not preceded by a {@link RECORD_MARKERS} word,
 * with one of {@link DM_NOUNS} inside {@link OBJECT_WINDOW} words after it.
 * Exported for the tests, which is where the whole of the judgement is visible:
 * the table there is the specification.
 */
export const askedForABuild = (asked: string): boolean => {
  const tokens = words(asked);
  const wanted = DM_NOUNS.map((noun) => words(noun).join(" ")).filter((noun) => noun !== "");
  for (let at = 0; at < tokens.length; at += 1) {
    const strong = longestAt(MAKE_VERBS, tokens, at);
    const verb = strong ?? longestAt(WANT_VERBS, tokens, at);
    if (verb === undefined) continue;
    if (tokens.slice(Math.max(0, at - 3), at).some((word) => RECORD_MARKERS.includes(word))) {
      continue;
    }
    const from = at + verb.split(" ").length;
    const looking = strong === undefined ? wanted : [...wanted, ...VAGUE_NOUNS];
    const until = Math.min(tokens.length, from + OBJECT_WINDOW);
    for (let object = from; object < until; object += 1) {
      if (looking.some((noun) => phraseAt(tokens, object, noun))) return true;
    }
  }
  return false;
};

/**
 * Signature 2, on the player's side, inverted: this is a question about the
 * draft rather than a request for one.
 *
 * The composer's input is normally a description with no verb in it, so the
 * default there is *yes, they wanted a draft* and this is the only way out of
 * it. Both halves are needed: *"why did you make her a druid?"* is a question,
 * and *"can you make her taller?"* opens with a word that is not on the list
 * and is a redraft.
 */
export const aQuestionAboutIt = (asked: string): boolean => {
  const opener = words(asked)[0];
  return opener !== undefined && QUESTION_OPENERS.includes(opener) && asked.trimEnd().endsWith("?");
};

/** The judgement, once. See the block comment above for all four gates. */
const wouldNotBuild = (reach: "dm" | "own", asked: string, said: string): boolean =>
  printedTheCall(said) || (reach === "dm" ? askedForABuild(asked) : !aQuestionAboutIt(asked));

/**
 * What the person is told, in their own terms.
 *
 * Two sentences and two ways on, because the next move genuinely differs: a DM
 * writes the encounter on the campaign screen, and a player fills the sheet in
 * on the form this composer has always been an accelerator over. Neither blames
 * the question — the report measured this as a decision the model makes, not a
 * phrasing the person got wrong — and both name the model, which is the same
 * voice `unreadable` already uses.
 */
const unbuilt = (reach: "dm" | "own"): HobEvent => ({
  event: "failed",
  data: new HobFailure({
    message:
      reach === "dm"
        ? "Hob answered in words and built nothing you can save — this model did not make " +
          "a usable build tool call, which smaller models often do not. Ask again, or " +
          "write it yourself; a model that handles tool calls better offers a card more often."
        : "Hob answered in words and drafted no sheet — this model did not make a usable " +
          "drafting call, which smaller models often do not. Ask again, or fill the sheet " +
          "in yourself; you can change any of it afterwards.",
  }),
});

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
  /** See the `reachedForOne` ref in `ask`, which is the only thing this fills. */
  reachedForOne: Ref.Ref<boolean>,
  event: HobEvent,
): Effect.Effect<void> => {
  if (event.event === "delta") return Ref.update(written, (text) => text + event.data.text);
  if (event.event === "failed") return Ref.set(broke, true);
  if (event.event === "tool" && event.data.phase === "called" && isBuildTool(event.data.name)) {
    return Ref.set(reachedForOne, true);
  }
  return Effect.void;
};

/**
 * What Hob is told about itself when a **DM** is asking, and what it is not.
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
const dmPrompt = (campaign: Campaign, direct?: HobDirectResourceContext): string =>
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
    "proposeNote or proposeBeat. When your research shows an existing campaign NPC should",
    "explicitly know or remember something, offer a Cast review row with proposeNpcAwareness.",
    "Nothing you offer becomes campaign content or NPC context until the DM accepts it, so",
    "offer it rather than asking permission first. Offer one thing at a time, and say",
    "one short line about it: the DM is already looking at it.",
    "",
    "Quote the DM's own words when they answer the question — they wrote them and they",
    "are already the right length. Keep replies to a sentence or two unless asked for",
    "more; the DM is usually reading this mid-game.",
    "",
    "You can see this one campaign and only what this credential is allowed to read.",
    "That is not a restriction you can work around, and you should not try.",
    ...(direct === undefined
      ? []
      : [
          "",
          "The DM has turned on Hob direct resource spending for the live fight. Only spend",
          "an existing character resource when the DM asks you to; never use it for hit points,",
          "new content or guesses, and say plainly what counter moved.",
        ]),
  ].join("\n");

/**
 * What Hob is told on the **group** surface.
 *
 * Voiced for a member of the whole group rather than for one table's DM, and
 * it says the boundary out loud so the model does not promise reads it does
 * not have: what it can see is what the group has agreed happened — shared
 * recaps, the played timeline, the chronicle — and never anybody's prep.
 */
const groupPrompt = (groupName: string): string =>
  [
    "You are Hob, the assistant behind the bar in Tiny Taverns. You are helping a member",
    `of "${groupName}", a group of people playing tabletop campaigns together.`,
    "",
    "You can see the group's shared record: the chronicle members have written, the",
    "running summary, which campaigns exist and who runs them, and every night that has",
    "actually been played — with its story beats and how its fights ended. You cannot",
    "see anybody's preparation, private notes or plans, and you should say so if asked.",
    "",
    "Everything you say about what happened must come from a tool call. Never state as",
    "fact a name, an event or a night you have not read: if the record does not say,",
    "say that it does not. When two campaigns' records disagree, say they disagree",
    "rather than merging them.",
    "",
    "When a member asks you to record something — a summary of events, a connection",
    "between campaigns — write it and offer it with proposeGroupEntry. Nothing you",
    "offer enters the chronicle unless a member accepts it. Offer one thing at a time,",
    "and say one short line about it.",
    "",
    "Keep replies to a sentence or two unless asked for more.",
  ].join("\n");

/**
 * What Hob is told when a **player** is asking, which is a different job.
 *
 * A second prompt rather than a conditional sentence in the first, for the
 * reason there are two toolkits: the DM's is voiced throughout as *the person
 * running the game*, and a prompt that said "the DM, or possibly not" would be
 * a worse prompt for both. It is a distinct schema on a distinct path, applied
 * to prose.
 *
 * Three things it says that the DM's does not, and each is a measured hazard:
 *
 * - **Draft, do not interview.** The one drawn interaction is a paragraph in,
 *   a sheet out. A model that asks three clarifying questions first has spent
 *   the round budget and produced no card, which reads on screen exactly like
 *   the model failing to call the tool.
 * - **Rank the abilities; do not write numbers.** The tool takes no scores at
 *   all (`toolkit.ts`), and saying so in the prompt as well as in the tool
 *   description is cheap next to a model that writes six numbers into a name
 *   field.
 * - **The record is the DM's, and mostly not shared.** `searchCampaign` for a
 *   player composes `rowReadable`, so at a table whose DM shares nothing it
 *   honestly returns nothing. The instruction not to invent is the same one the
 *   DM's prompt carries and matters more here, because a character sheet is
 *   exactly where a confidently invented setting detail would survive.
 */
const playerPrompt = (campaign: Campaign): string =>
  [
    "You are Hob, the assistant behind the bar in Tiny Taverns. You are helping a player",
    `make a character for "${campaign.name}", a tabletop roleplaying game somebody else runs.`,
    "",
    "They will describe a person in their own words. Read it, and offer them a whole",
    "character with proposeCharacter — a name, a race, a class, a background, the six abilities",
    "ranked most important first, up to four skills, starting spells for a caster, a starting kit",
    "and a short backstory in their register rather than yours. Do not ask clarifying questions",
    "first: draft something, and let them correct it. Nothing you offer is saved until",
    "they keep it.",
    "",
    "Do not write ability scores or modifiers. Rank the six and the standard array is",
    "applied for you. For a caster, call listStartingSpells first and choose spellId",
    "values from that list; never invent a spell id. Give a short reason for each real choice in `rationale` — the",
    "player is shown those beside the sheet and they are what they will argue with.",
    "",
    "If they ask for a change — a different class, a harder background — offer a whole",
    "character again, keeping everything they did not ask you to change.",
    "",
    "You may search this campaign's record with searchCampaign, and what you find there",
    "is worth using: a character who fits the place reads better than one who does not.",
    "You can only see what the DM has shared, which is often nothing at all. Never state",
    "as fact a place, a person or an event you have not read — if the record does not",
    "say, write the character without it.",
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
 * reason it is on the wire: an offer that was kept and an offer still sitting
 * there are different facts, and only one of them is a row in the campaign.
 *
 * The `character` case is the one this matters most for; see it below.
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
    /**
     * **The redraft loop is this case**, and without it *"make her a ranger
     * instead"* reaches a model that cannot see the druid it just wrote — so it
     * drafts a fresh person from the original paragraph and silently loses
     * every choice the player was happy with.
     *
     * It is the fullest of the four because a character draft is the one
     * proposal a follow-up is *expected* to be about. The abilities are read
     * back as the ranking rather than as six cells, because the ranking is what
     * the tool takes: a model shown `STR 8 (-1)` and asked for scores it cannot
     * send is a model one round from a schema error.
     */
    case "character": {
      const line = [proposal.race, proposal.className].filter((part) => part !== null).join(" ");
      const ranked = [...proposal.sheet.abilities]
        .sort((a, b) => Number(b.score) - Number(a.score))
        .map((ability) => ability.label)
        .join(" > ");
      const skills = (proposal.sheet.skills ?? []).map((skill) => skill.name).join(", ");
      const identity = proposal.sheet.identity;
      const parts = [
        line === "" ? undefined : line,
        ranked === "" ? undefined : `abilities ranked ${ranked}`,
        skills === "" ? undefined : `skills ${skills}`,
        identity?.subclass === undefined ? undefined : `subclass ${identity.subclass}`,
        identity?.background === undefined ? undefined : `background ${identity.background}`,
        proposal.sheet.notes === "" ? undefined : `backstory: ${proposal.sheet.notes}`,
      ].filter((part) => part !== undefined);
      return `[You offered the player a character called "${proposal.name}" — ${kept}: ${parts.join("; ")}]`;
    }
  }
};

const promptFor = (
  system: string,
  history: ReadonlyArray<HobTurn>,
  ask: HobAsk,
): Prompt.RawInput => [
  { role: "system" as const, content: system },
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
const toHobEvent = <Tools extends AnyTools>(
  part: Response.StreamPart<Tools>,
): Result.Result<HobEvent, Response.StreamPart<Tools>> => {
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
