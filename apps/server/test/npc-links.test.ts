import { describe, expect } from "@effect/vitest";
import { type CampaignId, type NpcId, TavernsApi } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { Invites } from "../src/repo/Invites.js";
import {
  type Person,
  aCharacterAt,
  aPerson,
  admittedTo,
  asDm,
  campaignVia,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **An NPC's links: the creator's prep, gone with their target while the NPC
 * stays, and never a player's.**
 *
 * Over the real application and Postgres. A link ties an NPC to an encounter
 * or a seat of its own campaign; anything else is `NotFound`, as is every link
 * endpoint to anybody but the creator — a seated player, a player whose
 * invitation was revoked, and a stranger. A player's reads of a shared, linked
 * NPC are read on the raw wire, because the derived client decodes into the
 * narrow class and would drop a field the server should never have sent.
 *
 * The people are minted the shipped way: a player admitted through a real
 * invitation, seated through `party.join`.
 */
const database = migratedDatabase("taverns_test_npc_links");
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

/** A request as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, method: "GET" | "POST" | "DELETE", path: string, body?: unknown) =>
  Effect.gen(function* () {
    const request =
      method === "GET"
        ? HttpClientRequest.get(path)
        : method === "DELETE"
          ? HttpClientRequest.delete(path)
          : HttpClientRequest.post(path).pipe(HttpClientRequest.bodyJsonUnsafe(body));
    const response = yield* HttpClient.execute(request.pipe(HttpClientRequest.bearerToken(token)));
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

/** How many link rows an NPC has, whatever any read says. */
const linkRows = (npcId: NpcId) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) => sql<{ readonly count: number }>`
      select count(*)::int as count from npc_link where npc_link.npc_id = ${npcId}
    `,
  ).pipe(
    Effect.orDie,
    Effect.map((rows) => rows[0]!.count),
  );

/** An error and every cause under it, as text: the constraint's name is in the driver's. */
const causes = (error: unknown): string => {
  const seen: Array<string> = [];
  for (let cause = error; cause !== null && cause !== undefined;) {
    seen.push(String(cause));
    cause = (cause as { readonly cause?: unknown }).cause;
  }
  return seen.join("\n");
};

const encounterBy = (jo: Person, campaignId: CampaignId, name: string) =>
  as(jo.token, (client) =>
    client.encounters.create({ params: { campaignId }, payload: { name } }),
  ).pipe(Effect.map((made) => made.id));

const npcBy = (jo: Person, campaignId: CampaignId, name: string, visibility?: "shared") =>
  as(jo.token, (client) =>
    client.npcs.create({
      params: { campaignId },
      payload: visibility === undefined ? { name } : { name, visibility },
    }),
  ).pipe(Effect.map((made) => made.id));

