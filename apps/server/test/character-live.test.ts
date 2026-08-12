import {
  Actor,
  type CharacterId,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  type SessionEvent,
  type SessionId,
} from "@taverns/api";
import { Duration, Effect, Fiber, Layer, ManagedRuntime, Ref, Stream } from "effect";
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
import { anAccount, aPlayerAt, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * Characters as live state (`0014`).
 *
 * **The claim this file exists to hold is that two rows cannot disagree about
 * how hurt somebody is.** A hit point belongs to the character, the combatant
 * holds the fight's copy, and one transaction writes both — so the happy path
 * is only half a proof, and the failure path is asserted here as well: a
 * write-through that cannot land takes the fight's own update down with it and
 * leaves *neither* row moved.
 *
 * The other half of the file is the doorbell, whose boundary is a decision
 * rather than a limit: a character written during a session appends
 * `character-updated` and rings; one written between games does neither.
 */
const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
    Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
    Creatures.layer,
    DmActors.layer,
    EncounterCreatures.layer,
    EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
    Encounters.layer,
    // `aPlayerAt` mints and redeems a real invitation now, so the player in
    // this file is the one the product can actually produce.
    Invites.layer,
    // Merged as well as provided, so a test can subscribe to the same doorbell
    // the repositories ring. `Layer` memoises by identity, so this is one
    // `PubSub` and not five.
    LiveEvents.layer,
    SessionEvents.layer,
    Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_character_live"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const roster = yield* EncounterCreatures;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(
    // Shared, so the player below can *read* the party — which is what makes
    // "refuses the write on a character they can read" a claim about the write
    // rather than about the campaign being closed.
    campaigns.create({
      name: "The Salt Road",
      partyName: "The Gilded Spoon",
      visibility: "shared",
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
  const encounter = yield* as(encounters.create(campaign.id, { name: "Ambush in the reeds" }));
  yield* as(roster.create(campaign.id, encounter.id, { creatureId: archer.id, count: 2 }));

  /** Somewhere for a cross-campaign write-through to fail to reach. */
  const otherTable = yield* as(campaigns.create({ name: "Salt and Sixpence" }));

  return {
    dm,
    asDm: yield* as(asDm(dm, campaign.id)),
    player: yield* aPlayerAt(campaign.id, "Pim"),
    campaign,
    encounter,
    otherTable,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;
let campaigns: (typeof Campaigns)["Service"];
let characters: (typeof Characters)["Service"];
let combatants: (typeof Combatants)["Service"];
let runs: (typeof EncounterRuns)["Service"];
let sessions: (typeof Sessions)["Service"];
let events: (typeof SessionEvents)["Service"];
let live: (typeof LiveEvents)["Service"];
let sql: SqlClient.SqlClient;

// Every service is resolved once, so an effect written below requires nothing
// but `CurrentActor` — which is what lets `as` provide the actor and run it.
beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  campaigns = await runtime.runPromise(Campaigns);
  characters = await runtime.runPromise(Characters);
  combatants = await runtime.runPromise(Combatants);
  runs = await runtime.runPromise(EncounterRuns);
  sessions = await runtime.runPromise(Sessions);
  events = await runtime.runPromise(SessionEvents);
  live = await runtime.runPromise(LiveEvents);
  sql = await runtime.runPromise(SqlClient.SqlClient);
}, 60_000);

const as = <A, E>(effect: Effect.Effect<A, E, CurrentActor>): Promise<A> =>
  runtime.runPromise(withActor(fixture.dm)(effect).pipe(Effect.orDie));

/** A character of this campaign, with a maximum and nothing said about now. */
let counter = 0;
const aCharacter = (hpMax: number, name?: string) => {
  counter += 1;
  return as(
    characters.create(fixture.campaign.id, {
      name: name ?? `Brannoc ${String(counter)}`,
      hpMax,
      visibility: "shared",
    }),
  );
};

/** A throwaway night, so one test's fight cannot disturb another's. */
let nights = 200;
const aNight = () => {
  nights += 1;
  return as(sessions.create(fixture.campaign.id, { number: nights }));
};

/** The night the campaign is currently on — what makes a write "during a session". */
const makeCurrent = (sessionId: SessionId | null) =>
  as(campaigns.update(fixture.campaign.id, { currentSessionId: sessionId }));

const combatantFor = (sessionId: SessionId, runId: EncounterRunId, characterId: CharacterId) =>
  as(
    Effect.map(combatants.list(fixture.asDm, sessionId, runId), (list) =>
      list.find((entry) => entry.characterId === characterId),
    ),
  ).then((entry) => entry!);

const characterById = (id: CharacterId) => as(characters.findById(fixture.campaign.id, id));

const logOf = (sessionId: SessionId): Promise<ReadonlyArray<SessionEvent>> =>
  as(events.list(fixture.asDm, sessionId, { limit: 500 }));

/**
 * Ring-counting, without asserting on the implementation that rings.
 *
 * The subscription is taken first and the action runs into it, which is the
 * ordering the live endpoint itself depends on. The two sleeps are the price of
 * observing an in-process fan-out from outside it; they bound the test at a
 * fifth of a second and there is nothing here whose correctness depends on
 * their length.
 */
const doorbellsWhile = <A, E>(sessionId: SessionId, action: Effect.Effect<A, E, CurrentActor>) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const rings = yield* Ref.make(0);
      const fiber = yield* Effect.forkChild(
        Stream.runForEach(live.subscribe(sessionId), () => Ref.update(rings, (n) => n + 1)),
      );
      yield* Effect.sleep(Duration.millis(50));
      const result = yield* withActor(fixture.dm)(action);
      yield* Effect.sleep(Duration.millis(150));
      yield* Fiber.interrupt(fiber);
      return { result, rings: yield* Ref.get(rings) };
    }).pipe(Effect.orDie),
  );

