import { describe, expect } from "@effect/vitest";
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
import { Context, DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Creatures } from "../src/repo/Creatures.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { Invites } from "../src/repo/Invites.js";
import { aCharacterAt, admittedTo, aGroupMemberAt, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

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

interface Person {
  readonly token: string;
  readonly actor: Actor;
}

const person = (name: string) =>
  Effect.gen(function* () {
    const issued = yield* Effect.flatMap(Accounts, (accounts) => accounts.issue(name));
    return {
      token: issued.token,
      actor: new Actor({ accountId: issued.accountId, scope: { _tag: "account" } }),
    } satisfies Person;
  }).pipe(Effect.orDie);

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

/** The creator's table and the night every scene is played on. */
interface Night {
  readonly jo: Person;
  readonly table: CampaignId;
  readonly night: SessionId;
}

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

const params = ({ table, night }: Night, runId: EncounterRunId) => ({
  campaignId: table,
  sessionId: night,
  runId,
});

/** Every row of the run shared, so what a player misses is the scene's doing, not a row's. */
const shareEveryone = (at: Night, runId: EncounterRunId) =>
  Effect.gen(function* () {
    const rows = yield* as(at.jo.token, (client) =>
      client.combatants.list({ params: params(at, runId) }),
    );
    for (const row of rows) {
      yield* as(at.jo.token, (client) =>
        client.combatants.update({
          params: { ...params(at, runId), combatantId: row.id },
          payload: { visibility: "shared" },
        }),
      );
    }
    return rows;
  });

/** What the DM does in each kind of scene: every field it keeps, filled. */
const playOut = (at: Night, scene: Scene, runId: EncounterRunId) =>
  Effect.gen(function* () {
    const rows = yield* shareEveryone(at, runId);
    const brannoc = rows.find((row) => row.kind === "pc")!;
    const update = (payload: Parameters<Client["runs"]["updateScene"]>[0]["payload"]) =>
      as(at.jo.token, (client) => client.runs.updateScene({ params: params(at, runId), payload }));
    if (scene.kind === "social") yield* update({ attitude: "hostile" });
    if (scene.kind === "hazard") yield* update({ stages: 3, stage: 1 });
    // *Share map* on, as if the DM had flipped it: a scene still shows no board.
    yield* as(at.jo.token, (client) =>
      client.runs.update({ params: params(at, runId), payload: { mapShown: true } }),
    );
    yield* update({ beat: { index: 0, done: true } });
    yield* as(at.jo.token, (client) =>
      client.runs.logCheck({
        params: params(at, runId),
        payload:
          scene.kind === "hazard"
            ? { combatantId: brannoc.id, save: "CON", total: 9 }
            : { combatantId: brannoc.id, skill: SECRET_SKILL, total: 7, dc: 17 },
      }),
    );
    // Whoever the scene's roster held, knocked down: a fight would tell the
    // world they fell, and a scene tells nobody who was in it.
    for (const row of rows.filter((entry) => entry.kind === "npc")) {
      yield* as(at.jo.token, (client) =>
        client.combatants.update({
          params: { ...params(at, runId), combatantId: row.id },
          payload: { hpCurrent: 0 },
        }),
      );
    }
  });

const makeFixture = Effect.gen(function* () {
  const jo = yield* person("Jo");
  const ilse = yield* person("Ilse");
  const stranger = yield* person("Bo");
  const table: CampaignId = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const seatedIlse = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(
    table,
    seatedIlse,
    { name: "Brannoc", hpMax: 30 },
    { seatVisibility: "shared" },
  );
  // Admitted through a real invitation, then withdrawn by the creator: still
  // in the backing context, no longer at this table.
  const withdrawn = yield* person("Wren");
  yield* Effect.gen(function* () {
    const invites = yield* Invites;
    const proof = yield* asDm(jo.actor, table);
    const issued = yield* invites.createForCampaign(proof, { label: "Wren" });
    yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, withdrawn.actor);
    yield* invites.revokeForCampaign(proof, issued.invite.id);
  });

  const hag = yield* Effect.flatMap(Creatures, (creatures) =>
    Effect.provideService(
      creatures.libraryCreate({ name: MONSTER, type: "Fey", cr: "2", ac: 17, hp: 82 }),
      CurrentActor,
      jo.actor,
    ),
  );
  for (const scene of scenes) {
    const payload: EncounterCreate =
      scene.kind === "social"
        ? { ...scene.encounter, creatures: [{ creatureId: hag.id, count: 1 }] }
        : scene.encounter;
    scene.id = (yield* as(jo.token, (client) =>
      client.encounters.create({ params: { campaignId: table }, payload }),
    )).id;
  }

  const night: SessionId = (yield* as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number: 1, visibility: "shared" },
    }),
  )).id;
  const at: Night = { jo, table, night };
  yield* as(jo.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: night },
    }),
  );
  yield* as(jo.token, (client) =>
    client.sessions.update({
      params: { campaignId: table, sessionId: night },
      payload: { startedAt: DateTime.nowUnsafe() },
    }),
  );

  // Each scene played in turn — one on the table at a time — with the
  // player's table read while it is live.
  for (const scene of scenes) {
    const started = yield* as(jo.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId: night },
        payload: { encounterId: scene.id!, visibility: "shared" },
      }),
    );
    scene.run = started;
    yield* playOut(at, scene, started.id);
    scene.live = yield* as(ilse.token, (client) =>
      client.table.read({ params: { campaignId: table } }),
    );
    const raw = yield* rawBody(ilse.token, `/campaigns/${table}/table`);
    expect(raw.status).toBe(200);
    scene.liveRaw = raw.text;
    yield* as(jo.token, (client) =>
      client.runs.end({ params: params(at, started.id), payload: {} }),
    );
  }

  // The hidden conversation again, turning into a fight: its twin, since an
  // encounter is played once and the first has been.
  const parley = scenes.find((scene) => scene.encounter.name === HIDDEN_PARLEY)!;
  const twin = yield* as(jo.token, (client) =>
    client.encounters.create({
      params: { campaignId: table },
      payload: { ...parley.encounter, creatures: [{ creatureId: hag.id, count: 1 }] },
    }),
  );
  const talk = yield* as(jo.token, (client) =>
    client.runs.start({
      params: { campaignId: table, sessionId: night },
      payload: { encounterId: twin.id, visibility: "shared" },
    }),
  );
  yield* shareEveryone(at, talk.id);
  /** A conversation that turned into a fight, from an encounter the player may not read. */
  const escalated: EncounterRun = yield* as(jo.token, (client) =>
    client.runs.escalate({ params: params(at, talk.id), payload: {} }),
  );
  const escalatedLive: PlayerLiveTable | null = yield* as(ilse.token, (client) =>
    client.table.read({ params: { campaignId: table } }),
  );
  yield* as(jo.token, (client) => client.runs.end({ params: params(at, talk.id), payload: {} }));
  return { jo, ilse, stranger, withdrawn, table, night, escalated, escalatedLive };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "player-scenes.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describeLayer("player-scenes", shared, (it) => {
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

    it.effect("is a fight, with its order, once a conversation turns into one", () =>
      Effect.gen(function* () {
        const { escalated, escalatedLive } = yield* Fixture;
        expect(escalated.mode).toBe("combat");
        expect(escalatedLive?.fight).toMatchObject({ id: escalated.id, mode: "combat" });
        expect(escalatedLive?.fight?.order.map((row) => row.displayName)).toContain(MONSTER);
      }),
    );
  });

  describe("a scene in the player's recap", () => {
    it.effect(
      "is named by its kind unless the player may read the encounter, and names nobody in it",
      () =>
        Effect.gen(function* () {
          const { ilse, table, night, escalated } = yield* Fixture;
          const recap = yield* as(ilse.token, (client) =>
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
        }),
    );

    it.effect("carries none of the scene's fields on the wire", () =>
      Effect.gen(function* () {
        const { ilse, table, night, escalated } = yield* Fixture;
        const raw = yield* rawBody(
          ilse.token,
          `/campaigns/${table}/sessions/${night}/recap/player`,
        );
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
      }),
    );

    it.effect("keeps the creator's recap whole: the names, who was there, and the checks", () =>
      Effect.gen(function* () {
        const { jo, table, night } = yield* Fixture;
        const recap = yield* as(jo.token, (client) =>
          client.recap.read({ params: { campaignId: table, sessionId: night } }),
        );
        for (const scene of scenes) {
          const fight = recap.fights.find((entry) => entry.run.id === scene.run!.id)!;
          expect(fight.run.encounterName, scene.label).toBe(scene.encounter.name);
          expect(fight.combatants.length, scene.label).toBeGreaterThan(0);
          expect(fight.checks, scene.label).toHaveLength(1);
        }
      }),
    );

    it.effect(
      "refuses the withdrawn member and the stranger with NotFound, on the recap and the table",
      () =>
        Effect.gen(function* () {
          const { stranger, withdrawn, table, night } = yield* Fixture;
          for (const token of [withdrawn.token, stranger.token]) {
            expect(
              yield* tagOf(token, (client) =>
                client.recap.readAsPlayer({ params: { campaignId: table, sessionId: night } }),
              ),
            ).toBe("NotFound");
            expect(
              yield* tagOf(token, (client) => client.table.read({ params: { campaignId: table } })),
            ).toBe("NotFound");
          }
        }),
    );
  });

  describe("a scene told to the Shared World", () => {
    it.effect("is named as the table's players are told it, and tells nobody who fell in it", () =>
      Effect.gen(function* () {
        const { jo, table, night } = yield* Fixture;
        const world = yield* as(jo.token, (client) =>
          client.campaigns.promoteSharedWorld({
            params: { campaignId: table },
            payload: { name: "The Drowned Coast" },
          }),
        );
        const member = yield* aGroupMemberAt(table, "Pim");
        const story = yield* Effect.flatMap(GroupHistory, (history) =>
          Effect.provideService(history.nightStory(world.id, table, night), CurrentActor, member),
        );
        expect(story.fights.map((fight) => [fight.name, fight.mode])).toEqual([
          ...scenes.map((scene) => [
            scene.readable ? scene.encounter.name : NEUTRAL_RUN_NAMES[scene.kind],
            scene.kind,
          ]),
          [NEUTRAL_RUN_NAMES.combat, "combat"],
        ]);

        const entry = yield* as(jo.token, (client) =>
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
      }),
    );
  });
});
