import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import { OpenAiLanguageModel } from "@effect/ai-openai";

import { Chat } from "@effect/ai";
import * as Prompt from "@effect/ai/Prompt";
import * as Response from "@effect/ai/Response";
import { toolkit } from "@repo/domain/Toolkit";
import { MonstersRepository } from "../MonstersRepository.js";

const ToolkitLayer = toolkit.toLayer(
  Effect.gen(function* () {
    const monsters = yield* MonstersRepository;

    return toolkit.of({
      SearchMonsters: Effect.fnUntraced(function* ({ query }) {
        const results = yield* monsters.findAll({ search: query });

        return { _tag: "Transient", value: results } as const;
      }),
      CreateMonster: Effect.fnUntraced(function* ({ monster }) {
        const newMonster = yield* monsters.create(monster);

        return {
          _tag: "Transient",
          value: { monsterId: newMonster.id },
        };
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

          const maxIterations = 8;

          const runTurn = (
            input: Prompt.RawInput,
            iteration: number,
          ): Stream.Stream<
            Response.StreamPart<typeof tools.tools>,
            unknown,
            unknown
          > =>
            Stream.unwrap(
              Effect.gen(function* () {
                const toolCallFound = yield* Ref.make(false);
                const finishReason = yield* Ref.make<
                  Response.FinishReason | undefined
                >(undefined);
                const continueDeferred = yield* Deferred.make<boolean>();

                const stream = chat.streamText({
                  prompt: input,
                  toolkit: tools,
                  toolChoice: "auto",
                });

                const tracked = stream.pipe(
                  Stream.tap((part) => {
                    if (
                      part.type === "tool-call" &&
                      part.providerExecuted === false
                    ) {
                      return Ref.set(toolCallFound, true);
                    }

                    if (part.type === "finish") {
                      return Ref.set(finishReason, part.reason);
                    }

                    return Effect.void;
                  }),
                  Stream.ensuring(
                    Effect.gen(function* () {
                      const shouldContinue =
                        iteration < maxIterations - 1 &&
                        ((yield* Ref.get(finishReason)) === "tool-calls" ||
                          ((yield* Ref.get(finishReason)) === undefined &&
                            (yield* Ref.get(toolCallFound))));

                      yield* Deferred.succeed(continueDeferred, shouldContinue);
                    }),
                  ),
                );

                const next = Stream.unwrap(
                  Deferred.await(continueDeferred).pipe(
                    Effect.map((shouldContinue) =>
                      shouldContinue
                        ? runTurn(Prompt.empty, iteration + 1)
                        : Stream.empty,
                    ),
                  ),
                );

                return Stream.concat(tracked, next);
              }),
            );

          return runTurn(prompt, 0);
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
