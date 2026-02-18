import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LanguageModel } from "@effect/ai";
import type { Prompt } from "@effect/ai/Prompt";
import { OpenAiLanguageModel } from "@effect/ai-openai";
import * as AiPrompt from "@effect/ai/Prompt";
import { NpcAgent } from "./agents/NpcAgent.js";
import { DmAgent } from "./agents/DmAgent.js";
import { buildNpcIdentity } from "./agents/npcIdentity.js";
import { NpcToolkitLayer } from "./NpcToolkitLayer.js";
import { DmToolkitLayer } from "./DmToolkitLayer.js";
import { npcToolkit } from "@repo/domain/NpcToolkit";
import { dmToolkit } from "@repo/domain/DmToolkit";
import { Array, Option, pipe } from "effect";

export class AiAgentOrchestrator extends Effect.Service<AiAgentOrchestrator>()(
  "api/lib/AiAgentOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const model = yield* OpenAiLanguageModel.model("qwen3-0.6b", {
        reasoning: { effort: "medium" },
      });

      const Route = Schema.Literal("dm", "npc");
      const latestUserText = (messages: Prompt) => {
        const latestUser = pipe(
          messages.content,
          Array.reverse,
          Array.findFirst((message) => message.role === "user"),
          Option.getOrUndefined,
        );

        if (!latestUser || latestUser.role !== "user") {
          return "";
        }

        return pipe(
          latestUser.content,
          Array.filter((part) => part.type === "text"),
          Array.map((part) => part.text),
          Array.join(" "),
        );
      };

      const classifyRoute = (messages: Prompt) =>
        Effect.gen(function* () {
          const userText = latestUserText(messages);
          const prompt = AiPrompt.make([
            {
              role: "system",
              content:
                "You are a routing classifier. Return exactly one token: dm or npc.",
            },
            {
              role: "user",
              content: [AiPrompt.textPart({ text: userText })],
            },
          ]);

          const response = yield* LanguageModel.generateObject({
            prompt,
            schema: Schema.Struct({ route: Route }),
            objectName: "route",
            toolChoice: "none",
          });

          return response.value.route;
        }).pipe(Effect.catchAll(() => Effect.succeed("dm" as const)));

      const send = Effect.fnUntraced(
        function* (options: { messages: Prompt }) {
          const route = yield* classifyRoute(options.messages);

          if (route === "npc") {
            const npcConfig = buildNpcIdentity();
            const tools = yield* npcToolkit;
            return yield* NpcAgent.run({
              messages: options.messages,
              config: npcConfig,
              tools,
            });
          }

          const tools = yield* dmToolkit;
          return yield* DmAgent.run({
            messages: options.messages,
            tools,
          });
        },
        Effect.provide(model),
        Effect.provide(NpcToolkitLayer),
        Effect.provide(DmToolkitLayer),
      );

      return { send } as const;
    }),
  },
) {}
