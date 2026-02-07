import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { OpenAiLanguageModel } from "@effect/ai-openai";

import { Chat } from "@effect/ai";
import * as Prompt from "@effect/ai/Prompt";
import { toolkit } from "@repo/domain/Toolkit";
import { MonstersRepository } from "../MonstersRepository.js";
import { CampaignsRepository } from "../CampaignsRepository.js";
import { Mailbox, Ref } from "effect";
import { StreamPart } from "@effect/ai/Response";

const ToolkitLayer = toolkit.toLayer(
  Effect.gen(function* () {
    const monsters = yield* MonstersRepository;
    const campaigns = yield* CampaignsRepository;

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
      CreateCampaign: Effect.fnUntraced(function* ({ campaign }) {
        const newCampaign = yield* campaigns.create(campaign);

        return {
          _tag: "Transient",
          value: { campaignId: newCampaign.id },
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

      const tools = yield* toolkit;

      const baseSystemPrompt = `You are an AI assistant whose role is to support a Dungeon Master (DM) running a Dungeons & Dragons campaign.

## Tools

You have access to some tools that can be used to look up information about the user's monsters, and campaigns.

- Prefer using tools to show information rather than providing it directly.

*Important:*

Avoid providing information that is already available in the app.

- If the user is viewing a recipe, do not repeat the recipe details in your response.
- If you scale the recipe, only confirm the new scale and don't list out all ingredients again.

You exist to make the DM's job easier, faster, and more fun, while keeping the story player-driven and memorable.`;

      const runAgentLoop = (
        chat: Chat.Service,
        mailbox: Mailbox.Mailbox<StreamPart<typeof toolkit.tools>>,
      ) =>
        Effect.iterate(
          {
            finishReason: "tool-calls",
            iteration: 0,
          },
          {
            while: (state) =>
              state.finishReason === "tool-calls" && state.iteration < 8,
            body: (state) =>
              Effect.gen(function* () {
                const iteration = state.iteration + 1;

                yield* Effect.logInfo(`Iteration ${iteration} starting`);

                const finishReason = yield* Effect.gen(function* () {
                  const finishReasonRef = yield* Ref.make("stop");

                  yield* chat
                    .streamText({
                      prompt: [],
                      toolkit: tools,
                    })
                    .pipe(
                      Stream.runForEach((chunk) =>
                        Effect.gen(function* () {
                          // TODO: This logic for continuing the loop needs work.
                          // We want to continue the loop if any tool calls are made

                          if (chunk.type === "tool-call") {
                            yield* Effect.logInfo(
                              `Received tool call: ${chunk.name}`,
                            );
                            yield* Ref.set(finishReasonRef, "tool-calls");
                          }

                          yield* Effect.logInfo(`Received chat part: ${chunk}`);
                          yield* mailbox.offer(chunk);
                        }),
                      ),
                      Stream.runDrain,
                    );

                  return yield* Ref.get(finishReasonRef);
                });

                yield* Effect.logInfo({ finishReason, state });

                return {
                  finishReason,
                  iteration,
                };
              }),
          },
        );

      const send = Effect.fnUntraced(function* (options: {
        readonly text: string;
      }) {
        const mailbox = yield* Mailbox.make<StreamPart<typeof toolkit.tools>>();

        const systemPrompt = Prompt.make([
          {
            role: "system",
            content: baseSystemPrompt,
          },
        ]);

        const message = yield* makeMessage(options);
        const prompt = Prompt.merge(systemPrompt, [message]);

        const chat = yield* Chat.fromPrompt(prompt);

        yield* Effect.forkScoped(
          Effect.gen(function* () {
            yield* runAgentLoop(chat, mailbox);
          }).pipe(Effect.ensuring(mailbox.end)),
        );

        return mailbox;
      }, Effect.provide(model));

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
