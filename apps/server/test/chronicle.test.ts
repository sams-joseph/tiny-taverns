import {
  Actor,
  type CampaignId,
  CurrentActor,
  type EncounterId,
  type EncounterRun,
  NEUTRAL_RUN_NAMES,
  type SessionId,
  TavernsApi,
  type Visibility,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Invites } from "../src/repo/Invites.js";
import { aCharacterAt, admittedTo, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";

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
const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(testServer),
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

/** The call's outcome as a tag — `"ok"`, or the failure's `_tag`. */
const tagOf = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(token), call).pipe(
      Effect.map(() => "ok"),
      Effect.catch((error: unknown) =>
        Effect.succeed(
          typeof error === "object" && error !== null && "_tag" in error
            ? String(error._tag)
            : "unknown",
        ),
      ),
    ),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

/** A response body as the wire carries it, for asserting on what is absent. */
const rawBody = (token: string, path: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
      );
      return { status: response.status, text: yield* response.text };
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

let jo: Person;
let ilse: Person;
let withdrawn: Person;
let stranger: Person;
let table: CampaignId;
let quietTable: CampaignId;
/** Session 1, shared: four fights and two beats. */
let played: SessionId;
/** Session 2, the DM's: a shared fight and a shared beat inside it. */
let hidden: SessionId;
/** Session 3, shared, and nothing happened on it. */
let quiet: SessionId;
const fights: Record<string, EncounterRun> = {};
const encounters: Record<string, EncounterId> = {};

const aNight = async (number: number, visibility: Visibility, title?: string) => {
  const night = await as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number, visibility, ...(title === undefined ? {} : { title }) },
    }),
  );
  return night.id;
};

/** The night goes on the table, as *Start session* puts it there. */
const begin = async (sessionId: SessionId) => {
  await as(jo.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: sessionId },
    }),
  );
  await as(jo.token, (client) =>
    client.sessions.update({
      params: { campaignId: table, sessionId },
      payload: { startedAt: DateTime.nowUnsafe() },
    }),
  );
};

/** One fight from its own encounter, started, shared or not, and ended. */
const aFight = async (
  sessionId: SessionId,
  encounter: { readonly name: string; readonly visibility: Visibility; readonly ready: boolean },
  runVisibility: Visibility,
) => {
  const created = await as(jo.token, (client) =>
    client.encounters.create({ params: { campaignId: table }, payload: encounter }),
  );
  encounters[encounter.name] = created.id;
  const started = await as(jo.token, (client) =>
    client.runs.start({
      params: { campaignId: table, sessionId },
      payload: { encounterId: created.id, visibility: runVisibility },
    }),
  );
  await as(jo.token, (client) =>
    client.runs.end({ params: { campaignId: table, sessionId, runId: started.id }, payload: {} }),
  );
  fights[encounter.name] = started;
};

const aBeat = (sessionId: SessionId, body: string, visibility: Visibility) =>
  as(jo.token, (client) =>
    client.beats.create({
      params: { campaignId: table, sessionId },
      payload: { body, visibility },
    }),
  );

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");
  table = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
    )
  ).id;
  quietTable = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "Nothing yet", visibility: "shared" } }),
    )
  ).id;
  const seatedIlse = await run(admittedTo(table, ilse.actor, "Ilse"));
  await run(
    aCharacterAt(table, seatedIlse, { name: "Brannoc", hpMax: 30 }, { seatVisibility: "shared" }),
  );
  // Admitted through a real invitation, then withdrawn by the creator.
  withdrawn = await person("Wren");
  await run(
    Effect.gen(function* () {
      const invites = yield* Invites;
      const proof = yield* asDm(jo.actor, table);
      const issued = yield* invites.createForCampaign(proof, { label: "Wren" });
      yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, withdrawn.actor);
      yield* invites.revokeForCampaign(proof, issued.invite.id);
    }),
  );

  played = await aNight(1, "shared", "The ford");
  await begin(played);
  await aFight(played, { name: READABLE, visibility: "shared", ready: true }, "shared");
  await aFight(played, { name: DRAFT_ENCOUNTER, visibility: "shared", ready: false }, "shared");
  await aFight(played, { name: DM_ENCOUNTER, visibility: "dm", ready: true }, "shared");
  await aFight(played, { name: HIDDEN_RUN_ENCOUNTER, visibility: "shared", ready: true }, "dm");
  await aBeat(played, SHARED_BEAT, "shared");
  await aBeat(played, DM_BEAT, "dm");

  // Everything inside is shared; the night itself is not, and that is enough.
  hidden = await aNight(2, "dm", HIDDEN_NIGHT_TITLE);
  await begin(hidden);
  await aFight(
    hidden,
    { name: HIDDEN_NIGHT_ENCOUNTER, visibility: "shared", ready: true },
    "shared",
  );
  await aBeat(hidden, BEAT_IN_HIDDEN_NIGHT, "shared");

  quiet = await aNight(3, "shared");
}, 60_000);

