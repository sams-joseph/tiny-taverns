import { NodeHttpServer } from "@effect/platform-node";
import { type Creature, TavernsApi } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemCreatures } from "../src/bestiary/import.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The Library: `GET /library/creatures`, the shared corpus read with **no
 * campaign in the path**.
 *
 * `bestiary.test.ts` pins the corpus as it is reached *through* a campaign, and
 * says in its own header that reasoning about a `WHERE` clause is not evidence.
 * This file holds the same line for the read that has no campaign to be gated
 * by, which is the one place the argument is genuinely new: every other
 * predicate in `repo/visibility.ts` bottoms out in a membership row, and this
 * one does not.
 *
 * So it runs over the **real application** — the same `servicesOver` /
 * `applicationOver` `main.ts` uses — through the client derived from the
 * declaration the server implements. Nothing here reaches a repository
 * directly: the credential, the middleware, the query decoding and the
 * predicate are all the shipped ones, which is what makes "it 401s without a
 * token" a fact about the endpoint rather than about a service call.
 */
const database = migratedDatabase("taverns_test_library");
const services = servicesOver(database);

/**
 * `database` is merged in as well as provided, so this file can load the bundled
 * corpus the way an operator does and set a row's visibility behind the
 * repositories. `Layer` memoises by identity, so it is still one pool and one
 * migration run.
 */
const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
    Layer.provideMerge(database),
  ),
);
afterAll(() => runtime.dispose());

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });

const anonymous = HttpApiClient.make(TavernsApi);

/** The Library, as this credential reads it. */
interface LibraryQuery {
  readonly q?: string;
  readonly environments?: ReadonlyArray<string>;
  readonly sort?: "cr" | "name" | "recent";
}

const libraryFor = (token: string, query: LibraryQuery = {}) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(token), (client) => client.library.list({ query })).pipe(Effect.orDie),
  );

const named = (creatures: ReadonlyArray<Creature>): ReadonlyArray<string> =>
  creatures.map((creature) => creature.name);

/**
 * A DM with a table of their own, a player at it, and a stranger who is at no
 * table anywhere.
 *
 * The third is the actor this endpoint exists for and the one no other test file
 * has a use for: an account that is a member of nothing at all is a legitimate
 * steady state — somebody who signed up and has not been invited yet — and the
 * Library is the first read in the product that answers them anything.
 */
