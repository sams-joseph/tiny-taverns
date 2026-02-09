import {
  HttpLayerRouter,
  HttpServer,
  HttpServerResponse,
} from "@effect/platform";
import {
  NodeHttpClient,
  NodeHttpServer,
  NodeRuntime,
} from "@effect/platform-node";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import { Config, Layer } from "effect";
import { createServer } from "node:http";
import { DomainRpc } from "@repo/domain";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { AiChatService } from "./lib/AiChatService.js";
import { MonstersRepository } from "./MonstersRepository.js";
import {
  CampaignLive,
  CharacterLive,
  ChatLive,
  MonsterLive,
  UserLive,
} from "./Rpc.js";
import { CampaignsRepository } from "./CampaignsRepository.js";
import { UsersRepository } from "./UsersRepository.js";
import { CharactersRepository } from "./CharactersRepository.js";

const OpenAi = OpenAiClient.layerConfig({
  apiUrl: Config.string("OPENAI_API_URL"),
});

const OpenAiWithHttp = Layer.provide(OpenAi, NodeHttpClient.layerUndici);

const LanguageModelLive = OpenAiLanguageModel.layer({
  model: "qwen3-0.6b",
});

const HealthRouter = HttpLayerRouter.use((router) =>
  router.add("GET", "/health", HttpServerResponse.text("OK")),
);

const HttpProtocol = RpcServer.layerProtocolHttp({
  path: "/rpc",
}).pipe(Layer.provide(RpcSerialization.layerNdjson));

const RpcRouter = RpcServer.layerHttpRouter({
  group: DomainRpc,
  path: "/rpc",
  protocol: "http",
  spanPrefix: "rpc",
});

const AllRoutes = Layer.mergeAll(HealthRouter, RpcRouter).pipe(
  Layer.provide(
    HttpLayerRouter.cors({
      allowedOrigins: ["*"],
      allowedMethods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization", "B3", "traceparent"],
      credentials: true,
    }),
  ),
);

const HttpLive = HttpLayerRouter.serve(AllRoutes).pipe(
  HttpServer.withLogAddress,
  Layer.provide(ChatLive),
  Layer.provide(MonsterLive),
  Layer.provide(CampaignLive),
  Layer.provide(UserLive),
  Layer.provide(CharacterLive),
  Layer.provide(AiChatService.Default),
  Layer.provide(MonstersRepository.Default),
  Layer.provide(CampaignsRepository.Default),
  Layer.provide(UsersRepository.Default),
  Layer.provide(CharactersRepository.Default),
  Layer.provide(LanguageModelLive),
  Layer.provide(OpenAiWithHttp),
  Layer.provide(HttpProtocol),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 4001 })),
);

Layer.launch(HttpLive).pipe(NodeRuntime.runMain);
