import { NodeHttpServer } from "@effect/platform-node";
import {
  type BackgroundBody,
  type CharacterOption,
  type CharacterOptionId,
  type ClassBody,
  seedFor,
  type SpeciesBody,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import {
  SYSTEM_BACKGROUNDS,
  SYSTEM_CLASSES,
  SYSTEM_SPECIES,
  type SystemOption,
} from "../src/ruleset/systemOptions.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **A campaign can have its own classes, species and backgrounds, and
 * characters are built from them.**
 *
 * This file is `library.test.ts`'s shape over the second table that carries the
 * Library model, and it is deliberately not a copy of it: what it pins is the
 * three things that are *different* about a rules entry, on top of the four
 * ownership statements it inherits.
 *
 *   1. **A player reads this list.** A creature list is the DM's; the campaign
 *      option list is what the create form's pickers read, so
 *      `corpusRowReadable`'s last clause — `isDm OR visibility = 'shared'` — is
 *      the difference between a class a player can pick and one they cannot.
 *   2. **A player can never read their DM's Library**, which is why the copy is
 *      load-bearing rather than convenient. Without `derive` the feature does
 *      not work at all.
 *   3. **Propagation stops at every hop**, and the last hop is a character:
 *      editing the campaign copy afterwards does not move a number on a sheet
 *      somebody is playing.
 *
 * It runs over the **real application** — the same `servicesOver` /
 * `applicationOver` `main.ts` uses — through the client derived from the
 * declaration the server implements, with real invitations minting the player.
 * Nothing reaches past HTTP except the two raw-SQL blocks that say why.
 */
const database = migratedDatabase("taverns_test_options");
const services = servicesOver(database);

/**
 * `database` is merged in as well as provided, so this file can load the bundle
 * the way an operator does and read raw rows for the constraint assertions.
 * `Layer` memoises by identity, so it is still one pool and one migration run.
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

type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(Effect.flatMap(clientFor(token), call).pipe(Effect.orDie));

/** The same, for a call that is expected to be refused. */
const refused = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(Effect.flatMap(clientFor(token), call).pipe(Effect.flip, Effect.orDie));

const sql = <A>(run: (client: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, run).pipe(Effect.result, Effect.orDie));

const named = (options: ReadonlyArray<CharacterOption>): ReadonlyArray<string> =>
  options.map((option) => option.name);

/** One option per interesting position, so an absence is never accidental. */
const OPTIONS = {
  /** Jo's Library. The class the acceptance scenario is written about. */
  bloodsworn: "Bloodsworn",
  /** A second of Jo's, so a list can lose one without becoming empty. */
  saltborn: "Saltborn",
  /** Bo's Library. Jo must never see it, by any route. */
  theirs: "Hexbound",
  /** Written by an account that is at no table at all. */
  theUninvited: "Wanderer",
  /** A background that really grants something — every bundled one grants nothing. */
  saltRunner: "Salt-runner",
} as const;

/** *Bloodsworn, d10, unarmoured AC DEX + CON* — the brief's own homebrew class. */
const BLOODSWORN: ClassBody = { hitDie: 10, unarmouredAc: ["DEX", "CON"] };

/** The standard array a player might have typed, constitution at +2. */
const CON_HEAVY = [
  { label: "STR", score: "12", modifier: "+1" },
  { label: "DEX", score: "14", modifier: "+2" },
  { label: "CON", score: "15", modifier: "+2" },
  { label: "INT", score: "10", modifier: "+0" },
  { label: "WIS", score: "13", modifier: "+1" },
  { label: "CHA", score: "8", modifier: "-1" },
];

/**
 * Two DMs with tables of their own, a player at one of them minted through a
 * real invitation, and an account that is at no table anywhere.
 *
 * **And a character written before any of this existed**, carrying a free-text
 * class label nothing resolves — which is what live data actually looks like
 * and what "existing characters unchanged" is measured against.
 */
const makeFixture = Effect.gen(function* () {
  const accounts = yield* Accounts;

  // Exactly as `pnpm -F server ruleset:import` leaves it.
  yield* importSystemOptions();

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
  // Never shared, so a member of it reads nothing in it — the master toggle.
  const unshared = yield* asJo.campaigns.create({ payload: { name: "The quiet table" } });

  const bloodsworn = yield* asJo.library.createOption({
    payload: { kind: "class", name: OPTIONS.bloodsworn, body: BLOODSWORN },
  });
  const saltborn = yield* asJo.library.createOption({
    payload: { kind: "species", name: OPTIONS.saltborn, body: { hpPerLevel: 2 } },
  });
  const theirs = yield* asBo.library.createOption({
    payload: { kind: "class", name: OPTIONS.theirs, body: { hitDie: 8, unarmouredAc: ["DEX"] } },
  });
  const theUninvited = yield* asUninvited.library.createOption({
    payload: { kind: "class", name: OPTIONS.theUninvited, body: { hitDie: 6, unarmouredAc: [] } },
  });

  /** A real player at Jo's table, minted the way a person is. */
  const issued = yield* asJo.invites.create({
    params: { campaignId: saltRoad.id },
    payload: { label: "Pim" },
  });
  const pim = yield* accounts.issue("Pim");
  const asPim = yield* clientFor(pim.token);
  yield* asPim.join.redeem({ payload: { token: issued.token } });

  /**
   * A character that predates all of this, with a label no vocabulary has.
   *
   * `"Circle of the Moon Druid"` is one of the three shapes live data really
   * holds, and it is the one a fuzzy matcher would read as a druid.
   */
  const legacy = yield* asJo.characters.create({
    params: { campaignId: saltRoad.id },
    payload: {
      name: "Sorrel",
      level: 3,
      species: "Half-orc",
      className: "Circle of the Moon Druid",
      ac: 16,
      hpMax: 27,
    },
  });

  const druid = yield* Effect.flatMap(
    SqlClient.SqlClient,
    (client) => client<{ readonly id: CharacterOptionId }>`
      select id from character_option
      where name = 'Druid' and campaign_id is null and account_id is null
    `,
  );

  return {
    jo,
    bo,
    pim,
    uninvited,
    saltRoad,
    theirTable,
    unshared,
    bloodsworn,
    saltborn,
    theirs,
    theUninvited,
    legacy,
    bundledDruid: druid[0]!.id,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

/** This campaign's vocabulary, as this credential reads it. */
const optionsAt = (token: string, campaignId: string, kind?: "class" | "species" | "background") =>
  as(token, (client) =>
    client.options.list({
      params: { campaignId: campaignId as never },
      query: kind === undefined ? {} : { kind },
    }),
  );

describe("the bundle", () => {
  it("is the twelve, the ten and the sixteen, owned by nobody", async () => {
    const rows = await sql(
      (client) => client<{ readonly kind: string; readonly count: string }>`
        select kind, count(*)::text as count from character_option
        where origin = 'system' group by kind order by kind
      `,
    );

    expect(rows._tag).toBe("Success");
    if (rows._tag !== "Success") return;
    expect(rows.success).toEqual([
      { kind: "background", count: String(SYSTEM_BACKGROUNDS.length) },
      { kind: "class", count: String(SYSTEM_CLASSES.length) },
      { kind: "species", count: String(SYSTEM_SPECIES.length) },
    ]);
  });

  it("ships every background as a name with no ability score increases", async () => {
    // **The bundle-licensing decision, as a measurement.** A background is the
    // entity that carries the 2024 ability score increases, and this project
    // ships names and numbers *it has written* — a background's mechanical
    // grants are named out by that decision in as many words. So all sixteen
    // land as vocabulary: the word a player picks, and nothing that moves a
    // number.
    //
    // A DM whose table plays the book's version writes their own background on
    // the Rules screen, where the increases are theirs — which is the route the
    // whole slice exists to open, and which the acceptance test below drives.
    const rows = await sql(
      (client) => client<{ readonly name: string; readonly body: BackgroundBody }>`
        select name, body from character_option
        where origin = 'system' and kind = 'background' order by lower(name)
      `,
    );

    if (rows._tag !== "Success") throw new Error("expected the bundle");
    expect(rows.success).toHaveLength(SYSTEM_BACKGROUNDS.length);
    expect(rows.success.every((row) => row.body.abilityIncreases.length === 0)).toBe(true);
    // `summary` too: the Player's Handbook's sentence about an acolyte is the
    // Player's Handbook's, and an absent one is missing data rather than wrong
    // data that reads as right.
    expect(rows.success.every((row) => row.body.summary === undefined)).toBe(true);
  });

  it("lands shared, which is what makes a player's picker work at all", async () => {
    // **The one place this importer differs from `bestiary:import`, and the
    // reason is the whole shape of the feature.** A stat block is the thing the
    // product says a player must not have, so the bundled bestiary is `dm`.
    // A class vocabulary that no player can read is not a vocabulary — every
    // player in the product would open an empty picker until each DM shared
    // twelve rows by hand. The column default does not move; the writer says
    // `shared` out loud, exactly as the copy-in dialog does.
    const rows = await sql(
      (client) => client<{ readonly visibility: string }>`
        select distinct visibility from character_option where origin = 'system'
      `,
    );

    if (rows._tag !== "Success") throw new Error("expected the bundle");
    expect(rows.success).toEqual([{ visibility: "shared" }]);
  });

  it("says `shared` on insert and nothing on update, so an upgrade never re-shares", async () => {
    // **The insert-not-update asymmetry is the point, not an oversight.** An
    // `insert` that names a column beside a `do update` that does not looks
    // like a bug to anybody meeting it cold, and "tidying" it either way breaks
    // one of the two halves of the decision:
    //
    //   - naming `visibility` in the `do update` too would re-share a row that
    //     had been un-shared, on every upgrade — the DM's choice silently
    //     undone by an operator running a bin script;
    //   - dropping it from the `insert` would leave the bundle at the column
    //     default `dm`, which is an empty class picker for every player in the
    //     product until each DM shares twelve rows by hand.
    //
    // So: `insert` says `shared` out loud, `update` says nothing, and between
    // them the DM's choice is the one that survives. The column default has not
    // moved and no predicate changed — this is a writer stating what it means,
    // exactly as the copy-in dialog does.
    // A class rather than any bundled row, so the body's shape is known and the
    // edit below needs no cast.
    const [entry] = SYSTEM_CLASSES;
    if (entry === undefined) throw new Error("expected a bundled class");
    const { name, ...body } = entry;
    const option: SystemOption = { kind: "class", name, body };

    // Un-shared behind the API, because no shipped write path can reach a
    // bundled row at all — `libraryRowWritable` and `rowWritable` each compare
    // an ownership column to a uuid and a bundled row's are both null. That is
    // the guarantee working; it is also why this half needs raw SQL to pin.
    await sql(
      (client) => client`
        update character_option set visibility = 'dm'
        where origin = 'system' and kind = 'class' and lower(name) = lower(${name})
      `,
    );

    // Re-run the seeder with a changed body, so the `do update` clause
    // demonstrably ran. Without this the assertion below would also pass if the
    // upsert had quietly done nothing at all.
    const edited: SystemOption = { ...option, body: { ...body, hitDie: 99 } };
    const result = await runtime.runPromise(importSystemOptions([edited]).pipe(Effect.orDie));
    expect(result).toEqual({ inserted: 0, updated: 1 });

    const rows = await sql(
      (client) => client<{ readonly visibility: string; readonly body: ClassBody }>`
        select visibility, body from character_option
        where origin = 'system' and kind = 'class' and lower(name) = lower(${name})
      `,
    );

    if (rows._tag !== "Success") throw new Error("expected the row back");
    // The body moved — the update ran — and the visibility did not.
    expect(rows.success[0]?.body.hitDie).toBe(99);
    expect(rows.success[0]?.visibility).toBe("dm");

    // Leave the bundle as `ruleset:import` leaves it, for every test after this
    // one. The body is restored by the seeder itself; the visibility is not,
    // which is this test's own subject said a second way.
    await runtime.runPromise(importSystemOptions([option]).pipe(Effect.orDie));
    await sql(
      (client) => client`
        update character_option set visibility = 'shared'
        where origin = 'system' and kind = 'class' and lower(name) = lower(${name})
      `,
    );
  });

  it("cannot be written by anybody, through either path", async () => {
    // No `origin = 'system'` check exists anywhere in `apps/server/src` and none
    // is needed: `libraryRowWritable` compares `account_id` to the credential's
    // account and a bundled row's is null, `rowWritable` compares `campaign_id`
    // to the path's and a bundled row's is null. A null never equals a uuid.
    const throughLibrary = await refused(fixture.jo.token, (client) =>
      client.library.updateOption({
        params: { optionId: fixture.bundledDruid },
        payload: { name: "Druid (revised)" },
      }),
    );
    const throughCampaign = await refused(fixture.jo.token, (client) =>
      client.options.update({
        params: { campaignId: fixture.saltRoad.id, optionId: fixture.bundledDruid },
        payload: { name: "Druid (revised)" },
      }),
    );

    expect(throughLibrary._tag).toBe("NotFound");
    expect(throughCampaign._tag).toBe("NotFound");
  });

  it("refuses an unowned row that does not claim to be the bundle, and the reverse", async () => {
    // `character_option_system_is_unowned` in both directions: `system` implies
    // unowned, so no write path can reach a bundled row; unowned implies
    // `system`, so no write path can *mint* one by omitting an owner.
    const ownedSystem = await sql(
      (client) => client`
        insert into character_option (account_id, origin, kind, name, body)
        values (${fixture.jo.accountId}, 'system', 'class', 'Impossible', '{}'::jsonb)
      `,
    );
    const unownedAuthored = await sql(
      (client) => client`
        insert into character_option (origin, kind, name, body)
        values ('authored', 'class', 'Also impossible', '{}'::jsonb)
      `,
    );

    expect(ownedSystem._tag).toBe("Failure");
    expect(unownedAuthored._tag).toBe("Failure");
  });

  it("refuses a row that is a campaign's and an account's at once", async () => {
    // `character_option_one_owner`. Without it, `account_id = me` would be a way
    // to write a row inside a campaign the actor does not DM.
    const both = await sql(
      (client) => client`
        insert into character_option (campaign_id, account_id, kind, name, body)
        values (${fixture.saltRoad.id}, ${fixture.jo.accountId}, 'class', 'Two owners', '{}'::jsonb)
      `,
    );

    expect(both._tag).toBe("Failure");
  });
});

describe("the Library shows originals only", () => {
  it("gives an account the bundle and its own, and nothing else", async () => {
    const seen = await as(fixture.jo.token, (client) => client.library.options({ query: {} }));

    expect(named(seen)).toContain(OPTIONS.bloodsworn);
    expect(named(seen)).toContain(OPTIONS.saltborn);
    expect(named(seen)).toContain("Druid");
    expect(named(seen)).not.toContain(OPTIONS.theirs);
    expect(named(seen)).not.toContain(OPTIONS.theUninvited);

    // Every row is an original: in no campaign, and either hers or nobody's.
    expect(seen.every((option) => option.campaignId === null)).toBe(true);
    expect(
      seen.every(
        (option) => option.accountId === null || option.accountId === fixture.jo.accountId,
      ),
    ).toBe(true);
  });

  it("gives an account that is a member of nothing a Library", async () => {
    // Authoring is not an act inside a campaign, so it cannot require one.
    const seen = await as(fixture.uninvited.token, (client) =>
      client.library.options({ query: {} }),
    );

    expect(named(seen)).toContain(OPTIONS.theUninvited);
    expect(named(seen)).toContain("Druid");
    expect(named(seen)).not.toContain(OPTIONS.bloodsworn);
  });

  it("is never readable by a player of the author's own table", async () => {
    // **The asymmetry the whole design turns on.** `libraryRowReadable`
    // compares `account_id` to the *reader's* account, so a player at Jo's own
    // table sees the bundle and nothing of Jo's. That is why a homebrew class
    // has to be copied into the campaign before it can be picked — the copy is
    // not a convenience, it is the only thing that makes the feature work.
    const seen = await as(fixture.pim.token, (client) => client.library.options({ query: {} }));

    expect(named(seen)).toContain("Druid");
    expect(named(seen)).not.toContain(OPTIONS.bloodsworn);
    expect(seen.every((option) => option.accountId === null)).toBe(true);
  });

  it("refuses to edit or delete another account's original", async () => {
    const edit = await refused(fixture.jo.token, (client) =>
      client.library.updateOption({
        params: { optionId: fixture.theirs.id },
        payload: { name: "Mine now" },
      }),
    );
    const remove = await refused(fixture.jo.token, (client) =>
      client.library.removeOption({ params: { optionId: fixture.theirs.id } }),
    );

    expect(edit._tag).toBe("NotFound");
    expect(remove._tag).toBe("NotFound");
  });

  it("refuses a body that contradicts the row's own kind", async () => {
    // `kind` is what a row *is* and is chosen once, so a PATCH has no field for
    // it — which means the only way to refuse a species document landing on a
    // class row is to compare what arrived against the row. A `Conflict` rather
    // than a `NotFound`: the row exists and the caller may write it, and what
    // is wrong is the payload.
    const wrong = await refused(fixture.jo.token, (client) =>
      client.library.updateOption({
        params: { optionId: fixture.bloodsworn.id },
        payload: { body: { hpPerLevel: 3 } },
      }),
    );

    expect(wrong._tag).toBe("Conflict");
  });

  it("narrows by kind, and answers both kinds when it is not asked to", async () => {
    const classes = await as(fixture.jo.token, (client) =>
      client.library.options({ query: { kind: "class" } }),
    );
    const both = await as(fixture.jo.token, (client) => client.library.options({ query: {} }));

    expect(classes.every((option) => option.kind === "class")).toBe(true);
    expect(named(classes)).toContain(OPTIONS.bloodsworn);
    expect(named(classes)).not.toContain(OPTIONS.saltborn);
    expect(named(both)).toContain(OPTIONS.saltborn);
  });
});

describe("a campaign's vocabulary", () => {
  it("is the bundle until something is copied in", async () => {
    // A campaign nobody has copied anything into still has a full picker: the
    // bundle belongs to every campaign at once, which is what
    // `corpusRowReadable`'s `unowned` half means. And it is *only* the bundle —
    // the DM's own Library originals are not in it, which is the whole reason
    // the copy exists.
    const ours = await optionsAt(fixture.bo.token, fixture.theirTable.id);

    expect(named(ours)).toContain("Druid");
    expect(named(ours)).toContain("Dwarf");
    expect(ours).toHaveLength(
      SYSTEM_CLASSES.length + SYSTEM_SPECIES.length + SYSTEM_BACKGROUNDS.length,
    );
    expect(named(ours)).not.toContain(OPTIONS.theirs);
    expect(ours.every((option) => option.campaignId === null)).toBe(true);
  });

  it("refuses a campaign this credential is not a member of", async () => {
    // The path is a claim, and `ensureCampaignReadable` is what refuses it. A
    // 404 rather than an empty list, so an unreachable campaign does not read
    // as "this table has no classes" on a picker.
    const denied = await refused(fixture.jo.token, (client) =>
      client.options.list({ params: { campaignId: fixture.theirTable.id }, query: {} }),
    );

    expect(denied._tag).toBe("NotFound");
  });

  it("answers a player of an unshared campaign nothing at all", async () => {
    // The master toggle above the row-level one. Jo is the DM of the quiet
    // table, so Jo still reads the bundle through it.
    const dm = await optionsAt(fixture.jo.token, fixture.unshared.id);
    expect(named(dm)).toContain("Druid");
  });
});

describe("the copy, which is the whole of how a class reaches a player", () => {
  it("lands DM-only unless the caller says otherwise, and then no player can pick it", async () => {
    const copied = await as(fixture.jo.token, (client) =>
      client.options.derive({
        params: { campaignId: fixture.saltRoad.id, optionId: fixture.bloodsworn.id },
        payload: {},
      }),
    );

    expect(copied.visibility).toBe("dm");
    expect(copied.campaignId).toBe(fixture.saltRoad.id);
    expect(copied.accountId).toBeNull();
    expect(copied.derivedFrom).toBe(fixture.bloodsworn.id);
    expect(copied.origin).toBe("authored");

    const asDm = await optionsAt(fixture.jo.token, fixture.saltRoad.id);
    const asPlayer = await optionsAt(fixture.pim.token, fixture.saltRoad.id);

    expect(named(asDm)).toContain(OPTIONS.bloodsworn);
    // `corpusRowReadable` ends in `isDm OR visibility = 'shared'`. This is the
    // friction the copy-in dialog answers by sending `shared` out loud.
    expect(named(asPlayer)).not.toContain(OPTIONS.bloodsworn);

    await as(fixture.jo.token, (client) =>
      client.options.remove({
        params: { campaignId: fixture.saltRoad.id, optionId: copied.id },
      }),
    );
  });

  it("is pickable by a player the moment the DM shares it", async () => {
    const copied = await as(fixture.jo.token, (client) =>
      client.options.derive({
        params: { campaignId: fixture.saltRoad.id, optionId: fixture.bloodsworn.id },
        // What the shipped dialog sends: the visible screen-level choice, not a
        // changed column default.
        payload: { visibility: "shared" },
      }),
    );

    const asPlayer = await optionsAt(fixture.pim.token, fixture.saltRoad.id, "class");
    expect(named(asPlayer)).toContain(OPTIONS.bloodsworn);

    const picked = asPlayer.find((option) => option.name === OPTIONS.bloodsworn);
    expect(picked?.kind).toBe("class");

    // **The acceptance arithmetic, end to end.** A player picks the campaign's
    // own class, and the seed the create form runs cannot tell it from a
    // bundled one: d10 + CON 2 is 12 hit points, and 10 + DEX 2 + CON 2 is
    // armour class 14.
    const seed = seedFor({
      classEntry: picked?.kind === "class" ? picked.body : undefined,
      speciesEntry: undefined,
      backgroundEntry: undefined,
      abilities: CON_HEAVY,
    });
    expect(seed).toEqual({ level: 1, ac: 14, hpMax: 12, abilities: CON_HEAVY });

    await as(fixture.jo.token, (client) =>
      client.options.remove({
        params: { campaignId: fixture.saltRoad.id, optionId: copied.id },
      }),
    );
  });

  it("carries a background's ability increases through to the seed", async () => {
    // **The acceptance shape of the background slice, over real HTTP.** A DM
    // authors one, shares it, and a player at that table picks it — and the
    // seed the create form runs comes back with numbers the ranking alone
    // would not have given.
    //
    // A background is the only one of the three kinds that reaches the seed
    // *through* the six ability cells, so this asserts the cells as well as
    // the two numbers: `seedFor` hands back the raised ones precisely so no
    // caller can write a different six.
    const original = await as(fixture.jo.token, (client) =>
      client.library.createOption({
        payload: {
          kind: "background",
          name: OPTIONS.saltRunner,
          body: {
            abilityIncreases: [
              { ability: "CON", amount: 2 },
              { ability: "WIS", amount: 1 },
            ],
          },
        },
      }),
    );
    const copied = await as(fixture.jo.token, (client) =>
      client.options.derive({
        params: { campaignId: fixture.saltRoad.id, optionId: original.id },
        payload: { visibility: "shared" },
      }),
    );

    const asPlayer = await optionsAt(fixture.pim.token, fixture.saltRoad.id, "background");
    // The bundle's sixteen are here too, and every one of them grants nothing.
    expect(named(asPlayer)).toContain(OPTIONS.saltRunner);
    expect(named(asPlayer)).toContain("Soldier");
    const bundled = asPlayer.find((option) => option.name === "Soldier");
    expect(bundled?.kind === "background" && bundled.body.abilityIncreases).toEqual([]);

    const picked = asPlayer.find((option) => option.name === OPTIONS.saltRunner);
    if (picked?.kind !== "background") throw new Error("expected a background");

    // CON 15 raised to 17 (`+3`) and WIS 13 to 14 (`+2`): d8 plus 3 is 11, and
    // the armour class is untouched because the grant names neither dexterity
    // nor anything the class adds.
    const seed = seedFor({
      classEntry: { hitDie: 8, unarmouredAc: ["DEX"] },
      speciesEntry: undefined,
      backgroundEntry: picked.body,
      abilities: CON_HEAVY,
    });
    expect(seed.hpMax).toBe(11);
    expect(seed.ac).toBe(12);
    expect(seed.abilities).toContainEqual({ label: "CON", score: "17", modifier: "+3" });
    expect(seed.abilities).toContainEqual({ label: "WIS", score: "14", modifier: "+2" });
    // Untouched cells come through exactly as they were written.
    expect(seed.abilities).toContainEqual({ label: "DEX", score: "14", modifier: "+2" });

    // And the same character with the *bundled* background is the answer the
    // ranking alone gives, which is what makes the grant visible rather than
    // assumed.
    const plain = seedFor({
      classEntry: { hitDie: 8, unarmouredAc: ["DEX"] },
      speciesEntry: undefined,
      backgroundEntry: bundled?.kind === "background" ? bundled.body : undefined,
      abilities: CON_HEAVY,
    });
    expect(plain.hpMax).toBe(10);
    expect(plain.abilities).toEqual(CON_HEAVY);

    await as(fixture.jo.token, (client) =>
      client.options.remove({
        params: { campaignId: fixture.saltRoad.id, optionId: copied.id },
      }),
    );
    await as(fixture.jo.token, (client) =>
      client.library.removeOption({ params: { optionId: original.id } }),
    );
  });

  it("refuses a body whose shape contradicts the row's own kind", async () => {
    // The three documents are told apart by shape alone — `hitDie`,
    // `hpPerLevel`, `abilityIncreases`, one required key each — because a PATCH
    // carries a body and no kind. **This is why `BackgroundBody.abilityIncreases`
    // is required rather than optional**: an all-optional body would match
    // first inside `Schema.Union` and swallow the other two whole.
    const original = await as(fixture.jo.token, (client) =>
      client.library.createOption({
        payload: { kind: "background", name: "Wrong shape", body: { abilityIncreases: [] } },
      }),
    );

    const refusedBody = await refused(fixture.jo.token, (client) =>
      client.library.updateOption({
        params: { optionId: original.id },
        payload: { body: { hitDie: 8, unarmouredAc: ["DEX"] } },
      }),
    );
    expect(refusedBody._tag).toBe("Conflict");

    // And the other direction, so neither is an accident of union order.
    const ontoAClass = await refused(fixture.jo.token, (client) =>
      client.library.updateOption({
        params: { optionId: fixture.bloodsworn.id },
        payload: { body: { abilityIncreases: [{ ability: "CON", amount: 1 }] } },
      }),
    );
    expect(ontoAClass._tag).toBe("Conflict");

    // The class is untouched by the refusal.
    const stillAClass = await as(fixture.jo.token, (client) =>
      client.library.findOption({ params: { optionId: fixture.bloodsworn.id } }),
    );
    expect(stillAClass.kind === "class" && stillAClass.body.hitDie).toBe(10);

    await as(fixture.jo.token, (client) =>
      client.library.removeOption({ params: { optionId: original.id } }),
    );
  });

  it("refuses a source this account cannot reach", async () => {
    // `copyableIntoCampaign` is this campaign's own vocabulary, the bundle, or
    // the caller's own Library — and nothing else. Not another account's
    // Library, and not another campaign's copy.
    const stranger = await refused(fixture.jo.token, (client) =>
      client.options.derive({
        params: { campaignId: fixture.saltRoad.id, optionId: fixture.theirs.id },
        payload: {},
      }),
    );

    expect(stranger._tag).toBe("NotFound");
  });

  it("refuses a player copying anything into the table they play at", async () => {
    // `ensureCampaignWritable` requires `isDm`. A player's rules vocabulary is
    // their DM's to decide.
    const denied = await refused(fixture.pim.token, (client) =>
      client.options.derive({
        params: { campaignId: fixture.saltRoad.id, optionId: fixture.bundledDruid },
        payload: { visibility: "shared" },
      }),
    );

    expect(denied._tag).toBe("NotFound");
  });

  it("is a snapshot: editing the original afterwards does not reach it", async () => {
    const copied = await as(fixture.jo.token, (client) =>
      client.options.derive({
        params: { campaignId: fixture.saltRoad.id, optionId: fixture.bloodsworn.id },
        payload: { visibility: "shared" },
      }),
    );

    await as(fixture.jo.token, (client) =>
      client.library.updateOption({
        params: { optionId: fixture.bloodsworn.id },
        payload: { name: "Bloodsworn (revised)", body: { hitDie: 6, unarmouredAc: [] } },
      }),
    );

    const still = await as(fixture.jo.token, (client) =>
      client.options.findById({
        params: { campaignId: fixture.saltRoad.id, optionId: copied.id },
      }),
    );

    expect(still.name).toBe(OPTIONS.bloodsworn);
    expect(still.kind === "class" && still.body.hitDie).toBe(10);

    // And the original really did change, so the assertion above is about
    // propagation rather than about a write that did nothing.
    const original = await as(fixture.jo.token, (client) =>
      client.library.findOption({ params: { optionId: fixture.bloodsworn.id } }),
    );
    expect(original.name).toBe("Bloodsworn (revised)");

    // Put it back, so the fixture reads the same for whatever runs next.
    await as(fixture.jo.token, (client) =>
      client.library.updateOption({
        params: { optionId: fixture.bloodsworn.id },
        payload: { name: OPTIONS.bloodsworn, body: BLOODSWORN },
      }),
    );
    await as(fixture.jo.token, (client) =>
      client.options.remove({
        params: { campaignId: fixture.saltRoad.id, optionId: copied.id },
      }),
    );
  });

  it("leaves a campaign's copy standing when the original is deleted", async () => {
    const original = await as(fixture.jo.token, (client) =>
      client.library.createOption({
        payload: { kind: "species", name: "Marshfolk", body: { hpPerLevel: 1 } },
      }),
    );
    const copied = await as(fixture.jo.token, (client) =>
      client.options.derive({
        params: { campaignId: fixture.saltRoad.id, optionId: original.id },
        payload: { visibility: "shared" },
      }),
    );

    // No `Conflict`, and nothing refuses it: a copy is a separate row and a
    // character stores a label rather than a pointer, so nothing loses anything.
    await as(fixture.jo.token, (client) =>
      client.library.removeOption({ params: { optionId: original.id } }),
    );

    const still = await as(fixture.jo.token, (client) =>
      client.options.findById({
        params: { campaignId: fixture.saltRoad.id, optionId: copied.id },
      }),
    );
    expect(still.name).toBe("Marshfolk");
    expect(still.derivedFrom).toBeNull();

    await as(fixture.jo.token, (client) =>
      client.options.remove({
        params: { campaignId: fixture.saltRoad.id, optionId: copied.id },
      }),
    );
  });

  it("does not copy a kind the payload could contradict", async () => {
    // A copy is what the original was. There is no `kind` on `OptionDerive`, so
    // this is a fact about the payload's shape rather than a check.
    const copied = await as(fixture.jo.token, (client) =>
      client.options.derive({
        params: { campaignId: fixture.saltRoad.id, optionId: fixture.saltborn.id },
        payload: { name: "Saltborn (ours)" },
      }),
    );

    expect(copied.kind).toBe("species");
    expect(copied.kind === "species" && (copied.body as SpeciesBody).hpPerLevel).toBe(2);

    await as(fixture.jo.token, (client) =>
      client.options.remove({
        params: { campaignId: fixture.saltRoad.id, optionId: copied.id },
      }),
    );
  });
});

describe("existing characters", () => {
  it("keep the free-text labels they were typed with, and nothing rewrites them", async () => {
    // The acceptance criterion, measured rather than assumed. `0017` touches
    // `character` not at all — no column, no backfill, no matcher — so a
    // descriptor a DM typed before any of this existed reads exactly as it did.
    const still = await as(fixture.jo.token, (client) =>
      client.characters.findById({
        params: { campaignId: fixture.saltRoad.id, characterId: fixture.legacy.id },
      }),
    );

    expect(still.className).toBe("Circle of the Moon Druid");
    expect(still.species).toBe("Half-orc");
    expect(still.descriptor).toBe("Level 3 Half-orc Circle of the Moon Druid");
    expect(still.ac).toBe(16);
    expect(still.hpMax).toBe(27);
  });

  it("do not move when the campaign's own class changes under them", async () => {
    // **The last hop, and the one that would be a real defect.** A DM who edits
    // a campaign copy changes what the *next* character is made from. There is
    // no recompute-all-sheets and there must not be one: it would overwrite the
    // numbers a player typed, with no way to tell an intentional value from a
    // stale seed.
    const copied = await as(fixture.jo.token, (client) =>
      client.options.derive({
        params: { campaignId: fixture.saltRoad.id, optionId: fixture.bloodsworn.id },
        payload: { visibility: "shared" },
      }),
    );
    const made = await as(fixture.jo.token, (client) =>
      client.characters.create({
        params: { campaignId: fixture.saltRoad.id },
        payload: { name: "Brannoc", className: OPTIONS.bloodsworn, level: 1, ac: 14, hpMax: 12 },
      }),
    );

    await as(fixture.jo.token, (client) =>
      client.options.update({
        params: { campaignId: fixture.saltRoad.id, optionId: copied.id },
        payload: { body: { hitDie: 4, unarmouredAc: [] } },
      }),
    );

    const after = await as(fixture.jo.token, (client) =>
      client.characters.findById({
        params: { campaignId: fixture.saltRoad.id, characterId: made.id },
      }),
    );
    expect(after.hpMax).toBe(12);
    expect(after.ac).toBe(14);
    expect(after.className).toBe(OPTIONS.bloodsworn);

    // And removing the option leaves the character standing with its label.
    await as(fixture.jo.token, (client) =>
      client.options.remove({
        params: { campaignId: fixture.saltRoad.id, optionId: copied.id },
      }),
    );
    const orphaned = await as(fixture.jo.token, (client) =>
      client.characters.findById({
        params: { campaignId: fixture.saltRoad.id, characterId: made.id },
      }),
    );
    expect(orphaned.className).toBe(OPTIONS.bloodsworn);
    expect(orphaned.hpMax).toBe(12);
  });
});
