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
  NotFound,
} from "@taverns/api";
import { ConfigProvider, Effect, Layer, ManagedRuntime, Stream } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { npcAgentFromConfig } from "../src/app.js";
import { NpcAgent } from "../src/assistant/NpcAgent.js";
import { NPC_PROMPT_TEMPLATE_VERSION } from "../src/assistant/npcPrompt.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Groups } from "../src/repo/Groups.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { NpcKnowledge } from "../src/repo/NpcKnowledge.js";
import { NpcMemories } from "../src/repo/NpcMemories.js";
import { Npcs } from "../src/repo/Npcs.js";
import { NpcThreads } from "../src/repo/NpcThreads.js";
import { Party } from "../src/repo/Party.js";
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
  reasoningChunks,
  refused,
  scriptedModel,
  textChunks,
} from "./support/model.js";

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
  Campaigns.layer,
  Groups.layer,
  Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
  CampaignCreatorActors.layer,
  HobThreads.layer,
  Invites.layer,
  Notes.layer,
  Npcs.layer,
  NpcKnowledge.layer,
  NpcMemories.layer,
  NpcThreads.layer,
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_npcs")));

const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

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
  const issued = yield* as(invites.list(campaign.groupId));
  const odd = issued.find((invite) => invite.label === "Odd");
  if (odd === undefined) throw new Error("no invitation for Odd");
  yield* as(invites.revoke(campaign.groupId, odd.id));

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

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

const proofFor = (actor: Actor, campaignId: CampaignId) =>
  runtime.runPromise(asDm(actor, campaignId).pipe(withActor(actor), Effect.result));

describe("who reaches the cast", () => {
  it("mints the proof for the creator, and for nobody else at the table", async () => {
    const creator = await proofFor(fixture.dm, fixture.campaign.id);
    const player = await proofFor(fixture.player, fixture.campaign.id);
    const revoked = await proofFor(fixture.revoked, fixture.campaign.id);
    const stranger = await proofFor(fixture.stranger, fixture.campaign.id);
    const scoped = await proofFor(fixture.scopedElsewhere, fixture.campaign.id);

    expect(creator._tag).toBe("Success");
    for (const refused of [player, revoked, stranger, scoped]) {
      expect(refused._tag).toBe("Failure");
      expect(refused._tag === "Failure" && refused.failure).toBeInstanceOf(NotFound);
      expect(refused._tag === "Failure" && (refused.failure as NotFound).resource).toBe("campaign");
    }
  });

  it("refuses a proof spent on another table's NPC, on every method", async () => {
    // The proof carries its campaign, so the same DM's proof for Sixpence
    // reaches nothing of the Salt Road's cast — every method composes
    // `rowWritable` on the proof's own campaign underneath the gate.
    const outcomes = await runtime.runPromise(
      Effect.gen(function* () {
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
      }),
    );

    for (const [name, outcome] of Object.entries(outcomes)) {
      expect(outcome._tag, `${name} did not refuse`).toBe("Failure");
      expect(outcome._tag === "Failure" && outcome.failure, name).toBeInstanceOf(NotFound);
    }
    // And the list on the other table simply does not contain it.
    const listed = await runtime.runPromise(
      Effect.flatMap(Npcs, (npcs) => npcs.list(fixture.otherCreator, {})),
    );
    expect(listed.map((npc) => npc.name)).toEqual(["Wick"]);
  });
});

