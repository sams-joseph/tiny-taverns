import { NodeHttpServer } from "@effect/platform-node";
import { CampaignId, TavernsApi } from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemCreatures } from "../src/bestiary/import.js";
import { campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The real application — the same `servicesOver`/`applicationOver` that
 * `main.ts` uses — over a throwaway database and an in-process server.
 *
 * Everything here goes through `HttpApiClient.make(TavernsApi)`, the client
 * *derived from the declaration the server implements*. That is the property
 * worth testing: if a payload, a param or a response shape drifts, this file
 * stops compiling rather than failing at runtime in the browser.
 */
const database = migratedDatabase("taverns_test_api");
const services = servicesOver(database);

/**
 * `database` is merged in as well as provided, so this file can load the
 * bundled bestiary the way an operator does — `importSystemCreatures` is
 * deliberately not an endpoint, so there is no way to reach it through the
 * client. `Layer` memoises by identity, so this is still one pool and one
 * migration run.
 */
const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
    Layer.provideMerge(database),
  ),
);
afterAll(() => runtime.dispose());

/** A client that presents the DM's bearer token on every request. */
const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });

const anonymous = HttpApiClient.make(TavernsApi);

let token: string;

beforeAll(async () => {
  token = await runtime.runPromise(
    Effect.flatMap(Accounts, (accounts) => accounts.issue("Jo")).pipe(
      Effect.map((issued) => issued.token),
      Effect.orDie,
    ),
  );
  await runtime.runPromise(importSystemCreatures().pipe(Effect.orDie));
}, 60_000);

describe("GET /health", () => {
  it("answers without a token, and decodes as HealthStatus", async () => {
    const status = await runtime.runPromise(
      Effect.flatMap(anonymous, (client) => client.health.check()).pipe(Effect.orDie),
    );

    expect(status.status).toBe("ok");
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });
});

describe("authorization", () => {
  it("rejects a request with no bearer token", async () => {
    // `HttpApiSecurity.bearer` answers no 401 of its own — it hands the
    // middleware an empty credential and runs it anyway. This passes because
    // `Authorization` rejects the empty credential explicitly.
    const result = await runtime.runPromise(
      Effect.flatMap(anonymous, (client) => client.campaigns.list()).pipe(Effect.result),
    );

    expect(result._tag).toBe("Failure");
  });

  it("rejects a well-formed token that resolves to nothing", async () => {
    const result = await runtime.runPromise(
      Effect.flatMap(clientFor("not-a-real-token"), (client) => client.campaigns.list()).pipe(
        Effect.result,
      ),
    );

    expect(result._tag).toBe("Failure");
  });
});

