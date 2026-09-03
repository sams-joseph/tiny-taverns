import {
  Actor,
  type CampaignCharacterId,
  type Character,
  type CharacterId,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  type SessionEvent,
  type SessionId,
} from "@taverns/api";
import { Duration, Effect, Fiber, Layer, ManagedRuntime, Ref, Stream } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Groups } from "../src/repo/Groups.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import {
  aCharacterAt,
  admittedTo,
  anAccount,
  aPlayerAt,
  asDm,
  createCampaign,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * Characters as live state, under the continuity decision of 2026-09-01.
 *
 * **The claim this file exists to hold is that two rows cannot disagree about
 * how hurt somebody is.** A hit point belongs to the **shared, account-owned
 * character**, the combatant holds the fight's copy, and one transaction
 * writes both. The campaign's entry points moved onto the seat — the delta is
 * `Party.damage` through a live `campaign_character`, the condition edit is
 * `Party.update` — but the invariant they compose is the same one, and this
 * file drives it from every side: the fight's own button, the seat's delta,
 * the seat's condition write, and the seed.
 *
 * Two things are new since the character became top-level, and both get their
 * own tests below:
 *
 * - **Containment is the seed.** There is no campaign predicate over
 *   `character` any more — the write-through's authority is
 *   `campaignWritableById` and its reach is bounded by which combatants exist,
 *   because `combatant.character_id` is written only by the seed, from this
 *   campaign's live seats. So the old "cross-campaign write-through rolls
 *   back" state is not expressible: what is pinned instead is the seed's own
 *   containment, seat by seat.
 * - **A fight's write reaches every table.** One character seated at two
 *   campaigns is one row of hit points, so damage taken in a fight at one
 *   table is what the other table's roster reads — the §10 test, inverted on
 *   the captain's instruction.
 *
 * The other half of the file is the doorbell, whose boundary is a decision
 * rather than a limit: a **seat-side** write during a session appends
 * `character-updated` and rings; the owner's own PATCH (`updateOwn`) rings
 * nothing, ever, even mid-session — the durable sheet is not live state.
 */
