import { describe, expect } from "@effect/vitest";
import {
  CurrentActor,
  type EncounterCreate,
  type EncounterId,
  type EncounterRun,
  type EncounterRunId,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { applicationOver, servicesOver } from "../src/app.js";
import { Creatures } from "../src/repo/Creatures.js";
import { Invites } from "../src/repo/Invites.js";
import { aCharacterAt, admittedTo, aPerson, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A run is played by its encounter's kind; a conversation, a skill
 * challenge and a hazard keep a scene and a log of checks that are the
 * creator's alone.**
 *
 * Over the real application and Postgres, through the client derived from the
 * contract, with every person minted the shipped way (`support/actors.ts`): the
 * DM who made the table, a player seated at it through a real invitation, a
 * group member whose seat was withdrawn, and a stranger.
 */

const database = migratedDatabase("taverns_test_run_scenes");
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

/** The same call, answering the failure's tag rather than dying on it. */
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(token), call).pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catch((error: unknown) =>
      Effect.succeed({
        ok: false as const,
        tag:
          typeof error === "object" && error !== null && "_tag" in error
            ? String(error._tag)
            : "unknown",
      }),
    ),
  );

const tagOf = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.map(attempt(token, call), (result) => (result.ok ? "ok" : result.tag));

const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.orDie);

/** A response body as the wire carries it, for asserting on what is absent. */
const rawBody = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, text: yield* response.text };
  }).pipe(Effect.orDie);

/** A request the derived client would refuse to encode, sent as it stands. */
const rawPost = (token: string, path: string, body: unknown) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.post(path).pipe(
        HttpClientRequest.bearerToken(token),
        HttpClientRequest.bodyJsonUnsafe(body),
      ),
    );
    return response.status;
  }).pipe(Effect.orDie);

/** Words that must never reach a player, planted in the creator's prep. */
const SECRET_TACTIC = "TACTIC-THE-FERRYMAN-IS-THE-HAG";
const SECRET_OUTCOME = "OUTCOME-THE-CACHE-IS-CURSED";
const SECRET_SKILL = "Sentinel lore";

const WELL: EncounterCreate = {
  name: "The dry well",
  kind: "challenge",
  visibility: "shared",
  ready: true,
  tactics: ["Each failure costs a day's water.", SECRET_TACTIC],
  challenge: {
    kind: "challenge",
    dc: 14,
    successes: 2,
    failures: 2,
    skills: ["Athletics", "Survival"],
    onSuccess: SECRET_OUTCOME,
    onFailure: "The rope snaps and the well is lost.",
  },
};

