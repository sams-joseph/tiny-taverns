import { describe, expect } from "@effect/vitest";
import {
  type Ability,
  asClassOption,
  asRaceOption,
  type CampaignId,
  CHALLENGE_RATINGS,
  CurrentActor,
  type NpcEvent,
  type NpcId,
  type NpcSheetPut,
  type NpcSheetUpdate,
  optionNamed,
  type SheetBody,
  startingSheetBody,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { NpcAgent } from "../src/assistant/NpcAgent.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Invites } from "../src/repo/Invites.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { aCharacterAt, admittedTo, aPerson, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedModel, textChunks } from "./support/model.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **An NPC's sheet is the creator's alone.**
 *
 * The character-style sheet an NPC carries — a level, a class, a race, AC, HP,
 * an optional challenge rating and the rules half of a character's document —
 * on a table of its own (`0076_npc_sheets.ts`) behind the creator proof. Over
 * the real application and Postgres, through the client derived from the
 * contract: the creator starts, reads, patches, replaces and removes it; a
 * replace must name the version it read; a level-up recomputes against the
 * campaign's rules with the character's own rule; a player at the table, a
 * player whose invitation was withdrawn and a stranger are refused every
 * endpoint with the campaign's `NotFound`; and nothing a player reads, nothing
 * search finds and nothing the NPC's model is shown carries a byte of it.
 */

const database = migratedDatabase("taverns_test_npc_sheets");
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

/** A GET's exact body, for the byte-for-byte comparison a decoded value would blur. */
const rawGet = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

/** A write the derived client would refuse to encode, sent as it stands. */
const rawSend = (method: "PUT" | "PATCH", token: string, path: string, body: unknown) =>
  Effect.gen(function* () {
    const request = method === "PUT" ? HttpClientRequest.put(path) : HttpClientRequest.patch(path);
    const response = yield* HttpClient.execute(
      request.pipe(HttpClientRequest.bearerToken(token), HttpClientRequest.bodyJsonUnsafe(body)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

/** A sentinel planted in the sheet, and nowhere else. */
const TRAIT = "GRUSKSHEETTRAIT";

const fighterBody: SheetBody = {
  abilities: [
    { label: "STR", score: "16", modifier: "+3", save: "+5" },
    { label: "DEX", score: "12", modifier: "+1" },
    { label: "CON", score: "14", modifier: "+2", save: "+4" },
    { label: "INT", score: "10", modifier: "+0" },
    { label: "WIS", score: "10", modifier: "+0" },
    { label: "CHA", score: "8", modifier: "-1" },
  ],
  traits: [{ name: TRAIT, text: "Fights with a boathook, and never first." }],
  resources: [
    {
      id: "hit-dice",
      name: "Hit dice",
      used: 0,
      max: 5,
      recharge: "long",
      unit: "d10",
      derived: true,
    },
  ],
};

const anNpc = (
  token: string,
  campaignId: CampaignId,
  name: string,
  visibility: "dm" | "shared",
): Effect.Effect<NpcId, never, HttpClient.HttpClient> =>
  as(token, (client) =>
    client.npcs.create({
      params: { campaignId },
      payload: { name, role: "a face at the ford", visibility },
    }),
  ).pipe(Effect.map((npc) => npc.id));

const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment();
  yield* importSystemOptions();
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const withdrawn = yield* aPerson("Wren");
  const stranger = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const elsewhere = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Hag's Bargain" } }),
  )).id;
  const seatedIlse = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, seatedIlse, { name: "Tamsin" }, { seatVisibility: "shared" });
  // Admitted through a real invitation, then withdrawn by the creator.
  yield* Effect.gen(function* () {
    const invites = yield* Invites;
    const proof = yield* asDm(jo.actor, table);
    const issued = yield* invites.createForCampaign(proof, { label: "Wren" });
    yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, withdrawn.actor);
    yield* invites.revokeForCampaign(proof, issued.invite.id);
  });

  /** Shared with the table: a player reads it. */
  const grusk = yield* anNpc(jo.token, table, "Grusk", "shared");
  /** Kept to the DM. */
  const hollis = yield* anNpc(jo.token, table, "Hollis", "dm");

  const night = (yield* as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number: 1, visibility: "shared" },
    }),
  )).id;
  yield* as(jo.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: night },
    }),
  );
  yield* as(jo.token, (client) =>
    client.sessions.update({
      params: { campaignId: table, sessionId: night },
      payload: { startedAt: DateTime.nowUnsafe() },
    }),
  );
  return { jo, ilse, withdrawn, stranger, table, elsewhere, grusk, hollis, night };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "npc-sheets.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

