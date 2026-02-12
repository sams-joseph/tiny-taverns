import * as Effect from "effect/Effect";
import type { Prompt } from "@effect/ai/Prompt";
import { OpenAiLanguageModel } from "@effect/ai-openai";
import { NpcAgent, type NpcAgentConfig } from "./agents/NpcAgent.js";

export class AiAgentOrchestrator extends Effect.Service<AiAgentOrchestrator>()(
  "api/lib/AiAgentOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const model = yield* OpenAiLanguageModel.model("qwen3-0.6b", {
        reasoning: { effort: "medium" },
      });

      // TODO: This will be pulled from actual NPC records
      const defaultNpcConfig: NpcAgentConfig = {
        role: "tavern regular",
        location: "a warm, bustling tavern",
        traits: ["curious", "plainspoken", "observant"],
        constraints: [
          "Stay within what the NPC would reasonably know.",
          "If uncertain, admit it in character instead of inventing facts.",
        ],
      };

      const send = Effect.fnUntraced(function* (options: { messages: Prompt }) {
        return yield* NpcAgent.run({
          messages: options.messages,
          config: defaultNpcConfig,
        });
      }, Effect.provide(model));

      return { send } as const;
    }),
  },
) {}
