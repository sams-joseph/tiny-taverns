import { NodeHttpServer } from "@effect/platform-node";
import {
  type AssistantTurnId,
  type CampaignId,
  type NpcId,
  type NpcAwarenessCandidateId,
  type NpcKnowledgeFactId,
  type NpcMemoryId,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { NPC_PROMPT_TEMPLATE_VERSION } from "../src/assistant/npcPrompt.js";
import { campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The cast over HTTP — the real application, the client derived from the
 * declaration, and no model configured, which is what CI runs.
 *
 * `npcs.test.ts` proves the repositories and the loop; this file proves the
 * *wire*: that every endpoint decodes, that a player at the table and a
 * stranger are refused with the campaign's ordinary 404, and that a rehearsal
 * with no model behind it is the declared 503 rather than a stack trace.
 */
const database = migratedDatabase("taverns_test_npcs_api");
const services = servicesOver(database);

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
    Layer.provideMerge(database),
  ),
);
afterAll(() => runtime.dispose());

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });

const issue = (name: string) =>
  runtime.runPromise(
    Effect.flatMap(Accounts, (accounts) => accounts.issue(name)).pipe(
      Effect.map((issued) => issued.token),
      Effect.orDie,
    ),
  );

let creator: string;
let player: string;
let stranger: string;
let campaignId: CampaignId;

beforeAll(async () => {
  creator = await issue("Jo");
  player = await issue("Pim");
  stranger = await issue("Bo");

  campaignId = await runtime.runPromise(
    Effect.gen(function* () {
      const dm = yield* clientFor(creator);
      const campaign = yield* campaignVia(dm, { name: "The Salt Road", visibility: "shared" });
      // A real player, through a real invitation.
      const issued = yield* dm.invites.create({
        params: { groupId: campaign.groupId },
        payload: { label: "Pim", campaignId: campaign.id },
      });
      const pim = yield* clientFor(player);
      yield* pim.join.redeem({ payload: { token: issued.token } });
      return campaign.id;
    }).pipe(Effect.orDie),
  );
}, 60_000);