describe("the creator's chronicle", () => {
  it("lists every night, newest first, with every run and beat in it", async () => {
    const nights = await as(jo.token, (client) =>
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
  });

  it("is, night by night, the night its recap describes", async () => {
    const nights = await as(jo.token, (client) =>
      client.chronicle.read({ params: { campaignId: table } }),
    );
    for (const night of nights) {
      const recap = await as(jo.token, (client) =>
        client.recap.read({ params: { campaignId: table, sessionId: night.session.id } }),
      );
      expect(night.session).toEqual(recap.session);
      expect(night.runs).toEqual(recap.fights.map((fight) => fight.run));
      expect(night.beats).toEqual(recap.beats);
    }
  });

  it("is an empty list for a table with no nights, not a failure", async () => {
    const nights = await as(jo.token, (client) =>
      client.chronicle.read({ params: { campaignId: quietTable } }),
    );
    expect(nights).toEqual([]);
  });
});

describe("a player's chronicle", () => {
  it("lists only the nights the DM shared, and in them only what was shared", async () => {
    const nights = await as(ilse.token, (client) =>
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
  });

  it("is, night by night, the night the player's recap describes", async () => {
    const nights = await as(ilse.token, (client) =>
      client.chronicle.readAsPlayer({ params: { campaignId: table } }),
    );
    for (const night of nights) {
      const recap = await as(ilse.token, (client) =>
        client.recap.readAsPlayer({ params: { campaignId: table, sessionId: night.session.id } }),
      );
      expect(night.session).toEqual(recap.session);
      expect(night.runs).toEqual(recap.fights.map((fight) => fight.run));
      expect(night.beats).toEqual(recap.beats);
    }
    // And the night it leaves out is one the player's recap refuses too.
    expect(
      await tagOf(ilse.token, (client) =>
        client.recap.readAsPlayer({ params: { campaignId: table, sessionId: hidden } }),
      ),
    ).toBe("NotFound");
  });

  it("carries no byte of anything the player may not have on the wire", async () => {
    const raw = await rawBody(ilse.token, `/campaigns/${table}/chronicle/player`);

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
  });

  it("is an empty list when nothing has been shared yet", async () => {
    const unshared = (
      await as(jo.token, (client) =>
        client.campaigns.create({ payload: { name: "Kept close", visibility: "shared" } }),
      )
    ).id;
    await run(admittedTo(unshared, ilse.actor, "Ilse"));
    await as(jo.token, (client) =>
      client.sessions.create({
        params: { campaignId: unshared },
        payload: { number: 1, title: HIDDEN_NIGHT_TITLE },
      }),
    );

    const raw = await rawBody(ilse.token, `/campaigns/${unshared}/chronicle/player`);
    expect(raw.status).toBe(200);
    expect(JSON.parse(raw.text)).toEqual([]);
  });
});

describe("the gate", () => {
  it("refuses a player the creator's chronicle with NotFound", async () => {
    expect(
      await tagOf(ilse.token, (client) => client.chronicle.read({ params: { campaignId: table } })),
    ).toBe("NotFound");
    const raw = await rawBody(ilse.token, `/campaigns/${table}/chronicle`);
    expect(raw.status).toBe(404);
    expect(SENTINELS.filter((sentinel) => raw.text.includes(sentinel))).toEqual([]);
  });

  it("refuses the withdrawn member and the stranger both chronicles with NotFound", async () => {
    for (const token of [withdrawn.token, stranger.token]) {
      expect(
        await tagOf(token, (client) => client.chronicle.read({ params: { campaignId: table } })),
      ).toBe("NotFound");
      expect(
        await tagOf(token, (client) =>
          client.chronicle.readAsPlayer({ params: { campaignId: table } }),
        ),
      ).toBe("NotFound");
    }
  });
});
