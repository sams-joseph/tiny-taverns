import type { ModelFamily } from "@app/domain/ai-models";
import * as OpenAiClient from "@effect/ai-openai/OpenAiClient";
import * as OpenAiLanguageModel from "@effect/ai-openai/OpenAiLanguageModel";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

const OpenAiLive = OpenAiClient.layerConfig({
  apiUrl: Config.string("LLM_API_URL"),
}).pipe(Layer.provide(FetchHttpClient.layer));

const QwenModel = OpenAiLanguageModel.model("qwen3-0.6b");

export class AiModels extends Context.Service<AiModels>()("@app/ai/AiModels", {
  make: Effect.gen(function*() {
    const qwenModel = yield* QwenModel.captureRequirements;

    const getModelLayer = (
      model: ModelFamily,
    ): Layer.Layer<LanguageModel.LanguageModel> => {
      switch (model) {
        case "qwen3-0.6b":
          return qwenModel;
      }
    };

    return {
      use: (model: ModelFamily) =>
      <A, E, R>(
        self: Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E, Exclude<R, LanguageModel.LanguageModel>> =>
        Effect.provide(self, getModelLayer(model)),
    } as const;
  }),
}) {
  static layer: Layer.Layer<AiModels> = Layer.effect(this, this.make).pipe(
    Layer.provide(OpenAiLive),
    Layer.orDie,
  );
}
