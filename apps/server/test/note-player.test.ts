import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  CurrentActor,
  type EncounterId,
  type NoteCreate,
  type NoteId,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { admittedTo, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **What a player is told about a note: the shared ones, as `PlayerNote`, and
 * nothing of the creator's working record.**
 *
 * Over the real application and Postgres. The creator's `notes` reads are
 * refused to everybody else, shared note or not; a player reads
 * `playerNotes`, which has no visibility or provenance and names an attached
 * encounter only when the player may read that encounter (Shared and Ready).
 * The wire is read raw wherever a leak is the question, because the derived
 * client decodes into the narrow class and would drop a field the server
 * should never have sent.
 *
 * The people are minted the shipped way: a player admitted through a real
 * invitation, and a member of the table's Shared World who plays at another
 * table in it.
 */
const database = migratedDatabase("taverns_test_note_player");
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

/** A GET as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, path: string) =>
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

/**
 * Every JSON key of `Note` that `PlayerNote` does not have. Keys, not values:
 * `"dm"` or `"authored"` could turn up inside a body.
 */
const WIDE_KEYS = ['"visibility"', '"origin"', '"assistantTurnId"', '"createdAt"'];

let jo: Person;
let ilse: Person;
let wren: Person;
let stranger: Person;
let table: CampaignId;
let closedTable: CampaignId;
let ambush: EncounterId;
let draft: EncounterId;
let kept: EncounterId;
let secret: NoteId;
let readAloud: NoteId;
let onDraft: NoteId;
let onKept: NoteId;
let loose: NoteId;

const note = (campaignId: CampaignId, payload: NoteCreate) =>
  as(jo.token, (client) => client.notes.create({ params: { campaignId }, payload })).then(
    (made) => made.id,
  );

const encounter = (name: string, payload: { visibility?: "shared"; ready?: boolean }) =>
  as(jo.token, (client) =>
    client.encounters.create({ params: { campaignId: table }, payload: { name, ...payload } }),
  ).then((made) => made.id);

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  wren = await person("Wren");
  stranger = await person("Bo");
  // In a Shared World of Jo's, so a second table can be made in it.
  const campaign = await as(jo.token, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  );
  table = campaign.id;
  await run(admittedTo(table, ilse.actor, "Ilse"));

  // Another table in the same Shared World, with Wren playing at it.
  const otherTable = await run(
    Effect.provideService(
      Effect.flatMap(Campaigns, (campaigns) =>
        campaigns.create(campaign.contextId, { name: "Rook's Rest", visibility: "shared" }),
      ),
      CurrentActor,
      jo.actor,
    ),
  );
  await run(admittedTo(otherTable.id, wren.actor, "Wren"));

  // Three encounters, of which a player may read one: Shared and Ready. A
  // shared draft and a kept encounter are the DM's.
  ambush = await encounter("Ambush in the reeds", { visibility: "shared", ready: true });
  draft = await encounter("A shared draft", { visibility: "shared" });
  kept = await encounter("A kept fight", { ready: true });

  secret = await note(table, { title: "SENTINEL-SECRET", body: "SENTINEL-BODY" });
  readAloud = await note(table, {
    title: "At the water",
    body: "The reeds part.",
    kind: "read_aloud",
    attachedTo: { kind: "encounter", id: ambush },
    visibility: "shared",
  });
  onDraft = await note(table, {
    title: "Before the draft",
    kind: "read_aloud",
    attachedTo: { kind: "encounter", id: draft },
    visibility: "shared",
  });
  onKept = await note(table, {
    title: "Before the kept fight",
    kind: "read_aloud",
    attachedTo: { kind: "encounter", id: kept },
    visibility: "shared",
  });
  loose = await note(table, { title: "House rule", body: "Flanking.", visibility: "shared" });

  // A table the player sits at whose DM has since stopped sharing it: its
  // shared note must stay out of reach anyway.
  const closed = await as(jo.token, (client) =>
    campaignVia(client, { name: "The Hag's Bargain", visibility: "shared" }),
  );
  closedTable = closed.id;
  await run(admittedTo(closedTable, ilse.actor, "Ilse"));
  await note(closedTable, { title: "SENTINEL-CLOSED", visibility: "shared" });
  await as(jo.token, (client) =>
    client.campaigns.update({
      params: { campaignId: closedTable },
      payload: { visibility: "dm" },
    }),
  );
}, 60_000);

