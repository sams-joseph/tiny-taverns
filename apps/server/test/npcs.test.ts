import { describe, expect } from "@effect/vitest";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type Actor,
  type CampaignId,
  Conflict,
  CurrentActor,
  emptyCharacterSheet,
  HobUnavailable,
  type NpcEvent,
  type NpcId,
  type NpcTurnId,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { ConfigProvider, Context, Effect, Fiber, Layer, Result, Stream } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Accounts } from "../src/Accounts.js";
import { npcAgentFromConfig } from "../src/app.js";
import { NpcAgent } from "../src/assistant/NpcAgent.js";
import { NPC_PROMPT_TEMPLATE_VERSION } from "../src/assistant/npcPrompt.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Groups } from "../src/repo/Groups.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { NpcKnowledge } from "../src/repo/NpcKnowledge.js";
import { NpcMemories } from "../src/repo/NpcMemories.js";
import { NpcProposals } from "../src/repo/NpcProposals.js";
import { NpcAwareness } from "../src/repo/NpcAwareness.js";
import { Npcs } from "../src/repo/Npcs.js";
import { NpcThreads } from "../src/repo/NpcThreads.js";
import { Party } from "../src/repo/Party.js";
import { Sessions } from "../src/repo/Sessions.js";
import {
  aCharacterAt,
  anAccount,
  aPlayerAt,
  asDm,
  createCampaign,
  scopedTo,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import {
  type ChatRequest,
  type Round,
  reasoningChunks,
  refused,
  scriptedModel,
  textChunks,
  toolCallChunks,
} from "./support/model.js";
import { describeLayer } from "./support/suite.js";

/**
 * The cast: who may reach an NPC, what a rehearsal persists, and — the
 * assertion this file exists for — **what the model is shown**.
 *
 * Four claims:
 *
 * - **every read and write is the creator's** — a player at the table, a
 *   member whose invitation was revoked, a stranger with a table of their own
 *   and the creator's own credential scoped to another table all get the
 *   campaign's ordinary `NotFound`, from the gate, before any row is read;
 * - **the persona is versioned and the transcript is rows** — a stale
 *   `expectedVersion` is a `Conflict`, an archived NPC keeps its threads and
 *   takes no new lines, and an NPC turn records the template that produced it;
 * - **the provider sees this NPC and nothing else** — its private material,
 *   because the creator is the audience; and *zero bytes* of another
 *   campaign's NPC, a DM-only note, a player's sheet or a player's own Hob
 *   thread, measured at the wire with planted sentinels rather than argued;
 * - **an unconfigured server degrades rather than breaks**, exactly as Hob's
 *   does, and with Hob's error class.
 */

const services = Layer.mergeAll(
  Accounts.layer,
  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  LiveEvents.layer,
  Groups.layer,
  Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
  CampaignCreatorActors.layer,
  HobThreads.layer,
  Invites.layer,
  Notes.layer,
  Npcs.layer,
  NpcKnowledge.layer,
  NpcMemories.layer,
  NpcAwareness.layer.pipe(Layer.provide([NpcKnowledge.layer, NpcMemories.layer])),
  NpcProposals.layer.pipe(
    Layer.provide([
      Campaigns.layer,
      Notes.layer,
      Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
      NpcMemories.layer,
      NpcThreads.layer.pipe(Layer.provide(LiveEvents.layer)),
    ]),
  ),
  NpcThreads.layer.pipe(Layer.provide(LiveEvents.layer)),
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_npcs")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/** Sentinel tokens. Each must appear in exactly the places the assertions name. */
const PRIVATE = "PRIVATECAZRIL";
const OTHER_PUBLIC = "OTHERNPCPUBLIC";
const OTHER_SECRET = "OTHERNPCSECRET";
const DM_NOTE = "DMNOTESECRET";
const PLAYER_SHEET = "PLAYERSHEETSECRET";
const PLAYER_THREAD = "PLAYERTHREADSECRET";
const OWN_FACT = "OWNNPCFACT";
const RETIRED_FACT = "RETIREDNPCFACT";
const APPROVED_MEMORY = "APPROVEDNPCMEMORY";
const DRAFT_MEMORY = "DRAFTNPCMEMORY";

const makeFixture = Effect.gen(function* () {
  const knowledge = yield* NpcKnowledge;
  const memories = yield* NpcMemories;
  const npcs = yield* Npcs;
  const notes = yield* Notes;
  const hob = yield* HobThreads;
  const invites = yield* Invites;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);
  const campaign = yield* as(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  const otherTable = yield* as(createCampaign({ name: "Salt and Sixpence", visibility: "shared" }));
  const creator = yield* as(asDm(dm, campaign.id));
  const otherCreator = yield* as(asDm(dm, otherTable.id));

  const cazril = yield* npcs.create(creator, {
    name: "Cazril",
    role: "the ferryman",
    persona: {
      identity: { summary: "Takes names, not coin." },
      voice: { manner: "Slow and dry.", phrases: ["Names keep. Coin sinks."] },
      boundaries: { refuses: ["Naming the hag"] },
    },
    privateMaterial: { secrets: `${PRIVATE} He owes the hag three years.` },
    visibility: "shared",
  });

  yield* knowledge.create(creator, cazril.id, {
    body: `${OWN_FACT} He knows the old ford by the leaning willow.`,
    sourceKind: "note",
    sourceLabel: "Ford note",
    sourceId: "2b1f2a1e-0000-4000-8000-00000000f001",
    visibility: "shared",
  });
  const staleFact = yield* knowledge.create(creator, cazril.id, {
    body: `${RETIRED_FACT} This should not reach the provider.`,
    sourceKind: "manual",
    sourceLabel: "Retired",
  });
  yield* knowledge.retire(creator, cazril.id, staleFact.id);
  const approved = yield* memories.draft(creator, cazril.id, {
    body: `${APPROVED_MEMORY} The party promised Cazril a true name.`,
    visibility: "shared",
  });
  yield* memories.approve(creator, cazril.id, approved.id);
  yield* memories.draft(creator, cazril.id, {
    body: `${DRAFT_MEMORY} This draft is awaiting approval and must stay out.`,
  });

  // Another NPC at the same DM's other table: the leak that would look like
  // helpfulness, because both are theirs.
  yield* npcs.create(otherCreator, {
    name: "Wick",
    persona: { identity: { summary: `${OTHER_PUBLIC} A lamplighter.` } },
    privateMaterial: { secrets: `${OTHER_SECRET} He set the fire.` },
  });

  // A DM-only note in the same campaign — an NPC in this slice knows nothing
  // of the campaign beyond its own row, so this must not reach the model.
  yield* as(
    notes.create(campaign.id, { title: "The crate", body: `${DM_NOTE} Three teeth and a ledger.` }),
  );

  const player = yield* aPlayerAt(campaign.id, "Pim");
  // Two player-only surfaces: a player's own sheet, and a player's own Hob
  // drafting thread at this very table.
  yield* aCharacterAt(campaign.id, player, {
    name: "Brannoc",
    sheet: { ...emptyCharacterSheet, notes: `${PLAYER_SHEET} Ran from the marsh.` },
  });
  yield* withActor(player)(hob.start("own", campaign.id, `${PLAYER_THREAD} draft me a ranger`));

  const revoked = yield* aPlayerAt(campaign.id, "Odd");
  const issued = yield* invites.listForCampaign(creator);
  const odd = issued.find((invite) => invite.label === "Odd");
  if (odd === undefined) throw new Error("no invitation for Odd");
  yield* invites.revokeForCampaign(creator, odd.id);

  const stranger = yield* anAccount("Someone else");
  yield* withActor(stranger)(createCampaign({ name: "A different table" }));

  return {
    dm,
    creator,
    otherCreator,
    campaign,
    otherTable,
    cazril,
    player,
    revoked,
    stranger,
    scopedElsewhere: scopedTo(dm, otherTable.id),
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "npcs.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

const proofFor = (actor: Actor, campaignId: CampaignId) =>
  asDm(actor, campaignId).pipe(withActor(actor), Effect.result);

const MAX_TOKENS = 512;

interface Rehearsed {
  readonly events: ReadonlyArray<NpcEvent>;
  readonly requests: ReadonlyArray<ChatRequest>;
}

const rehearse = (
  actor: Actor,
  campaignId: CampaignId,
  npcId: NpcId,
  options?: {
    readonly rounds?: ReadonlyArray<Round>;
    readonly text?: string;
    readonly threadId?: Parameters<(typeof NpcAgent)["Service"]["rehearse"]>[2]["threadId"];
  },
) => {
  const model = scriptedModel({
    model: "scripted-local",
    maxTokens: MAX_TOKENS,
    rounds: options?.rounds ?? [textChunks("Names keep. ", "Coin sinks, ", "friend.")],
  });

  return Effect.gen(function* () {
    const agent = yield* NpcAgent;
    const stream = yield* agent.rehearse(campaignId, npcId, {
      text: options?.text ?? "What is your price?",
      ...(options?.threadId === undefined ? {} : { threadId: options.threadId }),
    });
    const events = yield* Stream.runCollect(stream);
    return { events: Array.from(events), requests: model.requests() } satisfies Rehearsed;
  }).pipe(
    withActor(actor),
    Effect.provide(NpcAgent.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
  );
};

const shownTo = (requests: ReadonlyArray<ChatRequest>): string => JSON.stringify(requests);
const requestToolNames = (request: ChatRequest | undefined): ReadonlyArray<string> | undefined =>
  (
    request?.tools as ReadonlyArray<{ readonly function: { readonly name: string } }> | undefined
  )?.map((tool) => tool.function.name);
const texts = (events: ReadonlyArray<NpcEvent>): ReadonlyArray<string> =>
  events.flatMap((event) => (event.event === "delta" ? [event.data.text] : []));
const apologies = (events: ReadonlyArray<NpcEvent>): ReadonlyArray<string> =>
  events.flatMap((event) => (event.event === "failed" ? [event.data.message] : []));
const begunIn = (events: ReadonlyArray<NpcEvent>) => {
  const began = events[0];
  if (began?.event !== "began") throw new Error("no began event");
  return began.data;
};
const proposalsIn = (events: ReadonlyArray<NpcEvent>) =>
  events.flatMap((event) => (event.event === "proposal" ? [event.data.proposal] : []));

const talk = (
  actor: Actor,
  campaignId: CampaignId,
  npcId: NpcId,
  options?: {
    readonly rounds?: ReadonlyArray<Round>;
    readonly text?: string;
    readonly threadId?: Parameters<(typeof NpcAgent)["Service"]["talk"]>[2]["threadId"];
    readonly perPlayerPerMinute?: number;
    readonly perCampaignPerDay?: number;
  },
) => {
  const model = scriptedModel({
    model: "scripted-local",
    maxTokens: MAX_TOKENS,
    rounds: options?.rounds ?? [textChunks("The river is listening.")],
  });

  return Effect.gen(function* () {
    const agent = yield* NpcAgent;
    const stream = yield* agent.talk(campaignId, npcId, {
      text: options?.text ?? "Can I cross?",
      ...(options?.threadId === undefined ? {} : { threadId: options.threadId }),
    });
    const events = yield* Stream.runCollect(stream);
    return { events: Array.from(events), requests: model.requests() } satisfies Rehearsed;
  }).pipe(
    withActor(actor),
    Effect.provide(
      NpcAgent.layer({
        model: "scripted-local",
        playerRateLimits: {
          perPlayerPerMinute: options?.perPlayerPerMinute ?? 10,
          perCampaignPerDay: options?.perCampaignPerDay ?? 500,
        },
      }).pipe(Layer.provide(model.layer)),
    ),
  );
};

const sessionTalk = (
  actor: Actor,
  campaignId: CampaignId,
  sessionId: SessionId,
  npcId: NpcId,
  options?: {
    readonly rounds?: ReadonlyArray<Round>;
    readonly text?: string;
    readonly requestId?: string;
  },
) => {
  const model = scriptedModel({
    model: "scripted-local",
    maxTokens: MAX_TOKENS,
    rounds: options?.rounds ?? [textChunks("The reeds bow back.")],
  });

  return Effect.gen(function* () {
    const agent = yield* NpcAgent;
    const stream = yield* agent.sessionTalk(campaignId, sessionId, npcId, {
      text: options?.text ?? "Cazril, are we safe to cross?",
      requestId: options?.requestId ?? crypto.randomUUID(),
    });
    const events = yield* Stream.runCollect(stream);
    return { events: Array.from(events), requests: model.requests() } satisfies Rehearsed;
  }).pipe(
    withActor(actor),
    Effect.provide(NpcAgent.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
  );
};

describeLayer("npcs", shared, (it) => {
  describe("who reaches the cast", () => {
    it.effect("mints the proof for the creator, and for nobody else at the table", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const creator = yield* proofFor(fixture.dm, fixture.campaign.id);
        const player = yield* proofFor(fixture.player, fixture.campaign.id);
        const revoked = yield* proofFor(fixture.revoked, fixture.campaign.id);
        const stranger = yield* proofFor(fixture.stranger, fixture.campaign.id);
        const scoped = yield* proofFor(fixture.scopedElsewhere, fixture.campaign.id);

        expect(creator._tag).toBe("Success");
        for (const refused of [player, revoked, stranger, scoped]) {
          expect(refused._tag).toBe("Failure");
          expect(refused._tag === "Failure" && refused.failure).toBeInstanceOf(NotFound);
          expect(refused._tag === "Failure" && (refused.failure as NotFound).resource).toBe(
            "campaign",
          );
        }
      }),
    );

    it.effect("refuses a proof spent on another table's NPC, on every method", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The proof carries its campaign, so the same DM's proof for Sixpence
        // reaches nothing of the Salt Road's cast — every method composes
        // `rowWritable` on the proof's own campaign underneath the gate.
        const outcomes = yield* Effect.gen(function* () {
          const npcs = yield* Npcs;
          const threads = yield* NpcThreads;
          const other = fixture.otherCreator;
          const id = fixture.cazril.id;
          const attempts: Record<string, Effect.Effect<unknown, unknown>> = {
            find: npcs.findById(other, id),
            update: npcs.update(other, id, { name: "Nobody" }),
            archive: npcs.archive(other, id),
            restore: npcs.restore(other, id),
            threads: threads.list(other, id),
            start: threads.start(other, id, "hello"),
          };
          return yield* Effect.all(
            Object.fromEntries(
              Object.entries(attempts).map(([name, attempt]) => [name, Effect.result(attempt)]),
            ),
          );
        });

        for (const [name, outcome] of Object.entries(outcomes)) {
          expect(outcome._tag, `${name} did not refuse`).toBe("Failure");
          expect(outcome._tag === "Failure" && outcome.failure, name).toBeInstanceOf(NotFound);
        }
        // And the list on the other table simply does not contain it.
        const listed = yield* Effect.flatMap(Npcs, (npcs) => npcs.list(fixture.otherCreator, {}));
        expect(listed.map((npc) => npc.name)).toEqual(["Wick"]);
      }),
    );
  });

  describe("the persona row", () => {
    it.effect("creates with the column defaults, and lists by name", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const seen = yield* Effect.gen(function* () {
          const npcs = yield* Npcs;
          const bare = yield* npcs.create(fixture.creator, { name: "Anwen" });
          const listed = yield* npcs.list(fixture.creator, {});
          return { bare, names: listed.map((npc) => npc.name) };
        });

        expect(seen.bare).toMatchObject({
          role: "",
          persona: {},
          privateMaterial: {},
          version: 1,
          archivedAt: null,
          derivedFrom: null,
          visibility: "dm",
          origin: "authored",
        });
        expect(seen.names).toEqual(["Anwen", "Cazril"]);
      }),
    );

    it.effect(
      "bumps the version on every write and refuses a stale expectedVersion with a Conflict",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const seen = yield* Effect.gen(function* () {
            const npcs = yield* Npcs;
            const made = yield* npcs.create(fixture.creator, { name: "Fen" });
            const once = yield* npcs.update(fixture.creator, made.id, {
              expectedVersion: made.version,
              role: "the patron",
            });
            const stale = yield* Effect.result(
              npcs.update(fixture.creator, made.id, {
                expectedVersion: made.version,
                role: "somebody else",
              }),
            );
            const unguarded = yield* npcs.update(fixture.creator, made.id, {
              privateMaterial: { instructions: "Never smiles." },
            });
            return { made, once, stale, unguarded };
          });

          expect(seen.once.version).toBe(seen.made.version + 1);
          expect(seen.once.role).toBe("the patron");
          expect(seen.stale._tag).toBe("Failure");
          expect(seen.stale._tag === "Failure" && seen.stale.failure).toBeInstanceOf(Conflict);
          // An unguarded PATCH is last-writer-wins, exactly as a character's is.
          expect(seen.unguarded.version).toBe(seen.made.version + 2);
          expect(seen.unguarded.role).toBe("the patron");
          expect(seen.unguarded.privateMaterial).toEqual({ instructions: "Never smiles." });
        }),
    );

    it.effect("archives reversibly: off the live list, onto the archived one, and back", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const seen = yield* Effect.gen(function* () {
          const npcs = yield* Npcs;
          const threads = yield* NpcThreads;
          const made = yield* npcs.create(fixture.creator, { name: "Zed" });
          const thread = yield* threads.start(fixture.creator, made.id, "before");
          const archived = yield* npcs.archive(fixture.creator, made.id);
          const live = yield* npcs.list(fixture.creator, {});
          const shelf = yield* npcs.list(fixture.creator, { archived: true });
          // A retired persona keeps its transcripts and takes no new lines.
          const kept = yield* threads.list(fixture.creator, made.id);
          const refused = yield* Effect.result(threads.start(fixture.creator, made.id, "after"));
          const restored = yield* npcs.restore(fixture.creator, made.id);
          return { archived, live, shelf, kept, refused, restored, thread };
        });

        expect(seen.archived.archivedAt).not.toBeNull();
        expect(seen.live.map((npc) => npc.name)).not.toContain("Zed");
        expect(seen.shelf.map((npc) => npc.name)).toEqual(["Zed"]);
        expect(seen.kept.map((thread) => thread.id)).toEqual([seen.thread.id]);
        expect(seen.refused._tag).toBe("Failure");
        expect(seen.restored.archivedAt).toBeNull();
      }),
    );
  });

  describe("player direct chat", () => {
    it.effect("lists and finds only shared live NPCs through a player-safe projection", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const seen = yield* Effect.gen(function* () {
          const npcs = yield* Npcs;
          const playerList = yield* npcs.playerList(fixture.campaign.id);
          const playerFound = yield* npcs.playerFindById(fixture.campaign.id, fixture.cazril.id);
          const dmList = yield* npcs
            .playerList(fixture.campaign.id)
            .pipe(withActor(fixture.dm), Effect.result);
          const stranger = yield* npcs
            .playerFindById(fixture.campaign.id, fixture.cazril.id)
            .pipe(withActor(fixture.stranger), Effect.result);
          return { playerList, playerFound, dmList, stranger };
        }).pipe(withActor(fixture.player));

        expect(seen.playerList.map((npc) => npc.name)).toEqual(["Cazril"]);
        expect(seen.playerFound).toMatchObject({
          id: fixture.cazril.id,
          name: "Cazril",
          persona: { identity: { summary: "Takes names, not coin." } },
        });
        expect(JSON.stringify(seen.playerFound)).not.toContain(PRIVATE);
        expect(seen.dmList._tag).toBe("Success");
        expect(seen.stranger._tag).toBe("Failure");
        expect(seen.stranger._tag === "Failure" && seen.stranger.failure).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("refuses a stranger both player lists with NotFound, as it refuses the one NPC", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const lists = (actor: Actor) =>
          Effect.gen(function* () {
            const npcs = yield* Npcs;
            const threads = yield* NpcThreads;
            return {
              cast: yield* Effect.result(npcs.playerList(fixture.campaign.id)),
              threads: yield* Effect.result(
                threads.playerList(fixture.campaign.id, fixture.cazril.id),
              ),
            };
          }).pipe(withActor(actor));

        for (const refused of [fixture.stranger, fixture.scopedElsewhere]) {
          const seen = yield* lists(refused);
          expect(seen.cast._tag === "Failure" && seen.cast.failure).toMatchObject({
            _tag: "NotFound",
            resource: "campaign",
          });
          expect(seen.threads._tag === "Failure" && seen.threads.failure).toMatchObject({
            _tag: "NotFound",
            resource: "npc",
          });
        }

        const player = yield* lists(fixture.player);
        expect(
          player.cast._tag === "Success" && player.cast.success.map((npc) => npc.name),
        ).toEqual(["Cazril"]);
        expect(player.threads._tag).toBe("Success");

        const creator = yield* lists(fixture.dm);
        // The creator's answer is unchanged: every live NPC at the table.
        expect(
          creator.cast._tag === "Success" && creator.cast.success.map((npc) => npc.name),
        ).toContain("Cazril");
        expect(creator.threads._tag).toBe("Success");
      }),
    );

    it.effect("prompts with player-safe material only and stores a private player transcript", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events, requests } = yield* talk(
          fixture.player,
          fixture.campaign.id,
          fixture.cazril.id,
          {
            text: "Can you take me to the ford?",
          },
        );
        const shown = shownTo(requests);
        const began = begunIn(events);

        expect(began.templateVersion).toBeUndefined();
        expect(began.estimatedTokens).toBeUndefined();
        expect(began.knowledgeIncluded).toBeUndefined();
        expect(began.memoriesIncluded).toBeUndefined();
        expect(texts(events)).toEqual(["The river is listening."]);
        expect(events.at(-1)).toMatchObject({ event: "done", data: { reason: "stop" } });
        expect(requests).toHaveLength(1);
        expect(requests[0]?.tools).toBeUndefined();
        expect(shown).toContain("AUDIENCE: private player direct chat");
        expect(shown).toContain("Cazril");
        expect(shown).toContain(OWN_FACT);
        expect(shown).toContain(APPROVED_MEMORY);
        expect(shown).not.toContain(PRIVATE);
        expect(shown).not.toContain(DM_NOTE);
        expect(shown).not.toContain(PLAYER_SHEET);
        expect(shown).not.toContain(PLAYER_THREAD);
        expect(shown).not.toContain(RETIRED_FACT);
        expect(shown).not.toContain(DRAFT_MEMORY);
        expect(shown).not.toContain("2b1f2a1e-0000-4000-8000-00000000f001");
        expect(shown).toContain("does not change campaign canon");

        const visibleToPlayer = yield* Effect.flatMap(NpcThreads, (threads) =>
          threads.playerTurns(fixture.campaign.id, fixture.cazril.id, began.threadId),
        ).pipe(withActor(fixture.player));
        expect(visibleToPlayer.map((turn) => [turn.who, turn.text])).toEqual([
          ["user", "Can you take me to the ford?"],
          ["npc", "The river is listening."],
        ]);
        expect(visibleToPlayer.map((turn) => [turn.templateVersion, turn.promptTokens])).toEqual([
          [null, null],
          [null, null],
        ]);

        const refusedToCreator = yield* Effect.flatMap(NpcThreads, (threads) =>
          threads.turns(fixture.creator, fixture.cazril.id, began.threadId),
        ).pipe(Effect.result);
        expect(refusedToCreator._tag).toBe("Failure");
      }),
    );

    it.effect("rate-limits before the provider is called", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const model = scriptedModel({ model: "scripted-local", maxTokens: MAX_TOKENS, rounds: [] });
        const result = yield* Effect.flatMap(NpcAgent, (agent) =>
          agent.talk(fixture.campaign.id, fixture.cazril.id, { text: "Too soon" }),
        ).pipe(
          withActor(fixture.player),
          Effect.provide(
            NpcAgent.layer({
              model: "scripted-local",
              playerRateLimits: { perPlayerPerMinute: 0, perCampaignPerDay: 500 },
            }).pipe(Layer.provide(model.layer)),
          ),
          Effect.result,
        );

        expect(result._tag).toBe("Failure");
        expect(result._tag === "Failure" && result.failure).toMatchObject({ _tag: "RateLimited" });
        expect(model.requests()).toHaveLength(0);
      }),
    );
  });

  describe("shared live-session NPC chat", () => {
    it.effect("is opened by the creator and read by active table participants only", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const seen = yield* Effect.gen(function* () {
          const campaigns = yield* Campaigns;
          const sessions = yield* Sessions;
          const threads = yield* NpcThreads;
          const live = yield* LiveEvents;
          const as = withActor(fixture.dm);
          const session = yield* as(
            sessions.create(fixture.campaign.id, {
              number: 77,
              title: "At the ford",
              visibility: "shared",
            }),
          );
          yield* as(campaigns.update(fixture.campaign.id, { currentSessionId: session.id }));
          const opened = yield* threads.openSession(fixture.creator, fixture.cazril.id, session.id);
          const openedAgain = yield* threads.openSession(
            fixture.creator,
            fixture.cazril.id,
            session.id,
          );
          const playerList = yield* withActor(fixture.player)(
            threads.sessionList(fixture.campaign.id, session.id),
          );
          const playerFound = yield* withActor(fixture.player)(
            threads.sessionFind(fixture.campaign.id, session.id, fixture.cazril.id),
          );
          const stranger = yield* withActor(fixture.stranger)(
            threads.sessionList(fixture.campaign.id, session.id),
          ).pipe(Effect.result);
          const revoked = yield* withActor(fixture.revoked)(
            threads.sessionList(fixture.campaign.id, session.id),
          ).pipe(Effect.result);
          const heard = yield* live
            .subscribe(session.id)
            .pipe(
              Stream.take(1),
              Stream.runCollect,
              Effect.timeout("2 seconds"),
              Effect.forkChild({ startImmediately: true }),
            );
          const first = yield* withActor(fixture.player)(
            threads.sessionAppend(fixture.campaign.id, session.id, fixture.cazril.id, {
              id: crypto.randomUUID() as never,
              who: "user",
              text: "Ferryman, the reeds are moving.",
              requestId: "one-visible-line",
            }),
          );
          const duplicate = yield* withActor(fixture.player)(
            threads.sessionAppend(fixture.campaign.id, session.id, fixture.cazril.id, {
              id: crypto.randomUUID() as never,
              who: "user",
              text: "Ferryman, the reeds are moving.",
              requestId: "one-visible-line",
            }),
          );
          const turns = yield* withActor(fixture.player)(
            threads.sessionTurns(fixture.campaign.id, session.id, fixture.cazril.id),
          );
          const rings = yield* Fiber.join(heard);
          return {
            sessionId: session.id,
            opened,
            openedAgain,
            playerList,
            playerFound,
            stranger,
            revoked,
            first,
            duplicate,
            turns,
            rings,
          };
        });

        expect(seen.openedAgain.id).toBe(seen.opened.id);
        expect(seen.playerList.map((npc) => npc.name)).toContain("Cazril");
        expect(seen.playerFound).toMatchObject({ name: "Cazril", sessionState: "open" });
        // The player's reads carry the public persona and never the secrets.
        for (const read of [seen.playerList, seen.playerFound]) {
          const wire = JSON.stringify(read);
          expect(wire).toContain("Takes names, not coin.");
          expect(wire).not.toContain(PRIVATE);
          expect(wire).not.toContain("privateMaterial");
        }
        expect(Result.isFailure(seen.stranger) && seen.stranger.failure._tag).toBe("NotFound");
        expect(Result.isFailure(seen.revoked) && seen.revoked.failure._tag).toBe("NotFound");
        expect(seen.first.inserted).toBe(true);
        expect(Array.from(seen.rings).map((ring) => ring.sessionId)).toEqual([seen.sessionId]);
        expect(seen.duplicate.inserted).toBe(false);
        expect(seen.turns).toHaveLength(1);
        expect(seen.turns[0]).toMatchObject({ who: "user", speakerName: "Pim" });
      }),
    );

    it.effect(
      "lets the creator monitor, pause, resume and close without mutating transcript history",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const seen = yield* Effect.gen(function* () {
            const campaigns = yield* Campaigns;
            const sessions = yield* Sessions;
            const threads = yield* NpcThreads;
            const live = yield* LiveEvents;
            const as = withActor(fixture.dm);
            const session = yield* as(
              sessions.create(fixture.campaign.id, {
                number: 79,
                title: "Market voices",
                visibility: "shared",
              }),
            );
            yield* as(campaigns.update(fixture.campaign.id, { currentSessionId: session.id }));
            const otherSession = yield* as(
              sessions.create(fixture.campaign.id, {
                number: 81,
                title: "Not tonight",
                visibility: "shared",
              }),
            );
            const monitorOther = yield* threads
              .sessionMonitor(fixture.creator, otherSession.id, "scripted-local", true)
              .pipe(Effect.result);
            const opened = yield* threads.openSession(
              fixture.creator,
              fixture.cazril.id,
              session.id,
            );
            const first = yield* withActor(fixture.player)(
              threads.sessionAppend(fixture.campaign.id, session.id, fixture.cazril.id, {
                id: randomUUID() as NpcTurnId,
                who: "user",
                text: "Who paid you, Cazril?",
                requestId: "market-one",
              }),
            );
            const npcReply = yield* withActor(fixture.dm)(
              threads.sessionAppend(fixture.campaign.id, session.id, fixture.cazril.id, {
                id: randomUUID() as NpcTurnId,
                who: "npc",
                text: "Names cost extra.",
                model: "scripted-local",
                finishReason: "stop",
              }),
            );
            const monitored = yield* threads.sessionMonitor(
              fixture.creator,
              session.id,
              "scripted-local",
              true,
            );
            const heard = yield* live
              .subscribe(session.id)
              .pipe(
                Stream.take(3),
                Stream.runCollect,
                Effect.timeout("2 seconds"),
                Effect.forkChild({ startImmediately: true }),
              );
            const paused = yield* threads.pauseSession(
              fixture.creator,
              fixture.cazril.id,
              session.id,
            );
            const pausedPlayer = yield* withActor(fixture.player)(
              threads.sessionFind(fixture.campaign.id, session.id, fixture.cazril.id),
            );
            const pausedAppend = yield* withActor(fixture.player)(
              threads.sessionAppend(fixture.campaign.id, session.id, fixture.cazril.id, {
                id: randomUUID() as NpcTurnId,
                who: "user",
                text: "Answer while paused.",
                requestId: "market-paused",
              }),
            ).pipe(Effect.result);
            const resumed = yield* threads.resumeSession(
              fixture.creator,
              fixture.cazril.id,
              session.id,
            );
            const afterResume = yield* withActor(fixture.player)(
              threads.sessionAppend(fixture.campaign.id, session.id, fixture.cazril.id, {
                id: randomUUID() as NpcTurnId,
                who: "user",
                text: "Then answer after the DM resumes.",
                requestId: "market-two",
              }),
            );
            const closed = yield* threads.closeSession(
              fixture.creator,
              fixture.cazril.id,
              session.id,
            );
            const playerListAfterClose = yield* withActor(fixture.player)(
              threads.sessionList(fixture.campaign.id, session.id),
            );
            const monitorAfterClose = yield* threads.sessionMonitor(
              fixture.creator,
              session.id,
              "scripted-local",
              true,
            );
            const reopen = yield* threads
              .openSession(fixture.creator, fixture.cazril.id, session.id)
              .pipe(Effect.result);
            const rings = yield* Fiber.join(heard);
            return {
              opened,
              first,
              npcReply,
              monitored,
              monitorOther,
              paused,
              pausedPlayer,
              pausedAppend,
              resumed,
              afterResume,
              closed,
              playerListAfterClose,
              monitorAfterClose,
              reopen,
              rings,
            };
          });

          expect(seen.opened.sessionState).toBe("open");
          expect(seen.first.inserted).toBe(true);
          expect(seen.npcReply.turn.text).toBe("Names cost extra.");
          expect(Result.isFailure(seen.monitorOther) && seen.monitorOther.failure._tag).toBe(
            "NotFound",
          );
          expect(seen.monitored).toHaveLength(1);
          expect(seen.monitored[0]).toMatchObject({
            available: true,
            model: "scripted-local",
            pendingProposals: 0,
            npc: { name: "Cazril" },
            thread: { sessionState: "open" },
          });
          expect(
            seen.monitored[0]?.turns.map((turn) => [turn.who, turn.speakerName, turn.text]),
          ).toEqual([
            ["user", "Pim", "Who paid you, Cazril?"],
            ["npc", null, "Names cost extra."],
          ]);
          expect(seen.paused.sessionState).toBe("paused");
          expect(seen.pausedPlayer.sessionState).toBe("paused");
          expect(Result.isFailure(seen.pausedAppend) && seen.pausedAppend.failure._tag).toBe(
            "Conflict",
          );
          expect(seen.resumed.sessionState).toBe("open");
          expect(seen.afterResume.inserted).toBe(true);
          expect(seen.closed.sessionState).toBe("closed");
          expect(seen.playerListAfterClose).toEqual([]);
          expect(seen.monitorAfterClose[0]?.thread.sessionState).toBe("closed");
          expect(seen.monitorAfterClose[0]?.turns.map((turn) => turn.text)).toEqual([
            "Who paid you, Cazril?",
            "Names cost extra.",
            "Then answer after the DM resumes.",
          ]);
          expect(Result.isFailure(seen.reopen) && seen.reopen.failure._tag).toBe("Conflict");
          expect(Array.from(seen.rings).map((ring) => ring.sessionId)).toEqual([
            seen.opened.sessionId,
            seen.opened.sessionId,
            seen.opened.sessionId,
          ]);
        }),
    );

    it.effect("pauses before invoking the session model", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const model = scriptedModel({ model: "scripted-local", maxTokens: MAX_TOKENS, rounds: [] });
        const seen = yield* Effect.gen(function* () {
          const campaigns = yield* Campaigns;
          const sessions = yield* Sessions;
          const threads = yield* NpcThreads;
          const as = withActor(fixture.dm);
          const session = yield* as(
            sessions.create(fixture.campaign.id, {
              number: 80,
              title: "Paused before the line",
              visibility: "shared",
            }),
          );
          yield* as(campaigns.update(fixture.campaign.id, { currentSessionId: session.id }));
          yield* threads.openSession(fixture.creator, fixture.cazril.id, session.id);
          yield* threads.pauseSession(fixture.creator, fixture.cazril.id, session.id);
          const result = yield* Effect.flatMap(NpcAgent, (agent) =>
            agent.sessionTalk(fixture.campaign.id, session.id, fixture.cazril.id, {
              text: "Can you hear me?",
              requestId: "paused-model",
            }),
          ).pipe(
            withActor(fixture.player),
            Effect.provide(
              NpcAgent.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer)),
            ),
            Effect.result,
          );
          const turns = yield* withActor(fixture.dm)(
            threads.sessionTurns(fixture.campaign.id, session.id, fixture.cazril.id),
          );
          return { result, turns };
        });

        expect(Result.isFailure(seen.result) && seen.result.failure._tag).toBe("Conflict");
        expect(seen.turns).toEqual([]);
        expect(model.requests()).toHaveLength(0);
      }),
    );

    it.effect(
      "prompts from player-safe session context and never from secrets or private chats",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const session = yield* Effect.gen(function* () {
            const campaigns = yield* Campaigns;
            const sessions = yield* Sessions;
            const threads = yield* NpcThreads;
            const as = withActor(fixture.dm);
            const session = yield* as(
              sessions.create(fixture.campaign.id, {
                number: 78,
                title: "Lanterns in the rain",
                visibility: "shared",
              }),
            );
            yield* as(campaigns.update(fixture.campaign.id, { currentSessionId: session.id }));
            yield* threads.openSession(fixture.creator, fixture.cazril.id, session.id);
            return session;
          });

          const { events, requests } = yield* sessionTalk(
            fixture.player,
            fixture.campaign.id,
            session.id,
            fixture.cazril.id,
            { text: "Cazril, who is in the fog?" },
          );
          const shown = shownTo(requests);
          const began = begunIn(events);

          expect(began.templateVersion).toBe(NPC_PROMPT_TEMPLATE_VERSION);
          expect(texts(events)).toEqual(["The reeds bow back."]);
          expect(requests).toHaveLength(1);
          expect(requestToolNames(requests[0])).toEqual([
            "proposeNpcMemory",
            "proposeCampaignNote",
            "proposeCampaignBeat",
          ]);
          expect(shown).toContain("AUDIENCE: shared live-session table chat");
          expect(shown).toContain("Session 78: Lanterns in the rain");
          expect(shown).toContain("No shared fight is on the table");
          expect(shown).toContain(OWN_FACT);
          expect(shown).toContain(APPROVED_MEMORY);
          expect(shown).not.toContain(PRIVATE);
          expect(shown).not.toContain(DM_NOTE);
          expect(shown).not.toContain(PLAYER_THREAD);
          expect(shown).not.toContain(PLAYER_SHEET);
          expect(shown).not.toContain(RETIRED_FACT);
          expect(shown).not.toContain(DRAFT_MEMORY);

          const visibleToCreator = yield* Effect.flatMap(NpcThreads, (threads) =>
            threads.sessionTurns(fixture.campaign.id, session.id, fixture.cazril.id),
          ).pipe(withActor(fixture.dm));
          expect(visibleToCreator.map((turn) => [turn.who, turn.speakerName, turn.text])).toEqual([
            ["user", "Pim", "Cazril, who is in the fog?"],
            ["npc", null, "The reeds bow back."],
          ]);
        }),
    );
  });

  describe("rehearsing", () => {
    it.effect(
      "streams the reply in pieces, says which thread and turn first, and ends on done",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const { events } = yield* rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id);

          expect(events[0]?.event).toBe("began");
          expect(texts(events)).toEqual(["Names keep. ", "Coin sinks, ", "friend."]);
          expect(events.at(-1)).toMatchObject({ event: "done", data: { reason: "stop" } });
          const began = begunIn(events);
          expect(began.templateVersion).toBe(NPC_PROMPT_TEMPLATE_VERSION);
          expect(began.estimatedTokens).toBeGreaterThan(50);
          expect(began.knowledgeIncluded).toBe(1);
          expect(began.knowledgeTotal).toBe(1);
          expect(began.memoriesIncluded).toBe(1);
          expect(began.memoriesTotal).toBe(1);
        }),
    );

    it.effect("persists both lines, with the template version stamped on the NPC's", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id, {
          text: "Will you take us at dawn?",
        });
        const began = begunIn(events);

        const turns = yield* Effect.flatMap(NpcThreads, (threads) =>
          threads.turns(fixture.creator, fixture.cazril.id, began.threadId),
        );

        expect(turns.map((turn) => [turn.who, turn.text])).toEqual([
          ["user", "Will you take us at dawn?"],
          ["npc", "Names keep. Coin sinks, friend."],
        ]);
        expect(turns[0]).toMatchObject({ templateVersion: null, promptTokens: null });
        expect(turns[1]).toMatchObject({
          id: began.turnId,
          templateVersion: NPC_PROMPT_TEMPLATE_VERSION,
          promptTokens: began.estimatedTokens,
        });
        // And the thread is listed for the NPC, named after the first line.
        const threads = yield* Effect.flatMap(NpcThreads, (repo) =>
          repo.list(fixture.creator, fixture.cazril.id),
        );
        expect(threads.find((thread) => thread.id === began.threadId)?.title).toBe(
          "Will you take us at dawn?",
        );
      }),
    );

    it.effect("continues a thread: the second line's prompt carries the first exchange", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const first = yield* rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id, {
          text: "Do you remember me?",
        });
        const { threadId } = begunIn(first.events);
        const second = yield* rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id, {
          text: "And my name?",
          threadId,
          rounds: [textChunks("I keep every one.")],
        });

        const messages = second.requests[0]?.messages ?? [];
        expect(messages.map((message) => message["role"])).toEqual([
          "system",
          "user",
          "assistant",
          "user",
        ]);
        expect(messages[1]?.["content"]).toBe("Do you remember me?");
        expect(messages[2]?.["content"]).toBe("Names keep. Coin sinks, friend.");
        expect(messages[3]?.["content"]).toBe("And my name?");
        expect(begunIn(second.events).threadId).toBe(threadId);
      }),
    );

    it.effect(
      "shows the model this NPC — private material included, because the creator is the audience — and nothing else",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const { requests } = yield* rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id);
          const shown = shownTo(requests);

          // One request when no tool is called; proposals are bounded review tools,
          // not direct campaign writes.
          expect(requests).toHaveLength(1);
          expect(requestToolNames(requests[0])).toEqual([
            "proposeNpcMemory",
            "proposeCampaignNote",
            "proposeCampaignBeat",
          ]);
          expect(requests[0]?.max_tokens).toBe(MAX_TOKENS);

          // Present: the persona, the creator-only material, and only explicit
          // active/approved NPC context copied onto this NPC.
          expect(shown).toContain("Cazril");
          expect(shown).toContain("Names keep. Coin sinks.");
          expect(shown).toContain(PRIVATE);
          expect(shown).toContain(OWN_FACT);
          expect(shown).toContain(APPROVED_MEMORY);
          expect(shown).toContain("source id 2b1f2a1e-0000-4000-8000-00000000f001");

          // Absent — zero bytes, in the one request there is: another campaign's
          // NPC (public and private), a DM-only note at this table, a player's
          // sheet, a player's own Hob thread.
          expect(shown).not.toContain(OTHER_PUBLIC);
          expect(shown).not.toContain(OTHER_SECRET);
          expect(shown).not.toContain("Wick");
          expect(shown).not.toContain(DM_NOTE);
          expect(shown).not.toContain(PLAYER_SHEET);
          expect(shown).not.toContain(PLAYER_THREAD);
          expect(shown).not.toContain(RETIRED_FACT);
          expect(shown).not.toContain(DRAFT_MEMORY);
          expect(shown).not.toContain("Brannoc");
        }),
    );

    it.effect(
      "refuses everyone but the creator before a byte of stream, with the ordinary NotFound",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          for (const actor of [
            fixture.player,
            fixture.revoked,
            fixture.stranger,
            fixture.scopedElsewhere,
          ]) {
            const model = scriptedModel({
              model: "scripted-local",
              maxTokens: MAX_TOKENS,
              rounds: [],
            });
            const result = yield* Effect.flatMap(NpcAgent, (agent) =>
              agent.rehearse(fixture.campaign.id, fixture.cazril.id, { text: "hello" }),
            ).pipe(
              withActor(actor),
              Effect.provide(
                NpcAgent.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer)),
              ),
              Effect.result,
            );
            expect(result._tag).toBe("Failure");
            expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
            // The model was never called.
            expect(model.requests()).toHaveLength(0);
          }
        }),
    );

    it.effect(
      "reports a model that ran out of room, and one that said nothing, as written failures",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const truncated = yield* rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id, {
            rounds: [reasoningChunks("thinking about the river")],
          });
          const silent = yield* rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id, {
            rounds: [textChunks()],
          });

          expect(apologies(truncated.events)).toEqual([expect.stringContaining("HOB_MAX_TOKENS")]);
          expect(truncated.events.some((event) => event.event === "done")).toBe(false);
          expect(apologies(silent.events)).toEqual([
            expect.stringContaining("stopped without saying anything"),
          ]);
          // A failure sentence is the product's, not the NPC's: nothing is saved.
          const turns = yield* Effect.flatMap(NpcThreads, (threads) =>
            threads.turns(fixture.creator, fixture.cazril.id, begunIn(silent.events).threadId),
          );
          expect(turns.map((turn) => turn.who)).toEqual(["user"]);
        }),
    );

    it.effect(
      "apologises in a written sentence when the endpoint refuses, never in the provider's words",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const { events } = yield* rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id, {
            rounds: [refused(401, '{"error":{"message":"Incorrect API key provided"}}')],
          });
          const said = apologies(events);

          expect(said).toHaveLength(1);
          expect(said[0]).toContain("HOB_API_KEY");
          expect(said[0]).not.toContain("Incorrect API key");
          expect(events.some((event) => event.event === "done")).toBe(false);
        }),
    );
  });

  describe("NPC proposals", () => {
    it.effect(
      "records a tool offer as a review row, and accepting a memory keeps approval governance",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const { events, requests } = yield* rehearse(
            fixture.dm,
            fixture.campaign.id,
            fixture.cazril.id,
            {
              rounds: [
                toolCallChunks("proposeNpcMemory", { body: "Remember that Mara paid in pearls." }),
                textChunks("I will keep that ready for your review."),
              ],
            },
          );
          const offered = proposalsIn(events);

          expect(requests).toHaveLength(2);
          expect(events.some((event) => event.event === "tool")).toBe(true);
          expect(offered).toHaveLength(1);
          expect(offered[0]).toMatchObject({ kind: "memory", state: "pending" });

          const accepted = yield* Effect.flatMap(NpcProposals, (repo) =>
            repo.accept(fixture.creator, fixture.cazril.id, offered[0]!.id),
          ).pipe(withActor(fixture.dm));
          expect(accepted.state).toBe("accepted");
          expect(accepted.acceptedMemoryId).not.toBeNull();

          const memories = yield* Effect.flatMap(NpcMemories, (repo) =>
            repo.list(fixture.creator, fixture.cazril.id),
          );
          expect(memories.find((memory) => memory.id === accepted.acceptedMemoryId)).toMatchObject({
            body: "Remember that Mara paid in pearls.",
            status: "draft",
          });
        }),
    );

    it.effect(
      "accepts notes and beats from immutable stored content, and refuses repeat decisions",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const made = yield* Effect.gen(function* () {
            const campaigns = yield* Campaigns;
            const sessions = yield* Sessions;
            const threads = yield* NpcThreads;
            const proposals = yield* NpcProposals;
            const thread = yield* threads.start(
              fixture.creator,
              fixture.cazril.id,
              "What should I save?",
            );
            const session = yield* sessions.create(fixture.campaign.id, { number: 103 });
            yield* campaigns.update(fixture.campaign.id, { currentSessionId: session.id });
            const noteTurn = randomUUID() as NpcTurnId;
            yield* threads.append(fixture.creator, fixture.cazril.id, thread.id, {
              id: noteTurn,
              who: "npc",
              text: "A note may help.",
            });
            const note = yield* proposals.record(
              fixture.campaign.id,
              fixture.cazril.id,
              thread.id,
              noteTurn,
              {
                kind: "note",
                title: "Cazril's price",
                body: "Pearls sink first.",
                noteKind: "note",
              },
            );

            const beatTurn = randomUUID() as NpcTurnId;
            yield* threads.append(fixture.creator, fixture.cazril.id, thread.id, {
              id: beatTurn,
              who: "npc",
              text: "A beat may help.",
            });
            const beat = yield* proposals.record(
              fixture.campaign.id,
              fixture.cazril.id,
              thread.id,
              beatTurn,
              { kind: "beat", body: "Cazril named pearls as the safe toll." },
            );

            const rejectedTurn = randomUUID() as NpcTurnId;
            yield* threads.append(fixture.creator, fixture.cazril.id, thread.id, {
              id: rejectedTurn,
              who: "npc",
              text: "This one is rejected.",
            });
            const rejected = yield* proposals.record(
              fixture.campaign.id,
              fixture.cazril.id,
              thread.id,
              rejectedTurn,
              { kind: "memory", body: "Forget this immediately." },
            );
            return { note, beat, rejected, session };
          }).pipe(withActor(fixture.dm));

          const accepted = yield* Effect.gen(function* () {
            const proposals = yield* NpcProposals;
            const note = yield* proposals.accept(fixture.creator, fixture.cazril.id, made.note.id);
            const beat = yield* proposals.accept(fixture.creator, fixture.cazril.id, made.beat.id);
            const secondAccept = yield* Effect.result(
              proposals.accept(fixture.creator, fixture.cazril.id, made.note.id),
            );
            const rejected = yield* proposals.reject(
              fixture.creator,
              fixture.cazril.id,
              made.rejected.id,
              {
                reason: "Not canon.",
              },
            );
            const secondReject = yield* Effect.result(
              proposals.reject(fixture.creator, fixture.cazril.id, made.rejected.id, {}),
            );
            return { note, beat, secondAccept, rejected, secondReject };
          }).pipe(withActor(fixture.dm));

          expect(accepted.note.acceptedNoteId).not.toBeNull();
          expect(accepted.beat.acceptedBeatId).not.toBeNull();
          expect(accepted.secondAccept._tag).toBe("Failure");
          expect(accepted.rejected).toMatchObject({
            state: "rejected",
            rejectionReason: "Not canon.",
          });
          expect(accepted.secondReject._tag).toBe("Failure");

          const noteRows = yield* Effect.map(
            Effect.flatMap(asDm(fixture.dm, fixture.campaign.id), (creator) =>
              Effect.flatMap(Notes, (repo) => repo.list(creator, {})),
            ),
            (page) => page.items,
          ).pipe(withActor(fixture.dm));
          const beatRows = yield* Effect.map(
            Effect.flatMap(Beats, (repo) => repo.list(fixture.campaign.id, made.session.id, {})),
            (page) => page.items,
          ).pipe(withActor(fixture.dm));
          expect(noteRows.map((note) => note.id)).toContain(accepted.note.acceptedNoteId);
          expect(beatRows.map((beat) => beat.id)).toContain(accepted.beat.acceptedBeatId);
        }),
    );
  });

  describe("with no model configured", () => {
    const agentThroughEnv = <A, E>(
      actor: Actor,
      use: (agent: (typeof NpcAgent)["Service"]) => Effect.Effect<A, E, CurrentActor>,
    ) =>
      Effect.flatMap(NpcAgent, use).pipe(
        withActor(actor),
        Effect.provide(
          npcAgentFromConfig.pipe(
            Layer.provide([
              Npcs.layer,
              NpcKnowledge.layer,
              NpcMemories.layer,
              NpcProposals.layer.pipe(
                Layer.provide([
                  Campaigns.layer,
                  Notes.layer,
                  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
                  NpcMemories.layer,
                  NpcThreads.layer.pipe(Layer.provide(LiveEvents.layer)),
                ]),
              ),
              NpcThreads.layer.pipe(Layer.provide(LiveEvents.layer)),
              CampaignCreatorActors.layer,
            ]),
          ),
        ),
        // Outermost, so it covers the layer's construction — see hob.test.ts.
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env: {} })),
        Effect.result,
      );

    it.effect("answers status as unavailable, still carrying the prompt metadata", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const status = yield* agentThroughEnv(fixture.dm, (agent) =>
          agent.status(fixture.campaign.id, fixture.cazril.id),
        );

        expect(status._tag).toBe("Success");
        expect(status._tag === "Success" && status.success).toMatchObject({
          available: false,
          model: null,
          npc: "Cazril",
          templateVersion: NPC_PROMPT_TEMPLATE_VERSION,
          knowledgeIncluded: 1,
          knowledgeTotal: 1,
          memoriesIncluded: 1,
          memoriesTotal: 1,
        });
      }),
    );

    it.effect("refuses a rehearsal with Hob's declared unavailability, not a crash", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const result = yield* agentThroughEnv(fixture.dm, (agent) =>
          agent.rehearse(fixture.campaign.id, fixture.cazril.id, { text: "hello" }),
        );

        expect(result._tag).toBe("Failure");
        expect(result._tag === "Failure" && result.failure).toBeInstanceOf(HobUnavailable);
      }),
    );

    it.effect("still refuses a stranger, rather than leaking that the model is off", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const status = yield* agentThroughEnv(fixture.stranger, (agent) =>
          agent.status(fixture.campaign.id, fixture.cazril.id),
        );

        expect(status._tag).toBe("Failure");
        expect(status._tag === "Failure" && status.failure).toBeInstanceOf(NotFound);
      }),
    );
  });

  describe("the seam", () => {
    const assistantDirectory = fileURLToPath(new URL("../src/assistant", import.meta.url));
    const code = (path: string): string =>
      readFileSync(path, "utf8")
        .replaceAll(/\/\*[\s\S]*?\*\//g, "")
        .replaceAll(/\/\/.*$/gm, "");

    it("keeps the NPC loop free of SQL and of every campaign repository but its own two", () => {
      // The NPC knows what its row holds. This is what makes the sentinel test
      // above a property rather than a measurement of one fixture: there is no
      // import through which a note, a character or another campaign could
      // arrive.
      const files = readdirSync(assistantDirectory).filter((name) => /^[Nn]pc/.test(name));
      expect(files.sort()).toEqual(["NpcAgent.ts", "npcPrompt.ts"]);
      for (const name of files) {
        const source = code(`${assistantDirectory}/${name}`);
        expect(source, name).not.toMatch(/\bsql`/);
        expect(source, name).not.toContain('"effect/unstable/sql"');
        const repositories = [...source.matchAll(/from "\.\.\/repo\/(\w+)\.js"/g)].map((m) => m[1]);
        expect(repositories.sort(), name).toEqual(
          name === "NpcAgent.ts"
            ? ["CreatorActor", "NpcKnowledge", "NpcMemories", "NpcProposals", "NpcThreads", "Npcs"]
            : [],
        );
        // Proposal tools are bounded to review rows; no assistant file may reach
        // destination campaign repositories directly.
      }
    });

    it("keeps creator-only reads behind the proof and spells the player seam explicitly", () => {
      // Slice 3 adds a second, narrow player projection. The creator-only methods
      // still take the proof; the player methods are the only place these repos may
      // mention `account_id` or the readable seam.
      const repos = ["Npcs.ts", "NpcKnowledge.ts", "NpcMemories.ts", "NpcThreads.ts"].map(
        (name) =>
          [name, code(fileURLToPath(new URL(`../src/repo/${name}`, import.meta.url)))] as const,
      );
      for (const [name, source] of repos) {
        if (name === "NpcThreads.ts") {
          expect(source).toContain("npc_thread.account_id = ");
        } else if (name === "NpcMemories.ts") {
          expect(source).toContain("npc_thread.account_id is null");
          expect(source).not.toContain("npc_thread.account_id = ");
        } else {
          expect(source).not.toContain("npc_thread.account_id");
        }
        expect(source).not.toContain("creator_account_id");
      }
    });

    it("builds every player NPC from the narrow column list, never `npc.*`", () => {
      // The player row's decode drops the wide columns, so a `select npc.*`
      // behind it is invisible on the wire and in every runtime test. The rule is
      // that the wide columns are not selected on a player's path at all, so it
      // is checked here, over every statement that decodes to `PlayerNpcRow`.
      const sourceDirectory = fileURLToPath(new URL("../src", import.meta.url));
      const files = readdirSync(sourceDirectory, { recursive: true, encoding: "utf8" }).filter(
        (name) => name.endsWith(".ts"),
      );
      const statements = files.flatMap((name) =>
        code(`${sourceDirectory}/${name}`)
          .split("SqlSchema.find")
          .slice(1)
          .filter((read) => read.includes("Result: PlayerNpcRow,"))
          .map((read) => {
            const statement = read.slice(read.indexOf("sql`") + 4);
            return [name, statement.slice(0, statement.indexOf("`"))] as const;
          }),
      );
      expect(statements.map(([name]) => name).sort()).toEqual([
        "repo/NpcThreads.ts",
        "repo/NpcThreads.ts",
        "repo/NpcThreads.ts",
        "repo/Npcs.ts",
        "repo/Npcs.ts",
      ]);
      for (const [name, statement] of statements) {
        expect(statement, name).toContain("${playerNpcColumns(sql)}");
        expect(statement, name).not.toMatch(/\bnpc\.\*/);
        expect(statement, name).not.toContain("private_material");
      }
    });

    it.effect(
      "keeps the migration's promise: an NPC turn is generated content that names no Hob turn",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const outcome = yield* Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            const threads = yield* NpcThreads;
            const thread = yield* threads.start(fixture.creator, fixture.cazril.id, "schema");
            const authoredNpcTurn = yield* sql`
          insert into npc_turn (thread_id, who, body, origin) values (${thread.id}, 'npc', 'x', 'authored')
        `.pipe(Effect.exit);
            const userTurnWithTemplate = yield* sql`
          insert into npc_turn (thread_id, who, body, template_version) values (${thread.id}, 'user', 'x', 'v')
        `.pipe(Effect.exit);
            return {
              authoredNpcTurn: authoredNpcTurn._tag,
              userTurnWithTemplate: userTurnWithTemplate._tag,
            };
          });

          expect(outcome).toEqual({ authoredNpcTurn: "Failure", userTurnWithTemplate: "Failure" });
        }),
    );
  });
});