/** Jo's token: every helper below reads as the table's creator. */
const asJo = <A, E>(call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(Fixture, ({ jo }) => as(jo.token, call));

const sheetsOf = (campaignId: CampaignId, archived?: boolean) =>
  asJo((client) =>
    client.npcs.sheets({
      params: { campaignId },
      query: archived === undefined ? {} : { archived },
    }),
  );

const sheetOf = (campaignId: CampaignId, npcId: NpcId) =>
  asJo((client) => client.npcs.sheet({ params: { campaignId, npcId } }));

const putSheet = (campaignId: CampaignId, npcId: NpcId, payload: NpcSheetPut) =>
  asJo((client) => client.npcs.putSheet({ params: { campaignId, npcId }, payload }));

const patchSheet = (campaignId: CampaignId, npcId: NpcId, payload: NpcSheetUpdate) =>
  asJo((client) => client.npcs.updateSheet({ params: { campaignId, npcId }, payload }));

const removeSheet = (campaignId: CampaignId, npcId: NpcId) =>
  asJo((client) => client.npcs.removeSheet({ params: { campaignId, npcId } }));

describeLayer(
  "npc-sheets",
  shared,
  (it) => {
    describe("the creator's NPC sheet", () => {
      it.effect(
        "is null until written, then round-trips, patches, replaces by version and is removed",
        () =>
          Effect.gen(function* () {
            const { jo, table, hollis } = yield* Fixture;
            expect(yield* sheetOf(table, hollis)).toBeNull();

            const started = yield* putSheet(table, hollis, {
              level: 5,
              race: "Dwarf",
              subrace: "Hill Dwarf",
              className: "Fighter",
              ac: 18,
              hpMax: 44,
              cr: "3",
              sheet: fighterBody,
            });
            expect(started).toMatchObject({
              npcId: hollis,
              level: 5,
              race: "Dwarf",
              subrace: "Hill Dwarf",
              className: "Fighter",
              // Derived by the column, the character's own expression.
              descriptor: "Level 5 Hill Dwarf Fighter",
              ac: 18,
              hpMax: 44,
              cr: "3",
              version: 1,
            });
            expect(started.sheet).toEqual(fighterBody);
            expect(yield* sheetOf(table, hollis)).toEqual(started);

            // An absent key is untouched; null clears; the descriptor follows.
            const patched = yield* patchSheet(table, hollis, { subrace: null, ac: 17, cr: null });
            expect(patched).toMatchObject({
              version: 2,
              race: "Dwarf",
              subrace: null,
              descriptor: "Level 5 Dwarf Fighter",
              ac: 17,
              hpMax: 44,
              cr: null,
            });
            expect(patched.sheet).toEqual(fighterBody);

            // A replace must say which sheet it read.
            const blank: NpcSheetPut = { sheet: { abilities: [], traits: [] } };
            expect(
              yield* attempt(jo.token, (client) =>
                client.npcs.putSheet({
                  params: { campaignId: table, npcId: hollis },
                  payload: blank,
                }),
              ),
            ).toMatchObject({ ok: false, tag: "Conflict" });
            expect(
              yield* attempt(jo.token, (client) =>
                client.npcs.putSheet({
                  params: { campaignId: table, npcId: hollis },
                  payload: { ...blank, expectedVersion: 1 },
                }),
              ),
            ).toMatchObject({ ok: false, tag: "Conflict" });
            // So may a patch, and a stale one is refused whole.
            expect(
              yield* attempt(jo.token, (client) =>
                client.npcs.updateSheet({
                  params: { campaignId: table, npcId: hollis },
                  payload: { expectedVersion: 1, ac: 3 },
                }),
              ),
            ).toMatchObject({ ok: false, tag: "Conflict" });
            expect(yield* sheetOf(table, hollis)).toEqual(patched);

            // Replaced whole: every column it does not name is null.
            const replaced = yield* putSheet(table, hollis, {
              expectedVersion: 2,
              className: "Wizard",
              sheet: blank.sheet,
            });
            expect(replaced).toMatchObject({
              version: 3,
              level: null,
              race: null,
              subrace: null,
              className: "Wizard",
              descriptor: "Wizard",
              ac: null,
              hpMax: null,
              cr: null,
              sheet: { abilities: [], traits: [] },
            });

            yield* removeSheet(table, hollis);
            expect(yield* sheetOf(table, hollis)).toBeNull();
            // Removing a sheet the NPC does not have changes nothing.
            yield* removeSheet(table, hollis);
            expect(yield* sheetOf(table, hollis)).toBeNull();
            // With no sheet, a patch has nothing to patch, and a replace naming a
            // version read a sheet that is gone.
            expect(
              yield* attempt(jo.token, (client) =>
                client.npcs.updateSheet({
                  params: { campaignId: table, npcId: hollis },
                  payload: { ac: 12 },
                }),
              ),
            ).toEqual({ ok: false, tag: "NotFound", resource: "npc_sheet" });
            expect(
              yield* attempt(jo.token, (client) =>
                client.npcs.putSheet({
                  params: { campaignId: table, npcId: hollis },
                  payload: { ...blank, expectedVersion: 3 },
                }),
              ),
            ).toMatchObject({ ok: false, tag: "Conflict" });
            expect(yield* sheetOf(table, hollis)).toBeNull();
          }),
      );

      it.effect("lists sheets in the cast's order, leaving out an NPC without one, by shelf", () =>
        Effect.gen(function* () {
          const { jo, table, grusk, hollis } = yield* Fixture;
          const aldo = yield* anNpc(jo.token, table, "Aldo", "dm");
          yield* putSheet(table, grusk, { level: 3, className: "Rogue", sheet: fighterBody });
          yield* putSheet(table, aldo, { cr: "1/2", sheet: { abilities: [], traits: [] } });

          const listed = yield* sheetsOf(table);
          expect(listed.map((row) => row.npcId)).toEqual([aldo, grusk]);
          expect(listed.map((row) => row.npcId)).not.toContain(hollis);
          // The shelf is the summary: no document.
          expect(listed[1]).toMatchObject({ npcId: grusk, descriptor: "Level 3 Rogue", cr: null });
          expect(listed[1]).not.toHaveProperty("sheet");
          expect(listed[0]).toMatchObject({ npcId: aldo, cr: "1/2", descriptor: null });

          // Archiving leaves the sheet alone and moves it to the other shelf.
          yield* as(jo.token, (client) =>
            client.npcs.archive({ params: { campaignId: table, npcId: aldo }, payload: {} }),
          );
          expect((yield* sheetsOf(table)).map((row) => row.npcId)).toEqual([grusk]);
          expect((yield* sheetsOf(table, true)).map((row) => row.npcId)).toEqual([aldo]);
          expect((yield* patchSheet(table, aldo, { cr: "2" })).cr).toBe("2");
          yield* as(jo.token, (client) =>
            client.npcs.restore({ params: { campaignId: table, npcId: aldo }, payload: {} }),
          );
          expect((yield* sheetOf(table, aldo))?.cr).toBe("2");
          expect((yield* sheetsOf(table)).map((row) => row.npcId)).toEqual([aldo, grusk]);
        }),
      );

      it.effect(
        "refuses a rating the XP table does not know and out-of-range numbers at the wire",
        () =>
          Effect.gen(function* () {
            const { jo, table, hollis } = yield* Fixture;
            const path = `/campaigns/${table}/npcs/${hollis}/sheet`;
            const sheet = { abilities: [], traits: [] };
            for (const bad of [
              { cr: "1/3" },
              { cr: "31" },
              { cr: 3 },
              { ac: 41 },
              { hpMax: -1 },
              { level: 0 },
              { race: "" },
            ]) {
              expect(
                (yield* rawSend("PUT", jo.token, path, { ...bad, sheet })).status,
                JSON.stringify(bad),
              ).toBe(400);
            }
            expect((yield* rawSend("PUT", jo.token, path, { cr: "3" })).status).toBe(400);
            expect(yield* sheetOf(table, hollis)).toBeNull();

            // Every rating the table knows is accepted, and each survives the column's check.
            yield* putSheet(table, hollis, { sheet });
            for (const cr of CHALLENGE_RATINGS) {
              expect((yield* patchSheet(table, hollis, { cr })).cr).toBe(cr);
            }
            yield* removeSheet(table, hollis);
          }),
      );

      it.effect("keeps only the rules half: a player's own keys are dropped, not stored", () =>
        Effect.gen(function* () {
          const { jo, table, hollis } = yield* Fixture;
          const path = `/campaigns/${table}/npcs/${hollis}/sheet`;
          const written = yield* rawSend("PUT", jo.token, path, {
            sheet: {
              abilities: [],
              traits: [],
              notes: "NOTESKEY",
              journal: [
                { id: "j1", title: "JOURNALKEY", body: "x", createdAt: "2026-09-28T00:00:00.000Z" },
              ],
              story: { backstory: "STORYKEY" },
              deathSaves: { successes: 1, failures: 0 },
              levelUps: [],
            },
          });
          expect(written.status).toBe(200);
          const stored = yield* sql(
            (sql) =>
              sql<{ readonly body: unknown }>`select body from npc_sheet where npc_id = ${hollis}`,
          );
          expect(stored[0]!.body).toEqual({ abilities: [], traits: [] });
          for (const marker of ["NOTESKEY", "JOURNALKEY", "STORYKEY", "deathSaves", "levelUps"]) {
            expect(written.body).not.toContain(marker);
          }
          yield* removeSheet(table, hollis);
        }),
      );

      it.effect("states the column's rating check as exactly the XP table's ratings", () =>
        Effect.gen(function* () {
          const rows = yield* sql(
            (sql) => sql<{ readonly definition: string }>`
        select pg_get_constraintdef(oid) as definition from pg_constraint
        where conname = 'npc_sheet_cr_check'
      `,
          );
          const listed = [...rows[0]!.definition.matchAll(/'([^']+)'::text/g)].map(
            (match) => match[1],
          );
          expect(listed).toEqual([...CHALLENGE_RATINGS]);
        }),
      );
    });

    it.layer(
      Layer.effectDiscard(
        // A class in the creator's own Library: in their campaign's rules, and in
        // no core rules.
        asJo((client) =>
          client.library.createOption({
            payload: { kind: "class", name: "Tidecaller", body: { hitDie: 12, unarmouredAc: [] } },
          }),
        ),
      ),
    )("the sheet's rules are a character's", (it) => {
      it.effect(
        "recomputes a level-up against the campaign's rules and keeps what the DM typed",
        () =>
          Effect.gen(function* () {
            const { table, hollis } = yield* Fixture;
            const started = yield* putSheet(table, hollis, {
              level: 1,
              className: "Wizard",
              sheet: {
                abilities: [],
                traits: [],
                resources: [
                  {
                    id: "slot:1",
                    name: "1st-level slots",
                    used: 1,
                    max: 2,
                    recharge: "long",
                    derived: true,
                  },
                  {
                    id: "hit-dice",
                    name: "Hit dice",
                    used: 0,
                    max: 1,
                    recharge: "long",
                    unit: "d6",
                    derived: true,
                  },
                  { id: "res:custom", name: "Salt charms", used: 1, max: 3, recharge: "long" },
                ],
              },
            });
            const leveled = yield* patchSheet(table, hollis, {
              expectedVersion: started.version,
              level: 5,
            });
            expect(leveled.level).toBe(5);
            expect(leveled.descriptor).toBe("Level 5 Wizard");
            const resources = leveled.sheet.resources ?? [];
            expect(resources.find((row) => row.id === "slot:1")).toMatchObject({
              max: 4,
              used: 1,
              derived: true,
            });
            expect(resources.find((row) => row.id === "slot:3")).toMatchObject({
              max: 2,
              derived: true,
            });
            expect(resources.find((row) => row.id === "hit-dice")).toMatchObject({
              max: 5,
              unit: "d6",
            });
            expect(resources.find((row) => row.id === "res:custom")).toEqual({
              id: "res:custom",
              name: "Salt charms",
              used: 1,
              max: 3,
              recharge: "long",
            });

            // The campaign's rules reach the creator's own Library class.
            const reclassed = yield* patchSheet(table, hollis, {
              className: "Tidecaller",
              level: 3,
            });
            const hitDice = reclassed.sheet.resources?.find((row) => row.id === "hit-dice");
            expect(hitDice).toMatchObject({ max: 3, unit: "d12" });
            expect(reclassed.sheet.resources?.some((row) => row.id.startsWith("slot:"))).toBe(
              false,
            );
            expect(reclassed.sheet.resources?.find((row) => row.id === "res:custom")).toBeDefined();

            // A sheet sent beside the level is taken as sent.
            const sent = yield* patchSheet(table, hollis, {
              level: 9,
              sheet: { abilities: [], traits: [] },
            });
            expect(sent.sheet).toEqual({ abilities: [], traits: [] });
            yield* removeSheet(table, hollis);
          }),
      );

      it.effect(
        "moves a Fighter's sheet by the character's own rule, and only on a real level change",
        () =>
          Effect.gen(function* () {
            const { table, hollis, ilse } = yield* Fixture;
            const options = yield* asJo((client) => client.library.coreOptions({ query: {} }));
            const abilities: ReadonlyArray<Ability> = [
              { label: "STR", score: "16", modifier: "+3" },
              { label: "DEX", score: "12", modifier: "+1" },
              { label: "CON", score: "14", modifier: "+2" },
              { label: "INT", score: "10", modifier: "+0" },
              { label: "WIS", score: "10", modifier: "+0" },
              { label: "CHA", score: "8", modifier: "-1" },
            ];
            const composed = (level: number) =>
              startingSheetBody({
                classOption: asClassOption(optionNamed(options, "class", "Fighter")),
                raceOption: asRaceOption(optionNamed(options, "race", "Half-Orc")),
                subclass: "Champion",
                abilities,
                level,
              });
            const one = composed(1);
            const started = yield* putSheet(table, hollis, {
              level: 1,
              race: "Half-Orc",
              className: "Fighter",
              hpMax: one.seed.hpMax ?? null,
              sheet: one.body,
            });

            const five = yield* patchSheet(table, hollis, {
              expectedVersion: started.version,
              level: 5,
            });
            expect(five.sheet).toEqual(composed(5).body);
            expect(five.sheet.identity).toMatchObject({ proficiency: "+3", hitDice: "5/5 d10" });
            expect(five.hpMax).toBe(started.hpMax);

            // The same level resent beside another column is no level change.
            const stale = yield* patchSheet(table, hollis, { sheet: one.body });
            const resent = yield* patchSheet(table, hollis, {
              expectedVersion: stale.version,
              level: 5,
              className: "Fighter",
              hpMax: 40,
            });
            expect(resent.hpMax).toBe(40);
            expect(resent.sheet).toEqual(one.body);

            // A player at the table cannot reach the sheet to level it.
            const refused = yield* attempt(ilse.token, (client) =>
              client.npcs.updateSheet({
                params: { campaignId: table, npcId: hollis },
                payload: { level: 6 },
              }),
            );
            expect(refused).toMatchObject({ ok: false, tag: "NotFound" });
            yield* removeSheet(table, hollis);
          }),
      );

      it.effect("checks a subrace against its race in the campaign's rules", () =>
        Effect.gen(function* () {
          const { jo, table, hollis } = yield* Fixture;
          expect(
            yield* attempt(jo.token, (client) =>
              client.npcs.putSheet({
                params: { campaignId: table, npcId: hollis },
                payload: {
                  race: "Elf",
                  subrace: "Hill Dwarf",
                  sheet: { abilities: [], traits: [] },
                },
              }),
            ),
          ).toMatchObject({ ok: false, tag: "Conflict" });
          expect(yield* sheetOf(table, hollis)).toBeNull();

          const elf = yield* putSheet(table, hollis, {
            race: "Elf",
            subrace: "High Elf",
            sheet: { abilities: [], traits: [] },
          });
          expect(elf.descriptor).toBe("High Elf");
          expect(
            yield* attempt(jo.token, (client) =>
              client.npcs.updateSheet({
                params: { campaignId: table, npcId: hollis },
                payload: { race: "Dwarf" },
              }),
            ),
          ).toMatchObject({ ok: false, tag: "Conflict" });
          expect((yield* sheetOf(table, hollis))?.race).toBe("Elf");
          yield* removeSheet(table, hollis);
        }),
      );
    });

    describe("the NPC the path names", () => {
      it.effect(
        "refuses another campaign's NPC and a Library original, even to the creator of both",
        () =>
          Effect.gen(function* () {
            const { jo, table, elsewhere } = yield* Fixture;
            const theirs = yield* anNpc(jo.token, elsewhere, "Mother Sallow", "dm");
            yield* putSheet(elsewhere, theirs, { className: "Warlock", sheet: fighterBody });
            const original = (yield* as(jo.token, (client) =>
              client.library.createNpc({
                payload: { name: "Old Pell", role: "a Library original" },
              }),
            )).id;

            for (const npcId of [theirs, original]) {
              expect(
                yield* attempt(jo.token, (client) =>
                  client.npcs.sheet({ params: { campaignId: table, npcId } }),
                ),
              ).toEqual({ ok: false, tag: "NotFound", resource: "npc" });
              expect(
                yield* attempt(jo.token, (client) =>
                  client.npcs.putSheet({
                    params: { campaignId: table, npcId },
                    payload: { sheet: { abilities: [], traits: [] } },
                  }),
                ),
              ).toEqual({ ok: false, tag: "NotFound", resource: "npc" });
              expect(
                yield* attempt(jo.token, (client) =>
                  client.npcs.updateSheet({
                    params: { campaignId: table, npcId },
                    payload: { ac: 1 },
                  }),
                ),
              ).toEqual({ ok: false, tag: "NotFound", resource: "npc" });
              expect(
                yield* attempt(jo.token, (client) =>
                  client.npcs.removeSheet({ params: { campaignId: table, npcId } }),
                ),
              ).toEqual({ ok: false, tag: "NotFound", resource: "npc" });
            }
            expect((yield* sheetsOf(table)).map((row) => row.npcId)).not.toContain(theirs);
            expect((yield* sheetOf(elsewhere, theirs))?.className).toBe("Warlock");
            const pell = yield* sql(
              (sql) =>
                sql<{
                  readonly n: number;
                }>`select count(*)::int as n from npc_sheet where npc_id = ${original}`,
            );
            expect(pell[0]!.n).toBe(0);
          }),
      );
    });

    it.layer(
      Layer.effectDiscard(
        Effect.gen(function* () {
          const { table, grusk } = yield* Fixture;
          const now = yield* sheetOf(table, grusk);
          yield* putSheet(table, grusk, {
            ...(now === null ? {} : { expectedVersion: now.version }),
            level: 3,
            className: "Rogue",
            ac: 15,
            hpMax: 21,
            cr: "1",
            sheet: fighterBody,
          });
        }),
      ),
    )("nobody but the creator", (it) => {
      it.effect(
        "answers a player at the table, a withdrawn player and a stranger the campaign's NotFound",
        () =>
          Effect.gen(function* () {
            const { ilse, withdrawn, stranger, table, grusk, hollis } = yield* Fixture;
            const before = yield* sheetOf(table, grusk);
            for (const who of [ilse, withdrawn, stranger]) {
              const refused = { ok: false, tag: "NotFound", resource: "campaign" };
              expect(
                yield* attempt(who.token, (client) =>
                  client.npcs.sheets({ params: { campaignId: table }, query: {} }),
                ),
              ).toEqual(refused);
              for (const npcId of [grusk, hollis]) {
                const params = { campaignId: table, npcId };
                expect(
                  yield* attempt(who.token, (client) => client.npcs.sheet({ params })),
                ).toEqual(refused);
                expect(
                  yield* attempt(who.token, (client) =>
                    client.npcs.putSheet({
                      params,
                      payload: { sheet: { abilities: [], traits: [] } },
                    }),
                  ),
                ).toEqual(refused);
                expect(
                  yield* attempt(who.token, (client) =>
                    client.npcs.updateSheet({ params, payload: { hpMax: 1 } }),
                  ),
                ).toEqual(refused);
                expect(
                  yield* attempt(who.token, (client) => client.npcs.removeSheet({ params })),
                ).toEqual(refused);
              }
            }
            expect(yield* sheetOf(table, grusk)).toEqual(before);
            expect(yield* sheetOf(table, hollis)).toBeNull();
          }),
      );

      const playerPaths = ({ table, grusk, night }: Effect.Success<typeof Fixture>) => [
        `/campaigns/${table}/npcs/-/player`,
        `/campaigns/${table}/npcs/${grusk}/player`,
        `/campaigns/${table}/npcs/-/sessions/${night}`,
        `/campaigns/${table}/search?q=${TRAIT}`,
        `/campaigns/${table}/search?q=Grusk`,
      ];

      it.effect(
        "carries none of the sheet on anything a player reads about a shared NPC, or search",
        () =>
          Effect.gen(function* () {
            const fixture = yield* Fixture;
            const { jo, ilse, table, grusk } = fixture;
            for (const path of playerPaths(fixture)) {
              const read = yield* rawGet(ilse.token, path);
              expect(read.status, path).toBe(200);
              for (const marker of [
                TRAIT,
                "Rogue",
                "hpMax",
                "descriptor",
                '"cr"',
                "npcSheet",
                "sheet",
              ]) {
                expect(read.body, `${path} ${marker}`).not.toContain(marker);
              }
            }
            expect((yield* rawGet(ilse.token, `/campaigns/${table}/npcs/-/player`)).body).toContain(
              "Grusk",
            );
            // Nor on the creator's own NPC reads and search: the sheet is a read of its own.
            for (const path of [
              `/campaigns/${table}/npcs`,
              `/campaigns/${table}/npcs/${grusk}`,
              `/campaigns/${table}/npcs/-/prep`,
              `/campaigns/${table}/search?q=${TRAIT}`,
            ]) {
              const read = yield* rawGet(jo.token, path);
              expect(read.status, path).toBe(200);
              expect(read.body, path).not.toContain(TRAIT);
            }
          }),
      );

      it.effect("leaves a player's NPC reads byte for byte what they were", () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const { ilse, table, grusk } = fixture;
          const before = yield* Effect.forEach(
            playerPaths(fixture),
            (path) => rawGet(ilse.token, path),
            {
              concurrency: "unbounded",
            },
          );
          const now = yield* sheetOf(table, grusk);
          yield* putSheet(table, grusk, {
            expectedVersion: now!.version,
            level: 7,
            className: "Paladin",
            hpMax: 60,
            cr: "5",
            sheet: { ...fighterBody, traits: [{ name: "Something new", text: "A change." }] },
          });
          yield* patchSheet(table, grusk, { ac: 20 });
          const after = yield* Effect.forEach(
            playerPaths(fixture),
            (path) => rawGet(ilse.token, path),
            {
              concurrency: "unbounded",
            },
          );
          expect(after).toEqual(before);
        }),
      );

      it.effect("never shows the NPC's model the sheet, even in the creator's rehearsal", () =>
        Effect.gen(function* () {
          const { jo, table, grusk } = yield* Fixture;
          const model = scriptedModel({
            model: "scripted-local",
            maxTokens: 512,
            rounds: [textChunks("The river is listening.")],
          });
          const events = yield* Effect.gen(function* () {
            const agent = yield* NpcAgent;
            const stream = yield* agent.rehearse(table, grusk, { text: "What do you fight with?" });
            return Array.from(yield* Stream.runCollect(stream)) as ReadonlyArray<NpcEvent>;
          }).pipe(
            Effect.provideService(CurrentActor, jo.actor),
            Effect.provide(
              NpcAgent.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer)),
            ),
            Effect.orDie,
          );
          expect(events.some((event) => event.event === "done")).toBe(true);
          expect(model.requests()).toHaveLength(1);
          const shown = JSON.stringify(model.requests());
          // The persona reached the model; nothing of the sheet did.
          expect(shown).toContain("Grusk");
          for (const marker of [TRAIT, "Paladin", "boathook"]) {
            expect(shown, marker).not.toContain(marker);
          }
        }),
      );
    });
  },
  { timeout: "120 seconds" },
);
