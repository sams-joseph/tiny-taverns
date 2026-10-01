import { describe, expect } from "@effect/vitest";
import {
  CurrentActor,
  type EncounterId,
  type EncounterRun,
  NEUTRAL_RUN_NAMES,
  type SessionId,
  TavernsApi,
  type Visibility,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { applicationOver, servicesOver } from "../src/app.js";
import { Invites } from "../src/repo/Invites.js";
import { aCharacterAt, admittedTo, aPerson, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **The whole record in one read, and a player told no more of it than of any
 * one night.**
 *
 * `GET /campaigns/:c/chronicle` is the creator's list of every night with its
 * runs and beats; `GET …/chronicle/player` is a member's. Both are read by the
 * function a recap reads a night through (`nights` in `repo/Recap.ts`), so the
 * first claim here is that the list and the per-night recap agree, night by
 * night, for both audiences. The rest are the boundary: the creator's path
 * refuses a player with `NotFound`, and a player's answer holds no byte of an
 * unshared night, a DM-only beat, a hidden run or an encounter they may not
 * read — measured on the raw wire against planted sentinels.
 *
 * Over the real application and Postgres, through the client derived from the
 * contract, with every person minted the shipped way (`support/actors.ts`).
 */

const database = migratedDatabase("taverns_test_chronicle");
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

/** The call's outcome as a tag — `"ok"`, or the failure's `_tag`. */
const tagOf = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
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

/** A response body as the wire carries it, for asserting on what is absent. */
const rawBody = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, text: yield* response.text };
  }).pipe(Effect.orDie);

// What a player may be told: the positive controls.
const SHARED_BEAT = "The ferryman is called Cazril.";
const READABLE = "The toll at the ford";

// Sentinels. None may reach a player, by any path.
const DM_BEAT = "DMBEAT-Hettie-is-lying-about-the-tide";
const HIDDEN_NIGHT_TITLE = "NIGHTTITLE-The-hags-bargain";
const BEAT_IN_HIDDEN_NIGHT = "HIDDENNIGHTBEAT-the-crate-is-hers";
/** Shared but a draft: its fight is shared, its name is not. */
const DRAFT_ENCOUNTER = "NAME-The-drowned-chapel";
/** The DM's own encounter: its fight is shared, its name is not. */
const DM_ENCOUNTER = "NAME-The-salt-wight";
/** Shared and Ready, but its fight was kept to the DM. */
const HIDDEN_RUN_ENCOUNTER = "NAME-The-sunken-bell";
/** Shared and Ready, and its shared fight was on a night the DM kept. */
const HIDDEN_NIGHT_ENCOUNTER = "NAME-The-hags-hut";

