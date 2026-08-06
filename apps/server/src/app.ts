import type { PgClient } from "@effect/sql-pg";
import type { Authorization } from "@taverns/api";
import { Config, Effect, Layer } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import type { SqlClient } from "effect/unstable/sql";
import { Accounts } from "./Accounts.js";
import { AuthorizationLive } from "./Authorization.js";
import * as Database from "./Database.js";
import { ApiLive } from "./handlers.js";
import { Health } from "./Health.js";
import { Campaigns } from "./repo/Campaigns.js";
import { Characters } from "./repo/Characters.js";
import { Notes } from "./repo/Notes.js";
import { Sessions } from "./repo/Sessions.js";

/**
 * Origins allowed to call the API from a browser. `apps/web` runs on 5173 in
 * development; a deployment sets `ALLOWED_ORIGINS` to its own.
 */
const allowedOrigins = Config.string("ALLOWED_ORIGINS").pipe(
  Config.map((value) => value.split(",").map((origin) => origin.trim())),
  Config.withDefault(["http://localhost:5173", "http://127.0.0.1:5173"]),
);

/**
 * Everything the handlers need, over whichever database it is given.
 *
 * Parameterised so the tests can mount the same wiring over a throwaway
 * database — the alternative is a second, subtly different assembly, which is
 * how a server ends up passing its tests and failing on boot.
 */
export const servicesOver = <E>(
  database: Layer.Layer<SqlClient.SqlClient | PgClient.PgClient, E>,
): Layer.Layer<Accounts | Authorization | Campaigns | Characters | Health | Notes | Sessions, E> =>
  Layer.mergeAll(
    Accounts.layer,
    AuthorizationLive.pipe(Layer.provide(Accounts.layer)),
    Campaigns.layer,
    Characters.layer,
    Notes.layer,
    Sessions.layer,
    Health.layer,
  ).pipe(Layer.provide(database));

export const services = servicesOver(Database.layer);

/**
 * The HTTP application, minus the server it listens on.
 *
 * The services go *outside* `HttpRouter.serve`. Handler requirements travel as
 * `Request<"Requires", _>` markers that only `serve` unwraps, so providing them
 * to the route layer typechecks and then fails at the call site.
 */
export const applicationOver = <E>(
  serviceLayer: Layer.Layer<
    Accounts | Authorization | Campaigns | Characters | Health | Notes | Sessions,
    E
  >,
  options?: { readonly quiet?: boolean },
) =>
  Effect.map(allowedOrigins, (origins) =>
    HttpRouter.serve(ApiLive, {
      disableListenLog: options?.quiet,
      disableLogger: options?.quiet,
      middleware: HttpMiddleware.cors({
        allowedOrigins: origins,
        // `b3` and `traceparent` are not optional here. `HttpClient` attaches
        // trace propagation headers to every outgoing request, which makes even
        // a plain `GET /health` a preflighted cross-origin request. Leave them
        // out and the browser blocks the call after a 204 preflight, with
        // nothing in the server log but the OPTIONS — the request that mattered
        // was never sent.
        allowedHeaders: ["content-type", "authorization", "b3", "traceparent"],
      }),
    }),
  ).pipe(Layer.unwrap, Layer.provide(serviceLayer));

export const application = applicationOver(services);
