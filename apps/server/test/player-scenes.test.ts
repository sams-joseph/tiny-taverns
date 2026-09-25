import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  CurrentActor,
  type EncounterCreate,
  type EncounterId,
  type EncounterKind,
  type EncounterRun,
  type EncounterRunId,
  NEUTRAL_RUN_NAMES,
  type PlayerLiveTable,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Creatures } from "../src/repo/Creatures.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { Invites } from "../src/repo/Invites.js";
import { aCharacterAt, admittedTo, aGroupMemberAt, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **A player is told what kind of scene is on the table, and nothing of it.**
 *
 * The captain's decision of 2026-09-25: of a conversation, a skill challenge
 * or a hazard a player sees its kind, its read-aloud when the encounter is
 * Shared and Ready, and their own rolls. Its DCs, targets, tally, attitude,
 * beats and logged checks are the creator's, and one from an encounter the
 * player may not read is called by its kind, as a fight is "A fight".
 *
 * Over the real application and Postgres, through the client derived from the
 * contract and the raw wire, with every person minted the shipped way
 * (`support/actors.ts`): the DM, a player seated through a real invitation, a
 * member whose seat was withdrawn, and a stranger. Every scene field is planted
 * with a sentinel and looked for in what a player is answered.
 */

const database = migratedDatabase("taverns_test_player_scenes");
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

// Sentinels planted in everything a scene keeps. None may reach a player.
const SECRET_TACTIC = "TACTIC-THE-FERRYMAN-IS-THE-HAG";
const SECRET_SUCCESS = "OUTCOME-THE-CACHE-IS-CURSED";
const SECRET_FAILURE = "OUTCOME-THE-ROPE-WAS-CUT";
const SECRET_ON_FAIL = "ONFAIL-SALT-IN-THE-LUNGS";
const SECRET_DURATION = "DURATION-UNTIL-THE-MOON-SETS";
const SECRET_SKILL = "Sentinel lore";
const MONSTER = "Marsh Hag";
/** The names of the two encounters the player may not read. */
const HIDDEN_HAZARD = "NAME-The-salt-flat-sandstorm";
const HIDDEN_PARLEY = "NAME-The-hags-true-bargain";

const SECRETS = [
  SECRET_TACTIC,
  SECRET_SUCCESS,
  SECRET_FAILURE,
  SECRET_ON_FAIL,
  SECRET_DURATION,
  SECRET_SKILL,
  MONSTER,
  HIDDEN_HAZARD,
  HIDDEN_PARLEY,
];

/**
 * Keys only a scene's creator-side schemas spell (`EncounterRunScene`,
 * `EncounterRunCheck`, `EncounterChallenge`), and the attitude the DM noted.
 * None is a key of anything a player's table or recap answers. As keys, with
 * their colon: `"challenge"` is also a mode, which a player is told.
 */
const SCENE_KEYS = [
  "dc",
  "total",
  "checks",
  "attitude",
  "challenge",
  "successes",
  "failures",
  "stage",
  "stages",
  "skill",
  "save",
  "tactics",
  "onSuccess",
  "onFailure",
  "onFail",
].map((key) => `"${key}":`);

const leaked = (text: string): ReadonlyArray<string> =>
  [...SECRETS, ...SCENE_KEYS, '"hostile"'].filter((secret) => text.includes(secret));

let jo: Person;
let ilse: Person;
let stranger: Person;
let withdrawn: Person;
let table: CampaignId;
let night: SessionId;

interface Scene {
  readonly label: string;
  readonly kind: Exclude<EncounterKind, "combat">;
  /** Whether the seated player may read the encounter (Shared and Ready). */
  readonly readable: boolean;
  readonly encounter: EncounterCreate;
  id?: EncounterId;
  run?: EncounterRun;
  /** The player's table while the scene was on it, typed and on the wire. */
  live?: PlayerLiveTable | null;
  liveRaw?: string;
}

const scenes: ReadonlyArray<Scene> = [
  {
    label: "readable conversation",
    kind: "social",
    readable: true,
    encounter: {
      name: "A bargain at the ford",
      kind: "social",
      visibility: "shared",
      ready: true,
      tactics: ["Wants the toll waived", SECRET_TACTIC],
    },
  },
  {
    label: "readable skill challenge",
    kind: "challenge",
    readable: true,
    encounter: {
      name: "The dry well",
      kind: "challenge",
      visibility: "shared",
      ready: true,
      tactics: [SECRET_TACTIC],
      challenge: {
        kind: "challenge",
        dc: 14,
        successes: 3,
        failures: 2,
        skills: ["Athletics"],
        onSuccess: SECRET_SUCCESS,
        onFailure: SECRET_FAILURE,
      },
    },
  },
  {
    label: "unreadable hazard",
    kind: "hazard",
    readable: false,
    encounter: {
      name: HIDDEN_HAZARD,
      kind: "hazard",
      tactics: [SECRET_TACTIC],
      challenge: {
        kind: "hazard",
        save: { ability: "CON", dc: 13 },
        onFail: SECRET_ON_FAIL,
        duration: SECRET_DURATION,
        skills: ["Survival"],
      },
    },
  },
  {
    label: "unreadable conversation",
    kind: "social",
    readable: false,
    // Shared but a draft: the player may still not read it.
    encounter: {
      name: HIDDEN_PARLEY,
      kind: "social",
      visibility: "shared",
      ready: false,
      tactics: [SECRET_TACTIC],
    },
  },
];

/** A conversation that turned into a fight, from an encounter the player may not read. */
let escalated: EncounterRun;
let escalatedLive: PlayerLiveTable | null;

const params = (runId: EncounterRunId) => ({ campaignId: table, sessionId: night, runId });

/** Every row of the run shared, so what a player misses is the scene's doing, not a row's. */
const shareEveryone = async (runId: EncounterRunId) => {
  const rows = await as(jo.token, (client) => client.combatants.list({ params: params(runId) }));
  for (const row of rows) {
    await as(jo.token, (client) =>
      client.combatants.update({
        params: { ...params(runId), combatantId: row.id },
        payload: { visibility: "shared" },
      }),
    );
  }
  return rows;
};

/** What the DM does in each kind of scene: every field it keeps, filled. */
const playOut = async (scene: Scene, runId: EncounterRunId) => {
  const rows = await shareEveryone(runId);
  const brannoc = rows.find((row) => row.kind === "pc")!;
  const update = (payload: Parameters<Client["runs"]["updateScene"]>[0]["payload"]) =>
    as(jo.token, (client) => client.runs.updateScene({ params: params(runId), payload }));
  if (scene.kind === "social") await update({ attitude: "hostile" });
  if (scene.kind === "hazard") await update({ stages: 3, stage: 1 });
  // *Share map* on, as if the DM had flipped it: a scene still shows no board.
  await as(jo.token, (client) =>
    client.runs.update({ params: params(runId), payload: { mapShown: true } }),
  );
  await update({ beat: { index: 0, done: true } });
  await as(jo.token, (client) =>
    client.runs.logCheck({
      params: params(runId),
      payload:
        scene.kind === "hazard"
          ? { combatantId: brannoc.id, save: "CON", total: 9 }
          : { combatantId: brannoc.id, skill: SECRET_SKILL, total: 7, dc: 17 },
    }),
  );
  // Whoever the scene's roster held, knocked down: a fight would tell the
  // world they fell, and a scene tells nobody who was in it.
  for (const row of rows.filter((entry) => entry.kind === "npc")) {
    await as(jo.token, (client) =>
      client.combatants.update({
        params: { ...params(runId), combatantId: row.id },
        payload: { hpCurrent: 0 },
      }),
    );
  }
};

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");
  table = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
    )
  ).id;
  const seatedIlse = await run(admittedTo(table, ilse.actor, "Ilse"));
  await run(
    aCharacterAt(table, seatedIlse, { name: "Brannoc", hpMax: 30 }, { seatVisibility: "shared" }),
  );
  // Admitted through a real invitation, then withdrawn by the creator: still
  // in the backing context, no longer at this table.
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

  const hag = await run(
    Effect.flatMap(Creatures, (creatures) =>
      Effect.provideService(
        creatures.libraryCreate({ name: MONSTER, type: "Fey", cr: "2", ac: 17, hp: 82 }),
        CurrentActor,
        jo.actor,
      ),
    ),
  );
  for (const scene of scenes) {
    const payload: EncounterCreate =
      scene.kind === "social"
        ? { ...scene.encounter, creatures: [{ creatureId: hag.id, count: 1 }] }
        : scene.encounter;
    scene.id = (
      await as(jo.token, (client) =>
        client.encounters.create({ params: { campaignId: table }, payload }),
      )
    ).id;
  }

  night = (
    await as(jo.token, (client) =>
      client.sessions.create({
        params: { campaignId: table },
        payload: { number: 1, visibility: "shared" },
      }),
    )
  ).id;
  await as(jo.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: night },
    }),
  );
  await as(jo.token, (client) =>
    client.sessions.update({
      params: { campaignId: table, sessionId: night },
      payload: { startedAt: DateTime.nowUnsafe() },
    }),
  );

  // Each scene played in turn — one on the table at a time — with the
  // player's table read while it is live.
  for (const scene of scenes) {
    const started = await as(jo.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId: night },
        payload: { encounterId: scene.id!, visibility: "shared" },
      }),
    );
    scene.run = started;
    await playOut(scene, started.id);
    scene.live = await as(ilse.token, (client) =>
      client.table.read({ params: { campaignId: table } }),
    );
    const raw = await rawBody(ilse.token, `/campaigns/${table}/table`);
    expect(raw.status).toBe(200);
    scene.liveRaw = raw.text;
    await as(jo.token, (client) => client.runs.end({ params: params(started.id), payload: {} }));
  }

  // The hidden conversation again, turning into a fight.
  const parley = scenes.find((scene) => scene.encounter.name === HIDDEN_PARLEY)!;
  const talk = await as(jo.token, (client) =>
    client.runs.start({
      params: { campaignId: table, sessionId: night },
      payload: { encounterId: parley.id!, visibility: "shared" },
    }),
  );
  await shareEveryone(talk.id);
  escalated = await as(jo.token, (client) =>
    client.runs.escalate({ params: params(talk.id), payload: {} }),
  );
  escalatedLive = await as(ilse.token, (client) =>
    client.table.read({ params: { campaignId: table } }),
  );
  await as(jo.token, (client) => client.runs.end({ params: params(talk.id), payload: {} }));
}, 60_000);