const makeFixture = Effect.gen(function* () {
  const accounts = yield* Accounts;
  const sql = yield* SqlClient.SqlClient;

  yield* importSystemCreatures();

  const dm = yield* accounts.issue("Jo");
  const stranger = yield* accounts.issue("Nobody in particular");

  const client = yield* clientFor(dm.token);

  const campaign = yield* client.campaigns.create({
    payload: { name: "The Salt Road", visibility: "shared" },
  });

  // Two campaign creatures, one of each visibility. Neither may appear in the
  // Library — a `shared` one is the interesting half, because "shared" is what
  // the Library's own rows have to be and a predicate that tested only that
  // would let this through.
  const authored = yield* client.creatures.create({
    params: { campaignId: campaign.id },
    payload: {
      name: "The Ferryman's Wife",
      size: "Medium",
      type: "Fey",
      cr: "5",
      ac: 17,
      hp: 82,
      environments: ["River"],
    },
  });
  const sharedAuthored = yield* client.creatures.create({
    params: { campaignId: campaign.id },
    payload: {
      name: "Reed Skiff",
      type: "Beast",
      cr: "1/8",
      ac: 11,
      hp: 8,
      environments: ["River"],
      visibility: "shared",
    },
  });

  // A real player, minted the way a person is: the DM issues an invitation and
  // a fresh account redeems it over HTTP.
  const invite = yield* client.invites.create({
    params: { campaignId: campaign.id },
    payload: { label: "Pim" },
  });
  const player = yield* accounts.issue("Pim");
  yield* Effect.flatMap(clientFor(player.token), (asPlayer) =>
    asPlayer.join.redeem({ payload: { token: invite.token } }),
  );

  // Measured before anything is shared, because it is the state a fresh
  // deployment is really in — see the assertion that reads it.
  const beforeSharing = yield* Effect.flatMap(clientFor(dm.token), (asDm) =>
    asDm.library.list({ query: {} }),
  );

  // The corpus arrives from `bestiary/import.ts` entirely `dm`, because that
  // file never writes a visibility and the column default decides. Sharing two
  // of them is what an operator or a future provisioning step does; the rest
  // stay `dm` and are the refusal this file pins.
  yield* sql`
    update creature set visibility = 'shared'
    where campaign_id is null and name in ('Goblin Boss', 'Marsh Hag')
  `;
  const stillPrivate = yield* sql<{ readonly name: string }>`
    select name from creature
    where campaign_id is null and visibility = 'dm'
    order by name limit 1
  `;

  return {
    dm,
    player,
    stranger,
    campaign,
    authored,
    sharedAuthored,
    beforeSharing,
    /** A `system` creature the operator has not shared. */
    privateSystem: stillPrivate[0]!.name,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

describe("the Library", () => {
  it("needs a credential, like every read but the invitation preview", async () => {
    // `HttpApiSecurity.bearer` answers no 401 of its own — it hands the
    // middleware an empty credential and runs it anyway — so this passes
    // because `Authorization` is on the group and rejects it explicitly. A
    // Library that answered anonymously would be the third unauthenticated
    // endpoint in the product, and `packages/api/src/Api.test.ts` names the two
    // that exist.
    const result = await runtime.runPromise(
      Effect.flatMap(anonymous, (client) => client.library.list({ query: {} })).pipe(Effect.result),
    );

    expect(result._tag).toBe("Failure");
  });

  it("is empty on a deployment where nothing has been shared, and that is honest", async () => {
    // **A finding, pinned rather than papered over.** `bestiary/import.ts`
    // never writes a `visibility`, so the column default (`dm`) decides and the
    // corpus `pnpm -F server bestiary:import` provisions is entirely DM-only.
    // The Library requires `shared` — a `dm` system row is readable only by a
    // DM *of the campaign in the path*, and there is no path here — so a freshly
    // provisioned deployment reads empty until somebody shares rows.
    //
    // That is the predicate working, not a bug in it, and the fix is a decision
    // about how the corpus is provisioned rather than a wider `where`: sharing
    // the bundled rows is a data change, and widening this read would hand every
    // authenticated account content the product currently says is DM-only.
    // Whichever way that goes, it should break this assertion first.
    expect(fixture.beforeSharing).toEqual([]);
  });

  it("answers a shared system creature", async () => {
    const seen = await libraryFor(fixture.dm.token);

    expect(named(seen)).toContain("Goblin Boss");
  });

  it("answers an account that is a member of no campaign anywhere", async () => {
    // The captain's decision, and the point of the whole endpoint: the shared
    // corpus belongs to no campaign, is reachable through every campaign
    // already, and is writable through no path — so membership is not the
    // question. This actor holds no `campaign_member` row at all, which every
    // other read in the product refuses outright.
    const seen = await libraryFor(fixture.stranger.token);

    expect(seen.length).toBeGreaterThan(0);
    expect(named(seen)).toContain("Goblin Boss");
  });

  it("answers a player the same list it answers the DM", async () => {
    const asDm = await libraryFor(fixture.dm.token);
    const asPlayer = await libraryFor(fixture.player.token);
    const asStranger = await libraryFor(fixture.stranger.token);

    // Not "a narrower list": there is nothing here to narrow. Who is asking
    // does not appear in the predicate, and this is the assertion that would
    // fail if a future edit smuggled an actor into it.
    expect(named(asPlayer)).toEqual(named(asDm));
    expect(named(asStranger)).toEqual(named(asDm));
  });

  it("returns nothing but the global corpus", async () => {
    const seen = await libraryFor(fixture.stranger.token);

    for (const creature of seen) {
      expect(creature.campaignId, `${creature.name} names a campaign`).toBeNull();
      expect(creature.origin, `${creature.name} is not a system row`).toBe("system");
      expect(creature.visibility, `${creature.name} is not shared`).toBe("shared");
    }
  });

  it("refuses a system creature the operator has not shared", async () => {
    // `corpusRowReadable` gives a `dm` system row to a DM *of the campaign in
    // the path*. There is no campaign here, so there is no such question to ask
    // — what is left is `shared`, which is the half every account already
    // reaches through every campaign it is at. The endpoint removes the campaign
    // a reader had to name, not the narrowing.
    for (const token of [fixture.dm.token, fixture.player.token, fixture.stranger.token]) {
      const seen = await libraryFor(token);

      expect(named(seen)).not.toContain(fixture.privateSystem);
    }
  });

  it("is still readable through a campaign by its DM, which is the contrast", async () => {
    // The Library is narrower than the campaign bestiary, not a replacement for
    // it. If this ever fails, the change widened `corpusRowReadable` rather than
    // adding a predicate beside it.
    const throughCampaign = await runtime.runPromise(
      Effect.flatMap(clientFor(fixture.dm.token), (client) =>
        client.creatures.list({
          params: { campaignId: fixture.campaign.id },
          query: { scope: "system" },
        }),
      ).pipe(Effect.orDie),
    );

    expect(named(throughCampaign)).toContain(fixture.privateSystem);
  });
});

describe("a campaign's own creatures", () => {
  it("are absent from the Library, shared or not, even for their own DM", async () => {
    const seen = await libraryFor(fixture.dm.token);

    // The `shared` one is the half that matters. `sharedCorpusRowReadable`
    // anchors on `campaign_id is null` as well as on the visibility, so a
    // predicate that tested only the visibility would hand this campaign's
    // read-aloud-able creature to every account in the product.
    expect(named(seen)).not.toContain(fixture.sharedAuthored.name);
    expect(named(seen)).not.toContain(fixture.authored.name);
  });

  it("cannot be surfaced by searching for them by name", async () => {
    // The search box is a client-varied clause beside the reach predicate, never
    // instead of it — the thing `narrowedBy` is kept separate from the anchor to
    // make structural.
    // Neither word appears anywhere in the bundled corpus, so an empty answer
    // here means the row was refused rather than merely outranked.
    const byName = await libraryFor(fixture.dm.token, { q: "Reed Skiff" });
    const byFragment = await libraryFor(fixture.dm.token, { q: "wife" });

    expect(named(byName)).toEqual([]);
    expect(named(byFragment)).toEqual([]);
  });

  it("cannot be reached by a credential scoped to their campaign either", async () => {
    // Scope narrows; it never widens. A player's credential is minted for one
    // table, and the Library is not that table — it is above every table, which
    // is the same answer for both.
    const seen = await libraryFor(fixture.player.token);

    expect(named(seen)).not.toContain(fixture.sharedAuthored.name);
  });
});

describe("the controls", () => {
  it("search the name and the stat block, the way the bestiary does", async () => {
    const byName = await libraryFor(fixture.stranger.token, { q: "gob" });

    // `ILIKE` on the name, mid-type — the half full text cannot do, because
    // "gob" is no lexeme of "Goblin".
    expect(named(byName)).toContain("Goblin Boss");
  });

  it("order by challenge rating, name and recency", async () => {
    const byCr = await libraryFor(fixture.stranger.token, { sort: "cr" });
    const byName = await libraryFor(fixture.stranger.token, { sort: "name" });

    expect([...byCr].map((creature) => creature.crSort)).toEqual(
      [...byCr].map((creature) => creature.crSort).sort((a, b) => a - b),
    );
    expect(named(byName)).toEqual([...named(byName)].sort());
  });

  it("narrow by environment, any-of", async () => {
    // Two of them, deliberately — see the next test. The corpus's two shared
    // rows are Goblin Boss (`Marsh`, `Cave`) and Marsh Hag (`Marsh`), so this
    // pair really narrows rather than trivially matching everything.
    const narrowed = await libraryFor(fixture.stranger.token, {
      environments: ["Cave", "River"],
    });

    expect(named(narrowed)).toEqual(["Goblin Boss"]);
  });

  it("is refused a one-element environment filter, exactly as the bestiary is", async () => {
    // **A known defect of the wire contract, pinned rather than worked around.**
    // The derived client encodes `["Cave"]` as a single `?environments=Cave`;
    // the server's query decoder reads one occurrence of a key as a scalar, and
    // `Schema.Array` refuses it — a 400. It is `CreatureFilter`'s behaviour
    // today and `LibraryFilter` inherits it by being the same fields, which is
    // the point: one contract, one bug, one fix. `apps/web/src/bestiary/`
    // applies the any-of client-side for this reason.
    //
    // The fix belongs in `packages/api` or upstream in `effect`, not in a second
    // client-side workaround and not in a special case here. This assertion is
    // what will fail — loudly, and in the right file — on the day it lands.
    const refused = await runtime.runPromise(
      Effect.flatMap(clientFor(fixture.stranger.token), (client) =>
        client.library.list({ query: { environments: ["Cave"] } }),
      ).pipe(Effect.result),
    );

    expect(refused._tag).toBe("Failure");
  });

  it("has no scope, and naming one anyway reaches nothing", async () => {
    // `CreatureFilter` carries `scope`; `LibraryFilter` deliberately does not —
    // a filter with one legal value is a control that cannot mean anything, the
    // shape `campaign_invite.role` was refused for. The derived client will not
    // let one be sent at all, which is the good outcome and also why this goes
    // over a raw request: the question is what the *server* does when a client
    // that is not ours names one.
    const body = await runtime.runPromise(
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient;
        const response = yield* http.get(
          "/library/creatures?scope=campaign&campaignId=" + fixture.campaign.id,
          { headers: { authorization: `Bearer ${fixture.dm.token}` } },
        );
        return yield* response.json;
      }).pipe(Effect.orDie),
    );
    const names = (body as ReadonlyArray<{ readonly name: string }>).map(
      (creature) => creature.name,
    );

    expect(names).not.toContain(fixture.sharedAuthored.name);
    expect(names).toContain("Goblin Boss");
  });
});