describe("campaign, session, character and note CRUD", () => {
  it("creates a campaign directly with its private group in one request", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* client.campaigns.create({
          payload: { name: "The Direct Road", playerCount: 3 },
        });
        const groups = yield* client.groups.list();
        const memberships = yield* client.me.campaigns();
        return { campaign, groups, memberships };
      }).pipe(Effect.orDie),
    );

    expect(seen.campaign.name).toBe("The Direct Road");
    expect(seen.campaign.playerCount).toBe(3);
    expect(seen.groups.find((row) => row.group.id === seen.campaign.groupId)?.group.name).toBe(
      "The Direct Road",
    );
    expect(seen.memberships.find((row) => row.campaign.id === seen.campaign.id)?.relation).toBe(
      "creator",
    );
  });

  it("round-trips a campaign and everything hanging off it", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);

        const campaign = yield* campaignVia(client, {
          name: "The Reed Marches",
          partyName: "The Ferrymen",
          playerCount: 4,
        });
        const campaignId = campaign.id;

        const note = yield* client.notes.create({
          params: { campaignId },
          payload: { title: "The crate", body: "Decide what the crate contains" },
        });
        const session = yield* client.sessions.create({
          params: { campaignId },
          payload: { number: 12, title: "The ford" },
        });
        // A character is account-owned now and written through `me` — the
        // campaign in the path is where its seat goes, in the same
        // transaction. The campaign side of it is a party seat.
        const character = yield* client.me.createCharacter({
          params: { campaignId },
          payload: {
            name: "Ilse",
            playerName: "Sam",
            level: 3,
            race: "Half-orc",
            className: "Paladin",
            ac: 17,
            hpMax: 21,
          },
        });
        yield* client.party.join({
          params: { campaignId },
          payload: { characterId: character.id },
        });
        const party = yield* client.party.list({ params: { campaignId } });

        const readBack = yield* client.notes.findById({ params: { campaignId, noteId: note.id } });
        const listed = yield* client.campaigns.list();

        return { campaign, note, session, character, party, readBack, listed };
      }).pipe(Effect.orDie),
    );

    expect(seen.campaign.name).toBe("The Reed Marches");
    expect(seen.campaign.playerCount).toBe(4);
    // Nothing asked for a visibility, so the column default decided.
    expect(seen.campaign.visibility).toBe("dm");
    expect(seen.note.visibility).toBe("dm");
    expect(seen.note.kind).toBe("note");
    expect(seen.session.number).toBe(12);
    // Derived by the generated column from the three that were sent, and
    // writable through none of them — see `0012_character_sheet.ts`.
    expect(seen.character.descriptor).toBe("Level 3 Half-orc Paladin");
    // The explicit party join's seat, with the display name snapshotted from
    // the character at join time.
    expect(seen.party.map((row) => row.character?.id)).toContain(seen.character.id);
    expect(
      seen.party.find((row) => row.character?.id === seen.character.id)?.seat.displayName,
    ).toBe("Ilse");
    expect(seen.readBack.body).toBe("Decide what the crate contains");
    expect(seen.listed.map((campaign) => campaign.id)).toContain(seen.campaign.id);

    // Provenance is inert but present from the first row written.
    expect(seen.note.origin).toBe("authored");
    expect(seen.note.assistantTurnId).toBeNull();
  }, 60_000);

  it("updates and archives", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);

        const campaign = yield* campaignVia(client, { name: "The Hag's Bargain" });
        const campaignId = campaign.id;

        const renamed = yield* client.campaigns.update({
          params: { campaignId },
          payload: { name: "The Hag's Bargain (revised)", playerCount: 5 },
        });
        const archived = yield* client.campaigns.archive({ params: { campaignId } });
        const listed = yield* client.campaigns.list();

        return { renamed, archived, listed };
      }).pipe(Effect.orDie),
    );

    expect(seen.renamed.name).toBe("The Hag's Bargain (revised)");
    expect(seen.renamed.playerCount).toBe(5);
    expect(seen.archived.archivedAt).not.toBeNull();
    // Archived, not deleted: gone from the list, still in the database.
    expect(seen.listed.map((campaign) => campaign.id)).not.toContain(seen.archived.id);
  }, 60_000);

  /**
   * The round trip, over the wire the browser uses.
   *
   * **The shelf is which URL you asked for.** `GET /me/campaigns` answers the
   * live tables and `GET /me/campaigns/archived` the other ones, over one
   * repository method with one predicate — so what is worth pinning is that the
   * two are complements and that the *default* read never grew an archived row.
   */
  it("archives a campaign off the list, and restores it exactly where it was", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);

        const campaign = yield* campaignVia(client, { name: "The Long Winter" });
        const campaignId = campaign.id;
        // A night in progress, so the restore has something to be exact about.
        const session = yield* client.sessions.create({
          params: { campaignId },
          payload: { number: 1 },
        });
        yield* client.campaigns.update({
          params: { campaignId },
          payload: { currentSessionId: session.id },
        });
        const running = yield* client.campaigns.findById({ params: { campaignId } });

        const beforeLive = yield* client.me.campaigns();
        const beforeShelf = yield* client.me.archivedCampaigns();

        const archived = yield* client.campaigns.archive({ params: { campaignId } });
        const liveAfter = yield* client.me.campaigns();
        const shelfAfter = yield* client.me.archivedCampaigns();
        // Archiving is one column. The night it was in the middle of is still
        // open and still the campaign's current one — which is what makes the
        // restore below a restore rather than an approximation.
        const whileShelved = yield* client.campaigns.findById({ params: { campaignId } });

        const restored = yield* client.campaigns.restore({
          params: { campaignId },
          payload: {},
        });
        const liveBack = yield* client.me.campaigns();
        const shelfBack = yield* client.me.archivedCampaigns();
        // Idempotent: restoring one that is on the list is a no-op success, not
        // an error for pressing a button twice.
        const again = yield* client.campaigns.restore({
          params: { campaignId },
          payload: {},
        });

        return {
          campaignId,
          sessionId: session.id,
          running,
          beforeLive,
          beforeShelf,
          archived,
          liveAfter,
          shelfAfter,
          whileShelved,
          restored,
          liveBack,
          shelfBack,
          again,
        };
      }).pipe(Effect.orDie),
    );

    const ids = (rows: ReadonlyArray<{ readonly campaign: { readonly id: string } }>) =>
      rows.map((row) => row.campaign.id);

    // Before: on the live list, on no shelf.
    expect(ids(seen.beforeLive)).toContain(seen.campaignId);
    expect(ids(seen.beforeShelf)).not.toContain(seen.campaignId);
    expect(seen.running.currentSessionId).toBe(seen.sessionId);

    // Archived: it swaps lists, and the live read did not have to be asked for
    // anything to keep answering what it answered.
    expect(seen.archived.archivedAt).not.toBeNull();
    expect(ids(seen.liveAfter)).not.toContain(seen.campaignId);
    expect(ids(seen.shelfAfter)).toContain(seen.campaignId);
    // The role travels with it — it is the same membership read.
    expect(seen.shelfAfter.map((row) => row.relation)).toContain("creator");
    // Nothing else moved. Archiving did not end the night.
    expect(seen.whileShelved.currentSessionId).toBe(seen.sessionId);
    expect(seen.whileShelved.name).toBe("The Long Winter");

    // Restored: back where it was, current session and all.
    expect(seen.restored.archivedAt).toBeNull();
    expect(seen.restored.currentSessionId).toBe(seen.sessionId);
    expect(ids(seen.liveBack)).toContain(seen.campaignId);
    expect(ids(seen.shelfBack)).not.toContain(seen.campaignId);
    expect(seen.again.archivedAt).toBeNull();
  }, 60_000);

  /**
   * Somebody else's campaign, through both new endpoints.
   *
   * The shared guard is `campaignWritable`, the same one `update` and `archive`
   * already compose — but a guard that is assumed is one refactor from being
   * absent, so both directions are driven rather than argued.
   *
   * **The interesting refusal is the player's, not the stranger's.** A stranger
   * fails the read predicate as well, so it proves little; a real player member
   * of a `shared` campaign passes `campaignReadable` and reads the table
   * perfectly well. They must still not be able to shelve it or take it back
   * off the shelf, and this is the only test that says so.
   */
  it("refuses to archive or restore a campaign this account only sits at", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const dm = yield* clientFor(token);
        const campaign = yield* campaignVia(dm, { name: "Not Yours", visibility: "shared" });
        const campaignId = campaign.id;

        // A real player, through a real invitation — the only way this product
        // mints one, so the refusal is about a person who can exist.
        const accounts = yield* Accounts;
        const issued = yield* dm.invites.create({
          params: { groupId: campaign.groupId },
          payload: { label: "Pim", campaignId },
        });
        const player = yield* clientFor((yield* accounts.issue("Pim")).token);
        yield* player.join.redeem({ payload: { token: issued.token } });
        const stranger = yield* clientFor((yield* accounts.issue("Bo")).token);

        // They reach it: it is on their live list and they can read the row.
        const playersLive = yield* player.me.campaigns();

        const playerArchive = yield* Effect.result(
          player.campaigns.archive({ params: { campaignId } }),
        );
        const strangerArchive = yield* Effect.result(
          stranger.campaigns.archive({ params: { campaignId } }),
        );

        // Archived by its own DM, so the restores below are refused for being
        // somebody else's rather than for being un-archived.
        yield* dm.campaigns.archive({ params: { campaignId } });
        const playerRestore = yield* Effect.result(
          player.campaigns.restore({ params: { campaignId }, payload: {} }),
        );
        const strangerRestore = yield* Effect.result(
          stranger.campaigns.restore({ params: { campaignId }, payload: {} }),
        );

        // The shelf is the ordinary membership read, so a player's archived
        // table is on it — what they are refused is the way back, which is
        // `campaignWritable`'s question and not this list's. A stranger reaches
        // neither.
        const playersShelf = yield* player.me.archivedCampaigns();
        const strangersShelf = yield* stranger.me.archivedCampaigns();
        const stillArchived = yield* dm.campaigns.findById({ params: { campaignId } });

        return {
          campaignId,
          playersLive,
          playerArchive,
          strangerArchive,
          playerRestore,
          strangerRestore,
          playersShelf,
          strangersShelf,
          stillArchived,
        };
      }).pipe(Effect.orDie),
    );

    const tagOf = (result: {
      readonly _tag: string;
      readonly failure?: { readonly _tag: string };
    }) => (result._tag === "Failure" ? result.failure?._tag : "Success");

    // The player really is at the table.
    expect(seen.playersLive.map((row) => [row.campaign.id, row.relation])).toEqual([
      [seen.campaignId, "player"],
    ]);

    // `NotFound`, not `Forbidden`: saying it exists but is not yours is itself
    // a disclosure, which is the rule every refusal in this product follows.
    expect(tagOf(seen.playerArchive)).toBe("NotFound");
    expect(tagOf(seen.strangerArchive)).toBe("NotFound");
    expect(tagOf(seen.playerRestore)).toBe("NotFound");
    expect(tagOf(seen.strangerRestore)).toBe("NotFound");

    expect(seen.playersShelf.map((row) => row.campaign.id)).toEqual([seen.campaignId]);
    expect(seen.strangersShelf).toEqual([]);
    // Neither refused write changed anything.
    expect(seen.stillArchived.archivedAt).not.toBeNull();
  }, 60_000);

  it("deletes a note", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* campaignVia(client, { name: "Deletions" });
        const campaignId = campaign.id;
        const note = yield* client.notes.create({
          params: { campaignId },
          payload: { title: "temporary" },
        });

        yield* client.notes.remove({ params: { campaignId, noteId: note.id } });
        return yield* Effect.result(
          client.notes.findById({ params: { campaignId, noteId: note.id } }),
        );
      }).pipe(Effect.orDie),
    );

    expect(result._tag).toBe("Failure");
  }, 60_000);
});

