import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { createServer } from "node:http";
import { application, services } from "./app.js";
import { port } from "./Config.js";

/**
 * The TCP listener.
 *
 * **`Layer.provide(services)` is the whole point of this file, and it is not
 * decoration.** `NodeHttpServer.layer` calls `server.listen` while it is being
 * *constructed* (`NodeHttpServer.make`, in `.repos/effect`), and a layer's
 * dependencies are built before the layer itself — `provideWith` in `Layer.ts`
 * builds `that`, then `self`. So whichever way round these two go is the order
 * the socket binds in.
 *
 * The obvious composition — `application.pipe(Layer.provide(listener))` with a
 * bare listener — binds the socket *first* and opens the connection pool and
 * runs the migrations *after*, because the application layer is the one that
 * does those. Anything that connects in between is accepted by the kernel and
 * then never answered: not answered late, never at all, because no `request`
 * handler is attached to the server yet to answer it. Measured on an idle
 * machine against an already-migrated database: accepted at 273ms, first
 * answered at 307ms, and a request written on a connection opened at 273ms was
 * still unanswered 8s later while the server logged "Listening" and served
 * fresh connections 200. Against an empty database the window was 58ms; under
 * load it stretches to seconds — and a readiness probe is precisely the client
 * that connects to a server that has just come up.
 *
 * Naming `services` here inverts that: the pool is open and the migrations have
 * run before `listen` is called, so a client that arrives early gets
 * `ECONNREFUSED` — a clean, retryable answer — rather than a socket that will
 * never speak. `services` is the same layer object `application` provides to
 * its handlers, and `Layer` memoises by layer identity within one build, so
 * this adds one edge to the graph and no work at all: one pool, one migration
 * run.
 */
const listener = Layer.unwrap(
  Effect.map(port, (port) => NodeHttpServer.layer(() => createServer(), { port })),
).pipe(Layer.provide(services));

/**
 * Entry point. Everything interesting is in `app.ts`, which the tests mount
 * over a throwaway database; this file only binds it to a port — once it can
 * serve, see above.
 */
const HttpLive = application.pipe(Layer.provide(listener));

NodeRuntime.runMain(Layer.launch(HttpLive));