describe("the persona row", () => {
  it("creates with the column defaults, and lists by name", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const npcs = yield* Npcs;
        const bare = yield* npcs.create(fixture.creator, { name: "Anwen" });
        const listed = yield* npcs.list(fixture.creator, {});
        return { bare, names: listed.map((npc) => npc.name) };
      }),
    );

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
  });

  it("bumps the version on every write and refuses a stale expectedVersion with a Conflict", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
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
      }),
    );

    expect(seen.once.version).toBe(seen.made.version + 1);
    expect(seen.once.role).toBe("the patron");
    expect(seen.stale._tag).toBe("Failure");
    expect(seen.stale._tag === "Failure" && seen.stale.failure).toBeInstanceOf(Conflict);
    // An unguarded PATCH is last-writer-wins, exactly as a character's is.
    expect(seen.unguarded.version).toBe(seen.made.version + 2);
    expect(seen.unguarded.role).toBe("the patron");
    expect(seen.unguarded.privateMaterial).toEqual({ instructions: "Never smiles." });
  });

  it("archives reversibly: off the live list, onto the archived one, and back", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
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
      }),
    );

    expect(seen.archived.archivedAt).not.toBeNull();
    expect(seen.live.map((npc) => npc.name)).not.toContain("Zed");
    expect(seen.shelf.map((npc) => npc.name)).toEqual(["Zed"]);
    expect(seen.kept.map((thread) => thread.id)).toEqual([seen.thread.id]);
    expect(seen.refused._tag).toBe("Failure");
    expect(seen.restored.archivedAt).toBeNull();
  });
});

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
    readonly rounds?: ReadonlyArray<ReturnType<typeof textChunks> | ReturnType<typeof refused>>;
    readonly text?: string;
    readonly threadId?: Parameters<(typeof NpcAgent)["Service"]["rehearse"]>[2]["threadId"];
  },
): Promise<Rehearsed> => {
  const model = scriptedModel({
    model: "scripted-local",
    maxTokens: MAX_TOKENS,
    rounds: options?.rounds ?? [textChunks("Names keep. ", "Coin sinks, ", "friend.")],
  });

  return runtime.runPromise(
    Effect.gen(function* () {
      const agent = yield* NpcAgent;
      const stream = yield* agent.rehearse(campaignId, npcId, {
        text: options?.text ?? "What is your price?",
        ...(options?.threadId === undefined ? {} : { threadId: options.threadId }),
      });
      const events = yield* Stream.runCollect(stream);
      return { events: Array.from(events), requests: model.requests() };
    }).pipe(
      withActor(actor),
      Effect.provide(NpcAgent.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
    ),
  );
};

const shownTo = (requests: ReadonlyArray<ChatRequest>): string => JSON.stringify(requests);
const texts = (events: ReadonlyArray<NpcEvent>): ReadonlyArray<string> =>
  events.flatMap((event) => (event.event === "delta" ? [event.data.text] : []));
const apologies = (events: ReadonlyArray<NpcEvent>): ReadonlyArray<string> =>
  events.flatMap((event) => (event.event === "failed" ? [event.data.message] : []));
const begunIn = (events: ReadonlyArray<NpcEvent>) => {
  const began = events[0];
  if (began?.event !== "began") throw new Error("no began event");
  return began.data;
};

const talk = (
  actor: Actor,
  campaignId: CampaignId,
  npcId: NpcId,
  options?: {
    readonly rounds?: ReadonlyArray<ReturnType<typeof textChunks> | ReturnType<typeof refused>>;
    readonly text?: string;
    readonly threadId?: Parameters<(typeof NpcAgent)["Service"]["talk"]>[2]["threadId"];
    readonly perPlayerPerMinute?: number;
    readonly perCampaignPerDay?: number;
  },
): Promise<Rehearsed> => {
  const model = scriptedModel({
    model: "scripted-local",
    maxTokens: MAX_TOKENS,
    rounds: options?.rounds ?? [textChunks("The river is listening.")],
  });

  return runtime.runPromise(
    Effect.gen(function* () {
      const agent = yield* NpcAgent;
      const stream = yield* agent.talk(campaignId, npcId, {
        text: options?.text ?? "Can I cross?",
        ...(options?.threadId === undefined ? {} : { threadId: options.threadId }),
      });
      const events = yield* Stream.runCollect(stream);
      return { events: Array.from(events), requests: model.requests() };
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
    ),
  );
};

describe("player direct chat", () => {
  it("lists and finds only shared live NPCs through a player-safe projection", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
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
      }).pipe(withActor(fixture.player)),
    );

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
  }, 60_000);

  it("prompts with player-safe material only and stores a private player transcript", async () => {
    const { events, requests } = await talk(
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

    const visibleToPlayer = await runtime.runPromise(
      Effect.flatMap(NpcThreads, (threads) =>
        threads.playerTurns(fixture.campaign.id, fixture.cazril.id, began.threadId),
      ).pipe(withActor(fixture.player)),
    );
    expect(visibleToPlayer.map((turn) => [turn.who, turn.text])).toEqual([
      ["user", "Can you take me to the ford?"],
      ["npc", "The river is listening."],
    ]);
    expect(visibleToPlayer.map((turn) => [turn.templateVersion, turn.promptTokens])).toEqual([
      [null, null],
      [null, null],
    ]);

    const refusedToCreator = await runtime.runPromise(
      Effect.flatMap(NpcThreads, (threads) =>
        threads.turns(fixture.creator, fixture.cazril.id, began.threadId),
      ).pipe(Effect.result),
    );
    expect(refusedToCreator._tag).toBe("Failure");
  }, 60_000);

  it("rate-limits before the provider is called", async () => {
    const model = scriptedModel({ model: "scripted-local", maxTokens: MAX_TOKENS, rounds: [] });
    const result = await runtime.runPromise(
      Effect.flatMap(NpcAgent, (agent) =>
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
      ),
    );

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toMatchObject({ _tag: "RateLimited" });
    expect(model.requests()).toHaveLength(0);
  }, 60_000);
});

