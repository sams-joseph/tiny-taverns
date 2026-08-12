import { Actor, type CombatantId, CurrentActor, NotFound, type SessionId } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { DmActors } from "../src/repo/DmActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { anAccount, aPlayerAt, asDm, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The live session, at the repository level: seeding, the turn marker, the
 * things the fixtures settle about hit points, and the containment a run
 * inherits from being two levels below the campaign.
 *
 * The stream is `live-stream.test.ts`; this file is the state underneath it.
 */
const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Characters.layer,
    Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
    Creatures.layer,
    DmActors.layer,
    EncounterCreatures.layer,
    EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
    Encounters.layer,
    Invites.layer,
    SessionEvents.layer,
    // Finishing a night now carries a fight still on the table, which
    // appends to the log and rings the doorbell — so `Sessions` is a live
    // repository too. `Layer` memoises by identity, so this is the same
    // `PubSub` the other live layers here take.
    Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_live_session"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * `data.js`, as far as the live surface needs it: the Gilded Spoon's three PCs,
 * the reeds ambush with six goblins and a hag on its roster, and session 12.
 *
 * A second campaign, shared, so "a credential minted for one table" has
 * somewhere to fail to reach.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const characters = yield* Characters;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const roster = yield* EncounterCreatures;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(
    campaigns.create({
      name: "The Salt Road",
      partyName: "The Gilded Spoon",
      visibility: "shared",
    }),
  );

  yield* as(
    characters.create(campaign.id, {
      name: "Brannoc",
      playerName: "Ilse",
      species: "Half-orc",
      className: "Paladin",
      ac: 18,
      hpMax: 52,
    }),
  );
  yield* as(
    characters.create(campaign.id, {
      name: "Wren",
      playerName: "Kofi",
      species: "Tiefling",
      className: "Bard",
      ac: 14,
      hpMax: 31,
    }),
  );
  yield* as(
    characters.create(campaign.id, {
      name: "Sister Pell",
      playerName: "Dara",
      species: "Human",
      className: "Cleric",
      ac: 16,
      hpMax: 33,
    }),
  );

  const archer = yield* as(
    creatures.create(campaign.id, {
      name: "Goblin Archer",
      size: "Small",
      type: "Humanoid",
      cr: "1/4",
      ac: 15,
      hp: 7,
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
      legendary: true,
    }),
  );

  const encounter = yield* as(
    encounters.create(campaign.id, {
      name: "Ambush in the reeds",
      difficulty: "Medium",
      tags: ["Marsh", "Night"],
    }),
  );
  // Six of one and one of the other — the fixture's "6 creatures" card
  // (`data.js:10`) plus the boss the runner has a stat block open for.
  yield* as(roster.create(campaign.id, encounter.id, { creatureId: archer.id, count: 6 }));
  yield* as(roster.create(campaign.id, encounter.id, { creatureId: hag.id, count: 1 }));

  const session = yield* as(sessions.create(campaign.id, { number: 12, title: "The ford" }));

  const otherTable = yield* as(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );
  const encounterElsewhere = yield* as(
    encounters.create(otherTable.id, { name: "Whatever is in the crate", visibility: "shared" }),
  );
  const sessionElsewhere = yield* as(
    sessions.create(otherTable.id, { number: 1, visibility: "shared" }),
  );

  return {
    dm,
    /**
     * The proof the three live repositories take in place of a campaign id —
     * one per table, because a proof is about a pair and is not portable
     * between two campaigns of the same DM.
     */
    asDm: yield* as(asDm(dm, campaign.id)),
    asDmElsewhere: yield* as(asDm(dm, otherTable.id)),
    /** A credential minted for the first table only. */
    player: yield* aPlayerAt(campaign.id, "Pim"),
    campaign,
    archer,
    hag,
    encounter,
    session,
    otherTable,
    encounterElsewhere,
    sessionElsewhere,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;
let runs: (typeof EncounterRuns)["Service"];
let combatants: (typeof Combatants)["Service"];
let events: (typeof SessionEvents)["Service"];
let sessions: (typeof Sessions)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  runs = await runtime.runPromise(EncounterRuns);
  combatants = await runtime.runPromise(Combatants);
  events = await runtime.runPromise(SessionEvents);
  sessions = await runtime.runPromise(Sessions);
}, 60_000);

/** A throwaway session, so a test that starts a fight cannot disturb another. */
const freshSession = (number: number) =>
  runtime.runPromise(
    withActor(fixture.dm)(sessions.create(fixture.campaign.id, { number })).pipe(Effect.orDie),
  );

