import { Chat } from "@effect/ai";
import * as Prompt from "@effect/ai/Prompt";
import type { StreamPart } from "@effect/ai/Response";
import type { Prompt as PromptType } from "@effect/ai/Prompt";
import type * as Toolkit from "@effect/ai/Toolkit";
import type { dmToolkit } from "@repo/domain/DmToolkit";
import { Effect, Mailbox } from "effect";
import { runAgentLoop } from "./agentLoop.js";

const buildSystemPrompt = () => {
  const constraints = [
    "You are a DM assistant focused on planning and structuring content.",
    "Do not roleplay as an in-world NPC.",
    "Prefer concise, actionable outputs with clear structure.",
    "If quest rewards are not provided, generate sensible experience and currency values.",
    "Break complex quests into subquests and create them with parentQuestId.",
    "Create encounters for key beats and link them to the relevant quest or subquest.",
    "Default encounters to phase 'exploration' unless combat is explicit.",
    "Keep subquests aligned to the parent quest campaignId.",
    "Ensure quest payloads include name, campaignId, rewards, and optional description or parentQuestId.",
    "Use CreateQuest, CreateEncounter, and QuestEncounterLink to persist content once details are ready.",
  ];

  const constraintLines = constraints.map((line) => `- ${line}`).join("\n");

  return `You are a DM assistant.\n\n## Constraints\n\n${constraintLines}`;
};

export const DmAgent = {
  run: Effect.fnUntraced(function* (options: {
    messages: PromptType;
    tools?: Toolkit.WithHandler<(typeof dmToolkit)["tools"]> | undefined;
  }) {
    const mailbox =
      yield* Mailbox.make<StreamPart<(typeof dmToolkit)["tools"]>>();

    yield* Effect.forkScoped(
      Effect.gen(function* () {
        const systemPrompt = Prompt.make([
          {
            role: "system",
            content: buildSystemPrompt(),
          },
        ]);

        const prompt = Prompt.merge(systemPrompt, options.messages);
        const chat = yield* Chat.fromPrompt(prompt);
        yield* runAgentLoop({ chat, mailbox, tools: options.tools });
      }).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            yield* Effect.logInfo("dm agent chat ended");
            mailbox.end;
          }),
        ),
      ),
    );

    return mailbox;
  }),
} as const;
