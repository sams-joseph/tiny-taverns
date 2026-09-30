import {
  Actor,
  type CampaignCharacterId,
  type CampaignId,
  type Character,
  type CharacterId,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  type SessionEvent,
  type SessionId,
} from "@taverns/api";
import { describe, expect } from "@effect/vitest";
import { Context, Duration, Effect, Fiber, Layer, Ref, Stream } from "effect";
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
import { describeLayer } from "./support/suite.js";

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
const services = Layer.mergeAll(
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
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_character_live")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const makeFixture = Effect.gen(function* () {
  const creatures = yield* Creatures;

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
    archer,
    otherTable,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "character-live.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

const as = <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
  Effect.flatMap(Fixture, (fixture) => withActor(fixture.dm)(effect).pipe(Effect.orDie));

/**
 * A character of the player's, seated at this campaign, with a maximum and
 * nothing said about now — the shipped path (`createOwn` writes the shared row
 * and its seat in one transaction), through the shared fixture helper.
 */
let counter = 0;
const aCharacter = (hpMax: number, name?: string) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    counter += 1;
    return yield* aCharacterAt(fixture.campaign.id, fixture.player, {
      name: name ?? `Brannoc ${String(counter)}`,
      hpMax,
    });
  });

/**
 * The ambush, two goblin archers, new for each fight: an encounter is played
 * once, so no two tests can start the same one.
 */
const anEncounter = Effect.gen(function* () {
  const fixture = yield* Fixture;
  const encounters = yield* Encounters;
  const roster = yield* EncounterCreatures;
  return yield* as(
    Effect.gen(function* () {
      const encounter = yield* encounters.create(fixture.campaign.id, {
        name: "Ambush in the reeds",
      });
      yield* roster.create(fixture.campaign.id, encounter.id, {
        creatureId: fixture.archer.id,
        count: 2,
      });
      return encounter.id;
    }),
  );
});

/** A throwaway night, so one test's fight cannot disturb another's. */
let nights = 200;
const aNight = Effect.gen(function* () {
  const fixture = yield* Fixture;
  const sessions = yield* Sessions;
  nights += 1;
  return yield* as(sessions.create(fixture.campaign.id, { number: nights }));
});

/** The night the campaign is currently on — what makes a write "during a session". */
const makeCurrent = (sessionId: SessionId | null) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const campaigns = yield* Campaigns;
    return yield* as(campaigns.update(fixture.campaign.id, { currentSessionId: sessionId }));
  });

const combatantFor = (sessionId: SessionId, runId: EncounterRunId, characterId: CharacterId) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const combatants = yield* Combatants;
    const list = yield* as(combatants.list(fixture.asDm, sessionId, runId));
    return list.find((entry) => entry.characterId === characterId)!;
  });

/**
 * The shared character, read the way a table reads it: off the roster. There
 * is no campaign-scoped character read any more — the seat is the reach — so
 * this is the product path, not a workaround.
 */
const characterVia = (campaignId: CampaignId, id: CharacterId) =>
  Effect.gen(function* () {
    const party = yield* Party;
    const seats = yield* as(party.list(campaignId));
    return seats.find((seat) => seat.character?.id === id)!.character!;
  });

const characterById = (id: CharacterId): Effect.Effect<Character, never, Fixture | Party> =>
  Effect.flatMap(Fixture, (fixture) => characterVia(fixture.campaign.id, id));

/** The seat-side delta — the out-of-fight entry point, and the creator's act. */
const seatDamage = (
  seatId: CampaignCharacterId,
  payload: { readonly amount: number; readonly requestId?: string },
) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const party = yield* Party;
    return yield* as(party.damage(fixture.campaign.id, seatId, payload));
  });

const logOf = (sessionId: SessionId) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const events = yield* SessionEvents;
    const log: ReadonlyArray<SessionEvent> = yield* as(
      events.list(fixture.asDm, sessionId, { limit: 500 }),
    );
    return log;
  });

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
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const live = yield* LiveEvents;
    const rings = yield* Ref.make(0);
    const fiber = yield* Effect.forkChild(
      Stream.runForEach(live.subscribe(sessionId), () => Ref.update(rings, (n) => n + 1)),
    );
    yield* Effect.sleep(Duration.millis(50));
    const result = yield* withActor(actor ?? fixture.dm)(action);
    yield* Effect.sleep(Duration.millis(150));
    yield* Fiber.interrupt(fiber);
    return { result, rings: yield* Ref.get(rings) };
  }).pipe(Effect.orDie);