const linksPath = (npcId: NpcId, campaignId: CampaignId) =>
  `/campaigns/${campaignId}/npcs/${npcId}/links`;

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const wren = yield* aPerson("Wren");
  const stranger = yield* aPerson("Bo");

  const table = (yield* as(jo.token, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  )).id;
  yield* admittedTo(table, ilse.actor, "Ilse");
  const ilseSeat = (yield* aCharacterAt(table, ilse.actor, { name: "Ilse's Ranger" })).seatId;
  const joSeat = (yield* aCharacterAt(table, jo.actor, { name: "Brannoc" })).seatId;
  const ambush = yield* encounterBy(jo, table, "Ambush in the reeds");
  const ford = yield* encounterBy(jo, table, "The ford");

  // Wren was a player until the DM revoked the invitation: still an account,
  // still in the Shared World, no longer at this table.
  yield* admittedTo(table, wren.actor, "Wren");
  yield* Effect.gen(function* () {
    const invites = yield* Invites;
    const proof = yield* asDm(jo.actor, table);
    const listed = yield* invites.listForCampaign(proof);
    yield* invites.revokeForCampaign(proof, listed.find((invite) => invite.label === "Wren")!.id);
  });

  // Another of Jo's own tables: the same creator, so only the campaign
  // boundary stands between its encounter, seat and NPC and an NPC here.
  const elsewhere = (yield* as(jo.token, (client) =>
    campaignVia(client, { name: "Rook's Rest", visibility: "dm" }),
  )).id;
  const otherEncounter = yield* encounterBy(jo, elsewhere, "A fight elsewhere");
  const otherSeat = (yield* aCharacterAt(elsewhere, jo.actor, { name: "Wick" })).seatId;
  const otherNpc = yield* npcBy(jo, elsewhere, "Rook");

  const hollis = yield* npcBy(jo, table, "Hollis Grey");
  const ferryman = yield* npcBy(jo, table, "The ferryman", "shared");
  return {
    jo,
    ilse,
    wren,
    stranger,
    table,
    elsewhere,
    ambush,
    ford,
    ilseSeat,
    joSeat,
    otherEncounter,
    otherSeat,
    otherNpc,
    hollis,
    ferryman,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "npc-links.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const encounter = (campaignId: CampaignId, name: string) =>
  Effect.flatMap(Fixture, ({ jo }) => encounterBy(jo, campaignId, name));

const npc = (name: string) => Effect.flatMap(Fixture, ({ jo, table }) => npcBy(jo, table, name));

describeLayer("npc-links", shared, (it) => {
  describe("the creator linking an NPC", () => {
    it.effect("adds encounters and seats, in order, and reads them back", () =>
      Effect.gen(function* () {
        const { jo, table, ambush, ford, ilseSeat, hollis } = yield* Fixture;
        const before = yield* as(jo.token, (client) =>
          client.npcs.findById({ params: { campaignId: table, npcId: hollis } }),
        );
        const empty = yield* as(jo.token, (client) =>
          client.npcs.links({ params: { campaignId: table, npcId: hollis } }),
        );
        expect(empty).toMatchObject({ npcId: hollis, links: [] });

        yield* as(jo.token, (client) =>
          client.npcs.addLink({
            params: { campaignId: table, npcId: hollis },
            payload: { kind: "encounter", id: ambush },
          }),
        );
        yield* as(jo.token, (client) =>
          client.npcs.addLink({
            params: { campaignId: table, npcId: hollis },
            payload: { kind: "seat", id: ilseSeat },
          }),
        );
        const linked = yield* as(jo.token, (client) =>
          client.npcs.addLink({
            params: { campaignId: table, npcId: hollis },
            payload: { kind: "encounter", id: ford },
          }),
        );
        const expected = [
          { kind: "encounter", id: ambush },
          { kind: "seat", id: ilseSeat },
          { kind: "encounter", id: ford },
        ];
        expect(linked).toMatchObject({ npcId: hollis, links: expected });

        const read = yield* as(jo.token, (client) =>
          client.npcs.links({ params: { campaignId: table, npcId: hollis } }),
        );
        expect(read.links).toEqual(expected);

        // A tie is not an edit of the persona: the NPC's version and time stand.
        const after = yield* as(jo.token, (client) =>
          client.npcs.findById({ params: { campaignId: table, npcId: hollis } }),
        );
        expect(after.version).toBe(before.version);
        expect(after.updatedAt).toEqual(before.updatedAt);
      }),
    );

    it.effect("is idempotent both ways, and removes exactly the link it names", () =>
      Effect.gen(function* () {
        const { jo, table, ambush, joSeat } = yield* Fixture;
        const npcId = yield* npc("Mother Sallow");
        const add = () =>
          as(jo.token, (client) =>
            client.npcs.addLink({
              params: { campaignId: table, npcId },
              payload: { kind: "seat", id: joSeat },
            }),
          );
        yield* add();
        const again = yield* add();
        expect(again.links).toEqual([{ kind: "seat", id: joSeat }]);
        expect(yield* linkRows(npcId)).toBe(1);

        yield* as(jo.token, (client) =>
          client.npcs.addLink({
            params: { campaignId: table, npcId },
            payload: { kind: "encounter", id: ambush },
          }),
        );
        const remove = () =>
          as(jo.token, (client) =>
            client.npcs.removeLink({
              params: { campaignId: table, npcId, kind: "seat", targetId: joSeat },
            }),
          );
        expect((yield* remove()).links).toEqual([{ kind: "encounter", id: ambush }]);
        expect((yield* remove()).links).toEqual([{ kind: "encounter", id: ambush }]);

        // The kind is part of the key: an encounter id named as a seat removes
        // nothing.
        const wrongKind = yield* as(jo.token, (client) =>
          client.npcs.removeLink({
            params: { campaignId: table, npcId, kind: "seat", targetId: ambush },
          }),
        );
        expect(wrongKind.links).toEqual([{ kind: "encounter", id: ambush }]);
      }),
    );

    it.effect("refuses a target in another campaign, a retired seat and a stranger's id", () =>
      Effect.gen(function* () {
        const {
          jo,
          table,
          elsewhere,
          ambush,
          ilseSeat,
          otherEncounter,
          otherSeat,
          otherNpc,
          hollis,
        } = yield* Fixture;
        const npcId = yield* npc("Snagtooth");
        const bodies = [
          { kind: "encounter", id: otherEncounter },
          { kind: "seat", id: otherSeat },
          // An encounter's id named as a seat, and a seat's as an encounter.
          { kind: "seat", id: ambush },
          { kind: "encounter", id: ilseSeat },
          { kind: "encounter", id: crypto.randomUUID() },
          // An NPC is not something an NPC links to.
          { kind: "npc", id: hollis },
        ];
        for (const body of bodies) {
          const answer = yield* wire(jo.token, "POST", linksPath(npcId, table), body);
          expect({ body, status: answer.status }).toEqual({
            body,
            // The last is refused by the contract before any row is read.
            status: body.kind === "npc" ? 400 : 404,
          });
        }

        // The NPC in the path is checked against the campaign in the path.
        const crossed = yield* wire(jo.token, "POST", linksPath(otherNpc, table), {
          kind: "encounter",
          id: ambush,
        });
        expect(crossed.status).toBe(404);
        const crossedRead = yield* wire(jo.token, "GET", linksPath(npcId, elsewhere));
        expect(crossedRead.status).toBe(404);

        // A seat whose character has left: no chip could open its page.
        const leaving = (yield* aCharacterAt(table, jo.actor, { name: "Old Tam" })).seatId;
        yield* as(jo.token, (client) =>
          client.party.leave({ params: { campaignId: table, campaignCharacterId: leaving } }),
        );
        const retired = yield* wire(jo.token, "POST", linksPath(npcId, table), {
          kind: "seat",
          id: leaving,
        });
        expect(retired.status).toBe(404);

        expect(yield* linkRows(npcId)).toBe(0);
      }),
    );

    it.effect("is a key, not a check: the table refuses a link across campaigns", () =>
      Effect.gen(function* () {
        const { table, otherEncounter, hollis } = yield* Fixture;
        const refused = yield* Effect.flatMap(
          SqlClient.SqlClient,
          (sql) => sql`
            insert into npc_link (npc_id, campaign_id, encounter_id)
            values (${hollis}, ${table}, ${otherEncounter})
          `,
        ).pipe(Effect.flip, Effect.map(causes));
        expect(refused).toContain("npc_link_encounter_fkey");
      }),
    );
  });

  describe("the link endpoints, to anybody but the creator", () => {
    it.effect(
      "are NotFound for a seated player, a revoked one and a stranger, and write nothing",
      () =>
        Effect.gen(function* () {
          const { jo, ilse, wren, stranger, table, ambush, ilseSeat, ferryman } = yield* Fixture;
          yield* as(jo.token, (client) =>
            client.npcs.addLink({
              params: { campaignId: table, npcId: ferryman },
              payload: { kind: "encounter", id: ambush },
            }),
          );
          for (const who of [ilse, wren, stranger]) {
            const read = yield* wire(who.token, "GET", linksPath(ferryman, table));
            expect(read.status).toBe(404);
            expect(read.body).not.toContain(ambush);
            const added = yield* wire(who.token, "POST", linksPath(ferryman, table), {
              kind: "seat",
              id: ilseSeat,
            });
            expect(added.status).toBe(404);
            const removed = yield* wire(
              who.token,
              "DELETE",
              `${linksPath(ferryman, table)}/encounter/${ambush}`,
            );
            expect(removed.status).toBe(404);
            expect(removed.body).not.toContain("ferryman");
          }
          expect(yield* linkRows(ferryman)).toBe(1);
        }),
    );
  });

  describe("a player's reads of a shared, linked NPC", () => {
    it.effect("carry no links, and name no linked encounter or seat", () =>
      Effect.gen(function* () {
        const { jo, ilse, table, ambush, joSeat, ferryman } = yield* Fixture;
        yield* as(jo.token, (client) =>
          client.npcs.addLink({
            params: { campaignId: table, npcId: ferryman },
            payload: { kind: "seat", id: joSeat },
          }),
        );
        const listed = yield* wire(ilse.token, "GET", `/campaigns/${table}/npcs/-/player`);
        expect(listed.status).toBe(200);
        expect(listed.body).toContain("The ferryman");
        const found = yield* wire(ilse.token, "GET", `/campaigns/${table}/npcs/${ferryman}/player`);
        expect(found.status).toBe(200);
        for (const body of [listed.body, found.body]) {
          expect(body).not.toContain('"links"');
          expect(body).not.toContain(ambush);
          expect(body).not.toContain(joSeat);
        }
      }),
    );
  });

  describe("what happens to a link", () => {
    it.effect("goes with a deleted encounter, and the NPC stays", () =>
      Effect.gen(function* () {
        const { jo, table, ford } = yield* Fixture;
        const npcId = yield* npc("Grusk");
        const doomed = yield* encounter(table, "Grusk collects the toll");
        for (const id of [doomed, ford]) {
          yield* as(jo.token, (client) =>
            client.npcs.addLink({
              params: { campaignId: table, npcId },
              payload: { kind: "encounter", id },
            }),
          );
        }

        yield* as(jo.token, (client) =>
          client.encounters.remove({ params: { campaignId: table, encounterId: doomed } }),
        );

        const after = yield* as(jo.token, (client) =>
          client.npcs.links({ params: { campaignId: table, npcId } }),
        );
        expect(after.links).toEqual([{ kind: "encounter", id: ford }]);
      }),
    );

    it.effect("stays in the record when the seat is retired", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const npcId = yield* npc("Joss");
        const leaving = (yield* aCharacterAt(table, jo.actor, { name: "Odo" })).seatId;
        yield* as(jo.token, (client) =>
          client.npcs.addLink({
            params: { campaignId: table, npcId },
            payload: { kind: "seat", id: leaving },
          }),
        );
        yield* as(jo.token, (client) =>
          client.party.leave({ params: { campaignId: table, campaignCharacterId: leaving } }),
        );

        const after = yield* as(jo.token, (client) =>
          client.npcs.links({ params: { campaignId: table, npcId } }),
        );
        expect(after.links).toEqual([{ kind: "seat", id: leaving }]);
        // And it can still be taken off.
        const removed = yield* as(jo.token, (client) =>
          client.npcs.removeLink({
            params: { campaignId: table, npcId, kind: "seat", targetId: leaving },
          }),
        );
        expect(removed.links).toEqual([]);
      }),
    );

    it.effect("survives archiving the NPC, and is there again on restore", () =>
      Effect.gen(function* () {
        const { jo, table, ambush } = yield* Fixture;
        const npcId = yield* npc("Marl");
        yield* as(jo.token, (client) =>
          client.npcs.addLink({
            params: { campaignId: table, npcId },
            payload: { kind: "encounter", id: ambush },
          }),
        );
        yield* as(jo.token, (client) =>
          client.npcs.archive({ params: { campaignId: table, npcId }, payload: {} }),
        );
        const archived = yield* as(jo.token, (client) =>
          client.npcs.links({ params: { campaignId: table, npcId } }),
        );
        expect(archived.links).toEqual([{ kind: "encounter", id: ambush }]);

        yield* as(jo.token, (client) =>
          client.npcs.restore({ params: { campaignId: table, npcId }, payload: {} }),
        );
        const restored = yield* as(jo.token, (client) =>
          client.npcs.links({ params: { campaignId: table, npcId } }),
        );
        expect(restored.links).toEqual([{ kind: "encounter", id: ambush }]);
      }),
    );
  });
});
