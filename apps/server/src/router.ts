import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { Health } from "./Health";

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
 * Application router. Routes are Effects that may depend on services (here,
 * `Health`); those dependencies are satisfied when the router is served.
 */
export const router = HttpRouter.empty.pipe(HttpRouter.get("/health", healthHandler));