const SENTINELS = [
  DM_BEAT,
  HIDDEN_NIGHT_TITLE,
  BEAT_IN_HIDDEN_NIGHT,
  DRAFT_ENCOUNTER,
  DM_ENCOUNTER,
  HIDDEN_RUN_ENCOUNTER,
  HIDDEN_NIGHT_ENCOUNTER,
];

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const quietTable = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "Nothing yet", visibility: "shared" } }),
  )).id;
  const seatedIlse = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(
    table,
    seatedIlse,
    { name: "Brannoc", hpMax: 30 },
    { seatVisibility: "shared" },
  );
  // Admitted through a real invitation, then withdrawn by the creator.
  const withdrawn = yield* aPerson("Wren");
  yield* Effect.gen(function* () {
    const invites = yield* Invites;
    const proof = yield* asDm(jo.actor, table);
    const issued = yield* invites.createForCampaign(proof, { label: "Wren" });
    yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, withdrawn.actor);
    yield* invites.revokeForCampaign(proof, issued.invite.id);
  }).pipe(Effect.orDie);

  const fights: Record<string, EncounterRun> = {};
  const encounters: Record<string, EncounterId> = {};

  const aNight = (number: number, visibility: Visibility, title?: string) =>
    as(jo.token, (client) =>
      client.sessions.create({
        params: { campaignId: table },
        payload: { number, visibility, ...(title === undefined ? {} : { title }) },
      }),
    ).pipe(Effect.map((night) => night.id));

  /** The night goes on the table, as *Start session* puts it there. */
  const begin = (sessionId: SessionId) =>
    Effect.gen(function* () {
      yield* as(jo.token, (client) =>
        client.campaigns.update({
          params: { campaignId: table },
          payload: { currentSessionId: sessionId },
        }),
      );
      yield* as(jo.token, (client) =>
        client.sessions.update({
          params: { campaignId: table, sessionId },
          payload: { startedAt: DateTime.nowUnsafe() },
        }),
      );
    });

  /** One fight from its own encounter, started, shared or not, and ended. */
  const aFight = (
    sessionId: SessionId,
    encounter: { readonly name: string; readonly visibility: Visibility; readonly ready: boolean },
    runVisibility: Visibility,
  ) =>
    Effect.gen(function* () {
      const created = yield* as(jo.token, (client) =>
        client.encounters.create({ params: { campaignId: table }, payload: encounter }),
      );
      encounters[encounter.name] = created.id;
      const started = yield* as(jo.token, (client) =>
        client.runs.start({
          params: { campaignId: table, sessionId },
          payload: { encounterId: created.id, visibility: runVisibility },
        }),
      );
      yield* as(jo.token, (client) =>
        client.runs.end({
          params: { campaignId: table, sessionId, runId: started.id },
          payload: {},
        }),
      );
      fights[encounter.name] = started;
    });

  const aBeat = (sessionId: SessionId, body: string, visibility: Visibility) =>
    as(jo.token, (client) =>
      client.beats.create({
        params: { campaignId: table, sessionId },
        payload: { body, visibility },
      }),
    );

  /** Session 1, shared: four fights and two beats. */
  const played = yield* aNight(1, "shared", "The ford");
  yield* begin(played);
  yield* aFight(played, { name: READABLE, visibility: "shared", ready: true }, "shared");
  yield* aFight(played, { name: DRAFT_ENCOUNTER, visibility: "shared", ready: false }, "shared");
  yield* aFight(played, { name: DM_ENCOUNTER, visibility: "dm", ready: true }, "shared");
  yield* aFight(played, { name: HIDDEN_RUN_ENCOUNTER, visibility: "shared", ready: true }, "dm");
  yield* aBeat(played, SHARED_BEAT, "shared");
  yield* aBeat(played, DM_BEAT, "dm");

  // Everything inside is shared; the night itself is not, and that is enough.
  /** Session 2, the DM's: a shared fight and a shared beat inside it. */
  const hidden = yield* aNight(2, "dm", HIDDEN_NIGHT_TITLE);
  yield* begin(hidden);
  yield* aFight(
    hidden,
    { name: HIDDEN_NIGHT_ENCOUNTER, visibility: "shared", ready: true },
    "shared",
  );
  yield* aBeat(hidden, BEAT_IN_HIDDEN_NIGHT, "shared");

  /** Session 3, shared, and nothing happened on it. */
  const quiet = yield* aNight(3, "shared");

  return {
    jo,
    ilse,
    withdrawn,
    stranger,
    table,
    quietTable,
    played,
    hidden,
    quiet,
    fights,
    encounters,
  };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "chronicle.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describeLayer("chronicle", shared, (it) => {
  describe("the creator's chronicle", () => {
    it.effect("lists every night, newest first, with every run and beat in it", () =>
      Effect.gen(function* () {
        const { jo, table, quiet, hidden, played } = yield* Fixture;
        const nights = yield* as(jo.token, (client) =>
          client.chronicle.read({ params: { campaignId: table } }),
        );

        expect(nights.map((night) => night.session.id)).toEqual([quiet, hidden, played]);
        const first = nights[2]!;
        // Oldest first, named after their encounters: the creator may read them all.
        expect(first.runs.map((one) => one.encounterName)).toEqual([
          READABLE,
          DRAFT_ENCOUNTER,
          DM_ENCOUNTER,
          HIDDEN_RUN_ENCOUNTER,
        ]);
        expect(first.beats.map((beat) => [beat.body, beat.visibility])).toEqual([
          [SHARED_BEAT, "shared"],
          [DM_BEAT, "dm"],
        ]);
        expect(nights[0]).toMatchObject({ runs: [], beats: [] });
      }),
    );

    it.effect("is, night by night, the night its recap describes", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const nights = yield* as(jo.token, (client) =>
          client.chronicle.read({ params: { campaignId: table } }),
        );
        for (const night of nights) {
          const recap = yield* as(jo.token, (client) =>
            client.recap.read({ params: { campaignId: table, sessionId: night.session.id } }),
          );
          expect(night.session).toEqual(recap.session);
          expect(night.runs).toEqual(recap.fights.map((fight) => fight.run));
          expect(night.beats).toEqual(recap.beats);
        }
      }),
    );

    it.effect("is an empty list for a table with no nights, not a failure", () =>
      Effect.gen(function* () {
        const { jo, quietTable } = yield* Fixture;
        const nights = yield* as(jo.token, (client) =>
          client.chronicle.read({ params: { campaignId: quietTable } }),
        );
        expect(nights).toEqual([]);
      }),
    );
  });

  describe("a player's chronicle", () => {
    it.effect("lists only the nights the DM shared, and in them only what was shared", () =>
      Effect.gen(function* () {
        const { ilse, table, quiet, played, encounters } = yield* Fixture;
        const nights = yield* as(ilse.token, (client) =>
          client.chronicle.readAsPlayer({ params: { campaignId: table } }),
        );

        expect(nights.map((night) => night.session.id)).toEqual([quiet, played]);
        const first = nights[1]!;
        // The fight kept to the DM is not there at all; the two shared fights
        // from encounters the player may not read are called by their kind.
        expect(first.runs.map((one) => [one.encounterName, one.encounterId])).toEqual([
          [READABLE, encounters[READABLE]],
          [NEUTRAL_RUN_NAMES.combat, null],
          [NEUTRAL_RUN_NAMES.combat, null],
        ]);
        expect(first.beats.map((beat) => beat.body)).toEqual([SHARED_BEAT]);
      }),
    );

    it.effect("is, night by night, the night the player's recap describes", () =>
      Effect.gen(function* () {
        const { ilse, table, hidden } = yield* Fixture;
        const nights = yield* as(ilse.token, (client) =>
          client.chronicle.readAsPlayer({ params: { campaignId: table } }),
        );
        for (const night of nights) {
          const recap = yield* as(ilse.token, (client) =>
            client.recap.readAsPlayer({
              params: { campaignId: table, sessionId: night.session.id },
            }),
          );
          expect(night.session).toEqual(recap.session);
          expect(night.runs).toEqual(recap.fights.map((fight) => fight.run));
          expect(night.beats).toEqual(recap.beats);
        }
        // And the night it leaves out is one the player's recap refuses too.
        expect(
          yield* tagOf(ilse.token, (client) =>
            client.recap.readAsPlayer({ params: { campaignId: table, sessionId: hidden } }),
          ),
        ).toBe("NotFound");
      }),
    );

    it.effect("carries no byte of anything the player may not have on the wire", () =>
      Effect.gen(function* () {
        const { ilse, table, hidden, fights, encounters } = yield* Fixture;
        const raw = yield* rawBody(ilse.token, `/campaigns/${table}/chronicle/player`);

        expect(raw.status).toBe(200);
        // Positive controls, so an empty answer cannot pass.
        expect(raw.text).toContain(SHARED_BEAT);
        expect(raw.text).toContain(READABLE);
        expect(SENTINELS.filter((sentinel) => raw.text.includes(sentinel))).toEqual([]);
        for (const id of [
          hidden,
          fights[HIDDEN_RUN_ENCOUNTER]!.id,
          fights[HIDDEN_NIGHT_ENCOUNTER]!.id,
          encounters[DRAFT_ENCOUNTER]!,
          encounters[DM_ENCOUNTER]!,
        ]) {
          expect(raw.text).not.toContain(id);
        }
      }),
    );

    it.effect("is an empty list when nothing has been shared yet", () =>
      Effect.gen(function* () {
        const { jo, ilse } = yield* Fixture;
        const unshared = (yield* as(jo.token, (client) =>
          client.campaigns.create({ payload: { name: "Kept close", visibility: "shared" } }),
        )).id;
        yield* admittedTo(unshared, ilse.actor, "Ilse");
        yield* as(jo.token, (client) =>
          client.sessions.create({
            params: { campaignId: unshared },
            payload: { number: 1, title: HIDDEN_NIGHT_TITLE },
          }),
        );

        const raw = yield* rawBody(ilse.token, `/campaigns/${unshared}/chronicle/player`);
        expect(raw.status).toBe(200);
        expect(JSON.parse(raw.text)).toEqual([]);
      }),
    );
  });

  describe("the gate", () => {
    it.effect("refuses a player the creator's chronicle with NotFound", () =>
      Effect.gen(function* () {
        const { ilse, table } = yield* Fixture;
        expect(
          yield* tagOf(ilse.token, (client) =>
            client.chronicle.read({ params: { campaignId: table } }),
          ),
        ).toBe("NotFound");
        const raw = yield* rawBody(ilse.token, `/campaigns/${table}/chronicle`);
        expect(raw.status).toBe(404);
        expect(SENTINELS.filter((sentinel) => raw.text.includes(sentinel))).toEqual([]);
      }),
    );

    it.effect("refuses the withdrawn member and the stranger both chronicles with NotFound", () =>
      Effect.gen(function* () {
        const { withdrawn, stranger, table } = yield* Fixture;
        for (const token of [withdrawn.token, stranger.token]) {
          expect(
            yield* tagOf(token, (client) =>
              client.chronicle.read({ params: { campaignId: table } }),
            ),
          ).toBe("NotFound");
          expect(
            yield* tagOf(token, (client) =>
              client.chronicle.readAsPlayer({ params: { campaignId: table } }),
            ),
          ).toBe("NotFound");
        }
      }),
    );
  });
});
