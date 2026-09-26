import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignCharacterId,
  type CampaignId,
  type EncounterId,
  type NoteId,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { aCharacterAt, admittedTo, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **A note's links: the creator's to make, the creator's to read, and gone
 * with their target while the note stays.**
 *
 * Over the real application and Postgres. A link names an encounter or a seat
 * of the note's own campaign; anything else is `NotFound`, as is every link
 * endpoint to anybody but the creator. A player's notes never carry one,
 * which is read on the raw wire because the derived client decodes into the
 * narrow class and would drop a field the server should never have sent
 * (`recap.test.ts` asks the same of a player's recap).
 *
 * The people are minted the shipped way: a player admitted through a real
 * invitation, seated through `party.join`.
 */
const database = migratedDatabase("taverns_test_note_links");
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

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

/** A request as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, method: "GET" | "POST" | "DELETE", path: string, body?: unknown) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const request =
        method === "GET"
          ? HttpClientRequest.get(path)
          : method === "DELETE"
            ? HttpClientRequest.delete(path)
            : HttpClientRequest.post(path).pipe(HttpClientRequest.bodyJsonUnsafe(body));
      const response = yield* HttpClient.execute(
        request.pipe(HttpClientRequest.bearerToken(token)),
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

/** How many link rows a note has, whatever any read says. */
const linkRows = (noteId: NoteId) =>
  run(
    Effect.flatMap(
      SqlClient.SqlClient,
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from note_link where note_link.note_id = ${noteId}
      `,
    ),
  ).then((rows) => rows[0]!.count);

/** An error and every cause under it, as text: the constraint's name is in the driver's. */
const causes = (error: unknown): string => {
  const seen: Array<string> = [];
  for (let cause = error; cause !== null && cause !== undefined;) {
    seen.push(String(cause));
    cause = (cause as { readonly cause?: unknown }).cause;
  }
  return seen.join("\n");
};

let jo: Person;
let ilse: Person;
let stranger: Person;
let table: CampaignId;
let elsewhere: CampaignId;
let ambush: EncounterId;
let ford: EncounterId;
let ilseSeat: CampaignCharacterId;
let joSeat: CampaignCharacterId;
let otherEncounter: EncounterId;
let otherSeat: CampaignCharacterId;
let hettie: NoteId;
let shared: NoteId;

const encounter = (campaignId: CampaignId, name: string) =>
  as(jo.token, (client) =>
    client.encounters.create({ params: { campaignId }, payload: { name } }),
  ).then((made) => made.id);

const note = (title: string, visibility?: "shared") =>
  as(jo.token, (client) =>
    client.notes.create({
      params: { campaignId: table },
      payload: visibility === undefined ? { title } : { title, visibility },
    }),
  ).then((made) => made.id);

const linksPath = (noteId: NoteId, campaignId: CampaignId = table) =>
  `/campaigns/${campaignId}/notes/${noteId}/links`;

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");

  table = (
    await as(jo.token, (client) =>
      campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
    )
  ).id;
  await run(admittedTo(table, ilse.actor, "Ilse"));
  ilseSeat = (await run(aCharacterAt(table, ilse.actor, { name: "Ilse's Ranger" }))).seatId;
  joSeat = (await run(aCharacterAt(table, jo.actor, { name: "Brannoc" }))).seatId;
  ambush = await encounter(table, "Ambush in the reeds");
  ford = await encounter(table, "The ford");

  // Another of Jo's own tables: the same creator, so only the campaign
  // boundary stands between its encounter and seat and a note here.
  elsewhere = (
    await as(jo.token, (client) => campaignVia(client, { name: "Rook's Rest", visibility: "dm" }))
  ).id;
  otherEncounter = await encounter(elsewhere, "A fight elsewhere");
  otherSeat = (await run(aCharacterAt(elsewhere, jo.actor, { name: "Wick" }))).seatId;

  hettie = await note("Hettie is lying about the tide");
  shared = await note("House rule", "shared");
}, 60_000);

describe("the creator linking a note", () => {
  it("adds encounters and seats, in order, and reads them back on every read", async () => {
    const before = await as(jo.token, (client) =>
      client.notes.findById({ params: { campaignId: table, noteId: hettie } }),
    );
    expect(before.links).toEqual([]);

    await as(jo.token, (client) =>
      client.notes.addLink({
        params: { campaignId: table, noteId: hettie },
        payload: { kind: "encounter", id: ambush },
      }),
    );
    await as(jo.token, (client) =>
      client.notes.addLink({
        params: { campaignId: table, noteId: hettie },
        payload: { kind: "seat", id: ilseSeat },
      }),
    );
    const linked = await as(jo.token, (client) =>
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

    const found = await as(jo.token, (client) =>
      client.notes.findById({ params: { campaignId: table, noteId: hettie } }),
    );
    expect(found.links).toEqual(expected);
    const listed = await as(jo.token, (client) =>
      client.notes.list({ params: { campaignId: table }, query: {} }),
    );
    expect(listed.items.find((row) => row.id === hettie)?.links).toEqual(expected);
    // A PATCH answers the links as they stand, too.
    const patched = await as(jo.token, (client) =>
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
  });

  it("is idempotent both ways, and removes exactly the link it names", async () => {
    const noteId = await note("The ferryman's price");
    const add = () =>
      as(jo.token, (client) =>
        client.notes.addLink({
          params: { campaignId: table, noteId },
          payload: { kind: "seat", id: joSeat },
        }),
      );
    await add();
    const again = await add();
    expect(again.links).toEqual([{ kind: "seat", id: joSeat }]);
    expect(await linkRows(noteId)).toBe(1);

    await as(jo.token, (client) =>
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
    expect((await remove()).links).toEqual([{ kind: "encounter", id: ambush }]);
    expect((await remove()).links).toEqual([{ kind: "encounter", id: ambush }]);

    // The kind is part of the key: an encounter id named as a seat removes
    // nothing.
    const wrongKind = await as(jo.token, (client) =>
      client.notes.removeLink({
        params: { campaignId: table, noteId, kind: "seat", targetId: ambush },
      }),
    );
    expect(wrongKind.links).toEqual([{ kind: "encounter", id: ambush }]);
  });

  it("refuses a target in another campaign, a retired seat and a stranger's id", async () => {
    const noteId = await note("Loose ends");
    const bodies = [
      { kind: "encounter", id: otherEncounter },
      { kind: "seat", id: otherSeat },
      // An encounter's id named as a seat, and a seat's as an encounter.
      { kind: "seat", id: ambush },
      { kind: "encounter", id: ilseSeat },
      { kind: "encounter", id: crypto.randomUUID() },
    ];
    for (const body of bodies) {
      const answer = await wire(jo.token, "POST", linksPath(noteId), body);
      expect({ body, status: answer.status }).toEqual({ body, status: 404 });
    }

    // The note in the path is checked against the campaign in the path.
    const crossed = await wire(jo.token, "POST", linksPath(noteId, elsewhere), {
      kind: "encounter",
      id: otherEncounter,
    });
    expect(crossed.status).toBe(404);

    // A seat whose character has left: no chip could open its page.
    const leaving = (await run(aCharacterAt(table, jo.actor, { name: "Old Tam" }))).seatId;
    await as(jo.token, (client) =>
      client.party.leave({ params: { campaignId: table, campaignCharacterId: leaving } }),
    );
    const retired = await wire(jo.token, "POST", linksPath(noteId), { kind: "seat", id: leaving });
    expect(retired.status).toBe(404);

    expect(await linkRows(noteId)).toBe(0);
  });

  it("is a key, not a check: the table refuses a link across campaigns", async () => {
    const refused = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`
          insert into note_link (note_id, campaign_id, encounter_id)
          values (${hettie}, ${table}, ${otherEncounter})
        `,
      ).pipe(Effect.flip, Effect.map(causes)),
    );
    expect(refused).toContain("note_link_encounter_fkey");
  });
});

describe("the link endpoints, to anybody but the creator", () => {
  it("are NotFound for a seated player and a stranger, and write nothing", async () => {
    await as(jo.token, (client) =>
      client.notes.addLink({
        params: { campaignId: table, noteId: shared },
        payload: { kind: "encounter", id: ambush },
      }),
    );
    for (const who of [ilse, stranger]) {
      const added = await wire(who.token, "POST", linksPath(shared), {
        kind: "seat",
        id: ilseSeat,
      });
      expect(added.status).toBe(404);
      const removed = await wire(who.token, "DELETE", `${linksPath(shared)}/encounter/${ambush}`);
      expect(removed.status).toBe(404);
      expect(removed.body).not.toContain("House rule");
    }
    expect(await linkRows(shared)).toBe(1);
  });
});

describe("a player's reads of a linked note", () => {
  it("carry no links, and name no linked encounter or seat", async () => {
    const listed = await wire(ilse.token, "GET", `/campaigns/${table}/player-notes`);
    expect(listed.status).toBe(200);
    expect(listed.body).toContain("House rule");
    expect(listed.body).not.toContain('"links"');
    expect(listed.body).not.toContain(ambush);
  });
});

describe("deleting what a note is linked to", () => {
  it("loses the link and keeps the note", async () => {
    const noteId = await note("What the reeds hide");
    const doomed = await encounter(table, "A fight that never happens");
    await as(jo.token, (client) =>
      client.notes.addLink({
        params: { campaignId: table, noteId },
        payload: { kind: "encounter", id: doomed },
      }),
    );
    await as(jo.token, (client) =>
      client.notes.addLink({
        params: { campaignId: table, noteId },
        payload: { kind: "encounter", id: ford },
      }),
    );

    await as(jo.token, (client) =>
      client.encounters.remove({ params: { campaignId: table, encounterId: doomed } }),
    );

    const after = await as(jo.token, (client) =>
      client.notes.findById({ params: { campaignId: table, noteId } }),
    );
    expect(after.title).toBe("What the reeds hide");
    expect(after.links).toEqual([{ kind: "encounter", id: ford }]);
  });

  it("goes with the note when the note is deleted", async () => {
    const noteId = await note("Scrap");
    await as(jo.token, (client) =>
      client.notes.addLink({
        params: { campaignId: table, noteId },
        payload: { kind: "seat", id: ilseSeat },
      }),
    );
    await as(jo.token, (client) => client.notes.remove({ params: { campaignId: table, noteId } }));
    expect(await linkRows(noteId)).toBe(0);
  });
});
