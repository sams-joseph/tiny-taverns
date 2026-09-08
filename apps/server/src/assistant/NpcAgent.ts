import {
  type CampaignId,
  CurrentActor,
  HobUnavailable,
  Npc,
  NpcBegun,
  NpcDelta,
  NpcDone,
  type NpcEvent,
  NpcFailure,
  type NpcId,
  NpcPlayerStatus,
  NpcProposal,
  type NpcProposalContent,
  NpcProposed,
  type NpcRehearse,
  NpcRehearsalStatus,
  type NpcSessionTalk,
  type NpcTalk,
  NpcToolStep,
  type NpcTurnId,
  type SessionId,
  type NotFound,
  type PlayerNpc,
  RateLimited,
  Conflict,
  NoteKind,
} from "@taverns/api";
import { Cause, Context, DateTime, Effect, Layer, Ref, Result, Schema, Stream } from "effect";
import {
  AiError,
  Chat,
  LanguageModel,
  type Prompt,
  type Response,
  Tool,
  Toolkit,
} from "effect/unstable/ai";

/**
 * The tool set of a loop with no tools — what `LanguageModel.streamText`
 * answers with when no toolkit is passed. Named so the stream part type reads
 * as the statement it is.
 */
type NoTools = Record<string, Tool.Any>;
import { type CampaignCreatorActor, CampaignCreatorActors } from "../repo/CreatorActor.js";
import { NpcKnowledge } from "../repo/NpcKnowledge.js";
import { NpcMemories } from "../repo/NpcMemories.js";
import { NpcProposals } from "../repo/NpcProposals.js";
import { Npcs } from "../repo/Npcs.js";
import { NpcThreads, type PlayerNpcRateLimits } from "../repo/NpcThreads.js";
import { assembleNpcPrompt, npcPromptMetadata, type NpcPromptContext } from "./npcPrompt.js";

/**
 * An NPC answers, in character, to its own creator.
 *
 * The provider loop is Hob's shape with the dangerous parts removed: no SQL,
 * no direct campaign writes, and player-direct/private chat has no tools at
 * all. Creator rehearsal and shared-session talk may offer one bounded review
 * proposal; the tool records no destination state, only a pending row the
 * creator can accept later. The prompt is assembled by `npcPrompt.ts` from the
 * NPC row, a capped transcript and the line just spoken; the parts are
 * translated into `NpcEvent`s; the reply is saved in a finalizer with the
 * template version stamped on it. What an NPC knows is exactly what its row
 * holds — this file reads the NPC through `Npcs`, the transcript through
 * `NpcThreads`, and nothing else in the campaign. It has no `SqlClient`, and
 * `hob.test.ts`'s seam sweep over `src/assistant/` covers it.
 *
 * ### Creator-only, from the first line
 *
 * `rehearse` mints a `CampaignCreatorActor` before it reads a byte: a player, a
 * stranger and a revoked member all get the campaign's ordinary `NotFound`,
 * before the response body opens. The private material rides in the prompt
 * **because the creator is the audience** — `assembleNpcPrompt` takes the
 * audience as an argument and renders that section for this one and no other.
 *
 * ### Two layers, one of which answers nothing
 *
 * `NpcAgent.unavailable` mirrors `Hob.unavailable` exactly, down to the error
 * class: `HobUnavailable`, so the one client classifier and the one boot line
 * cover both surfaces. It still resolves the NPC first, so "the model is off"
 * is not a cheaper way to learn which NPCs exist.
 */