describe("rehearsing", () => {
  it("streams the reply in pieces, says which thread and turn first, and ends on done", async () => {
    const { events } = await rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id);

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
  }, 60_000);

  it("persists both lines, with the template version stamped on the NPC's", async () => {
    const { events } = await rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id, {
      text: "Will you take us at dawn?",
    });
    const began = begunIn(events);

    const turns = await runtime.runPromise(
      Effect.flatMap(NpcThreads, (threads) =>
        threads.turns(fixture.creator, fixture.cazril.id, began.threadId),
      ),
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
    const threads = await runtime.runPromise(
      Effect.flatMap(NpcThreads, (repo) => repo.list(fixture.creator, fixture.cazril.id)),
    );
    expect(threads.find((thread) => thread.id === began.threadId)?.title).toBe(
      "Will you take us at dawn?",
    );
  }, 60_000);

  it("continues a thread: the second line's prompt carries the first exchange", async () => {
    const first = await rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id, {
      text: "Do you remember me?",
    });
    const { threadId } = begunIn(first.events);
    const second = await rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id, {
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
  }, 60_000);

  it("shows the model this NPC — private material included, because the creator is the audience — and nothing else", async () => {
    const { requests } = await rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id);
    const shown = shownTo(requests);

    // One request, one round: there is no toolkit and no loop.
    expect(requests).toHaveLength(1);
    expect(requests[0]?.tools).toBeUndefined();
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
  }, 60_000);

  it("refuses everyone but the creator before a byte of stream, with the ordinary NotFound", async () => {
    for (const actor of [
      fixture.player,
      fixture.revoked,
      fixture.stranger,
      fixture.scopedElsewhere,
    ]) {
      const model = scriptedModel({ model: "scripted-local", maxTokens: MAX_TOKENS, rounds: [] });
      const result = await runtime.runPromise(
        Effect.flatMap(NpcAgent, (agent) =>
          agent.rehearse(fixture.campaign.id, fixture.cazril.id, { text: "hello" }),
        ).pipe(
          withActor(actor),
          Effect.provide(
            NpcAgent.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer)),
          ),
          Effect.result,
        ),
      );
      expect(result._tag).toBe("Failure");
      expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
      // The model was never called.
      expect(model.requests()).toHaveLength(0);
    }
  }, 60_000);

  it("reports a model that ran out of room, and one that said nothing, as written failures", async () => {
    const truncated = await rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id, {
      rounds: [reasoningChunks("thinking about the river")],
    });
    const silent = await rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id, {
      rounds: [textChunks()],
    });

    expect(apologies(truncated.events)).toEqual([expect.stringContaining("HOB_MAX_TOKENS")]);
    expect(truncated.events.some((event) => event.event === "done")).toBe(false);
    expect(apologies(silent.events)).toEqual([
      expect.stringContaining("stopped without saying anything"),
    ]);
    // A failure sentence is the product's, not the NPC's: nothing is saved.
    const turns = await runtime.runPromise(
      Effect.flatMap(NpcThreads, (threads) =>
        threads.turns(fixture.creator, fixture.cazril.id, begunIn(silent.events).threadId),
      ),
    );
    expect(turns.map((turn) => turn.who)).toEqual(["user"]);
  }, 60_000);

  it("apologises in a written sentence when the endpoint refuses, never in the provider's words", async () => {
    const { events } = await rehearse(fixture.dm, fixture.campaign.id, fixture.cazril.id, {
      rounds: [refused(401, '{"error":{"message":"Incorrect API key provided"}}')],
    });
    const said = apologies(events);

    expect(said).toHaveLength(1);
    expect(said[0]).toContain("HOB_API_KEY");
    expect(said[0]).not.toContain("Incorrect API key");
    expect(events.some((event) => event.event === "done")).toBe(false);
  }, 60_000);
});

