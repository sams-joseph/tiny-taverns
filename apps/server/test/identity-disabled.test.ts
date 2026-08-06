import { NodeHttpServer } from "@effect/platform-node";
import { TavernsApi } from "@taverns/api";
import { ConfigProvider, Effect, Layer, ManagedRuntime, Option } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, identityFromConfig, servicesOver } from "../src/app.js";
import { IdentityProvider } from "../src/IdentityProvider.js";
import { migratedDatabase } from "./support/database.js";
import { testIdentityInstance } from "./support/identity.js";

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

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
    Layer.provideMerge(database),
  ),
);
afterAll(() => runtime.dispose());

const clientFor = (credential: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(credential)),
  });

const listResult = (credential: string) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(credential), (client) => client.campaigns.list()).pipe(Effect.result),
  );

let machineToken: string;

beforeAll(async () => {
  machineToken = await runtime.runPromise(
    Effect.flatMap(Accounts, (accounts) => accounts.issue("Jo")).pipe(
      Effect.map((issued) => issued.token),
      Effect.orDie,
    ),
  );
}, 60_000);

describe("with no identity provider configured", () => {
  it("the server boots and serves", async () => {
    const status = await runtime.runPromise(
      Effect.flatMap(HttpApiClient.make(TavernsApi), (client) => client.health.check()).pipe(
        Effect.orDie,
      ),
    );

    expect(status.status).toBe("ok");
  }, 60_000);

  it("a machine token still authenticates", async () => {
    const campaigns = await runtime.runPromise(
      Effect.flatMap(clientFor(machineToken), (client) =>
        client.campaigns.create({ payload: { name: "Machine only" } }),
      ).pipe(Effect.orDie),
    );

    expect(campaigns.name).toBe("Machine only");
  }, 60_000);

  it("a session-token-shaped credential is simply unknown, and provisions nothing", async () => {
    // Well-formed and genuinely signed — it is only unknown because nothing
    // here is configured to recognise it. It gets the same answer as any other
    // unrecognised bearer token, and no 500.
    const token = instance.sessionToken({ subject: "user_unwanted", name: "Nobody" });

    expect((await listResult(token))._tag).toBe("Failure");

    const provisioned = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{
          readonly id: string;
        }>`select id from account where clerk_user_id is not null`;
      }).pipe(Effect.orDie),
    );
    expect(provisioned).toHaveLength(0);
  }, 60_000);

  it("an absent credential is rejected", async () => {
    // Not by the framework: `HttpApiSecurity.bearer` hands the middleware an
    // empty string and runs it anyway. This passes because `Authorization`
    // rejects the empty credential itself.
    const result = await runtime.runPromise(
      Effect.flatMap(HttpApiClient.make(TavernsApi), (client) => client.campaigns.list()).pipe(
        Effect.result,
      ),
    );

    expect(result._tag).toBe("Failure");
  }, 60_000);
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
    Effect.runPromise(
      Effect.flatMap(IdentityProvider, (identity) => identity.verify(credential)).pipe(
        Effect.provide(identityFromConfig),
        // Outermost, so it covers the layer's construction and not just the
        // effect that runs afterwards.
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })),
        Effect.orDie,
      ),
    );

  it("verifies nothing when CLERK_JWT_KEY is unset", async () => {
    const token = instance.sessionToken({ subject: "user_env" });

    const verified = await verifyThroughEnv({}, token);

    expect(Option.isNone(verified)).toBe(true);
  }, 60_000);

  it("verifies against the key when CLERK_JWT_KEY is set", async () => {
    // The other half of the switch. Without it, "unset means disabled" would
    // also be satisfied by a layer that is disabled unconditionally.
    const token = instance.sessionToken({ subject: "user_env" });

    const verified = await verifyThroughEnv({ CLERK_JWT_KEY: instance.jwtKey }, token);

    expect(Option.isSome(verified)).toBe(true);
    expect(Option.getOrThrow(verified).subject).toBe("user_env");
  }, 60_000);
});