const startOn = (sessionId: SessionId) =>
  runtime.runPromise(
    withActor(fixture.dm)(
      runs.start(fixture.asDm, sessionId, { encounterId: fixture.encounter.id }),
    ).pipe(Effect.orDie),
  );

describe("starting a fight", () => {
  it("seeds one combatant per party member and per creature-instance", async () => {
    const session = await freshSession(100);
    const run = await startOn(session.id);
    const list = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );

    // Three PCs, six archers, one hag. The roster's `count: 6` becomes six
    // rows, not one row that says six — `data.js:18-19` is two `Goblin Archer`
    // combatants with different hit points, which one row cannot represent.
    expect(list).toHaveLength(10);
    expect(
      list
        .filter((c) => c.kind === "pc")
        .map((c) => c.displayName)
        .sort(),
    ).toEqual(["Brannoc", "Sister Pell", "Wren"]);
    expect(list.filter((c) => c.displayName === "Goblin Archer")).toHaveLength(6);

    // Instances, not references: every one has its own id, and damaging one
    // must not touch the others.
    const archers = list.filter((c) => c.displayName === "Goblin Archer");
    expect(new Set(archers.map((c) => c.id)).size).toBe(6);
    expect(archers.every((c) => c.creatureId === fixture.archer.id)).toBe(true);
  });

  it("snapshots the display fields rather than joining them", async () => {
    const session = await freshSession(101);
    const run = await startOn(session.id);
    const list = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );

    const brannoc = list.find((c) => c.displayName === "Brannoc")!;
    const hag = list.find((c) => c.displayName === "Marsh Hag")!;

    // `data.js:15` — "Half-orc paladin · Ilse", stored as its two parts so the
    // separator stays a rendering decision. The subtitle is the character's
    // `descriptor` at seed time, which since `0012` is derived from `species`
    // and `class_name` rather than typed.
    expect(brannoc.subtitle).toBe("Half-orc Paladin");
    expect(brannoc.playerName).toBe("Ilse");
    expect(brannoc.hpMax).toBe(52);
    expect(brannoc.hpCurrent).toBe(52);
    expect(brannoc.ac).toBe(18);

    // `data.js:21` — "Medium fey", from `size` and a lower-cased `type`.
    expect(hag.subtitle).toBe("Medium fey");
    expect(hag.playerName).toBeNull();
    expect(hag.hpMax).toBe(82);
    expect(hag.kind).toBe("npc");
  });

  it("snapshots the encounter name and keeps it when the template is deleted", async () => {
    const encounters = await runtime.runPromise(Encounters);
    const session = await freshSession(102);
    const run = await runtime.runPromise(
      Effect.gen(function* () {
        const doomed = yield* encounters.create(fixture.campaign.id, { name: "to be deleted" });
        const started = yield* runs.start(fixture.asDm, session.id, {
          encounterId: doomed.id,
        });
        yield* runs.end(fixture.asDm, session.id, started.id);
        yield* encounters.remove(fixture.campaign.id, doomed.id);
        return yield* runs.findById(fixture.asDm, session.id, started.id);
      }).pipe(withActor(fixture.dm), Effect.orDie),
    );

    // The run is a record of a night that happened. Deleting the template a
    // month later loses the template, not the history.
    expect(run.encounterId).toBeNull();
    expect(run.encounterName).toBe("to be deleted");
  });

  it("puts the turn marker on the first combatant and points the session at the run", async () => {
    const session = await freshSession(103);
    const run = await startOn(session.id);
    const list = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    const reread = await runtime.runPromise(
      withActor(fixture.dm)(sessions.findById(fixture.campaign.id, session.id)),
    );

    expect(run.activeCombatantId).toBe(list[0]!.id);
    expect(run.round).toBe(1);
    expect(reread.activeEncounterRunId).toBe(run.id);
  });

  it("refuses an encounter from another campaign, by either path", async () => {
    const session = await freshSession(104);
    const honest = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.dm)(
          runs.start(fixture.asDm, session.id, {
            encounterId: fixture.encounterElsewhere.id,
          }),
        ),
      ),
    );

    expect(honest._tag).toBe("NotFound");
    expect(honest._tag === "NotFound" && honest.resource).toBe("encounter");
  });
});

