import { NodeHttpServer } from "@effect/platform-node";
import { TavernsApi } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { ClerkIdentityProvider } from "../src/ClerkIdentityProvider.js";
import { migratedDatabase } from "./support/database.js";
import { testIdentityInstance, TEST_ORIGIN } from "./support/identity.js";

/**
 * The hosted sign-in path, end to end over HTTP, against a keypair this file
 * generates. The real `servicesOver`/`applicationOver` — only the identity
 * provider's key material is local, so what is exercised is the wiring the
 * server actually boots with.
 */
const instance = testIdentityInstance();
/** A different instance, for "signed by somebody else". Its own `kid`. */
const impostor = testIdentityInstance();

const database = migratedDatabase("taverns_test_identity");
const services = servicesOver(
  database,
  ClerkIdentityProvider.layer({
    jwtKey: instance.jwtKey,
    authorizedParties: [TEST_ORIGIN],
  }),
);

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
    // The same layer value, so it is memoised rather than built twice; this
    // only exposes `SqlClient` to the assertions below.
    Layer.provideMerge(database),
  ),
);
afterAll(() => runtime.dispose());

const clientFor = (credential: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(credential)),
  });

/** Campaign ids visible to whoever holds this credential. */
const campaignsFor = (credential: string) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(credential), (client) => client.campaigns.list()).pipe(
      Effect.map((campaigns) => campaigns.map((campaign) => campaign.name)),
      Effect.orDie,
    ),
  );

const listResult = (credential: string) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(credential), (client) => client.campaigns.list()).pipe(Effect.result),
  );

const accountsWithSubject = (subject: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return yield* sql<{ readonly id: string; readonly name: string }>`
        select id, name from account where clerk_user_id = ${subject}
      `;
    }).pipe(Effect.orDie),
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

describe("a session token from the configured provider", () => {
  it("authenticates, provisions an account on first use, and reuses it on the second", async () => {
    const token = instance.sessionToken({ subject: "user_first", name: "Robin Vale" });

    // First request from someone the server has never seen.
    await runtime.runPromise(
      Effect.flatMap(clientFor(token), (client) =>
        client.campaigns.create({ payload: { name: "The Salt Road" } }),
      ).pipe(Effect.orDie),
    );

    const afterFirst = await accountsWithSubject("user_first");
    expect(afterFirst).toHaveLength(1);
    // The name came from the optional custom claim.
    expect(afterFirst[0]?.name).toBe("Robin Vale");

    // Second request, freshly minted token, same person.
    const second = instance.sessionToken({ subject: "user_first", name: "Robin Vale" });
    await runtime.runPromise(
      Effect.flatMap(clientFor(second), (client) =>
        client.campaigns.create({ payload: { name: "The Wintermere" } }),
      ).pipe(Effect.orDie),
    );

    const afterSecond = await accountsWithSubject("user_first");
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]?.id).toBe(afterFirst[0]?.id);
    // Reused, not re-provisioned: both campaigns are under the one account.
    expect([...(await campaignsFor(second))].sort()).toEqual(["The Salt Road", "The Wintermere"]);
  }, 60_000);

  it("falls back to a default name when the provider sends no name claim", async () => {
    // The custom session claim is configured in a dashboard, outside this
    // repository, and must never be load-bearing: absent is a supported case.
    const token = instance.sessionToken({ subject: "user_nameless" });
    await campaignsFor(token);

    const accounts = await accountsWithSubject("user_nameless");
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.name).toBe("DM");
  }, 60_000);

  it("produces an actor indistinguishable from a machine token's below the seam", async () => {
    // Same shape, so the same visibility rules apply — and two accounts stay
    // separate whichever kind of credential minted them.
    const token = instance.sessionToken({ subject: "user_scoped" });
    await runtime.runPromise(
      Effect.flatMap(clientFor(token), (client) =>
        client.campaigns.create({ payload: { name: "Hosted table" } }),
      ).pipe(Effect.orDie),
    );

    expect(await campaignsFor(token)).toEqual(["Hosted table"]);
    expect(await campaignsFor(machineToken)).not.toContain("Hosted table");
  }, 60_000);
});

describe("a session token the provider did not mint", () => {
  it("is rejected when it is signed by a different key", async () => {
    // Structurally perfect and unexpired — only the signer is wrong. Its own
    // `kid`, or the PEM cache would hand it the first key and it would verify.
    const forged = impostor.sessionToken({ subject: "user_forged" });

    expect((await listResult(forged))._tag).toBe("Failure");
    // And it provisioned nothing: rejection happens before the database.
    expect(await accountsWithSubject("user_forged")).toHaveLength(0);
  }, 60_000);

  it("is rejected when it has expired", async () => {
    const stale = instance.sessionToken({ subject: "user_stale", expiresInSeconds: -60 });

    expect((await listResult(stale))._tag).toBe("Failure");
    expect(await accountsWithSubject("user_stale")).toHaveLength(0);
  }, 60_000);

  it("is rejected when it was issued for a different front end", async () => {
    // `authorizedParties` is fed from the CORS origin list, so a token minted
    // for somebody else's app does not authenticate here.
    const foreign = instance.sessionToken({
      subject: "user_foreign",
      azp: "https://not-taverns.example",
    });

    expect((await listResult(foreign))._tag).toBe("Failure");
    expect(await accountsWithSubject("user_foreign")).toHaveLength(0);
  }, 60_000);

  it("is rejected when it is three segments of nonsense", async () => {
    expect((await listResult("not.a.jwt"))._tag).toBe("Failure");
  }, 60_000);
});

describe("the machine token path is untouched", () => {
  it("still authenticates while hosted sign-in is configured", async () => {
    const listed = await campaignsFor(machineToken);
    expect(Array.isArray(listed)).toBe(true);
  }, 60_000);

  it("still rejects an unknown opaque token, and an absent credential", async () => {
    expect((await listResult("not-a-real-token"))._tag).toBe("Failure");

    const anonymous = await runtime.runPromise(
      Effect.flatMap(HttpApiClient.make(TavernsApi), (client) => client.campaigns.list()).pipe(
        Effect.result,
      ),
    );
    expect(anonymous._tag).toBe("Failure");
  }, 60_000);
});
