import { NodeHttpServer } from "@effect/platform-node";
import { Actor, type CampaignId, type Creature, CurrentActor, TavernsApi } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemCreatures } from "../src/bestiary/import.js";
import { Creatures } from "../src/repo/Creatures.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The Library: `GET /library/creatures`, every creature **this account** can
 * reach, gathered with **no campaign in the path**.
 *
 * `bestiary.test.ts` pins the corpus as it is reached *through* a campaign, and
 * says in its own header that reasoning about a `WHERE` clause is not evidence.
 * This file holds the same line for the read that names no campaign, which is
 * where the argument is easiest to get wrong: with nothing in the path to gate
 * against, the predicate is the *only* thing standing between one account's
 * Library and another account's monsters.
 *
 * So it runs over the **real application** — the same `servicesOver` /
 * `applicationOver` `main.ts` uses — through the client derived from the
 * declaration the server implements. The credential, the middleware, the query
 * decoding and the predicate are all the shipped ones, which is what makes "it
 * 401s without a token" a fact about the endpoint rather than about a service
 * call.
 *
 * One case has to reach past HTTP, and says so where it does: nothing in the
 * product mints a campaign-scoped credential over the wire yet, so the actor for
 * that one is built by hand and the read goes straight to the repository.
 */
const database = migratedDatabase("taverns_test_library");
const services = servicesOver(database);

/**
 * `database` and `services` are merged in as well as provided, so this file can
 * load the bundled corpus the way an operator does and reach a repository for
 * the one case HTTP cannot express. `Layer` memoises by identity, so it is still
 * one pool and one migration run.
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

interface LibraryQuery {
  readonly q?: string;
  readonly environments?: ReadonlyArray<string>;
  readonly sort?: "cr" | "name" | "recent";
}

/** The Library, as this credential reads it. */
const libraryFor = (token: string, query: LibraryQuery = {}) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(token), (client) => client.library.list({ query })).pipe(Effect.orDie),
  );

const named = (creatures: ReadonlyArray<Creature>): ReadonlyArray<string> =>
  creatures.map((creature) => creature.name);

/** One creature per interesting position, so an absence is never accidental. */
const CREATURES = {
  /** Jo's first table, DM-only — the ordinary case. */
  hersPrivate: "The Ferryman's Wife",
  /** Jo's first table, shared with her players. */
  hersShared: "Reed Skiff",
  /** Jo's *second* table — the Library is over both, not over one. */
  herOtherTable: "Whatever Is In The Crate",
  /** Bo's table, which Jo is not at. Shared, so only the campaign gate hides it. */
  theirs: "The Sixpence Wraith",
} as const;

const aCreature = (name: string, visibility?: "dm" | "shared") => ({
  name,
  type: "Fey" as const,
  cr: "5",
  ac: 17,
  hp: 82,
  environments: ["River"],
  ...(visibility === undefined ? {} : { visibility }),
});

/**
 * Two DMs with tables of their own, a player at one of them, a player whose
 * membership is then withdrawn, and an account that is at no table anywhere.
 *
 * The second DM is the fixture this file exists for: the Library has no campaign
 * in its path, so "Jo does not read Bo's monsters" is a claim about the
 * predicate and nothing else.
 */