describe("exactly one encounter is live", () => {
  it("refuses a second fight on a session that already has one, and keeps the first", async () => {
    const session = await freshSession(110);
    const first = await startOn(session.id);

    const second = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.dm)(
          runs.start(fixture.asDm, session.id, { encounterId: fixture.encounter.id }),
        ),
      ),
    );

    expect(second._tag).toBe("Conflict");

    // …and the fight that was already on the table is untouched, which is the
    // reason this is a 409 rather than a silent switch.
    const reread = await runtime.runPromise(
      withActor(fixture.dm)(sessions.findById(fixture.campaign.id, session.id)),
    );
    expect(reread.activeEncounterRunId).toBe(first.id);
    const live = await runtime.runPromise(
      withActor(fixture.dm)(runs.list(fixture.asDm, session.id)),
    );
    expect(live.filter((r) => r.endedAt === null)).toHaveLength(1);
  });

  it("holds against a direct insert, not only against the endpoint", async () => {
    // The property is a partial unique index, so it survives `psql`, a future
    // endpoint nobody has written yet, and two clients racing. A check in
    // TypeScript survives none of those.
    const session = await freshSession(111);
    await startOn(session.id);

    const smuggled = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`
          insert into encounter_run (session_id, encounter_name)
          values (${session.id}, 'inserted behind the repository')
        `;
      }).pipe(Effect.result),
    );

    expect(smuggled._tag).toBe("Failure");
  });

  it("frees the session once the fight ends, so next week is a second run", async () => {
    const session = await freshSession(112);
    const first = await startOn(session.id);
    await runtime.runPromise(
      withActor(fixture.dm)(runs.end(fixture.asDm, session.id, first.id)).pipe(Effect.orDie),
    );

    const second = await startOn(session.id);
    expect(second.id).not.toBe(first.id);

    const all = await runtime.runPromise(
      withActor(fixture.dm)(runs.list(fixture.asDm, session.id)),
    );
    // Both runs are still there. §1.4's "a fight interrupted and resumed" is a
    // second row, never a reset of the first.
    expect(all.map((r) => r.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("clears the session pointer when the fight ends, and ending twice is a no-op", async () => {
    const session = await freshSession(113);
    const run = await startOn(session.id);

    const ended = await runtime.runPromise(
      withActor(fixture.dm)(runs.end(fixture.asDm, session.id, run.id)).pipe(Effect.orDie),
    );
    const again = await runtime.runPromise(
      withActor(fixture.dm)(runs.end(fixture.asDm, session.id, run.id)).pipe(Effect.orDie),
    );
    const reread = await runtime.runPromise(
      withActor(fixture.dm)(sessions.findById(fixture.campaign.id, session.id)),
    );

    expect(ended.endedAt).not.toBeNull();
    expect(again.endedAt?.toString()).toBe(ended.endedAt?.toString());
    expect(reread.activeEncounterRunId).toBeNull();

    // One ending in the log, not two — a retried request must not write a
    // second one.
    const log = await runtime.runPromise(
      withActor(fixture.dm)(events.list(fixture.asDm, session.id, {})),
    );
    expect(log.filter((e) => e.kind === "run-ended")).toHaveLength(1);
  });
});

describe("hit points", () => {
  it("clamps at zero and leaves the combatant in initiative", async () => {
    const session = await freshSession(120);
    const run = await startOn(session.id);
    const before = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    const archer = before.find((c) => c.displayName === "Goblin Archer")!;

    // Seven hit points, ninety-nine damage. `Math.max(0, c.hp - 5)`.
    const damaged = await runtime.runPromise(
      withActor(fixture.dm)(
        combatants.damage(fixture.asDm, session.id, run.id, archer.id, { amount: 99 }),
      ).pipe(Effect.orDie),
    );
    expect(damaged.hpCurrent).toBe(0);

    // **The property.** `EncounterRunner.jsx:107` — "Still in initiative —
    // remove them when you're ready." Nothing about reaching zero removes a
    // row, changes the turn marker, or adds a condition the DM did not ask for.
    const after = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    expect(after).toHaveLength(before.length);
    expect(after.map((c) => c.id)).toContain(archer.id);
    expect(after.find((c) => c.id === archer.id)!.conditions).toEqual([]);

    const stillRunning = await runtime.runPromise(
      withActor(fixture.dm)(runs.findById(fixture.asDm, session.id, run.id)),
    );
    expect(stillRunning.activeCombatantId).toBe(run.activeCombatantId);
  });

  it("heals with a negative amount and clamps at the maximum", async () => {
    const session = await freshSession(121);
    const run = await startOn(session.id);
    const list = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    const brannoc = list.find((c) => c.displayName === "Brannoc")!;

    const hurt = await runtime.runPromise(
      withActor(fixture.dm)(
        combatants.damage(fixture.asDm, session.id, run.id, brannoc.id, { amount: 8 }),
      ).pipe(Effect.orDie),
    );
    const healed = await runtime.runPromise(
      withActor(fixture.dm)(
        combatants.damage(fixture.asDm, session.id, run.id, brannoc.id, { amount: -99 }),
      ).pipe(Effect.orDie),
    );

    expect(hurt.hpCurrent).toBe(44);
    expect(healed.hpCurrent).toBe(52);
  });

  it("applies a repeated requestId exactly once", async () => {
    // The double-tapped damage button (§4.3). Not offline-first design — basic
    // hygiene on a touch screen in a dark room.
    const session = await freshSession(122);
    const run = await startOn(session.id);
    const list = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    const hag = list.find((c) => c.displayName === "Marsh Hag")!;

    const hit = () =>
      runtime.runPromise(
        withActor(fixture.dm)(
          combatants.damage(fixture.asDm, session.id, run.id, hag.id, {
            amount: 12,
            requestId: "tap-1",
          }),
        ).pipe(Effect.orDie),
      );

    const first = await hit();
    const second = await hit();

    expect(first.hpCurrent).toBe(70);
    expect(second.hpCurrent).toBe(70);

    // A different id is a different hit, and does apply.
    const third = await runtime.runPromise(
      withActor(fixture.dm)(
        combatants.damage(fixture.asDm, session.id, run.id, hag.id, {
          amount: 12,
          requestId: "tap-2",
        }),
      ).pipe(Effect.orDie),
    );
    expect(third.hpCurrent).toBe(58);

    // One log line per applied hit, so the recap does not double-count either.
    const log = await runtime.runPromise(
      withActor(fixture.dm)(events.list(fixture.asDm, session.id, {})),
    );
    expect(log.filter((e) => e.kind === "combatant-damaged")).toHaveLength(2);
  });
});

describe("the turn marker", () => {
  it("advances down initiative order and rolls the round over at the bottom", async () => {
    const session = await freshSession(130);
    const run = await startOn(session.id);
    const order = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );

    let current = run;
    const seen: Array<CombatantId | null> = [current.activeCombatantId];
    for (let index = 0; index < order.length; index += 1) {
      current = await runtime.runPromise(
        withActor(fixture.dm)(runs.nextTurn(fixture.asDm, session.id, current.id, {})).pipe(
          Effect.orDie,
        ),
      );
      seen.push(current.activeCombatantId);
    }

    // One full lap: every combatant is up exactly once, and the last step
    // wraps back to the top and increments the round (`:112-116`).
    expect(seen.slice(0, order.length)).toEqual(order.map((c) => c.id));
    expect(seen[order.length]).toBe(order[0]!.id);
    expect(current.round).toBe(2);
  });

  it("is a pointer, so adding a combatant mid-fight does not move whose turn it is", async () => {
    // The reason this is not `turn_index`. A combatant added above the current
    // one in initiative shifts every index below it; the marker must not follow.
    const session = await freshSession(131);
    const run = await startOn(session.id);
    const advanced = await runtime.runPromise(
      withActor(fixture.dm)(runs.nextTurn(fixture.asDm, session.id, run.id, {})).pipe(Effect.orDie),
    );

    await runtime.runPromise(
      withActor(fixture.dm)(
        combatants.create(fixture.asDm, session.id, run.id, {
          displayName: "Summoned wolf",
          initiative: 99,
          hpMax: 11,
        }),
      ).pipe(Effect.orDie),
    );

    const after = await runtime.runPromise(
      withActor(fixture.dm)(runs.findById(fixture.asDm, session.id, run.id)),
    );
    const order = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );

    expect(after.activeCombatantId).toBe(advanced.activeCombatantId);
    // …and the wolf really did land at the top, so the index *would* have moved.
    expect(order[0]!.displayName).toBe("Summoned wolf");
  });

  it("moves on before removing whoever is up", async () => {
    const session = await freshSession(132);
    const run = await startOn(session.id);
    const order = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );

    await runtime.runPromise(
      withActor(fixture.dm)(
        combatants.remove(fixture.asDm, session.id, run.id, run.activeCombatantId!),
      ).pipe(Effect.orDie),
    );

    const after = await runtime.runPromise(
      withActor(fixture.dm)(runs.findById(fixture.asDm, session.id, run.id)),
    );
    // "Nobody is up" is a valid database state and a useless one to hand a DM
    // mid-fight, so the marker advances rather than being nulled by the
    // composite foreign key.
    expect(after.activeCombatantId).toBe(order[1]!.id);
  });

  it("applies a repeated next-turn requestId exactly once", async () => {
    const session = await freshSession(133);
    const run = await startOn(session.id);
    const first = await runtime.runPromise(
      withActor(fixture.dm)(
        runs.nextTurn(fixture.asDm, session.id, run.id, { requestId: "space-1" }),
      ).pipe(Effect.orDie),
    );
    const second = await runtime.runPromise(
      withActor(fixture.dm)(
        runs.nextTurn(fixture.asDm, session.id, run.id, { requestId: "space-1" }),
      ).pipe(Effect.orDie),
    );

    // A skipped turn is worse than a missed keypress: the DM reads the wrong
    // name aloud and nobody notices for a round.
    expect(second.activeCombatantId).toBe(first.activeCombatantId);
  });
});