describe("with no model configured", () => {
  const agentThroughEnv = <A, E>(
    actor: Actor,
    use: (agent: (typeof NpcAgent)["Service"]) => Effect.Effect<A, E, CurrentActor>,
  ) =>
    runtime.runPromise(
      Effect.flatMap(NpcAgent, use).pipe(
        withActor(actor),
        Effect.provide(
          npcAgentFromConfig.pipe(
            Layer.provide([
              Npcs.layer,
              NpcKnowledge.layer,
              NpcMemories.layer,
              NpcThreads.layer,
              CampaignCreatorActors.layer,
            ]),
          ),
        ),
        // Outermost, so it covers the layer's construction — see hob.test.ts.
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env: {} })),
        Effect.result,
      ),
    );

  it("answers status as unavailable, still carrying the prompt metadata", async () => {
    const status = await agentThroughEnv(fixture.dm, (agent) =>
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
  }, 60_000);

  it("refuses a rehearsal with Hob's declared unavailability, not a crash", async () => {
    const result = await agentThroughEnv(fixture.dm, (agent) =>
      agent.rehearse(fixture.campaign.id, fixture.cazril.id, { text: "hello" }),
    );

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(HobUnavailable);
  }, 60_000);

  it("still refuses a stranger, rather than leaking that the model is off", async () => {
    const status = await agentThroughEnv(fixture.stranger, (agent) =>
      agent.status(fixture.campaign.id, fixture.cazril.id),
    );

    expect(status._tag).toBe("Failure");
    expect(status._tag === "Failure" && status.failure).toBeInstanceOf(NotFound);
  }, 60_000);
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
          ? ["CreatorActor", "NpcKnowledge", "NpcMemories", "NpcThreads", "Npcs"]
          : [],
      );
      // No toolkit anywhere near it: an NPC has no tools in this slice.
      expect(source, name).not.toMatch(/\bToolkit\b|\bTool\.make\b/);
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

  it("keeps the migration's promise: an NPC turn is generated content that names no Hob turn", async () => {
    const outcome = await runtime.runPromise(
      Effect.gen(function* () {
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
      }),
    );

    expect(outcome).toEqual({ authoredNpcTurn: "Failure", userTurnWithTemplate: "Failure" });
  });
});
