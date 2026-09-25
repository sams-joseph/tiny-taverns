import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  type CharacterId,
  CurrentActor,
  type EncounterCreate,
  type EncounterId,
  type EncounterRun,
  type EncounterRunId,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { DateTime, Effect, ManagedRuntime, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Creatures } from "../src/repo/Creatures.js";
import { Invites } from "../src/repo/Invites.js";
import { aCharacterAt, admittedTo, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

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

/** The same call, answering the failure's tag rather than dying on it. */
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(
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
    ),
  );

const tagOf = async <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) => {
  const result = await attempt(token, call);
  return result.ok ? "ok" : result.tag;
};

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

/** A request the derived client would refuse to encode, sent as it stands. */
const rawPost = (token: string, path: string, body: unknown) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.post(path).pipe(
          HttpClientRequest.bearerToken(token),
          HttpClientRequest.bodyJsonUnsafe(body),
        ),
      );
      return response.status;
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

let jo: Person;
let ilse: Person;
let stranger: Person;
let withdrawn: Person;
let table: CampaignId;
let night: SessionId;
let brannoc: CharacterId;
let bargain: EncounterId;
let well: EncounterId;
let storm: EncounterId;

const startRun = (encounterId: EncounterId, sessionId = night) =>
  as(jo.token, (client) =>
    client.runs.start({
      params: { campaignId: table, sessionId },
      payload: { encounterId, visibility: "shared" },
    }),
  );

const endRun = (runId: EncounterRunId, sessionId = night) =>
  as(jo.token, (client) =>
    client.runs.end({ params: { campaignId: table, sessionId, runId }, payload: {} }),
  );

const params = (runId: EncounterRunId, sessionId = night) => ({
  campaignId: table,
  sessionId,
  runId,
});

const sceneOf = (runId: EncounterRunId, sessionId = night) =>
  as(jo.token, (client) => client.runs.scene({ params: params(runId, sessionId) }));

/** The party member's row in this run — whom a check is logged against. */
const brannocIn = async (runId: EncounterRunId, sessionId = night) => {
  const rows = await as(jo.token, (client) =>
    client.combatants.list({ params: params(runId, sessionId) }),
  );
  return rows.find((row) => row.characterId === brannoc)!.id;
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
  brannoc = (
    await run(
      aCharacterAt(table, seatedIlse, { name: "Brannoc", hpMax: 30 }, { seatVisibility: "shared" }),
    )
  ).character.id;
  // Admitted through a real invitation, then withdrawn by the creator: still
  // in the Shared World, no longer at this table.
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
        creatures.libraryCreate({ name: "Marsh Hag", type: "Fey", cr: "2", ac: 17, hp: 82 }),
        CurrentActor,
        jo.actor,
      ),
    ),
  );
  bargain = (
    await as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: {
          name: "A bargain at the ford",
          kind: "social",
          tactics: ["Wants the toll waived", SECRET_TACTIC],
          creatures: [{ creatureId: hag.id, count: 1 }],
        },
      }),
    )
  ).id;
  well = (
    await as(jo.token, (client) =>
      client.encounters.create({ params: { campaignId: table }, payload: WELL }),
    )
  ).id;
  storm = (
    await as(jo.token, (client) =>
      client.encounters.create({ params: { campaignId: table }, payload: STORM }),
    )
  ).id;

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
}, 60_000);