describe("the new tables fail closed", () => {
  it("stores rows created with no explicit visibility as dm", async () => {
    const session = await freshSession(140);
    const run = await startOn(session.id);
    const list = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    const log = await runtime.runPromise(
      withActor(fixture.dm)(events.list(fixture.asDm, session.id, {})),
    );

    expect(run.visibility).toBe("dm");
    expect(list.every((c) => c.visibility === "dm")).toBe(true);
    expect(log.every((e) => e.visibility === "dm")).toBe(true);
  });

  it("defaults at the column, not only in the payload schema", async () => {
    // The property a table added later inherits for free, and the reason the
    // default lives in the migration rather than in a create schema. Inserted
    // straight into the tables, bypassing every TypeScript path.
    const session = await freshSession(141);
    const rows = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const run = yield* sql<{
          readonly id: string;
          readonly visibility: string;
          readonly origin: string;
        }>`
          insert into encounter_run (session_id, encounter_name)
          values (${session.id}, 'inserted behind the repository')
          returning id, visibility, origin
        `;
        const combatant = yield* sql<{ readonly visibility: string; readonly origin: string }>`
          insert into combatant (encounter_run_id, display_name)
          values (${run[0]!.id}, 'inserted behind the repository')
          returning visibility, origin
        `;
        const event = yield* sql<{ readonly visibility: string; readonly origin: string }>`
          insert into session_event (session_id, kind)
          values (${session.id}, 'run-started')
          returning visibility, origin
        `;
        return { run: run[0], combatant: combatant[0], event: event[0] };
      }).pipe(Effect.orDie),
    );

    expect(rows.run).toMatchObject({ visibility: "dm", origin: "authored" });
    expect(rows.combatant).toEqual({ visibility: "dm", origin: "authored" });
    expect(rows.event).toEqual({ visibility: "dm", origin: "authored" });
  });

  it("marks the two levels the fixtures ask for, on the run and on the row", async () => {
    // The runner's `Share` switch over the whole fight (`:122`) and `Hide from
    // players` on one row (`:139`) are two independent columns, and both
    // default to `dm`. What a *player* then sees through them is no longer
    // observable here — see the next test — but the predicate that reads them
    // is `containedRowReadable`, and `recap.test.ts` still drives it with a
    // real player over the same two tables.
    const session = await freshSession(142);
    const shared = await runtime.runPromise(
      withActor(fixture.dm)(
        sessions.update(fixture.campaign.id, session.id, { visibility: "shared" }),
      ).pipe(Effect.orDie),
    );
    expect(shared.visibility).toBe("shared");

    const run = await startOn(session.id);
    expect(run.visibility).toBe("dm");
    const list = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    expect(list.every((row) => row.visibility === "dm")).toBe(true);

    const row = await runtime.runPromise(
      withActor(fixture.dm)(
        combatants.update(fixture.asDm, session.id, run.id, list[0]!.id, {
          visibility: "shared",
        }),
      ).pipe(Effect.orDie),
    );
    const fight = await runtime.runPromise(
      withActor(fixture.dm)(
        runs.update(fixture.asDm, session.id, run.id, { visibility: "shared" }),
      ).pipe(Effect.orDie),
    );

    expect(row.visibility).toBe("shared");
    expect(fight.visibility).toBe("shared");
    // The whole fight is still the DM's, whatever those two say: sharing is
    // what a *narrow* player projection will read, not a second door onto this
    // one.
    const stillAll = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    expect(stillAll).toHaveLength(list.length);
  });

  it("gives a player no way to reach the fight at all, shared or not", async () => {
    // This is the gate, and it replaced something weaker. A player used to be
    // able to call these methods and receive the `shared` rows the predicate
    // allowed — which meant the wide `Combatant`, with exact hit points on a
    // creature the DM had merely chosen to show them. There is no read to
    // filter now: the methods take a `DmActor` and a player cannot obtain one,
    // so the refusal is one step earlier than the `WHERE` clause and applies
    // to every method on all three live repositories at once.
    const session = await freshSession(143);
    await runtime.runPromise(
      withActor(fixture.dm)(
        sessions.update(fixture.campaign.id, session.id, { visibility: "shared" }),
      ).pipe(Effect.orDie),
    );
    const run = await runtime.runPromise(
      withActor(fixture.dm)(
        runs.start(fixture.asDm, session.id, {
          encounterId: fixture.encounter.id,
          visibility: "shared",
        }),
      ).pipe(Effect.orDie),
    );
    const list = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    await runtime.runPromise(
      withActor(fixture.dm)(
        combatants.update(fixture.asDm, session.id, run.id, list[0]!.id, {
          visibility: "shared",
        }),
      ).pipe(Effect.orDie),
    );

    // Everything above is shared — the campaign, the night, the fight and one
    // row of it — so the refusal below is about the projection and not about a
    // row that was never there.
    const refused = await runtime.runPromise(
      Effect.flip(asDm(fixture.player, fixture.campaign.id)).pipe(Effect.orDie),
    );
    expect(refused).toBeInstanceOf(NotFound);
    expect(refused.resource).toBe("campaign");

    // …and the fight really is untouched, because there was no call to make.
    const stillFull = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    expect(stillFull.find((c) => c.id === list[0]!.id)!.hpCurrent).toBe(list[0]!.hpCurrent);
  });
});

