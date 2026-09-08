import {
  Actor,
  type CampaignId,
  CurrentActor,
  type HobEvent,
  type NpcId,
  NotFound,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { Hob } from "../src/assistant/Hob.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors, type CampaignCreatorActor } from "../src/repo/CreatorActor.js";
import { Creatures } from "../src/repo/Creatures.js";
import { EquipmentRepo } from "../src/repo/Equipment.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { Groups } from "../src/repo/Groups.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { NpcKnowledge } from "../src/repo/NpcKnowledge.js";
import { NpcMemories } from "../src/repo/NpcMemories.js";
import { Npcs } from "../src/repo/Npcs.js";
import { Options } from "../src/repo/Options.js";
import { Recap } from "../src/repo/Recap.js";
import { Search } from "../src/repo/Search.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { Spells } from "../src/repo/Spells.js";
import { anAccount, createCampaign, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { type ChatRequest, scriptedModel, textChunks, toolCallChunks } from "./support/model.js";

/**
 * Hob and campaign NPCs.
 *
 * Reproduction this file pins before the fix: create an NPC through the Cast
 * screen's repository path, ask Hob "What do we know about Cazril?", and the
 * only campaign-context tool Hob has (`searchCampaign`) returns notes, beats,
 * creatures and characters — never the NPC. A model can only answer from that
 * tool result, so it lacks the freshly-added campaign NPC unless another row
 * happened to mention the same name. The counterfactual is the second tool call
 * below: once the NPC id is discoverable, `getNpc` reads the bounded campaign
 * instance context and the answer has the profile, facts and approved memory it
 * needs, without reading any NPC chat transcripts.
 */

const MAX_TOKENS = 4096;

const services = Layer.mergeAll(
  Accounts.layer,
  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  Groups.layer,
  GroupHistory.layer.pipe(Layer.provide(Recap.layer)),
  Creatures.layer,
  CampaignCreatorActors.layer,
  EquipmentRepo.layer,
  HobThreads.layer,
  Invites.layer,
  Notes.layer,
  Npcs.layer,
  NpcKnowledge.layer,
  NpcMemories.layer,
  Options.layer,
  Recap.layer,
  Search.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  Spells.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_hob_npcs")));

const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const shownTo = (requests: ReadonlyArray<ChatRequest>): string => JSON.stringify(requests);

interface Fixture {
  readonly dm: Actor;
  readonly scopedDm: Actor;
  readonly player: Actor;
  readonly campaignId: CampaignId;
  readonly otherCampaignId: CampaignId;
  readonly creator: CampaignCreatorActor;
  readonly directNpcId: NpcId;
  readonly copiedNpcId: NpcId;
}

const makeFixture = Effect.gen(function* () {
  const npcs = yield* Npcs;
  const knowledge = yield* NpcKnowledge;
  const memories = yield* NpcMemories;
  const creators = yield* CampaignCreatorActors;
  const invites = yield* Invites;
  const sql = yield* SqlClient.SqlClient;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);
  const campaign = yield* as(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  const otherCampaign = yield* as(
    createCampaign({ name: "Salt and Sixpence", visibility: "shared" }),
  );
  const creator = yield* as(creators.of(campaign.id));
  const otherCreator = yield* as(creators.of(otherCampaign.id));

  const direct = yield* npcs.create(creator, {
    name: "Cazril",
    role: "tollhouse broker",
    visibility: "shared",
    persona: {
      identity: { summary: "Keeper of the eastern ford and its black-iron bell." },
      voice: { manner: "Soft-spoken, never answers the first question directly." },
      intent: { wants: "A true name paid before moonrise." },
    },
    privateMaterial: {
      secrets: "Cazril's secret patron is the glass queen.",
      instructions: "Play him as helpful only when a bargain is precise.",
    },
  });
  yield* knowledge.create(creator, direct.id, {
    body: "Cazril knows the toll phrase is glass river.",
    sourceLabel: "Cast notes",
  });
  const draft = yield* memories.draft(creator, direct.id, {
    body: "Brannoc threatened Cazril at the ford and Cazril backed down.",
  });
  yield* memories.approve(creator, direct.id, draft.id);

  yield* npcs.create(otherCreator, {
    name: "Cazril Sixpence",
    role: "unrelated impostor from the other campaign",
    persona: { identity: { summary: "This sentinel must not cross the campaign boundary." } },
    privateMaterial: { secrets: "SIXPENCE_CROSS_CAMPAIGN_SECRET" },
  });

  const issued = yield* as(
    invites.create(campaign.groupId, { label: "Pim", campaignId: campaign.id }),
  );
  const playerAccount = yield* anAccount("Pim");
  yield* withActor(playerAccount)(invites.redeem(issued.token));
  const player = scopedTo(playerAccount, campaign.id);

  const privateThread = yield* sql<{ readonly id: string }>`
    insert into npc_thread (npc_id, channel, account_id, title)
    values (${direct.id}, 'player_direct', ${player.accountId}, 'private player chat')
    returning id
  `;
  yield* sql`
    insert into npc_turn (thread_id, who, body, account_id)
    values (${privateThread[0]!.id}, 'user', 'PLAYER_DIRECT_TRANSCRIPT_SENTINEL', ${player.accountId})
  `;

  const source = yield* as(
    npcs.libraryCreate({
      name: "Marta Vale",
      role: "library informant",
      persona: { identity: { summary: "Sells rumours from a red lacquer book." } },
      privateMaterial: { secrets: "Marta keeps the source-only clue under the third stair." },
    }),
  );
  yield* sql`
    insert into npc_knowledge_fact (npc_id, body, source_label, visibility)
    values (${source.id}, 'Marta saw the amber key before she was copied.', 'Library source', 'dm')
  `;
  yield* sql`
    insert into npc_memory (npc_id, body, status, approved_at, visibility)
    values (${source.id}, 'Marta remembers the old ford password.', 'approved', now(), 'dm')
  `;
  const copied = yield* npcs.copyFromSource(creator, source.id);
  yield* as(
    npcs.libraryUpdate(source.id, {
      name: "Marta Vale changed after copy",
      privateMaterial: { secrets: "CHANGED_SOURCE_SECRET_AFTER_COPY" },
    }),
  );

  return {
    dm,
    scopedDm: scopedTo(dm, campaign.id),
    player,
    campaignId: campaign.id,
    otherCampaignId: otherCampaign.id,
    creator,
    directNpcId: direct.id,
    copiedNpcId: copied.id,
  };
}).pipe(Effect.orDie);

let fixture: Fixture;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

const askAboutNpc = (
  actor: Actor,
  campaignId: CampaignId,
  npcId: NpcId,
  text: string,
): Promise<{
  readonly events: ReadonlyArray<HobEvent>;
  readonly requests: ReadonlyArray<ChatRequest>;
}> => {
  const model = scriptedModel({
    model: "scripted-local",
    maxTokens: MAX_TOKENS,
    rounds: [
      toolCallChunks("searchCampaign", {
        query: text.replace(/.*about\s+/i, "").replace(/\?$/, ""),
      }),
      toolCallChunks("getNpc", { npcId }, "call_npc"),
      textChunks("I found the campaign NPC."),
    ],
  });

  return runtime.runPromise(
    Effect.gen(function* () {
      const hob = yield* Hob;
      const stream = yield* hob.ask(campaignId, { text });
      const events = yield* Stream.runCollect(stream);
      return { events: Array.from(events), requests: model.requests() };
    }).pipe(
      withActor(actor),
      Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
    ),
  );
};

describe("campaign NPC context", () => {
  it("discovers a directly-created campaign NPC through search, then reads bounded creator context", async () => {
    const { events, requests } = await askAboutNpc(
      fixture.dm,
      fixture.campaignId,
      fixture.directNpcId,
      "What do we know about Cazril?",
    );

    expect(events.flatMap((event) => (event.event === "tool" ? [event.data.name] : []))).toEqual([
      "searchCampaign",
      "searchCampaign",
      "getNpc",
      "getNpc",
    ]);

    const searchResult = shownTo(requests.slice(1, 2));
    expect(searchResult).toContain('\\"source\\":\\"npc\\"');
    expect(searchResult).toContain(fixture.directNpcId);
    expect(searchResult).toContain("tollhouse broker");
    expect(searchResult).not.toContain("Sixpence");
    expect(searchResult).not.toContain("SIXPENCE_CROSS_CAMPAIGN_SECRET");

    const npcContext = shownTo(requests.slice(2));
    expect(npcContext).toContain("Keeper of the eastern ford");
    expect(npcContext).toContain("glass queen");
    expect(npcContext).toContain("glass river");
    expect(npcContext).toContain("Brannoc threatened Cazril");
    expect(npcContext).not.toContain("PLAYER_DIRECT_TRANSCRIPT_SENTINEL");
  }, 60_000);

  it("uses the campaign snapshot copied from a Library NPC source, not the live source", async () => {
    const { requests } = await askAboutNpc(
      fixture.dm,
      fixture.campaignId,
      fixture.copiedNpcId,
      "What do we know about Marta Vale?",
    );

    const searchResult = shownTo(requests.slice(1, 2));
    expect(searchResult).toContain('\\"source\\":\\"npc\\"');
    expect(searchResult).toContain(fixture.copiedNpcId);
    expect(searchResult).toContain("Marta Vale");

    const npcContext = shownTo(requests.slice(2));
    expect(npcContext).toContain("library informant");
    expect(npcContext).toContain("source-only clue");
    expect(npcContext).toContain("amber key before she was copied");
    expect(npcContext).toContain("derivedFromName");
    expect(npcContext).not.toContain("changed after copy");
    expect(npcContext).not.toContain("CHANGED_SOURCE_SECRET_AFTER_COPY");
  }, 60_000);

  it("does not leak an NPC to a credential after campaign access is revoked", async () => {
    const model = scriptedModel({
      model: "scripted-local",
      maxTokens: MAX_TOKENS,
      rounds: [toolCallChunks("searchCampaign", { query: "Cazril" })],
    });

    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const invites = yield* Invites;
        const hob = yield* Hob;
        const rows = yield* withActor(fixture.dm)(invites.list(fixture.creator.group));
        const pim = rows.find((row) => row.redeemedByName === "Pim");
        if (pim === undefined) throw new Error("missing invitation to revoke");
        yield* withActor(fixture.dm)(invites.revoke(fixture.creator.group, pim.id));
        return yield* Effect.result(hob.ask(fixture.campaignId, { text: "Who is Cazril?" }));
      }).pipe(
        withActor(fixture.player),
        Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
      ),
    );

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
    expect(model.requests()).toHaveLength(0);
  }, 60_000);
});
