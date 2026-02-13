import * as Effect from "effect/Effect";
import type { Prompt } from "@effect/ai/Prompt";
import { OpenAiLanguageModel } from "@effect/ai-openai";
import { NpcAgent } from "./agents/NpcAgent.js";
import { buildNpcIdentity } from "./agents/npcIdentity.js";
import { NpcToolkitLayer } from "./NpcToolkitLayer.js";
import { npcToolkit } from "@repo/domain/NpcToolkit";

export class AiAgentOrchestrator extends Effect.Service<AiAgentOrchestrator>()(
  "api/lib/AiAgentOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const model = yield* OpenAiLanguageModel.model("qwen3-0.6b", {
        reasoning: { effort: "medium" },
      });

      const send = Effect.fnUntraced(
        function* (options: { messages: Prompt }) {
          const npcConfig = buildNpcIdentity();
          const tools = yield* npcToolkit;
          return yield* NpcAgent.run({
            messages: options.messages,
            config: npcConfig,
            tools,
          });
        },
        Effect.provide(model),
        Effect.provide(NpcToolkitLayer),
      );

      return { send } as const;
    }),
  },
) {}
