import type { PgClient } from "@effect/sql-pg";
import type { Authorization } from "@taverns/api";
import { type Config, Effect, Layer, Option } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import type { SqlClient } from "effect/unstable/sql";
import { Accounts } from "./Accounts.js";
import { AuthorizationLive } from "./Authorization.js";
import { ClerkIdentityProvider } from "./ClerkIdentityProvider.js";
import { allowedOrigins, clerkJwtKey } from "./Config.js";
import * as Database from "./Database.js";
import { ApiLive } from "./handlers.js";
import { Health } from "./Health.js";
import { IdentityProvider } from "./IdentityProvider.js";
import { Campaigns } from "./repo/Campaigns.js";
import { Characters } from "./repo/Characters.js";
import { Notes } from "./repo/Notes.js";
import { Sessions } from "./repo/Sessions.js";

/**
 * Which identity provider is behind the seam — the one place in the server
 * that names a vendor and chooses.
 *
 * Unset key means disabled, not broken: this is the default configuration, it
 * is what CI runs, and it is what someone who has never opened the Clerk
 * dashboard gets. The log line exists so that "my session token is rejected"
 * has an answer sitting in the boot output rather than requiring a bisect.
 */
export const identityFromConfig: Layer.Layer<IdentityProvider, Config.ConfigError> = Layer.unwrap(
  Effect.gen(function* () {
    const jwtKey = yield* clerkJwtKey;
    if (Option.isNone(jwtKey)) {
      yield* Effect.logInfo(
        "CLERK_JWT_KEY is unset: hosted sign-in is off and machine tokens are the only credential.",
      );
      return IdentityProvider.disabled;
    }
    // The same origins the CORS allowlist uses, so the `azp` check and the
    // browser allowlist cannot disagree about which front end this is.
    const authorizedParties = yield* allowedOrigins;
    return ClerkIdentityProvider.layer({ jwtKey: jwtKey.value, authorizedParties });
  }),
);

/**
 * Everything the handlers need, over whichever database it is given.
 *
 * Parameterised so the tests can mount the same wiring over a throwaway
 * database — the alternative is a second, subtly different assembly, which is
 * how a server ends up passing its tests and failing on boot. The identity
 * provider is parameterised for the same reason and defaults to the configured
 * one, so a test that says nothing about it gets exactly what production gets.
 */
export const servicesOver = <E>(
  database: Layer.Layer<SqlClient.SqlClient | PgClient.PgClient, E>,
  identity: Layer.Layer<IdentityProvider, E | Config.ConfigError> = identityFromConfig,
): Layer.Layer<
  Accounts | Authorization | Campaigns | Characters | Health | Notes | Sessions,
  E | Config.ConfigError
> =>
  Layer.mergeAll(
    Accounts.layer,
    AuthorizationLive.pipe(Layer.provide([Accounts.layer, identity])),
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