describe("a hit point belongs to the character", () => {
  it("moves both rows when damage lands in a fight", async () => {
    const night = await aNight();
    const character = await aCharacter(30);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    // A fight seeded from a character who has never been damaged starts at
    // full: `hp_current` null means nobody has said, and a seed reads that as
    // `hp_max`.
    expect(seeded.hpCurrent).toBe(30);

    const hit = await as(
      combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 12 }),
    );
    expect(hit.hpCurrent).toBe(18);

    // The same number, in the other table, written by the same transaction.
    expect((await characterById(character.id)).hpCurrent).toBe(18);

    // And healing walks both back up together.
    const healed = await as(
      combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: -5 }),
    );
    expect(healed.hpCurrent).toBe(23);
    expect((await characterById(character.id)).hpCurrent).toBe(23);
  }, 60_000);

  it("clamps once, in the fight, so neither row is a point out", async () => {
    const night = await aNight();
    const character = await aCharacter(24);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    const flattened = await as(
      combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 9999 }),
    );
    expect(flattened.hpCurrent).toBe(0);
    expect((await characterById(character.id)).hpCurrent).toBe(0);

    const restored = await as(
      combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: -9999 }),
    );
    expect(restored.hpCurrent).toBe(24);
    expect((await characterById(character.id)).hpCurrent).toBe(24);
  }, 60_000);

  it("starts a fight from where the party is, not from where it began", async () => {
    const character = await aCharacter(40);
    // Hurt out of combat first — the trap in the corridor.
    await as(characters.damage(fixture.campaign.id, character.id, { amount: 15 }));
    await as(characters.update(fixture.campaign.id, character.id, { conditions: ["Poisoned"] }));

    const night = await aNight();
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    // A seed from `hp_max` would have healed them at the top of the fight,
    // which is exactly the stale-prep-data behaviour the live columns end.
    expect(seeded.hpCurrent).toBe(25);
    expect(seeded.hpMax).toBe(40);
    expect(seeded.conditions).toEqual(["Poisoned"]);
  }, 60_000);

  it("rolls the fight's own write back when the write-through cannot land", async () => {
    // The failure path, and the reason this file exists. A combatant whose
    // `character_id` names a character in *another* campaign cannot be produced
    // through the product — the seed reads characters through `rowReadable` in
    // the campaign the run belongs to — so it is written here with raw SQL, in
    // the shape `aPlayerAt` uses for the same reason: a test reaching past the
    // product to build a state the product refuses, and looking like one.
    const night = await aNight();
    const character = await aCharacter(30);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    const stranger = await as(
      characters.create(fixture.otherTable.id, { name: "Somebody else", hpMax: 30 }),
    );
    await runtime.runPromise(
      sql`update combatant set character_id = ${stranger.id} where combatant.id = ${seeded.id}`.pipe(
        Effect.asVoid,
        Effect.orDie,
      ),
    );

    const before = await combatantFor(night.id, run.id, stranger.id);
    expect(before.hpCurrent).toBe(30);

    // A defect, not a typed failure: there is no path through the product that
    // produces this, and the honest answer to "these two rows would now
    // disagree" is a 500 rather than a half-applied hit.
    const exit = await runtime.runPromise(
      withActor(fixture.dm)(
        combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 12 }),
      ).pipe(Effect.exit),
    );
    expect(exit._tag).toBe("Failure");

    // **Neither row moved.** The combatant's own update was in the same
    // transaction as the write-through that could not land, so it went back
    // with it.
    expect((await combatantFor(night.id, run.id, stranger.id)).hpCurrent).toBe(30);
    expect(
      (await as(characters.findById(fixture.otherTable.id, stranger.id))).hpCurrent,
    ).toBeNull();

    // And the log did not record a hit that did not happen.
    const log = await logOf(night.id);
    expect(log.filter((event) => event.kind === "combatant-damaged")).toHaveLength(0);
  }, 60_000);

  it("sends a character's own delta through the fight it is in", async () => {
    const night = await aNight();
    const character = await aCharacter(30);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    // The DM reaches for the party list while a fight is still on the table.
    // The delta lands on the fight's copy and comes back through it, so the two
    // entry points cannot produce different answers to one hit.
    const hurt = await as(characters.damage(fixture.campaign.id, character.id, { amount: 7 }));
    expect(hurt.hpCurrent).toBe(23);
    expect((await combatantFor(night.id, run.id, character.id)).hpCurrent).toBe(23);
    expect(seeded.hpCurrent).toBe(30);
  }, 60_000);

  it("carries a condition set on the character into the fight, and back out", async () => {
    const night = await aNight();
    const character = await aCharacter(30);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    await as(characters.update(fixture.campaign.id, character.id, { conditions: ["Blessed"] }));
    expect((await combatantFor(night.id, run.id, character.id)).conditions).toEqual(["Blessed"]);

    await as(
      combatants.update(fixture.asDm, night.id, run.id, seeded.id, { conditions: ["Prone"] }),
    );
    expect((await characterById(character.id)).conditions).toEqual(["Prone"]);
  }, 60_000);

  it("writes back only what a combatant patch named", async () => {
    const night = await aNight();
    const character = await aCharacter(30);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);
    await as(characters.damage(fixture.campaign.id, character.id, { amount: 4 }));

    // Renaming a row in the initiative list must not write the fight's hit
    // points back over a character somebody healed a moment ago — so a patch
    // that did not name `hpCurrent` writes no hit point at all.
    await as(
      combatants.update(fixture.asDm, night.id, run.id, seeded.id, { displayName: "Brannoc II" }),
    );
    expect((await characterById(character.id)).hpCurrent).toBe(26);
  }, 60_000);
});

