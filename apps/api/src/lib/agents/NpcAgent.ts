import { Chat } from "@effect/ai";
import * as Prompt from "@effect/ai/Prompt";
import type { StreamPart } from "@effect/ai/Response";
import type { Prompt as PromptType } from "@effect/ai/Prompt";
import { Effect, Mailbox } from "effect";
import { runAgentLoop } from "./agentLoop.js";

export type NpcAgentConfig = {
  name?: string;
  role?: string;
  location?: string;
  traits?: ReadonlyArray<string>;
  voice?: string;
  constraints?: ReadonlyArray<string>;
};

const buildSystemPrompt = (config: NpcAgentConfig) => {
  const identity = [
    config.name ? `Name: ${config.name}` : undefined,
    config.role ? `Role: ${config.role}` : undefined,
    config.location ? `Location: ${config.location}` : undefined,
    config.voice ? `Voice: ${config.voice}` : undefined,
    config.traits && config.traits.length > 0
      ? `Traits: ${config.traits.join(", ")}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  const constraints = [
    "Speak as an in-world NPC in a fantasy setting.",
    "Do not mention dice, DCs, or game mechanics unless explicitly asked.",
    "Avoid meta commentary about the DM or the game system.",
    "Keep responses concise and grounded in the scene.",
    "Offer small hooks: rumors, requests, or reactions that invite the player to act.",
    "Do not force an introduction; respond naturally to the user message.",
  ];

  const extraConstraints = config.constraints ?? [];
  const constraintLines = [...constraints, ...extraConstraints]
    .map((line) => `- ${line}`)
    .join("\n");

  return `You are an in-world NPC.

${identity ? `## Identity\n\n${identity}\n\n` : ""}## Constraints\n\n${constraintLines}`;
};

export const NpcAgent = {
  run: Effect.fnUntraced(function* (options: {
    messages: PromptType;
    config: NpcAgentConfig;
  }) {
    const mailbox = yield* Mailbox.make<StreamPart<{}>>();

    yield* Effect.forkScoped(
      Effect.gen(function* () {
        const systemPrompt = Prompt.make([
          {
            role: "system",
            content: buildSystemPrompt(options.config),
          },
        ]);

        const prompt = Prompt.merge(systemPrompt, options.messages);
        const chat = yield* Chat.fromPrompt(prompt);
        yield* runAgentLoop({ chat, mailbox });
      }).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            yield* Effect.logInfo("npc agent chat ended");
            mailbox.end;
          }),
        ),
      ),
    );

    return mailbox;
  }),
} as const;
