import { NodeHttpServer } from "@effect/platform-node";
import { Layer } from "effect";
import { FetchHttpClient, HttpServer } from "effect/unstable/http";
import { createServer } from "node:http";

/**
 * The in-process server every HTTP test runs against: Effect's `layerTest`
 * with a keep-alive window no event-loop stall can reach.
 *
 * `layerTest` keeps Node's default 5 s `keepAliveTimeout`, and the test's
 * `fetch` client shares the process's one event loop. When a loaded machine
 * stalls that loop for seconds, the server's keep-alive timer can fire after
 * the client has reused a pooled socket but before the server reads the
 * request, and the test fails with `read ECONNRESET`. With a 60 s window the
 * race needs a socket left idle for most of a minute and then a stall, which
 * no test does.
 *
 * The 5 s layer is forbidden in this directory (`http.test.ts`).
 */
export const testServer = HttpServer.layerTestClient.pipe(
  Layer.provide(
    Layer.fresh(FetchHttpClient.layer).pipe(
      Layer.provide(Layer.succeed(FetchHttpClient.RequestInit)({ keepalive: false })),
    ),
  ),
  Layer.provideMerge(
    NodeHttpServer.layer(() => createServer({ keepAliveTimeout: 60_000 }), { port: 0 }),
  ),
);