const STORM: EncounterCreate = {
  name: "Salt-flat sandstorm",
  kind: "hazard",
  challenge: {
    kind: "hazard",
    save: { ability: "CON", dc: 13 },
    onFail: "1 level of exhaustion",
    duration: "1d4 hours",
    skills: ["Survival"],
  },
};

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const seatedIlse = yield* run(admittedTo(table, ilse.actor, "Ilse"));
  const brannoc = (yield* run(
    aCharacterAt(table, seatedIlse, { name: "Brannoc", hpMax: 30 }, { seatVisibility: "shared" }),
  )).character.id;
  // Admitted through a real invitation, then withdrawn by the creator: still
  // in the Shared World, no longer at this table.
  const withdrawn = yield* aPerson("Wren");
  yield* run(
    Effect.gen(function* () {
      const invites = yield* Invites;
      const proof = yield* asDm(jo.actor, table);
      const issued = yield* invites.createForCampaign(proof, { label: "Wren" });
      yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, withdrawn.actor);
      yield* invites.revokeForCampaign(proof, issued.invite.id);
    }),
  );

  const hag = yield* run(
    Effect.flatMap(Creatures, (creatures) =>
      Effect.provideService(
        creatures.libraryCreate({ name: "Marsh Hag", type: "Fey", cr: "2", ac: 17, hp: 82 }),
        CurrentActor,
        jo.actor,
      ),
    ),
  );
  const bargain = (yield* as(jo.token, (client) =>
    client.encounters.create({
      params: { campaignId: table },
      payload: {
        name: "A bargain at the ford",
        kind: "social",
        tactics: ["Wants the toll waived", SECRET_TACTIC],
        creatures: [{ creatureId: hag.id, count: 1 }],
      },
    }),
  )).id;
  const well = (yield* as(jo.token, (client) =>
    client.encounters.create({ params: { campaignId: table }, payload: WELL }),
  )).id;
  const storm = (yield* as(jo.token, (client) =>
    client.encounters.create({ params: { campaignId: table }, payload: STORM }),
  )).id;

  const night = (yield* as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number: 1, visibility: "shared" },
    }),
  )).id;
  yield* as(jo.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: night },
    }),
  );

  const params = (runId: EncounterRunId, sessionId: SessionId = night) => ({
    campaignId: table,
    sessionId,
    runId,
  });
  return { jo, ilse, stranger, withdrawn, table, night, brannoc, bargain, well, storm, params };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "run-scenes.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const startRun = (encounterId: EncounterId, sessionId?: SessionId) =>
  Effect.flatMap(Fixture, ({ jo, table, night }) =>
    as(jo.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId: sessionId ?? night },
        payload: { encounterId, visibility: "shared" },
      }),
    ),
  );

/**
 * Another dry well, written from the same payload. An encounter is played once
 * (`playthroughOf` in `repo/EncounterRuns.ts`), so each skill challenge a test
 * starts after the first is an encounter of its own.
 */
const aWell = Effect.flatMap(Fixture, ({ jo, table }) =>
  as(jo.token, (client) =>
    client.encounters.create({ params: { campaignId: table }, payload: WELL }),
  ).pipe(Effect.map((made) => made.id)),
);

const endRun = (runId: EncounterRunId, sessionId?: SessionId) =>
  Effect.flatMap(Fixture, ({ jo, table, night }) =>
    as(jo.token, (client) =>
      client.runs.end({
        params: { campaignId: table, sessionId: sessionId ?? night, runId },
        payload: {},
      }),
    ),
  );

const sceneOf = (runId: EncounterRunId, sessionId?: SessionId) =>
  Effect.flatMap(Fixture, ({ jo, params }) =>
    as(jo.token, (client) => client.runs.scene({ params: params(runId, sessionId) })),
  );

/** The party member's row in this run — whom a check is logged against. */
const brannocIn = (runId: EncounterRunId, sessionId?: SessionId) =>
  Effect.gen(function* () {
    const { jo, brannoc, params } = yield* Fixture;
    const rows = yield* as(jo.token, (client) =>
      client.combatants.list({ params: params(runId, sessionId) }),
    );
    return rows.find((row) => row.characterId === brannoc)!.id;
  });

/** The skill challenge the first describe plays, ended when it is done. */
class Challenge extends Context.Service<Challenge, EncounterRun>()("run-scenes.test/Challenge") {}

const makeChallenge = Effect.acquireRelease(
  Effect.flatMap(Fixture, ({ well }) => startRun(well)),
  (challenge) => endRun(challenge.id),
);

/** The conversation its describe plays, and escalates into a fight. */
class Talk extends Context.Service<Talk, EncounterRun>()("run-scenes.test/Talk") {}

const makeTalk = Effect.flatMap(Fixture, ({ bargain }) => startRun(bargain));

const makeScene = Effect.acquireRelease(
  Effect.gen(function* () {
    const { jo, params } = yield* Fixture;
    const scene = yield* startRun(yield* aWell);
    const who = yield* brannocIn(scene.id);
    const checkId = (yield* as(jo.token, (client) =>
      client.runs.logCheck({
        params: params(scene.id),
        payload: { combatantId: who, skill: SECRET_SKILL, total: 3 },
      }),
    )).id;
    return { scene, checkId };
  }),
  ({ scene }) => endRun(scene.id),
);