describe("a scene on the table, to a seated player", () => {
  it("says which kind of scene it is, and gives no order and nobody up", () => {
    for (const scene of scenes) {
      expect(scene.live?.fight, scene.label).toMatchObject({
        id: scene.run!.id,
        mode: scene.kind,
        encounterId: scene.readable ? scene.id : null,
        order: [],
        upNext: null,
        board: null,
      });
      // Their own row still makes their seat, for their rolls.
      expect(scene.live?.fight?.seats, scene.label).toHaveLength(1);
    }
  });

  it("carries no DC, target, tally, attitude, beat or check on the wire", () => {
    for (const scene of scenes) {
      expect(leaked(scene.liveRaw!), scene.label).toEqual([]);
      expect(scene.liveRaw, scene.label).not.toContain('"beats":');
      expect(scene.liveRaw, scene.label).not.toContain('"hpBand"');
    }
  });

  it("is a fight, with its order, once a conversation turns into one", () => {
    expect(escalated.mode).toBe("combat");
    expect(escalatedLive?.fight).toMatchObject({ id: escalated.id, mode: "combat" });
    expect(escalatedLive?.fight?.order.map((row) => row.displayName)).toContain(MONSTER);
  });
});

describe("a scene in the player's recap", () => {
  it("is named by its kind unless the player may read the encounter, and names nobody in it", async () => {
    const recap = await as(ilse.token, (client) =>
      client.recap.readAsPlayer({ params: { campaignId: table, sessionId: night } }),
    );
    for (const scene of scenes) {
      const fight = recap.fights.find((entry) => entry.run.id === scene.run!.id)!;
      expect(fight.run, scene.label).toMatchObject({
        mode: scene.kind,
        encounterId: scene.readable ? scene.id : null,
        encounterName: scene.readable ? scene.encounter.name : NEUTRAL_RUN_NAMES[scene.kind],
      });
      expect(fight.combatants, scene.label).toEqual([]);
    }
    const fight = recap.fights.find((entry) => entry.run.id === escalated.id)!;
    expect(fight.run).toMatchObject({ mode: "combat", encounterName: "A fight" });
    expect(fight.combatants.map((row) => row.displayName)).toContain(MONSTER);
  });

  it("carries none of the scene's fields on the wire", async () => {
    const raw = await rawBody(ilse.token, `/campaigns/${table}/sessions/${night}/recap/player`);
    expect(raw.status).toBe(200);
    for (const scene of scenes) expect(raw.text).toContain(scene.run!.id);
    // The escalated fight names its monster, so it is read apart.
    const recap = JSON.parse(raw.text) as {
      readonly fights: ReadonlyArray<{ readonly run: { readonly id: string } }>;
    };
    const scenesOnly = JSON.stringify({
      ...recap,
      fights: recap.fights.filter((entry) => entry.run.id !== escalated.id),
    });
    expect(leaked(scenesOnly)).toEqual([]);
  });

  it("keeps the creator's recap whole: the names, who was there, and the checks", async () => {
    const recap = await as(jo.token, (client) =>
      client.recap.read({ params: { campaignId: table, sessionId: night } }),
    );
    for (const scene of scenes) {
      const fight = recap.fights.find((entry) => entry.run.id === scene.run!.id)!;
      expect(fight.run.encounterName, scene.label).toBe(scene.encounter.name);
      expect(fight.combatants.length, scene.label).toBeGreaterThan(0);
      expect(fight.checks, scene.label).toHaveLength(1);
    }
  });

  it("refuses the withdrawn member and the stranger with NotFound, on the recap and the table", async () => {
    for (const token of [withdrawn.token, stranger.token]) {
      expect(
        await tagOf(token, (client) =>
          client.recap.readAsPlayer({ params: { campaignId: table, sessionId: night } }),
        ),
      ).toBe("NotFound");
      expect(
        await tagOf(token, (client) => client.table.read({ params: { campaignId: table } })),
      ).toBe("NotFound");
    }
  });
});

