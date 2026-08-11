import {
  Actor,
  type CombatantId,
  Conflict,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { migratedDatabase } from "./support/database.js";

/**
 * A fight that crosses nights.
 *
 * The captain settled two things and this file is what holds them: **a night
 * may be finished with a fight still on the table**, and **the fight that
 * carries is a second `encounter_run` row** linked back through
 * `continued_from`, not the same row reparented.
 *
 * Three of these tests are about constraints that were correct when a run could
 * not outlive its session, and had to be re-examined against one that can:
 *
 * - `encounter_run_one_live_per_session` still holds *within* a session — the
 *   carried run has `ended_at` set, so the next night's successor is the only
 *   live one and the index never sees two candidates;
 * - `campaign_current_session_id_fkey` still refuses a finished session as a
 *   campaign's current session, carried fight or not;
 * - and `encounter_run_one_successor` is the new one: two nights cannot both
 *   claim to continue the same fight.
 *
 * The copy-drift test is the one to keep honest as `combatant` grows. A column
 * added there and forgotten in `EncounterRuns.resume` would silently vanish
 * from a resumed fight — hit points restored and a condition lost — so it sets
 * every column and compares the two rows field by field rather than spot-
 * checking the ones that were interesting today.
 */
const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  Characters.layer,
  Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
  Creatures.layer,
  EncounterCreatures.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Encounters.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_carryover")));
const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

/** What the runtime above can provide — so the `as` helper below can say so. */
type Services = Layer.Success<typeof services>;

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/** One DM, one campaign, one encounter with a party and a roster behind it. */
const makeFixture = Effect.gen(function* () {
  const accounts = yield* Accounts;
  const campaigns = yield* Campaigns;
  const characters = yield* Characters;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const roster = yield* EncounterCreatures;
  const sessions = yield* Sessions;

  const issued = yield* accounts.issue("Jo");
  const dm = new Actor({ accountId: issued.accountId, role: "dm", campaignId: null });
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road" }));
  yield* as(
    characters.create(campaign.id, {
      name: "Brannoc",
      playerName: "Ilse",
      descriptor: "Half-orc paladin",
      ac: 18,
      hpMax: 52,
    }),
  );
  const hag = yield* as(
    creatures.create(campaign.id, {
      name: "Marsh Hag",
      size: "Medium",
      type: "Fey",
      cr: "5",
      ac: 17,
      hp: 82,
    }),
  );
  const encounter = yield* as(
    encounters.create(campaign.id, { name: "Ambush in the reeds", difficulty: "Medium" }),
  );
  yield* as(roster.create(campaign.id, encounter.id, { creatureId: hag.id, count: 2 }));

  return { dm, campaigns, sessions, campaign, encounter };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;
let runs: (typeof EncounterRuns)["Service"];
let combatants: (typeof Combatants)["Service"];
let events: (typeof SessionEvents)["Service"];
let sessions: (typeof Sessions)["Service"];
let campaigns: (typeof Campaigns)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  runs = await runtime.runPromise(EncounterRuns);
  combatants = await runtime.runPromise(Combatants);
  events = await runtime.runPromise(SessionEvents);
  sessions = await runtime.runPromise(Sessions);
  campaigns = await runtime.runPromise(Campaigns);
}, 60_000);

const as = <A, E, R extends Services>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
  runtime.runPromise(withActor(fixture.dm)(effect).pipe(Effect.orDie));

/** A session of its own per test, so no two tests share the live-run index. */
let nextNumber = 100;
const freshSession = (): Promise<{ readonly id: SessionId; readonly number: number }> => {
  nextNumber += 1;
  return as(fixture.sessions.create(fixture.campaign.id, { number: nextNumber }));
};

const finish = (sessionId: SessionId) =>
  as(
    Effect.flatMap(DateTime.now, (endedAt) =>
      sessions.update(fixture.campaign.id, sessionId, { endedAt }),
    ),
  );

/**
 * A fight mid-flight: a hit landed, a condition on someone, the marker moved,
 * the round rolled over. Everything below asserts against this rather than
 * against a freshly seeded run, because a freshly seeded run is all defaults
 * and a copy of it could be wrong in ways nothing would show.
 */
const aFightInProgress = async (sessionId: SessionId) => {
  const run = await as(
    runs.start(fixture.campaign.id, sessionId, { encounterId: fixture.encounter.id }),
  );
  const order = await as(combatants.list(fixture.campaign.id, sessionId, run.id));
  const hag = order.find((row) => row.kind === "npc")!;
  await as(combatants.damage(fixture.campaign.id, sessionId, run.id, hag.id, { amount: 41 }));
  await as(
    combatants.update(fixture.campaign.id, sessionId, run.id, hag.id, {
      conditions: ["Frightened"],
      initiative: 17,
      visibility: "shared",
    }),
  );
  // Walk the whole order once so the round rolls over and the marker is
  // somewhere other than where a seed leaves it.
  for (let step = 0; step <= order.length; step += 1) {
    await as(runs.nextTurn(fixture.campaign.id, sessionId, run.id, {}));
  }
  const current = await as(runs.findById(fixture.campaign.id, sessionId, run.id));
  return { run: current, order };
};

const rawRun = (id: EncounterRunId) =>
  as(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<{
        readonly session_id: SessionId;
        readonly ended_at: Date | null;
        readonly ended_reason: string;
        readonly continued_from: EncounterRunId | null;
        readonly active_combatant_id: CombatantId | null;
        readonly round: number;
      }>`select * from encounter_run where id = ${id}`;
      return rows[0]!;
    }).pipe(Effect.orDie),
  );

