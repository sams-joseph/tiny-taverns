import { NodeHttpServer } from "@effect/platform-node";
import { Actor, type Creature, type CreatureId, CurrentActor, TavernsApi } from "@taverns/api";
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
 * The Library: **where a monster is authored**, and the originals a campaign
 * takes copies of.
 *
 * Captain's model: *"The library should be where you create the entities; when
 * you use them in a campaign they are copied in, so the library should only show
 * the raw entity and not anything in campaigns, as the campaign is a copied
 * state of the entity."* Four statements, and this file is the pin on all four:
 *
 *   1. a creature can be owned by an **account** and sit in no campaign;
 *   2. authoring happens here, with no campaign anywhere in the path;
 *   3. using one in a campaign copies it in, and the copy is a **snapshot**;
 *   4. this list shows originals only, never a campaign's copy of one.
 *
 * **And the fifth thing, which is the whole risk of the change**: putting a
 * second kind of row at `campaign_id is null` — one its owner must be able to
 * write — is exactly what could have spent the shared corpus's structural
 * immutability. `0004_bestiary.ts` bought that with "every write requires
 * `campaign_id` to equal the campaign in the path, and a null never equals a
 * uuid". The replacement is the same argument one column across, and the block
 * below drives it from every write path the product has plus raw SQL.
 *
 * It runs over the **real application** — the same `servicesOver` /
 * `applicationOver` `main.ts` uses — through the client derived from the
 * declaration the server implements. With no campaign in any of these paths, the
 * predicate is the *only* thing standing between one account's Library and
 * another account's monsters, so nothing here is allowed to reach past HTTP
 * except where it says it is and why.
 */
const database = migratedDatabase("taverns_test_library");
const services = servicesOver(database);

/**
 * `database` is merged in as well as provided, so this file can load the bundled
 * corpus the way an operator does and read the raw rows for the constraint
 * assertions. `Layer` memoises by identity, so it is still one pool and one
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

/** The derived client, named so the two helpers below can take one. */
type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(Effect.flatMap(clientFor(token), call).pipe(Effect.orDie));

/** The same, for a call that is expected to be refused. */
const refused = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(Effect.flatMap(clientFor(token), call).pipe(Effect.flip, Effect.orDie));

interface LibraryQuery {
  readonly q?: string;
  readonly environments?: ReadonlyArray<string>;
  readonly sort?: "cr" | "name" | "recent";
}

/** The Library, as this credential reads it. */
const libraryFor = (token: string, query: LibraryQuery = {}) =>
  as(token, (client) => client.library.list({ query }));

const named = (creatures: ReadonlyArray<Creature>): ReadonlyArray<string> =>
  creatures.map((creature) => creature.name);

const sql = <A>(run: (client: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, run).pipe(Effect.result, Effect.orDie));

/** One creature per interesting position, so an absence is never accidental. */
const CREATURES = {
  /** Jo's Library — the ordinary case, and the shape that did not exist before. */
  hers: "The Ferryman's Wife",
  /** A second, so a list can lose one without becoming empty. */
  herOther: "Reed Skiff",
  /** Bo's Library. Jo must never see it, by any route. */
  theirs: "The Sixpence Wraith",
  /** Written straight into Jo's campaign, the old way. A copy with no original. */
  inHerCampaign: "Whatever Is In The Crate",
  /** Authored by an account that is at no table at all. */
  theUninvited: "Something Under The Floor",
} as const;

const aCreature = (name: string) => ({
  name,
  type: "Fey" as const,
  cr: "5",
  ac: 17,
  hp: 82,
  environments: ["River"],
});

/**
 * Two DMs with tables of their own, a player at one of them, and an account that
 * is at no table anywhere — which under this model is no longer an account with
 * nothing, because authoring is not an act inside a campaign.
 */
