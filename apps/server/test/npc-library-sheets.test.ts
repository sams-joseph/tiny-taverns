import { describe, expect } from "@effect/vitest";
import {
  type CampaignId,
  CurrentActor,
  type NpcId,
  type NpcSheetPut,
  type SheetBody,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Invites } from "../src/repo/Invites.js";
import { LibraryShares } from "../src/repo/LibraryShares.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { type Person, aPerson, asDm, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

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

const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(services),
  Layer.provideMerge(database),
);

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });

type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(token), call).pipe(Effect.orDie);

/** The same call, answering the failure rather than dying on it. */
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
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
  );

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

/** A GET's exact body, for a check a decoded value would blur. */
const rawGet = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment();
  yield* importSystemOptions();
  const jo = yield* aPerson("Jo");
  const wren = yield* aPerson("Wren");
  const fen = yield* aPerson("Fen");
  const created = yield* as(jo.token, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  );
  const saltRoad = created.id;
  const world = created.contextId;
  // Wren joins the world through a real invitation to Jo's table, then runs a
  // table of their own in it: a Shared World copier, not the owner.
  const hag = yield* Effect.gen(function* () {
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
  });
  return { jo, wren, fen, world, saltRoad, hag };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "npc-library-sheets.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const librarySheetOf = (who: Person, npcId: NpcId) =>
  as(who.token, (client) => client.library.npcSheet({ params: { npcId } }));

const libraryPut = (npcId: NpcId, payload: NpcSheetPut) =>
  Effect.flatMap(Fixture, ({ jo }) =>
    as(jo.token, (client) => client.library.putNpcSheet({ params: { npcId }, payload })),
  );

const anOriginal = (name: string) =>
  Effect.flatMap(Fixture, ({ jo }) =>
    as(jo.token, (client) =>
      client.library.createNpc({
        payload: { name, role: "a Library original", privateMaterial: { secrets: "OWED-A-NAME" } },
      }),
    ),
  ).pipe(Effect.map((made) => made.id));

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
  ).pipe(Effect.map((rows) => rows[0]!.n));

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

/**
 * Cazril, a Library original with a sheet moved on past version 1 and shared
 * into the world, for the copies. `source` is the sheet as it last stood,
 * moved on by the snapshot test.
 */