export class NpcAgent extends Context.Service<
  NpcAgent,
  {
    /**
     * Whether a model is behind the rehearsal, plus the prompt metadata the
     * inspector shows — the template version and a token estimate of the
     * persona's sections as they stand. Never the prompt.
     */
    readonly status: (
      campaignId: CampaignId,
      npcId: NpcId,
    ) => Effect.Effect<NpcRehearsalStatus, NotFound, CurrentActor>;
    /**
     * One line to the NPC, answered in pieces. The `Effect` half is where
     * authorization lives — an unreachable NPC is a `NotFound` and an
     * unconfigured server a `HobUnavailable`, both before a byte of stream.
     */
    readonly rehearse: (
      campaignId: CampaignId,
      npcId: NpcId,
      ask: NpcRehearse,
    ) => Effect.Effect<Stream.Stream<NpcEvent>, NotFound | HobUnavailable, CurrentActor>;
    readonly playerStatus: (
      campaignId: CampaignId,
      npcId: NpcId,
    ) => Effect.Effect<NpcPlayerStatus, NotFound, CurrentActor>;
    readonly talk: (
      campaignId: CampaignId,
      npcId: NpcId,
      ask: NpcTalk,
    ) => Effect.Effect<
      Stream.Stream<NpcEvent>,
      NotFound | HobUnavailable | RateLimited,
      CurrentActor
    >;
    readonly sessionStatus: (
      campaignId: CampaignId,
      sessionId: SessionId,
      npcId: NpcId,
    ) => Effect.Effect<NpcPlayerStatus, NotFound, CurrentActor>;
    readonly sessionTalk: (
      campaignId: CampaignId,
      sessionId: SessionId,
      npcId: NpcId,
      ask: NpcSessionTalk,
    ) => Effect.Effect<Stream.Stream<NpcEvent>, NotFound | HobUnavailable, CurrentActor>;
  }
