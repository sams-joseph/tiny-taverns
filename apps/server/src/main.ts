import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { createServer } from "node:http";
import { application } from "./app.js";
import { port } from "./Config.js";

/**
 * Entry point. Everything interesting is in `app.ts`, which the tests mount
 * over a throwaway database; this file only binds it to a port.
 */
const HttpLive = application.pipe(
  Layer.provide(
    Layer.unwrap(Effect.map(port, (port) => NodeHttpServer.layer(() => createServer(), { port }))),
  ),
);

NodeRuntime.runMain(Layer.launch(HttpLive));
