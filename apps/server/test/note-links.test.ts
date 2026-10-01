import { describe, expect } from "@effect/vitest";
import { type CampaignId, type NoteId, TavernsApi } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { type Person, aCharacterAt, aPerson, admittedTo, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A note's links: the creator's to make, the creator's to read, and gone
 * with their target while the note stays.**
 *
 * Over the real application and Postgres. A link names an encounter, a seat
 * or an NPC of the note's own campaign; anything else is `NotFound`, as is
 * every link endpoint to anybody but the creator. A player's notes never carry
 * one, which is read on the raw wire because the derived client decodes into
 * the narrow class and would drop a field the server should never have sent
 * (`recap.test.ts` asks the same of a player's recap).
 *
 * The people are minted the shipped way: a player admitted through a real
 * invitation, seated through `party.join`.
 */
const database = migratedDatabase("taverns_test_note_links");
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

/** How many link rows a note has, whatever any read says. */
const linkRows = (noteId: NoteId) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) => sql<{ readonly count: number }>`
      select count(*)::int as count from note_link where note_link.note_id = ${noteId}
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

const npcBy = (jo: Person, campaignId: CampaignId, name: string) =>
  as(jo.token, (client) => client.npcs.create({ params: { campaignId }, payload: { name } })).pipe(
    Effect.map((made) => made.id),
  );

const noteBy = (jo: Person, table: CampaignId, title: string, visibility?: "shared") =>
  as(jo.token, (client) =>
    client.notes.create({
      params: { campaignId: table },
      payload: visibility === undefined ? { title } : { title, visibility },
    }),
  ).pipe(Effect.map((made) => made.id));

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");

  const table = (yield* as(jo.token, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  )).id;
  yield* admittedTo(table, ilse.actor, "Ilse");
  const ilseSeat = (yield* aCharacterAt(table, ilse.actor, { name: "Ilse's Ranger" })).seatId;
  const joSeat = (yield* aCharacterAt(table, jo.actor, { name: "Brannoc" })).seatId;
  const ambush = yield* encounterBy(jo, table, "Ambush in the reeds");
  const ford = yield* encounterBy(jo, table, "The ford");

  // Another of Jo's own tables: the same creator, so only the campaign
  // boundary stands between its encounter, seat and NPC and a note here.
  const elsewhere = (yield* as(jo.token, (client) =>
    campaignVia(client, { name: "Rook's Rest", visibility: "dm" }),
  )).id;
  const otherEncounter = yield* encounterBy(jo, elsewhere, "A fight elsewhere");
  const otherSeat = (yield* aCharacterAt(elsewhere, jo.actor, { name: "Wick" })).seatId;
  const otherNpc = yield* npcBy(jo, elsewhere, "Rook");
  const hollis = yield* npcBy(jo, table, "Hollis Grey");

  const hettie = yield* noteBy(jo, table, "Hettie is lying about the tide");
  const shared = yield* noteBy(jo, table, "House rule", "shared");
  return {
    jo,
    ilse,
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
    hettie,
    shared,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "note-links.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const encounter = (campaignId: CampaignId, name: string) =>
  Effect.flatMap(Fixture, ({ jo }) => encounterBy(jo, campaignId, name));

const npc = (campaignId: CampaignId, name: string) =>
  Effect.flatMap(Fixture, ({ jo }) => npcBy(jo, campaignId, name));

const note = (title: string, visibility?: "shared") =>
  Effect.flatMap(Fixture, ({ jo, table }) => noteBy(jo, table, title, visibility));

const linksPath = (noteId: NoteId, campaignId?: CampaignId) =>
  Effect.map(Fixture, ({ table }) => `/campaigns/${campaignId ?? table}/notes/${noteId}/links`);

describeLayer("note-links", shared, (it) => {
  describe("the creator linking a note", () => {
    it.effect("adds encounters and seats, in order, and reads them back on every read", () =>
      Effect.gen(function* () {
        const { jo, table, hettie, ambush, ilseSeat, ford } = yield* Fixture;
        const before = yield* as(jo.token, (client) =>
          client.notes.findById({ params: { campaignId: table, noteId: hettie } }),
        );
        expect(before.links).toEqual([]);

        yield* as(jo.token, (client) =>
          client.notes.addLink({
            params: { campaignId: table, noteId: hettie },
            payload: { kind: "encounter", id: ambush },
          }),
        );
        yield* as(jo.token, (client) =>
          client.notes.addLink({
            params: { campaignId: table, noteId: hettie },
            payload: { kind: "seat", id: ilseSeat },
          }),
        );
        const linked = yield* as(jo.token, (client) =>
          client.notes.addLink({
            params: { campaignId: table, noteId: hettie },
            payload: { kind: "encounter", id: ford },
          }),
        );
        const expected = [
          { kind: "encounter", id: ambush },
          { kind: "seat", id: ilseSeat },
          { kind: "encounter", id: ford },
        ];
        expect(linked.links).toEqual(expected);

        const found = yield* as(jo.token, (client) =>
          client.notes.findById({ params: { campaignId: table, noteId: hettie } }),
        );
        expect(found.links).toEqual(expected);
        const listed = yield* as(jo.token, (client) =>
          client.notes.list({ params: { campaignId: table }, query: {} }),
        );
        expect(listed.items.find((row) => row.id === hettie)?.links).toEqual(expected);
        // A PATCH answers the links as they stand, too.
        const patched = yield* as(jo.token, (client) =>
          client.notes.update({
            params: { campaignId: table, noteId: hettie },
            payload: { body: "She has a boat." },
          }),
        );
        expect(patched.links).toEqual(expected);

        // Linking says what the note is about; it is not an edit of what it says.
        expect(linked.updatedAt).toEqual(before.updatedAt);
        // The attachment is a separate thing, and stays as it was.
        expect(linked.attachedTo).toBeNull();
      }),
    );

    it.effect("is idempotent both ways, and removes exactly the link it names", () =>
      Effect.gen(function* () {
        const { jo, table, joSeat, ambush } = yield* Fixture;
        const noteId = yield* note("The ferryman's price");
        const add = () =>
          as(jo.token, (client) =>
            client.notes.addLink({
              params: { campaignId: table, noteId },
              payload: { kind: "seat", id: joSeat },
            }),
          );
        yield* add();
        const again = yield* add();
        expect(again.links).toEqual([{ kind: "seat", id: joSeat }]);
        expect(yield* linkRows(noteId)).toBe(1);

        yield* as(jo.token, (client) =>
          client.notes.addLink({
            params: { campaignId: table, noteId },
            payload: { kind: "encounter", id: ambush },
          }),
        );
        const remove = () =>
          as(jo.token, (client) =>
            client.notes.removeLink({
              params: { campaignId: table, noteId, kind: "seat", targetId: joSeat },
            }),
          );
        expect((yield* remove()).links).toEqual([{ kind: "encounter", id: ambush }]);
        expect((yield* remove()).links).toEqual([{ kind: "encounter", id: ambush }]);

        // The kind is part of the key: an encounter id named as a seat removes
        // nothing.
        const wrongKind = yield* as(jo.token, (client) =>
          client.notes.removeLink({
            params: { campaignId: table, noteId, kind: "seat", targetId: ambush },
          }),
        );
        expect(wrongKind.links).toEqual([{ kind: "encounter", id: ambush }]);
      }),
    );

    it.effect("refuses a target in another campaign, a retired seat and a stranger's id", () =>
      Effect.gen(function* () {
        const { jo, table, elsewhere, otherEncounter, otherSeat, ambush, ilseSeat } =
          yield* Fixture;
        const noteId = yield* note("Loose ends");
        const bodies = [
          { kind: "encounter", id: otherEncounter },
          { kind: "seat", id: otherSeat },
          // An encounter's id named as a seat, and a seat's as an encounter.
          { kind: "seat", id: ambush },
          { kind: "encounter", id: ilseSeat },
          { kind: "encounter", id: crypto.randomUUID() },
        ];
        for (const body of bodies) {
          const answer = yield* wire(jo.token, "POST", yield* linksPath(noteId), body);
          expect({ body, status: answer.status }).toEqual({ body, status: 404 });
        }

        // The note in the path is checked against the campaign in the path.
        const crossed = yield* wire(jo.token, "POST", yield* linksPath(noteId, elsewhere), {
          kind: "encounter",
          id: otherEncounter,
        });
        expect(crossed.status).toBe(404);

        // A seat whose character has left: no chip could open its page.
        const leaving = (yield* aCharacterAt(table, jo.actor, { name: "Old Tam" })).seatId;
        yield* as(jo.token, (client) =>
          client.party.leave({ params: { campaignId: table, campaignCharacterId: leaving } }),
        );
        const retired = yield* wire(jo.token, "POST", yield* linksPath(noteId), {
          kind: "seat",
          id: leaving,
        });
        expect(retired.status).toBe(404);

        expect(yield* linkRows(noteId)).toBe(0);
      }),
    );

    it.effect(
      "links an NPC of the cast, and refuses one that is archived, elsewhere or a Library original",
      () =>
        Effect.gen(function* () {
          const { jo, table, hollis, ambush, otherNpc, ilseSeat } = yield* Fixture;
          const noteId = yield* note("Hollis owes the ferryman");
          const linked = yield* as(jo.token, (client) =>
            client.notes.addLink({
              params: { campaignId: table, noteId },
              payload: { kind: "npc", id: hollis },
            }),
          );
          yield* as(jo.token, (client) =>
            client.notes.addLink({
              params: { campaignId: table, noteId },
              payload: { kind: "encounter", id: ambush },
            }),
          );
          expect(linked.links).toEqual([{ kind: "npc", id: hollis }]);
          const found = yield* as(jo.token, (client) =>
            client.notes.findById({ params: { campaignId: table, noteId } }),
          );
          expect(found.links).toEqual([
            { kind: "npc", id: hollis },
            { kind: "encounter", id: ambush },
          ]);

          const archived = yield* npc(table, "Gone for now");
          yield* as(jo.token, (client) =>
            client.npcs.archive({ params: { campaignId: table, npcId: archived }, payload: {} }),
          );
          const original = yield* as(jo.token, (client) =>
            client.library.createNpc({ payload: { name: "A Library original" } }),
          );
          const bodies = [
            { kind: "npc", id: otherNpc },
            { kind: "npc", id: archived },
            { kind: "npc", id: original.id },
            // An NPC's id named as a seat, and a seat's as an NPC.
            { kind: "seat", id: hollis },
            { kind: "npc", id: ilseSeat },
          ];
          for (const body of bodies) {
            const answer = yield* wire(jo.token, "POST", yield* linksPath(noteId), body);
            expect({ body, status: answer.status }).toEqual({ body, status: 404 });
          }

          const removed = yield* as(jo.token, (client) =>
            client.notes.removeLink({
              params: { campaignId: table, noteId, kind: "npc", targetId: hollis },
            }),
          );
          expect(removed.links).toEqual([{ kind: "encounter", id: ambush }]);

          // Archiving an NPC a note already names keeps the link, as a retired
          // seat's is kept.
          const kept = yield* npc(table, "Archived later");
          yield* as(jo.token, (client) =>
            client.notes.addLink({
              params: { campaignId: table, noteId },
              payload: { kind: "npc", id: kept },
            }),
          );
          yield* as(jo.token, (client) =>
            client.npcs.archive({ params: { campaignId: table, npcId: kept }, payload: {} }),
          );
          const after = yield* as(jo.token, (client) =>
            client.notes.findById({ params: { campaignId: table, noteId } }),
          );
          expect(after.links).toEqual([
            { kind: "encounter", id: ambush },
            { kind: "npc", id: kept },
          ]);
        }),
    );

    it.effect("is a key, not a check: the table refuses a link across campaigns", () =>
      Effect.gen(function* () {
        const { table, hettie, otherEncounter, otherNpc } = yield* Fixture;
        const refused = yield* Effect.flatMap(
          SqlClient.SqlClient,
          (sql) => sql`
            insert into note_link (note_id, campaign_id, encounter_id)
            values (${hettie}, ${table}, ${otherEncounter})
          `,
        ).pipe(Effect.flip, Effect.map(causes));
        expect(refused).toContain("note_link_encounter_fkey");

        const npcRefused = yield* Effect.flatMap(
          SqlClient.SqlClient,
          (sql) => sql`
            insert into note_link (note_id, campaign_id, npc_id)
            values (${hettie}, ${table}, ${otherNpc})
          `,
        ).pipe(Effect.flip, Effect.map(causes));
        expect(npcRefused).toContain("note_link_npc_fkey");
      }),
    );
  });

  describe("the link endpoints, to anybody but the creator", () => {
    it.effect("are NotFound for a seated player and a stranger, and write nothing", () =>
      Effect.gen(function* () {
        const { jo, ilse, stranger, table, shared, ambush, ilseSeat } = yield* Fixture;
        yield* as(jo.token, (client) =>
          client.notes.addLink({
            params: { campaignId: table, noteId: shared },
            payload: { kind: "encounter", id: ambush },
          }),
        );
        for (const who of [ilse, stranger]) {
          const added = yield* wire(who.token, "POST", yield* linksPath(shared), {
            kind: "seat",
            id: ilseSeat,
          });
          expect(added.status).toBe(404);
          const removed = yield* wire(
            who.token,
            "DELETE",
            `${yield* linksPath(shared)}/encounter/${ambush}`,
          );
          expect(removed.status).toBe(404);
          expect(removed.body).not.toContain("House rule");
        }
        expect(yield* linkRows(shared)).toBe(1);
      }),
    );
  });

  describe("a player's reads of a linked note", () => {
    it.effect("carry no links, and name no linked encounter, seat or NPC", () =>
      Effect.gen(function* () {
        const { jo, ilse, table, shared, hollis, ambush } = yield* Fixture;
        yield* as(jo.token, (client) =>
          client.notes.addLink({
            params: { campaignId: table, noteId: shared },
            payload: { kind: "npc", id: hollis },
          }),
        );
        const listed = yield* wire(ilse.token, "GET", `/campaigns/${table}/player-notes`);
        expect(listed.status).toBe(200);
        expect(listed.body).toContain("House rule");
        expect(listed.body).not.toContain('"links"');
        expect(listed.body).not.toContain(ambush);
        expect(listed.body).not.toContain(hollis);
      }),
    );
  });

  describe("deleting what a note is linked to", () => {
    it.effect("loses the link and keeps the note", () =>
      Effect.gen(function* () {
        const { jo, table, ford } = yield* Fixture;
        const noteId = yield* note("What the reeds hide");
        const doomed = yield* encounter(table, "A fight that never happens");
        yield* as(jo.token, (client) =>
          client.notes.addLink({
            params: { campaignId: table, noteId },
            payload: { kind: "encounter", id: doomed },
          }),
        );
        yield* as(jo.token, (client) =>
          client.notes.addLink({
            params: { campaignId: table, noteId },
            payload: { kind: "encounter", id: ford },
          }),
        );

        yield* as(jo.token, (client) =>
          client.encounters.remove({ params: { campaignId: table, encounterId: doomed } }),
        );

        const after = yield* as(jo.token, (client) =>
          client.notes.findById({ params: { campaignId: table, noteId } }),
        );
        expect(after.title).toBe("What the reeds hide");
        expect(after.links).toEqual([{ kind: "encounter", id: ford }]);
      }),
    );

    it.effect("goes with the note when the note is deleted", () =>
      Effect.gen(function* () {
        const { jo, table, ilseSeat } = yield* Fixture;
        const noteId = yield* note("Scrap");
        yield* as(jo.token, (client) =>
          client.notes.addLink({
            params: { campaignId: table, noteId },
            payload: { kind: "seat", id: ilseSeat },
          }),
        );
        yield* as(jo.token, (client) =>
          client.notes.remove({ params: { campaignId: table, noteId } }),
        );
        expect(yield* linkRows(noteId)).toBe(0);
      }),
    );
  });
});