describe("the prep surface", () => {
  it("round-trips an encounter, a prep item and an attached read-aloud", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);

        const campaign = yield* campaignVia(client, { name: "The Salt Road" });
        const campaignId = campaign.id;

        const encounter = yield* client.encounters.create({
          params: { campaignId },
          payload: {
            name: "Ambush in the reeds",
            difficulty: "Medium",
            tags: ["Marsh", "Night"],
          },
        });
        const session = yield* client.sessions.create({
          params: { campaignId },
          payload: { number: 12, title: "The ford" },
        });
        const item = yield* client.prep.create({
          params: { campaignId, sessionId: session.id },
          payload: { label: "Decide what the crate contains" },
        });
        const readAloud = yield* client.notes.create({
          params: { campaignId },
          payload: {
            title: "Read aloud at the water",
            body: "The reeds are taller than you are and they are not moving.",
            kind: "read_aloud",
            attachedTo: { kind: "encounter", id: encounter.id },
          },
        });

        const encounters = (yield* client.encounters.list({ params: { campaignId }, query: {} }))
          .items;
        const checklist = yield* client.prep.list({
          params: { campaignId, sessionId: session.id },
        });
        const noteBack = yield* client.notes.findById({
          params: { campaignId, noteId: readAloud.id },
        });
        const ticked = yield* client.prep.update({
          params: { campaignId, sessionId: session.id, prepItemId: item.id },
          payload: { done: true },
        });

        return { encounter, item, readAloud, encounters, checklist, noteBack, ticked };
      }).pipe(Effect.orDie),
    );

    expect(seen.encounter.name).toBe("Ambush in the reeds");
    expect(seen.encounter.difficulty).toBe("Medium");
    // `text[]` survives the round trip as a real array, not a Postgres literal.
    expect(seen.encounter.tags).toEqual(["Marsh", "Night"]);
    // Nothing asked for a visibility, so the column default decided.
    expect(seen.encounter.visibility).toBe("dm");
    expect(seen.encounter.origin).toBe("authored");
    expect(seen.encounter.assistantTurnId).toBeNull();

    expect(seen.item.label).toBe("Decide what the crate contains");
    expect(seen.item.done).toBe(false);
    expect(seen.item.visibility).toBe("dm");
    expect(seen.item.origin).toBe("authored");
    expect(seen.ticked.done).toBe(true);

    expect(seen.noteBack.attachedTo).toEqual({ kind: "encounter", id: seen.encounter.id });
    expect(seen.encounters.map((e) => e.id)).toEqual([seen.encounter.id]);
    expect(seen.checklist.map((i) => i.id)).toEqual([seen.item.id]);
  }, 60_000);

  it("leaves an encounter with no difficulty as null rather than inventing a band", async () => {
    const encounter = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* campaignVia(client, { name: "Unrated" });
        return yield* client.encounters.create({
          params: { campaignId: campaign.id },
          payload: { name: "Whatever is in the crate" },
        });
      }).pipe(Effect.orDie),
    );

    expect(encounter.difficulty).toBeNull();
    expect(encounter.tags).toEqual([]);
  }, 60_000);

  it("refuses a prep item under a session in a different campaign", async () => {
    // The session id is a client claim, not a fact. The read predicate is
    // handed the campaign it must contain the session within, so naming
    // another campaign's session is a 404 and not a cross-table write.
    const error = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const mine = yield* campaignVia(client, { name: "Mine" });
        const theirs = yield* campaignVia(client, { name: "Theirs" });
        const elsewhere = yield* client.sessions.create({
          params: { campaignId: theirs.id },
          payload: { number: 1 },
        });

        return yield* Effect.flip(
          client.prep.create({
            params: { campaignId: mine.id, sessionId: elsewhere.id },
            payload: { label: "smuggled" },
          }),
        );
      }).pipe(Effect.orDie),
    );

    expect(error._tag).toBe("NotFound");
  }, 60_000);

  it("deletes an encounter and detaches its note instead of deleting it", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* campaignVia(client, { name: "Deletions" });
        const campaignId = campaign.id;
        const encounter = yield* client.encounters.create({
          params: { campaignId },
          payload: { name: "temporary" },
        });
        const note = yield* client.notes.create({
          params: { campaignId },
          payload: {
            title: "the prose outlives it",
            attachedTo: { kind: "encounter", id: encounter.id },
          },
        });

        yield* client.encounters.remove({ params: { campaignId, encounterId: encounter.id } });

        const gone = yield* Effect.result(
          client.encounters.findById({ params: { campaignId, encounterId: encounter.id } }),
        );
        const survivor = yield* client.notes.findById({ params: { campaignId, noteId: note.id } });
        return { gone, survivor };
      }).pipe(Effect.orDie),
    );

    expect(seen.gone._tag).toBe("Failure");
    expect(seen.survivor.title).toBe("the prose outlives it");
    expect(seen.survivor.attachedTo).toBeNull();
  }, 60_000);
});

