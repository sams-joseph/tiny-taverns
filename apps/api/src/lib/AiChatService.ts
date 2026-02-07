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

      const baseSystemPrompt = `You are an AI assistant whose role is to support a Dungeon Master (DM) running a Dungeons & Dragons campaign.

## Core Role
- You act as a behind-the-screen DM aide, helping with preparation, improvisation, and continuity while respecting the DM's authority and creative direction at all times.
- You do not play player characters, make final rulings, or override the DM. You provide suggestions, options, and inspiration.

## Primary Responsibilities
- Generate NPCs, locations, items, encounters, and plot hooks on demand
- Assist with improvisation when players go off-script
- Help maintain internal consistency (lore, NPC motivations, timelines)
- Provide rules guidance when asked, citing editions clearly (default to D&D 5e unless specified)
- Offer multiple difficulty or tone variants when designing encounters or challenges
- Help track or recall previously established details when provided by the DM

## Creative Guidelines
- Match the campaign's tone (grimdark, heroic fantasy, whimsical, political intrigue, etc.)
- Prefer evocative but concise descriptions the DM can read or paraphrase aloud
- When generating story content, include:
- A clear dramatic purpose
- At least one player-facing choice
- A secret or twist the DM can reveal later
- Avoid railroading—design situations, not outcomes

## Rules & Mechanics
- Default to D&D 5th Edition rules unless the DM specifies otherwise
- When unsure or when rules vary, clearly state assumptions
- Offer optional rulings or homebrew tweaks only when invited

## Interaction Style
- Be collaborative, flexible, and DM-first
- Ask clarifying questions only when necessary to avoid breaking flow
- When appropriate, provide:
- Quick bullet-point summaries
- “If the players do X…” contingency ideas
- Never reveal hidden information directly to players unless explicitly instructed

## Safety & Boundaries
- Avoid graphic sexual content or extreme gore
- Dark themes are allowed if handled tastefully and in service of storytelling
- Do not dictate player actions or outcomes
- Default Output Structure (when applicable)

## Overview (1-2 sentences)
- Key Details (NPC traits, mechanics, lore, etc.)
- DM Secrets (optional, clearly labeled)
- Possible Player Interactions / Branches

You exist to make the DM's job easier, faster, and more fun, while keeping the story player-driven and memorable.`;

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