>()("NpcAgent") {
  static readonly unavailable: Layer.Layer<
    NpcAgent,
    never,
    Npcs | NpcKnowledge | NpcMemories | NpcThreads | CampaignCreatorActors
  > = Layer.effect(this)(
    Effect.gen(function* () {
      const npcs = yield* Npcs;
      const knowledge = yield* NpcKnowledge;
      const memories = yield* NpcMemories;
      const threads = yield* NpcThreads;
      const creators = yield* CampaignCreatorActors;
      const off = new HobUnavailable({
        message:
          "There is no model behind this NPC. Set HOB_API_URL and HOB_MODEL in " +
          "apps/server/.env.local (see .env.example) and restart the server.",
      });
      const resolve = (campaignId: CampaignId, npcId: NpcId) =>
        Effect.gen(function* () {
          const creator = yield* creators.of(campaignId);
          const npc = yield* npcs.findById(creator, npcId);
          const context = yield* contextFor(creator, npcId, knowledge, memories);
          return { npc, context };
        });
      return {
        status: (campaignId, npcId) =>
          Effect.map(resolve(campaignId, npcId), ({ npc, context }) =>
            statusOf(npc, context, false, null),
          ),
        rehearse: (campaignId, npcId) =>
          Effect.andThen(resolve(campaignId, npcId), Effect.fail(off)),
        playerStatus: (campaignId, npcId) =>
          Effect.gen(function* () {
            const npc = yield* npcs.playerFindById(campaignId, npcId);
            return playerStatusOf(npc, false);
          }),
        talk: (campaignId, npcId) =>
          Effect.andThen(npcs.playerFindById(campaignId, npcId), Effect.fail(off)),
        sessionStatus: (campaignId, sessionId, npcId) =>
          Effect.gen(function* () {
            const npc = yield* threads.sessionFind(campaignId, sessionId, npcId);
            return playerStatusOf(npc, false);
          }),
        sessionTalk: (campaignId, sessionId, npcId) =>
          Effect.andThen(threads.sessionFind(campaignId, sessionId, npcId), Effect.fail(off)),
      };
    }),
  );

  static readonly layer = (options: {
    readonly model: string;
    readonly playerRateLimits?: PlayerNpcRateLimits;
  }): Layer.Layer<
    NpcAgent,
    never,
    | Npcs
    | NpcKnowledge
    | NpcMemories
    | NpcThreads
    | NpcProposals
    | CampaignCreatorActors
    | LanguageModel.LanguageModel
  > =>
    Layer.effect(this)(
      Effect.gen(function* () {
        const languageModel = yield* LanguageModel.LanguageModel;
        const npcs = yield* Npcs;
        const knowledge = yield* NpcKnowledge;
        const memories = yield* NpcMemories;
        const threads = yield* NpcThreads;
        const proposals = yield* NpcProposals;
        const creators = yield* CampaignCreatorActors;

        return {
          status: (campaignId, npcId) =>
            Effect.gen(function* () {
              const creator = yield* creators.of(campaignId);
              const npc = yield* npcs.findById(creator, npcId);
              const context = yield* contextFor(creator, npcId, knowledge, memories);
              return statusOf(npc, context, true, options.model);
            }),

          rehearse: (campaignId, npcId, ask) =>
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // The gate, and the only campaign material this surface reads:
              // the NPC's own row and its own transcript. A `NotFound` here is
              // a 404 before the response body opens.
              const creator = yield* creators.of(campaignId);
              const npc = yield* npcs.findById(creator, npcId);
              const context = yield* contextFor(creator, npcId, knowledge, memories);

              const thread =
                ask.threadId === undefined
                  ? yield* threads.start(creator, npcId, ask.text)
                  : yield* threads.findById(creator, npcId, ask.threadId);
              const history = yield* threads.turns(creator, npcId, thread.id);

              yield* threads.append(creator, npcId, thread.id, {
                id: yield* freshTurnId,
                who: "user",
                text: ask.text,
              });

              // Generated here rather than by the column default, because the
              // client is told it in `began` before there is a reply to save.
              const replyId = yield* freshTurnId;
              const prompt = assembleNpcPrompt(
                npc,
                history,
                ask.text,
                "creator-rehearsal",
                context,
              );

              const written = yield* Ref.make("");
              const broke = yield* Ref.make(false);
              const finished = yield* Ref.make("stop");
              const offered = yield* Ref.make<NpcProposalContent | undefined>(undefined);
              const saved = yield* Ref.make<NpcProposal | undefined>(undefined);

              const answering = npcConversation(
                prompt.messages,
                bindProposalTools(offered),
                finished,
                offered,
              );

              /**
               * Saves what the NPC actually said or offered, however the
               * stream ended. Proposal tools still write no destination rows:
               * they fill `offered`, and this save records one review row tied
               * to the NPC turn before the client sees its proposal id.
               */
              const save = Effect.gen(function* () {
                const existing = yield* Ref.get(saved);
                if (existing !== undefined) return existing;
                const text = yield* Ref.get(written);
                const content = yield* Ref.get(offered);
                if (text === "" && content === undefined) return undefined;
                yield* threads.append(creator, npcId, thread.id, {
                  id: replyId,
                  who: "npc",
                  text,
                  templateVersion: prompt.templateVersion,
                  promptTokens: prompt.estimatedTokens,
                  model: options.model,
                  finishReason: yield* Ref.get(finished),
                });
                if (content === undefined) return undefined;
                const proposal = yield* proposals.record(
                  creator.campaign,
                  npcId,
                  thread.id,
                  replyId,
                  content,
                );
                yield* Ref.set(saved, proposal);
                return proposal;
              }).pipe(Effect.provideService(CurrentActor, actor));

              const tail = Stream.unwrap(
                Effect.gen(function* () {
                  const [reason, failed, text, content] = yield* Effect.all([
                    Ref.get(finished),
                    Ref.get(broke),
                    Ref.get(written),
                    Ref.get(offered),
                  ]);
                  const proposal = content === undefined ? undefined : yield* save;
                  return Stream.fromIterable<NpcEvent>([
                    ...(proposal === undefined
                      ? []
                      : [{ event: "proposal" as const, data: new NpcProposed({ proposal }) }]),
                    ...(failed
                      ? []
                      : text === "" && proposal === undefined
                        ? [silence]
                        : [{ event: "done" as const, data: new NpcDone({ reason }) }]),
                  ]);
                }),
              );

              return Stream.fromIterable<NpcEvent>([
                {
                  event: "began",
                  data: new NpcBegun({
                    threadId: thread.id,
                    turnId: replyId,
                    templateVersion: prompt.templateVersion,
                    estimatedTokens: prompt.estimatedTokens,
                    knowledgeIncluded: prompt.knowledge.included,
                    knowledgeTotal: prompt.knowledge.total,
                    memoriesIncluded: prompt.memories.included,
                    memoriesTotal: prompt.memories.total,
                  }),
                },
              ]).pipe(
                Stream.concat(answering.pipe(Stream.tap((event) => note(written, broke, event)))),
                Stream.concat(tail),
                Stream.provideService(LanguageModel.LanguageModel, languageModel),
                Stream.catchCause((cause) =>
                  Stream.unwrap(
                    Effect.as(
                      Effect.logWarning(
                        `${npc.name}'s reply failed: ${describe(Cause.squash(cause))}`,
                      ),
                      Stream.succeed(failure(apology(Cause.squash(cause)))),
                    ),
                  ),
                ),
                Stream.ensuring(Effect.ignore(save)),
              );
            }),

          playerStatus: (campaignId, npcId) =>
            Effect.gen(function* () {
              const npc = yield* npcs.playerFindById(campaignId, npcId);
              return playerStatusOf(npc, true);
            }),

          talk: (campaignId, npcId, ask) =>
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const npc = yield* npcs.playerFindById(campaignId, npcId);
              const context = yield* playerContextFor(campaignId, npcId, knowledge, memories);

              const thread =
                ask.threadId === undefined
                  ? yield* threads.playerStart(
                      campaignId,
                      npcId,
                      ask.text,
                      playerRateLimitsOf(options),
                    )
                  : yield* threads.playerFindById(campaignId, npcId, ask.threadId);
              const history = yield* threads.playerTurns(campaignId, npcId, thread.id);

              yield* threads.playerAppend(
                campaignId,
                npcId,
                thread.id,
                {
                  id: yield* freshTurnId,
                  who: "user",
                  text: ask.text,
                },
                ask.threadId === undefined ? undefined : playerRateLimitsOf(options),
              );

              const replyId = yield* freshTurnId;
              const prompt = assembleNpcPrompt(
                promptNpc(npc),
                history,
                ask.text,
                "player-direct",
                context,
              );

              const written = yield* Ref.make("");
              const broke = yield* Ref.make(false);
              const finished = yield* Ref.make("stop");

              const answering: Stream.Stream<
                NpcEvent,
                AiError.AiError,
                LanguageModel.LanguageModel
              > = LanguageModel.streamText({ prompt: prompt.messages }).pipe(
                Stream.filterMapEffect(
                  (
                    part: Response.StreamPart<NoTools>,
                  ): Effect.Effect<Result.Result<NpcEvent, Response.StreamPart<NoTools>>> =>
                    Effect.gen(function* () {
                      if (part.type === "finish") {
                        yield* Ref.set(finished, part.reason);
                        return part.reason === "length"
                          ? Result.succeed(truncated)
                          : Result.fail(part);
                      }
                      return toNpcEvent(part);
                    }),
                ),
              );

              const save = Effect.gen(function* () {
                const text = yield* Ref.get(written);
                if (text === "") return;
                yield* threads.playerAppend(campaignId, npcId, thread.id, {
                  id: replyId,
                  who: "npc",
                  text,
                  finishReason: yield* Ref.get(finished),
                });
              }).pipe(Effect.provideService(CurrentActor, actor), Effect.ignore);

              const tail = Stream.unwrap(
                Effect.map(
                  Effect.all([Ref.get(finished), Ref.get(broke), Ref.get(written)]),
                  ([reason, failed, text]) =>
                    Stream.fromIterable<NpcEvent>(
                      failed
                        ? []
                        : text === ""
                          ? [silence]
                          : [{ event: "done" as const, data: new NpcDone({ reason }) }],
                    ),
                ),
              );

              return Stream.fromIterable<NpcEvent>([
                {
                  event: "began",
                  data: new NpcBegun({
                    threadId: thread.id,
                    turnId: replyId,
                  }),
                },
              ]).pipe(
                Stream.concat(answering.pipe(Stream.tap((event) => note(written, broke, event)))),
                Stream.concat(tail),
                Stream.provideService(LanguageModel.LanguageModel, languageModel),
                Stream.catchCause((cause) =>
                  Stream.unwrap(
                    Effect.as(
                      Effect.logWarning(
                        `${npc.name}'s player reply failed: ${describe(Cause.squash(cause))}`,
                      ),
                      Stream.succeed(failure(apology(Cause.squash(cause)))),
                    ),
                  ),
                ),
                Stream.ensuring(Effect.ignore(save)),
              );
            }),

          sessionStatus: (campaignId, sessionId, npcId) =>
            Effect.gen(function* () {
              const npc = yield* threads.sessionFind(campaignId, sessionId, npcId);
              return playerStatusOf(npc, true);
            }),

          sessionTalk: (campaignId, sessionId, npcId, ask) =>
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const npc = yield* threads.sessionFind(campaignId, sessionId, npcId);
              const history = yield* threads.sessionTurns(campaignId, sessionId, npcId);
              const context = yield* sessionContextFor(
                campaignId,
                sessionId,
                npcId,
                knowledge,
                memories,
                threads,
              );
              const user = yield* threads.sessionAppend(campaignId, sessionId, npcId, {
                id: yield* freshTurnId,
                who: "user",
                text: ask.text,
                accountId: actor.accountId,
                requestId: ask.requestId,
              });
              const replyId = yield* freshTurnId;
              if (!user.inserted) {
                return Stream.succeed<NpcEvent>(
                  failure(
                    "That table line was already sent. Wait for the reply already in progress.",
                  ),
                );
              }

              const prompt = assembleNpcPrompt(
                promptNpc(npc),
                history,
                ask.text,
                "session-shared",
                context,
              );

              const written = yield* Ref.make("");
              const broke = yield* Ref.make(false);
              const finished = yield* Ref.make("stop");
              const offered = yield* Ref.make<NpcProposalContent | undefined>(undefined);
              const saved = yield* Ref.make<NpcProposal | undefined>(undefined);
              const threadId = history[0]?.threadId ?? user.turn.threadId;

              const answering = npcConversation(
                prompt.messages,
                bindProposalTools(offered),
                finished,
                offered,
              );

              const save = Effect.gen(function* () {
                const existing = yield* Ref.get(saved);
                if (existing !== undefined) return existing;
                const text = yield* Ref.get(written);
                const content = yield* Ref.get(offered);
                if (text === "" && content === undefined) return undefined;
                yield* threads.sessionAppend(campaignId, sessionId, npcId, {
                  id: replyId,
                  who: "npc",
                  text,
                  templateVersion: prompt.templateVersion,
                  promptTokens: prompt.estimatedTokens,
                  model: options.model,
                  finishReason: yield* Ref.get(finished),
                });
                if (content === undefined) return undefined;
                const proposal = yield* proposals.record(
                  campaignId,
                  npcId,
                  threadId,
                  replyId,
                  content,
                );
                yield* Ref.set(saved, proposal);
                return proposal;
              }).pipe(Effect.provideService(CurrentActor, actor));

              const tail = Stream.unwrap(
                Effect.gen(function* () {
                  const [reason, failed, text, content] = yield* Effect.all([
                    Ref.get(finished),
                    Ref.get(broke),
                    Ref.get(written),
                    Ref.get(offered),
                  ]);
                  const proposal = content === undefined ? undefined : yield* save;
                  return Stream.fromIterable<NpcEvent>([
                    ...(proposal === undefined
                      ? []
                      : [{ event: "proposal" as const, data: new NpcProposed({ proposal }) }]),
                    ...(failed
                      ? []
                      : text === "" && proposal === undefined
                        ? [silence]
                        : [{ event: "done" as const, data: new NpcDone({ reason }) }]),
                  ]);
                }),
              );

              return Stream.fromIterable<NpcEvent>([
                {
                  event: "began",
                  data: new NpcBegun({
                    threadId,
                    turnId: replyId,
                    templateVersion: prompt.templateVersion,
                    estimatedTokens: prompt.estimatedTokens,
                    knowledgeIncluded: prompt.knowledge.included,
                    knowledgeTotal: prompt.knowledge.total,
                    memoriesIncluded: prompt.memories.included,
                    memoriesTotal: prompt.memories.total,
                  }),
                },
              ]).pipe(
                Stream.concat(answering.pipe(Stream.tap((event) => note(written, broke, event)))),
                Stream.concat(tail),
                Stream.provideService(LanguageModel.LanguageModel, languageModel),
                Stream.catchCause((cause) =>
                  Stream.unwrap(
                    Effect.as(
                      Effect.logWarning(
                        `${npc.name}'s table reply failed: ${describe(Cause.squash(cause))}`,
                      ),
                      Stream.succeed(failure(apology(Cause.squash(cause)))),
                    ),
                  ),
                ),
                Stream.ensuring(Effect.ignore(save)),
              );
            }),
        };
      }),
    );
}