const makeFixture = Effect.gen(function* () {
  const accounts = yield* Accounts;

  // Left exactly as `pnpm -F server bestiary:import` leaves it: entirely `dm`,
  // because that file never writes a visibility. What a DM reads of it is the
  // whole corpus, and what a player reads of it is nothing — both are the
  // predicate applying the row's own visibility, and both are pinned below.
  yield* importSystemCreatures();

  const jo = yield* accounts.issue("Jo");
  const bo = yield* accounts.issue("Bo");
  const uninvited = yield* accounts.issue("Nobody in particular");

  const asJo = yield* clientFor(jo.token);
  const asBo = yield* clientFor(bo.token);

  const saltRoad = yield* asJo.campaigns.create({
    payload: { name: "The Salt Road", visibility: "shared" },
  });
  const sixpence = yield* asJo.campaigns.create({
    payload: { name: "Salt and Sixpence", visibility: "shared" },
  });
  const theirTable = yield* asBo.campaigns.create({
    payload: { name: "A different table", visibility: "shared" },
  });

  yield* asJo.creatures.create({
    params: { campaignId: saltRoad.id },
    payload: aCreature(CREATURES.hersPrivate),
  });
  yield* asJo.creatures.create({
    params: { campaignId: saltRoad.id },
    payload: aCreature(CREATURES.hersShared, "shared"),
  });
  yield* asJo.creatures.create({
    params: { campaignId: sixpence.id },
    payload: aCreature(CREATURES.herOtherTable),
  });
  yield* asBo.creatures.create({
    params: { campaignId: theirTable.id },
    payload: aCreature(CREATURES.theirs, "shared"),
  });

  /** A real player at Jo's first table, minted the way a person is. */
  const joins = (campaignId: CampaignId, name: string) =>
    Effect.gen(function* () {
      const issued = yield* asJo.invites.create({
        params: { campaignId },
        payload: { label: name },
      });
      const account = yield* accounts.issue(name);
      yield* Effect.flatMap(clientFor(account.token), (asThem) =>
        asThem.join.redeem({ payload: { token: issued.token } }),
      );
      return { account, invite: issued.invite };
    });

  const player = yield* joins(saltRoad.id, "Pim");
  const leaver = yield* joins(saltRoad.id, "Wren");

  return { jo, bo, uninvited, player, leaver, saltRoad, sixpence, theirTable };
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

  it("gives a DM every table's creatures and the bundled corpus, in one list", async () => {
    const seen = await libraryFor(fixture.jo.token);

    // Both her tables — the Library is over every campaign the credential
    // reaches, not over one. If this only ever held for a DM with a single
    // campaign, the quantifier would be doing nothing.
    expect(named(seen)).toContain(CREATURES.hersPrivate);
    expect(named(seen)).toContain(CREATURES.hersShared);
    expect(named(seen)).toContain(CREATURES.herOtherTable);

    // And the corpus, untouched by anybody — which is the whole point of the
    // captain's answer. The rule this file first shipped required
    // `visibility = 'shared'` of a global row and therefore read `[]` against
    // the corpus `bestiary:import` actually provisions.
    const corpus = seen.filter((creature) => creature.campaignId === null);
    expect(named(corpus)).toContain("Goblin Boss");
    expect(corpus.every((creature) => creature.origin === "system")).toBe(true);
    expect(corpus.every((creature) => creature.visibility === "dm")).toBe(true);
  });

  it("gives a DM nothing at all from a table they are not at", async () => {
    // **The case that matters most.** There is no campaign in the path, so
    // nothing but the predicate stops one account's Library showing another's
    // monsters — and Bo's creature is `shared`, so the row's own visibility is
    // not what is hiding it. It is `campaignInScope`, quantified.
    const hers = await libraryFor(fixture.jo.token);
    const theirs = await libraryFor(fixture.bo.token);

    expect(named(hers)).not.toContain(CREATURES.theirs);
    expect(named(theirs)).not.toContain(CREATURES.hersPrivate);
    expect(named(theirs)).not.toContain(CREATURES.hersShared);
    expect(named(theirs)).not.toContain(CREATURES.herOtherTable);

    // Each really has something for the other to miss, otherwise "nothing" is
    // trivially true and this proves less than it appears to.
    expect(named(theirs)).toContain(CREATURES.theirs);
  });

  it("cannot be talked into another table's creatures by searching for them", async () => {
    // The search box is a client-varied clause beside the reach predicate, never
    // instead of it — which is what `narrowedBy` being separate from the gate
    // makes structural rather than careful.
    const byName = await libraryFor(fixture.jo.token, { q: CREATURES.theirs });
    const byFragment = await libraryFor(fixture.jo.token, { q: "wraith" });

    expect(named(byName)).toEqual([]);
    expect(named(byFragment)).toEqual([]);
  });

  it("is honestly empty for an account that is at no table anywhere", async () => {
    // Not a gap: the Library is what this account can already reach, and an
    // account with no membership reaches nothing through a path either. The
    // same answer `GET /me/campaigns` gives, for the same reason — and the one
    // outcome that changed when the rule became the account's rather than the
    // world's.
    const seen = await libraryFor(fixture.uninvited.token);

    expect(seen).toEqual([]);
  });
});

describe("the row's own visibility, in both directions", () => {
  it("gives a player the shared half of their table and not the rest", async () => {
    const seen = await libraryFor(fixture.player.account.token);

    expect(named(seen)).toContain(CREATURES.hersShared);
    expect(named(seen)).not.toContain(CREATURES.hersPrivate);
    // The other table is Jo's, not theirs, so it is out by the campaign gate as
    // well — two independent reasons, and this asserts the pair.
    expect(named(seen)).not.toContain(CREATURES.herOtherTable);
  });

  it("gives a player none of the corpus while the corpus is DM-only", async () => {
    // `corpusRowReadable` says "global" means shared between a DM's campaigns,
    // not shared with their players, and quantifying the campaign does not
    // change that: the row's own visibility is tested inside the `exists`.
    const seen = await libraryFor(fixture.player.account.token);

    expect(seen.filter((creature) => creature.campaignId === null)).toEqual([]);
  });

  it("gives it to them once their DM shares it, and takes it back when she stops", async () => {
    const list = () => libraryFor(fixture.player.account.token);
    const setVisibility = (visibility: "dm" | "shared") =>
      runtime.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`
            update creature set visibility = ${visibility}
            where campaign_id is null and name = 'Goblin Boss'
          `;
        }).pipe(Effect.orDie),
      );

    await setVisibility("shared");
    const shared = await list();
    await setVisibility("dm");
    const unshared = await list();

    expect(named(shared)).toContain("Goblin Boss");
    expect(named(unshared)).not.toContain("Goblin Boss");
  });
});