describe("a campaign-scoped actor", () => {
  it("cannot reach another campaign's fight, by either path", async () => {
    // Both ways of naming it. Honestly, with the other campaign's id; and by
    // lying about the campaign while giving the other campaign's session id,
    // which is the shape that works if a predicate trusts the id it is handed.
    const otherSession = fixture.sessionElsewhere;
    const otherRun = await runtime.runPromise(
      withActor(fixture.dm)(
        runs.start(fixture.asDmElsewhere, otherSession.id, {
          encounterId: fixture.encounterElsewhere.id,
          visibility: "shared",
        }),
      ).pipe(Effect.orDie),
    );

    // The credential under test is a DM's, narrowed to the first table. That is
    // the only actor for whom both paths are still *expressible*: it can obtain
    // a proof for its own campaign and none for the other, so the smuggled path
    // is a real call with a real proof rather than a call nobody can make.
    const scopedDm = scopedTo(fixture.dm, fixture.campaign.id);
    const mine = await runtime.runPromise(asDm(scopedDm, fixture.campaign.id).pipe(Effect.orDie));

    const honest = await runtime.runPromise(
      Effect.flip(asDm(scopedDm, fixture.otherTable.id)).pipe(Effect.orDie),
    );
    const smuggled = await runtime.runPromise(
      Effect.flip(runs.findById(mine, otherSession.id, otherRun.id)),
    );
    const smuggledCombatants = await runtime.runPromise(
      Effect.flip(combatants.list(mine, otherSession.id, otherRun.id)),
    );
    const smuggledLog = await runtime.runPromise(
      Effect.flip(events.listForRun(mine, otherSession.id, otherRun.id, 0, 100)),
    );

    expect(honest._tag).toBe("NotFound");
    expect(smuggled._tag).toBe("NotFound");
    expect(smuggledCombatants._tag).toBe("NotFound");
    expect(smuggledLog._tag).toBe("NotFound");

    // A player of the first table gets no proof for either, which is the newer
    // and blunter half of the same refusal.
    const asPlayerHere = await runtime.runPromise(
      Effect.flip(asDm(fixture.player, fixture.campaign.id)).pipe(Effect.orDie),
    );
    const asPlayerThere = await runtime.runPromise(
      Effect.flip(asDm(fixture.player, fixture.otherTable.id)).pipe(Effect.orDie),
    );
    expect(asPlayerHere._tag).toBe("NotFound");
    expect(asPlayerThere._tag).toBe("NotFound");

    // …and it really is there and really is shared, so the assertions above are
    // about scope rather than about a missing row.
    const unscoped = await runtime.runPromise(
      withActor(fixture.dm)(runs.findById(fixture.asDmElsewhere, otherSession.id, otherRun.id)),
    );
    expect(unscoped.visibility).toBe("shared");
  });

  it("narrows a dm-role actor too, so scope does not depend on the role", async () => {
    // The narrowing moved to the gate and did not weaken: `campaignWritable`
    // composes `campaignInScope`, so a credential minted for one table cannot
    // produce a proof for another even where the same account is that table's
    // DM. There is nothing left to call with, which is the point.
    const scopedDm = scopedTo(fixture.dm, fixture.campaign.id);

    const elsewhere = await runtime.runPromise(
      Effect.flip(asDm(scopedDm, fixture.otherTable.id)).pipe(Effect.orDie),
    );
    expect(elsewhere._tag).toBe("NotFound");

    // …while the account it belongs to is that other table's DM on an
    // account-wide credential, so this is scope and not membership.
    const unscoped = await runtime.runPromise(
      asDm(fixture.dm, fixture.otherTable.id).pipe(Effect.orDie),
    );
    const listed = await runtime.runPromise(
      runs.list(unscoped, fixture.sessionElsewhere.id).pipe(Effect.orDie),
    );
    expect(listed.length).toBeGreaterThan(0);
  });

  it("refuses a run smuggled in through the wrong session, on every path", async () => {
    // The session id in a path is a claim about which session contains the run,
    // and it has to be *bound to the run* rather than merely checked for
    // readability beside it. Two separate checks — "this session is readable"
    // and "this run is readable" — are both satisfied by a run in a different
    // session of the same campaign, so the pair proves nothing. This is a
    // regression test: an earlier draft of `Combatants.list` and
    // `SessionEvents.listForRun` asked exactly those two questions and let a
    // fight be read through any session the actor could see.
    const session = await freshSession(150);
    const run = await startOn(session.id);
    const list = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    const wrong = await freshSession(151);

    const attempts = await Promise.all(
      [
        runs.findById(fixture.asDm, wrong.id, run.id),
        runs.update(fixture.asDm, wrong.id, run.id, { round: 9 }),
        runs.nextTurn(fixture.asDm, wrong.id, run.id, {}),
        runs.end(fixture.asDm, wrong.id, run.id),
        combatants.list(fixture.asDm, wrong.id, run.id),
        combatants.create(fixture.asDm, wrong.id, run.id, { displayName: "smuggled" }),
        combatants.update(fixture.asDm, wrong.id, run.id, list[0]!.id, { initiative: 30 }),
        combatants.damage(fixture.asDm, wrong.id, run.id, list[0]!.id, { amount: 5 }),
        combatants.remove(fixture.asDm, wrong.id, run.id, list[0]!.id),
        events.listForRun(fixture.asDm, wrong.id, run.id, 0, 100),
      ].map((effect) => runtime.runPromise(Effect.flip(withActor(fixture.dm)(effect)))),
    );

    expect(attempts.map((error) => error._tag)).toEqual(Array(attempts.length).fill("NotFound"));

    // …and nothing in the fight moved, so none of those half-applied.
    const after = await runtime.runPromise(
      withActor(fixture.dm)(runs.findById(fixture.asDm, session.id, run.id)),
    );
    const stillThere = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    expect(after.round).toBe(1);
    expect(after.endedAt).toBeNull();
    expect(after.activeCombatantId).toBe(run.activeCombatantId);
    expect(stillThere.map((c) => c.id)).toEqual(list.map((c) => c.id));
    expect(stillThere[0]!.hpCurrent).toBe(list[0]!.hpCurrent);
  });
});