const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Groups.layer,
    // The owner's half needs no `LiveEvents`: nothing it writes rings.
    Characters.layer,
    Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
    Creatures.layer,
    CampaignCreatorActors.layer,
    EncounterCreatures.layer,
    EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
    Encounters.layer,
    // `aPlayerAt` and `admittedTo` mint and redeem real invitations, so every
    // player and every second participation in this file is one the product
    // can actually produce.
    Invites.layer,
    // Merged as well as provided, so a test can subscribe to the same doorbell
    // the repositories ring. `Layer` memoises by identity, so this is one
    // `PubSub` and not five.
    LiveEvents.layer,
    Party.layer.pipe(Layer.provide(LiveEvents.layer)),
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
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const roster = yield* EncounterCreatures;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(
    // Shared, so the player below can read the table at all — which is what
    // makes "refuses a player the delta on a seat they can see" a claim about
    // the write rather than about the campaign being closed.
    createCampaign({
      name: "The Salt Road",
      partyName: "The Gilded Spoon",
      visibility: "shared",
    }),
  );
  const archer = yield* as(
    creatures.libraryCreate({
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

  /** The second table the continuity tests carry a character to. */
  const otherTable = yield* as(createCampaign({ name: "Salt and Sixpence", visibility: "shared" }));

  const player = yield* aPlayerAt(campaign.id, "Pim");
  // The same person, admitted to the second table — one account, two
  // participations, one character.
  const playerElsewhere = yield* admittedTo(otherTable.id, player, "Pim, again");

  return {
    dm,
    asDm: yield* as(asDm(dm, campaign.id)),
    player,
    playerElsewhere,
    campaign,
    encounter,
    otherTable,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;
let campaigns: (typeof Campaigns)["Service"];
let characters: (typeof Characters)["Service"];
let combatants: (typeof Combatants)["Service"];
let party: (typeof Party)["Service"];
let runs: (typeof EncounterRuns)["Service"];
let sessions: (typeof Sessions)["Service"];
let events: (typeof SessionEvents)["Service"];
let live: (typeof LiveEvents)["Service"];

// Every service is resolved once, so an effect written below requires nothing
// but `CurrentActor` — which is what lets `as` provide the actor and run it.
beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  campaigns = await runtime.runPromise(Campaigns);
  characters = await runtime.runPromise(Characters);
  combatants = await runtime.runPromise(Combatants);
  party = await runtime.runPromise(Party);
  runs = await runtime.runPromise(EncounterRuns);
  sessions = await runtime.runPromise(Sessions);
  events = await runtime.runPromise(SessionEvents);
  live = await runtime.runPromise(LiveEvents);
}, 60_000);

const as = <A, E>(effect: Effect.Effect<A, E, CurrentActor>): Promise<A> =>
  runtime.runPromise(withActor(fixture.dm)(effect).pipe(Effect.orDie));

/**
 * A character of the player's, seated at this campaign, with a maximum and
 * nothing said about now — the shipped path (`createOwn` writes the shared row
 * and its seat in one transaction), through the shared fixture helper.
 */
let counter = 0;
const aCharacter = (hpMax: number, name?: string) => {
  counter += 1;
  return runtime.runPromise(
    aCharacterAt(fixture.campaign.id, fixture.player, {
      name: name ?? `Brannoc ${String(counter)}`,
      hpMax,
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

/**
 * The shared character, read the way a table reads it: off the roster. There
 * is no campaign-scoped character read any more — the seat is the reach — so
 * this is the product path, not a workaround.
 */
const characterVia = (campaignId: typeof fixture.campaign.id, id: CharacterId) =>
  as(
    Effect.map(party.list(campaignId), (seats) => seats.find((seat) => seat.character?.id === id)),
  ).then((seat) => seat!.character!);

const characterById = (id: CharacterId): Promise<Character> =>
  characterVia(fixture.campaign.id, id);

/** The seat-side delta — the out-of-fight entry point, and the creator's act. */
const seatDamage = (
  seatId: CampaignCharacterId,
  payload: { readonly amount: number; readonly requestId?: string },
) => as(party.damage(fixture.campaign.id, seatId, payload));

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
const doorbellsWhile = <A, E>(
  sessionId: SessionId,
  action: Effect.Effect<A, E, CurrentActor>,
  actor?: Actor,
) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const rings = yield* Ref.make(0);
      const fiber = yield* Effect.forkChild(
        Stream.runForEach(live.subscribe(sessionId), () => Ref.update(rings, (n) => n + 1)),
      );
      yield* Effect.sleep(Duration.millis(50));
      const result = yield* withActor(actor ?? fixture.dm)(action);
      yield* Effect.sleep(Duration.millis(150));
      yield* Fiber.interrupt(fiber);
      return { result, rings: yield* Ref.get(rings) };
    }).pipe(Effect.orDie),
  );

describe("a hit point belongs to the character", () => {
  it("moves both rows when damage lands in a fight", async () => {
    const night = await aNight();
    const { character } = await aCharacter(30);
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

    // The same number, on the shared row, written by the same transaction.
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
    const { character } = await aCharacter(24);
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
    const { character, seatId } = await aCharacter(40);
    // Hurt out of combat first — the trap in the corridor. Both are seat-side
    // writes now: the delta and the condition edit go through the seat.
    await seatDamage(seatId, { amount: 15 });
    await as(party.update(fixture.campaign.id, seatId, { conditions: ["Poisoned"] }));

    const night = await aNight();
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    // A seed from `hp_max` would have healed them at the top of the fight,
    // which is exactly the stale-prep-data behaviour the live columns end.
    expect(seeded.hpCurrent).toBe(25);
    expect(seeded.hpMax).toBe(40);
    expect(seeded.conditions).toEqual(["Poisoned"]);
    // The display name is the seat's snapshot — the table's word for them.
    expect(seeded.displayName).toBe(character.name);
  }, 60_000);

  it("seeds from this campaign's live seats and from nothing else", async () => {
    // Containment now *is* the seed: `combatant.character_id` is written only
    // here, from live seats of this campaign, so what bounds the write-through
    // is which combatants exist. Three characters, one of which belongs in the
    // fight: one seated here, one seated only at the other table, one whose
    // seat was retired before the night started.
    const { character: seatedHere } = await aCharacter(20, "Seated Here");
    const elsewhere = await runtime.runPromise(
      aCharacterAt(fixture.otherTable.id, fixture.playerElsewhere, {
        name: "Elsewhere Only",
        hpMax: 20,
      }),
    );
    const retired = await aCharacter(20, "Left Already");
    await runtime.runPromise(
      withActor(fixture.player)(party.leave(fixture.campaign.id, retired.seatId)).pipe(
        Effect.orDie,
      ),
    );

    const night = await aNight();
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const list = await as(combatants.list(fixture.asDm, night.id, run.id));
    const characterIds = list
      .map((entry) => entry.characterId)
      .filter((id): id is CharacterId => id !== null);

    expect(characterIds).toContain(seatedHere.id);
    expect(characterIds).not.toContain(elsewhere.character.id);
    expect(characterIds).not.toContain(retired.character.id);
  }, 60_000);

  it("shows a fight's damage at the other table, because there is one character", async () => {
    // The continuity decision, in a fight: Pim's character is seated at both
    // tables, the Salt Road hurts them in initiative, and Salt and Sixpence
    // reads the wound off its own roster. The old architecture's §10 asserted
    // the opposite; that assertion is now the defect.
    const { character } = await aCharacter(36, "Brannoc Duskharrow");
    await runtime.runPromise(
      withActor(fixture.playerElsewhere)(
        party.join(fixture.otherTable.id, { characterId: character.id }),
      ).pipe(Effect.orDie),
    );

    const night = await aNight();
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);
    await as(combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 13 }));

    const elsewhere = await characterVia(fixture.otherTable.id, character.id);
    expect(elsewhere.hpCurrent).toBe(23);
    expect(elsewhere.conditions).toEqual([]);
  }, 60_000);

  it("keeps the fight standing, snapshot and all, when the character is deleted", async () => {
    // The snapshot half of the decision, mid-fight: the owner throws the
    // character away, the seat retires in the same transaction, and the
    // combatant keeps every field it copied at seed time with only the
    // pointer nulled. Losing the character must not rewrite the night.
    const { character } = await aCharacter(30, "Doomed Mid-Fight");
    const night = await aNight();
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);
    await as(combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 8 }));

    await runtime.runPromise(
      withActor(fixture.player)(characters.removeOwn(character.id)).pipe(Effect.orDie),
    );

    const list = await as(combatants.list(fixture.asDm, night.id, run.id));
    const still = list.find((entry) => entry.id === seeded.id);
    expect(still).toBeDefined();
    expect(still!.displayName).toBe("Doomed Mid-Fight");
    expect(still!.hpCurrent).toBe(22);
    expect(still!.characterId).toBeNull();

    // And the fight goes on: with no character behind the row, the damage
    // moves the combatant alone and there is nothing to write through to.
    const hit = await as(
      combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 5 }),
    );
    expect(hit.hpCurrent).toBe(17);

    // The character really is gone from its owner's shelf.
    const mine = await runtime.runPromise(
      withActor(fixture.player)(characters.mine).pipe(Effect.orDie),
    );
    expect(mine.some((owned) => owned.character.id === character.id)).toBe(false);
  }, 60_000);

  it("sends a seat's own delta through the fight it is in", async () => {
    const night = await aNight();
    const { character, seatId } = await aCharacter(30);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    // The DM reaches for the party list while a fight is still on the table.
    // The delta lands on the fight's copy and comes back through it, so the two
    // entry points cannot produce different answers to one hit.
    const hurt = await seatDamage(seatId, { amount: 7 });
    expect(hurt.hpCurrent).toBe(23);
    expect((await combatantFor(night.id, run.id, character.id)).hpCurrent).toBe(23);
    expect(seeded.hpCurrent).toBe(30);
  }, 60_000);

  it("carries a condition set on the seat into the fight, and back out", async () => {
    const night = await aNight();
    const { character, seatId } = await aCharacter(30);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    await as(party.update(fixture.campaign.id, seatId, { conditions: ["Blessed"] }));
    expect((await combatantFor(night.id, run.id, character.id)).conditions).toEqual(["Blessed"]);

    await as(
      combatants.update(fixture.asDm, night.id, run.id, seeded.id, { conditions: ["Prone"] }),
    );
    expect((await characterById(character.id)).conditions).toEqual(["Prone"]);
  }, 60_000);

  it("writes back only what a combatant patch named", async () => {
    const night = await aNight();
    const { character, seatId } = await aCharacter(30);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);
    await seatDamage(seatId, { amount: 4 });

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
    const { character, seatId } = await aCharacter(28);
    expect(character.hpCurrent).toBeNull();

    const hurt = await seatDamage(seatId, { amount: 10 });
    expect(hurt.hpCurrent).toBe(18);
  }, 60_000);

  it("clamps at nothing and at the maximum", async () => {
    const { seatId } = await aCharacter(28);
    expect((await seatDamage(seatId, { amount: 99 })).hpCurrent).toBe(0);
    expect((await seatDamage(seatId, { amount: -99 })).hpCurrent).toBe(28);
  }, 60_000);

  it("applies a repeated request once", async () => {
    const night = await aNight();
    await makeCurrent(night.id);
    const { seatId } = await aCharacter(28);

    const first = await seatDamage(seatId, { amount: 6, requestId: "tap-1" });
    const again = await seatDamage(seatId, { amount: 6, requestId: "tap-1" });
    expect(first.hpCurrent).toBe(22);
    expect(again.hpCurrent).toBe(22);

    // A different id is a different hit, not a repeat of the same one.
    const second = await seatDamage(seatId, { amount: 6, requestId: "tap-2" });
    expect(second.hpCurrent).toBe(16);
    await makeCurrent(null);
  }, 60_000);

  it("refuses a player the delta, on their own seat", async () => {
    // The seat is theirs to occupy and to leave — never to damage. The live
    // trio stays the table's, and the refusal is the ordinary NotFound naming
    // the seat, while the same seat is plainly in their own roster read.
    const { seatId } = await aCharacter(28);
    const refused = await runtime.runPromise(
      withActor(fixture.player)(party.damage(fixture.campaign.id, seatId, { amount: 5 })).pipe(
        Effect.flip,
      ),
    );
    expect(refused).toBeInstanceOf(NotFound);
    expect((refused as NotFound).resource).toBe("campaign_character");

    const seats = await runtime.runPromise(
      withActor(fixture.player)(party.list(fixture.campaign.id)).pipe(Effect.orDie),
    );
    expect(seats.map((seat) => seat.seat.id)).toContain(seatId);
  }, 60_000);
});

