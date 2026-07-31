import { HttpMiddleware, HttpServer } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { createServer } from "node:http";
import { HealthLive } from "./Health";
import { router } from "./router";

const PORT = Number(process.env.PORT ?? 3000);

/** Node HTTP server layer bound to the configured port. */
const ServerLive = NodeHttpServer.layer(() => createServer(), { port: PORT });

/** Fully-assembled HTTP application: router + services + server. */
const HttpLive = router.pipe(
  HttpServer.serve(HttpMiddleware.logger),
  HttpServer.withLogAddress,
  Layer.provide(HealthLive),
  Layer.provide(ServerLive),
);

NodeRuntime.runMain(Layer.launch(HttpLive));