describe("the log", () => {
  it("records every mutation once, in one increasing sequence", async () => {
    const session = await freshSession(160);
    const run = await startOn(session.id);
    const list = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        yield* combatants.damage(fixture.asDm, session.id, run.id, list[0]!.id, {
          amount: 3,
        });
        yield* runs.nextTurn(fixture.asDm, session.id, run.id, {});
        yield* runs.end(fixture.asDm, session.id, run.id);
      }).pipe(withActor(fixture.dm), Effect.orDie),
    );

    const log = await runtime.runPromise(
      withActor(fixture.dm)(events.list(fixture.asDm, session.id, {})),
    );

    expect(log.map((e) => e.kind)).toEqual([
      "run-started",
      "combatant-damaged",
      "turn-advanced",
      "run-ended",
    ]);
    // Strictly increasing, which is the only property `since=` needs. Gaps are
    // expected — the sequence is global — and nothing counts it.
    const seqs = log.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it("resumes from a cursor, exclusive", async () => {
    const session = await freshSession(161);
    const run = await startOn(session.id);
    await runtime.runPromise(
      withActor(fixture.dm)(runs.nextTurn(fixture.asDm, session.id, run.id, {})).pipe(Effect.orDie),
    );

    const all = await runtime.runPromise(
      withActor(fixture.dm)(events.list(fixture.asDm, session.id, {})),
    );
    const after = await runtime.runPromise(
      withActor(fixture.dm)(events.list(fixture.asDm, session.id, { since: all[0]!.seq })),
    );

    expect(all).toHaveLength(2);
    expect(after.map((e) => e.id)).toEqual([all[1]!.id]);
  });

  it("keeps the removed combatant's name, once the row it pointed at is gone", async () => {
    const session = await freshSession(162);
    const run = await startOn(session.id);
    const list = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, session.id, run.id)),
    );
    const victim = list.at(-1)!;

    await runtime.runPromise(
      withActor(fixture.dm)(combatants.remove(fixture.asDm, session.id, run.id, victim.id)).pipe(
        Effect.orDie,
      ),
    );

    const log = await runtime.runPromise(
      withActor(fixture.dm)(events.list(fixture.asDm, session.id, {})),
    );
    const removal = log.find((e) => e.kind === "combatant-removed")!;

    // `combatant_id` is `on delete set null`, so the column cannot hold it —
    // the payload does, which is what keeps the log legible after the fact.
    expect(removal.combatantId).toBeNull();
    expect(removal.payload).toMatchObject({ combatantId: victim.id });
  });

  it("has no write path but the mutations themselves", () => {
    // There is no `create`, `update` or `remove` on the service and no endpoint
    // that could reach one. Appends happen inside the transaction of the
    // mutation being recorded, through a plain function that needs an `sql`.
    expect(Object.keys(events).sort()).toEqual(["list", "listForRun", "pollForRun"]);
  });
});

