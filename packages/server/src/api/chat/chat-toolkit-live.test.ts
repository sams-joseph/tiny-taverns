import { NpcModel } from "@/db/npc-model.js";
import { NpcRepo } from "@/db/npc-repo.js";
import * as Campaign from "@app/domain/api/campaign-rpc";
import type * as Chat from "@app/domain/api/chat-rpc";
import { NpcId } from "@app/domain/api/npc-rpc";
import { CurrentUser, UserId } from "@app/domain/auth";
import { describe, expect, it } from "@effect/vitest";
import { withLanguageModel } from "@test/utils/with-language-model.js";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import type * as Take from "effect/Take";
import { LanguageModel } from "effect/unstable/ai";
import * as Tool from "effect/unstable/ai/Tool";
import { HandlersLive } from "./chat-toolkit-live.js";
import { ChatMailbox, ChatRunContext, ChatToolkit, createNpc, fetchNpcs } from "./chat-toolkit.js";

const TEST_CAMPAIGN_ID = Campaign.CampaignId.make(
  "00000000-0000-4000-8000-000000000010",
);

const makeMailbox = Effect.gen(function*() {
  const mailbox = yield* PubSub.unbounded<Take.Take<Chat.ChatEvent>>({
    replay: 100,
  });
  const events = (n: number) =>
    Stream.fromPubSubTake(mailbox).pipe(Stream.take(n), Stream.runCollect);
  return { mailbox, events };
});

const MockNpcRepo = Layer.mock(NpcRepo)({
  fetch: (_userId, _campaignId, _cursor) =>
    Effect.succeed({ items: [], hasMore: false }),
  insert: (req) =>
    Effect.succeed({
      id: NpcId.make("npc-1"),
      userId: req.userId,
      campaignId: req.campaignId,
      title: req.title,
      createdAt: DateTime.nowUnsafe(),
      updatedAt: DateTime.nowUnsafe(),
    }),
  findById: (id, _userId, _campaignId) =>
    Effect.succeed({
      id,
      userId: "00000000-0000-4000-8000-000000000001",
      campaignId: TEST_CAMPAIGN_ID,
      title: "Test NPC",
      createdAt: DateTime.nowUnsafe(),
      updatedAt: DateTime.nowUnsafe(),
    }),
});

const TestHandlers = HandlersLive.pipe(Layer.provide(MockNpcRepo));

const testCurrentUser = {
  id: UserId.make("00000000-0000-4000-8000-000000000001"),
  name: "Test User",
  email: "test@example.com",
};

type NpcInsert = typeof NpcModel.insert.Type;

describe("chat toolkit handlers", () => {
  it("uses Anthropic-compatible object schemas for tool inputs", () => {
    for (const tool of [fetchNpcs, createNpc]) {
      expect(Tool.getJsonSchema(tool)).toMatchObject({ type: "object" });
    }
  });

  it.effect("streams tool events through mailbox during streamText", () =>
    Effect.gen(function*() {
      const { mailbox, events } = yield* makeMailbox;

      const parts = yield* LanguageModel.streamText({
        prompt: "What npcs are available?",
        toolkit: ChatToolkit,
      }).pipe(
        Stream.runCollect,
        withLanguageModel({
          streamText: [
            {
              type: "tool-call",
              id: "t1",
              name: "fetchNpcs",
              params: {},
            },
          ],
        }),
        Effect.provideService(ChatMailbox, mailbox),
        Effect.provideService(ChatRunContext, { campaignId: TEST_CAMPAIGN_ID }),
        Effect.provideService(CurrentUser, testCurrentUser),
        Effect.provide(TestHandlers),
      );

      const toolResults = parts.filter((p) => p.type === "tool-result");
      expect(toolResults).toHaveLength(1);

      const evts = yield* events(2);
      expect(evts.some((e) => e._tag === "ToolStart")).toBe(true);
      expect(evts.some((e) => e._tag === "ToolSuccess")).toBe(true);
    }));

  it.effect("createNpc writes the active ChatRunContext campaignId into the NPC row", () =>
    Effect.gen(function*() {
      const insertCalls = yield* Ref.make<ReadonlyArray<NpcInsert>>([]);
      const TrackingRepo = Layer.succeed(NpcRepo, {
        fetch: (_userId, _campaignId, _cursor) =>
          Effect.succeed({ items: [], hasMore: false }),
        insert: (req) =>
          Effect.gen(function*() {
            yield* Ref.update(insertCalls, (calls) => [...calls, req]);
            return {
              id: NpcId.make("00000000-0000-4000-8000-000000000099"),
              userId: req.userId,
              campaignId: req.campaignId,
              title: req.title,
              createdAt: DateTime.nowUnsafe(),
              updatedAt: DateTime.nowUnsafe(),
            };
          }),
        findById: (id, _userId, _campaignId) =>
          Effect.succeed({
            id,
            userId: "00000000-0000-4000-8000-000000000001",
            campaignId: TEST_CAMPAIGN_ID,
            title: "Test NPC",
            createdAt: DateTime.nowUnsafe(),
            updatedAt: DateTime.nowUnsafe(),
          }),
      });
      const TrackingHandlers = HandlersLive.pipe(Layer.provide(TrackingRepo));

      const { mailbox } = yield* makeMailbox;

      yield* LanguageModel.streamText({
        prompt: "Create an NPC named Aria",
        toolkit: ChatToolkit,
      }).pipe(
        Stream.runCollect,
        withLanguageModel({
          streamText: [
            {
              type: "tool-call",
              id: "t1",
              name: "createNpc",
              params: { title: "Aria" },
            },
          ],
        }),
        Effect.provideService(ChatMailbox, mailbox),
        Effect.provideService(ChatRunContext, { campaignId: TEST_CAMPAIGN_ID }),
        Effect.provideService(CurrentUser, testCurrentUser),
        Effect.provide(TrackingHandlers),
      );

      const calls = yield* Ref.get(insertCalls);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.userId).toBe(testCurrentUser.id);
      expect(calls[0]!.campaignId).toBe(TEST_CAMPAIGN_ID);
      expect(calls[0]!.title).toBe("Aria");
    }));
});
