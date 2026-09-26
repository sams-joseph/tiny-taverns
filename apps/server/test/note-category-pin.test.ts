import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  CurrentActor,
  type Note,
  type NoteId,
  TavernsApi,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { admittedTo, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **A note's category and its pin.**
 *
 * The category is what a note is about, optional and clearable; the pin is
 * its own reversible verb that never counts as an edit. Both are the DM's
 * working record: a player reads a shared note's category (it is what the
 * text is about) and never its pin.
 *
 * Over the real application and Postgres, with the people minted the shipped
 * way: a player admitted through a real invitation, and a member of the
 * table's Shared World who plays at another table in it.
 */
const database = migratedDatabase("taverns_test_note_category_pin");
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
const wire = (token: string, request: HttpClientRequest.HttpClientRequest) =>
  runtime.runPromise(
    Effect.gen(function* () {
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

let jo: Person;
let ilse: Person;
let wren: Person;
let stranger: Person;
let table: CampaignId;

const notesPath = () => `/campaigns/${table}/notes`;

const find = (noteId: NoteId) =>
  as(jo.token, (client) => client.notes.findById({ params: { campaignId: table, noteId } }));

const pin = (noteId: NoteId) =>
  as(jo.token, (client) => client.notes.pin({ params: { campaignId: table, noteId } }));

const unpin = (noteId: NoteId) =>
  as(jo.token, (client) => client.notes.unpin({ params: { campaignId: table, noteId } }));

const millis = (note: Note) => DateTime.toEpochMillis(note.updatedAt);

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  wren = await person("Wren");
  stranger = await person("Bo");
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
}, 60_000);

describe("the category", () => {
  it("is null until chosen, and a note keeps it through edits that do not name it", async () => {
    const plain = await as(jo.token, (client) =>
      client.notes.create({ params: { campaignId: table }, payload: { title: "Loose end" } }),
    );
    expect(plain.category).toBeNull();

    const ferryman = await as(jo.token, (client) =>
      client.notes.create({
        params: { campaignId: table },
        payload: { title: "Cazril", kind: "read_aloud", category: "npc" },
      }),
    );
    // Independent of the register: a read-aloud about an NPC.
    expect(ferryman).toMatchObject({ category: "npc", kind: "read_aloud" });

    const retitled = await as(jo.token, (client) =>
      client.notes.update({
        params: { campaignId: table, noteId: ferryman.id },
        payload: { title: "Cazril the ferryman" },
      }),
    );
    expect(retitled.category).toBe("npc");

    const moved = await as(jo.token, (client) =>
      client.notes.update({
        params: { campaignId: table, noteId: ferryman.id },
        payload: { category: "lore" },
      }),
    );
    expect(moved.category).toBe("lore");

    const cleared = await as(jo.token, (client) =>
      client.notes.update({
        params: { campaignId: table, noteId: ferryman.id },
        payload: { category: null },
      }),
    );
    expect(cleared.category).toBeNull();
    expect((await find(ferryman.id)).category).toBeNull();
  });

  it("refuses a category that is not one of the five, on create and on update", async () => {
    const created = await wire(
      jo.token,
      HttpClientRequest.post(notesPath()).pipe(
        HttpClientRequest.bodyJsonUnsafe({ title: "SENTINEL-MONSTER", category: "monster" }),
      ),
    );
    expect(created.status).toBe(400);

    const note = await as(jo.token, (client) =>
      client.notes.create({
        params: { campaignId: table },
        payload: { title: "House rule", category: "rules" },
      }),
    );
    const updated = await wire(
      jo.token,
      HttpClientRequest.patch(`${notesPath()}/${note.id}`).pipe(
        HttpClientRequest.bodyJsonUnsafe({ category: "Rules" }),
      ),
    );
    expect(updated.status).toBe(400);
    expect((await find(note.id)).category).toBe("rules");

    const listed = await as(jo.token, (client) =>
      client.notes.list({ params: { campaignId: table }, query: {} }),
    );
    expect(listed.items.map((row) => row.title)).not.toContain("SENTINEL-MONSTER");
  });
});

describe("the pin", () => {
  it("pins and unpins without touching updatedAt, and both are idempotent", async () => {
    const note = await as(jo.token, (client) =>
      client.notes.create({ params: { campaignId: table }, payload: { title: "Grusk" } }),
    );
    expect(note.pinnedAt).toBeNull();

    const pinned = await pin(note.id);
    expect(pinned.pinnedAt).not.toBeNull();
    expect(millis(pinned)).toBe(millis(note));

    // Pinning a pinned note keeps the time it was first pinned.
    const again = await pin(note.id);
    expect(again.pinnedAt).toEqual(pinned.pinnedAt);
    expect(millis(again)).toBe(millis(note));

    // An edit is an edit: it moves `updatedAt` and leaves the pin alone.
    const edited = await as(jo.token, (client) =>
      client.notes.update({
        params: { campaignId: table, noteId: note.id },
        payload: { body: "Speaks only in questions." },
      }),
    );
    expect(millis(edited)).toBeGreaterThan(millis(note));
    expect(edited.pinnedAt).toEqual(pinned.pinnedAt);

    const unpinned = await unpin(note.id);
    expect(unpinned.pinnedAt).toBeNull();
    expect(millis(unpinned)).toBe(millis(edited));
    const unpinnedAgain = await unpin(note.id);
    expect(unpinnedAgain.pinnedAt).toBeNull();
    expect(millis(unpinnedAgain)).toBe(millis(edited));
  });

  it("is NotFound for a note that is not there", async () => {
    const note = await as(jo.token, (client) =>
      client.notes.create({ params: { campaignId: table }, payload: { title: "Brief" } }),
    );
    await as(jo.token, (client) =>
      client.notes.remove({ params: { campaignId: table, noteId: note.id } }),
    );
    for (const request of [
      HttpClientRequest.put(`${notesPath()}/${note.id}/pin`),
      HttpClientRequest.delete(`${notesPath()}/${note.id}/pin`),
    ]) {
      expect((await wire(jo.token, request)).status).toBe(404);
    }
  });

  it("is refused to a seated player, a Shared World member and a stranger, shared note or not", async () => {
    const shared = await as(jo.token, (client) =>
      client.notes.create({
        params: { campaignId: table },
        payload: { title: "SENTINEL-SHARED", visibility: "shared" },
      }),
    );
    const kept = await as(jo.token, (client) =>
      client.notes.create({ params: { campaignId: table }, payload: { title: "SENTINEL-KEPT" } }),
    );
    const pinnedShared = await pin(shared.id);

    for (const who of [ilse, wren, stranger]) {
      for (const noteId of [shared.id, kept.id]) {
        for (const request of [
          HttpClientRequest.put(`${notesPath()}/${noteId}/pin`),
          HttpClientRequest.delete(`${notesPath()}/${noteId}/pin`),
        ]) {
          const answer = await wire(who.token, request);
          expect({ url: request.url, status: answer.status }).toEqual({
            url: request.url,
            status: 404,
          });
          expect(answer.body).not.toContain("SENTINEL");
        }
      }
    }

    // Nothing moved.
    expect((await find(shared.id)).pinnedAt).toEqual(pinnedShared.pinnedAt);
    expect((await find(kept.id)).pinnedAt).toBeNull();
  });
});

describe("a seated player's read", () => {
  it("carries a shared note's category and never its pin", async () => {
    const note = await as(jo.token, (client) =>
      client.notes.create({
        params: { campaignId: table },
        payload: { title: "The salt flats", category: "place", visibility: "shared" },
      }),
    );
    await pin(note.id);

    const listed = await wire(
      ilse.token,
      HttpClientRequest.get(`/campaigns/${table}/player-notes`),
    );
    expect(listed.status).toBe(200);
    expect(listed.body).not.toContain('"pinnedAt"');

    const decoded = await as(ilse.token, (client) =>
      client.playerNotes.list({ params: { campaignId: table }, query: {} }),
    );
    expect(decoded.items.find((row) => row.id === note.id)?.category).toBe("place");
  });
});