describe("a scene told to the Shared World", () => {
  it("is named as the table's players are told it, and tells nobody who fell in it", async () => {
    const world = await as(jo.token, (client) =>
      client.campaigns.promoteSharedWorld({
        params: { campaignId: table },
        payload: { name: "The Drowned Coast" },
      }),
    );
    const member = await run(aGroupMemberAt(table, "Pim"));
    const story = await run(
      Effect.flatMap(GroupHistory, (history) =>
        Effect.provideService(history.nightStory(world.id, table, night), CurrentActor, member),
      ),
    );
    expect(story.fights.map((fight) => [fight.name, fight.mode])).toEqual([
      ...scenes.map((scene) => [
        scene.readable ? scene.encounter.name : NEUTRAL_RUN_NAMES[scene.kind],
        scene.kind,
      ]),
      [NEUTRAL_RUN_NAMES.combat, "combat"],
    ]);

    const entry = await as(jo.token, (client) =>
      client.sharedWorldHistory.fromRecap({
        params: { worldId: world.id },
        payload: { campaignId: table, sessionId: night },
      }),
    );
    expect(entry.body).toContain("A hazard: played to its end.");
    expect(entry.body).toContain("A conversation: played to its end.");
    expect(entry.body).toContain("A fight: fought to a finish at round 1.");
    // Every scene's roster was knocked down, and the world hears of none of it.
    expect(entry.body).not.toContain(MONSTER);
    expect(entry.body).not.toContain("went down");
  });
});