const contextFor = (
  creator: CampaignCreatorActor,
  npcId: NpcId,
  knowledge: (typeof NpcKnowledge)["Service"],
  memories: (typeof NpcMemories)["Service"],
): Effect.Effect<NpcPromptContext, NotFound> =>
  Effect.gen(function* () {
    const facts = yield* knowledge.activeForPrompt(creator, npcId);
    const approved = yield* memories.approvedForPrompt(creator, npcId);
    return { knowledge: facts, memories: approved };
  });

const playerRateLimitsOf = (options: { readonly playerRateLimits?: PlayerNpcRateLimits }) =>
  options.playerRateLimits ?? { perPlayerPerMinute: 10, perCampaignPerDay: 500 };

const playerContextFor = (
  campaignId: CampaignId,
  npcId: NpcId,
  knowledge: (typeof NpcKnowledge)["Service"],
  memories: (typeof NpcMemories)["Service"],
): Effect.Effect<NpcPromptContext, NotFound, CurrentActor> =>
  Effect.gen(function* () {
    const facts = yield* knowledge.playerSafeForPrompt(campaignId, npcId);
    const approved = yield* memories.playerSafeForPrompt(campaignId, npcId);
    return { knowledge: facts, memories: approved };
  });

const sessionContextFor = (
  campaignId: CampaignId,
  sessionId: SessionId,
  npcId: NpcId,
  knowledge: (typeof NpcKnowledge)["Service"],
  memories: (typeof NpcMemories)["Service"],
  threads: (typeof NpcThreads)["Service"],
): Effect.Effect<NpcPromptContext, NotFound, CurrentActor> =>
  Effect.gen(function* () {
    const base = yield* playerContextFor(campaignId, npcId, knowledge, memories);
    const session = yield* threads.sessionPromptContext(campaignId, sessionId, npcId);
    return {
      ...base,
      session: {
        number: session.sessionNumber,
        title: session.sessionTitle,
        fight: session.fight,
      },
    };
  });

