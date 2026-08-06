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
import { Encounters } from "./repo/Encounters.js";
import { Notes } from "./repo/Notes.js";
import { PrepItems } from "./repo/PrepItems.js";
import { Sessions } from "./repo/Sessions.js";

/**
 * Which identity provider is behind the seam — the one place in the server
 * that names a vendor and chooses.
 *
 * Unset key means disabled, not broken: this is the default configuration, it
 * is what CI runs, and it is what someone who has never opened the Clerk
 * dashboard gets.
 *
 * **Both branches log, and that is the point.** One line, always, saying which
 * mode the process is in. A silent "on" branch is not a saving: the way this
 * actually goes wrong is a key that was set somewhere the server does not read
 * — the wrong file, the wrong variable name, a shell that never exported it —
 * and the only symptom is a sign-in that fails much later, indistinguishably
 * from a bad key or a misconfigured dashboard. Saying "hosted sign-in is on"
 * at boot is what turns that into a five-second check.
 *
 * Neither line carries key material — not the PEM, not a prefix, not a length.
 * There is nothing to learn from those that "configured" does not already say,
 * and boot output ends up in log aggregators.
 */
export const identityFromConfig: Layer.Layer<IdentityProvider, Config.ConfigError> = Layer.unwrap(
  Effect.gen(function* () {
    const jwtKey = yield* clerkJwtKey;
    if (Option.isNone(jwtKey)) {
      yield* Effect.logInfo(
        "Hosted sign-in is OFF: CLERK_JWT_KEY is unset, so machine tokens are the only " +
          "credential. To turn it on, set it in apps/server/.env.local (see .env.example).",
      );
      return IdentityProvider.disabled;
    }
    yield* Effect.logInfo(
      "Hosted sign-in is ON: CLERK_JWT_KEY is configured, so session tokens are accepted " +
        "alongside machine tokens.",
    );
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
  | Accounts
  | Authorization
  | Campaigns
  | Characters
  | Encounters
  | Health
  | Notes
  | PrepItems
  | Sessions,
  E | Config.ConfigError
> =>
  Layer.mergeAll(
    Accounts.layer,
    AuthorizationLive.pipe(Layer.provide([Accounts.layer, identity])),
    Campaigns.layer,
    Characters.layer,
    Encounters.layer,
    Notes.layer,
    PrepItems.layer,
    Sessions.layer,
    Health.layer,
  ).pipe(Layer.provide(database));

/**
 * The configured services, over the real database.
 *
 * Exported as a named constant rather than inlined because `main.ts` needs
 * *this object*, not an equivalent one: it provides it to the TCP listener so
 * the socket binds only after the pool is open and the migrations have run, and
 * `Layer` memoises by layer identity, so a second `servicesOver(Database.layer)`
 * would be a second pool and a second migration run. See the comment on
 * `listener` in `main.ts`.
 */
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
    | Accounts
    | Authorization
    | Campaigns
    | Characters
    | Encounters
    | Health
    | Notes
    | PrepItems
    | Sessions,
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
