import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { createServer } from "node:http";
import { Health } from "./Health.js";
import { HealthRoutes } from "./router.js";

const PORT = Number(process.env.PORT ?? 3000);

/** Node HTTP server layer bound to the configured port. */
const ServerLive = NodeHttpServer.layer(() => createServer(), { port: PORT });

/**
 * Fully-assembled HTTP application: routes + services + server.
 *
 * `HttpRouter.serve` takes the route layers, builds the router they registered
 * against, and serves it. It applies the request logger and logs the listen
 * address itself, so v3's explicit `HttpServer.serve(HttpMiddleware.logger)` +
 * `HttpServer.withLogAddress` pipeline is no longer spelled out here.
 */
const HttpLive = HttpRouter.serve(HealthRoutes).pipe(
  Layer.provide(Health.layer),
  Layer.provide(ServerLive),
);

NodeRuntime.runMain(Layer.launch(HttpLive));