describe("a skill challenge", () => {
  let challenge: EncounterRun;

  beforeAll(async () => {
    challenge = await startRun(well);
  });
  afterAll(() => endRun(challenge.id));

  it("runs as its encounter's kind, with nobody up and no turns to take", async () => {
    expect(challenge.mode).toBe("challenge");
    expect(challenge.activeCombatantId).toBeNull();
    const refused = await attempt(jo.token, (client) =>
      client.runs.nextTurn({ params: params(challenge.id), payload: {} }),
    );
    expect(refused).toEqual({ ok: false, tag: "Conflict" });
  });

  it("snapshots the prep's tactics as beats and its numbers, outcome lines included", async () => {
    const scene = await sceneOf(challenge.id);
    expect(scene.beats).toEqual([
      { text: "Each failure costs a day's water.", done: false },
      { text: SECRET_TACTIC, done: false },
    ]);
    expect(scene.challenge).toEqual(WELL.challenge);
    expect(scene).toMatchObject({ attitude: null, stage: null, stages: null, checks: [] });

    // A later edit to the template is the next run's, never this one's.
    await as(jo.token, (client) =>
      client.encounters.update({
        params: { campaignId: table, encounterId: well },
        payload: { tactics: ["Rewritten after the fact"] },
      }),
    );
    expect((await sceneOf(challenge.id)).beats).toHaveLength(2);
  });

  it("logs checks against its DC, settles at its target, and reopens when one is removed", async () => {
    const who = await brannocIn(challenge.id);
    const log = (payload: Parameters<Client["runs"]["logCheck"]>[0]["payload"]) =>
      attempt(jo.token, (client) =>
        client.runs.logCheck({ params: params(challenge.id), payload }),
      );

    const first = await log({ combatantId: who, skill: "Athletics", total: 15 });
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
    const tap = await log({ combatantId: who, skill: "Survival", total: 9, requestId: "tap-1" });
    const again = await log({ combatantId: who, skill: "Survival", total: 9, requestId: "tap-1" });
    expect(tap.ok && again.ok && again.value.id === tap.value.id).toBe(true);
    expect(tap.ok && tap.value.outcome).toBe("failure");

    // Nothing to work the outcome out from, and nobody said how it went.
    expect(await log({ combatantId: who, skill: "Athletics" })).toEqual({
      ok: false,
      tag: "Conflict",
    });

    const second = await log({ combatantId: who, skill: SECRET_SKILL, outcome: "success" });
    expect(second.ok).toBe(true);
    // Two successes of two: won, and closed to more.
    expect(await log({ combatantId: who, skill: "Athletics", total: 20 })).toEqual({
      ok: false,
      tag: "Conflict",
    });

    // A check logged by mistake comes out, and the challenge is open again.
    if (!second.ok) throw new Error("unreachable");
    await as(jo.token, (client) =>
      client.runs.removeCheck({ params: { ...params(challenge.id), checkId: second.value.id } }),
    );
    const scene = await sceneOf(challenge.id);
    expect(scene.checks.map((check) => check.id)).not.toContain(second.value.id);
    expect(scene.checks).toHaveLength(2);
    expect((await log({ combatantId: who, skill: SECRET_SKILL, total: 30 })).ok).toBe(true);

    // Removing it twice is a 404, not a second event.
    expect(
      await tagOf(jo.token, (client) =>
        client.runs.removeCheck({ params: { ...params(challenge.id), checkId: second.value.id } }),
      ),
    ).toBe("NotFound");
  });

  it("refuses a check naming a skill and a save, or neither", async () => {
    const who = await brannocIn(challenge.id);
    const path = `/campaigns/${table}/sessions/${night}/runs/${challenge.id}/checks`;
    expect(await rawPost(jo.token, path, { combatantId: who, outcome: "success" })).toBe(400);
    expect(
      await rawPost(jo.token, path, {
        combatantId: who,
        skill: "Athletics",
        save: "CON",
        outcome: "success",
      }),
    ).toBe(400);
  });

  it("names only a combatant of this run", async () => {
    const outcome = await tagOf(jo.token, (client) =>
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
  });
});

describe("a conversation", () => {
  let talk: EncounterRun;

  beforeAll(async () => {
    talk = await startRun(bargain);
  });

  it("takes the DM's attitude note and beat ticks, and nothing that is another scene's", async () => {
    expect(talk.mode).toBe("social");
    const update = (payload: Parameters<Client["runs"]["updateScene"]>[0]["payload"]) =>
      attempt(jo.token, (client) => client.runs.updateScene({ params: params(talk.id), payload }));

    const noted = await update({ attitude: "hostile", beat: { index: 1, done: true } });
    expect(noted.ok && noted.value).toMatchObject({
      attitude: "hostile",
      beats: [
        { text: "Wants the toll waived", done: false },
        { text: SECRET_TACTIC, done: true },
      ],
    });
    const unticked = await update({ beat: { index: 1, done: false } });
    expect(unticked.ok && unticked.value.beats[1]!.done).toBe(false);

    expect(await update({ stages: 3 })).toEqual({ ok: false, tag: "Conflict" });
    expect(await update({ beat: { index: 2, done: true } })).toEqual({
      ok: false,
      tag: "Conflict",
    });
  });

  it("takes the DC the DM sets on each check, since attitude sets none", async () => {
    const who = await brannocIn(talk.id);
    const logged = await as(jo.token, (client) =>
      client.runs.logCheck({
        params: params(talk.id),
        payload: { combatantId: who, skill: "Persuasion", total: 12, dc: 15 },
      }),
    );
    expect(logged).toMatchObject({ dc: 15, outcome: "failure" });
  });

  it("turns into a fight once, keeping who is there and what was said", async () => {
    const before = await as(jo.token, (client) =>
      client.combatants.list({ params: params(talk.id) }),
    );
    const fight = await as(jo.token, (client) =>
      client.runs.escalate({ params: params(talk.id), payload: {} }),
    );
    expect(fight).toMatchObject({ id: talk.id, mode: "combat", round: 1 });
    expect(before.map((row) => row.id)).toContain(fight.activeCombatantId);
    const after = await as(jo.token, (client) =>
      client.combatants.list({ params: params(talk.id) }),
    );
    expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
    expect((await sceneOf(talk.id)).checks).toHaveLength(1);

    // One way: a fight does not escalate, takes turns, and logs no checks.
    expect(
      await tagOf(jo.token, (client) =>
        client.runs.escalate({ params: params(talk.id), payload: {} }),
      ),
    ).toBe("Conflict");
    expect(
      await tagOf(jo.token, (client) =>
        client.runs.nextTurn({ params: params(talk.id), payload: {} }),
      ),
    ).toBe("ok");
    expect(
      await tagOf(jo.token, (client) =>
        client.runs.logCheck({
          params: params(talk.id),
          payload: { combatantId: before[0]!.id, skill: "Insight", outcome: "success" },
        }),
      ),
    ).toBe("Conflict");
    expect(
      await tagOf(jo.token, (client) =>
        client.runs.updateScene({ params: params(talk.id), payload: { attitude: "friendly" } }),
      ),
    ).toBe("Conflict");
    await endRun(talk.id);
  });

  it("is the only scene that escalates", async () => {
    const challenge = await startRun(well);
    expect(
      await tagOf(jo.token, (client) =>
        client.runs.escalate({ params: params(challenge.id), payload: {} }),
      ),
    ).toBe("Conflict");
    await endRun(challenge.id);
  });
});

describe("a hazard", () => {
  it("stamps each save with its stage, one per creature per stage, within the stages set", async () => {
    const hazard = await startRun(storm);
    expect(hazard.mode).toBe("hazard");
    const who = await brannocIn(hazard.id);
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
    expect(await update({ stage: 1 })).toEqual({ ok: false, tag: "Conflict" });
    expect(await update({ attitude: "friendly" })).toEqual({ ok: false, tag: "Conflict" });
    const set = await update({ stages: 3, stage: 1 });
    expect(set.ok && set.value).toMatchObject({ stages: 3, stage: 1 });
    expect(await update({ stage: 4 })).toEqual({ ok: false, tag: "Conflict" });
    expect(await update({ stages: 0 as never })).toMatchObject({ ok: false });

    const failed = await save(10);
    expect(failed.ok && failed.value).toMatchObject({
      save: "CON",
      skill: null,
      dc: 13,
      outcome: "failure",
      stage: 1,
    });
    expect(await save(18)).toEqual({ ok: false, tag: "Conflict" });

    // A wrong one is removed and made again, and the next stage takes its own.
    if (!failed.ok) throw new Error("unreachable");
    await as(jo.token, (client) =>
      client.runs.removeCheck({ params: { ...params(hazard.id), checkId: failed.value.id } }),
    );
    expect((await save(18)).ok).toBe(true);
    await update({ stage: 2 });
    const next = await save(5);
    expect(next.ok && next.value).toMatchObject({ stage: 2, outcome: "failure" });
    await endRun(hazard.id);
  });
});

describe("the scene is the creator's alone", () => {
  let scene: EncounterRun;
  let checkId: string;

  beforeAll(async () => {
    scene = await startRun(well);
    const who = await brannocIn(scene.id);
    checkId = (
      await as(jo.token, (client) =>
        client.runs.logCheck({
          params: params(scene.id),
          payload: { combatantId: who, skill: SECRET_SKILL, total: 3 },
        }),
      )
    ).id;
  });
  afterAll(() => endRun(scene.id));

  it("refuses the seated player, the withdrawn member and the stranger with NotFound", async () => {
    for (const token of [ilse.token, stranger.token, withdrawn.token]) {
      const tags = await Promise.all([
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
            payload: { combatantId: crypto.randomUUID() as never, skill: "x", outcome: "success" },
          }),
        ),
        tagOf(token, (client) =>
          client.runs.removeCheck({ params: { ...params(scene.id), checkId: checkId as never } }),
        ),
        tagOf(token, (client) => client.runs.escalate({ params: params(scene.id), payload: {} })),
      ]);
      expect(tags).toEqual(Array(tags.length).fill("NotFound"));
    }
    // …and none of it moved anything.
    const after = await sceneOf(scene.id);
    expect(after.beats.every((beat) => !beat.done)).toBe(true);
    expect(after.checks.map((check) => check.id)).toEqual([checkId]);
  });

  it("shows a seated player no initiative order and no scene on the table", async () => {
    // Every row shared, so what is missing is missing because this is not a
    // fight — the player's own row still makes their seat.
    const rows = await as(jo.token, (client) =>
      client.combatants.list({ params: params(scene.id) }),
    );
    for (const row of rows) {
      await as(jo.token, (client) =>
        client.combatants.update({
          params: { ...params(scene.id), combatantId: row.id },
          payload: { visibility: "shared" },
        }),
      );
    }
    const table_ = await as(ilse.token, (client) =>
      client.table.read({ params: { campaignId: table } }),
    );
    expect(table_?.fight).toMatchObject({ id: scene.id, order: [], upNext: null });
    expect(table_?.fight?.seats).toHaveLength(1);

    const raw = await rawBody(ilse.token, `/campaigns/${table}/table`);
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
  });

  it("puts the checks in the creator's recap and nowhere in the player's", async () => {
    const recap = await as(jo.token, (client) =>
      client.recap.read({ params: { campaignId: table, sessionId: night } }),
    );
    const fight = recap.fights.find((entry) => entry.run.id === scene.id)!;
    expect(fight.run.mode).toBe("challenge");
    expect(fight.checks.map((check) => check.id)).toEqual([checkId]);

    const raw = await rawBody(ilse.token, `/campaigns/${table}/sessions/${night}/recap/player`);
    expect(raw.status).toBe(200);
    expect(raw.text).toContain(scene.id);
    for (const secret of [SECRET_TACTIC, SECRET_OUTCOME, SECRET_SKILL, '"checks"']) {
      expect(raw.text).not.toContain(secret);
    }
  });
});

