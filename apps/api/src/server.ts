import { HttpApiBuilder, HttpMiddleware, HttpServer } from "@effect/platform";
import {
  NodeHttpClient,
  NodeHttpServer,
  NodeRuntime,
} from "@effect/platform-node";
import { Config, Layer } from "effect";
import { createServer } from "node:http";
import { ApiLive } from "./Api.js";
import { TodosRepository } from "./TodosRepository.js";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { AiChatService } from "./lib/AiChatService.js";
import { MonstersRepository } from "./MonstersRepository.js";
import { ChatLive } from "./Rpc.js";

const OpenAi = OpenAiClient.layerConfig({
  apiUrl: Config.string("OPENAI_API_URL"),
});

const OpenAiWithHttp = Layer.provide(OpenAi, NodeHttpClient.layerUndici);

const LanguageModelLive = OpenAiLanguageModel.layer({
  model: "qwen3-0.6b",
});

const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  HttpServer.withLogAddress,
  Layer.provide(ApiLive),
  Layer.provide(ChatLive),
  Layer.provide(TodosRepository.Default),
  Layer.provide(AiChatService.Default),
  Layer.provide(MonstersRepository.Default),
  Layer.provide(LanguageModelLive),
  Layer.provide(OpenAiWithHttp),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 4001 })),
);

Layer.launch(HttpLive).pipe(NodeRuntime.runMain);
