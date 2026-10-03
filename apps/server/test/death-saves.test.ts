import {
  type Actor,
  type CampaignCharacterId,
  type CharacterId,
  type Combatant,
  type CombatantId,
  Conflict,
  CurrentActor,
  deathSaveRolled,
  type EncounterRunId,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { describe, expect } from "@effect/vitest";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
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
import { PlayerTable } from "../src/repo/PlayerTable.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aCharacterAt, anAccount, aPlayerAt, asDm, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

/**
 * Death saves, as live state with two copies.
 *
 * The claims: the rules are the server's and run where the hit points move
 * (`repo/vitals.ts`), so the fight's copy and the character's never part; the
 * DM sets and rolls them on the fight's row; the owner marks them from their
 * sheet and reaches the fight only through a seat; and a player who is not
 * the owner, or not the DM, gets the ordinary `NotFound`.
 */
const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  Groups.layer,
  Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
  Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
  Creatures.layer,
  CampaignCreatorActors.layer,
  EncounterCreatures.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Encounters.layer,
  Invites.layer,
  LiveEvents.layer,
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
  PlayerTable.layer.pipe(Layer.provide(LiveEvents.layer)),
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_death_saves")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const makeFixture = Effect.gen(function* () {
  const creatures = yield* Creatures;
  const dm = yield* anAccount("Jo");
  const as = withActor(dm);
  const campaign = yield* as(createCampaign({ name: "The Salt Road", visibility: "shared" }));
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
  const player = yield* aPlayerAt(campaign.id, "Pim");
  const other = yield* aPlayerAt(campaign.id, "Wren");
  return { dm, asDm: yield* as(asDm(dm, campaign.id)), campaign, archer, player, other };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "death-saves.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

const as = <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
  Effect.flatMap(Fixture, (fixture) => withActor(fixture.dm)(effect).pipe(Effect.orDie));

let counter = 0;
/** One of Pim's characters, seated here, through the shipped create and join. */
const aCharacter = (hpMax: number) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    counter += 1;
    return yield* aCharacterAt(
      fixture.campaign.id,
      fixture.player,
      { name: `Tobin ${String(counter)}`, hpMax },
      { seatVisibility: "shared" },
    );
  });

let nights = 300;
/**
 * A fight on a fresh night that is the campaign's current one, with two goblin
 * archers and the whole party, every row shared so the player's table shows it.
 */
const aFight = Effect.gen(function* () {
  const fixture = yield* Fixture;
  const sessions = yield* Sessions;
  const campaigns = yield* Campaigns;
  const encounters = yield* Encounters;
  const roster = yield* EncounterCreatures;
  const runs = yield* EncounterRuns;
  const combatants = yield* Combatants;
  nights += 1;
  return yield* as(
    Effect.gen(function* () {
      const night = yield* sessions.create(fixture.campaign.id, {
        number: nights,
        visibility: "shared",
      });
      yield* campaigns.update(fixture.campaign.id, { currentSessionId: night.id });
      const encounter = yield* encounters.create(fixture.campaign.id, { name: "Reeds" });
      yield* roster.create(fixture.campaign.id, encounter.id, {
        creatureId: fixture.archer.id,
        count: 2,
      });
      const run = yield* runs.start(fixture.asDm, night.id, {
        encounterId: encounter.id,
        visibility: "shared",
      });
      for (const row of yield* combatants.list(fixture.asDm, night.id, run.id)) {
        yield* combatants.update(fixture.asDm, night.id, run.id, row.id, { visibility: "shared" });
      }
      return { night, run };
    }),
  );
});

const rowOf = (sessionId: SessionId, runId: EncounterRunId, characterId: CharacterId) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const combatants = yield* Combatants;
    const list = yield* as(combatants.list(fixture.asDm, sessionId, runId));
    return list.find((row) => row.characterId === characterId)!;
  });

const monsterOf = (sessionId: SessionId, runId: EncounterRunId) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const combatants = yield* Combatants;
    const list = yield* as(combatants.list(fixture.asDm, sessionId, runId));
    return list.find((row) => row.kind === "npc")!;
  });

/** The character's own two columns, read straight off the row. */
const columnsOf = (characterId: CharacterId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{
      readonly hp_current: number | null;
      readonly death_save_successes: number;
      readonly death_save_failures: number;
    }>`
      select hp_current, death_save_successes, death_save_failures
      from character where id = ${characterId}
    `.pipe(Effect.orDie);
    const row = rows[0]!;
    return {
      hpCurrent: row.hp_current,
      deathSaves: { successes: row.death_save_successes, failures: row.death_save_failures },
    };
  });