describe("the creator's reads", () => {
  it("are unchanged: every note, with its visibility and attachment", async () => {
    const page = await as(jo.token, (client) =>
      client.notes.list({ params: { campaignId: table }, query: {} }),
    );
    expect(page.items.map((row) => row.id)).toEqual([secret, readAloud, onDraft, onKept, loose]);
    expect(page.items[0]).toMatchObject({ visibility: "dm", origin: "authored" });
    expect(page.items.find((row) => row.id === onKept)?.attachedTo).toEqual({
      kind: "encounter",
      id: kept,
    });

    const found = await as(jo.token, (client) =>
      client.notes.findById({ params: { campaignId: table, noteId: secret } }),
    );
    expect(found.title).toBe("SENTINEL-SECRET");
  });
});

describe("the wide reads, to anybody but the creator", () => {
  it("are NotFound for a seated player, a Shared World member and a stranger, shared or not", async () => {
    const paths = [
      `/campaigns/${table}/notes`,
      `/campaigns/${table}/notes/${secret}`,
      `/campaigns/${table}/notes/${loose}`,
    ];
    for (const who of [ilse, wren, stranger]) {
      for (const path of paths) {
        const answer = await wire(who.token, path);
        expect({ path, status: answer.status }).toEqual({ path, status: 404 });
        expect(answer.body).not.toContain("SENTINEL");
      }
    }
  });
});

describe("a seated player's read", () => {
  it("lists the shared notes only, with no wide field and no kept encounter", async () => {
    const listed = await wire(ilse.token, `/campaigns/${table}/player-notes`);
    expect(listed.status).toBe(200);
    for (const key of WIDE_KEYS) expect(listed.body).not.toContain(key);
    expect(listed.body).not.toContain("SENTINEL");
    // An encounter the player may not read is not named, not even by id.
    expect(listed.body).not.toContain(draft);
    expect(listed.body).not.toContain(kept);

    const decoded = await as(ilse.token, (client) =>
      client.playerNotes.list({ params: { campaignId: table }, query: {} }),
    );
    expect(decoded.items.map(({ id, kind, attachedTo }) => ({ id, kind, attachedTo }))).toEqual([
      { id: readAloud, kind: "read_aloud", attachedTo: { kind: "encounter", id: ambush } },
      { id: onDraft, kind: "read_aloud", attachedTo: null },
      { id: onKept, kind: "read_aloud", attachedTo: null },
      { id: loose, kind: "note", attachedTo: null },
    ]);
    expect(decoded.items[0]).toMatchObject({ title: "At the water", body: "The reeds part." });
  });

  it("pages the same way the creator's list does", async () => {
    const first = await as(ilse.token, (client) =>
      client.playerNotes.list({ params: { campaignId: table }, query: { limit: 3 } }),
    );
    expect(first.items.map((row) => row.id)).toEqual([readAloud, onDraft, onKept]);
    expect(first.nextCursor).not.toBeNull();
    const rest = await as(ilse.token, (client) =>
      client.playerNotes.list({
        params: { campaignId: table },
        query: { limit: 3, cursor: first.nextCursor! },
      }),
    );
    expect(rest.items.map((row) => row.id)).toEqual([loose]);
    expect(rest.nextCursor).toBeNull();
  });

  it("is NotFound at a table the DM has stopped sharing", async () => {
    for (const path of [
      `/campaigns/${closedTable}/player-notes`,
      `/campaigns/${closedTable}/notes`,
    ]) {
      const answer = await wire(ilse.token, path);
      expect({ path, status: answer.status }).toEqual({ path, status: 404 });
      expect(answer.body).not.toContain("SENTINEL");
    }
  });

  it("is NotFound for a Shared World member at another table, and for a stranger", async () => {
    for (const who of [wren, stranger]) {
      const answer = await wire(who.token, `/campaigns/${table}/player-notes`);
      expect(answer.status).toBe(404);
      expect(answer.body).not.toContain("SENTINEL");
    }
  });
});

describe("the creator calling the player's path", () => {
  it("gets the same narrow shape over every row they can read", async () => {
    const listed = await wire(jo.token, `/campaigns/${table}/player-notes`);
    expect(listed.status).toBe(200);
    for (const key of WIDE_KEYS) expect(listed.body).not.toContain(key);

    const decoded = await as(jo.token, (client) =>
      client.playerNotes.list({ params: { campaignId: table }, query: {} }),
    );
    expect(decoded.items.map((row) => row.id)).toEqual([secret, readAloud, onDraft, onKept, loose]);
  });
});