const promptNpc = (npc: PlayerNpc): Npc =>
  new Npc({
    id: npc.id,
    campaignId: npc.campaignId,
    derivedFrom: null,
    derivedFromVersion: null,
    derivedFromName: null,
    name: npc.name,
    role: npc.role,
    persona: npc.persona,
    privateMaterial: {},
    version: 0,
    archivedAt: null,
    visibility: "shared",
    origin: "authored",
    assistantTurnId: null,
    createdAt: DateTime.fromDateUnsafe(new Date(0)),
    updatedAt: DateTime.fromDateUnsafe(new Date(0)),
  });

const statusOf = (
  npc: Npc,
  context: NpcPromptContext,
  available: boolean,
  model: string | null,
): NpcRehearsalStatus => {
  const metadata = npcPromptMetadata(npc, "creator-rehearsal", context);
  return new NpcRehearsalStatus({
    available,
    model,
    npc: npc.name,
    templateVersion: metadata.templateVersion,
    estimatedTokens: metadata.estimatedTokens,
    knowledgeIncluded: metadata.knowledgeIncluded,
    knowledgeTotal: metadata.knowledgeTotal,
    memoriesIncluded: metadata.memoriesIncluded,
    memoriesTotal: metadata.memoriesTotal,
  });
};

const playerStatusOf = (npc: PlayerNpc, available: boolean): NpcPlayerStatus =>
  new NpcPlayerStatus({
    available,
    npc: npc.name,
  });

