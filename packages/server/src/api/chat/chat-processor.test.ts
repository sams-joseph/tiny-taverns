import type { ChatModel } from "@/db/chat-model.js";
import { NpcRepo } from "@/db/npc-repo.js";
import { CampaignId } from "@app/domain/api/campaign-rpc";
import * as Chat from "@app/domain/api/chat-rpc";
import { NpcId } from "@app/domain/api/npc-rpc";
import { CurrentUser, UserId } from "@app/domain/auth";
import { describe, expect, it } from "@effect/vitest";
import { withLanguageModel } from "@test/utils/with-language-model.js";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import type * as Take from "effect/Take";
import { ChatProcessor, makePrompt } from "./chat-processor.js";
import { HandlersLive } from "./chat-toolkit-live.js";
import { ChatMailbox, ChatRunContext } from "./chat-toolkit.js";

const TEST_CAMPAIGN_ID = CampaignId.make("00000000-0000-4000-8000-000000000001");

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
    Effect.succeed({
      items: [],
      hasMore: false,
    }),
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
      userId: "user-1",
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

const mockChat = (
  overrides?: Partial<typeof ChatModel.Type>,
): typeof ChatModel.Type => ({
  id: Chat.ChatId.make("00000000-0000-4000-8000-000000000001"),
  userId: "user-1",
  campaignId: CampaignId.make("00000000-0000-4000-8000-000000000001"),
  title: "Test Chat",
  model: "qwen3-0.6b",
  messages: [],
  activeRunId: null,
  createdAt: DateTime.nowUnsafe(),
  updatedAt: DateTime.nowUnsafe(),
  ...overrides,
});

describe("makePrompt", () => {
  it("empty messages returns only system message", () => {
    const result = makePrompt([]);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("system");
  });

  it("user string message forwarded verbatim", () => {
    const result = makePrompt([{ role: "user", content: "hello" }]);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ role: "user", content: "hello" });
  });

  it("user array message maps text parts", () => {
    const result = makePrompt([
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ]);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      role: "user",
      content: [{ type: "text", text: "hello" }],
    });
  });

  it("assistant string message wrapped in text array", () => {
    const result = makePrompt([{ role: "assistant", content: "reply" }]);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "reply" }],
    });
  });

  it("assistant array with text and tool-call parts forwarded", () => {
    const result = makePrompt([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Using tool" },
          {
            type: "tool-call",
            id: "c1",
            name: "fetchNpcs",
            params: {},
          },
        ],
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Using tool" },
        { type: "tool-call", id: "c1", name: "fetchNpcs", params: {} },
      ],
    });
  });

  it("tool message forwarded", () => {
    const result = makePrompt([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            id: "c1",
            name: "fetchNpcs",
            result: "2024-01-01T00:00:00Z",
            isFailure: false,
          },
        ],
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          id: "c1",
          name: "fetchNpcs",
          result: "2024-01-01T00:00:00Z",
          isFailure: false,
        },
      ],
    });
  });
});

describe("ChatProcessor", () => {
  it.effect("text-delta parts become Chunk mailbox events", () =>
    Effect.gen(function*() {
      const { mailbox, events } = yield* makeMailbox;
      const processor = yield* ChatProcessor;

      yield* processor.run(mockChat(), "Hello").pipe(
        withLanguageModel({
          streamText: [{ type: "text-delta", id: "t1", delta: "Hello!" }],
        }),
        Effect.provideService(ChatMailbox, mailbox),
        Effect.provideService(ChatRunContext, { campaignId: TEST_CAMPAIGN_ID }),
        Effect.provideService(CurrentUser, testCurrentUser),
        Effect.provide(TestHandlers),
      );

      const evts = yield* events(1);
      expect(evts).toHaveLength(1);
      expect(evts[0]).toEqual({ _tag: "Chunk", delta: "Hello!" });
    }).pipe(Effect.provide(ChatProcessor.layer)));

  it.effect("reasoning-delta parts become ReasoningChunk mailbox events", () =>
    Effect.gen(function*() {
      const { mailbox, events } = yield* makeMailbox;
      const processor = yield* ChatProcessor;

      yield* processor.run(mockChat(), "Think carefully").pipe(
        withLanguageModel({
          streamText: [
            { type: "reasoning-delta", id: "r1", delta: "Thinking..." },
          ],
        }),
        Effect.provideService(ChatMailbox, mailbox),
        Effect.provideService(ChatRunContext, { campaignId: TEST_CAMPAIGN_ID }),
        Effect.provideService(CurrentUser, testCurrentUser),
        Effect.provide(TestHandlers),
      );

      const evts = yield* events(1);
      expect(evts).toHaveLength(1);
      expect(evts[0]).toEqual({ _tag: "ReasoningChunk", delta: "Thinking..." });
    }).pipe(Effect.provide(ChatProcessor.layer)));

  it.effect(
    "loop continues on tool-calls finish reason and stops on stop",
    () =>
      Effect.gen(function*() {
        const { mailbox } = yield* makeMailbox;
        const processor = yield* ChatProcessor;
        let calls = 0;

        yield* processor.run(mockChat(), "What time is it?").pipe(
          withLanguageModel({
            streamText: () => {
              calls += 1;
              if (calls === 1) {
                return [
                  {
                    type: "finish" as const,
                    reason: "tool-calls" as const,
                    usage: {
                      inputTokens: {
                        uncached: undefined,
                        total: undefined,
                        cacheRead: undefined,
                        cacheWrite: undefined,
                      },
                      outputTokens: {
                        total: undefined,
                        text: undefined,
                        reasoning: undefined,
                      },
                    },
                    response: undefined,
                  },
                ];
              }
              return [
                { type: "text-delta" as const, id: "t1", delta: "It is noon." },
              ];
            },
          }),
          Effect.provideService(ChatMailbox, mailbox),
          Effect.provideService(ChatRunContext, { campaignId: TEST_CAMPAIGN_ID }),
          Effect.provideService(CurrentUser, testCurrentUser),
          Effect.provide(TestHandlers),
        );

        expect(calls).toBe(2);
      }).pipe(Effect.provide(ChatProcessor.layer)),
  );

  it.effect("text response is returned as assistant message", () =>
    Effect.gen(function*() {
      const { mailbox } = yield* makeMailbox;
      const processor = yield* ChatProcessor;

      const result = yield* processor.run(mockChat(), "Hello").pipe(
        withLanguageModel({
          streamText: [{ type: "text-delta", id: "t1", delta: "Hi there" }],
        }),
        Effect.provideService(ChatMailbox, mailbox),
        Effect.provideService(ChatRunContext, { campaignId: TEST_CAMPAIGN_ID }),
        Effect.provideService(CurrentUser, testCurrentUser),
        Effect.provide(TestHandlers),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: "assistant", content: "Hi there" });
    }).pipe(Effect.provide(ChatProcessor.layer)));

  it.effect("user message is NOT in returned array", () =>
    Effect.gen(function*() {
      const { mailbox } = yield* makeMailbox;
      const processor = yield* ChatProcessor;

      const result = yield* processor.run(mockChat(), "Hello").pipe(
        withLanguageModel({
          streamText: [{ type: "text-delta", id: "t1", delta: "Reply" }],
        }),
        Effect.provideService(ChatMailbox, mailbox),
        Effect.provideService(ChatRunContext, { campaignId: TEST_CAMPAIGN_ID }),
        Effect.provideService(CurrentUser, testCurrentUser),
        Effect.provide(TestHandlers),
      );

      expect(result.every((m) => m.role !== "user")).toBe(true);
    }).pipe(Effect.provide(ChatProcessor.layer)));
});