describeLayer("character-live", shared, (it) => {
  describe("a hit point belongs to the character", () => {
    it.effect("moves both rows when damage lands in a fight", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const combatants = yield* Combatants;
        const night = yield* aNight;
        const { character } = yield* aCharacter(30);
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: yield* anEncounter }),
        );
        const seeded = yield* combatantFor(night.id, run.id, character.id);

        // A fight seeded from a character who has never been damaged starts at
        // full: `hp_current` null means nobody has said, and a seed reads that as
        // `hp_max`.
        expect(seeded.hpCurrent).toBe(30);

        const hit = yield* as(
          combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 12 }),
        );
        expect(hit.hpCurrent).toBe(18);

        // The same number, on the shared row, written by the same transaction.
        expect((yield* characterById(character.id)).hpCurrent).toBe(18);

        // And healing walks both back up together.
        const healed = yield* as(
          combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: -5 }),
        );
        expect(healed.hpCurrent).toBe(23);
        expect((yield* characterById(character.id)).hpCurrent).toBe(23);
      }),
    );

    it.effect("clamps once, in the fight, so neither row is a point out", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const combatants = yield* Combatants;
        const night = yield* aNight;
        const { character } = yield* aCharacter(24);
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: yield* anEncounter }),
        );
        const seeded = yield* combatantFor(night.id, run.id, character.id);

        const flattened = yield* as(
          combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 9999 }),
        );
        expect(flattened.hpCurrent).toBe(0);
        expect((yield* characterById(character.id)).hpCurrent).toBe(0);

        const restored = yield* as(
          combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: -9999 }),
        );
        expect(restored.hpCurrent).toBe(24);
        expect((yield* characterById(character.id)).hpCurrent).toBe(24);
      }),
    );

    it.effect("starts a fight from where the party is, not from where it began", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const party = yield* Party;
        const { character, seatId } = yield* aCharacter(40);
        // Hurt out of combat first — the trap in the corridor. Both are seat-side
        // writes now: the delta and the condition edit go through the seat.
        yield* seatDamage(seatId, { amount: 15 });
        yield* as(party.update(fixture.campaign.id, seatId, { conditions: ["Poisoned"] }));

        const night = yield* aNight;
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: yield* anEncounter }),
        );
        const seeded = yield* combatantFor(night.id, run.id, character.id);

        // A seed from `hp_max` would have healed them at the top of the fight,
        // which is exactly the stale-prep-data behaviour the live columns end.
        expect(seeded.hpCurrent).toBe(25);
        expect(seeded.hpMax).toBe(40);
        expect(seeded.conditions).toEqual(["Poisoned"]);
        // The display name is the seat's snapshot — the table's word for them.
        expect(seeded.displayName).toBe(character.name);
      }),
    );

    it.effect("seeds from this campaign's live seats and from nothing else", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const combatants = yield* Combatants;
        const party = yield* Party;
        // Containment now *is* the seed: `combatant.character_id` is written only
        // here, from live seats of this campaign, so what bounds the write-through
        // is which combatants exist. Three characters, one of which belongs in the
        // fight: one seated here, one seated only at the other table, one whose
        // seat was retired before the night started.
        const { character: seatedHere } = yield* aCharacter(20, "Seated Here");
        const elsewhere = yield* aCharacterAt(fixture.otherTable.id, fixture.playerElsewhere, {
          name: "Elsewhere Only",
          hpMax: 20,
        });
        const retired = yield* aCharacter(20, "Left Already");
        yield* withActor(fixture.player)(party.leave(fixture.campaign.id, retired.seatId)).pipe(
          Effect.orDie,
        );

        const night = yield* aNight;
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: yield* anEncounter }),
        );
        const list = yield* as(combatants.list(fixture.asDm, night.id, run.id));
        const characterIds = list
          .map((entry) => entry.characterId)
          .filter((id): id is CharacterId => id !== null);

        expect(characterIds).toContain(seatedHere.id);
        expect(characterIds).not.toContain(elsewhere.character.id);
        expect(characterIds).not.toContain(retired.character.id);
      }),
    );

    it.effect("shows a fight's damage at the other table, because there is one character", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const combatants = yield* Combatants;
        const party = yield* Party;
        // The continuity decision, in a fight: Pim's character is seated at both
        // tables, the Salt Road hurts them in initiative, and Salt and Sixpence
        // reads the wound off its own roster. The old architecture's §10 asserted
        // the opposite; that assertion is now the defect.
        const { character } = yield* aCharacter(36, "Brannoc Duskharrow");
        yield* withActor(fixture.playerElsewhere)(
          party.join(fixture.otherTable.id, { characterId: character.id }),
        ).pipe(Effect.orDie);

        const night = yield* aNight;
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: yield* anEncounter }),
        );
        const seeded = yield* combatantFor(night.id, run.id, character.id);
        yield* as(combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 13 }));

        const elsewhere = yield* characterVia(fixture.otherTable.id, character.id);
        expect(elsewhere.hpCurrent).toBe(23);
        expect(elsewhere.conditions).toEqual([]);
      }),
    );

    it.effect("keeps the fight standing, snapshot and all, when the character is deleted", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const combatants = yield* Combatants;
        const characters = yield* Characters;
        // The snapshot half of the decision, mid-fight: the owner throws the
        // character away, the seat retires in the same transaction, and the
        // combatant keeps every field it copied at seed time with only the
        // pointer nulled. Losing the character must not rewrite the night.
        const { character } = yield* aCharacter(30, "Doomed Mid-Fight");
        const night = yield* aNight;
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: yield* anEncounter }),
        );
        const seeded = yield* combatantFor(night.id, run.id, character.id);
        yield* as(combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 8 }));

        yield* withActor(fixture.player)(characters.removeOwn(character.id)).pipe(Effect.orDie);

        const list = yield* as(combatants.list(fixture.asDm, night.id, run.id));
        const still = list.find((entry) => entry.id === seeded.id);
        expect(still).toBeDefined();
        expect(still!.displayName).toBe("Doomed Mid-Fight");
        expect(still!.hpCurrent).toBe(22);
        expect(still!.characterId).toBeNull();

        // And the fight goes on: with no character behind the row, the damage
        // moves the combatant alone and there is nothing to write through to.
        const hit = yield* as(
          combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 5 }),
        );
        expect(hit.hpCurrent).toBe(17);

        // The character really is gone from its owner's shelf.
        const mine = yield* withActor(fixture.player)(characters.mine).pipe(Effect.orDie);
        expect(mine.some((owned) => owned.character.id === character.id)).toBe(false);
      }),
    );

    it.effect("sends a seat's own delta through the fight it is in", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const night = yield* aNight;
        const { character, seatId } = yield* aCharacter(30);
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: yield* anEncounter }),
        );
        const seeded = yield* combatantFor(night.id, run.id, character.id);

        // The DM reaches for the party list while a fight is still on the table.
        // The delta lands on the fight's copy and comes back through it, so the two
        // entry points cannot produce different answers to one hit.
        const hurt = yield* seatDamage(seatId, { amount: 7 });
        expect(hurt.hpCurrent).toBe(23);
        expect((yield* combatantFor(night.id, run.id, character.id)).hpCurrent).toBe(23);
        expect(seeded.hpCurrent).toBe(30);
      }),
    );

    it.effect("carries a condition set on the seat into the fight, and back out", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const combatants = yield* Combatants;
        const party = yield* Party;
        const night = yield* aNight;
        const { character, seatId } = yield* aCharacter(30);
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: yield* anEncounter }),
        );
        const seeded = yield* combatantFor(night.id, run.id, character.id);

        yield* as(party.update(fixture.campaign.id, seatId, { conditions: ["Blessed"] }));
        expect((yield* combatantFor(night.id, run.id, character.id)).conditions).toEqual([
          "Blessed",
        ]);

        yield* as(
          combatants.update(fixture.asDm, night.id, run.id, seeded.id, { conditions: ["Prone"] }),
        );
        expect((yield* characterById(character.id)).conditions).toEqual(["Prone"]);
      }),
    );

    it.effect("writes back only what a combatant patch named", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const combatants = yield* Combatants;
        const night = yield* aNight;
        const { character, seatId } = yield* aCharacter(30);
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: yield* anEncounter }),
        );
        const seeded = yield* combatantFor(night.id, run.id, character.id);
        yield* seatDamage(seatId, { amount: 4 });

        // Renaming a row in the initiative list must not write the fight's hit
        // points back over a character somebody healed a moment ago — so a patch
        // that did not name `hpCurrent` writes no hit point at all.
        yield* as(
          combatants.update(fixture.asDm, night.id, run.id, seeded.id, {
            displayName: "Brannoc II",
          }),
        );
        expect((yield* characterById(character.id)).hpCurrent).toBe(26);
      }),
    );
  });

  describe("out of a fight", () => {
    it.effect("counts down from full when nobody has said where they are", () =>
      Effect.gen(function* () {
        const { character, seatId } = yield* aCharacter(28);
        expect(character.hpCurrent).toBeNull();

        const hurt = yield* seatDamage(seatId, { amount: 10 });
        expect(hurt.hpCurrent).toBe(18);
      }),
    );

    it.effect("clamps at nothing and at the maximum", () =>
      Effect.gen(function* () {
        const { seatId } = yield* aCharacter(28);
        expect((yield* seatDamage(seatId, { amount: 99 })).hpCurrent).toBe(0);
        expect((yield* seatDamage(seatId, { amount: -99 })).hpCurrent).toBe(28);
      }),
    );

    it.effect("applies a repeated request once", () =>
      Effect.gen(function* () {
        const night = yield* aNight;
        yield* makeCurrent(night.id);
        const { seatId } = yield* aCharacter(28);

        const first = yield* seatDamage(seatId, { amount: 6, requestId: "tap-1" });
        const again = yield* seatDamage(seatId, { amount: 6, requestId: "tap-1" });
        expect(first.hpCurrent).toBe(22);
        expect(again.hpCurrent).toBe(22);

        // A different id is a different hit, not a repeat of the same one.
        const second = yield* seatDamage(seatId, { amount: 6, requestId: "tap-2" });
        expect(second.hpCurrent).toBe(16);
        yield* makeCurrent(null);
      }),
    );

    it.effect("refuses a player the delta, on their own seat", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const party = yield* Party;
        // The seat is theirs to occupy and to leave — never to damage. The live
        // trio stays the table's, and the refusal is the ordinary NotFound naming
        // the seat, while the same seat is plainly in their own roster read.
        const { seatId } = yield* aCharacter(28);
        const refused = yield* withActor(fixture.player)(
          party.damage(fixture.campaign.id, seatId, { amount: 5 }),
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(NotFound);
        expect((refused as NotFound).resource).toBe("campaign_character");

        const seats = yield* withActor(fixture.player)(party.list(fixture.campaign.id)).pipe(
          Effect.orDie,
        );
        expect(seats.map((seat) => seat.seat.id)).toContain(seatId);
      }),
    );
  });

  describe("the doorbell, and where it stops", () => {
    it.effect("rings and records when a seat's delta lands during a session", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const party = yield* Party;
        const night = yield* aNight;
        yield* makeCurrent(night.id);
        const { character, seatId } = yield* aCharacter(30);

        const { rings } = yield* doorbellsWhile(
          night.id,
          party.damage(fixture.campaign.id, seatId, { amount: 9 }),
        );
        expect(rings).toBe(1);

        const log = yield* logOf(night.id);
        const recorded = log.filter((event) => event.kind === "character-updated");
        // Exactly the damage: creating a character rings nothing and records
        // nothing — `createOwn` is the owner's act, not the table's.
        expect(recorded).toHaveLength(1);
        const last = recorded.at(-1)!;
        expect(last.combatantId).toBeNull();
        expect(last.encounterRunId).toBeNull();
        expect(last.payload).toMatchObject({ characterId: character.id, amount: 9, hpCurrent: 21 });
        yield* makeCurrent(null);
      }),
    );

    it.effect("rings and records when the creator awards inspiration during a session", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const party = yield* Party;
        const night = yield* aNight;
        yield* makeCurrent(night.id);
        const { character, seatId } = yield* aCharacter(30);

        const { result, rings } = yield* doorbellsWhile(
          night.id,
          party.update(fixture.campaign.id, seatId, { inspiration: true }),
        );
        expect(rings).toBe(1);
        expect(result.character?.inspiration).toBe(true);

        const log = yield* logOf(night.id);
        const recorded = log.filter((event) => event.kind === "character-updated");
        expect(recorded).toHaveLength(1);
        expect(recorded[0]!.payload).toEqual({ characterId: character.id, inspiration: true });
        yield* makeCurrent(null);
      }),
    );

    it.effect("names the fight when the write went through one", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const events = yield* SessionEvents;
        const night = yield* aNight;
        yield* makeCurrent(night.id);
        const { character, seatId } = yield* aCharacter(30);
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: yield* anEncounter }),
        );
        const seeded = yield* combatantFor(night.id, run.id, character.id);

        // From the *seat* side, into a fight that is on the table.
        yield* seatDamage(seatId, { amount: 11 });

        const log = yield* logOf(night.id);
        const last = log.filter((event) => event.kind === "character-updated").at(-1)!;
        expect(last.combatantId).toBe(seeded.id);
        // The run id too, though the plan only names the combatant: without it the
        // event is invisible to the run-filtered live stream, and an event no
        // consumer can read is worse than no event.
        expect(last.encounterRunId).toBe(run.id);

        const streamed = yield* as(events.listForRun(fixture.asDm, night.id, run.id, 0, 100));
        expect(streamed.map((event) => event.kind)).toContain("character-updated");
        yield* makeCurrent(null);
      }),
    );

    it.effect("records one line, not two, when the hit came through the fight's own button", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const combatants = yield* Combatants;
        // The DM taps `minus` in the runner. That is one write and one entry in the
        // campaign's memory: `combatant-damaged` names the combatant and carries the
        // number, and the character it wrote through to is not a second event. A
        // duplicate here would show as a duplicate row in the DM's own log panel.
        const night = yield* aNight;
        yield* makeCurrent(night.id);
        const { character } = yield* aCharacter(30);
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: yield* anEncounter }),
        );
        const seeded = yield* combatantFor(night.id, run.id, character.id);

        const { rings } = yield* doorbellsWhile(
          night.id,
          combatants.damage(fixture.asDm, night.id, run.id, seeded.id, { amount: 11 }),
        );
        expect(rings).toBe(1);

        const log = yield* logOf(night.id);
        expect(log.filter((event) => event.kind === "combatant-damaged")).toHaveLength(1);
        expect(log.filter((event) => event.kind === "character-updated")).toHaveLength(0);
        expect((yield* characterById(character.id)).hpCurrent).toBe(19);
        yield* makeCurrent(null);
      }),
    );

    it.effect("rings nothing when the campaign is on no session", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const party = yield* Party;
        // The settled decision, asserted rather than assumed: a delta typed on a
        // Tuesday updates nobody live. `campaign.current_session_id` is null here,
        // so there is no session to key a doorbell on and none is invented.
        const night = yield* aNight;
        const { seatId } = yield* aCharacter(30);

        const { result, rings } = yield* doorbellsWhile(
          night.id,
          party.damage(fixture.campaign.id, seatId, { amount: 9 }),
        );
        expect(rings).toBe(0);
        expect(result.hpCurrent).toBe(21);
        expect(yield* logOf(night.id)).toHaveLength(0);
      }),
    );

    it.effect("rings nothing for the owner's own PATCH, even mid-session", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        // Stronger than the old "between games" pin: the owner's write is never
        // live. The durable sheet moved out of the campaign entirely, so a
        // level-up rings no doorbell and appends nothing whatever night is open —
        // an open DM page stays stale until it refetches, by decision.
        const night = yield* aNight;
        yield* makeCurrent(night.id);
        const { character } = yield* aCharacter(30);

        const { rings } = yield* doorbellsWhile(
          night.id,
          characters.updateOwn(character.id, { level: 4 }),
          fixture.player,
        );
        expect(rings).toBe(0);
        expect((yield* characterById(character.id)).level).toBe(4);
        expect(yield* logOf(night.id)).toHaveLength(0);
        yield* makeCurrent(null);
      }),
    );
  });
});
