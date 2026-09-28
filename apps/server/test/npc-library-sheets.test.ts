import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  CurrentActor,
  type NpcId,
  type NpcSheetPut,
  type SharedWorldId,
  type SheetBody,
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
import { Campaigns } from "../src/repo/Campaigns.js";
import { Invites } from "../src/repo/Invites.js";
import { LibraryShares } from "../src/repo/LibraryShares.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { asDm, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **A Library NPC's sheet is its owner's, and a copy takes it.**
 *
 * The Library half of an NPC's sheet (`repo/NpcSheets.ts`), over the real
 * application and Postgres through the client derived from the contract: the
 * owner starts, reads, patches, replaces and removes an original's sheet,
 * written against the core rules; another account and a campaign NPC's id are
 * `NotFound`; and `copyFromSource` carries the sheet into a campaign as a
 * snapshot at version 1 — for the owner and for a Shared World copier alike,
 * where the private material still goes to the owner's copy only — that later
 * edits on either side never move, and that removing the original leaves
 * standing.
 */

const database = migratedDatabase("taverns_test_npc_library_sheets");
const services = servicesOver(database);

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

/** The same call, answering the failure rather than dying on it. */
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(token), call).pipe(
      Effect.map((value) => ({ ok: true as const, value })),
      Effect.catch((error: unknown) =>
        Effect.succeed({
          ok: false as const,
          tag:
            typeof error === "object" && error !== null && "_tag" in error
              ? String(error._tag)
              : "unknown",
          resource:
            typeof error === "object" && error !== null && "resource" in error
              ? String(error.resource)
              : undefined,
        }),
      ),
    ),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie));

/** A GET's exact body, for a check a decoded value would blur. */
const rawGet = (token: string, path: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
      );
      return { status: response.status, body: yield* response.text };
    }).pipe(Effect.orDie),
  );

interface Person {
  readonly token: string;
  readonly actor: Actor;
}

const person = async (name: string): Promise<Person> => {
  const issued = await run(Effect.flatMap(Accounts, (accounts) => accounts.issue(name)));
  return {
    token: issued.token,
    actor: new Actor({ accountId: issued.accountId, scope: { _tag: "account" } }),
  };
};

const librarySheetOf = (who: Person, npcId: NpcId) =>
  as(who.token, (client) => client.library.npcSheet({ params: { npcId } }));

const libraryPut = (npcId: NpcId, payload: NpcSheetPut) =>
  as(jo.token, (client) => client.library.putNpcSheet({ params: { npcId }, payload }));

const anOriginal = async (name: string): Promise<NpcId> =>
  (
    await as(jo.token, (client) =>
      client.library.createNpc({
        payload: { name, role: "a Library original", privateMaterial: { secrets: "OWED-A-NAME" } },
      }),
    )
  ).id;

const copyInto = (who: Person, campaignId: CampaignId, sourceNpcId: NpcId) =>
  as(who.token, (client) =>
    client.npcs.copyFromSource({ params: { campaignId, sourceNpcId }, payload: {} }),
  );

const campaignSheetOf = (who: Person, campaignId: CampaignId, npcId: NpcId) =>
  as(who.token, (client) => client.npcs.sheet({ params: { campaignId, npcId } }));

const sheetRows = (npcId: NpcId) =>
  sql(
    (sql) =>
      sql<{
        readonly n: number;
      }>`select count(*)::int as n from npc_sheet where npc_id = ${npcId}`,
  ).then((rows) => rows[0]!.n);

/** A sentinel planted in the sheet, and nowhere else. */
const TRAIT = "CAZRILSHEETTRAIT";

const ferrymanBody: SheetBody = {
  abilities: [
    { label: "STR", score: "14", modifier: "+2" },
    { label: "DEX", score: "12", modifier: "+1" },
    { label: "CON", score: "13", modifier: "+1" },
    { label: "INT", score: "10", modifier: "+0" },
    { label: "WIS", score: "15", modifier: "+2", save: "+4" },
    { label: "CHA", score: "8", modifier: "-1" },
  ],
  traits: [{ name: TRAIT, text: "Poles the ferry against any current." }],
  resources: [
    {
      id: "hit-dice",
      name: "Hit dice",
      used: 0,
      max: 3,
      recharge: "long",
      unit: "d10",
      derived: true,
    },
  ],
};

let jo: Person;
let wren: Person;
let fen: Person;
let world: SharedWorldId;
let saltRoad: CampaignId;
let hag: CampaignId;

