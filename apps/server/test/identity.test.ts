import { describe, expect } from "@effect/vitest";
import { TavernsApi } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { Accounts, DEFAULT_ACCOUNT_NAME } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { ClerkIdentityProvider } from "../src/ClerkIdentityProvider.js";
import { campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testIdentityInstance, TEST_ORIGIN } from "./support/identity.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

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

const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(services),
  // The same layer value, so it is memoised rather than built twice; this
  // only exposes `SqlClient` to the assertions below.
  Layer.provideMerge(database),
);

const clientFor = (credential: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(credential)),
  });

/** Campaign ids visible to whoever holds this credential. */
const campaignsFor = (credential: string) =>
  Effect.flatMap(clientFor(credential), (client) => client.campaigns.list()).pipe(
    Effect.map((campaigns) => campaigns.map((campaign) => campaign.name)),
    Effect.orDie,
  );

const listResult = (credential: string) =>
  Effect.flatMap(clientFor(credential), (client) => client.campaigns.list()).pipe(Effect.result);

const accountsWithSubject = (subject: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql<{ readonly id: string; readonly name: string }>`
      select id, name from account where clerk_user_id = ${subject}
    `;
  }).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  const machineToken = yield* Effect.flatMap(Accounts, (accounts) => accounts.issue("Jo")).pipe(
    Effect.map((issued) => issued.token),
    Effect.orDie,
  );
  return { machineToken };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "identity.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describeLayer("identity", shared, (it) => {
  describe("a session token from the configured provider", () => {
    it.effect(
      "authenticates, provisions an account on first use, and reuses it on the second",
      () =>
        Effect.gen(function* () {
          const token = instance.sessionToken({ subject: "user_first", name: "Robin Vale" });

          // First request from someone the server has never seen.
          yield* Effect.flatMap(clientFor(token), (client) =>
            campaignVia(client, { name: "The Salt Road" }),
          ).pipe(Effect.orDie);

          const afterFirst = yield* accountsWithSubject("user_first");
          expect(afterFirst).toHaveLength(1);
          // The name came from the optional custom claim.
          expect(afterFirst[0]?.name).toBe("Robin Vale");

          // Second request, freshly minted token, same person.
          const second = instance.sessionToken({ subject: "user_first", name: "Robin Vale" });
          yield* Effect.flatMap(clientFor(second), (client) =>
            campaignVia(client, { name: "The Wintermere" }),
          ).pipe(Effect.orDie);

          const afterSecond = yield* accountsWithSubject("user_first");
          expect(afterSecond).toHaveLength(1);
          expect(afterSecond[0]?.id).toBe(afterFirst[0]?.id);
          // Reused, not re-provisioned: both campaigns are under the one account.
          expect([...(yield* campaignsFor(second))].sort()).toEqual([
            "The Salt Road",
            "The Wintermere",
          ]);
        }),
    );

    it.effect("falls back to a default name when the provider sends no name claim", () =>
      Effect.gen(function* () {
        // The custom session claim is configured in a dashboard, outside this
        // repository, and must never be load-bearing: absent is a supported case.
        const token = instance.sessionToken({ subject: "user_nameless" });
        yield* campaignsFor(token);

        const accounts = yield* accountsWithSubject("user_nameless");
        expect(accounts).toHaveLength(1);
        expect(accounts[0]?.name).toBe(DEFAULT_ACCOUNT_NAME);
        // And it names no role. Just-in-time provisioning runs on the first
        // authenticated request from anyone, which since the invite landed is as
        // often a player following a link as it is a DM starting a table — so the
        // fallback that said "DM" would now be wrong for most accounts, and wrong
        // in the one place a name is rendered: the invitation page, which says who
        // is asking.
        expect(DEFAULT_ACCOUNT_NAME).not.toBe("DM");
      }),
    );

    it.effect("produces an actor indistinguishable from a machine token's below the seam", () =>
      Effect.gen(function* () {
        const { machineToken } = yield* Fixture;
        // Same shape, so the same visibility rules apply — and two accounts stay
        // separate whichever kind of credential minted them.
        const token = instance.sessionToken({ subject: "user_scoped" });
        yield* Effect.flatMap(clientFor(token), (client) =>
          campaignVia(client, { name: "Hosted table" }),
        ).pipe(Effect.orDie);

        expect(yield* campaignsFor(token)).toEqual(["Hosted table"]);
        expect(yield* campaignsFor(machineToken)).not.toContain("Hosted table");
      }),
    );
  });

  describe("a session token the provider did not mint", () => {
    it.effect("is rejected when it is signed by a different key", () =>
      Effect.gen(function* () {
        // Structurally perfect and unexpired — only the signer is wrong. Its own
        // `kid`, or the PEM cache would hand it the first key and it would verify.
        const forged = impostor.sessionToken({ subject: "user_forged" });

        expect((yield* listResult(forged))._tag).toBe("Failure");
        // And it provisioned nothing: rejection happens before the database.
        expect(yield* accountsWithSubject("user_forged")).toHaveLength(0);
      }),
    );

    it.effect("is rejected when it has expired", () =>
      Effect.gen(function* () {
        const stale = instance.sessionToken({ subject: "user_stale", expiresInSeconds: -60 });

        expect((yield* listResult(stale))._tag).toBe("Failure");
        expect(yield* accountsWithSubject("user_stale")).toHaveLength(0);
      }),
    );

    it.effect("is rejected when it was issued for a different front end", () =>
      Effect.gen(function* () {
        // `authorizedParties` is fed from the CORS origin list, so a token minted
        // for somebody else's app does not authenticate here.
        const foreign = instance.sessionToken({
          subject: "user_foreign",
          azp: "https://not-taverns.example",
        });

        expect((yield* listResult(foreign))._tag).toBe("Failure");
        expect(yield* accountsWithSubject("user_foreign")).toHaveLength(0);
      }),
    );

    it.effect("is rejected when it is three segments of nonsense", () =>
      Effect.gen(function* () {
        expect((yield* listResult("not.a.jwt"))._tag).toBe("Failure");
      }),
    );
  });

  describe("the machine token path is untouched", () => {
    it.effect("still authenticates while hosted sign-in is configured", () =>
      Effect.gen(function* () {
        const { machineToken } = yield* Fixture;
        const listed = yield* campaignsFor(machineToken);
        expect(Array.isArray(listed)).toBe(true);
      }),
    );

    it.effect("still rejects an unknown opaque token, and an absent credential", () =>
      Effect.gen(function* () {
        expect((yield* listResult("not-a-real-token"))._tag).toBe("Failure");

        const anonymous = yield* Effect.flatMap(HttpApiClient.make(TavernsApi), (client) =>
          client.campaigns.list(),
        ).pipe(Effect.result);
        expect(anonymous._tag).toBe("Failure");
      }),
    );
  });
});