const describeError = (error: unknown): string => {
  let cause: unknown = error;
  const seen: Array<string> = [];
  while (cause !== null && cause !== undefined) {
    seen.push(String(cause));
    cause = (cause as { readonly cause?: unknown }).cause;
  }
  return seen.join("\n");
};

describe("finishing a night with a fight on the table", () => {
  it("carries the fight instead of refusing, and says so in the log", async () => {
    const night = await freshSession();
    const { run } = await aFightInProgress(night.id);
    await as(campaigns.update(fixture.campaign.id, { currentSessionId: night.id }));

    const finished = await finish(night.id);

    expect(finished.endedAt).not.toBeNull();
    // The fight is off the table and marked as waiting — not `resolved`, which
    // is what an ended run means when the DM ended it on purpose.
    const carried = await as(runs.findById(fixture.campaign.id, night.id, run.id));
    expect(carried.endedAt).not.toBeNull();
    expect(carried.endedReason).toBe("carried");
    // …and the session no longer names a fight that is over.
    expect(finished.activeEncounterRunId).toBeNull();

    const log = await as(events.list(fixture.campaign.id, night.id, {}));
    const kinds = log.map((row) => row.kind);
    expect(kinds).toContain("run-carried");
    expect(kinds).not.toContain("run-ended");
    expect(log.find((row) => row.kind === "run-carried")?.encounterRunId).toEqual(run.id);
  }, 60_000);

  it("is one transaction: the pointer, the run and the log move together", async () => {
    // The reason this belongs on the server rather than in the dialog that
    // stamps the end time. A client cannot forget a step it does not take, and
    // a second client would never have seen the first one take it.
    const night = await freshSession();
    const { run } = await aFightInProgress(night.id);
    await as(campaigns.update(fixture.campaign.id, { currentSessionId: night.id }));

    await finish(night.id);

    const campaign = await as(campaigns.findById(fixture.campaign.id));
    const raw = await rawRun(run.id);
    expect(campaign.currentSessionId).toBeNull();
    expect(raw.ended_reason).toBe("carried");
    // Still that night's row. Nothing was reparented.
    expect(raw.session_id).toEqual(night.id);
  }, 60_000);

  it("leaves a night with no fight exactly as it was", async () => {
    const night = await freshSession();
    const finished = await finish(night.id);
    expect(finished.endedAt).not.toBeNull();
    expect(finished.activeEncounterRunId).toBeNull();

    const log = await as(events.list(fixture.campaign.id, night.id, {}));
    expect(log.map((row) => row.kind)).not.toContain("run-carried");
  }, 60_000);

  it("does not touch a fight that was already ended on purpose", async () => {
    const night = await freshSession();
    const { run } = await aFightInProgress(night.id);
    await as(runs.end(fixture.campaign.id, night.id, run.id));

    await finish(night.id);

    const ended = await as(runs.findById(fixture.campaign.id, night.id, run.id));
    expect(ended.endedReason).toBe("resolved");
    const log = await as(events.list(fixture.campaign.id, night.id, {}));
    expect(log.map((row) => row.kind)).toContain("run-ended");
    expect(log.map((row) => row.kind)).not.toContain("run-carried");
  }, 60_000);
});