describe("the bestiary", () => {
  it("round-trips an authored Library creature, document and all", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* campaignVia(client, { name: "The Marsh" });
        const campaignId = campaign.id;

        const creature = yield* client.library.create({
          payload: {
            name: "Bullywug Croaker",
            size: "Medium",
            type: "Humanoid",
            cr: "1/4",
            ac: 15,
            hp: 11,
            environments: ["Marsh"],
            statBlock: {
              meta: "Medium humanoid (bullywug), neutral evil",
              ac: "15 (hide armour, shield)",
              hp: "11 (2d8+2)",
              speed: "20 ft., swim 40 ft.",
              cr: "1/4 (50 XP)",
              abilities: [{ label: "STR", score: "12", modifier: "+1" }],
              traits: [
                {
                  name: "Croak",
                  text: "It croaks. Everything within 30 feet hears it.",
                  dice: "1d4",
                },
              ],
            },
          },
        });
        // The campaign-scoped by-id read resolves the same original: authoring
        // lives in the Library, and the campaign surface only ever *uses* it.
        const readBack = yield* client.creatures.findById({
          params: { campaignId, creatureId: creature.id },
        });

        return { creature, readBack };
      }).pipe(Effect.orDie),
    );

    expect(seen.creature.name).toBe("Bullywug Croaker");
    // The display half survives the round trip whole — the parenthetical is
    // exactly what would be lost by normalising it into the numeric columns.
    expect(seen.readBack.statBlock.ac).toBe("15 (hide armour, shield)");
    expect(seen.readBack.statBlock.traits[0]?.dice).toBe("1d4");
    // `"1/4"` is not a number, and the sort key the server derived says 0.25.
    expect(seen.readBack.cr).toBe("1/4");
    expect(seen.readBack.crSort).toBe(0.25);
    // Nothing asked for a visibility, so the column default decided.
    expect(seen.readBack.visibility).toBe("dm");
    expect(seen.readBack.origin).toBe("authored");
    expect(seen.readBack.derivedFrom).toBeNull();
    expect(seen.readBack.campaignId).toBeNull();
  }, 60_000);

  it("pages the bestiary over the wire, and refuses a cursor it did not mint", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* campaignVia(client, { name: "Pages" });
        const campaignId = campaign.id;

        const first = yield* client.creatures.list({
          params: { campaignId },
          query: { sort: "name", limit: 2 },
        });
        const second = yield* client.creatures.list({
          params: { campaignId },
          query: { sort: "name", limit: 2, cursor: first.nextCursor ?? undefined },
        });
        // The chip vocabulary is its own route under the same prefix as
        // `/creatures/:creatureId`. A static segment wins over a parameter in
        // the router, and this is where that is checked rather than assumed.
        const vocabulary = yield* client.library.environments();

        // A cursor is base64url of a small JSON object, so a forged one fails
        // the *schema* — which is what keeps a bad cursor a 400 with no error
        // member on any endpoint.
        const http = yield* HttpClient.HttpClient;
        const forged = yield* http
          .get(`/campaigns/${campaignId}/creatures?cursor=not-a-cursor`, {
            headers: { authorization: `Bearer ${token}` },
          })
          .pipe(
            Effect.map((response) => response.status),
            Effect.orDie,
          );

        return { first, second, vocabulary, forged };
      }).pipe(Effect.orDie),
    );

    expect(seen.first.items.length).toBe(2);
    expect(seen.first.nextCursor).not.toBeNull();
    expect(seen.second.items.length).toBe(2);
    // No row appears on both pages — the property a page boundary is about.
    expect(
      seen.second.items.filter((creature) =>
        seen.first.items.some((earlier) => earlier.id === creature.id),
      ),
    ).toEqual([]);
    expect(seen.vocabulary.length).toBeGreaterThan(0);
    expect(seen.vocabulary).toEqual([...seen.vocabulary].sort());
    expect(seen.forged).toBe(400);
  }, 60_000);

  it("carries the filters as query parameters, arrays included", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* campaignVia(client, { name: "Filters" });
        const campaignId = campaign.id;

        const byName = (yield* client.creatures.list({
          params: { campaignId },
          query: { q: "gob" },
        })).items;
        const byTrait = (yield* client.creatures.list({
          params: { campaignId },
          query: { q: "nimble escape" },
        })).items;
        // Repeated `?environments=` — and, beside it, the **single** occurrence
        // that used to be a 400. `UrlParams.fromInput` emits one `?environments=`
        // for a one-element array and the server read it as a scalar; one chip
        // pressed is the shape a real user meets first. See `Query.ts`.
        const byEnvironment = (yield* client.creatures.list({
          params: { campaignId },
          query: { environments: ["River", "Cave"], sort: "name" },
        })).items;
        const byOneEnvironment = (yield* client.creatures.list({
          params: { campaignId },
          query: { environments: ["Cave"], sort: "name" },
        })).items;
        const byNoEnvironment = (yield* client.creatures.list({
          params: { campaignId },
          query: { environments: [], sort: "name" },
        })).items;
        const byUnknownEnvironment = (yield* client.creatures.list({
          params: { campaignId },
          query: { environments: ["Moon"], sort: "name" },
        })).items;

        return {
          byName,
          byTrait,
          byEnvironment,
          byOneEnvironment,
          byNoEnvironment,
          byUnknownEnvironment,
        };
      }).pipe(Effect.orDie),
    );

    expect(seen.byName.map((creature) => creature.name)).toEqual(["Goblin Boss"]);
    expect(seen.byTrait.map((creature) => creature.name)).toEqual(["Goblin Boss"]);
    expect(seen.byEnvironment.map((creature) => creature.name)).toEqual([
      "Ferryman's Shade",
      "Goblin Boss",
    ]);
    expect(seen.byOneEnvironment.map((creature) => creature.name)).toEqual(["Goblin Boss"]);
    // No chips is not a filter at all, so the whole corpus comes back.
    expect(seen.byNoEnvironment.length).toBeGreaterThan(2);
    // A chip nothing wears is an empty list, not an error and not everything.
    expect(seen.byUnknownEnvironment).toEqual([]);
  }, 60_000);

  it("instances a Library creature at the point of use, invisibly", async () => {
    // The instancing decision of 2026-09-02, over the wire: putting a Library
    // original on a roster mints the campaign's internal instance behind the
    // scenes. The user-facing surface never lists it, edits it, or names the
    // concept — the line just carries the creature's name.
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* campaignVia(client, { name: "Reskins" });
        const campaignId = campaign.id;

        const original = yield* client.library.create({
          payload: { name: "Bog Owlbear", type: "Monstrosity", cr: "3", ac: 13, hp: 59 },
        });
        const encounter = yield* client.encounters.create({
          params: { campaignId },
          payload: { name: "The bog at dusk" },
        });
        const line = yield* client.encounterCreatures.create({
          params: { campaignId, encounterId: encounter.id },
          payload: { creatureId: original.id, count: 2 },
        });

        // The Library edit afterwards does not reach the built encounter —
        // the instance is a snapshot taken at the point of use.
        yield* client.library.update({
          params: { creatureId: original.id },
          payload: { name: "Bog Owlbear (fixed)", hp: 72 },
        });
        const instance = yield* client.creatures.findById({
          params: { campaignId, creatureId: line.creatureId },
        });

        // And no list ever surfaces it: the campaign's usable-creature list is
        // the picker's — the bundle, the Library, the group's shares.
        const listed = (yield* client.creatures.list({
          params: { campaignId },
          query: { q: "Bog Owlbear" },
        })).items;

        return { original, line, instance, listed };
      }).pipe(Effect.orDie),
    );

    expect(seen.line.creatureId).not.toBe(seen.original.id);
    expect(seen.line.name).toBe("Bog Owlbear");
    expect(seen.instance.name).toBe("Bog Owlbear");
    expect(seen.instance.hp).toBe(59);
    expect(seen.instance.campaignId).not.toBeNull();
    expect(seen.instance.derivedFrom).toBe(seen.original.id);
    // Only the edited original is listed — the instance is plumbing.
    expect(seen.listed.map((creature) => creature.id)).toEqual([seen.original.id]);
    expect(seen.listed[0]?.name).toBe("Bog Owlbear (fixed)");
  }, 60_000);

  it("puts creatures on an encounter and makes its creature count true", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* campaignVia(client, { name: "The Salt Road" });
        const campaignId = campaign.id;

        const encounter = yield* client.encounters.create({
          params: { campaignId },
          payload: { name: "Ambush in the reeds", difficulty: "Medium", tags: ["Marsh", "Night"] },
        });
        const encounterId = encounter.id;

        const corpus = (yield* client.creatures.list({
          params: { campaignId },
          query: { q: "Goblin Boss" },
        })).items;
        const archer = yield* client.library.create({
          payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
        });

        const boss = yield* client.encounterCreatures.create({
          params: { campaignId, encounterId },
          payload: { creatureId: corpus[0]!.id },
        });
        yield* client.encounterCreatures.create({
          params: { campaignId, encounterId },
          payload: { creatureId: archer.id, count: 5 },
        });

        const listed = yield* client.encounterCreatures.list({
          params: { campaignId, encounterId },
        });
        const counted = yield* client.encounters.findById({ params: { campaignId, encounterId } });
        // A repeat is the same 409 whether the source went on directly (the
        // bundle) or through an instance (the Library): the duplicate rule
        // sees through the instancing.
        const repeated = yield* Effect.result(
          client.encounterCreatures.create({
            params: { campaignId, encounterId },
            payload: { creatureId: archer.id },
          }),
        );
        // Deleting the Library original leaves the roster standing — the line
        // points at the campaign's internal snapshot, not at the original.
        yield* client.library.remove({ params: { creatureId: archer.id } });
        const survives = yield* client.encounterCreatures.list({
          params: { campaignId, encounterId },
        });
        yield* client.encounterCreatures.remove({
          params: { campaignId, encounterId, encounterCreatureId: boss.id },
        });
        const afterRemove = yield* client.encounters.findById({
          params: { campaignId, encounterId },
        });

        return { encounter, listed, counted, repeated, survives, afterRemove };
      }).pipe(Effect.orDie),
    );

    // The card said "6 creatures" (`data.js:10`); now it can.
    expect(seen.encounter.creatureCount).toBe(0);
    expect(seen.listed).toHaveLength(2);
    expect(seen.counted.creatureCount).toBe(6);
    expect(seen.repeated._tag).toBe("Failure");
    expect(seen.survives.map((line) => line.name)).toContain("Goblin Archer");
    expect(seen.afterRemove.creatureCount).toBe(5);
  }, 60_000);
});

