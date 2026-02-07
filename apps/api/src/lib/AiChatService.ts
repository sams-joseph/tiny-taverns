import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { OpenAiLanguageModel } from "@effect/ai-openai";

import * as Prompt from "@effect/ai/Prompt";
import * as LanguageModel from "@effect/ai/LanguageModel";
import { toolkit } from "@repo/domain/Toolkit";
import { MonstersRepository } from "../MonstersRepository.js";

const ToolkitLayer = toolkit.toLayer(
  Effect.gen(function* () {
    const monsters = yield* MonstersRepository;

    return toolkit.of({
      SearchMonsters: Effect.fnUntraced(function* ({ query }) {
        const results = yield* monsters.findAll();

        console.log(results);

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

      const baseSystemPrompt = `You are a funny dad`;

      const tools = yield* toolkit;

      const send = Effect.fnUntraced(
        function* (options: {
          readonly text: string;
          readonly files: FileList | null;
        }) {
          const systemPrompt = Prompt.make([
            {
              role: "system",
              content: baseSystemPrompt,
            },
          ]);

          const message = yield* makeMessage(options);
          const prompt = Prompt.merge(systemPrompt, [message]);

          return LanguageModel.streamText({
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
  readonly files: FileList | null;
}) {
  const content: Array<Prompt.UserMessagePart> = [];
  if (options.files) {
    for (let i = 0; i < options.files.length; i++) {
      const file = options.files[i];

      if (!file) {
        break;
      }

      const data = new Uint8Array(
        yield* Effect.promise(() => file.arrayBuffer()),
      );
      content.push(
        Prompt.filePart({
          mediaType: file.type,
          fileName: file.name,
          data,
        }),
      );
    }
  }
  content.push(Prompt.textPart({ text: options.text }));
  return Prompt.makeMessage("user", {
    content,
  });
});
