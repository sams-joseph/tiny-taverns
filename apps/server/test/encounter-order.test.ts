import { describe, expect } from "@effect/vitest";
import {
  type CampaignId,
  type CreatureId,
  CurrentActor,
  type EncounterId,
  type EncounterPlacement,
  MAX_PAGE_SIZE,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { Encounters } from "../src/repo/Encounters.js";
import {
  type Person,
  admittedTo,
  aGroupMemberAt,
  anAccount,
  aPerson,
  aPlayerAt,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **The DM's planned order: a campaign's encounters in the order the table
 * will play them** (`0078_encounter_order.ts`, `Encounters.move`).
 *
 * Over the real application and Postgres, through the client derived from the
 * contract. A new encounter lands at the end; a move puts one just before or
 * just after another and is not an edit; a played encounter keeps its slot and
 * is back in it when its night is deleted; creates and moves racing each other
 * all apply. Nobody but the creator can move one, and an anchor outside the
 * campaign is `NotFound`. The refused people are minted the shipped way
 * (`support/actors.ts`): a player through a real invitation, a Shared World
 * member whose seat was withdrawn, and a stranger.
 *
 * What a player is told of the order — array order and no number — is
 * `encounter-player.test.ts`; an accepted Hob proposal landing at the end is
 * `hob-proposals.test.ts`; the backfill is `migrations.test.ts`.
 */
const database = migratedDatabase("taverns_test_encounter_order");
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

/** The same call, answering the failure's tag rather than dying on it. */
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(token), call).pipe(
    Effect.map(() => "ok"),
    Effect.catch((error: unknown) =>
      Effect.succeed(
        typeof error === "object" && error !== null && "_tag" in error
          ? String(error._tag)
          : "unknown",
      ),
    ),
  );

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const archerId: CreatureId = (yield* as(jo.token, (client) =>
    client.library.create({
      payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
    }),
  )).id;
  return { jo, archerId };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "encounter-order.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const aTable = (name = "The Salt Road") =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    const made = yield* as(jo.token, (client) =>
      client.campaigns.create({ payload: { name, visibility: "shared" } }),
    );
    return made.id;
  });

const anEncounter = (campaignId: CampaignId, name: string) =>
  Effect.gen(function* () {
    const { jo, archerId } = yield* Fixture;
    const made = yield* as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId },
        payload: { name, creatures: [{ creatureId: archerId, count: 2 }] },
      }),
    );
    return made.id;
  });

/** Encounters made one after another, by name. */
const encounters = (campaignId: CampaignId, names: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const ids: Record<string, EncounterId> = {};
    for (const name of names) ids[name] = yield* anEncounter(campaignId, name);
    return ids;
  });

/** The creator's list, by name, in the order it arrives. */
const listed = (campaignId: CampaignId) =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    const page = yield* as(jo.token, (client) =>
      client.encounters.list({ params: { campaignId }, query: { limit: MAX_PAGE_SIZE } }),
    );
    return page.items.map((encounter) => encounter.name);
  });

const move = (
  who: Person,
  campaignId: CampaignId,
  encounterId: EncounterId,
  placement: EncounterPlacement,
) =>
  attempt(who.token, (client) =>
    // One branch each: the derived client's argument is a union of its own,
    // which a union payload does not distribute into.
    "before" in placement
      ? client.encounters.move({
          params: { campaignId, encounterId },
          payload: { before: placement.before },
        })
      : client.encounters.move({
          params: { campaignId, encounterId },
          payload: { after: placement.after },
        }),
  );

/** The stored slots, as a campaign holds them, in slot order. */
const slots = (campaignId: CampaignId) =>
  sql(
    (sql) => sql<{ readonly encounter_id: EncounterId; readonly position: number }>`
      select encounter_id, position from encounter_prep
      where campaign_id = ${campaignId}
      order by position
    `,
  );

