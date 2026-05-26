import type * as Chat from "@app/domain/api/chat-rpc";
import { describe, expect, it } from "@effect/vitest";
import { withLanguageModel } from "@test/utils/with-language-model.js";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import type * as Take from "effect/Take";
import { LanguageModel } from "effect/unstable/ai";
import * as Tool from "effect/unstable/ai/Tool";
import { HandlersLive } from "./chat-toolkit-live.js";
import {
  ChatMailbox,
  ChatToolkit,
  createNpc,
  fetchNpcs,
} from "./chat-toolkit.js";

const makeMailbox = Effect.gen(function* () {
  const mailbox = yield* PubSub.unbounded<Take.Take<Chat.ChatEvent>>({
    replay: 100,
  });
  const events = (n: number) =>
    Stream.fromPubSubTake(mailbox).pipe(Stream.take(n), Stream.runCollect);
  return { mailbox, events };
});

const TestHandlers = HandlersLive;

describe("chat toolkit handlers", () => {
  it("uses Anthropic-compatible object schemas for tool inputs", () => {
    for (const tool of [fetchNpcs, createNpc]) {
      expect(Tool.getJsonSchema(tool)).toMatchObject({ type: "object" });
    }
  });

  it.effect("streams tool events through mailbox during streamText", () =>
    Effect.gen(function* () {
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
        Effect.provide(TestHandlers),
      );

      const toolResults = parts.filter((p) => p.type === "tool-result");
      expect(toolResults).toHaveLength(1);

      const evts = yield* events(2);
      expect(evts.some((e) => e._tag === "ToolStart")).toBe(true);
      expect(evts.some((e) => e._tag === "ToolSuccess")).toBe(true);
    }),
  );
});