describe("out of a fight", () => {
  it("counts down from full when nobody has said where they are", async () => {
    const character = await aCharacter(28);
    expect(character.hpCurrent).toBeNull();

    const hurt = await as(characters.damage(fixture.campaign.id, character.id, { amount: 10 }));
    expect(hurt.hpCurrent).toBe(18);
  }, 60_000);

  it("clamps at nothing and at the maximum", async () => {
    const character = await aCharacter(28);
    expect(
      (await as(characters.damage(fixture.campaign.id, character.id, { amount: 99 }))).hpCurrent,
    ).toBe(0);
    expect(
      (await as(characters.damage(fixture.campaign.id, character.id, { amount: -99 }))).hpCurrent,
    ).toBe(28);
  }, 60_000);

  it("applies a repeated request once", async () => {
    const night = await aNight();
    await makeCurrent(night.id);
    const character = await aCharacter(28);

    const first = await as(
      characters.damage(fixture.campaign.id, character.id, { amount: 6, requestId: "tap-1" }),
    );
    const again = await as(
      characters.damage(fixture.campaign.id, character.id, { amount: 6, requestId: "tap-1" }),
    );
    expect(first.hpCurrent).toBe(22);
    expect(again.hpCurrent).toBe(22);

    // A different id is a different hit, not a repeat of the same one.
    const second = await as(
      characters.damage(fixture.campaign.id, character.id, { amount: 6, requestId: "tap-2" }),
    );
    expect(second.hpCurrent).toBe(16);
    await makeCurrent(null);
  }, 60_000);

  it("refuses a player the write, on a character they can read", async () => {
    const character = await aCharacter(28);
    const refused = await runtime.runPromise(
      withActor(fixture.player)(
        characters.damage(fixture.campaign.id, character.id, { amount: 5 }),
      ).pipe(Effect.flip),
    );
    expect(refused).toBeInstanceOf(NotFound);
    // Readable — it is `shared` — and still not theirs to change.
    expect(
      (
        await runtime.runPromise(
          withActor(fixture.player)(characters.findById(fixture.campaign.id, character.id)),
        )
      ).id,
    ).toBe(character.id);
  }, 60_000);
});