/** A PC in a fresh fight, knocked to zero. */
const aDyingPc = Effect.gen(function* () {
  const fixture = yield* Fixture;
  const combatants = yield* Combatants;
  const { character, seatId } = yield* aCharacter(20);
  const { night, run } = yield* aFight;
  const row = yield* rowOf(night.id, run.id, character.id);
  yield* as(combatants.damage(fixture.asDm, night.id, run.id, row.id, { amount: 20 }));
  return { character, seatId, night, run, id: row.id };
});

const damage = (
  at: { readonly night: { readonly id: SessionId }; readonly run: { readonly id: EncounterRunId } },
  id: CombatantId,
  payload: { readonly amount: number; readonly critical?: boolean },
) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const combatants = yield* Combatants;
    return yield* as(combatants.damage(fixture.asDm, at.night.id, at.run.id, id, payload));
  });

const roll = (
  at: { readonly night: { readonly id: SessionId }; readonly run: { readonly id: EncounterRunId } },
  id: CombatantId,
  face: number,
  requestId?: string,
) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const combatants = yield* Combatants;
    return yield* withActor(fixture.dm)(
      combatants.rollDeathSave(fixture.asDm, at.night.id, at.run.id, id, {
        face,
        ...(requestId === undefined ? {} : { requestId }),
      }),
    );
  });

const setSaves = (
  at: { readonly night: { readonly id: SessionId }; readonly run: { readonly id: EncounterRunId } },
  id: CombatantId,
  saves: { readonly successes: number; readonly failures: number },
) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const combatants = yield* Combatants;
    return yield* withActor(fixture.dm)(
      combatants.setDeathSaves(fixture.asDm, at.night.id, at.run.id, id, saves),
    );
  });

const savesOf = (combatant: Combatant) => combatant.deathSaves;

