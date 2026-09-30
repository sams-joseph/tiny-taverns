import { describe, expect } from "@effect/vitest";
import { type CampaignId, CurrentActor, type NoteCreate, TavernsApi } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { applicationOver, servicesOver } from "../src/app.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { type Person, aPerson, admittedTo, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

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

const as = <A, E>(who: Person, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(who.token), call).pipe(Effect.orDie);

/** A GET as it goes over the wire: the status and the body, undecoded. */
const wire = (who: Person, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(who.token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

/**
 * Every JSON key of `Note` that `PlayerNote` does not have. Keys, not values:
 * `"dm"` or `"authored"` could turn up inside a body.
 */
const WIDE_KEYS = ['"visibility"', '"origin"', '"assistantTurnId"', '"createdAt"', '"pinnedAt"'];

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const wren = yield* aPerson("Wren");
  const stranger = yield* aPerson("Bo");

  const note = (campaignId: CampaignId, payload: NoteCreate) =>
    as(jo, (client) => client.notes.create({ params: { campaignId }, payload })).pipe(
      Effect.map((made) => made.id),
    );

  // In a Shared World of Jo's, so a second table can be made in it.
  const campaign = yield* as(jo, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  );
  const table = campaign.id;
  yield* admittedTo(table, ilse.actor, "Ilse");

  const encounter = (name: string, payload: { visibility?: "shared"; ready?: boolean }) =>
    as(jo, (client) =>
      client.encounters.create({ params: { campaignId: table }, payload: { name, ...payload } }),
    ).pipe(Effect.map((made) => made.id));

  // Another table in the same Shared World, with Wren playing at it.
  const campaigns = yield* Campaigns;
  const otherTable = yield* Effect.provideService(
    campaigns.create(campaign.contextId, { name: "Rook's Rest", visibility: "shared" }),
    CurrentActor,
    jo.actor,
  ).pipe(Effect.orDie);
  yield* admittedTo(otherTable.id, wren.actor, "Wren");

  // Three encounters, of which a player may read one: Shared and Ready. A
  // shared draft and a kept encounter are the DM's.
  const ambush = yield* encounter("Ambush in the reeds", { visibility: "shared", ready: true });
  const draft = yield* encounter("A shared draft", { visibility: "shared" });
  const kept = yield* encounter("A kept fight", { ready: true });

  const secret = yield* note(table, { title: "SENTINEL-SECRET", body: "SENTINEL-BODY" });
  const readAloud = yield* note(table, {
    title: "At the water",
    body: "The reeds part.",
    kind: "read_aloud",
    attachedTo: { kind: "encounter", id: ambush },
    visibility: "shared",
  });
  const onDraft = yield* note(table, {
    title: "Before the draft",
    kind: "read_aloud",
    attachedTo: { kind: "encounter", id: draft },
    visibility: "shared",
  });
  const onKept = yield* note(table, {
    title: "Before the kept fight",
    kind: "read_aloud",
    attachedTo: { kind: "encounter", id: kept },
    visibility: "shared",
  });
  const loose = yield* note(table, {
    title: "House rule",
    body: "Flanking.",
    visibility: "shared",
  });

  // A table the player sits at whose DM has since stopped sharing it: its
  // shared note must stay out of reach anyway.
  const closed = yield* as(jo, (client) =>
    campaignVia(client, { name: "The Hag's Bargain", visibility: "shared" }),
  );
  const closedTable = closed.id;
  yield* admittedTo(closedTable, ilse.actor, "Ilse");
  yield* note(closedTable, { title: "SENTINEL-CLOSED", visibility: "shared" });
  yield* as(jo, (client) =>
    client.campaigns.update({
      params: { campaignId: closedTable },
      payload: { visibility: "dm" },
    }),
  );

  return {
    jo,
    ilse,
    wren,
    stranger,
    table,
    closedTable,
    ambush,
    draft,
    kept,
    secret,
    readAloud,
    onDraft,
    onKept,
    loose,
  };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "note-player.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describeLayer("note-player", shared, (it) => {
  describe("the creator's reads", () => {
    it.effect("are unchanged: every note, with its visibility and attachment", () =>
      Effect.gen(function* () {
        const { jo, table, secret, readAloud, onDraft, onKept, loose, kept } = yield* Fixture;
        const page = yield* as(jo, (client) =>
          client.notes.list({ params: { campaignId: table }, query: {} }),
        );
        expect(page.items.map((row) => row.id)).toEqual([
          secret,
          readAloud,
          onDraft,
          onKept,
          loose,
        ]);
        expect(page.items[0]).toMatchObject({ visibility: "dm", origin: "authored" });
        expect(page.items.find((row) => row.id === onKept)?.attachedTo).toEqual({
          kind: "encounter",
          id: kept,
        });

        const found = yield* as(jo, (client) =>
          client.notes.findById({ params: { campaignId: table, noteId: secret } }),
        );
        expect(found.title).toBe("SENTINEL-SECRET");
      }),
    );
  });

  describe("the wide reads, to anybody but the creator", () => {
    it.effect(
      "are NotFound for a seated player, a Shared World member and a stranger, shared or not",
      () =>
        Effect.gen(function* () {
          const { ilse, wren, stranger, table, secret, loose } = yield* Fixture;
          const paths = [
            `/campaigns/${table}/notes`,
            `/campaigns/${table}/notes/${secret}`,
            `/campaigns/${table}/notes/${loose}`,
          ];
          for (const who of [ilse, wren, stranger]) {
            for (const path of paths) {
              const answer = yield* wire(who, path);
              expect({ path, status: answer.status }).toEqual({ path, status: 404 });
              expect(answer.body).not.toContain("SENTINEL");
            }
          }
        }),
    );
  });

  describe("a seated player's read", () => {
    it.effect("lists the shared notes only, with no wide field and no kept encounter", () =>
      Effect.gen(function* () {
        const { ilse, table, draft, kept, ambush, readAloud, onDraft, onKept, loose } =
          yield* Fixture;
        const listed = yield* wire(ilse, `/campaigns/${table}/player-notes`);
        expect(listed.status).toBe(200);
        for (const key of WIDE_KEYS) expect(listed.body).not.toContain(key);
        expect(listed.body).not.toContain("SENTINEL");
        // An encounter the player may not read is not named, not even by id.
        expect(listed.body).not.toContain(draft);
        expect(listed.body).not.toContain(kept);

        const decoded = yield* as(ilse, (client) =>
          client.playerNotes.list({ params: { campaignId: table }, query: {} }),
        );
        expect(decoded.items.map(({ id, kind, attachedTo }) => ({ id, kind, attachedTo }))).toEqual(
          [
            { id: readAloud, kind: "read_aloud", attachedTo: { kind: "encounter", id: ambush } },
            { id: onDraft, kind: "read_aloud", attachedTo: null },
            { id: onKept, kind: "read_aloud", attachedTo: null },
            { id: loose, kind: "note", attachedTo: null },
          ],
        );
        expect(decoded.items[0]).toMatchObject({ title: "At the water", body: "The reeds part." });
      }),
    );

    it.effect("pages the same way the creator's list does", () =>
      Effect.gen(function* () {
        const { ilse, table, readAloud, onDraft, onKept, loose } = yield* Fixture;
        const first = yield* as(ilse, (client) =>
          client.playerNotes.list({ params: { campaignId: table }, query: { limit: 3 } }),
        );
        expect(first.items.map((row) => row.id)).toEqual([readAloud, onDraft, onKept]);
        expect(first.nextCursor).not.toBeNull();
        const rest = yield* as(ilse, (client) =>
          client.playerNotes.list({
            params: { campaignId: table },
            query: { limit: 3, cursor: first.nextCursor! },
          }),
        );
        expect(rest.items.map((row) => row.id)).toEqual([loose]);
        expect(rest.nextCursor).toBeNull();
      }),
    );

    it.effect("is NotFound at a table the DM has stopped sharing", () =>
      Effect.gen(function* () {
        const { ilse, closedTable } = yield* Fixture;
        for (const path of [
          `/campaigns/${closedTable}/player-notes`,
          `/campaigns/${closedTable}/notes`,
        ]) {
          const answer = yield* wire(ilse, path);
          expect({ path, status: answer.status }).toEqual({ path, status: 404 });
          expect(answer.body).not.toContain("SENTINEL");
        }
      }),
    );

    it.effect("is NotFound for a Shared World member at another table, and for a stranger", () =>
      Effect.gen(function* () {
        const { wren, stranger, table } = yield* Fixture;
        for (const who of [wren, stranger]) {
          const answer = yield* wire(who, `/campaigns/${table}/player-notes`);
          expect(answer.status).toBe(404);
          expect(answer.body).not.toContain("SENTINEL");
        }
      }),
    );
  });

  describe("the creator calling the player's path", () => {
    it.effect("gets the same narrow shape over every row they can read", () =>
      Effect.gen(function* () {
        const { jo, table, secret, readAloud, onDraft, onKept, loose } = yield* Fixture;
        const listed = yield* wire(jo, `/campaigns/${table}/player-notes`);
        expect(listed.status).toBe(200);
        for (const key of WIDE_KEYS) expect(listed.body).not.toContain(key);

        const decoded = yield* as(jo, (client) =>
          client.playerNotes.list({ params: { campaignId: table }, query: {} }),
        );
        expect(decoded.items.map((row) => row.id)).toEqual([
          secret,
          readAloud,
          onDraft,
          onKept,
          loose,
        ]);
      }),
    );
  });
});