describe("resuming a carried fight", () => {
  it("links back to its predecessor and keeps the round", async () => {
    const first = await freshSession();
    const { run } = await aFightInProgress(first.id);
    await finish(first.id);

    const second = await freshSession();
    const resumed = await as(
      runs.resume(fixture.campaign.id, second.id, { continuedFrom: run.id }),
    );

    expect(resumed.id).not.toEqual(run.id);
    expect(resumed.continuedFrom).toEqual(run.id);
    expect(resumed.sessionId).toEqual(second.id);
    expect(resumed.round).toEqual(run.round);
    expect(resumed.round).toBeGreaterThan(1);
    expect(resumed.encounterName).toEqual(run.encounterName);
    expect(resumed.endedAt).toBeNull();
    expect(resumed.endedReason).toBe("resolved");
    // Its own night, its own start time — the property the second-row model
    // buys and reparenting would have lost.
    expect(DateTime.toEpochMillis(resumed.startedAt)).toBeGreaterThanOrEqual(
      DateTime.toEpochMillis(run.startedAt),
    );

    const session = await as(sessions.findById(fixture.campaign.id, second.id));
    expect(session.activeEncounterRunId).toEqual(resumed.id);

    const log = await as(events.list(fixture.campaign.id, second.id, {}));
    const resumedEvent = log.find((row) => row.kind === "run-resumed");
    expect(resumedEvent?.encounterRunId).toEqual(resumed.id);
    expect((resumedEvent?.payload as { readonly continuedFrom?: string }).continuedFrom).toEqual(
      run.id,
    );
  }, 60_000);

  it("carries every combatant with its state, column for column", async () => {
    // Copy drift is the risk the second-row model buys, so this compares the
    // whole row rather than the fields that were interesting the day it was
    // written. A column added to `combatant` and not to `EncounterRuns.resume`
    // fails here.
    const first = await freshSession();
    const { run } = await aFightInProgress(first.id);
    const before = await as(combatants.list(fixture.campaign.id, first.id, run.id));
    await finish(first.id);

    const second = await freshSession();
    const resumed = await as(
      runs.resume(fixture.campaign.id, second.id, { continuedFrom: run.id }),
    );
    const after = await as(combatants.list(fixture.campaign.id, second.id, resumed.id));

    /** Everything but identity and when the row was made. */
    const carried = (row: (typeof before)[number]) => ({
      characterId: row.characterId,
      creatureId: row.creatureId,
      displayName: row.displayName,
      subtitle: row.subtitle,
      playerName: row.playerName,
      initiative: row.initiative,
      hpCurrent: row.hpCurrent,
      hpMax: row.hpMax,
      ac: row.ac,
      kind: row.kind,
      conditions: row.conditions,
      visibility: row.visibility,
      origin: row.origin,
      assistantTurnId: row.assistantTurnId,
    });

    /**
     * Compared as a set, and that is a real limitation rather than test
     * convenience.
     *
     * `initiativeOrder` breaks a tie on `created_at` and then on `id`, and both
     * are new for a copy — every combatant a single insert creates shares one
     * `created_at` (Postgres `now()` is transaction start), so the tiebreak
     * falls straight through to a fresh random uuid. So **combatants sitting on
     * the same initiative can come back in a different order than they went
     * out.** That is the same arbitrary-but-stable order a fresh seed has, and
     * `liveTables.ts` already records that a tie has no correct order — the
     * initiative *numbers* below are the part that is a promise, and they carry
     * exactly.
     */
    const key = (row: { readonly displayName: string; readonly hpCurrent: number }) =>
      `${row.displayName}/${String(row.hpCurrent)}`;
    const sorted = (rows: typeof before) =>
      [...rows].sort((a, b) => key(a).localeCompare(key(b))).map(carried);
    expect(sorted(after)).toEqual(sorted(before));
    // The list the DM reads down is the same list of numbers, in the same
    // order. Only rows tied on one number may swap with each other.
    expect(after.map((row) => row.initiative)).toEqual(before.map((row) => row.initiative));
    // New rows, in the new fight — not the same ones moved.
    expect(after.map((row) => row.id)).not.toEqual(before.map((row) => row.id));
    for (const row of after) expect(row.encounterRunId).toEqual(resumed.id);
    // The hit really did land before all this, so "hit points carried" is a
    // claim about damage rather than about a full-health seed.
    expect(after.some((row) => row.hpCurrent < row.hpMax)).toBe(true);
    expect(after.some((row) => row.conditions.includes("Frightened"))).toBe(true);
  }, 60_000);

  it("keeps whose turn it was, remapped onto the new combatant", async () => {
    // The composite `encounter_run_active_combatant_fkey` refuses a marker
    // naming another run's combatant, which is why the successor's ids are
    // generated before the insert rather than by `insert … select`.
    const first = await freshSession();
    const { run } = await aFightInProgress(first.id);
    const before = await as(combatants.list(fixture.campaign.id, first.id, run.id));
    const wasUp = before.find((row) => row.id === run.activeCombatantId)!;
    await finish(first.id);

    const second = await freshSession();
    const resumed = await as(
      runs.resume(fixture.campaign.id, second.id, { continuedFrom: run.id }),
    );
    const after = await as(combatants.list(fixture.campaign.id, second.id, resumed.id));
    const isUp = after.find((row) => row.id === resumed.activeCombatantId);

    expect(resumed.activeCombatantId).not.toBeNull();
    expect(resumed.activeCombatantId).not.toEqual(run.activeCombatantId);
    expect(isUp?.displayName).toEqual(wasUp.displayName);
    expect(isUp?.initiative).toEqual(wasUp.initiative);
  }, 60_000);

  it("refuses a second successor for the same fight", async () => {
    const first = await freshSession();
    const { run } = await aFightInProgress(first.id);
    await finish(first.id);

    const second = await freshSession();
    await as(runs.resume(fixture.campaign.id, second.id, { continuedFrom: run.id }));

    const third = await freshSession();
    const failure = await as(
      Effect.flip(runs.resume(fixture.campaign.id, third.id, { continuedFrom: run.id })),
    );
    expect(failure).toBeInstanceOf(Conflict);
  }, 60_000);

  it("refuses a fight that was ended rather than carried", async () => {
    // Not `NotFound`: the DM can see it perfectly well, and the honest answer
    // is that it is over. Reopening it would put "resolved" in one night's
    // recap and "resumed" in the next's.
    const first = await freshSession();
    const { run } = await aFightInProgress(first.id);
    await as(runs.end(fixture.campaign.id, first.id, run.id));

    const second = await freshSession();
    const failure = await as(
      Effect.flip(runs.resume(fixture.campaign.id, second.id, { continuedFrom: run.id })),
    );
    expect(failure).toBeInstanceOf(Conflict);
    expect((failure as Conflict).message).toContain("ended rather than carried");
  }, 60_000);

  it("refuses a fight that is still on the table", async () => {
    const first = await freshSession();
    const { run } = await aFightInProgress(first.id);

    const second = await freshSession();
    const failure = await as(
      Effect.flip(runs.resume(fixture.campaign.id, second.id, { continuedFrom: run.id })),
    );
    expect(failure).toBeInstanceOf(Conflict);
    expect((failure as Conflict).message).toContain("still on the table");
  }, 60_000);

  it("refuses a run belonging to another campaign, as NotFound", async () => {
    // `continued_from` cannot be a composite key — both ends are
    // `encounter_run` and the only shared column is `session_id`, which would
    // force one session — so the containment is the repository's job, against
    // the same predicate a read of that run would apply.
    const theirs = await runtime.runPromise(makeFixture);
    const theirNight = await runtime.runPromise(
      withActor(theirs.dm)(theirs.sessions.create(theirs.campaign.id, { number: 1 })).pipe(
        Effect.orDie,
      ),
    );
    const theirRun = await runtime.runPromise(
      withActor(theirs.dm)(
        runs.start(theirs.campaign.id, theirNight.id, { encounterId: theirs.encounter.id }),
      ).pipe(Effect.orDie),
    );
    await runtime.runPromise(
      withActor(theirs.dm)(
        Effect.flatMap(DateTime.now, (endedAt) =>
          sessions.update(theirs.campaign.id, theirNight.id, { endedAt }),
        ),
      ).pipe(Effect.orDie),
    );

    const mine = await freshSession();
    const failure = await as(
      Effect.flip(runs.resume(fixture.campaign.id, mine.id, { continuedFrom: theirRun.id })),
    );
    expect(failure).toBeInstanceOf(NotFound);
    expect((failure as NotFound).resource).toBe("encounter_run");
  }, 60_000);

  it("is refused to a campaign-scoped player, who cannot write the night", async () => {
    const first = await freshSession();
    const { run } = await aFightInProgress(first.id);
    await finish(first.id);
    const second = await freshSession();

    const player = new Actor({
      accountId: fixture.dm.accountId,
      role: "player",
      campaignId: fixture.campaign.id,
    });
    const failure = await runtime.runPromise(
      withActor(player)(
        Effect.flip(runs.resume(fixture.campaign.id, second.id, { continuedFrom: run.id })),
      ).pipe(Effect.orDie),
    );
    expect(failure).toBeInstanceOf(NotFound);
  }, 60_000);
});

