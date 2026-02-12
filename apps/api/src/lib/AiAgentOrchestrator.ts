import * as Effect from "effect/Effect";
import type { Prompt } from "@effect/ai/Prompt";
import { OpenAiLanguageModel } from "@effect/ai-openai";
import { NpcAgent } from "./agents/NpcAgent.js";
import { buildNpcIdentity } from "./agents/npcIdentity.js";

export class AiAgentOrchestrator extends Effect.Service<AiAgentOrchestrator>()(
  "api/lib/AiAgentOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const model = yield* OpenAiLanguageModel.model("qwen3-0.6b", {
        reasoning: { effort: "medium" },
      });

      const send = Effect.fnUntraced(function* (options: { messages: Prompt }) {
        const npcConfig = buildNpcIdentity();
        return yield* NpcAgent.run({
          messages: options.messages,
          config: npcConfig,
        });
      }, Effect.provide(model));

      return { send } as const;
    }),
  },
) {}
