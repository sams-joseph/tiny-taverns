import { describe, expect } from "@effect/vitest";
import { TavernsApi } from "@taverns/api";
import { ConfigProvider, Context, Effect, Layer, Option } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, identityFromConfig, servicesOver } from "../src/app.js";
import { IdentityProvider } from "../src/IdentityProvider.js";
import { campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testIdentityInstance } from "./support/identity.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * The default configuration: no verification key, so no hosted sign-in.
 *
 * This is the mode a developer who has never opened a vendor dashboard gets,
 * and the mode CI runs in. Without this file someone eventually makes the key
 * required and nobody notices for a month — the whole suite would still pass,
 * because every other test configures a provider explicitly.
 */
const instance = testIdentityInstance();

const database = migratedDatabase("taverns_test_identity_disabled");
const services = servicesOver(database, IdentityProvider.disabled);

const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(services),
  Layer.provideMerge(database),
);

const clientFor = (credential: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(credential)),
  });

const listResult = (credential: string) =>
  Effect.flatMap(clientFor(credential), (client) => client.campaigns.list()).pipe(Effect.result);

const makeFixture = Effect.gen(function* () {
  const machineToken = yield* Effect.flatMap(Accounts, (accounts) => accounts.issue("Jo")).pipe(
    Effect.map((issued) => issued.token),
    Effect.orDie,
  );
  return { machineToken };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "identity-disabled.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describeLayer("identity-disabled", shared, (it) => {
  describe("with no identity provider configured", () => {
    it.effect("the server boots and serves", () =>
      Effect.gen(function* () {
        const status = yield* Effect.flatMap(HttpApiClient.make(TavernsApi), (client) =>
          client.health.check(),
        ).pipe(Effect.orDie);

        expect(status.status).toBe("ok");
      }),
    );

    it.effect("a machine token still authenticates", () =>
      Effect.gen(function* () {
        const { machineToken } = yield* Fixture;
        const campaigns = yield* Effect.flatMap(clientFor(machineToken), (client) =>
          campaignVia(client, { name: "Machine only" }),
        ).pipe(Effect.orDie);

        expect(campaigns.name).toBe("Machine only");
      }),
    );

    it.effect("a session-token-shaped credential is simply unknown, and provisions nothing", () =>
      Effect.gen(function* () {
        // Well-formed and genuinely signed — it is only unknown because nothing
        // here is configured to recognise it. It gets the same answer as any other
        // unrecognised bearer token, and no 500.
        const token = instance.sessionToken({ subject: "user_unwanted", name: "Nobody" });

        expect((yield* listResult(token))._tag).toBe("Failure");

        const provisioned = yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql<{
            readonly id: string;
          }>`select id from account where clerk_user_id is not null`;
        }).pipe(Effect.orDie);
        expect(provisioned).toHaveLength(0);
      }),
    );

    it.effect("an absent credential is rejected", () =>
      Effect.gen(function* () {
        // Not by the framework: `HttpApiSecurity.bearer` hands the middleware an
        // empty string and runs it anyway. This passes because `Authorization`
        // rejects the empty credential itself.
        const result = yield* Effect.flatMap(HttpApiClient.make(TavernsApi), (client) =>
          client.campaigns.list(),
        ).pipe(Effect.result);

        expect(result._tag).toBe("Failure");
      }),
    );
  });

  describe("the configured provider follows the environment", () => {
    /**
     * The environment is supplied as a provider rather than by writing to
     * `process.env`, and that is not a style choice: `ConfigProvider.fromEnv()`
     * *copies* `process.env` into a trie when it is constructed, and the default
     * provider is a `Context.Reference`, so the first config read in the process
     * memoises that snapshot for the whole run. Mutating `process.env` in a test
     * changes nothing, silently — the same shape as the `Context.Reference`
     * `fetch` memoisation recorded in AGENTS.md.
     */
    const verifyThroughEnv = (env: Record<string, string>, credential: string) =>
      Effect.flatMap(IdentityProvider, (identity) => identity.verify(credential)).pipe(
        Effect.provide(identityFromConfig),
        // Outermost, so it covers the layer's construction and not just the
        // effect that runs afterwards.
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })),
        Effect.orDie,
      );

    it.effect("verifies nothing when CLERK_JWT_KEY is unset", () =>
      Effect.gen(function* () {
        const token = instance.sessionToken({ subject: "user_env" });

        const verified = yield* verifyThroughEnv({}, token);

        expect(Option.isNone(verified)).toBe(true);
      }),
    );

    it.effect("verifies against the key when CLERK_JWT_KEY is set", () =>
      Effect.gen(function* () {
        // The other half of the switch. Without it, "unset means disabled" would
        // also be satisfied by a layer that is disabled unconditionally.
        const token = instance.sessionToken({ subject: "user_env" });

        const verified = yield* verifyThroughEnv({ CLERK_JWT_KEY: instance.jwtKey }, token);

        expect(Option.isSome(verified)).toBe(true);
        expect(Option.getOrThrow(verified).subject).toBe("user_env");
      }),
    );
  });
});