describe("a run whose session is deleted", () => {
  it("goes with it, log and all", async () => {
    const session = await freshSession(170);
    const run = await startOn(session.id);
    await runtime.runPromise(
      withActor(fixture.dm)(sessions.remove(fixture.campaign.id, session.id)).pipe(Effect.orDie),
    );

    const orphans = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const runs = yield* sql<{
          readonly count: string;
        }>`select count(*) as count from encounter_run where id = ${run.id}`;
        const combatantRows = yield* sql<{
          readonly count: string;
        }>`select count(*) as count from combatant where encounter_run_id = ${run.id}`;
        const eventRows = yield* sql<{
          readonly count: string;
        }>`select count(*) as count from session_event where session_id = ${session.id}`;
        return {
          runs: Number(runs[0]!.count),
          combatants: Number(combatantRows[0]!.count),
          events: Number(eventRows[0]!.count),
        };
      }).pipe(Effect.orDie),
    );

    // A session is the container. Deleting one and leaving its fight behind
    // would leave rows no predicate can reach and no endpoint can name.
    expect(orphans).toEqual({ runs: 0, combatants: 0, events: 0 });
  });
});

describe("the turn marker cannot point outside its own fight", () => {
  it("refuses a combatant from another run", async () => {
    const sessionA = await freshSession(180);
    const sessionB = await freshSession(181);
    const runA = await startOn(sessionA.id);
    const runB = await startOn(sessionB.id);
    const inB = await runtime.runPromise(
      withActor(fixture.dm)(combatants.list(fixture.asDm, sessionB.id, runB.id)),
    );

    const error = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.dm)(
          runs.update(fixture.asDm, sessionA.id, runA.id, {
            activeCombatantId: inB[0]!.id,
          }),
        ),
      ),
    );

    // `encounter_run_active_combatant_fkey` is composite, so this is
    // unrepresentable rather than merely unlikely; the repository turns the
    // constraint into the 404 the rest of the surface answers with.
    expect(error._tag).toBe("NotFound");
    expect(error._tag === "NotFound" && error.resource).toBe("combatant");

    const unchanged = await runtime.runPromise(
      withActor(fixture.dm)(runs.findById(fixture.asDm, sessionA.id, runA.id)),
    );
    expect(unchanged.activeCombatantId).toBe(runA.activeCombatantId);
  });
});