const makeCopySource = Effect.gen(function* () {
  const { jo, world } = yield* Fixture;
  const cazril = yield* anOriginal("Cazril");
  yield* libraryPut(cazril, { level: 2, sheet: { abilities: [], traits: [] } });
  // Moved on past version 1, so a copy's own counter is visible.
  const source = yield* libraryPut(cazril, {
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
  yield* Effect.provideService(
    Effect.flatMap(LibraryShares, (shares) =>
      shares.share(world, { kind: "npc", resourceId: cazril }),
    ),
    CurrentActor,
    jo.actor,
  ).pipe(Effect.orDie);
  const state: { source: Effect.Success<ReturnType<typeof libraryPut>> } = { source };
  return { cazril, state };
});

class CopySource extends Context.Service<CopySource, Effect.Success<typeof makeCopySource>>()(
  "npc-library-sheets.test/CopySource",
) {}

describeLayer(
  "npc-library-sheets",
  shared,
  (it) => {
    describe("the owner's Library NPC sheet", () => {
      it.effect(
        "is null until written, then round-trips, patches, replaces by version and is removed",
        () =>
          Effect.gen(function* () {
            const { jo } = yield* Fixture;
            const pell = yield* anOriginal("Old Pell");
            expect(yield* librarySheetOf(jo, pell)).toBeNull();

            const started = yield* libraryPut(pell, {
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
            expect(yield* librarySheetOf(jo, pell)).toEqual(started);

            const patched = yield* as(jo.token, (client) =>
              client.library.updateNpcSheet({
                params: { npcId: pell },
                payload: { expectedVersion: 1, subrace: null, cr: "2" },
              }),
            );
            expect(patched).toMatchObject({
              version: 2,
              descriptor: "Level 3 Dwarf Fighter",
              cr: "2",
            });

            // A replace must say which sheet it read, and a stale one is refused.
            const blank: NpcSheetPut = { sheet: { abilities: [], traits: [] } };
            for (const payload of [blank, { ...blank, expectedVersion: 1 }]) {
              expect(
                yield* attempt(jo.token, (client) =>
                  client.library.putNpcSheet({ params: { npcId: pell }, payload }),
                ),
              ).toMatchObject({ ok: false, tag: "Conflict" });
            }
            expect(yield* librarySheetOf(jo, pell)).toEqual(patched);
            const replaced = yield* libraryPut(pell, {
              ...blank,
              expectedVersion: 2,
              className: "Wizard",
            });
            expect(replaced).toMatchObject({
              version: 3,
              level: null,
              ac: null,
              descriptor: "Wizard",
            });

            yield* as(jo.token, (client) =>
              client.library.removeNpcSheet({ params: { npcId: pell } }),
            );
            expect(yield* librarySheetOf(jo, pell)).toBeNull();
            expect(
              yield* attempt(jo.token, (client) =>
                client.library.updateNpcSheet({ params: { npcId: pell }, payload: { ac: 12 } }),
              ),
            ).toEqual({ ok: false, tag: "NotFound", resource: "npc_sheet" });
          }),
      );

      it.effect(
        "lists the shelf's sheets in the Library's order, by shelf, leaving out an original without one",
        () =>
          Effect.gen(function* () {
            const { jo, saltRoad } = yield* Fixture;
            const ada = yield* anOriginal("Ada of the Weir");
            const bram = yield* anOriginal("Bram");
            const none = yield* anOriginal("Nobody's Stats");
            yield* libraryPut(bram, { className: "Rogue", sheet: ferrymanBody });
            yield* libraryPut(ada, { cr: "1/4", sheet: { abilities: [], traits: [] } });
            // A campaign NPC's sheet is not the Library's.
            const cast = (yield* as(jo.token, (client) =>
              client.npcs.create({ params: { campaignId: saltRoad }, payload: { name: "Aaron" } }),
            )).id;
            yield* as(jo.token, (client) =>
              client.npcs.putSheet({
                params: { campaignId: saltRoad, npcId: cast },
                payload: { sheet: { abilities: [], traits: [] } },
              }),
            );

            const listed = yield* as(jo.token, (client) => client.library.npcSheets({ query: {} }));
            const ids = listed.map((row) => row.npcId);
            expect(ids.indexOf(ada)).toBeLessThan(ids.indexOf(bram));
            expect(ids).not.toContain(none);
            expect(ids).not.toContain(cast);
            expect(listed.find((row) => row.npcId === bram)).not.toHaveProperty("sheet");

            yield* as(jo.token, (client) =>
              client.library.archiveNpc({ params: { npcId: ada }, payload: {} }),
            );
            const live = yield* as(jo.token, (client) => client.library.npcSheets({ query: {} }));
            const archived = yield* as(jo.token, (client) =>
              client.library.npcSheets({ query: { archived: true } }),
            );
            expect(live.map((row) => row.npcId)).not.toContain(ada);
            expect(archived.map((row) => row.npcId)).toEqual([ada]);
            // Archiving left the sheet alone.
            expect((yield* librarySheetOf(jo, ada))?.cr).toBe("1/4");
            yield* as(jo.token, (client) =>
              client.library.restoreNpc({ params: { npcId: ada }, payload: {} }),
            );
          }),
      );

      it.effect("is written against the core rules, not the owner's own Library", () =>
        Effect.gen(function* () {
          const { jo, saltRoad } = yield* Fixture;
          yield* as(jo.token, (client) =>
            client.library.createOption({
              payload: {
                kind: "class",
                name: "Tidecaller",
                body: { hitDie: 12, unarmouredAc: [] },
              },
            }),
          );
          const pell = yield* anOriginal("Tidebound Pell");
          yield* libraryPut(pell, { level: 1, className: "Fighter", sheet: ferrymanBody });

          // A core class recomputes: the hit dice follow the level.
          const fighter = yield* as(jo.token, (client) =>
            client.library.updateNpcSheet({ params: { npcId: pell }, payload: { level: 5 } }),
          );
          expect(fighter.sheet.resources?.find((row) => row.id === "hit-dice")).toMatchObject({
            max: 5,
            unit: "d10",
          });
          // The owner's own Library class is in no core rules, so it changes nothing
          // derived; the same class on a campaign NPC's sheet is in its campaign's.
          const tidecaller = yield* as(jo.token, (client) =>
            client.library.updateNpcSheet({
              params: { npcId: pell },
              payload: { className: "Tidecaller", level: 3 },
            }),
          );
          expect(tidecaller.sheet).toEqual(fighter.sheet);
          const copy = yield* copyInto(jo, saltRoad, pell);
          const inCampaign = yield* as(jo.token, (client) =>
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
            yield* attempt(jo.token, (client) =>
              client.library.updateNpcSheet({
                params: { npcId: pell },
                payload: { race: "Elf", subrace: "Hill Dwarf" },
              }),
            ),
          ).toMatchObject({ ok: false, tag: "Conflict" });
        }),
      );
    });

    describe("nobody but the owner", () => {
      it.effect("answers another account and a campaign NPC's id NotFound on every endpoint", () =>
        Effect.gen(function* () {
          const { jo, wren, fen, saltRoad } = yield* Fixture;
          const pell = yield* anOriginal("Pell the Unshared");
          const written = yield* libraryPut(pell, { className: "Fighter", sheet: ferrymanBody });
          const cast = (yield* as(jo.token, (client) =>
            client.npcs.create({
              params: { campaignId: saltRoad },
              payload: { name: "Castaway" },
            }),
          )).id;
          const castSheet = yield* as(jo.token, (client) =>
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
            expect(
              yield* attempt(who.token, (client) => client.library.npcSheet({ params })),
            ).toEqual(refused);
            expect(
              yield* attempt(who.token, (client) =>
                client.library.putNpcSheet({
                  params,
                  payload: { sheet: { abilities: [], traits: [] } },
                }),
              ),
            ).toEqual(refused);
            expect(
              yield* attempt(who.token, (client) =>
                client.library.updateNpcSheet({ params, payload: { ac: 1 } }),
              ),
            ).toEqual(refused);
            expect(
              yield* attempt(who.token, (client) => client.library.removeNpcSheet({ params })),
            ).toEqual(refused);
          }
          for (const who of [fen, wren]) {
            const theirs = yield* as(who.token, (client) =>
              client.library.npcSheets({ query: {} }),
            );
            expect(theirs.map((row) => row.npcId)).not.toContain(pell);
          }
          expect(yield* librarySheetOf(jo, pell)).toEqual(written);
          expect(yield* campaignSheetOf(jo, saltRoad, cast)).toEqual(castSheet);
        }),
      );
    });

    it.layer(Layer.effect(CopySource)(makeCopySource))("a copy into a campaign", (it) => {
      const copied = (sheet: NonNullable<Effect.Success<ReturnType<typeof campaignSheetOf>>>) =>
        Effect.map(CopySource, ({ state }) => {
          const { npcId: _npcId, version, updatedAt: _updatedAt, ...rest } = sheet;
          const { npcId: _sourceId, version: _v, updatedAt: _u, ...fromSource } = state.source;
          expect(version).toBe(1);
          expect(rest).toEqual(fromSource);
        });

      it.effect(
        "takes the sheet for the owner and for a Shared World copier, but only the owner the secrets",
        () =>
          Effect.gen(function* () {
            const { jo, wren, saltRoad, hag, world } = yield* Fixture;
            const { cazril } = yield* CopySource;
            const mine = yield* copyInto(jo, saltRoad, cazril);
            const theirs = yield* copyInto(wren, hag, cazril);
            yield* copied((yield* campaignSheetOf(jo, saltRoad, mine.id))!);
            yield* copied((yield* campaignSheetOf(wren, hag, theirs.id))!);
            expect(mine.privateMaterial).toEqual({ secrets: "OWED-A-NAME" });
            expect(theirs.privateMaterial).toEqual({});

            // The world's shelf of shares carries no sheet; the sheet is read only
            // through a copy the copier owns.
            const shelf = yield* rawGet(wren.token, `/worlds/${world}/library`);
            expect(shelf.status).toBe(200);
            expect(shelf.body).toContain(cazril);
            expect(shelf.body).not.toContain(TRAIT);
            const sources = yield* rawGet(wren.token, `/campaigns/${hag}/npcs/sources`);
            expect(sources.status).toBe(200);
            expect(sources.body).toContain("Cazril");
            expect(sources.body).not.toContain(TRAIT);
          }),
      );

      it.effect("is a snapshot: later edits on either side move only their own sheet", () =>
        Effect.gen(function* () {
          const { jo, wren, hag } = yield* Fixture;
          const { cazril, state } = yield* CopySource;
          const copy = yield* copyInto(wren, hag, cazril);
          const now = yield* libraryPut(cazril, {
            expectedVersion: state.source.version,
            className: "Wizard",
            sheet: { abilities: [], traits: [] },
          });
          yield* copied((yield* campaignSheetOf(wren, hag, copy.id))!);

          yield* as(wren.token, (client) =>
            client.npcs.updateSheet({
              params: { campaignId: hag, npcId: copy.id },
              payload: { ac: 9 },
            }),
          );
          expect(yield* librarySheetOf(jo, cazril)).toEqual(now);
          state.source = now;
        }),
      );

      it.effect("takes no sheet from an original without one", () =>
        Effect.gen(function* () {
          const { jo, saltRoad } = yield* Fixture;
          const bare = yield* anOriginal("Bare Original");
          const copy = yield* copyInto(jo, saltRoad, bare);
          expect(yield* campaignSheetOf(jo, saltRoad, copy.id)).toBeNull();
        }),
      );

      it.effect("leaves every copy's sheet standing when the original is removed", () =>
        Effect.gen(function* () {
          const { jo, saltRoad } = yield* Fixture;
          const doomed = yield* anOriginal("Doomed Original");
          yield* libraryPut(doomed, { className: "Rogue", cr: "1/2", sheet: ferrymanBody });
          const copy = yield* copyInto(jo, saltRoad, doomed);
          yield* as(jo.token, (client) => client.library.removeNpc({ params: { npcId: doomed } }));
          expect(yield* sheetRows(doomed)).toBe(0);
          expect(yield* campaignSheetOf(jo, saltRoad, copy.id)).toMatchObject({
            className: "Rogue",
            cr: "1/2",
            version: 1,
            sheet: ferrymanBody,
          });
        }),
      );
    });
  },
  { timeout: "120 seconds" },
);
