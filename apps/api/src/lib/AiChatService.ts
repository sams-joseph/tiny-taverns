import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { OpenAiLanguageModel } from "@effect/ai-openai";

import * as Prompt from "@effect/ai/Prompt";
import { toolkit } from "@repo/domain/Toolkit";
import { MonstersRepository } from "../MonstersRepository.js";
import { Chat } from "@effect/ai";

const ToolkitLayer = toolkit.toLayer(
  Effect.gen(function* () {
    const monsters = yield* MonstersRepository;

    return toolkit.of({
      SearchMonsters: Effect.fnUntraced(function* ({ query }) {
        const results = yield* monsters.findAll({ search: query });

        return { _tag: "Transient", value: results } as const;
      }),
    });
  }),
);

export class AiChatService extends Effect.Service<AiChatService>()(
  "api/lib/AiChatService",
  {
    dependencies: [ToolkitLayer],
    scoped: Effect.gen(function* () {
      // TODO: Make this an env variable
      const model = yield* OpenAiLanguageModel.model("qwen3-0.6b", {
        reasoning: { effort: "medium" },
      });

      // TODO: Initialize this with campaign history and other relevant info
      const chat = yield* Chat.empty;

      const baseSystemPrompt = `You are a funny dad`;

      const tools = yield* toolkit;

      const send = Effect.fnUntraced(
        function* (options: { readonly text: string }) {
          const systemPrompt = Prompt.make([
            {
              role: "system",
              content: baseSystemPrompt,
            },
          ]);

          const message = yield* makeMessage(options);
          const prompt = Prompt.merge(systemPrompt, [message]);

          //TODO: Right now this ends when a tool is called and does not continue
          // THe "agentic" loop need to handle this and continue the conversation after tool calls
          return chat.streamText({
            prompt: prompt,
            toolkit: tools,
            toolChoice: "auto",
          });
        },
        Effect.provide(model),
        Stream.unwrap,
      );

      return { send } as const;
    }),
  },
) {}

export const isVisualMessage = (
  message: Prompt.Message,
): message is Prompt.UserMessage | Prompt.UserMessage | Prompt.ToolMessage => {
  if (message.role === "system") return false;
  return message.content.some(isVisualPart);
};

export const isVisualPart = (
  part:
    | Prompt.UserMessagePart
    | Prompt.AssistantMessagePart
    | Prompt.ToolMessagePart,
): boolean => part.type === "text" || part.type === "tool-result";

const makeMessage = Effect.fnUntraced(function* (options: {
  readonly text: string;
}) {
  const content: Array<Prompt.UserMessagePart> = [];
  content.push(Prompt.textPart({ text: options.text }));
  return Prompt.makeMessage("user", {
    content,
  });
});
