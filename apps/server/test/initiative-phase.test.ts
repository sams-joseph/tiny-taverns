import {
  type Actor,
  type Combatant,
  type CombatantId,
  CurrentActor,
  emptyStatBlock,
  type EncounterRun,
  type SessionId,
} from "@taverns/api";
import { describe, expect } from "@effect/vitest";
import { Context, Effect, Layer } from "effect";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aCharacterAt, aPlayerAt, anAccount, asDm, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

/**
 * The initiative phase, from the DM's side: a fight opens with no numbers and
 * nobody up, collects them (`Combatants.setInitiative`), starts round 1
 * (`begin`) only once every row has one, and can go back (`reroll`) without
 * losing any. The order breaks ties by bonus and then the players, and *Next
 * turn* passes over monsters at zero hit points.
 *
 * What a player may do in the phase is `player-initiative.test.ts`.
 */
const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  Groups.layer,
  Characters.layer,
  Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
  Creatures.layer,
  CampaignCreatorActors.layer,
  EncounterCreatures.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Encounters.layer,
  Invites.layer,
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_initiative_phase")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const abilities = (dex: string) => [
  { label: "STR", score: "10", modifier: "+0" },
  { label: "DEX", score: "14", modifier: dex },
];

/**
 * Two players' characters — one whose sheet writes its initiative (an Alert
 * feat), one that has only its DEX — and a roster of two goblins (DEX +2) and
 * a hag (DEX +1), for the encounters `startOn` builds. Plus a social encounter
 * with the same party, to show the other kinds still open on turns.
 */
const makeFixture = Effect.gen(function* () {
  const creatures = yield* Creatures;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);
  const campaign = yield* as(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  const pim = yield* aPlayerAt(campaign.id, "Pim");
  const wren = yield* aPlayerAt(campaign.id, "Wren");
  const { character: brannoc } = yield* aCharacterAt(campaign.id, pim, {
    name: "Brannoc",
    hpMax: 52,
    sheet: {
      notes: "",
      abilities: abilities("+1"),
      traits: [],
      identity: { initiative: "+6" },
    },
  });
  const { character: nessa } = yield* aCharacterAt(campaign.id, wren, {
    name: "Nessa",
    hpMax: 34,
    sheet: { notes: "", abilities: abilities("+2"), traits: [] },
  });

  const goblin = yield* as(
    creatures.libraryCreate({
      name: "Goblin",
      size: "Small",
      type: "Humanoid",
      cr: "1/4",
      ac: 15,
      hp: 7,
      statBlock: { ...emptyStatBlock, abilities: abilities("+2") },
    }),
  );
  const hag = yield* as(
    creatures.libraryCreate({
      name: "Marsh Hag",
      size: "Medium",
      type: "Fey",
      cr: "2",
      ac: 17,
      hp: 82,
      statBlock: { ...emptyStatBlock, abilities: abilities("+1") },
    }),
  );

  return {
    dm,
    asDm: yield* as(asDm(dm, campaign.id)),
    campaign,
    goblin,
    hag,
    brannoc,
    nessa,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "initiative-phase.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

const as = <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
  Effect.flatMap(Fixture, (fixture) => withActor(fixture.dm)(effect).pipe(Effect.orDie));

/** The failure's tag, for a call that is meant to be refused. */
const refused = <A, E extends { readonly _tag: string }, R>(
  effect: Effect.Effect<A, E, R | CurrentActor>,
) =>
  Effect.flatMap(Fixture, (fixture) =>
    withActor(fixture.dm)(Effect.flip(effect)).pipe(Effect.orDie),
  );

let nightNumber = 0;
const night = () =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const sessions = yield* Sessions;
    nightNumber += 1;
    return yield* as(sessions.create(fixture.campaign.id, { number: nightNumber }));
  });

/**
 * Put a new encounter on the table: the ambush (two goblins and the hag) or the
 * hag's bargain, a conversation with her in it. New each time, because an
 * encounter is played once.
 */
const startOn = (sessionId: SessionId, encounter: "fight" | "bargain" = "fight") =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const encounters = yield* Encounters;
    const roster = yield* EncounterCreatures;
    const runs = yield* EncounterRuns;
    return yield* as(
      Effect.gen(function* () {
        const campaignId = fixture.campaign.id;
        const made = yield* encounter === "fight"
          ? encounters.create(campaignId, { name: "Ambush in the reeds" })
          : encounters.create(campaignId, { name: "The hag's bargain", kind: "social" });
        if (encounter === "fight") {
          yield* roster.create(campaignId, made.id, { creatureId: fixture.goblin.id, count: 2 });
        }
        yield* roster.create(campaignId, made.id, { creatureId: fixture.hag.id, count: 1 });
        return yield* runs.start(fixture.asDm, sessionId, { encounterId: made.id });
      }),
    );
  });

