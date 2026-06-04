import { AuthMiddlewareLive } from "@/api/auth-middleware-live.js";
import { CampaignRepo } from "@/db/campaign-repo.js";
import type { NpcModel } from "@/db/npc-model.js";
import { NpcRepo } from "@/db/npc-repo.js";
import * as Campaign from "@app/domain/api/campaign-rpc";
import * as Npc from "@app/domain/api/npc-rpc";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { RpcTest } from "effect/unstable/rpc";
import { NpcRpcHandler } from "./npcs-rpc-live.js";

const mockNpc = (
  overrides?: Partial<typeof NpcModel.Type>,
): typeof NpcModel.Type => ({
  id: Npc.NpcId.make("00000000-0000-4000-8000-000000000001"),
  userId: "00000000-0000-4000-8000-000000000001",
  campaignId: Campaign.CampaignId.make("00000000-0000-4000-8000-000000000010"),
  title: "Test NPC",
  createdAt: DateTime.nowUnsafe(),
  updatedAt: DateTime.nowUnsafe(),
  ...overrides,
});

const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-0000000000ff";
const TEST_CAMPAIGN_ID = Campaign.CampaignId.make(
  "00000000-0000-4000-8000-000000000010",
);
const TEST_NPC_ID = Npc.NpcId.make("00000000-0000-4000-8000-000000000001");

const MockCampaignRepo = Layer.mock(CampaignRepo)({
  findById: (id) =>
    Effect.succeed({
      id,
      userId: TEST_USER_ID,
      title: "Test Campaign",
      createdAt: DateTime.nowUnsafe(),
      updatedAt: DateTime.nowUnsafe(),
    }),
  fetch: () => Effect.die("not called"),
  insert: () => Effect.die("not called"),
  insertVoid: () => Effect.die("not called"),
  update: () => Effect.die("not called"),
  updateVoid: () => Effect.die("not called"),
  delete: () => Effect.die("not called"),
});

const CrossUserCampaignRepo = Layer.mock(CampaignRepo)({
  findById: (id) =>
    Effect.succeed({
      id,
      userId: OTHER_USER_ID,
      title: "Someone Else's Campaign",
      createdAt: DateTime.nowUnsafe(),
      updatedAt: DateTime.nowUnsafe(),
    }),
  fetch: () => Effect.die("not called"),
  insert: () => Effect.die("not called"),
  insertVoid: () => Effect.die("not called"),
  update: () => Effect.die("not called"),
  updateVoid: () => Effect.die("not called"),
  delete: () => Effect.die("not called"),
});

const MockNpcRepo = Layer.mock(NpcRepo)({
  fetch: (_userId, _campaignId, _cursor) => Effect.succeed({ items: [mockNpc()], hasMore: false }),
  insert: ({ userId, campaignId, title }) =>
    Effect.succeed(
      mockNpc({ userId, campaignId, title }),
    ),
  findById: (npcId, _userId, _campaignId) => Effect.succeed(mockNpc({ id: npcId })),
});

const NotFoundNpcRepo = Layer.mock(NpcRepo)({
  fetch: () => Effect.die("not called"),
  insert: () => Effect.die("not called"),
  findById: (npcId) => Effect.fail(new Npc.NpcNotFoundError({ id: npcId })),
});

const TestLayer = Layer.mergeAll(
  NpcRpcHandler.pipe(
    Layer.provide(MockCampaignRepo),
    Layer.provide(MockNpcRepo),
  ),
  AuthMiddlewareLive,
);

const NotFoundLayer = Layer.mergeAll(
  NpcRpcHandler.pipe(
    Layer.provide(MockCampaignRepo),
    Layer.provide(NotFoundNpcRepo),
  ),
  AuthMiddlewareLive,
);

const CrossUserLayer = Layer.mergeAll(
  NpcRpcHandler.pipe(
    Layer.provide(CrossUserCampaignRepo),
    Layer.provide(MockNpcRepo),
  ),
  AuthMiddlewareLive,
);

describe("NpcRpc", () => {
  it.effect("npc_list returns only NPCs in the requested campaign", () =>
    Effect.gen(function*() {
      const client = yield* RpcTest.makeClient(Npc.NpcRpc);
      const result = yield* client.npc_list({
        campaignId: TEST_CAMPAIGN_ID,
        cursor: null,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe(TEST_NPC_ID);
      expect(result.items[0]!.campaignId).toBe(TEST_CAMPAIGN_ID);
      expect(result.hasMore).toBe(false);
    }).pipe(Effect.provide(TestLayer)));

  it.effect("npc_list fails with CampaignNotFoundError when the campaign belongs to another user", () =>
    Effect.gen(function*() {
      const client = yield* RpcTest.makeClient(Npc.NpcRpc);
      const exit = yield* client
        .npc_list({ campaignId: TEST_CAMPAIGN_ID, cursor: null })
        .pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }).pipe(Effect.provide(CrossUserLayer)));

  it.effect("npc_get returns the NPC when the id is in the campaign", () =>
    Effect.gen(function*() {
      const client = yield* RpcTest.makeClient(Npc.NpcRpc);
      const result = yield* client.npc_get({
        campaignId: TEST_CAMPAIGN_ID,
        npcId: TEST_NPC_ID,
      });
      expect(result.id).toBe(TEST_NPC_ID);
      expect(result.campaignId).toBe(TEST_CAMPAIGN_ID);
    }).pipe(Effect.provide(TestLayer)));

  it.effect("npc_get fails with NpcNotFoundError when the id belongs to another campaign", () =>
    Effect.gen(function*() {
      const client = yield* RpcTest.makeClient(Npc.NpcRpc);
      const exit = yield* client
        .npc_get({ campaignId: TEST_CAMPAIGN_ID, npcId: TEST_NPC_ID })
        .pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }).pipe(Effect.provide(NotFoundLayer)));
});
