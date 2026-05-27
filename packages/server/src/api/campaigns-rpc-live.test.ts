import { AuthMiddlewareLive } from "@/api/auth-middleware-live.js";
import { CampaignRepo } from "@/db/campaign-repo.js";
import { ChatRepo } from "@/db/chat-repo.js";
import * as Campaign from "@app/domain/api/campaign-rpc";
import * as Chat from "@app/domain/api/chat-rpc";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { RpcTest } from "effect/unstable/rpc";
import { CampaignRpcHandler } from "./campaigns-rpc-live.js";

const now = DateTime.nowUnsafe();
const campaignId = Campaign.CampaignId.make("00000000-0000-4000-8000-000000000001");

const MockCampaignRepo = Layer.mock(CampaignRepo)({
  create: ({ userId, title, defaultChatId }) =>
    Effect.succeed({
      id: campaignId,
      userId,
      title,
      defaultChatId,
      createdAt: now,
      updatedAt: now,
    }),
  findById: (id, userId) =>
    Effect.succeed({
      id,
      userId,
      title: "The Dawn Marches",
      defaultChatId: Chat.ChatId.make("00000000-0000-4000-8000-000000000002"),
      createdAt: now,
      updatedAt: now,
    }),
  listByUser: () => Effect.succeed({ items: [], hasMore: false }),
});

const MockChatRepo = Layer.mock(ChatRepo)({
  create: ({ userId, title, model, campaignId }) =>
    Effect.succeed({
      id: Chat.ChatId.make("00000000-0000-4000-8000-000000000002"),
      userId,
      campaignId: campaignId ?? null,
      title,
      model,
      messages: [],
      activeRunId: null,
      createdAt: now,
      updatedAt: now,
    }),
  findById: () => Effect.die("not called"),
  listByUser: () => Effect.die("not called"),
  delete: () => Effect.die("not called"),
  updateMessages: () => Effect.die("not called"),
  startRun: () => Effect.die("not called"),
  finishRun: () => Effect.die("not called"),
  clearActiveRun: () => Effect.die("not called"),
});

const TestLayer = Layer.mergeAll(
  CampaignRpcHandler.pipe(
    Layer.provide(MockCampaignRepo),
    Layer.provide(MockChatRepo),
  ),
  AuthMiddlewareLive,
);

describe("CampaignRpc", () => {
  it.effect("campaign_create returns a Campaign with a default Conversation", () =>
    Effect.gen(function*() {
      const client = yield* RpcTest.makeClient(Campaign.CampaignRpc);

      const result = yield* client.campaign_create({ title: "The Dawn Marches" });

      expect(result.title).toBe("The Dawn Marches");
      expect(result.defaultChatId).toBe("00000000-0000-4000-8000-000000000002");
    }).pipe(Effect.provide(TestLayer)));
});