const listOf = (sessionId: SessionId, run: EncounterRun) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const combatants = yield* Combatants;
    return yield* as(combatants.list(fixture.asDm, sessionId, run.id));
  });

const named = (list: ReadonlyArray<Combatant>, name: string) =>
  list.filter((row) => row.displayName === name);

const setAll = (
  sessionId: SessionId,
  run: EncounterRun,
  numbers: ReadonlyArray<readonly [CombatantId, number | null]>,
  requestId?: string,
) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const combatants = yield* Combatants;
    return yield* as(
      combatants.setInitiative(fixture.asDm, sessionId, run.id, {
        entries: numbers.map(([combatantId, initiative]) => ({ combatantId, initiative })),
        ...(requestId === undefined ? {} : { requestId }),
      }),
    );
  });

describeLayer("initiative-phase", shared, (it) => {
  describe("a fight opens on rolling initiative", () => {
    it.effect("has no numbers, nobody up, and each row's bonus from its sheet or stat block", () =>
      Effect.gen(function* () {
        const session = yield* night();
        const run = yield* startOn(session.id);
        const list = yield* listOf(session.id, run);

        expect(run).toMatchObject({ phase: "initiative", activeCombatantId: null, round: 1 });
        expect(list.every((row) => row.initiative === null && row.initiativeSetBy === null)).toBe(
          true,
        );
        // The written initiative wins over DEX; without one, DEX.
        expect(named(list, "Brannoc")[0]?.initiativeBonus).toBe(6);
        expect(named(list, "Nessa")[0]?.initiativeBonus).toBe(2);
        expect(named(list, "Goblin").map((row) => row.initiativeBonus)).toEqual([2, 2]);
        expect(named(list, "Marsh Hag")[0]?.initiativeBonus).toBe(1);
      }),
    );

    it.effect(
      "rolls nothing for a conversation, until it turns into a fight and rolls as one",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const runs = yield* EncounterRuns;
          const session = yield* night();
          const run = yield* startOn(session.id, "bargain");
          expect(run).toMatchObject({ mode: "social", activeCombatantId: null });
          expect((yield* refused(runs.begin(fixture.asDm, session.id, run.id, {})))._tag).toBe(
            "Conflict",
          );

          const fight = yield* as(runs.escalate(fixture.asDm, session.id, run.id));
          expect(fight).toMatchObject({
            mode: "combat",
            phase: "initiative",
            round: 1,
            activeCombatantId: null,
          });
          const list = yield* listOf(session.id, run);
          expect(list.every((row) => row.initiative === null)).toBe(true);
          // The bonuses were snapshotted when the conversation started.
          expect(named(list, "Marsh Hag")[0]?.initiativeBonus).toBe(1);
          const ordered = yield* setAll(
            session.id,
            run,
            list.map((row, index) => [row.id, 20 - index] as const),
          );
          const begun = yield* as(runs.begin(fixture.asDm, session.id, run.id, {}));
          expect(begun).toMatchObject({ phase: "turns", activeCombatantId: ordered[0]!.id });
        }),
    );

    it.effect("refuses Next turn, and a hand-set marker, while initiative is being rolled", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const combatants = yield* Combatants;
        const session = yield* night();
        const run = yield* startOn(session.id);
        const list = yield* listOf(session.id, run);

        expect((yield* refused(runs.nextTurn(fixture.asDm, session.id, run.id, {})))._tag).toBe(
          "Conflict",
        );
        expect(
          (yield* refused(
            runs.update(fixture.asDm, session.id, run.id, { activeCombatantId: list[0]!.id }),
          ))._tag,
        ).toBe("Conflict");
        // Everything else about the fight still works: it is on the table.
        yield* as(runs.update(fixture.asDm, session.id, run.id, { visibility: "shared" }));
        yield* as(combatants.damage(fixture.asDm, session.id, run.id, list[0]!.id, { amount: 1 }));
      }),
    );
  });

  describe("the DM's numbers", () => {
    it.effect("land together, in order, as the DM's, and a repeated request changes nothing", () =>
      Effect.gen(function* () {
        const session = yield* night();
        const run = yield* startOn(session.id);
        const list = yield* listOf(session.id, run);
        const [first, second] = named(list, "Goblin");

        const after = yield* setAll(
          session.id,
          run,
          [
            [first!.id, 9],
            [second!.id, 15],
          ],
          "roll-monsters-1",
        );
        expect(after[0]).toMatchObject({ id: second!.id, initiative: 15, initiativeSetBy: "dm" });
        expect(after[1]).toMatchObject({ id: first!.id, initiative: 9 });

        // Somebody changes a number by hand; a replay of the first request must
        // not put the old one back.
        yield* setAll(session.id, run, [[first!.id, 3]]);
        yield* setAll(session.id, run, [[first!.id, 9]], "roll-monsters-1");
        expect(
          named(yield* listOf(session.id, run), "Goblin").map((row) => row.initiative),
        ).toEqual([15, 3]);
      }),
    );

    it.effect("writes nothing when one line names a combatant from another fight", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const combatants = yield* Combatants;
        const session = yield* night();
        const run = yield* startOn(session.id);
        const elsewhere = yield* night();
        const other = yield* startOn(elsewhere.id);
        const mine = (yield* listOf(session.id, run))[0]!;
        const theirs = (yield* listOf(elsewhere.id, other))[0]!;

        const failure = yield* refused(
          combatants.setInitiative(fixture.asDm, session.id, run.id, {
            entries: [
              { combatantId: mine.id, initiative: 12 },
              { combatantId: theirs.id, initiative: 12 },
            ],
          }),
        );
        expect(failure._tag).toBe("NotFound");
        const reread = yield* listOf(session.id, run);
        expect(reread.find((row) => row.id === mine.id)?.initiative).toBeNull();
        expect((yield* listOf(elsewhere.id, other))[0]?.initiative).toBeNull();
      }),
    );

    it.effect("can clear a number typed in error", () =>
      Effect.gen(function* () {
        const session = yield* night();
        const run = yield* startOn(session.id);
        const row = (yield* listOf(session.id, run))[0]!;

        yield* setAll(session.id, run, [[row.id, 30]]);
        const cleared = yield* setAll(session.id, run, [[row.id, null]]);
        expect(cleared.find((line) => line.id === row.id)).toMatchObject({
          initiative: null,
          initiativeSetBy: null,
        });
      }),
    );
  });

  describe("the order", () => {
    it.effect(
      "breaks ties by the initiative bonus, then the players, and puts no number last",
      () =>
        Effect.gen(function* () {
          const session = yield* night();
          const run = yield* startOn(session.id);
          const list = yield* listOf(session.id, run);
          const brannoc = named(list, "Brannoc")[0]!;
          const nessa = named(list, "Nessa")[0]!;
          const [goblin, otherGoblin] = named(list, "Goblin");
          const hag = named(list, "Marsh Hag")[0]!;

          const ordered = yield* setAll(session.id, run, [
            [brannoc.id, 12], // bonus 6
            [nessa.id, 14], // bonus 2
            [goblin!.id, 14], // bonus 2, a monster
            [hag.id, 12], // bonus 1
            // `otherGoblin` has no number yet.
          ]);
          expect(ordered.map((row) => row.id)).toEqual([
            nessa.id,
            goblin!.id,
            brannoc.id,
            hag.id,
            otherGoblin!.id,
          ]);
        }),
    );
  });

  describe("starting round 1", () => {
    it.effect("is refused while anyone has no number, hidden rows included", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const session = yield* night();
        const run = yield* startOn(session.id);
        const list = yield* listOf(session.id, run);
        yield* setAll(
          session.id,
          run,
          list.slice(1).map((row) => [row.id, 10] as const),
        );

        const failure = yield* refused(runs.begin(fixture.asDm, session.id, run.id, {}));
        expect(failure._tag).toBe("Conflict");
        expect(String((failure as { readonly message?: string }).message)).toContain(
          "one combatant",
        );
        expect((yield* as(runs.findById(fixture.asDm, session.id, run.id))).phase).toBe(
          "initiative",
        );
      }),
    );

    it.effect(
      "puts the marker on the first in the order and keeps the round, and a second press does nothing",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const runs = yield* EncounterRuns;
          const session = yield* night();
          const run = yield* startOn(session.id);
          const list = yield* listOf(session.id, run);
          const ordered = yield* setAll(
            session.id,
            run,
            list.map((row, index) => [row.id, 20 - index] as const),
          );

          const begun = yield* as(runs.begin(fixture.asDm, session.id, run.id, {}));
          expect(begun).toMatchObject({
            phase: "turns",
            activeCombatantId: ordered[0]!.id,
            round: 1,
          });
          const advanced = yield* as(runs.nextTurn(fixture.asDm, session.id, run.id, {}));
          const again = yield* as(runs.begin(fixture.asDm, session.id, run.id, {}));
          expect(again.activeCombatantId).toBe(advanced.activeCombatantId);
        }),
    );
  });

  describe("rerolling initiative", () => {
    it.effect("goes back to the phase with every number and the round kept, and begins again", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const session = yield* night();
        const run = yield* startOn(session.id);
        const list = yield* listOf(session.id, run);
        yield* setAll(
          session.id,
          run,
          list.map((row, index) => [row.id, 20 - index] as const),
        );
        yield* as(runs.begin(fixture.asDm, session.id, run.id, {}));
        yield* as(runs.update(fixture.asDm, session.id, run.id, { round: 3 }));

        const rolling = yield* as(runs.reroll(fixture.asDm, session.id, run.id, {}));
        expect(rolling).toMatchObject({ phase: "initiative", activeCombatantId: null, round: 3 });
        const kept = yield* listOf(session.id, run);
        expect(kept.map((row) => row.initiative)).toEqual(list.map((_, index) => 20 - index));

        // The DM changes the one number that changed, and starts again.
        const last = kept.at(-1)!;
        const reordered = yield* setAll(session.id, run, [[last.id, 25]]);
        const begun = yield* as(runs.begin(fixture.asDm, session.id, run.id, {}));
        expect(begun).toMatchObject({
          phase: "turns",
          round: 3,
          activeCombatantId: reordered[0]!.id,
        });
        expect(reordered[0]!.id).toBe(last.id);
      }),
    );
  });

  describe("Next turn", () => {
    it.effect("passes over a monster at zero hit points and never over a character at zero", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const combatants = yield* Combatants;
        const session = yield* night();
        const run = yield* startOn(session.id);
        const list = yield* listOf(session.id, run);
        const brannoc = named(list, "Brannoc")[0]!;
        const nessa = named(list, "Nessa")[0]!;
        const [goblin, otherGoblin] = named(list, "Goblin");
        const hag = named(list, "Marsh Hag")[0]!;
        // Nessa 20, goblin 18, Brannoc 16, hag 14, the other goblin 12.
        yield* setAll(session.id, run, [
          [nessa.id, 20],
          [goblin!.id, 18],
          [brannoc.id, 16],
          [hag.id, 14],
          [otherGoblin!.id, 12],
        ]);
        yield* as(combatants.damage(fixture.asDm, session.id, run.id, goblin!.id, { amount: 7 }));
        yield* as(combatants.damage(fixture.asDm, session.id, run.id, brannoc.id, { amount: 52 }));
        yield* as(
          combatants.damage(fixture.asDm, session.id, run.id, otherGoblin!.id, { amount: 7 }),
        );

        const begun = yield* as(runs.begin(fixture.asDm, session.id, run.id, {}));
        const seen: Array<CombatantId | null> = [begun.activeCombatantId];
        let current = begun;
        for (let step = 0; step < 3; step += 1) {
          current = yield* as(runs.nextTurn(fixture.asDm, session.id, run.id, {}));
          seen.push(current.activeCombatantId);
        }

        // Nessa, (the downed goblin passed over), Brannoc at zero for his death
        // save, the hag, (the other downed goblin passed over at the bottom) and
        // round 2 back at Nessa.
        expect(seen).toEqual([nessa.id, brannoc.id, hag.id, nessa.id]);
        expect(current.round).toBe(2);

        // Healed back up, the goblin has its turns again.
        yield* as(combatants.damage(fixture.asDm, session.id, run.id, goblin!.id, { amount: -3 }));
        const next = yield* as(runs.nextTurn(fixture.asDm, session.id, run.id, {}));
        expect(next.activeCombatantId).toBe(goblin!.id);
      }),
    );
  });

  describe("the new writes are the creator's", () => {
    it.effect("refuses a proof to a player of the campaign, so none of them can be reached", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const player = yield* aPlayerAt(fixture.campaign.id, "Tam");
        const failure = yield* Effect.flip(asDm(player, fixture.campaign.id)).pipe(Effect.orDie);
        expect(failure._tag).toBe("NotFound");
      }),
    );
  });
});
