import { Effect } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { Health } from "./Health.js";

/**
 * Handler for `GET /health`. Exposed on its own so it can be tested in
 * isolation without standing up a network server.
 */
export const healthHandler = Effect.gen(function* () {
  const health = yield* Health;
  const status = yield* health.check;
  return yield* HttpServerResponse.json(status);
});

/**
 * Application routes.
 *
 * In v4 the router is a service that routes register themselves against, so a
 * route is a `Layer` rather than a value threaded through a builder. Anything
 * the handler needs (here, `Health`) is tracked as a request-level requirement
 * on this layer and is satisfied where the app is assembled, in `main.ts`.
 */
export const HealthRoutes = HttpRouter.add("GET", "/health", healthHandler);