describe("the credential's own narrowings", () => {
  it("reaches only the campaign a scoped credential was minted for, plus the corpus", async () => {
    // Nothing mints a campaign-scoped credential over HTTP yet, so this is the
    // one case that reaches past the wire: the actor is built by hand and the
    // read goes to the repository. Scope and membership narrow independently,
    // and this is the half no HTTP request in the product can exercise.
    const scoped = new Actor({ accountId: fixture.jo.accountId, campaignId: fixture.saltRoad.id });
    const seen = await runtime.runPromise(
      Effect.flatMap(Creatures, (creatures) => creatures.library({})).pipe(
        Effect.provideService(CurrentActor, scoped),
        Effect.orDie,
      ),
    );

    expect(named(seen)).toContain(CREATURES.hersPrivate);
    expect(named(seen)).toContain("Goblin Boss");
    // Her own second table, refused by the credential rather than by membership
    // — which is exactly the leak the scope clause closed, met with no campaign
    // in the path to hide behind.
    expect(named(seen)).not.toContain(CREATURES.herOtherTable);
    expect(named(seen)).not.toContain(CREATURES.theirs);
  });

  it("loses the rows when the membership behind them is revoked", async () => {
    const before = await libraryFor(fixture.leaver.account.token);

    await runtime.runPromise(
      Effect.flatMap(clientFor(fixture.jo.token), (asJo) =>
        asJo.invites.revoke({
          params: { campaignId: fixture.saltRoad.id, inviteId: fixture.leaver.invite.id },
          payload: {},
        }),
      ).pipe(Effect.orDie),
    );

    const after = await libraryFor(fixture.leaver.account.token);

    // Revoking an accepted invitation revokes the membership it granted, in the
    // same transaction — so this is the ordinary `campaignInScope` clause taking
    // the rows away, one level up from where it usually does.
    expect(named(before)).toContain(CREATURES.hersShared);
    expect(after).toEqual([]);
  });
});

describe("the controls", () => {
  it("search the name and the stat block, the way the bestiary does", async () => {
    // `ILIKE` on the name, mid-type — the half full text cannot do, because
    // "gob" is no lexeme of "Goblin".
    const byName = await libraryFor(fixture.jo.token, { q: "gob" });
    // And full text over the document, which no column holds.
    const byTrait = await libraryFor(fixture.jo.token, { q: "nimble escape" });

    expect(named(byName)).toContain("Goblin Boss");
    expect(named(byTrait)).toEqual(["Goblin Boss"]);
  });

  it("order by challenge rating and by name", async () => {
    const byCr = await libraryFor(fixture.jo.token, { sort: "cr" });
    const byName = await libraryFor(fixture.jo.token, { sort: "name" });

    expect(byCr.map((creature) => creature.crSort)).toEqual(
      [...byCr.map((creature) => creature.crSort)].sort((a, b) => a - b),
    );
    expect(named(byName)).toEqual([...named(byName)].sort());
  });

  it("narrow by environment, any-of", async () => {
    const narrowed = await libraryFor(fixture.jo.token, { environments: ["Cave", "Night"] });

    expect(narrowed.length).toBeGreaterThan(0);
    for (const creature of narrowed) {
      expect(
        creature.environments.some((environment) => ["Cave", "Night"].includes(environment)),
        `${creature.name} lives in neither`,
      ).toBe(true);
    }
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
      Effect.flatMap(clientFor(fixture.jo.token), (client) =>
        client.library.list({ query: { environments: ["Cave"] } }),
      ).pipe(Effect.result),
    );

    expect(refused._tag).toBe("Failure");
  });

  it("has no scope, and naming one anyway reaches nothing", async () => {
    // `CreatureFilter` carries `scope`; `LibraryFilter` deliberately does not —
    // the Library is one list by definition, and a client that could ask for
    // "just the campaign half" would be asking a question with no campaign to
    // ask it about. The derived client will not send one, which is the good
    // outcome and also why this goes over a raw request: the question is what
    // the *server* does when a client that is not ours names one.
    const body = await runtime.runPromise(
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient;
        const response = yield* http.get(
          `/library/creatures?scope=campaign&campaignId=${fixture.theirTable}`,
          { headers: { authorization: `Bearer ${fixture.jo.token}` } },
        );
        return yield* response.json;
      }).pipe(Effect.orDie),
    );
    const names = (body as ReadonlyArray<{ readonly name: string }>).map(
      (creature) => creature.name,
    );

    expect(names).not.toContain(CREATURES.theirs);
    expect(names).toContain(CREATURES.hersPrivate);
  });
});