const makeFixture = Effect.gen(function* () {
  const accounts = yield* Accounts;

  // Left exactly as `pnpm -F server bestiary:import` leaves it: entirely `dm`,
  // because that file never writes a visibility.
  yield* importSystemCreatures();

  const jo = yield* accounts.issue("Jo");
  const bo = yield* accounts.issue("Bo");
  const uninvited = yield* accounts.issue("Nobody in particular");

  const asJo = yield* clientFor(jo.token);
  const asBo = yield* clientFor(bo.token);
  const asUninvited = yield* clientFor(uninvited.token);

  const saltRoad = yield* asJo.campaigns.create({
    payload: { name: "The Salt Road", visibility: "shared" },
  });
  const theirTable = yield* asBo.campaigns.create({
    payload: { name: "A different table", visibility: "shared" },
  });

  const hers = yield* asJo.library.create({ payload: aCreature(CREATURES.hers) });
  const herOther = yield* asJo.library.create({ payload: aCreature(CREATURES.herOther) });
  const theirs = yield* asBo.library.create({ payload: aCreature(CREATURES.theirs) });
  const theUninvited = yield* asUninvited.library.create({
    payload: aCreature(CREATURES.theUninvited),
  });

  // A creature written straight into a campaign, which is still a path the
  // product has. It is the row statement 4 is about: a campaign's own creature,
  // which must never appear in anybody's Library.
  const inHerCampaign = yield* asJo.creatures.create({
    params: { campaignId: saltRoad.id },
    payload: aCreature(CREATURES.inHerCampaign),
  });

  /** A real player at Jo's table, minted the way a person is. */
  const issued = yield* asJo.invites.create({
    params: { campaignId: saltRoad.id },
    payload: { label: "Pim" },
  });
  const pim = yield* accounts.issue("Pim");
  yield* Effect.flatMap(clientFor(pim.token), (asThem) =>
    asThem.join.redeem({ payload: { token: issued.token } }),
  );

  const goblinBoss = yield* Effect.flatMap(
    SqlClient.SqlClient,
    (client) => client<{ readonly id: CreatureId }>`
      select id from creature where name = 'Goblin Boss' and campaign_id is null
    `,
  );

  return {
    jo,
    bo,
    uninvited,
    pim,
    saltRoad,
    theirTable,
    hers,
    herOther,
    theirs,
    theUninvited,
    inHerCampaign,
    goblinBoss: goblinBoss[0]!.id,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

describe("the Library shows originals only", () => {
  it("needs a credential, like every read but the invitation preview", async () => {
    // `HttpApiSecurity.bearer` answers no 401 of its own — it hands the
    // middleware an empty credential and runs it anyway — so this passes
    // because `Authorization` is on the group and rejects it explicitly.
    const result = await runtime.runPromise(
      Effect.flatMap(anonymous, (client) => client.library.list({ query: {} })).pipe(Effect.result),
    );

    expect(result._tag).toBe("Failure");
  });

  it("gives an account the bundle and its own entities, and nothing else", async () => {
    const seen = await libraryFor(fixture.jo.token);

    expect(named(seen)).toContain(CREATURES.hers);
    expect(named(seen)).toContain(CREATURES.herOther);
    expect(named(seen)).toContain("Goblin Boss");

    // Every row is an original: in no campaign, and either hers or nobody's.
    expect(seen.every((creature) => creature.campaignId === null)).toBe(true);
    expect(
      seen.every(
        (creature) => creature.accountId === null || creature.accountId === fixture.jo.accountId,
      ),
    ).toBe(true);
  });

  it("shows a DM none of their own campaign's creatures, which is the reversal", async () => {
    // **The statement this whole change is about.** The rule that shipped hours
    // earlier gathered every campaign creature the credential could reach; under
    // the model those are copies, and the Library shows the raw entity. So a
    // creature written into Jo's own table is absent from Jo's own Library, and
    // the campaign bestiary is where it lives.
    const library = await libraryFor(fixture.jo.token);
    const bestiary = await as(fixture.jo.token, (client) =>
      client.creatures.list({ params: { campaignId: fixture.saltRoad.id }, query: {} }),
    );

    expect(named(library)).not.toContain(CREATURES.inHerCampaign);
    expect(named(bestiary)).toContain(CREATURES.inHerCampaign);
  });

  it("gives an account nothing from another account's Library", async () => {
    // **The case that matters most.** There is no campaign in the path, so
    // nothing but the predicate stops one account's Library showing another's
    // monsters — and there is no visibility, no membership and no sharing
    // involved: the row's owner is the entire question.
    const hers = await libraryFor(fixture.jo.token);
    const theirs = await libraryFor(fixture.bo.token);

    expect(named(hers)).not.toContain(CREATURES.theirs);
    expect(named(theirs)).not.toContain(CREATURES.hers);
    expect(named(theirs)).not.toContain(CREATURES.herOther);

    // Each really has something for the other to miss, otherwise "nothing" is
    // trivially true and this proves less than it appears to.
    expect(named(theirs)).toContain(CREATURES.theirs);
  });

  it("cannot be talked into another account's entities by searching for them", async () => {
    // The search box is a client-varied clause beside the reach predicate, never
    // instead of it — which is what `narrowedBy` being separate from the gate
    // makes structural rather than careful.
    const byName = await libraryFor(fixture.jo.token, { q: CREATURES.theirs });
    const byFragment = await libraryFor(fixture.jo.token, { q: "wraith" });

    expect(named(byName)).toEqual([]);
    expect(named(byFragment)).toEqual([]);
  });

  it("refuses another account's entity by id, as a plain NotFound", async () => {
    const failure = await refused(fixture.jo.token, (client) =>
      client.library.findById({ params: { creatureId: fixture.theirs.id } }),
    );

    // Not `Forbidden`: "it exists but is not yours" is itself a disclosure.
    expect(failure).toMatchObject({ _tag: "NotFound", resource: "creature" });
  });

  it("belongs to an account that is at no table anywhere", async () => {
    // **The outcome that changed for a reader.** Under the superseded rule this
    // answered `[]`, because the Library was a gathering over the campaigns a
    // credential reached and this account reaches none. Authoring is not an act
    // inside a campaign, so it cannot require one — and a Library that were
    // empty until somebody invited you would make it one.
    const seen = await libraryFor(fixture.uninvited.token);

    expect(named(seen)).toContain(CREATURES.theUninvited);
    expect(named(seen)).toContain("Goblin Boss");
    expect(named(seen)).not.toContain(CREATURES.hers);
  });

  it("is not narrowed by the credential's scope either, which is a decision", async () => {
    // Nothing mints a campaign-scoped credential over HTTP yet, so this is the
    // one case that reaches past the wire: the actor is built by hand and the
    // read goes to the repository.
    //
    // **The standing rule is that membership and credential scope narrow
    // independently and both apply to every read** — and this read is where
    // scope has nothing to say. `Actor.campaignId` names the campaign a
    // credential was minted for, and every predicate that uses it answers "may
    // this credential reach campaign C"; there is no campaign here for it to be
    // about, so applying it would mean inventing a second meaning for the field.
    // What scope does not narrow is the credential's *account*, and the Library
    // is the account's.
    //
    // Pinned rather than left implicit so that whatever mints the first scoped
    // credential meets this decision instead of inheriting it silently. It is on
    // `AGENTS.md`'s list of what the captain has not been asked.
    const scoped = new Actor({ accountId: fixture.jo.accountId, campaignId: fixture.saltRoad.id });
    const seen = await runtime.runPromise(
      Effect.flatMap(Creatures, (creatures) => creatures.library({})).pipe(
        Effect.provideService(CurrentActor, scoped),
        Effect.orDie,
      ),
    );

    expect(named(seen)).toContain(CREATURES.hers);
    expect(named(seen)).toContain("Goblin Boss");
    // Still no campaign row, including from the very campaign the credential was
    // minted for — the anchor is the row being in no campaign, not the reader.
    expect(named(seen)).not.toContain(CREATURES.inHerCampaign);
    expect(named(seen)).not.toContain(CREATURES.theirs);
  });

  it("is not narrowed by a role, because there is no campaign to have one in", async () => {
    // A player's Library is the same shape as anybody's: the bundle, plus what
    // they have authored. `visibility` is a statement about players at a *table*
    // and there is no table here, so this read does not ask it — which is a
    // deliberate consequence of the model and not an oversight. What a player at
    // Jo's table may see of the corpus *through that campaign* is still
    // `corpusRowReadable`'s question and is unchanged; `bestiary.test.ts` pins
    // it, and the assertion below is the pair.
    const library = await libraryFor(fixture.pim.token);
    const bestiary = await as(fixture.pim.token, (client) =>
      client.creatures.list({ params: { campaignId: fixture.saltRoad.id }, query: {} }),
    );

    expect(named(library)).toContain("Goblin Boss");
    expect(named(library)).not.toContain(CREATURES.hers);
    expect(named(library)).not.toContain(CREATURES.inHerCampaign);
    // The bundle is `dm` as the import leaves it, so through a campaign a player
    // still gets none of it.
    expect(named(bestiary)).not.toContain("Goblin Boss");
  });
});

describe("authoring, with no campaign anywhere in the path", () => {
  it("creates an original owned by the account that asked", async () => {
    const made = await as(fixture.jo.token, (client) =>
      client.library.create({ payload: aCreature("The Lamplighter") }),
    );

    expect(made.campaignId).toBeNull();
    expect(made.accountId).toBe(fixture.jo.accountId);
    expect(made.origin).toBe("authored");
    // The column default decides, exactly as it does for a campaign row: the
    // Library payload has no `visibility` field at all, because a row in no
    // campaign has no players to narrow against.
    expect(made.visibility).toBe("dm");
    expect(made.crSort).toBe(5);
    expect(made.derivedFrom).toBeNull();

    const readBack = await as(fixture.jo.token, (client) =>
      client.library.findById({ params: { creatureId: made.id } }),
    );
    expect(readBack.name).toBe("The Lamplighter");
  });

  it("cannot be talked into a provenance, however the body is written", async () => {
    // A create payload carries no `origin` on any path, so a client cannot claim
    // `system` or `assistant` provenance. `Schema.Struct` drops the excess keys
    // on decode, which means this is not even a refusal — the fields never reach
    // the insert. Driven over a raw request because the derived client would not
    // encode them in the first place, and the question is what the *server* does
    // with a client that is not ours.
    const body = await runtime.runPromise(
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient;
        const response = yield* http.execute(
          HttpClientRequest.post("/library/creatures", {
            headers: { authorization: `Bearer ${fixture.jo.token}` },
          }).pipe(
            HttpClientRequest.bodyJsonUnsafe({
              ...aCreature("A Forgery"),
              origin: "system",
              assistantTurnId: "00000000-0000-0000-0000-000000000000",
              accountId: fixture.bo.accountId,
              campaignId: fixture.saltRoad.id,
              visibility: "shared",
            }),
          ),
        );
        return yield* response.json;
      }).pipe(Effect.orDie),
    );
    const made = body as unknown as Creature;

    expect(made.origin).toBe("authored");
    expect(made.assistantTurnId).toBeNull();
    // Not Bo's, and not the campaign's: both come from the server, and there is
    // nowhere in the declaration for a client to state either.
    expect(made.accountId).toBe(fixture.jo.accountId);
    expect(made.campaignId).toBeNull();
    expect(made.visibility).toBe("dm");
  });

  it("edits and deletes an entity the account owns", async () => {
    const made = await as(fixture.jo.token, (client) =>
      client.library.create({ payload: aCreature("The Tollkeeper") }),
    );

    const edited = await as(fixture.jo.token, (client) =>
      client.library.update({ params: { creatureId: made.id }, payload: { hp: 40, cr: "1/4" } }),
    );
    expect(edited.hp).toBe(40);
    // A new rating re-derives the sort key, the same rule the campaign path has.
    expect(edited.crSort).toBe(0.25);

    await as(fixture.jo.token, (client) =>
      client.library.remove({ params: { creatureId: made.id } }),
    );

    const gone = await refused(fixture.jo.token, (client) =>
      client.library.findById({ params: { creatureId: made.id } }),
    );
    expect(gone._tag).toBe("NotFound");
  });

  it("refuses to edit or delete another account's entity", async () => {
    const patched = await refused(fixture.bo.token, (client) =>
      client.library.update({
        params: { creatureId: fixture.hers.id },
        payload: { name: "Mine now" },
      }),
    );
    const deleted = await refused(fixture.bo.token, (client) =>
      client.library.remove({ params: { creatureId: fixture.hers.id } }),
    );

    expect(patched._tag).toBe("NotFound");
    expect(deleted._tag).toBe("NotFound");

    // And it is still there, unchanged — the refusals are refusals rather than
    // writes that happened to answer 404.
    const still = await as(fixture.jo.token, (client) =>
      client.library.findById({ params: { creatureId: fixture.hers.id } }),
    );
    expect(still.name).toBe(CREATURES.hers);
  });

  it("is not reachable through the campaign path, in either direction", async () => {
    // A Library entity has no campaign, so naming one is a claim about a row
    // that is not in it. Both of these are `rowWritable` refusing a null
    // `campaign_id`, which is the same mechanism that keeps the bundle safe.
    const patched = await refused(fixture.jo.token, (client) =>
      client.creatures.update({
        params: { campaignId: fixture.saltRoad.id, creatureId: fixture.hers.id },
        payload: { name: "Smuggled in" },
      }),
    );
    const found = await refused(fixture.jo.token, (client) =>
      client.creatures.findById({
        params: { campaignId: fixture.saltRoad.id, creatureId: fixture.hers.id },
      }),
    );

    expect(patched._tag).toBe("NotFound");
    expect(found._tag).toBe("NotFound");
  });
});

describe("the shared corpus is still immutable by construction", () => {
  it("is readable in every Library and writable from none of them", async () => {
    const readable = await as(fixture.jo.token, (client) =>
      client.library.findById({ params: { creatureId: fixture.goblinBoss } }),
    );
    const patched = await refused(fixture.jo.token, (client) =>
      client.library.update({
        params: { creatureId: fixture.goblinBoss },
        payload: { name: "Goblin Under-Boss" },
      }),
    );
    const deleted = await refused(fixture.jo.token, (client) =>
      client.library.remove({ params: { creatureId: fixture.goblinBoss } }),
    );

    expect(readable.accountId).toBeNull();
    expect(readable.origin).toBe("system");
    expect(patched._tag).toBe("NotFound");
    expect(deleted._tag).toBe("NotFound");

    // **The write predicate is the whole mechanism.** `libraryRowWritable`
    // compares `account_id` to the account the credential resolved to, a bundled
    // row's is null, and a null never equals a uuid. No handler checks `origin`,
    // and none needs to.
    const unchanged = await as(fixture.jo.token, (client) =>
      client.library.findById({ params: { creatureId: fixture.goblinBoss } }),
    );
    expect(unchanged.name).toBe("Goblin Boss");
  });

  it("is writable from no campaign path either, which is the older half", async () => {
    const patched = await refused(fixture.jo.token, (client) =>
      client.creatures.update({
        params: { campaignId: fixture.saltRoad.id, creatureId: fixture.goblinBoss },
        payload: { name: "Goblin Under-Boss" },
      }),
    );
    const deleted = await refused(fixture.jo.token, (client) =>
      client.creatures.remove({
        params: { campaignId: fixture.saltRoad.id, creatureId: fixture.goblinBoss },
      }),
    );

    expect(patched._tag).toBe("NotFound");
    expect(deleted._tag).toBe("NotFound");
  });

  it("cannot be given an owner, and an owned row cannot be made bundled", async () => {
    // **The pin the guarantee rests on, and the one that fails if it goes.**
    // "A bundled row's `account_id` is null" has to be a fact about the schema
    // rather than about how the importer happens to be written, because the
    // write predicate leans on it. `creature_system_is_unowned` is what makes it
    // one: `origin = 'system'` and *owned by nobody* are the same statement.
    const owned = await sql(
      (client) => client`
        update creature set account_id = ${fixture.jo.accountId}
        where id = ${fixture.goblinBoss}
      `,
    );
    const promoted = await sql(
      (client) => client`
        update creature set origin = 'system' where id = ${fixture.hers.id}
      `,
    );
    const disowned = await sql(
      (client) => client`
        update creature set account_id = null where id = ${fixture.hers.id}
      `,
    );

    expect(owned._tag).toBe("Failure");
    expect(promoted._tag).toBe("Failure");
    // An ownerless non-system row is refused by the same check from the other
    // side, which is what stops a write path minting one by omission.
    expect(disowned._tag).toBe("Failure");
  });

  it("refuses a creature that is a campaign's and an account's at once", async () => {
    // `creature_one_owner`. Without it, `account_id = me` would be a way to
    // write a row inside a campaign the actor does not DM — the predicate would
    // still say what it says and would no longer mean it.
    const both = await sql(
      (client) => client`
        update creature set campaign_id = ${fixture.saltRoad.id}
        where id = ${fixture.hers.id}
      `,
    );
    const inserted = await sql(
      (client) => client`
        insert into creature (campaign_id, account_id, name, type, cr, ac, hp)
        values (${fixture.saltRoad.id}, ${fixture.jo.accountId}, 'Two owners', 'Ooze', '1', 10, 10)
      `,
    );

    expect(both._tag).toBe("Failure");
    expect(inserted._tag).toBe("Failure");
  });

  it("has no bundled row anywhere with an owner, after everything above", async () => {
    const rows = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (client) => client<{ readonly count: string }>`
          select count(*) as count from creature
          where origin = 'system' and (campaign_id is not null or account_id is not null)
        `,
      ).pipe(Effect.orDie),
    );

    expect(rows[0]!.count).toBe("0");
  });
});