describeLayer("death-saves", shared, (it) => {
  describe("the rolled rule", () => {
    it.effect("reads a natural 20, a natural 1, 10 and over, and under, and stops at three", () =>
      Effect.sync(() => {
        const none = { successes: 0, failures: 0 };
        expect(deathSaveRolled({ successes: 2, failures: 2 }, 20)).toEqual({
          saves: none,
          revived: true,
        });
        expect(deathSaveRolled(none, 1).saves).toEqual({ successes: 0, failures: 2 });
        expect(deathSaveRolled({ successes: 0, failures: 2 }, 1).saves.failures).toBe(3);
        expect(deathSaveRolled(none, 10).saves).toEqual({ successes: 1, failures: 0 });
        expect(deathSaveRolled(none, 9).saves).toEqual({ successes: 0, failures: 1 });
        expect(deathSaveRolled({ successes: 3, failures: 0 }, 15).saves.successes).toBe(3);
      }),
    );
  });

  describe("hit points move them, on both copies", () => {
    it.effect("seeds a PC with the character's saves and an NPC with none", () =>
      Effect.gen(function* () {
        const characters = yield* Characters;
        const fixture = yield* Fixture;
        const { character } = yield* aCharacter(20);
        yield* withActor(fixture.player)(
          characters.setDeathSaves(character.id, { successes: 1, failures: 2 }),
        ).pipe(Effect.orDie);
        const { night, run } = yield* aFight;
        expect(savesOf(yield* rowOf(night.id, run.id, character.id))).toEqual({
          successes: 1,
          failures: 2,
        });
        expect(savesOf(yield* monsterOf(night.id, run.id))).toBeNull();
      }),
    );

    it.effect("adds nothing for the hit that drops them, one at zero, two on a critical", () =>
      Effect.gen(function* () {
        const dying = yield* aDyingPc;
        expect(savesOf(yield* rowOf(dying.night.id, dying.run.id, dying.character.id))).toEqual({
          successes: 0,
          failures: 0,
        });

        const hit = yield* damage(dying, dying.id, { amount: 4 });
        expect(hit.hpCurrent).toBe(0);
        expect(savesOf(hit)).toEqual({ successes: 0, failures: 1 });
        expect((yield* columnsOf(dying.character.id)).deathSaves).toEqual(savesOf(hit));

        const critical = yield* damage(dying, dying.id, { amount: 4, critical: true });
        expect(savesOf(critical)).toEqual({ successes: 0, failures: 3 });
        expect((yield* columnsOf(dying.character.id)).deathSaves).toEqual(savesOf(critical));

        // Three is the most there is.
        const again = yield* damage(dying, dying.id, { amount: 4 });
        expect(savesOf(again)).toEqual({ successes: 0, failures: 3 });
      }),
    );

    it.effect("clears both counts on any healing from zero, on both copies", () =>
      Effect.gen(function* () {
        const dying = yield* aDyingPc;
        yield* setSaves(dying, dying.id, { successes: 2, failures: 1 }).pipe(Effect.orDie);
        const healed = yield* damage(dying, dying.id, { amount: -3 });
        expect(healed.hpCurrent).toBe(3);
        expect(savesOf(healed)).toEqual({ successes: 0, failures: 0 });
        expect(yield* columnsOf(dying.character.id)).toEqual({
          hpCurrent: 3,
          deathSaves: { successes: 0, failures: 0 },
        });
      }),
    );

    it.effect("clears them when the DM types a total over zero", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const combatants = yield* Combatants;
        const dying = yield* aDyingPc;
        yield* setSaves(dying, dying.id, { successes: 1, failures: 2 }).pipe(Effect.orDie);
        const edited = yield* as(
          combatants.update(fixture.asDm, dying.night.id, dying.run.id, dying.id, {
            hpCurrent: 5,
          }),
        );
        expect(savesOf(edited)).toEqual({ successes: 0, failures: 0 });
        expect((yield* columnsOf(dying.character.id)).deathSaves).toEqual({
          successes: 0,
          failures: 0,
        });
      }),
    );

    it.effect("moves them the same way through the seat's delta", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const party = yield* Party;
        const dying = yield* aDyingPc;
        yield* as(party.damage(fixture.campaign.id, dying.seatId, { amount: 2 }));
        expect(savesOf(yield* rowOf(dying.night.id, dying.run.id, dying.character.id))).toEqual({
          successes: 0,
          failures: 1,
        });
        expect((yield* columnsOf(dying.character.id)).deathSaves).toEqual({
          successes: 0,
          failures: 1,
        });
      }),
    );

    it.effect("leaves a monster's counts alone at zero", () =>
      Effect.gen(function* () {
        const { night, run } = yield* aFight;
        const goblin = yield* monsterOf(night.id, run.id);
        yield* damage({ night, run }, goblin.id, { amount: 7 });
        const again = yield* damage({ night, run }, goblin.id, { amount: 3, critical: true });
        expect(again.hpCurrent).toBe(0);
        expect(savesOf(again)).toBeNull();
      }),
    );
  });

  describe("the DM's dots and roll", () => {
    it.effect("sets both copies and logs a death-save line", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const events = yield* SessionEvents;
        const dying = yield* aDyingPc;
        const set = yield* setSaves(dying, dying.id, { successes: 2, failures: 1 }).pipe(
          Effect.orDie,
        );
        expect(savesOf(set)).toEqual({ successes: 2, failures: 1 });
        expect((yield* columnsOf(dying.character.id)).deathSaves).toEqual({
          successes: 2,
          failures: 1,
        });
        const log = yield* as(events.list(fixture.asDm, dying.night.id, { limit: 500 }));
        const line = log.find((event) => event.kind === "death-save");
        expect(line?.combatantId).toBe(dying.id);
        expect(line?.payload).toMatchObject({ successes: 2, failures: 1 });
      }),
    );

    it.effect("brings them back with one hit point on a natural 20", () =>
      Effect.gen(function* () {
        const dying = yield* aDyingPc;
        yield* setSaves(dying, dying.id, { successes: 1, failures: 2 }).pipe(Effect.orDie);
        const up = yield* roll(dying, dying.id, 20).pipe(Effect.orDie);
        expect(up.hpCurrent).toBe(1);
        expect(savesOf(up)).toEqual({ successes: 0, failures: 0 });
        expect(yield* columnsOf(dying.character.id)).toEqual({
          hpCurrent: 1,
          deathSaves: { successes: 0, failures: 0 },
        });
      }),
    );

    it.effect("counts a natural 1 twice, 10 as a success and 9 as a failure", () =>
      Effect.gen(function* () {
        const dying = yield* aDyingPc;
        expect(savesOf(yield* roll(dying, dying.id, 10).pipe(Effect.orDie))).toEqual({
          successes: 1,
          failures: 0,
        });
        expect(savesOf(yield* roll(dying, dying.id, 9).pipe(Effect.orDie))).toEqual({
          successes: 1,
          failures: 1,
        });
        const fumbled = yield* roll(dying, dying.id, 1).pipe(Effect.orDie);
        expect(savesOf(fumbled)).toEqual({ successes: 1, failures: 3 });
        expect(fumbled.hpCurrent).toBe(0);
        expect((yield* columnsOf(dying.character.id)).deathSaves).toEqual(savesOf(fumbled));
      }),
    );

    it.effect("applies a repeated roll once", () =>
      Effect.gen(function* () {
        const dying = yield* aDyingPc;
        yield* roll(dying, dying.id, 12, "save-once").pipe(Effect.orDie);
        const repeat = yield* roll(dying, dying.id, 12, "save-once").pipe(Effect.orDie);
        expect(savesOf(repeat)).toEqual({ successes: 1, failures: 0 });
      }),
    );

    it.effect("refuses a roll for the standing, the stable, the dead and a monster", () =>
      Effect.gen(function* () {
        const dying = yield* aDyingPc;
        const goblin = yield* monsterOf(dying.night.id, dying.run.id);
        yield* damage(dying, goblin.id, { amount: 7 });
        expect(yield* roll(dying, goblin.id, 12).pipe(Effect.flip)).toBeInstanceOf(Conflict);
        expect(
          yield* setSaves(dying, goblin.id, { successes: 1, failures: 0 }).pipe(Effect.flip),
        ).toBeInstanceOf(Conflict);

        yield* setSaves(dying, dying.id, { successes: 3, failures: 0 }).pipe(Effect.orDie);
        expect(yield* roll(dying, dying.id, 12).pipe(Effect.flip)).toBeInstanceOf(Conflict);
        yield* setSaves(dying, dying.id, { successes: 0, failures: 3 }).pipe(Effect.orDie);
        expect(yield* roll(dying, dying.id, 12).pipe(Effect.flip)).toBeInstanceOf(Conflict);

        yield* damage(dying, dying.id, { amount: -5 });
        expect(yield* roll(dying, dying.id, 12).pipe(Effect.flip)).toBeInstanceOf(Conflict);
      }),
    );

    it.effect("is not the player's to reach: a player is refused the DM's proof", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // A player minted the shipped way asks to act as the campaign's DM:
        // the proof is refused, so neither endpoint has anything to run with.
        const refused = yield* asDm(fixture.player, fixture.campaign.id).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(NotFound);
      }),
    );
  });

  describe("the owner's marks", () => {
    it.effect("set the character and reach the fight through the seat", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const events = yield* SessionEvents;
        const dying = yield* aDyingPc;
        const marked = yield* withActor(fixture.player)(
          characters.setDeathSaves(dying.character.id, { successes: 2, failures: 1 }),
        ).pipe(Effect.orDie);
        expect(marked.deathSaves).toEqual({ successes: 2, failures: 1 });
        expect(savesOf(yield* rowOf(dying.night.id, dying.run.id, dying.character.id))).toEqual({
          successes: 2,
          failures: 1,
        });
        const log = yield* as(events.list(fixture.asDm, dying.night.id, { limit: 500 }));
        expect(
          log.some((event) => event.kind === "death-save" && event.combatantId === dying.id),
        ).toBe(true);
      }),
    );

    it.effect("reach no fight once the seat is retired", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const party = yield* Party;
        const dying = yield* aDyingPc;
        yield* withActor(fixture.player)(
          party.leave(fixture.campaign.id, dying.seatId as CampaignCharacterId),
        ).pipe(Effect.orDie);
        const marked = yield* withActor(fixture.player)(
          characters.setDeathSaves(dying.character.id, { successes: 1, failures: 1 }),
        ).pipe(Effect.orDie);
        expect(marked.deathSaves).toEqual({ successes: 1, failures: 1 });
        expect(savesOf(yield* rowOf(dying.night.id, dying.run.id, dying.character.id))).toEqual({
          successes: 0,
          failures: 0,
        });
      }),
    );

    it.effect("are NotFound to another player at the same table", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const dying = yield* aDyingPc;
        const refused = yield* withActor(fixture.other)(
          characters.setDeathSaves(dying.character.id, { successes: 3, failures: 0 }),
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(NotFound);
        expect((yield* columnsOf(dying.character.id)).deathSaves).toEqual({
          successes: 0,
          failures: 0,
        });
      }),
    );

    it.effect("show on the owner's own row of their table, and on nobody else's", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const table = yield* PlayerTable;
        const dying = yield* aDyingPc;
        yield* setSaves(dying, dying.id, { successes: 1, failures: 2 }).pipe(Effect.orDie);

        const mine = yield* withActor(fixture.player)(table.read(fixture.campaign.id)).pipe(
          Effect.orDie,
        );
        const own = mine?.fight?.order.find((row) => row.combatantId === dying.id);
        expect(own?.kind).toBe("you");
        expect(own !== undefined && own.kind === "you" ? own.deathSaves : null).toEqual({
          successes: 1,
          failures: 2,
        });

        // Wren is seated too, so the table is theirs to read; Tobin is an ally
        // there, and an ally carries no death saves.
        yield* aCharacterAt(
          fixture.campaign.id,
          fixture.other,
          { name: `Wren's ${String(counter)}`, hpMax: 10 },
          { seatVisibility: "shared" },
        );
        const theirs = yield* withActor(fixture.other)(table.read(fixture.campaign.id)).pipe(
          Effect.orDie,
        );
        const ally = theirs?.fight?.order.find((row) => row.combatantId === dying.id);
        expect(ally?.kind).toBe("ally");
        expect(ally).not.toHaveProperty("deathSaves");
      }),
    );
  });
});