describe("the doorbell, and where it stops", () => {
  it("rings and records when a character changes during a session", async () => {
    const night = await aNight();
    await makeCurrent(night.id);
    const character = await aCharacter(30);

    const { rings } = await doorbellsWhile(
      night.id,
      characters.damage(fixture.campaign.id, character.id, { amount: 9 }),
    );
    expect(rings).toBe(1);

    const log = await logOf(night.id);
    const recorded = log.filter((event) => event.kind === "character-updated");
    expect(recorded).toHaveLength(2); // the create, then the damage
    const last = recorded.at(-1)!;
    expect(last.combatantId).toBeNull();
    expect(last.encounterRunId).toBeNull();
    expect(last.payload).toMatchObject({ characterId: character.id, amount: 9, hpCurrent: 21 });
    await makeCurrent(null);
  }, 60_000);

  it("names the fight when the write went through one", async () => {
    const night = await aNight();
    await makeCurrent(night.id);
    const character = await aCharacter(30);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    // From the *character* side, into a fight that is on the table.
    await as(characters.damage(fixture.campaign.id, character.id, { amount: 11 }));

    const log = await logOf(night.id);
    const last = log.filter((event) => event.kind === "character-updated").at(-1)!;
    expect(last.combatantId).toBe(seeded.id);
    // The run id too, though the plan only names the combatant: without it the
    // event is invisible to the run-filtered live stream, and an event no
    // consumer can read is worse than no event.
    expect(last.encounterRunId).toBe(run.id);

    const streamed = await as(events.listForRun(fixture.asDm, night.id, run.id, 0, 100));
    expect(streamed.map((event) => event.kind)).toContain("character-updated");
    await makeCurrent(null);
  }, 60_000);

  it("records one line, not two, when the hit came through the fight's own button", async () => {
    // The DM taps `minus` in the runner. That is one write and one entry in the
    // campaign's memory: `combatant-damaged` names the combatant and carries the
    // number, and the character it wrote through to is not a second event. A
    // duplicate here would show as a duplicate row in the DM's own log panel.
    const night = await aNight();
    await makeCurrent(night.id);
    const character = await aCharacter(30);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    const { rings } = await doorbellsWhile(
      night.id,
      combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 11 }),
    );
    expect(rings).toBe(1);

    const log = await logOf(night.id);
    expect(log.filter((event) => event.kind === "combatant-damaged")).toHaveLength(1);
    expect(log.filter((event) => event.kind === "character-updated")).toHaveLength(1); // the create
    expect((await characterById(character.id)).hpCurrent).toBe(19);
    await makeCurrent(null);
  }, 60_000);

  it("rings nothing when the campaign is on no session", async () => {
    // The settled decision, asserted rather than assumed: a level-up typed on a
    // Tuesday updates nobody live. `campaign.current_session_id` is null here,
    // so there is no session to key a doorbell on and none is invented.
    const night = await aNight();
    const character = await aCharacter(30);

    const { result, rings } = await doorbellsWhile(
      night.id,
      characters.damage(fixture.campaign.id, character.id, { amount: 9 }),
    );
    expect(rings).toBe(0);
    expect(result.hpCurrent).toBe(21);
    expect(await logOf(night.id)).toHaveLength(0);
  }, 60_000);

  it("rings nothing for a level-up between games either", async () => {
    const night = await aNight();
    const character = await aCharacter(30);

    const { rings } = await doorbellsWhile(
      night.id,
      characters.update(fixture.campaign.id, character.id, { level: 4 }),
    );
    expect(rings).toBe(0);
    expect((await characterById(character.id)).level).toBe(4);
    expect(await logOf(night.id)).toHaveLength(0);
  }, 60_000);
});