const freshTurnId: Effect.Effect<NpcTurnId> = Effect.sync(() => crypto.randomUUID() as NpcTurnId);

const ProposalFailure = Schema.Union([Conflict]);

const ProposeNpcMemory = Tool.make("proposeNpcMemory", {
  description:
    "Offer the campaign creator a memory this NPC should remember. It is only a suggestion: accepting it creates a draft memory, and that draft is still not prompt-visible until the creator approves it.",
  parameters: Schema.Struct({
    body: Schema.String.check(Schema.isLengthBetween(1, 4000)),
  }),
  success: Schema.String,
  failure: ProposalFailure,
  failureMode: "return",
});

const ProposeCampaignNote = Tool.make("proposeCampaignNote", {
  description:
    "Offer the campaign creator a note to save. It is only a suggestion: no note is written unless an authorized creator accepts the stored proposal.",
  parameters: Schema.Struct({
    title: Schema.String.check(Schema.isLengthBetween(1, 80)),
    body: Schema.String.check(Schema.isLengthBetween(1, 4000)),
    noteKind: NoteKind,
  }),
  success: Schema.String,
  failure: ProposalFailure,
  failureMode: "return",
});

const ProposeCampaignBeat = Tool.make("proposeCampaignBeat", {
  description:
    "Offer the campaign creator one line recording what just happened at the table. It is only a suggestion: no beat is written unless an authorized creator accepts it.",
  parameters: Schema.Struct({
    body: Schema.String.check(Schema.isLengthBetween(1, 1000)),
  }),
  success: Schema.String,
  failure: ProposalFailure,
  failureMode: "return",
});