describe("inviting a player, over the wire", () => {
  it("mints, previews without a credential, redeems as a second account, and lists both sides", async () => {
    // The whole invitation, through the derived client rather than through the
    // repositories — so the payloads, the params and the two response shapes are
    // the ones a browser actually sees. `preview` is issued by the *anonymous*
    // client, which is the property that matters most here: the page a stranger
    // opens has no credential yet, and if that ever starts needing one the join
    // flow is broken for exactly the people it exists for.
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const dm = yield* clientFor(token);
        const campaign = yield* campaignVia(dm, {
          name: "The Ferry at Dusk",
          visibility: "shared",
        });
        const campaignId = campaign.id;

        const issued = yield* dm.invites.create({
          params: { groupId: campaign.groupId },
          payload: { label: "Ilse", campaignId },
        });
        const preview = yield* Effect.flatMap(anonymous, (client) =>
          client.invitePreview.read({ payload: { token: issued.token } }),
        );

        // A second account, with a credential of its own — which is the whole
        // model: a link is an invitation to *join*, and joining needs an account.
        const players = yield* Accounts;
        const playerToken = (yield* players.issue("Ilse")).token;
        const player = yield* clientFor(playerToken);

        const before = yield* player.me.campaigns();
        const redeemed = yield* player.join.redeem({ payload: { token: issued.token } });
        const after = yield* player.me.campaigns();

        const listed = yield* dm.invites.list({ params: { groupId: campaign.groupId } });
        // The player may read the campaign's shared half and may not write it.
        const refusedWrite = yield* Effect.result(
          player.notes.create({ params: { campaignId }, payload: { title: "mine now" } }),
        );
        // …and the invitation list is a DM's own resource.
        const refusedList = yield* Effect.result(
          player.invites.list({ params: { groupId: campaign.groupId } }),
        );

        const revoked = yield* dm.invites.revoke({
          params: { groupId: campaign.groupId, inviteId: issued.invite.id },
          payload: {},
        });
        const afterRevoke = yield* player.me.campaigns();

        return {
          campaign,
          issued,
          preview,
          before,
          redeemed,
          after,
          listed,
          refusedWrite,
          refusedList,
          revoked,
          afterRevoke,
        };
      }).pipe(Effect.orDie),
    );

    // Minted: the row, and the one and only appearance of the token.
    expect(seen.issued.invite.status).toBe("live");
    expect(seen.issued.invite.label).toBe("Ilse");
    expect(seen.issued.token).not.toBe("");

    // Previewed with no `Authorization` header at all.
    expect(seen.preview.campaignName).toBe("The Ferry at Dusk");
    expect(seen.preview.ownerName).toBe("Jo");

    // Joined. The account went from no tables to exactly this one, as a player.
    expect(seen.before).toEqual([]);
    expect(seen.redeemed.campaignName).toBe("The Ferry at Dusk");
    expect(seen.redeemed.shared).toBe(true);
    expect(seen.after.map((row) => [row.campaign.name, row.relation])).toEqual([
      ["The Ferry at Dusk", "player"],
    ]);

    // The DM's list says who took it; the token is not in it.
    expect(seen.listed.map((invite) => [invite.status, invite.redeemedByName])).toEqual([
      ["redeemed", "Ilse"],
    ]);
    expect(JSON.stringify(seen.listed)).not.toContain(seen.issued.token);

    expect(seen.refusedWrite._tag).toBe("Failure");
    expect(seen.refusedList._tag).toBe("Failure");

    // Withdrawn after acceptance: reach goes with it.
    expect(seen.revoked.status).toBe("revoked");
    expect(seen.afterRevoke).toEqual([]);
  }, 60_000);

  it("refuses an unknown token the same way it refuses a used one", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* anonymous;
        return yield* Effect.flip(client.invitePreview.read({ payload: { token: "invented" } }));
      }).pipe(Effect.orDie),
    );

    // `NotFound` and nothing else — the declared error, decoded, naming the
    // invitation rather than the campaign, so nothing about which campaigns
    // exist leaks either. The flip's type is the endpoint's error channel plus
    // the client's own transport failures, so the tag is narrowed rather than
    // read straight off.
    expect(seen._tag).toBe("NotFound");
    expect(seen._tag === "NotFound" ? seen.resource : undefined).toBe("invite");
  }, 60_000);
});

describe("declared errors reach the client as declared errors", () => {
  it("reports a duplicate session number as Conflict", async () => {
    const error = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* campaignVia(client, { name: "Numbering" });
        const campaignId = campaign.id;
        yield* client.sessions.create({ params: { campaignId }, payload: { number: 3 } });
        return yield* Effect.flip(
          client.sessions.create({ params: { campaignId }, payload: { number: 3 } }),
        );
      }).pipe(Effect.orDie),
    );

    expect(error._tag).toBe("Conflict");
  }, 60_000);

  it("reports an unknown campaign as NotFound", async () => {
    const error = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        // Branded, so the id has to be decoded rather than written — a plain
        // string is a compile error here, which is the point of the brand.
        const campaignId = Schema.decodeSync(CampaignId)("00000000-0000-4000-8000-000000000000");
        return yield* Effect.flip(client.notes.list({ params: { campaignId }, query: {} }));
      }).pipe(Effect.orDie),
    );

    expect(error._tag).toBe("NotFound");
  }, 60_000);
});