describe("the guarantees a carried run had to be re-examined against", () => {
  it("still allows only one live fight per session", async () => {
    // The index is untouched by carry-over and still exactly right: a carried
    // run has `ended_at` set, so it is not a candidate. Resuming into a session
    // that already has a fight is the ordinary 409.
    const first = await freshSession();
    const { run } = await aFightInProgress(first.id);
    await finish(first.id);

    const second = await freshSession();
    await aFightInProgress(second.id);
    const failure = await as(
      Effect.flip(runs.resume(fixture.campaign.id, second.id, { continuedFrom: run.id })),
    );
    expect(failure).toBeInstanceOf(Conflict);
  }, 60_000);

  it("holds that against raw SQL too, on a night that carried one out", async () => {
    const night = await freshSession();
    await aFightInProgress(night.id);
    await finish(night.id);

    const error = await as(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        // The carried run left the index, so this insert succeeds…
        yield* sql`
          insert into encounter_run ${sql.insert({
            session_id: night.id,
            encounter_name: "by hand",
          })}
        `;
        // …and a second one does not.
        return yield* sql`
          insert into encounter_run ${sql.insert({
            session_id: night.id,
            encounter_name: "by hand, again",
          })}
        `.pipe(Effect.flip, Effect.map(describeError));
      }),
    );
    expect(error).toContain("encounter_run_one_live_per_session");
  }, 60_000);

  it("still refuses a finished session as the campaign's current one", async () => {
    // `0006` constrains `campaign ↔ session` and carry-over is a
    // `session ↔ encounter_run` question, so this is unchanged — but a night
    // that ended *mid-fight* is exactly the case nobody had been able to
    // produce before, so it is asserted rather than assumed.
    const night = await freshSession();
    await aFightInProgress(night.id);
    await as(campaigns.update(fixture.campaign.id, { currentSessionId: night.id }));
    await finish(night.id);

    const failure = await as(
      Effect.flip(campaigns.update(fixture.campaign.id, { currentSessionId: night.id })),
    );
    expect(failure).toBeInstanceOf(Conflict);

    const bySql = await as(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql`
          update campaign set current_session_id = ${night.id} where id = ${fixture.campaign.id}
        `.pipe(Effect.flip, Effect.map(describeError));
      }),
    );
    expect(bySql).toContain("campaign_current_session_id_fkey");
  }, 60_000);

  it("refuses `carried` on a run that has not ended, in the schema", async () => {
    const night = await freshSession();
    const error = await as(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql`
          insert into encounter_run ${sql.insert({
            session_id: night.id,
            encounter_name: "paused but never ended",
            ended_reason: "carried",
          })}
        `.pipe(Effect.flip, Effect.map(describeError));
      }),
    );
    expect(error).toContain("encounter_run_reason_needs_end");
  }, 60_000);
});