const NpcProposalToolkit = Toolkit.make(ProposeNpcMemory, ProposeCampaignNote, ProposeCampaignBeat);

type NpcProposalSlot = Ref.Ref<NpcProposalContent | undefined>;

const oneProposalOnly = new Conflict({
  message:
    "An NPC can offer one proposal per reply. Answer briefly about the proposal already offered.",
});

const offer = (
  slot: NpcProposalSlot,
  content: NpcProposalContent,
  message: string,
): Effect.Effect<string, Conflict> =>
  Effect.gen(function* () {
    if ((yield* Ref.get(slot)) !== undefined) return yield* oneProposalOnly;
    yield* Ref.set(slot, content);
    return message;
  });

const bindProposalTools = (slot: NpcProposalSlot) =>
  Effect.flatMap(
    NpcProposalToolkit.toHandlers(
      NpcProposalToolkit.of({
        proposeNpcMemory: ({ body }) =>
          offer(
            slot,
            { kind: "memory", body },
            "Offered a memory draft. It will not be remembered unless the creator accepts and then approves it. Say one short line and stop.",
          ),
        proposeCampaignNote: ({ title, body, noteKind }) =>
          offer(
            slot,
            { kind: "note", title, body, noteKind },
            `Offered a ${noteKind === "read_aloud" ? "read-aloud " : ""}note called "${title}". Say one short line and stop.`,
          ),
        proposeCampaignBeat: ({ body }) =>
          offer(
            slot,
            { kind: "beat", body },
            "Offered a beat for the campaign creator to file against the current session. Say one short line and stop.",
          ),
      }),
    ),
    (bound) => Effect.provideContext(NpcProposalToolkit, bound),
  );

const MAX_NPC_PROPOSAL_ROUNDS = 3;

const npcConversation = <Tools extends Record<string, Tool.Any>>(
  prompt: ReadonlyArray<Prompt.MessageEncoded>,
  bind: Effect.Effect<Toolkit.WithHandler<Tools>>,
  finished: Ref.Ref<string>,
  proposal: NpcProposalSlot,
): Stream.Stream<NpcEvent, AiError.AiError | Schema.SchemaError, LanguageModel.LanguageModel> =>
  Stream.unwrap(
    Effect.map(Effect.all([bind, Chat.fromPrompt(prompt)]), ([toolkit, chat]) =>
      npcRound(chat, toolkit, MAX_NPC_PROPOSAL_ROUNDS, finished, proposal),
    ),
  );