describe("the doorbell, and where it stops", () => {
  it("rings and records when a seat's delta lands during a session", async () => {
    const night = await aNight();
    await makeCurrent(night.id);
    const { character, seatId } = await aCharacter(30);

    const { rings } = await doorbellsWhile(
      night.id,
      party.damage(fixture.campaign.id, seatId, { amount: 9 }),
    );
    expect(rings).toBe(1);

    const log = await logOf(night.id);
    const recorded = log.filter((event) => event.kind === "character-updated");
    // Exactly the damage: creating a character rings nothing and records
    // nothing — `createOwn` is the owner's act, not the table's.
    expect(recorded).toHaveLength(1);
    const last = recorded.at(-1)!;
    expect(last.combatantId).toBeNull();
    expect(last.encounterRunId).toBeNull();
    expect(last.payload).toMatchObject({ characterId: character.id, amount: 9, hpCurrent: 21 });
    await makeCurrent(null);
  }, 60_000);

  it("names the fight when the write went through one", async () => {
    const night = await aNight();
    await makeCurrent(night.id);
    const { character, seatId } = await aCharacter(30);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    // From the *seat* side, into a fight that is on the table.
    await seatDamage(seatId, { amount: 11 });

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
    const { character } = await aCharacter(30);
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const seeded = await combatantFor(night.id, run.id, character.id);

    const { rings } = await doorbellsWhile(
      night.id,
      combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 11 }),
    );
    expect(rings).toBe(1);

    const log = await logOf(night.id);
    expect(log.filter((event) => event.kind === "combatant-damaged")).toHaveLength(1);
    expect(log.filter((event) => event.kind === "character-updated")).toHaveLength(0);
    expect((await characterById(character.id)).hpCurrent).toBe(19);
    await makeCurrent(null);
  }, 60_000);

  it("rings nothing when the campaign is on no session", async () => {
    // The settled decision, asserted rather than assumed: a delta typed on a
    // Tuesday updates nobody live. `campaign.current_session_id` is null here,
    // so there is no session to key a doorbell on and none is invented.
    const night = await aNight();
    const { seatId } = await aCharacter(30);

    const { result, rings } = await doorbellsWhile(
      night.id,
      party.damage(fixture.campaign.id, seatId, { amount: 9 }),
    );
    expect(rings).toBe(0);
    expect(result.hpCurrent).toBe(21);
    expect(await logOf(night.id)).toHaveLength(0);
  }, 60_000);

  it("rings nothing for the owner's own PATCH, even mid-session", async () => {
    // Stronger than the old "between games" pin: the owner's write is never
    // live. The durable sheet moved out of the campaign entirely, so a
    // level-up rings no doorbell and appends nothing whatever night is open —
    // an open DM page stays stale until it refetches, by decision.
    const night = await aNight();
    await makeCurrent(night.id);
    const { character } = await aCharacter(30);

    const { rings } = await doorbellsWhile(
      night.id,
      characters.updateOwn(character.id, { level: 4 }),
      fixture.player,
    );
    expect(rings).toBe(0);
    expect((await characterById(character.id)).level).toBe(4);
    expect(await logOf(night.id)).toHaveLength(0);
    await makeCurrent(null);
  }, 60_000);
});
