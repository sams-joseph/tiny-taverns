import { NodeHttpServer } from "@effect/platform-node";
import {
  type BackgroundBody,
  type CharacterOption,
  type CharacterOptionId,
  type ClassBody,
  type RaceBody,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importClassProgression } from "../src/ruleset/progression.js";
import { SYSTEM_OPTIONS, type SystemOption } from "../src/ruleset/systemOptions.js";
import { campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **A campaign can have its own classes, race and backgrounds, and
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
  /** A 2014 background whose grants are display data, not ability score seed data. */
  saltRunner: "Salt-runner",
} as const;

/** *Bloodsworn, d10, unarmoured AC DEX + CON* — the brief's own homebrew class. */
const BLOODSWORN: ClassBody = { hitDie: 10, unarmouredAc: ["DEX", "CON"] };
const SALTBORN: RaceBody = {
  speed: 30,
  size: "Medium",
  abilityBonuses: [{ ability: "CON", amount: 2 }],
  hpPerLevel: 2,
  traits: [],
  subraces: [],
};
const systemClasses = SYSTEM_OPTIONS.filter((option) => option.kind === "class");
const systemRaces = SYSTEM_OPTIONS.filter((option) => option.kind === "race");
const systemBackgrounds = SYSTEM_OPTIONS.filter((option) => option.kind === "background");

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

  // Exactly as the documented reset/reseed order leaves it.
  yield* importSystemEquipment();
  yield* importSystemOptions();

  const jo = yield* accounts.issue("Jo");
  const bo = yield* accounts.issue("Bo");
  const uninvited = yield* accounts.issue("Nobody in particular");

  const asJo = yield* clientFor(jo.token);
  const asBo = yield* clientFor(bo.token);
  const asUninvited = yield* clientFor(uninvited.token);

  const saltRoad = yield* campaignVia(asJo, { name: "The Salt Road", visibility: "shared" });
  const theirTable = yield* campaignVia(asBo, { name: "A different table", visibility: "shared" });
  // Never shared, so a member of it reads nothing in it — the master toggle.
  const unshared = yield* campaignVia(asJo, { name: "The quiet table" });

  const bloodsworn = yield* asJo.library.createOption({
    payload: { kind: "class", name: OPTIONS.bloodsworn, body: BLOODSWORN },
  });
  const saltborn = yield* asJo.library.createOption({
    payload: { kind: "race", name: OPTIONS.saltborn, body: SALTBORN },
  });
  const theirs = yield* asBo.library.createOption({
    payload: { kind: "class", name: OPTIONS.theirs, body: { hitDie: 8, unarmouredAc: ["DEX"] } },
  });
  const theUninvited = yield* asUninvited.library.createOption({
    payload: { kind: "class", name: OPTIONS.theUninvited, body: { hitDie: 6, unarmouredAc: [] } },
  });

  /** A real player at Jo's table, minted the way a person is. */
  const issued = yield* asJo.invites.create({
    params: { groupId: saltRoad.groupId },
    payload: { label: "Pim", campaignId: saltRoad.id },
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
  const legacy = yield* asJo.me.createCharacter({
    params: { campaignId: saltRoad.id },
    payload: {
      name: "Sorrel",
      level: 3,
      race: "Half-orc",
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
const optionsAt = (token: string, campaignId: string, kind?: "class" | "race" | "background") =>
  as(token, (client) =>
    client.options.list({
      params: { campaignId: campaignId as never },
      query: kind === undefined ? {} : { kind },
    }),
  );

describe("the bundle", () => {
  it("is the 2014 SRD starter bundle, owned by nobody", async () => {
    const rows = await sql(
      (client) => client<{ readonly kind: string; readonly count: string }>`
        select kind, count(*)::text as count from character_option
        where origin = 'system' group by kind order by kind
      `,
    );

    expect(rows._tag).toBe("Success");
    if (rows._tag !== "Success") return;
    expect(rows.success).toEqual([
      { kind: "background", count: String(systemBackgrounds.length) },
      { kind: "class", count: String(systemClasses.length) },
      { kind: "race", count: String(systemRaces.length) },
    ]);
  });

  it("ships every background as a name with no ability score increases", async () => {
    // **The bundle-licensing decision, as a measurement.** In 2014 a background
    // carries proficiencies, languages, equipment and feature text; ability
    // bonuses live on race/subrace. The starter bundle therefore lands as the
    // word a player picks plus display/source data, and nothing that moves an
    // ability score.
    const rows = await sql(
      (client) => client<{ readonly name: string; readonly body: BackgroundBody }>`
        select name, body from character_option
        where origin = 'system' and kind = 'background' order by lower(name)
      `,
    );

    if (rows._tag !== "Success") throw new Error("expected the bundle");
    expect(rows.success).toHaveLength(systemBackgrounds.length);
    expect(
      rows.success.every(
        (row) => row.body.proficiencies.length >= 0 && row.body.equipment.length >= 0,
      ),
    ).toBe(true);
    // `summary` too: the Player's Handbook's sentence about an acolyte is the
    // Player's Handbook's, and an absent one is missing data rather than wrong
    // data that reads as right.
    expect(rows.success.every((row) => row.body.summary === undefined)).toBe(true);
  });

  it("imports the concrete 2014 vocabularies and the FK-backed race facts", async () => {
    const counts = await sql(
      (client) => client<{ readonly table_name: string; readonly count: number }>`
        select 'ability_score' as table_name, count(*)::int as count from ability_score
        union all
        select 'language' as table_name, count(*)::int as count from language
        union all
        select 'skill' as table_name, count(*)::int as count from skill
        union all
        select 'proficiency' as table_name, count(*)::int as count from proficiency
        union all
        select 'racial_trait' as table_name, count(*)::int as count from racial_trait where origin = 'system'
        order by table_name
      `,
    );

    expect(counts._tag).toBe("Success");
    if (counts._tag !== "Success") return;
    expect(counts.success).toEqual([
      { table_name: "ability_score", count: 6 },
      { table_name: "language", count: 16 },
      { table_name: "proficiency", count: 117 },
      { table_name: "racial_trait", count: 38 },
      { table_name: "skill", count: 18 },
    ]);

    const vocabulary = await as(fixture.jo.token, (client) => client.library.optionVocabulary());
    expect(vocabulary.abilities.map((ability) => ability.index)).toEqual([
      "cha",
      "con",
      "dex",
      "int",
      "str",
      "wis",
    ]);
    expect(vocabulary.languages.map((language) => language.name)).toContain("Dwarvish");
    expect(vocabulary.skills.find((skill) => skill.name === "Athletics")?.ability.name).toBe("STR");
    expect(vocabulary.proficiencies.map((proficiency) => proficiency.name)).toContain("Battleaxes");
    expect(vocabulary.traits.map((trait) => trait.name)).toContain("Darkvision");

    const dwarf = (await optionsAt(fixture.jo.token, fixture.saltRoad.id, "race")).find(
      (option) => option.name === "Dwarf",
    );
    expect(dwarf?.details?.abilityBonuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 2,
          subraceName: null,
          ability: expect.objectContaining({ name: "CON" }),
        }),
        expect.objectContaining({
          amount: 1,
          subraceName: "Hill Dwarf",
          ability: expect.objectContaining({ name: "WIS" }),
        }),
      ]),
    );
    expect(dwarf?.details?.languages.map((grant) => grant.language.name)).toEqual([
      "Common",
      "Dwarvish",
    ]);
    expect(dwarf?.details?.subraces.map((subrace) => subrace.name)).toEqual(["Hill Dwarf"]);
    expect(dwarf?.details?.traits.map((grant) => grant.trait.name)).toEqual([
      "Darkvision",
      "Dwarven Resilience",
      "Stonecunning",
      "Dwarven Combat Training",
      "Tool Proficiency",
      "Dwarven Toughness",
    ]);
    expect(dwarf?.details?.proficiencies.map((grant) => grant.proficiency.name)).toEqual([
      "Battleaxes",
      "Handaxes",
      "Light hammers",
      "Warhammers",
    ]);
    expect(
      dwarf?.details?.choices.find((choice) => choice.ownerName === "Tool Proficiency"),
    ).toEqual(
      expect.objectContaining({
        kind: "proficiency",
        choose: 1,
        proficiencies: expect.arrayContaining([
          expect.objectContaining({ name: "Smith's Tools" }),
          expect.objectContaining({ name: "Brewer's Supplies" }),
          expect.objectContaining({ name: "Mason's Tools" }),
        ]),
      }),
    );

    const dragonborn = (await optionsAt(fixture.jo.token, fixture.saltRoad.id, "race")).find(
      (option) => option.name === "Dragonborn",
    );
    const ancestry = dragonborn?.details?.traits.find(
      (grant) => grant.trait.name === "Draconic Ancestry",
    );
    const ancestryChoice = dragonborn?.details?.choices.find(
      (choice) => choice.ownerName === "Draconic Ancestry",
    );
    expect(ancestryChoice).toEqual(
      expect.objectContaining({
        kind: "trait",
        choose: 1,
        traits: expect.arrayContaining([
          expect.objectContaining({ name: "Draconic Ancestry (Black)" }),
        ]),
      }),
    );
    expect(
      ancestryChoice?.traits.every((trait) => trait.parentTraitId === ancestry?.trait.id),
    ).toBe(true);
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
    const [entry] = systemClasses;
    if (entry === undefined) throw new Error("expected a bundled class");
    const option: SystemOption = entry;

    // Un-shared behind the API, because no shipped write path can reach a
    // bundled row at all — `libraryRowWritable` and `rowWritable` each compare
    // an ownership column to a uuid and a bundled row's are both null. That is
    // the guarantee working; it is also why this half needs raw SQL to pin.
    await sql(
      (client) => client`
        update character_option set visibility = 'dm'
        where origin = 'system' and kind = 'class' and lower(name) = lower(${option.name})
      `,
    );

    // Re-run the seeder with a changed body, so the `do update` clause
    // demonstrably ran. Without this the assertion below would also pass if the
    // upsert had quietly done nothing at all.
    const edited: SystemOption = { ...option, body: { ...option.body, hitDie: 99 } };
    const result = await runtime.runPromise(importSystemOptions([edited]).pipe(Effect.orDie));
    expect(result).toEqual({ inserted: 0, updated: 1 });

    const rows = await sql(
      (client) => client<{ readonly visibility: string; readonly body: ClassBody }>`
        select visibility, body from character_option
        where origin = 'system' and kind = 'class' and lower(name) = lower(${option.name})
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
        where origin = 'system' and kind = 'class' and lower(name) = lower(${option.name})
      `,
    );
  });

  it("cannot be written by anybody, through the one write path left", async () => {
    // No `origin = 'system'` check exists anywhere in `apps/server/src` and none
    // is needed: `libraryRowWritable` compares `account_id` to the credential's
    // account and a bundled row's is null. A null never equals a uuid.
    const throughLibrary = await refused(fixture.jo.token, (client) =>
      client.library.updateOption({
        params: { optionId: fixture.bundledDruid },
        payload: { name: "Druid (revised)" },
      }),
    );
    expect(throughLibrary._tag).toBe("NotFound");
    // There is no campaign write path at all any more — the group of
    // campaign-copy endpoints went with the instancing decision of 2026-09-02,
    // which is a stronger statement than a second refusal.
  });

  it("imports the pinned 2014 class progression and updates it idempotently", async () => {
    const counts = await sql(
      (client) => client<{ readonly table_name: string; readonly count: number }>`
        select 'subclass' as table_name, count(*)::int as count from subclass where origin = 'system'
        union all
        select 'class_level' as table_name, count(*)::int as count from class_level where origin = 'system'
        union all
        select 'feature' as table_name, count(*)::int as count from feature where origin = 'system'
        order by table_name
      `,
    );

    expect(counts._tag).toBe("Success");
    if (counts._tag !== "Success") return;
    expect(counts.success).toEqual([
      { table_name: "class_level", count: 290 },
      { table_name: "feature", count: 407 },
      { table_name: "subclass", count: 12 },
    ]);

    await expect(runtime.runPromise(importClassProgression().pipe(Effect.orDie))).resolves.toEqual({
      subclasses: { seen: 12, inserted: 0, updated: 12 },
      levels: { seen: 290, inserted: 0, updated: 290 },
      features: { seen: 407, inserted: 0, updated: 407 },
    });
  });

  it("reads a class's concrete progression through the Library endpoint", async () => {
    const progression = await as(fixture.jo.token, (client) =>
      client.library.optionProgression({ params: { optionId: fixture.bundledDruid } }),
    );

    expect(progression.option.name).toBe("Druid");
    expect(progression.option.body.subclassCount).toBe(progression.subclasses.length);
    expect(progression.option.body.levelCount).toBe(progression.levels.length);
    expect(progression.option.body.featureCount).toBe(progression.features.length);
    expect(progression.subclasses.map((subclass) => subclass.name)).toContain("Land");
    expect(progression.features.map((feature) => feature.name)).toContain("Druidic");
    expect(progression.levels.every((level) => level.campaignId === null)).toBe(true);
    expect(progression.features.every((feature) => feature.accountId === null)).toBe(true);
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
    // has to be **shared to the group** before a player can pick it — the
    // grant is not a convenience, it is the only thing that makes the feature
    // work.
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
    // it — which means the only way to refuse a race document landing on a
    // class row is to compare what arrived against the row. A `Conflict` rather
    // than a `NotFound`: the row exists and the caller may write it, and what
    // is wrong is the payload.
    const wrong = await refused(fixture.jo.token, (client) =>
      client.library.updateOption({
        params: { optionId: fixture.bloodsworn.id },
        payload: { body: { ...SALTBORN, hpPerLevel: 3 } },
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
  it("is the bundle plus the reader's own Library, and never a campaign row", async () => {
    // Since the instancing decision of 2026-09-02 the vocabulary is
    // `usableInCampaign`: the shared bundle, the *reader's* own originals, and
    // whatever is shared to the table's group. Bo's own class is right there
    // at Bo's table — authoring-then-using needs no copy step — and nothing in
    // the answer is ever a campaign row.
    const ours = await optionsAt(fixture.bo.token, fixture.theirTable.id);

    expect(named(ours)).toContain("Druid");
    expect(named(ours)).toContain("Dwarf");
    expect(named(ours)).toContain(OPTIONS.theirs);
    expect(ours).toHaveLength(
      systemClasses.length + systemRaces.length + systemBackgrounds.length + 1,
    );
    expect(named(ours)).not.toContain(OPTIONS.bloodsworn);
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

describe("the group share, which is the whole of how a class reaches a player", () => {
  it("reaches no player until the owner shares it to the group", async () => {
    const before = await optionsAt(fixture.pim.token, fixture.saltRoad.id);
    expect(named(before)).not.toContain(OPTIONS.bloodsworn);

    await as(fixture.jo.token, (client) =>
      client.groupLibrary.share({
        params: { groupId: fixture.saltRoad.groupId },
        payload: { kind: "character_option", resourceId: fixture.bloodsworn.id },
      }),
    );

    const after = await optionsAt(fixture.pim.token, fixture.saltRoad.id);
    const offered = after.find((option) => option.name === OPTIONS.bloodsworn);
    expect(offered).toBeDefined();
    // What is offered is the original itself — a vocabulary entry, not a copy
    // and not a view widened anywhere else: Pim's own Library still shows
    // nothing of Jo's, which `library.test.ts`'s twin pins for creatures.
    expect(offered?.id).toBe(fixture.bloodsworn.id);
    expect(offered?.campaignId).toBeNull();

    const pimLibrary = await as(fixture.pim.token, (client) =>
      client.library.options({ query: {} }),
    );
    expect(named(pimLibrary)).not.toContain(OPTIONS.bloodsworn);
  });

  it("stops reaching the picker when the grant is withdrawn", async () => {
    await as(fixture.jo.token, (client) =>
      client.groupLibrary.unshare({
        params: { groupId: fixture.saltRoad.groupId },
        payload: { kind: "character_option", resourceId: fixture.bloodsworn.id },
      }),
    );
    const after = await optionsAt(fixture.pim.token, fixture.saltRoad.id);
    expect(named(after)).not.toContain(OPTIONS.bloodsworn);

    // Put it back for the tests below.
    await as(fixture.jo.token, (client) =>
      client.groupLibrary.share({
        params: { groupId: fixture.saltRoad.groupId },
        payload: { kind: "character_option", resourceId: fixture.bloodsworn.id },
      }),
    );
  });

  it("stays inside the group: another table's player never sees it", async () => {
    const elsewhere = await optionsAt(fixture.bo.token, fixture.theirTable.id);
    expect(named(elsewhere)).not.toContain(OPTIONS.bloodsworn);
  });
});

describe("existing characters", () => {
  it("keep the free-text labels they were typed with, and nothing rewrites them", async () => {
    // The acceptance criterion, measured rather than assumed. Nothing about
    // the vocabulary work touches `character` — no column, no backfill, no
    // matcher — so a label typed before any of this existed reads exactly as
    // it did. The read is the owner's own (`GET /me/characters`), because that
    // is the one read a shared, account-owned character has.
    const mine = await as(fixture.jo.token, (client) => client.me.characters());
    const still = mine.find((owned) => owned.character.id === fixture.legacy.id)!.character;

    expect(still.className).toBe("Circle of the Moon Druid");
    expect(still.race).toBe("Half-orc");
    expect(still.descriptor).toBe("Level 3 Half-orc Circle of the Moon Druid");
    expect(still.ac).toBe(16);
    expect(still.hpMax).toBe(27);
  });

  it("do not move when the class they were seeded from changes under them", async () => {
    // **The last hop, and the one that would be a real defect.** A DM who edits
    // a Library original changes what the *next* character is made from. There
    // is no recompute-all-sheets and there must not be one: it would overwrite
    // the numbers a player typed, with no way to tell an intentional value
    // from a stale seed.
    const made = await as(fixture.jo.token, (client) =>
      client.me.createCharacter({
        params: { campaignId: fixture.saltRoad.id },
        payload: { name: "Brannoc", className: OPTIONS.bloodsworn, level: 1, ac: 14, hpMax: 12 },
      }),
    );

    await as(fixture.jo.token, (client) =>
      client.library.updateOption({
        params: { optionId: fixture.bloodsworn.id },
        payload: { body: { hitDie: 4, unarmouredAc: [] } },
      }),
    );

    const after = (await as(fixture.jo.token, (client) => client.me.characters())).find(
      (owned) => owned.character.id === made.id,
    )!.character;
    expect(after.hpMax).toBe(12);
    expect(after.ac).toBe(14);
    expect(after.className).toBe(OPTIONS.bloodsworn);

    // And deleting the original leaves the character standing with its label.
    await as(fixture.jo.token, (client) =>
      client.library.removeOption({ params: { optionId: fixture.bloodsworn.id } }),
    );
    const orphaned = (await as(fixture.jo.token, (client) => client.me.characters())).find(
      (owned) => owned.character.id === made.id,
    )!.character;
    expect(orphaned.className).toBe(OPTIONS.bloodsworn);
    expect(orphaned.hpMax).toBe(12);
  });
});