const npcRound = <Tools extends Record<string, Tool.Any>>(
  chat: Chat.Service,
  toolkit: Toolkit.WithHandler<Tools>,
  budget: number,
  finished: Ref.Ref<string>,
  proposal: NpcProposalSlot,
): Stream.Stream<NpcEvent, AiError.AiError | Schema.SchemaError, LanguageModel.LanguageModel> =>
  Stream.unwrap(
    Effect.map(Ref.make(false), (calledTool) =>
      (
        chat.streamText({ prompt: [], toolkit }) as Stream.Stream<
          Response.StreamPart<Tools>,
          AiError.AiError | Schema.SchemaError,
          LanguageModel.LanguageModel
        >
      ).pipe(
        Stream.filterMapEffect<
          Response.StreamPart<Tools>,
          NpcEvent,
          Response.StreamPart<Tools>,
          never,
          never
        >((part) =>
          Effect.gen(function* () {
            if (part.type === "tool-call") yield* Ref.set(calledTool, true);
            if (part.type === "finish") {
              yield* Ref.set(finished, part.reason);
              if (part.reason === "length") return Result.succeed(truncated);
              return Result.fail(part);
            }
            return toNpcEvent(part);
          }),
        ),
        Stream.concat(
          Stream.unwrap(
            Effect.map(Effect.all([Ref.get(calledTool), Ref.get(finished)]), ([used, reason]) =>
              used && budget > 1 && reason !== "length"
                ? npcRound(chat, toolkit, budget - 1, finished, proposal)
                : Stream.empty,
            ),
          ),
        ),
      ),
    ),
  );

/**
 * Watches the reply go past: what was said, and whether it broke. A failure
 * sentence is not accumulated — it is the product apologising, not something
 * the NPC said, and it must not become a line of the transcript.
 */
const note = (
  written: Ref.Ref<string>,
  broke: Ref.Ref<boolean>,
  event: NpcEvent,
): Effect.Effect<void> => {
  if (event.event === "delta") return Ref.update(written, (text) => text + event.data.text);
  if (event.event === "failed") return Ref.set(broke, true);
  return Effect.void;
};

const failure = (message: string): NpcEvent => ({
  event: "failed",
  data: new NpcFailure({ message: message === "" ? "The model stopped answering." : message }),
});

/** The model ran out of room. Hob's sentence, because it is the same knob. */
const truncated: NpcEvent = failure(
  "The model ran out of room before it finished — on a model that reasons, the " +
    "thinking is spent out of the same budget. Raise HOB_MAX_TOKENS in " +
    "apps/server/.env.local and try again.",
);

/** The model stopped without saying anything. */
const silence: NpcEvent = failure(
  "The model stopped without saying anything — on a model that reasons, that " +
    "usually means it spent the whole answer thinking. Try again, or raise " +
    "HOB_MAX_TOKENS in apps/server/.env.local.",
);

/**
 * Whatever went wrong, as a sentence written for the person reading the
 * screen. Nothing a framework, a provider or a codec wrote may reach it — the
 * same standard `assistant/Hob.ts` holds, restated here because the two
 * surfaces have different names for themselves.
 */
const apology = (error: unknown): string => {
  if (AiError.isAiError(error)) {
    switch (error.reason._tag) {
      case "NetworkError":
        return (
          "The NPC could not reach the model. Check that the endpoint in HOB_API_URL is " +
          "running, then try again."
        );
      case "InternalProviderError":
        return "The model endpoint failed while answering. Try again in a moment.";
      case "AuthenticationError":
        return "The model endpoint refused the server's credential. Check HOB_API_KEY.";
      case "RateLimitError":
      case "QuotaExhaustedError":
        return "The model turned the request away for asking too often. Try again in a moment.";
      case "ContentPolicyError":
        return "The model refused to answer that one.";
      default:
        break;
    }
  }
  return "Something went wrong while the NPC was answering. Try again.";
};

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The provider's stream parts, as the events the screen understands. Reasoning
 * parts are dropped: a chain of thought is not something the character said.
 */
const detailOf = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const toNpcEvent = <Tools extends Record<string, Tool.Any>>(
  part: Response.StreamPart<Tools>,
): Result.Result<NpcEvent, Response.StreamPart<Tools>> => {
  switch (part.type) {
    case "text-delta":
      return Result.succeed({ event: "delta" as const, data: new NpcDelta({ text: part.delta }) });
    case "tool-call":
      return Result.succeed({
        event: "tool" as const,
        data: new NpcToolStep({ name: part.name, phase: "called", detail: detailOf(part.params) }),
      });
    case "tool-result":
      return Result.succeed({
        event: "tool" as const,
        data: new NpcToolStep({
          name: part.name,
          phase: "answered",
          detail: part.isFailure ? "nothing it could use" : detailOf(part.encodedResult),
        }),
      });
    case "error":
      return Result.succeed(failure(apology(part.error)));
    default:
      return Result.fail(part);
  }
};