describe("a campaign takes a copy", () => {
  it("copies a Library entity in, as a campaign row with a trail", async () => {
    const copy = await as(fixture.jo.token, (client) =>
      client.creatures.derive({
        params: { campaignId: fixture.saltRoad.id, creatureId: fixture.hers.id },
        payload: {},
      }),
    );

    expect(copy.id).not.toBe(fixture.hers.id);
    expect(copy.campaignId).toBe(fixture.saltRoad.id);
    // Not hers any more — a copy has left the Library, and
    // `creature_one_owner` is what says a row cannot be in both places.
    expect(copy.accountId).toBeNull();
    expect(copy.derivedFrom).toBe(fixture.hers.id);
    // The existing decisions about a copy, unchanged: the DM wrote it, and a new
    // row fails closed rather than inheriting anything.
    expect(copy.origin).toBe("authored");
    expect(copy.visibility).toBe("dm");

    // The original is still an original, and still in the Library.
    const library = await libraryFor(fixture.jo.token);
    expect(library.filter((creature) => creature.name === CREATURES.hers)).toHaveLength(1);
    // And the campaign now has the copy, under its own id.
    const bestiary = await as(fixture.jo.token, (client) =>
      client.creatures.list({ params: { campaignId: fixture.saltRoad.id }, query: {} }),
    );
    expect(bestiary.map((creature) => creature.id)).toContain(copy.id);
    expect(bestiary.map((creature) => creature.id)).not.toContain(fixture.hers.id);
  });

  it("does not move the copy when the original is edited", async () => {
    // **"The campaign is a copied state of the entity."** The copy is a
    // snapshot: nothing is ever read through `derived_from`, so this is a
    // property of there being no join rather than of anybody remembering not to
    // write one — the same rule `combatant` already follows for a fight.
    const original = await as(fixture.jo.token, (client) =>
      client.library.create({ payload: aCreature("The Weir Warden") }),
    );
    const copy = await as(fixture.jo.token, (client) =>
      client.creatures.derive({
        params: { campaignId: fixture.saltRoad.id, creatureId: original.id },
        payload: {},
      }),
    );

    await as(fixture.jo.token, (client) =>
      client.library.update({
        params: { creatureId: original.id },
        payload: { name: "The Weir Warden, Drowned", hp: 12, ac: 9 },
      }),
    );

    const after = await as(fixture.jo.token, (client) =>
      client.creatures.findById({
        params: { campaignId: fixture.saltRoad.id, creatureId: copy.id },
      }),
    );

    expect(after.name).toBe("The Weir Warden");
    expect(after.hp).toBe(82);
    expect(after.ac).toBe(17);
    // And the other way round, so this is not a copy nobody can change.
    const edited = await as(fixture.jo.token, (client) =>
      client.creatures.update({
        params: { campaignId: fixture.saltRoad.id, creatureId: copy.id },
        payload: { hp: 5 },
      }),
    );
    const stillTheOriginal = await as(fixture.jo.token, (client) =>
      client.library.findById({ params: { creatureId: original.id } }),
    );
    expect(edited.hp).toBe(5);
    expect(stillTheOriginal.hp).toBe(12);
  });

  it("leaves the copy standing when the original is deleted", async () => {
    const original = await as(fixture.jo.token, (client) =>
      client.library.create({ payload: aCreature("The Lockkeeper") }),
    );
    const copy = await as(fixture.jo.token, (client) =>
      client.creatures.derive({
        params: { campaignId: fixture.saltRoad.id, creatureId: original.id },
        payload: {},
      }),
    );

    // No 409: a roster can only name a row `corpusRowReadable` returned, and a
    // Library entity is never one — so `library.remove` is a two-outcome
    // endpoint and the copy is what an encounter would have been holding.
    await as(fixture.jo.token, (client) =>
      client.library.remove({ params: { creatureId: original.id } }),
    );

    const after = await as(fixture.jo.token, (client) =>
      client.creatures.findById({
        params: { campaignId: fixture.saltRoad.id, creatureId: copy.id },
      }),
    );

    expect(after.name).toBe("The Lockkeeper");
    // `derived_from` is `on delete set null` and is read through by nothing, so
    // it is provenance rather than an access path.
    expect(after.derivedFrom).toBeNull();
  });

  it("refuses another account's Library entity as a source", async () => {
    // The source read is widened to the caller's **own** Library and no further.
    const failure = await refused(fixture.bo.token, (client) =>
      client.creatures.derive({
        params: { campaignId: fixture.theirTable.id, creatureId: fixture.hers.id },
        payload: {},
      }),
    );

    expect(failure._tag).toBe("NotFound");
  });

  it("keeps a Library entity off an encounter's roster until it is copied in", async () => {
    // The roster reads `corpusRowReadable`, so it can only ever name a campaign
    // creature or the bundle. That is what makes `library.remove` unable to
    // conflict — and it is the fourth statement met from the direction that
    // would have broken it.
    const encounter = await as(fixture.jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: fixture.saltRoad.id },
        payload: { name: "Ambush in the reeds" },
      }),
    );
    const original = await as(fixture.jo.token, (client) =>
      client.library.create({ payload: aCreature("The Reed Stalker") }),
    );

    const refusedLine = await refused(fixture.jo.token, (client) =>
      client.encounterCreatures.create({
        params: { campaignId: fixture.saltRoad.id, encounterId: encounter.id },
        payload: { creatureId: original.id, count: 2 },
      }),
    );

    const copy = await as(fixture.jo.token, (client) =>
      client.creatures.derive({
        params: { campaignId: fixture.saltRoad.id, creatureId: original.id },
        payload: {},
      }),
    );
    const line = await as(fixture.jo.token, (client) =>
      client.encounterCreatures.create({
        params: { campaignId: fixture.saltRoad.id, encounterId: encounter.id },
        payload: { creatureId: copy.id, count: 2 },
      }),
    );

    expect(refusedLine._tag).toBe("NotFound");
    expect(line.creatureId).toBe(copy.id);
  });

  it("still copies the bundle in, which is what derive was for", async () => {
    const copy = await as(fixture.jo.token, (client) =>
      client.creatures.derive({
        params: { campaignId: fixture.saltRoad.id, creatureId: fixture.goblinBoss },
        payload: { name: "The Ferryman's Boss" },
      }),
    );

    expect(copy.campaignId).toBe(fixture.saltRoad.id);
    expect(copy.derivedFrom).toBe(fixture.goblinBoss);
    // `authored` whatever the original was — the DM wrote the changes.
    expect(copy.origin).toBe("authored");
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
    // the point: one contract, one bug, one fix.
    //
    // The fix belongs in `packages/api` or upstream in `effect`, not in a second
    // client-side workaround and not in a special case here.
    const result = await runtime.runPromise(
      Effect.flatMap(clientFor(fixture.jo.token), (client) =>
        client.library.list({ query: { environments: ["Cave"] } }),
      ).pipe(Effect.result),
    );

    expect(result._tag).toBe("Failure");
  });

  it("has no scope, and naming one anyway reaches nothing", async () => {
    // `CreatureFilter` carries `scope`; `LibraryFilter` deliberately does not.
    // Every row this list can return is `campaign_id is null`, so a `scope` here
    // would be a filter whose only live value is `system` — which is `origin`
    // read as a filter. The derived client will not send one, which is why this
    // goes over a raw request: the question is what the *server* does when a
    // client that is not ours names one.
    const body = await runtime.runPromise(
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient;
        const response = yield* http.get(
          `/library/creatures?scope=campaign&campaignId=${fixture.saltRoad.id}`,
          { headers: { authorization: `Bearer ${fixture.jo.token}` } },
        );
        return yield* response.json;
      }).pipe(Effect.orDie),
    );
    const names = (body as ReadonlyArray<{ readonly name: string }>).map(
      (creature) => creature.name,
    );

    expect(names).not.toContain(CREATURES.inHerCampaign);
    expect(names).toContain(CREATURES.hers);
  });
});