beforeAll(async () => {
  await run(importSystemEquipment());
  await run(importSystemOptions());
  jo = await person("Jo");
  wren = await person("Wren");
  fen = await person("Fen");
  const created = await as(jo.token, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  );
  saltRoad = created.id;
  world = created.contextId;
  // Wren joins the world through a real invitation to Jo's table, then runs a
  // table of their own in it: a Shared World copier, not the owner.
  hag = await run(
    Effect.gen(function* () {
      const invites = yield* Invites;
      const proof = yield* asDm(jo.actor, saltRoad);
      const issued = yield* invites.createForCampaign(proof, { label: "Wren" });
      yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, wren.actor);
      yield* invites.revokeForCampaign(proof, issued.invite.id);
      const campaigns = yield* Campaigns;
      const theirs = yield* Effect.provideService(
        campaigns.create(world, { name: "The Hag's Bargain", visibility: "shared" }),
        CurrentActor,
        wren.actor,
      );
      return theirs.id;
    }),
  );
}, 120_000);

describe("the owner's Library NPC sheet", () => {
  it("is null until written, then round-trips, patches, replaces by version and is removed", async () => {
    const pell = await anOriginal("Old Pell");
    expect(await librarySheetOf(jo, pell)).toBeNull();

    const started = await libraryPut(pell, {
      level: 3,
      race: "Dwarf",
      subrace: "Hill Dwarf",
      className: "Fighter",
      ac: 16,
      hpMax: 28,
      cr: "1",
      sheet: ferrymanBody,
    });
    expect(started).toMatchObject({
      npcId: pell,
      descriptor: "Level 3 Hill Dwarf Fighter",
      ac: 16,
      hpMax: 28,
      cr: "1",
      version: 1,
    });
    expect(started.sheet).toEqual(ferrymanBody);
    expect(await librarySheetOf(jo, pell)).toEqual(started);

    const patched = await as(jo.token, (client) =>
      client.library.updateNpcSheet({
        params: { npcId: pell },
        payload: { expectedVersion: 1, subrace: null, cr: "2" },
      }),
    );
    expect(patched).toMatchObject({ version: 2, descriptor: "Level 3 Dwarf Fighter", cr: "2" });

    // A replace must say which sheet it read, and a stale one is refused.
    const blank: NpcSheetPut = { sheet: { abilities: [], traits: [] } };
    for (const payload of [blank, { ...blank, expectedVersion: 1 }]) {
      expect(
        await attempt(jo.token, (client) =>
          client.library.putNpcSheet({ params: { npcId: pell }, payload }),
        ),
      ).toMatchObject({ ok: false, tag: "Conflict" });
    }
    expect(await librarySheetOf(jo, pell)).toEqual(patched);
    const replaced = await libraryPut(pell, { ...blank, expectedVersion: 2, className: "Wizard" });
    expect(replaced).toMatchObject({ version: 3, level: null, ac: null, descriptor: "Wizard" });

    await as(jo.token, (client) => client.library.removeNpcSheet({ params: { npcId: pell } }));
    expect(await librarySheetOf(jo, pell)).toBeNull();
    expect(
      await attempt(jo.token, (client) =>
        client.library.updateNpcSheet({ params: { npcId: pell }, payload: { ac: 12 } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound", resource: "npc_sheet" });
  });

  it("lists the shelf's sheets in the Library's order, by shelf, leaving out an original without one", async () => {
    const ada = await anOriginal("Ada of the Weir");
    const bram = await anOriginal("Bram");
    const none = await anOriginal("Nobody's Stats");
    await libraryPut(bram, { className: "Rogue", sheet: ferrymanBody });
    await libraryPut(ada, { cr: "1/4", sheet: { abilities: [], traits: [] } });
    // A campaign NPC's sheet is not the Library's.
    const cast = (
      await as(jo.token, (client) =>
        client.npcs.create({ params: { campaignId: saltRoad }, payload: { name: "Aaron" } }),
      )
    ).id;
    await as(jo.token, (client) =>
      client.npcs.putSheet({
        params: { campaignId: saltRoad, npcId: cast },
        payload: { sheet: { abilities: [], traits: [] } },
      }),
    );

    const listed = await as(jo.token, (client) => client.library.npcSheets({ query: {} }));
    const ids = listed.map((row) => row.npcId);
    expect(ids.indexOf(ada)).toBeLessThan(ids.indexOf(bram));
    expect(ids).not.toContain(none);
    expect(ids).not.toContain(cast);
    expect(listed.find((row) => row.npcId === bram)).not.toHaveProperty("sheet");

    await as(jo.token, (client) =>
      client.library.archiveNpc({ params: { npcId: ada }, payload: {} }),
    );
    const live = await as(jo.token, (client) => client.library.npcSheets({ query: {} }));
    const archived = await as(jo.token, (client) =>
      client.library.npcSheets({ query: { archived: true } }),
    );
    expect(live.map((row) => row.npcId)).not.toContain(ada);
    expect(archived.map((row) => row.npcId)).toEqual([ada]);
    // Archiving left the sheet alone.
    expect((await librarySheetOf(jo, ada))?.cr).toBe("1/4");
    await as(jo.token, (client) =>
      client.library.restoreNpc({ params: { npcId: ada }, payload: {} }),
    );
  });

  it("is written against the core rules, not the owner's own Library", async () => {
    await as(jo.token, (client) =>
      client.library.createOption({
        payload: { kind: "class", name: "Tidecaller", body: { hitDie: 12, unarmouredAc: [] } },
      }),
    );
    const pell = await anOriginal("Tidebound Pell");
    await libraryPut(pell, { level: 1, className: "Fighter", sheet: ferrymanBody });

    // A core class recomputes: the hit dice follow the level.
    const fighter = await as(jo.token, (client) =>
      client.library.updateNpcSheet({ params: { npcId: pell }, payload: { level: 5 } }),
    );
    expect(fighter.sheet.resources?.find((row) => row.id === "hit-dice")).toMatchObject({
      max: 5,
      unit: "d10",
    });
    // The owner's own Library class is in no core rules, so it changes nothing
    // derived; the same class on a campaign NPC's sheet is in its campaign's.
    const tidecaller = await as(jo.token, (client) =>
      client.library.updateNpcSheet({
        params: { npcId: pell },
        payload: { className: "Tidecaller", level: 3 },
      }),
    );
    expect(tidecaller.sheet).toEqual(fighter.sheet);
    const copy = await copyInto(jo, saltRoad, pell);
    const inCampaign = await as(jo.token, (client) =>
      client.npcs.updateSheet({
        params: { campaignId: saltRoad, npcId: copy.id },
        payload: { level: 4 },
      }),
    );
    expect(inCampaign.sheet.resources?.find((row) => row.id === "hit-dice")).toMatchObject({
      max: 4,
      unit: "d12",
    });

    // A subrace is checked against its race in the core rules.
    expect(
      await attempt(jo.token, (client) =>
        client.library.updateNpcSheet({
          params: { npcId: pell },
          payload: { race: "Elf", subrace: "Hill Dwarf" },
        }),
      ),
    ).toMatchObject({ ok: false, tag: "Conflict" });
  });
});

describe("nobody but the owner", () => {
  it("answers another account and a campaign NPC's id NotFound on every endpoint", async () => {
    const pell = await anOriginal("Pell the Unshared");
    const written = await libraryPut(pell, { className: "Fighter", sheet: ferrymanBody });
    const cast = (
      await as(jo.token, (client) =>
        client.npcs.create({ params: { campaignId: saltRoad }, payload: { name: "Castaway" } }),
      )
    ).id;
    const castSheet = await as(jo.token, (client) =>
      client.npcs.putSheet({
        params: { campaignId: saltRoad, npcId: cast },
        payload: { className: "Cleric", sheet: ferrymanBody },
      }),
    );

    const cases: ReadonlyArray<readonly [Person, NpcId]> = [
      [fen, pell],
      [wren, pell],
      // A campaign NPC is in no Library, even to its creator.
      [jo, cast],
    ];
    for (const [who, npcId] of cases) {
      const refused = { ok: false, tag: "NotFound", resource: "npc" };
      const params = { npcId };
      expect(await attempt(who.token, (client) => client.library.npcSheet({ params }))).toEqual(
        refused,
      );
      expect(
        await attempt(who.token, (client) =>
          client.library.putNpcSheet({ params, payload: { sheet: { abilities: [], traits: [] } } }),
        ),
      ).toEqual(refused);
      expect(
        await attempt(who.token, (client) =>
          client.library.updateNpcSheet({ params, payload: { ac: 1 } }),
        ),
      ).toEqual(refused);
      expect(
        await attempt(who.token, (client) => client.library.removeNpcSheet({ params })),
      ).toEqual(refused);
    }
    for (const who of [fen, wren]) {
      const theirs = await as(who.token, (client) => client.library.npcSheets({ query: {} }));
      expect(theirs.map((row) => row.npcId)).not.toContain(pell);
    }
    expect(await librarySheetOf(jo, pell)).toEqual(written);
    expect(await campaignSheetOf(jo, saltRoad, cast)).toEqual(castSheet);
  });
});

describe("a copy into a campaign", () => {
  let cazril: NpcId;
  let source: Awaited<ReturnType<typeof libraryPut>>;

  beforeAll(async () => {
    cazril = await anOriginal("Cazril");
    await libraryPut(cazril, { level: 2, sheet: { abilities: [], traits: [] } });
    // Moved on past version 1, so a copy's own counter is visible.
    source = await libraryPut(cazril, {
      expectedVersion: 1,
      level: 3,
      race: "Human",
      className: "Fighter",
      ac: 16,
      hpMax: 28,
      cr: "1",
      sheet: ferrymanBody,
    });
    expect(source.version).toBe(2);
    await run(
      Effect.provideService(
        Effect.flatMap(LibraryShares, (shares) =>
          shares.share(world, { kind: "npc", resourceId: cazril }),
        ),
        CurrentActor,
        jo.actor,
      ),
    );
  }, 60_000);

  const copied = (sheet: NonNullable<Awaited<ReturnType<typeof campaignSheetOf>>>) => {
    const { npcId: _npcId, version, updatedAt: _updatedAt, ...rest } = sheet;
    const { npcId: _sourceId, version: _v, updatedAt: _u, ...fromSource } = source;
    expect(version).toBe(1);
    expect(rest).toEqual(fromSource);
  };

  it("takes the sheet for the owner and for a Shared World copier, but only the owner the secrets", async () => {
    const mine = await copyInto(jo, saltRoad, cazril);
    const theirs = await copyInto(wren, hag, cazril);
    copied((await campaignSheetOf(jo, saltRoad, mine.id))!);
    copied((await campaignSheetOf(wren, hag, theirs.id))!);
    expect(mine.privateMaterial).toEqual({ secrets: "OWED-A-NAME" });
    expect(theirs.privateMaterial).toEqual({});

    // The world's shelf of shares carries no sheet; the sheet is read only
    // through a copy the copier owns.
    const shelf = await rawGet(wren.token, `/worlds/${world}/library`);
    expect(shelf.status).toBe(200);
    expect(shelf.body).toContain(cazril);
    expect(shelf.body).not.toContain(TRAIT);
    const sources = await rawGet(wren.token, `/campaigns/${hag}/npcs/sources`);
    expect(sources.status).toBe(200);
    expect(sources.body).toContain("Cazril");
    expect(sources.body).not.toContain(TRAIT);
  });

  it("is a snapshot: later edits on either side move only their own sheet", async () => {
    const copy = await copyInto(wren, hag, cazril);
    const now = await libraryPut(cazril, {
      expectedVersion: source.version,
      className: "Wizard",
      sheet: { abilities: [], traits: [] },
    });
    copied((await campaignSheetOf(wren, hag, copy.id))!);

    await as(wren.token, (client) =>
      client.npcs.updateSheet({ params: { campaignId: hag, npcId: copy.id }, payload: { ac: 9 } }),
    );
    expect(await librarySheetOf(jo, cazril)).toEqual(now);
    source = now;
  });

  it("takes no sheet from an original without one", async () => {
    const bare = await anOriginal("Bare Original");
    const copy = await copyInto(jo, saltRoad, bare);
    expect(await campaignSheetOf(jo, saltRoad, copy.id)).toBeNull();
  });

  it("leaves every copy's sheet standing when the original is removed", async () => {
    const doomed = await anOriginal("Doomed Original");
    await libraryPut(doomed, { className: "Rogue", cr: "1/2", sheet: ferrymanBody });
    const copy = await copyInto(jo, saltRoad, doomed);
    await as(jo.token, (client) => client.library.removeNpc({ params: { npcId: doomed } }));
    expect(await sheetRows(doomed)).toBe(0);
    expect(await campaignSheetOf(jo, saltRoad, copy.id)).toMatchObject({
      className: "Rogue",
      cr: "1/2",
      version: 1,
      sheet: ferrymanBody,
    });
  });
});