describe("the npcs group", () => {
  let cazril: NpcId;

  it("round-trips an NPC: create, list, find, update, archive, restore", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const dm = yield* clientFor(creator);
        const made = yield* dm.npcs.create({
          params: { campaignId },
          payload: {
            name: "Cazril",
            role: "the ferryman",
            persona: { identity: { summary: "Takes names, not coin." } },
            privateMaterial: { secrets: "He owes the hag." },
          },
        });
        cazril = made.id;
        const listed = yield* dm.npcs.list({ params: { campaignId }, query: {} });
        const found = yield* dm.npcs.findById({ params: { campaignId, npcId: made.id } });
        const updated = yield* dm.npcs.update({
          params: { campaignId, npcId: made.id },
          payload: { expectedVersion: made.version, role: "the ferryman at the crossing" },
        });
        const stale = yield* Effect.result(
          dm.npcs.update({
            params: { campaignId, npcId: made.id },
            payload: { expectedVersion: made.version, role: "nobody" },
          }),
        );
        const archived = yield* dm.npcs.archive({
          params: { campaignId, npcId: made.id },
          payload: {},
        });
        const liveAfter = yield* dm.npcs.list({ params: { campaignId }, query: {} });
        const shelf = yield* dm.npcs.list({ params: { campaignId }, query: { archived: true } });
        const restored = yield* dm.npcs.restore({
          params: { campaignId, npcId: made.id },
          payload: {},
        });
        return { made, listed, found, updated, stale, archived, liveAfter, shelf, restored };
      }).pipe(Effect.orDie),
    );

    expect(seen.made).toMatchObject({ name: "Cazril", version: 1, archivedAt: null });
    expect(seen.made.privateMaterial).toEqual({ secrets: "He owes the hag." });
    expect(seen.listed.map((npc) => npc.id)).toEqual([seen.made.id]);
    expect(seen.found.id).toBe(seen.made.id);
    expect(seen.updated.version).toBe(2);
    expect(seen.stale._tag).toBe("Failure");
    expect(seen.stale._tag === "Failure" && seen.stale.failure).toMatchObject({ _tag: "Conflict" });
    expect(seen.archived.archivedAt).not.toBeNull();
    expect(seen.liveAfter).toEqual([]);
    expect(seen.shelf.map((npc) => npc.id)).toEqual([seen.made.id]);
    expect(seen.restored.archivedAt).toBeNull();
  }, 60_000);

  it("manages explicit knowledge and approved memory over HTTP", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const dm = yield* clientFor(creator);
        const fact = yield* dm.npcs.createKnowledge({
          params: { campaignId, npcId: cazril },
          payload: {
            body: "Cazril knows the ford by the willow.",
            sourceKind: "manual",
            sourceLabel: "Typed by Jo",
          },
        });
        const changedFact = yield* dm.npcs.updateKnowledge({
          params: { campaignId, npcId: cazril, factId: fact.id },
          payload: { body: "Cazril knows the ford by the black willow." },
        });
        const draft = yield* dm.npcs.draftMemory({
          params: { campaignId, npcId: cazril },
          payload: { body: "The party promised a true name." },
        });
        const approved = yield* dm.npcs.approveMemory({
          params: { campaignId, npcId: cazril, memoryId: draft.id },
          payload: {},
        });
        const memories = yield* dm.npcs.memories({ params: { campaignId, npcId: cazril } });
        const status = yield* dm.npcs.rehearsal({ params: { campaignId, npcId: cazril } });
        const retired = yield* dm.npcs.retireKnowledge({
          params: { campaignId, npcId: cazril, factId: fact.id },
          payload: {},
        });
        const reset = yield* dm.npcs.resetMemories({
          params: { campaignId, npcId: cazril },
          payload: {},
        });
        const factsAfter = yield* dm.npcs.knowledge({ params: { campaignId, npcId: cazril } });
        const memoriesAfter = yield* dm.npcs.memories({ params: { campaignId, npcId: cazril } });
        return {
          fact,
          changedFact,
          approved,
          memories,
          status,
          retired,
          reset,
          factsAfter,
          memoriesAfter,
        };
      }).pipe(Effect.orDie),
    );

    expect(seen.changedFact.body).toBe("Cazril knows the ford by the black willow.");
    expect(seen.memories.map((memory) => memory.id)).toEqual([seen.approved.id]);
    expect(seen.approved.status).toBe("approved");
    expect(seen.status).toMatchObject({
      knowledgeIncluded: 1,
      knowledgeTotal: 1,
      memoriesIncluded: 1,
      memoriesTotal: 1,
    });
    expect(seen.retired.retiredAt).not.toBeNull();
    expect(seen.reset.every((memory) => memory.retiredAt !== null)).toBe(true);
    expect(seen.factsAfter[0]?.retiredAt).not.toBeNull();
    expect(seen.memoriesAfter.every((memory) => memory.retiredAt !== null)).toBe(true);
  }, 60_000);

  it("curates Hob-researched awareness candidates over HTTP", async () => {
    const candidate = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const thread = yield* sql<{ readonly id: string }>`
          insert into assistant_thread (campaign_id, title)
          values (${campaignId}, 'awareness api test')
          returning id
        `;
        const turn = yield* sql<{ readonly id: AssistantTurnId }>`
          with made as (select gen_random_uuid() as id)
          insert into assistant_turn (id, thread_id, who, body, origin, assistant_turn_id)
          select made.id, ${thread[0]!.id}, 'hob', 'candidate', 'assistant', made.id from made
          returning id
        `;
        const rows = yield* sql<{
          readonly id: NpcAwarenessCandidateId;
          readonly version: number;
        }>`
          insert into npc_awareness_candidate ${sql.insert({
            npc_id: cazril,
            kind: "knowledge",
            body: "Cazril knows the secret ford price.",
            source_kind: "recap",
            source_label: "Session 4 recap",
            source_excerpt: "The ford asks for a name.",
            rationale: "The toll comes up in play.",
            origin: "assistant",
            assistant_turn_id: turn[0]!.id,
          })}
          returning id, version
        `;
        return rows[0]!;
      }).pipe(Effect.orDie),
    );

    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const dm = yield* clientFor(creator);
        const listed = yield* dm.npcs.awarenessCandidates({
          params: { campaignId, npcId: cazril },
        });
        const updated = yield* dm.npcs.updateAwarenessCandidate({
          params: { campaignId, npcId: cazril, candidateId: candidate.id },
          payload: {
            expectedVersion: candidate.version,
            body: "Cazril knows the ford's secret price.",
            sourceLabel: "Kept recap copy",
          },
        });
        const stale = yield* Effect.result(
          dm.npcs.updateAwarenessCandidate({
            params: { campaignId, npcId: cazril, candidateId: candidate.id },
            payload: { expectedVersion: candidate.version, body: "stale" },
          }),
        );
        const approved = yield* dm.npcs.approveAwarenessCandidate({
          params: { campaignId, npcId: cazril, candidateId: candidate.id },
          payload: { expectedVersion: updated.version },
        });
        const facts = yield* dm.npcs.knowledge({ params: { campaignId, npcId: cazril } });
        return { listed, updated, stale, approved, facts };
      }).pipe(Effect.orDie),
    );

    expect(seen.listed.map((row) => row.id)).toContain(candidate.id);
    expect(seen.updated).toMatchObject({
      body: "Cazril knows the ford's secret price.",
      sourceLabel: "Kept recap copy",
      version: candidate.version + 1,
    });
    expect(seen.stale._tag).toBe("Failure");
    expect(seen.stale._tag === "Failure" && seen.stale.failure).toMatchObject({
      _tag: "Conflict",
    });
    expect(seen.approved.acceptedKnowledgeFactId).not.toBeNull();
    expect(seen.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: seen.approved.acceptedKnowledgeFactId,
          body: "Cazril knows the ford's secret price.",
          sourceLabel: "Kept recap copy",
          origin: "assistant",
          assistantTurnId: seen.approved.assistantTurnId,
        }),
      ]),
    );
  }, 60_000);

  it("answers the rehearsal status as unavailable, with the prompt metadata, and no threads yet", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const dm = yield* clientFor(creator);
        const status = yield* dm.npcs.rehearsal({ params: { campaignId, npcId: cazril } });
        const threads = yield* dm.npcs.threads({ params: { campaignId, npcId: cazril } });
        const rehearse = yield* Effect.result(
          dm.npcs.rehearse({ params: { campaignId, npcId: cazril }, payload: { text: "hello" } }),
        );
        return { status, threads, rehearse };
      }).pipe(Effect.orDie),
    );

    expect(seen.status).toMatchObject({
      available: false,
      model: null,
      npc: "Cazril",
      templateVersion: NPC_PROMPT_TEMPLATE_VERSION,
    });
    expect(seen.status.estimatedTokens).toBeGreaterThan(0);
    expect(seen.threads).toEqual([]);
    expect(seen.rehearse._tag).toBe("Failure");
    expect(seen.rehearse._tag === "Failure" && seen.rehearse.failure).toMatchObject({
      _tag: "HobUnavailable",
    });
  }, 60_000);

  it("refuses a player at the table and a stranger with the campaign's 404, on every endpoint", async () => {
    for (const token of [player, stranger]) {
      const outcomes = await runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* clientFor(token);
          const params = { campaignId, npcId: cazril };
          const factId = "2b1f2a1e-0000-4000-8000-00000000a099" as NpcKnowledgeFactId;
          const memoryId = "2b1f2a1e-0000-4000-8000-00000000b099" as NpcMemoryId;
          const sessionId = "2b1f2a1e-0000-4000-8000-00000000c099" as SessionId;
          const candidateId = "2b1f2a1e-0000-4000-8000-00000000c199" as NpcAwarenessCandidateId;
          const attempts: Record<string, Effect.Effect<unknown, unknown>> = {
            list: client.npcs.list({ params: { campaignId }, query: {} }),
            create: client.npcs.create({ params: { campaignId }, payload: { name: "Mine" } }),
            find: client.npcs.findById({ params }),
            update: client.npcs.update({ params, payload: { name: "Renamed" } }),
            archive: client.npcs.archive({ params, payload: {} }),
            restore: client.npcs.restore({ params, payload: {} }),
            rehearsal: client.npcs.rehearsal({ params }),
            rehearse: client.npcs.rehearse({ params, payload: { text: "hello" } }),
            threads: client.npcs.threads({ params }),
            sessionMonitor: client.npcs.sessionMonitor({ params: { campaignId, sessionId } }),
            openSession: client.npcs.openSession({
              params: { ...params, sessionId },
              payload: {},
            }),
            pauseSession: client.npcs.pauseSession({
              params: { ...params, sessionId },
              payload: {},
            }),
            resumeSession: client.npcs.resumeSession({
              params: { ...params, sessionId },
              payload: {},
            }),
            closeSession: client.npcs.closeSession({
              params: { ...params, sessionId },
              payload: {},
            }),
            knowledge: client.npcs.knowledge({ params }),
            createKnowledge: client.npcs.createKnowledge({
              params,
              payload: { body: "mine", sourceKind: "manual", sourceLabel: "mine" },
            }),
            updateKnowledge: client.npcs.updateKnowledge({
              params: { ...params, factId },
              payload: { body: "mine" },
            }),
            retireKnowledge: client.npcs.retireKnowledge({
              params: { ...params, factId },
              payload: {},
            }),
            memories: client.npcs.memories({ params }),
            draftMemory: client.npcs.draftMemory({ params, payload: { body: "mine" } }),
            updateMemory: client.npcs.updateMemory({
              params: { ...params, memoryId },
              payload: { body: "mine" },
            }),
            approveMemory: client.npcs.approveMemory({
              params: { ...params, memoryId },
              payload: {},
            }),
            retireMemory: client.npcs.retireMemory({
              params: { ...params, memoryId },
              payload: {},
            }),
            resetMemories: client.npcs.resetMemories({ params, payload: {} }),
            awarenessCandidates: client.npcs.awarenessCandidates({ params }),
            updateAwarenessCandidate: client.npcs.updateAwarenessCandidate({
              params: { ...params, candidateId },
              payload: { expectedVersion: 1, body: "mine" },
            }),
            approveAwarenessCandidate: client.npcs.approveAwarenessCandidate({
              params: { ...params, candidateId },
              payload: { expectedVersion: 1 },
            }),
            rejectAwarenessCandidate: client.npcs.rejectAwarenessCandidate({
              params: { ...params, candidateId },
              payload: { expectedVersion: 1 },
            }),
          };
          return yield* Effect.all(
            Object.fromEntries(
              Object.entries(attempts).map(([name, attempt]) => [name, Effect.result(attempt)]),
            ),
          );
        }).pipe(Effect.orDie),
      );

      for (const [name, outcome] of Object.entries(outcomes)) {
        expect(outcome._tag, name).toBe("Failure");
        expect(outcome._tag === "Failure" && outcome.failure, name).toMatchObject({
          _tag: "NotFound",
          resource: "campaign",
        });
      }
    }
    // And nothing the player or the stranger attempted left a row behind.
    const listed = await runtime.runPromise(
      Effect.flatMap(clientFor(creator), (dm) =>
        dm.npcs.list({ params: { campaignId }, query: {} }),
      ).pipe(Effect.orDie),
    );
    expect(listed.map((npc) => npc.name)).toEqual(["Cazril"]);
  }, 60_000);
});