describeLayer("encounter-order", shared, (it) => {
  describe("a new encounter", () => {
    it.effect("lands at the end, whatever order the list is in", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const table = yield* aTable();
        const { A, C } = yield* encounters(table, ["A", "B", "C"]);
        expect(yield* listed(table)).toEqual(["A", "B", "C"]);

        expect(yield* move(jo, table, C!, { before: A! })).toBe("ok");
        yield* anEncounter(table, "D");
        expect(yield* listed(table)).toEqual(["C", "A", "B", "D"]);
        expect((yield* slots(table)).map((slot) => slot.position)).toEqual([0, 1, 2, 3]);
      }),
    );

    it.effect("lands after a gap a delete left, and a move closes the gap", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const table = yield* aTable();
        const { A, B } = yield* encounters(table, ["A", "B", "C"]);
        yield* as(jo.token, (client) =>
          client.encounters.remove({ params: { campaignId: table, encounterId: B! } }),
        );
        yield* anEncounter(table, "D");
        expect(yield* listed(table)).toEqual(["A", "C", "D"]);
        expect((yield* slots(table)).map((slot) => slot.position)).toEqual([0, 2, 3]);

        expect(yield* move(jo, table, A!, { after: A! })).toBe("ok");
        expect((yield* slots(table)).map((slot) => slot.position)).toEqual([0, 2, 3]);
        const D = (yield* slots(table))[2]!.encounter_id;
        expect(yield* move(jo, table, D, { before: A! })).toBe("ok");
        expect(yield* listed(table)).toEqual(["D", "A", "C"]);
        expect((yield* slots(table)).map((slot) => slot.position)).toEqual([0, 1, 2]);
      }),
    );
  });

  describe("moving an encounter", () => {
    it.effect("puts it just before or just after another, up or down the list", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const table = yield* aTable();
        const { A, B, C, D, E } = yield* encounters(table, ["A", "B", "C", "D", "E"]);

        expect(yield* move(jo, table, D!, { before: B! })).toBe("ok");
        expect(yield* listed(table)).toEqual(["A", "D", "B", "C", "E"]);
        expect(yield* move(jo, table, A!, { after: E! })).toBe("ok");
        expect(yield* listed(table)).toEqual(["D", "B", "C", "E", "A"]);
        expect(yield* move(jo, table, E!, { before: D! })).toBe("ok");
        expect(yield* listed(table)).toEqual(["E", "D", "B", "C", "A"]);
        expect(yield* move(jo, table, B!, { after: A! })).toBe("ok");
        expect(yield* listed(table)).toEqual(["E", "D", "C", "A", "B"]);
        // Relative to itself, and to where it already is: nothing changes.
        expect(yield* move(jo, table, C!, { before: C! })).toBe("ok");
        expect(yield* move(jo, table, C!, { after: D! })).toBe("ok");
        expect(yield* listed(table)).toEqual(["E", "D", "C", "A", "B"]);

        // The prep list, the other creator read the screens order by, agrees.
        const prep = yield* as(jo.token, (client) =>
          client.encounterPrep.list({ params: { campaignId: table } }),
        );
        const names = Object.fromEntries(
          Object.entries({ A, B, C, D, E }).map(([name, id]) => [id!, name]),
        );
        expect(prep.map((row) => names[row.encounterId])).toEqual(["E", "D", "C", "A", "B"]);
      }),
    );

    it.effect("is not an edit: neither encounter's updated time moves", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const table = yield* aTable();
        const { A, C } = yield* encounters(table, ["A", "B", "C"]);
        const stamps = sql(
          (sql) => sql<{ readonly encounter: Date; readonly prep: Date }>`
          select encounter.updated_at as encounter, encounter_prep.updated_at as prep
          from encounter join encounter_prep on encounter_prep.encounter_id = encounter.id
          where encounter.campaign_id = ${table}
          order by encounter.name
        `,
        );
        const before = yield* stamps;
        expect(yield* move(jo, table, C!, { before: A! })).toBe("ok");
        expect(yield* listed(table)).toEqual(["C", "A", "B"]);
        expect(yield* stamps).toEqual(before);
      }),
    );

    it.effect(
      "moves across played encounters, which keep their slots and have them back when their night goes",
      () =>
        Effect.gen(function* () {
          const { jo } = yield* Fixture;
          const table = yield* aTable();
          const { A, B, C, D } = yield* encounters(table, ["A", "B", "C", "D"]);

          // B is played, on a night of its own.
          const night = yield* as(jo.token, (client) =>
            client.sessions.create({
              params: { campaignId: table },
              payload: { number: 1, visibility: "shared" },
            }),
          );
          const sessionId: SessionId = night.id;
          yield* as(jo.token, (client) =>
            client.campaigns.update({
              params: { campaignId: table },
              payload: { currentSessionId: sessionId },
            }),
          );
          const fight = yield* as(jo.token, (client) =>
            client.runs.start({
              params: { campaignId: table, sessionId },
              payload: { encounterId: B! },
            }),
          );
          yield* as(jo.token, (client) =>
            client.runs.end({
              params: { campaignId: table, sessionId, runId: fight.id },
              payload: {},
            }),
          );

          // The unplayed ones move past it, relative to their neighbours.
          expect(yield* move(jo, table, D!, { after: A! })).toBe("ok");
          expect(yield* listed(table)).toEqual(["A", "D", "B", "C"]);
          expect(yield* move(jo, table, A!, { after: B! })).toBe("ok");
          expect(yield* listed(table)).toEqual(["D", "B", "A", "C"]);
          // A played one is still a slot a move can anchor on, and can be moved.
          expect(yield* move(jo, table, C!, { before: B! })).toBe("ok");
          expect(yield* listed(table)).toEqual(["D", "C", "B", "A"]);

          // The night goes, and its fight with it: B is unplayed again, where the
          // DM last had it.
          yield* as(jo.token, (client) =>
            client.sessions.remove({ params: { campaignId: table, sessionId } }),
          );
          const after = yield* as(jo.token, (client) =>
            client.encounters.list({
              params: { campaignId: table },
              query: { limit: MAX_PAGE_SIZE },
            }),
          );
          expect(after.items.map((encounter) => [encounter.name, encounter.lastPlayed])).toEqual([
            ["D", null],
            ["C", null],
            ["B", null],
            ["A", null],
          ]);
        }),
    );

    it.effect("pages in the planned order, a cursor at a time", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const table = yield* aTable();
        const { A, E } = yield* encounters(table, ["A", "B", "C", "D", "E"]);
        expect(yield* move(jo, table, E!, { before: A! })).toBe("ok");
        const names: Array<string> = [];
        let cursor: Parameters<Client["encounters"]["list"]>[0]["query"]["cursor"];
        for (;;) {
          const page = yield* as(jo.token, (client) =>
            client.encounters.list({
              params: { campaignId: table },
              query: cursor === undefined ? { limit: 2 } : { limit: 2, cursor },
            }),
          );
          names.push(...page.items.map((encounter) => encounter.name));
          if (page.nextCursor === null) break;
          cursor = page.nextCursor;
        }
        expect(names).toEqual(["E", "A", "B", "C", "D"]);
      }),
    );
  });

  describe("a move, to anybody but the creator", () => {
    it.effect(
      "is NotFound for a player, a Shared World member and a stranger, and moves nothing",
      () =>
        Effect.gen(function* () {
          const { jo } = yield* Fixture;
          const table = yield* aTable();
          const { A, C } = yield* encounters(table, ["A", "B", "C"]);
          yield* as(jo.token, (client) =>
            client.encounters.update({
              params: { campaignId: table, encounterId: C! },
              payload: { visibility: "shared", ready: true },
            }),
          );
          const player = yield* aPlayerAt(table, "Ilse");
          const member = yield* aGroupMemberAt(table, "Wren");
          const stranger = yield* anAccount("Bo");

          for (const actor of [player, member, stranger]) {
            const refused = yield* Effect.flatMap(Encounters, (repo) =>
              repo.move(table, C!, { before: A! }),
            ).pipe(Effect.provideService(CurrentActor, actor), Effect.flip, Effect.orDie);
            expect(refused._tag).toBe("NotFound");
          }

          // Over the wire too, for a player admitted with an account of their own.
          const ilse = yield* aPerson("Ilse again");
          yield* admittedTo(table, ilse.actor, "Ilse again");
          expect(yield* move(ilse, table, C!, { before: A! })).toBe("NotFound");

          expect(yield* listed(table)).toEqual(["A", "B", "C"]);
        }),
    );

    it.effect("is NotFound when the anchor or the encounter is another campaign's", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const table = yield* aTable();
        const other = yield* aTable("Rook's Rest");
        const { A } = yield* encounters(table, ["A", "B"]);
        const { Z } = yield* encounters(other, ["Z"]);

        expect(yield* move(jo, table, A!, { after: Z! })).toBe("NotFound");
        expect(yield* move(jo, table, Z!, { before: A! })).toBe("NotFound");
        // And the other campaign's path does not reach this one's encounter.
        expect(yield* move(jo, other, A!, { before: Z! })).toBe("NotFound");
        expect(yield* listed(table)).toEqual(["A", "B"]);
        expect(yield* listed(other)).toEqual(["Z"]);
      }),
    );

    it.effect("is NotFound for an anchor since deleted", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const table = yield* aTable();
        const { A, B } = yield* encounters(table, ["A", "B", "C"]);
        yield* as(jo.token, (client) =>
          client.encounters.remove({ params: { campaignId: table, encounterId: B! } }),
        );
        expect(yield* move(jo, table, A!, { after: B! })).toBe("NotFound");
        expect(yield* listed(table)).toEqual(["A", "C"]);
      }),
    );
  });

  describe("racing writes", () => {
    it.effect("gives two creates at once two slots at the end", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const table = yield* aTable();
        yield* encounters(table, ["A"]);
        const results = yield* Effect.all(
          ["B", "C", "D", "E"].map((name) =>
            attempt(jo.token, (client) =>
              client.encounters.create({ params: { campaignId: table }, payload: { name } }),
            ),
          ),
          { concurrency: "unbounded" },
        );
        expect(results).toEqual(["ok", "ok", "ok", "ok"]);
        const names = yield* listed(table);
        expect(names[0]).toBe("A");
        expect([...names].sort()).toEqual(["A", "B", "C", "D", "E"]);
        expect((yield* slots(table)).map((slot) => slot.position)).toEqual([0, 1, 2, 3, 4]);
      }),
    );

    it.effect("applies a move and a create that race, both of them", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const table = yield* aTable();
        const { A, C } = yield* encounters(table, ["A", "B", "C"]);
        const [moved, made] = yield* Effect.all(
          [
            move(jo, table, C!, { before: A! }),
            attempt(jo.token, (client) =>
              client.encounters.create({ params: { campaignId: table }, payload: { name: "D" } }),
            ),
          ],
          { concurrency: "unbounded" },
        );
        expect([moved, made]).toEqual(["ok", "ok"]);
        expect(yield* listed(table)).toEqual(["C", "A", "B", "D"]);
      }),
    );

    it.effect("applies two moves that race in the order they commit", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const table = yield* aTable();
        const { A, B, C, D } = yield* encounters(table, ["A", "B", "C", "D"]);
        const results = yield* Effect.all(
          [move(jo, table, D!, { before: A! }), move(jo, table, B!, { after: C! })],
          { concurrency: "unbounded" },
        );
        expect(results).toEqual(["ok", "ok"]);
        const names = yield* listed(table);
        // Whichever went first, both placements hold at the end.
        expect(names.indexOf("D")).toBeLessThan(names.indexOf("A"));
        expect(names.indexOf("B")).toBe(names.indexOf("C") + 1);
        expect((yield* slots(table)).map((slot) => slot.position)).toEqual([0, 1, 2, 3]);
      }),
    );
  });
});