/** A skill challenge with one check logged, ended when its describe is done. */
class Scene extends Context.Service<Scene, Effect.Success<typeof makeScene>>()(
  "run-scenes.test/Scene",
) {}

describeLayer("run-scenes", shared, (it) => {
  it.layer(Layer.effect(Challenge)(makeChallenge))("a skill challenge", (it) => {
    it.effect("runs as its encounter's kind, with nobody up and no turns to take", () =>
      Effect.gen(function* () {
        const challenge = yield* Challenge;
        const { jo, params } = yield* Fixture;
        expect(challenge.mode).toBe("challenge");
        expect(challenge.activeCombatantId).toBeNull();
        const refused = yield* attempt(jo.token, (client) =>
          client.runs.nextTurn({ params: params(challenge.id), payload: {} }),
        );
        expect(refused).toEqual({ ok: false, tag: "Conflict" });
      }),
    );

    it.effect("snapshots the prep's tactics as beats and its numbers, outcome lines included", () =>
      Effect.gen(function* () {
        const challenge = yield* Challenge;
        const { jo, table, well } = yield* Fixture;
        const scene = yield* sceneOf(challenge.id);
        expect(scene.beats).toEqual([
          { text: "Each failure costs a day's water.", done: false },
          { text: SECRET_TACTIC, done: false },
        ]);
        expect(scene.challenge).toEqual(WELL.challenge);
        expect(scene).toMatchObject({ attitude: null, stage: null, stages: null, checks: [] });

        // A later edit to the template is the next run's, never this one's.
        yield* as(jo.token, (client) =>
          client.encounters.update({
            params: { campaignId: table, encounterId: well },
            payload: { tactics: ["Rewritten after the fact"] },
          }),
        );
        expect((yield* sceneOf(challenge.id)).beats).toHaveLength(2);
      }),
    );

    it.effect(
      "logs checks against its DC, settles at its target, and reopens when one is removed",
      () =>
        Effect.gen(function* () {
          const challenge = yield* Challenge;
          const { jo, params } = yield* Fixture;
          const who = yield* brannocIn(challenge.id);
          const log = (payload: Parameters<Client["runs"]["logCheck"]>[0]["payload"]) =>
            attempt(jo.token, (client) =>
              client.runs.logCheck({ params: params(challenge.id), payload }),
            );

          const first = yield* log({ combatantId: who, skill: "Athletics", total: 15 });
          expect(first.ok && first.value).toMatchObject({
            displayName: "Brannoc",
            skill: "Athletics",
            save: null,
            total: 15,
            dc: 14,
            outcome: "success",
            stage: null,
          });

          // A double-tapped Log check is one row.
          const tap = yield* log({
            combatantId: who,
            skill: "Survival",
            total: 9,
            requestId: "tap-1",
          });
          const again = yield* log({
            combatantId: who,
            skill: "Survival",
            total: 9,
            requestId: "tap-1",
          });
          expect(tap.ok && again.ok && again.value.id === tap.value.id).toBe(true);
          expect(tap.ok && tap.value.outcome).toBe("failure");

          // Nothing to work the outcome out from, and nobody said how it went.
          expect(yield* log({ combatantId: who, skill: "Athletics" })).toEqual({
            ok: false,
            tag: "Conflict",
          });

          const second = yield* log({ combatantId: who, skill: SECRET_SKILL, outcome: "success" });
          expect(second.ok).toBe(true);
          // Two successes of two: won, and closed to more.
          expect(yield* log({ combatantId: who, skill: "Athletics", total: 20 })).toEqual({
            ok: false,
            tag: "Conflict",
          });

          // A check logged by mistake comes out, and the challenge is open again.
          if (!second.ok) throw new Error("unreachable");
          yield* as(jo.token, (client) =>
            client.runs.removeCheck({
              params: { ...params(challenge.id), checkId: second.value.id },
            }),
          );
          const scene = yield* sceneOf(challenge.id);
          expect(scene.checks.map((check) => check.id)).not.toContain(second.value.id);
          expect(scene.checks).toHaveLength(2);
          expect((yield* log({ combatantId: who, skill: SECRET_SKILL, total: 30 })).ok).toBe(true);

          // Removing it twice is a 404, not a second event.
          expect(
            yield* tagOf(jo.token, (client) =>
              client.runs.removeCheck({
                params: { ...params(challenge.id), checkId: second.value.id },
              }),
            ),
          ).toBe("NotFound");
        }),
    );

    it.effect("refuses a check naming a skill and a save, or neither", () =>
      Effect.gen(function* () {
        const challenge = yield* Challenge;
        const { jo, table, night } = yield* Fixture;
        const who = yield* brannocIn(challenge.id);
        const path = `/campaigns/${table}/sessions/${night}/runs/${challenge.id}/checks`;
        expect(yield* rawPost(jo.token, path, { combatantId: who, outcome: "success" })).toBe(400);
        expect(
          yield* rawPost(jo.token, path, {
            combatantId: who,
            skill: "Athletics",
            save: "CON",
            outcome: "success",
          }),
        ).toBe(400);
      }),
    );

    it.effect("names only a combatant of this run", () =>
      Effect.gen(function* () {
        const challenge = yield* Challenge;
        const { jo, params } = yield* Fixture;
        const outcome = yield* tagOf(jo.token, (client) =>
          client.runs.logCheck({
            params: params(challenge.id),
            payload: {
              combatantId: crypto.randomUUID() as never,
              skill: "Athletics",
              outcome: "success",
            },
          }),
        );
        expect(outcome).toBe("NotFound");
      }),
    );
  });

  it.layer(Layer.effect(Talk)(makeTalk))("a conversation", (it) => {
    it.effect(
      "takes the DM's attitude note and beat ticks, and nothing that is another scene's",
      () =>
        Effect.gen(function* () {
          const talk = yield* Talk;
          const { jo, params } = yield* Fixture;
          expect(talk.mode).toBe("social");
          const update = (payload: Parameters<Client["runs"]["updateScene"]>[0]["payload"]) =>
            attempt(jo.token, (client) =>
              client.runs.updateScene({ params: params(talk.id), payload }),
            );

          const noted = yield* update({ attitude: "hostile", beat: { index: 1, done: true } });
          expect(noted.ok && noted.value).toMatchObject({
            attitude: "hostile",
            beats: [
              { text: "Wants the toll waived", done: false },
              { text: SECRET_TACTIC, done: true },
            ],
          });
          const unticked = yield* update({ beat: { index: 1, done: false } });
          expect(unticked.ok && unticked.value.beats[1]!.done).toBe(false);

          expect(yield* update({ stages: 3 })).toEqual({ ok: false, tag: "Conflict" });
          expect(yield* update({ beat: { index: 2, done: true } })).toEqual({
            ok: false,
            tag: "Conflict",
          });
        }),
    );

    it.effect("takes the DC the DM sets on each check, since attitude sets none", () =>
      Effect.gen(function* () {
        const talk = yield* Talk;
        const { jo, params } = yield* Fixture;
        const who = yield* brannocIn(talk.id);
        const logged = yield* as(jo.token, (client) =>
          client.runs.logCheck({
            params: params(talk.id),
            payload: { combatantId: who, skill: "Persuasion", total: 12, dc: 15 },
          }),
        );
        expect(logged).toMatchObject({ dc: 15, outcome: "failure" });
      }),
    );

    it.effect("turns into a fight once, keeping who is there and what was said", () =>
      Effect.gen(function* () {
        const talk = yield* Talk;
        const { jo, params } = yield* Fixture;
        const before = yield* as(jo.token, (client) =>
          client.combatants.list({ params: params(talk.id) }),
        );
        const fight = yield* as(jo.token, (client) =>
          client.runs.escalate({ params: params(talk.id), payload: {} }),
        );
        // It opens as any fight does: rolling initiative, with nobody up and no
        // numbers yet.
        expect(fight).toMatchObject({
          id: talk.id,
          mode: "combat",
          phase: "initiative",
          round: 1,
          activeCombatantId: null,
        });
        const after = yield* as(jo.token, (client) =>
          client.combatants.list({ params: params(talk.id) }),
        );
        expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
        expect(after.every((row) => row.initiative === null)).toBe(true);
        expect((yield* sceneOf(talk.id)).checks).toHaveLength(1);
        expect(
          yield* tagOf(jo.token, (client) =>
            client.runs.nextTurn({ params: params(talk.id), payload: {} }),
          ),
        ).toBe("Conflict");

        // Every number in, round 1 starts on whoever is first.
        const ordered = yield* as(jo.token, (client) =>
          client.runs.setInitiative({
            params: params(talk.id),
            payload: {
              entries: after.map((row, index) => ({ combatantId: row.id, initiative: 20 - index })),
            },
          }),
        );
        const begun = yield* as(jo.token, (client) =>
          client.runs.begin({ params: params(talk.id), payload: {} }),
        );
        expect(begun).toMatchObject({ phase: "turns", activeCombatantId: ordered[0]!.id });

        // One way: a fight does not escalate, takes turns, and logs no checks.
        expect(
          yield* tagOf(jo.token, (client) =>
            client.runs.escalate({ params: params(talk.id), payload: {} }),
          ),
        ).toBe("Conflict");
        expect(
          yield* tagOf(jo.token, (client) =>
            client.runs.nextTurn({ params: params(talk.id), payload: {} }),
          ),
        ).toBe("ok");
        expect(
          yield* tagOf(jo.token, (client) =>
            client.runs.logCheck({
              params: params(talk.id),
              payload: { combatantId: before[0]!.id, skill: "Insight", outcome: "success" },
            }),
          ),
        ).toBe("Conflict");
        expect(
          yield* tagOf(jo.token, (client) =>
            client.runs.updateScene({ params: params(talk.id), payload: { attitude: "friendly" } }),
          ),
        ).toBe("Conflict");
        yield* endRun(talk.id);
      }),
    );

    it.effect(
      "is the only scene that escalates, and no scene rolls initiative until it is a fight",
      () =>
        Effect.gen(function* () {
          const { jo, params } = yield* Fixture;
          const challenge = yield* startRun(yield* aWell);
          expect(
            yield* tagOf(jo.token, (client) =>
              client.runs.escalate({ params: params(challenge.id), payload: {} }),
            ),
          ).toBe("Conflict");
          for (const press of ["begin", "reroll"] as const) {
            expect(
              yield* tagOf(jo.token, (client) =>
                client.runs[press]({ params: params(challenge.id), payload: {} }),
              ),
            ).toBe("Conflict");
          }
          yield* endRun(challenge.id);
        }),
    );
  });

  describe("a hazard", () => {
    it.effect(
      "stamps each save with its stage, one per creature per stage, within the stages set",
      () =>
        Effect.gen(function* () {
          const { jo, storm, params } = yield* Fixture;
          const hazard = yield* startRun(storm);
          expect(hazard.mode).toBe("hazard");
          const who = yield* brannocIn(hazard.id);
          const update = (payload: Parameters<Client["runs"]["updateScene"]>[0]["payload"]) =>
            attempt(jo.token, (client) =>
              client.runs.updateScene({ params: params(hazard.id), payload }),
            );
          const save = (total: number) =>
            attempt(jo.token, (client) =>
              client.runs.logCheck({
                params: params(hazard.id),
                payload: { combatantId: who, save: "CON", total },
              }),
            );

          // A stage needs its stages first, and lies within them.
          expect(yield* update({ stage: 1 })).toEqual({ ok: false, tag: "Conflict" });
          expect(yield* update({ attitude: "friendly" })).toEqual({ ok: false, tag: "Conflict" });
          const set = yield* update({ stages: 3, stage: 1 });
          expect(set.ok && set.value).toMatchObject({ stages: 3, stage: 1 });
          expect(yield* update({ stage: 4 })).toEqual({ ok: false, tag: "Conflict" });
          expect(yield* update({ stages: 0 as never })).toMatchObject({ ok: false });

          const failed = yield* save(10);
          expect(failed.ok && failed.value).toMatchObject({
            save: "CON",
            skill: null,
            dc: 13,
            outcome: "failure",
            stage: 1,
          });
          expect(yield* save(18)).toEqual({ ok: false, tag: "Conflict" });

          // A wrong one is removed and made again, and the next stage takes its own.
          if (!failed.ok) throw new Error("unreachable");
          yield* as(jo.token, (client) =>
            client.runs.removeCheck({ params: { ...params(hazard.id), checkId: failed.value.id } }),
          );
          expect((yield* save(18)).ok).toBe(true);
          yield* update({ stage: 2 });
          const next = yield* save(5);
          expect(next.ok && next.value).toMatchObject({ stage: 2, outcome: "failure" });
          yield* endRun(hazard.id);
        }),
    );
  });

  it.layer(Layer.effect(Scene)(makeScene))("the scene is the creator's alone", (it) => {
    it.effect(
      "refuses the seated player, the withdrawn member and the stranger with NotFound",
      () =>
        Effect.gen(function* () {
          const { scene, checkId } = yield* Scene;
          const { ilse, stranger, withdrawn, params } = yield* Fixture;
          for (const token of [ilse.token, stranger.token, withdrawn.token]) {
            const tags = yield* Effect.all(
              [
                tagOf(token, (client) => client.runs.scene({ params: params(scene.id) })),
                tagOf(token, (client) =>
                  client.runs.updateScene({
                    params: params(scene.id),
                    payload: { beat: { index: 0, done: true } },
                  }),
                ),
                tagOf(token, (client) =>
                  client.runs.logCheck({
                    params: params(scene.id),
                    payload: {
                      combatantId: crypto.randomUUID() as never,
                      skill: "x",
                      outcome: "success",
                    },
                  }),
                ),
                tagOf(token, (client) =>
                  client.runs.removeCheck({
                    params: { ...params(scene.id), checkId: checkId as never },
                  }),
                ),
                tagOf(token, (client) =>
                  client.runs.escalate({ params: params(scene.id), payload: {} }),
                ),
              ],
              { concurrency: "unbounded" },
            );
            expect(tags).toEqual(Array(tags.length).fill("NotFound"));
          }
          // …and none of it moved anything.
          const after = yield* sceneOf(scene.id);
          expect(after.beats.every((beat) => !beat.done)).toBe(true);
          expect(after.checks.map((check) => check.id)).toEqual([checkId]);
        }),
    );

    it.effect("shows a seated player no initiative order and no scene on the table", () =>
      Effect.gen(function* () {
        const { scene } = yield* Scene;
        const { jo, ilse, table, params } = yield* Fixture;
        // Every row shared, so what is missing is missing because this is not a
        // fight — the player's own row still makes their seat.
        const rows = yield* as(jo.token, (client) =>
          client.combatants.list({ params: params(scene.id) }),
        );
        for (const row of rows) {
          yield* as(jo.token, (client) =>
            client.combatants.update({
              params: { ...params(scene.id), combatantId: row.id },
              payload: { visibility: "shared" },
            }),
          );
        }
        const table_ = yield* as(ilse.token, (client) =>
          client.table.read({ params: { campaignId: table } }),
        );
        expect(table_?.fight).toMatchObject({ id: scene.id, order: [], upNext: null });
        expect(table_?.fight?.seats).toHaveLength(1);

        const raw = yield* rawBody(ilse.token, `/campaigns/${table}/table`);
        expect(raw.status).toBe(200);
        for (const secret of [
          SECRET_TACTIC,
          SECRET_OUTCOME,
          SECRET_SKILL,
          '"dc"',
          '"beats"',
          '"checks"',
        ]) {
          expect(raw.text).not.toContain(secret);
        }
      }),
    );

    it.effect("puts the checks in the creator's recap and nowhere in the player's", () =>
      Effect.gen(function* () {
        const { scene, checkId } = yield* Scene;
        const { jo, ilse, table, night } = yield* Fixture;
        const recap = yield* as(jo.token, (client) =>
          client.recap.read({ params: { campaignId: table, sessionId: night } }),
        );
        const fight = recap.fights.find((entry) => entry.run.id === scene.id)!;
        expect(fight.run.mode).toBe("challenge");
        expect(fight.checks.map((check) => check.id)).toEqual([checkId]);
        // What the Chronicle counts the log against: the challenge's own numbers.
        expect(fight.scene?.challenge).toMatchObject({
          kind: "challenge",
          onSuccess: SECRET_OUTCOME,
        });
        for (const other of recap.fights.filter((entry) => entry.run.mode === "combat")) {
          expect(other.scene).toBeNull();
        }

        const raw = yield* rawBody(
          ilse.token,
          `/campaigns/${table}/sessions/${night}/recap/player`,
        );
        expect(raw.status).toBe(200);
        expect(raw.text).toContain(scene.id);
        for (const secret of [
          SECRET_TACTIC,
          SECRET_OUTCOME,
          SECRET_SKILL,
          '"checks"',
          '"scene"',
          '"successes"',
        ]) {
          expect(raw.text).not.toContain(secret);
        }
      }),
    );
  });

  describe("a scene carried to the next night", () => {
    it.effect(
      "picks up with its mode, its beats, its notes and its log, pointing at the new rows",
      () =>
        Effect.gen(function* () {
          const { jo, table, params } = yield* Fixture;
          const first = yield* as(jo.token, (client) =>
            client.sessions.create({
              params: { campaignId: table },
              payload: { number: 2, visibility: "shared" },
            }),
          );
          const scene = yield* startRun(yield* aWell, first.id);
          const who = yield* brannocIn(scene.id, first.id);
          yield* as(jo.token, (client) =>
            client.runs.updateScene({
              params: params(scene.id, first.id),
              payload: { beat: { index: 0, done: true } },
            }),
          );
          yield* as(jo.token, (client) =>
            client.runs.logCheck({
              params: params(scene.id, first.id),
              payload: { combatantId: who, skill: "Athletics", total: 16 },
            }),
          );
          const endedAt = yield* DateTime.now;
          yield* as(jo.token, (client) =>
            client.sessions.update({
              params: { campaignId: table, sessionId: first.id },
              payload: { endedAt },
            }),
          );

          const next = yield* as(jo.token, (client) =>
            client.sessions.create({
              params: { campaignId: table },
              payload: { number: 3, visibility: "shared" },
            }),
          );
          const resumed = yield* as(jo.token, (client) =>
            client.runs.resume({
              params: { campaignId: table, sessionId: next.id },
              payload: { continuedFrom: scene.id },
            }),
          );
          expect(resumed.mode).toBe("challenge");
          const carried = yield* sceneOf(resumed.id, next.id);
          const before = yield* sceneOf(scene.id, first.id);
          expect(carried.beats).toEqual(before.beats);
          expect(carried.challenge).toEqual(before.challenge);
          expect(carried.checks).toHaveLength(1);
          expect(carried.checks[0]).toMatchObject({
            runId: resumed.id,
            combatantId: yield* brannocIn(resumed.id, next.id),
            skill: "Athletics",
            outcome: "success",
          });
          yield* endRun(resumed.id, next.id);
        }),
    );
  });
});