describe("a scene carried to the next night", () => {
  it("picks up with its mode, its beats, its notes and its log, pointing at the new rows", async () => {
    const first = await as(jo.token, (client) =>
      client.sessions.create({
        params: { campaignId: table },
        payload: { number: 2, visibility: "shared" },
      }),
    );
    const scene = await startRun(well, first.id);
    const who = await brannocIn(scene.id, first.id);
    await as(jo.token, (client) =>
      client.runs.updateScene({
        params: params(scene.id, first.id),
        payload: { beat: { index: 0, done: true } },
      }),
    );
    await as(jo.token, (client) =>
      client.runs.logCheck({
        params: params(scene.id, first.id),
        payload: { combatantId: who, skill: "Athletics", total: 16 },
      }),
    );
    const endedAt = await runtime.runPromise(DateTime.now);
    await as(jo.token, (client) =>
      client.sessions.update({
        params: { campaignId: table, sessionId: first.id },
        payload: { endedAt },
      }),
    );

    const next = await as(jo.token, (client) =>
      client.sessions.create({
        params: { campaignId: table },
        payload: { number: 3, visibility: "shared" },
      }),
    );
    const resumed = await as(jo.token, (client) =>
      client.runs.resume({
        params: { campaignId: table, sessionId: next.id },
        payload: { continuedFrom: scene.id },
      }),
    );
    expect(resumed.mode).toBe("challenge");
    const carried = await sceneOf(resumed.id, next.id);
    const before = await sceneOf(scene.id, first.id);
    expect(carried.beats).toEqual(before.beats);
    expect(carried.challenge).toEqual(before.challenge);
    expect(carried.checks).toHaveLength(1);
    expect(carried.checks[0]).toMatchObject({
      runId: resumed.id,
      combatantId: await brannocIn(resumed.id, next.id),
      skill: "Athletics",
      outcome: "success",
    });
    await endRun(resumed.id, next.id);
  });
});
