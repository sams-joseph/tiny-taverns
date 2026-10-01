import { describe, expect } from "@effect/vitest";
import { CurrentActor, type Note, type NoteId, TavernsApi } from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { applicationOver, servicesOver } from "../src/app.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { aPerson, admittedTo, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

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
const wire = (token: string, request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(request.pipe(HttpClientRequest.bearerToken(token)));
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const wren = yield* aPerson("Wren");
  const stranger = yield* aPerson("Bo");
  const campaign = yield* as(jo.token, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  );
  const table = campaign.id;
  yield* admittedTo(table, ilse.actor, "Ilse");

  // Another table in the same Shared World, with Wren playing at it.
  const otherTable = yield* Effect.provideService(
    Effect.flatMap(Campaigns, (campaigns) =>
      campaigns.create(campaign.contextId, { name: "Rook's Rest", visibility: "shared" }),
    ),
    CurrentActor,
    jo.actor,
  );
  yield* admittedTo(otherTable.id, wren.actor, "Wren");
  return { jo, ilse, wren, stranger, table };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "note-category-pin.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const notesPath = Effect.map(Fixture, ({ table }) => `/campaigns/${table}/notes`);

const find = (noteId: NoteId) =>
  Effect.flatMap(Fixture, ({ jo, table }) =>
    as(jo.token, (client) => client.notes.findById({ params: { campaignId: table, noteId } })),
  );

const pin = (noteId: NoteId) =>
  Effect.flatMap(Fixture, ({ jo, table }) =>
    as(jo.token, (client) => client.notes.pin({ params: { campaignId: table, noteId } })),
  );

const unpin = (noteId: NoteId) =>
  Effect.flatMap(Fixture, ({ jo, table }) =>
    as(jo.token, (client) => client.notes.unpin({ params: { campaignId: table, noteId } })),
  );

const millis = (note: Note) => DateTime.toEpochMillis(note.updatedAt);

describeLayer("note-category-pin", shared, (it) => {
  describe("the category", () => {
    it.effect("is null until chosen, and a note keeps it through edits that do not name it", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const plain = yield* as(jo.token, (client) =>
          client.notes.create({ params: { campaignId: table }, payload: { title: "Loose end" } }),
        );
        expect(plain.category).toBeNull();

        const ferryman = yield* as(jo.token, (client) =>
          client.notes.create({
            params: { campaignId: table },
            payload: { title: "Cazril", kind: "read_aloud", category: "npc" },
          }),
        );
        // Independent of the register: a read-aloud about an NPC.
        expect(ferryman).toMatchObject({ category: "npc", kind: "read_aloud" });

        const retitled = yield* as(jo.token, (client) =>
          client.notes.update({
            params: { campaignId: table, noteId: ferryman.id },
            payload: { title: "Cazril the ferryman" },
          }),
        );
        expect(retitled.category).toBe("npc");

        const moved = yield* as(jo.token, (client) =>
          client.notes.update({
            params: { campaignId: table, noteId: ferryman.id },
            payload: { category: "lore" },
          }),
        );
        expect(moved.category).toBe("lore");

        const cleared = yield* as(jo.token, (client) =>
          client.notes.update({
            params: { campaignId: table, noteId: ferryman.id },
            payload: { category: null },
          }),
        );
        expect(cleared.category).toBeNull();
        expect((yield* find(ferryman.id)).category).toBeNull();
      }),
    );

    it.effect("refuses a category that is not one of the five, on create and on update", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const created = yield* wire(
          jo.token,
          HttpClientRequest.post(yield* notesPath).pipe(
            HttpClientRequest.bodyJsonUnsafe({ title: "SENTINEL-MONSTER", category: "monster" }),
          ),
        );
        expect(created.status).toBe(400);

        const note = yield* as(jo.token, (client) =>
          client.notes.create({
            params: { campaignId: table },
            payload: { title: "House rule", category: "rules" },
          }),
        );
        const updated = yield* wire(
          jo.token,
          HttpClientRequest.patch(`${yield* notesPath}/${note.id}`).pipe(
            HttpClientRequest.bodyJsonUnsafe({ category: "Rules" }),
          ),
        );
        expect(updated.status).toBe(400);
        expect((yield* find(note.id)).category).toBe("rules");

        const listed = yield* as(jo.token, (client) =>
          client.notes.list({ params: { campaignId: table }, query: {} }),
        );
        expect(listed.items.map((row) => row.title)).not.toContain("SENTINEL-MONSTER");
      }),
    );
  });

  describe("the pin", () => {
    it.effect("pins and unpins without touching updatedAt, and both are idempotent", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const note = yield* as(jo.token, (client) =>
          client.notes.create({ params: { campaignId: table }, payload: { title: "Grusk" } }),
        );
        expect(note.pinnedAt).toBeNull();

        const pinned = yield* pin(note.id);
        expect(pinned.pinnedAt).not.toBeNull();
        expect(millis(pinned)).toBe(millis(note));

        // Pinning a pinned note keeps the time it was first pinned.
        const again = yield* pin(note.id);
        expect(again.pinnedAt).toEqual(pinned.pinnedAt);
        expect(millis(again)).toBe(millis(note));

        // An edit is an edit: it moves `updatedAt` and leaves the pin alone.
        const edited = yield* as(jo.token, (client) =>
          client.notes.update({
            params: { campaignId: table, noteId: note.id },
            payload: { body: "Speaks only in questions." },
          }),
        );
        expect(millis(edited)).toBeGreaterThan(millis(note));
        expect(edited.pinnedAt).toEqual(pinned.pinnedAt);

        const unpinned = yield* unpin(note.id);
        expect(unpinned.pinnedAt).toBeNull();
        expect(millis(unpinned)).toBe(millis(edited));
        const unpinnedAgain = yield* unpin(note.id);
        expect(unpinnedAgain.pinnedAt).toBeNull();
        expect(millis(unpinnedAgain)).toBe(millis(edited));
      }),
    );

    it.effect("is NotFound for a note that is not there", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const notes = yield* notesPath;
        const note = yield* as(jo.token, (client) =>
          client.notes.create({ params: { campaignId: table }, payload: { title: "Brief" } }),
        );
        yield* as(jo.token, (client) =>
          client.notes.remove({ params: { campaignId: table, noteId: note.id } }),
        );
        for (const request of [
          HttpClientRequest.put(`${notes}/${note.id}/pin`),
          HttpClientRequest.delete(`${notes}/${note.id}/pin`),
        ]) {
          expect((yield* wire(jo.token, request)).status).toBe(404);
        }
      }),
    );

    it.effect(
      "is refused to a seated player, a Shared World member and a stranger, shared note or not",
      () =>
        Effect.gen(function* () {
          const { jo, ilse, wren, stranger, table } = yield* Fixture;
          const notes = yield* notesPath;
          const shared = yield* as(jo.token, (client) =>
            client.notes.create({
              params: { campaignId: table },
              payload: { title: "SENTINEL-SHARED", visibility: "shared" },
            }),
          );
          const kept = yield* as(jo.token, (client) =>
            client.notes.create({
              params: { campaignId: table },
              payload: { title: "SENTINEL-KEPT" },
            }),
          );
          const pinnedShared = yield* pin(shared.id);

          for (const who of [ilse, wren, stranger]) {
            for (const noteId of [shared.id, kept.id]) {
              for (const request of [
                HttpClientRequest.put(`${notes}/${noteId}/pin`),
                HttpClientRequest.delete(`${notes}/${noteId}/pin`),
              ]) {
                const answer = yield* wire(who.token, request);
                expect({ url: request.url, status: answer.status }).toEqual({
                  url: request.url,
                  status: 404,
                });
                expect(answer.body).not.toContain("SENTINEL");
              }
            }
          }

          // Nothing moved.
          expect((yield* find(shared.id)).pinnedAt).toEqual(pinnedShared.pinnedAt);
          expect((yield* find(kept.id)).pinnedAt).toBeNull();
        }),
    );
  });

  describe("a seated player's read", () => {
    it.effect("carries a shared note's category and never its pin", () =>
      Effect.gen(function* () {
        const { jo, ilse, table } = yield* Fixture;
        const note = yield* as(jo.token, (client) =>
          client.notes.create({
            params: { campaignId: table },
            payload: { title: "The salt flats", category: "place", visibility: "shared" },
          }),
        );
        yield* pin(note.id);

        const listed = yield* wire(
          ilse.token,
          HttpClientRequest.get(`/campaigns/${table}/player-notes`),
        );
        expect(listed.status).toBe(200);
        expect(listed.body).not.toContain('"pinnedAt"');

        const decoded = yield* as(ilse.token, (client) =>
          client.playerNotes.list({ params: { campaignId: table }, query: {} }),
        );
        expect(decoded.items.find((row) => row.id === note.id)?.category).toBe("place");
      }),
    );
  });
});
