import {
  HttpApiBuilder,
  HttpMiddleware,
  HttpRouter,
  HttpServer,
} from "@effect/platform";
import {
  NodeHttpClient,
  NodeHttpServer,
  NodeRuntime,
} from "@effect/platform-node";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import { Config, Effect, Layer } from "effect";
import { createServer } from "node:http";
import { ApiLive } from "./Api.js";
import { ChatRpcs } from "@repo/domain";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { AiChatService } from "./lib/AiChatService.js";
import { MonstersRepository } from "./MonstersRepository.js";
import { ChatLive } from "./Rpc.js";
import { CampaignsRepository } from "./CampaignsRepository.js";

const OpenAi = OpenAiClient.layerConfig({
  apiUrl: Config.string("OPENAI_API_URL"),
});

const OpenAiWithHttp = Layer.provide(OpenAi, NodeHttpClient.layerUndici);

const LanguageModelLive = OpenAiLanguageModel.layer({
  model: "qwen3-0.6b",
});

const RpcLive = RpcServer.layer(ChatRpcs).pipe(Layer.provide(ChatLive));
const RpcHttpLive = RpcServer.layerProtocolHttp({ path: "/rpc" }).pipe(
  Layer.provide(RpcSerialization.layerNdjson),
);

const ApiRouterLive = HttpRouter.Default.use((router) =>
  Effect.gen(function* () {
    const httpApp = yield* HttpApiBuilder.httpApp;
    yield* router.mountApp("/api", httpApp);
  }),
).pipe(
  Layer.provide(ApiLive),
  Layer.provide(HttpApiBuilder.Router.Live),
  Layer.provide(HttpApiBuilder.Middleware.layer),
);

const HttpLive = HttpRouter.Default.serve(HttpMiddleware.logger).pipe(
  HttpServer.withLogAddress,
  Layer.provide(ApiRouterLive),
  Layer.provide(RpcLive),
  Layer.provide(RpcHttpLive),
  Layer.provide(AiChatService.Default),
  Layer.provide(MonstersRepository.Default),
  Layer.provide(CampaignsRepository.Default),
  Layer.provide(LanguageModelLive),
  Layer.provide(OpenAiWithHttp),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 4001 })),
);

Layer.launch(HttpLive).pipe(NodeRuntime.runMain);
