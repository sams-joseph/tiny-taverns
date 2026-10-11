import { describe, expect } from "@effect/vitest";
import {
  Conflict,
  CurrentActor,
  NotFound,
  type Actor,
  type CharacterId,
  type RollCreate,
} from "@taverns/api";
import { Effect, Layer } from "effect";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { BattleMaps } from "../src/repo/BattleMaps.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
import { PlayerTable } from "../src/repo/PlayerTable.js";
import { Rolls } from "../src/repo/Rolls.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aCampaignBy, aCharacterAt, aPlayerAt, anAccount, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { aFightUnderWay } from "./support/fights.js";
import { describeLayer } from "./support/suite.js";

const services = Layer.mergeAll(
  Accounts.layer,
  BattleMaps.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  Groups.layer,
  Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
  CampaignCreatorActors.layer,
  Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
  Encounters.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Invites.layer,
  LiveEvents.layer,
  PlayerTable.layer.pipe(Layer.provide(LiveEvents.layer)),
  Rolls.layer.pipe(Layer.provide(LiveEvents.layer)),
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("rolls")));

const as = <A, E, R>(actor: Actor, effect: Effect.Effect<A, E, R | CurrentActor>) =>
  Effect.provideService(effect, CurrentActor, actor);

const payload = (characterId: CharacterId, requestId?: string) => ({
  characterId,
  label: "Longsword",
  notation: "1d20+5",
  dice: [17],
  kept: [17],
  modifier: 5,
  total: 22,
  mode: "normal" as const,
  critical: null,
  ...(requestId === undefined ? {} : { requestId }),
});

const fixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const sessions = yield* Sessions;
  const dm = yield* anAccount("Fen");
  const campaign = yield* aCampaignBy(dm, { name: "The Salt Road", visibility: "shared" });
  const player = yield* aPlayerAt(campaign.id, "Brannoc");
  const other = yield* aPlayerAt(campaign.id, "Wren");
  const { character } = yield* aCharacterAt(campaign.id, player, { name: "Brannoc", level: 1 });
  const session = yield* as(dm, sessions.create(campaign.id, { number: 12, visibility: "shared" }));
  yield* as(dm, campaigns.update(campaign.id, { currentSessionId: session.id }));
  return { dm, player, other, campaign, character, sessionId: session.id };
});

describeLayer("rolls", services, (it) => {
  it.effect(
    "persists a player's browser roll, emits a doorbell marker, and is idempotent by request",
    () =>
      Effect.gen(function* () {
        const seen = yield* Effect.gen(function* () {
          const f = yield* fixture;
          const rolls = yield* Rolls;
          const events = yield* SessionEvents;
          const dm = yield* asDm(f.dm, f.campaign.id);
          const first = yield* as(
            f.player,
            rolls.create(f.campaign.id, payload(f.character.id, "swing-1")),
          );
          const repeat = yield* as(
            f.player,
            rolls.create(f.campaign.id, payload(f.character.id, "swing-1")),
          );
          const listed = yield* as(f.dm, rolls.list(f.campaign.id, f.sessionId, { limit: 10 }));
          const ownLog = yield* as(
            f.player,
            rolls.listForCharacter(f.campaign.id, f.sessionId, f.character.id, { limit: 10 }),
          );
          const log = yield* events.list(dm, f.sessionId, { since: 0, limit: 10 });
          return { first, repeat, listed, ownLog, log };
        });

        expect(seen.repeat.id).toBe(seen.first.id);
        expect(seen.listed.map((roll) => roll.id)).toEqual([seen.first.id]);
        expect(seen.first.encounterRunId).toBeNull();
        expect(seen.first.accountName).toBe("Brannoc");
        expect(seen.first.characterName).toBe("Brannoc");
        expect(seen.first.visibility).toBe("shared");
        expect(seen.ownLog.map((roll) => roll.id)).toEqual([seen.first.id]);
        expect(seen.log.map((event) => event.kind)).toEqual(["roll-made"]);
      }),
  );

  it.effect("uses the active run at append time, without trusting a payload", () =>
    Effect.gen(function* () {
      const seen = yield* Effect.gen(function* () {
        const f = yield* fixture;
        const encounters = yield* Encounters;
        const runs = yield* EncounterRuns;
        const rolls = yield* Rolls;
        const dm = yield* asDm(f.dm, f.campaign.id);
        const encounter = yield* as(f.dm, encounters.create(f.campaign.id, { name: "Ambush" }));
        const run = yield* runs.start(dm, f.sessionId, { encounterId: encounter.id });
        const roll = yield* as(f.player, rolls.create(f.campaign.id, payload(f.character.id)));
        const asCreator = yield* as(f.dm, rolls.findById(f.campaign.id, f.sessionId, roll.id));
        return { run, roll, asCreator };
      });

      // Stamped with the fight on the table. That fight's Share switch is off,
      // so only the creator is told which it was (`hidden-run-pointer.test.ts`).
      expect(seen.asCreator.encounterRunId).toBe(seen.run.id);
      expect(seen.roll.encounterRunId).toBeNull();
    }),
  );

  it.effect("refuses a player's table roll when the night is not shared", () =>
    Effect.gen(function* () {
      const refused = yield* Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const sessions = yield* Sessions;
        const rolls = yield* Rolls;
        const dm = yield* anAccount("Hob");
        const campaign = yield* aCampaignBy(dm, { name: "The Private Road", visibility: "shared" });
        const player = yield* aPlayerAt(campaign.id, "Mara");
        const { character } = yield* aCharacterAt(campaign.id, player, { name: "Mara" });
        const session = yield* as(
          dm,
          sessions.create(campaign.id, { number: 1, visibility: "dm" }),
        );
        yield* as(dm, campaigns.update(campaign.id, { currentSessionId: session.id }));
        return yield* as(player, Effect.flip(rolls.create(campaign.id, payload(character.id))));
      });

      expect(refused).toBeInstanceOf(Conflict);
    }),
  );

  it.effect("refuses no-open-night and somebody else's character", () =>
    Effect.gen(function* () {
      const seen = yield* Effect.gen(function* () {
        const rolls = yield* Rolls;
        const f = yield* fixture;
        const otherCharacter = yield* aCharacterAt(f.campaign.id, f.other, { name: "Wren" });
        const noNightCampaign = yield* aCampaignBy(f.dm, { name: "Quiet", visibility: "shared" });
        const noNightPlayer = yield* aPlayerAt(noNightCampaign.id, "Quiet player");
        const noNightCharacter = yield* aCharacterAt(noNightCampaign.id, noNightPlayer, {
          name: "Quiet",
        });
        const noNight = yield* as(
          noNightPlayer,
          Effect.flip(rolls.create(noNightCampaign.id, payload(noNightCharacter.character.id))),
        );
        const wrongOwner = yield* as(
          f.player,
          Effect.flip(rolls.create(f.campaign.id, payload(otherCharacter.character.id))),
        );
        return { noNight, wrongOwner };
      });

      expect(seen.noNight).toBeInstanceOf(Conflict);
      expect(seen.wrongOwner).toBeInstanceOf(NotFound);
    }),
  );

  describe("the DM's rolls", () => {
    /** The DM's d20 at the Goblin Boss, as the runner sends it. */
    const dmRoll = (extra: Partial<RollCreate> = {}): RollCreate => ({
      label: "Goblin Boss · Scimitar",
      notation: "1d20+4",
      dice: [15],
      kept: [15],
      modifier: 4,
      total: 19,
      mode: "normal",
      ...extra,
    });

    /**
     * A fight on the shared night: the party's Brannoc and a hidden Marsh Hag,
     * and, when asked, the other player's Wren in a shared seat, seated before
     * the fight starts so the run seeds her row.
     */
    const aFightWith = (options: { readonly ally: boolean }) =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const ally = options.ally
          ? yield* aCharacterAt(
              f.campaign.id,
              f.other,
              { name: "Wren" },
              { seatVisibility: "shared" },
            )
          : null;
        const encounters = yield* Encounters;
        const combatants = yield* Combatants;
        const dm = yield* asDm(f.dm, f.campaign.id);
        const encounter = yield* as(f.dm, encounters.create(f.campaign.id, { name: "Reeds" }));
        const run = yield* aFightUnderWay(dm, f.sessionId, { encounterId: encounter.id });
        yield* (yield* EncounterRuns).update(dm, f.sessionId, run.id, { visibility: "shared" });
        const brannoc = yield* combatants.create(dm, f.sessionId, run.id, {
          displayName: "Brannoc",
          kind: "pc",
          ac: 17,
          visibility: "shared",
        });
        const hag = yield* combatants.create(dm, f.sessionId, run.id, {
          displayName: "Marsh Hag",
          ac: 15,
          visibility: "dm",
        });
        return { ...f, dmProof: dm, run, brannoc, hag, ally };
      });
    const aFight = aFightWith({ ally: false });

    it.effect(
      "keeps a roll with no character to the creator on a shared night, in the list, by id and in ticks",
      () =>
        Effect.gen(function* () {
          const f = yield* fixture;
          const rolls = yield* Rolls;
          const table = yield* PlayerTable;
          const events = yield* SessionEvents;
          const dm = yield* asDm(f.dm, f.campaign.id);
          const before = yield* table.ticks(f.player, f.campaign.id, f.sessionId, 0, 50);
          const roll = yield* as(f.dm, rolls.create(f.campaign.id, dmRoll()));

          // The night is shared; the roll is not.
          expect(roll.visibility).toBe("dm");
          expect(roll.kind).toBe("plain");
          const creatorList = yield* as(f.dm, rolls.list(f.campaign.id, f.sessionId, {}));
          expect(creatorList.map((row) => row.id)).toEqual([roll.id]);
          expect((yield* as(f.dm, rolls.findById(f.campaign.id, f.sessionId, roll.id))).id).toBe(
            roll.id,
          );

          for (const player of [f.player, f.other]) {
            expect(yield* as(player, rolls.list(f.campaign.id, f.sessionId, {}))).toEqual([]);
            const byId = yield* as(
              player,
              Effect.flip(rolls.findById(f.campaign.id, f.sessionId, roll.id)),
            );
            expect(byId).toBeInstanceOf(NotFound);
          }

          // The creator's log has the line; a player's ticks do not move for it.
          const log = yield* events.list(dm, f.sessionId, { since: 0, limit: 50 });
          const line = log.find((event) => event.kind === "roll-made");
          expect(line?.visibility).toBe("dm");
          const after = yield* table.ticks(f.player, f.campaign.id, f.sessionId, 0, 50);
          expect(after).toEqual(before);
          expect(after).not.toContain(line?.seq);
        }),
    );

    it.effect("keeps a roll asked as dm to the creator, and refuses a player who asks", () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const rolls = yield* Rolls;
        const refused = yield* as(
          f.player,
          Effect.flip(
            rolls.create(f.campaign.id, { ...payload(f.character.id), visibility: "dm" }),
          ),
        );
        expect(refused).toBeInstanceOf(NotFound);
        // Nothing was written by the refusal.
        expect(yield* as(f.dm, rolls.list(f.campaign.id, f.sessionId, {}))).toEqual([]);

        const asked = yield* as(f.dm, rolls.create(f.campaign.id, dmRoll({ visibility: "dm" })));
        expect(asked.visibility).toBe("dm");
      }),
    );

    it.effect("dedupes a DM roll by its request", () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const rolls = yield* Rolls;
        const events = yield* SessionEvents;
        const dm = yield* asDm(f.dm, f.campaign.id);
        const first = yield* as(f.dm, rolls.create(f.campaign.id, dmRoll({ requestId: "die-1" })));
        const again = yield* as(f.dm, rolls.create(f.campaign.id, dmRoll({ requestId: "die-1" })));
        expect(again.id).toBe(first.id);
        expect(yield* as(f.dm, rolls.list(f.campaign.id, f.sessionId, {}))).toHaveLength(1);
        const log = yield* events.list(dm, f.sessionId, { since: 0, limit: 50 });
        expect(log.filter((event) => event.kind === "roll-made")).toHaveLength(1);
      }),
    );

    it.effect("logs an attack with who, at whom, the target's AC and the outcome", () =>
      Effect.gen(function* () {
        const f = yield* aFight;
        const rolls = yield* Rolls;
        const attack = yield* as(
          f.dm,
          rolls.create(
            f.campaign.id,
            dmRoll({
              kind: "attack",
              combatantId: f.hag.id,
              targetCombatantId: f.brannoc.id,
              targetAc: 17,
              outcome: "hit",
            }),
          ),
        );
        const read = yield* as(f.dm, rolls.findById(f.campaign.id, f.sessionId, attack.id));
        expect(read).toMatchObject({
          kind: "attack",
          combatantId: f.hag.id,
          targetCombatantId: f.brannoc.id,
          targetAc: 17,
          outcome: "hit",
          visibility: "dm",
          encounterRunId: f.run.id,
        });
        expect(yield* as(f.player, rolls.list(f.campaign.id, f.sessionId, {}))).toEqual([]);
      }),
    );

    it.effect("logs a concentration save in a fight as a roll, for the DM and for a player", () =>
      Effect.gen(function* () {
        const f = yield* aFight;
        const rolls = yield* Rolls;
        const dmSave = yield* as(
          f.dm,
          rolls.create(
            f.campaign.id,
            dmRoll({
              label: "Marsh Hag · Concentration",
              kind: "concentration",
              combatantId: f.hag.id,
            }),
          ),
        );
        expect(dmSave).toMatchObject({ kind: "concentration", combatantId: f.hag.id });
        const playerSave = yield* as(
          f.player,
          rolls.create(f.campaign.id, { ...payload(f.character.id), kind: "concentration" }),
        );
        expect(playerSave).toMatchObject({ kind: "concentration", visibility: "shared" });
        const seen = yield* as(f.other, rolls.list(f.campaign.id, f.sessionId, {}));
        expect(seen.map((row) => row.id)).toEqual([playerSave.id]);
      }),
    );

    it.effect(
      "refuses a combatant outside tonight's fight, with no fight, or named by a player",
      () =>
        Effect.gen(function* () {
          const f = yield* aFight;
          const rolls = yield* Rolls;
          const elsewhere = yield* aFight;

          const otherFight = yield* as(
            f.dm,
            Effect.flip(
              rolls.create(f.campaign.id, dmRoll({ targetCombatantId: elsewhere.brannoc.id })),
            ),
          );
          expect(otherFight).toBeInstanceOf(NotFound);

          const byPlayer = yield* as(
            f.player,
            Effect.flip(
              rolls.create(f.campaign.id, {
                ...payload(f.character.id),
                kind: "attack",
                targetCombatantId: f.brannoc.id,
              }),
            ),
          );
          expect(byPlayer).toBeInstanceOf(NotFound);

          const quiet = yield* fixture;
          const noFight = yield* as(
            quiet.dm,
            Effect.flip(rolls.create(quiet.campaign.id, dmRoll({ combatantId: f.hag.id }))),
          );
          expect(noFight).toBeInstanceOf(NotFound);
          expect(yield* as(f.dm, rolls.list(f.campaign.id, f.sessionId, {}))).toEqual([]);
        }),
    );

    it.effect(
      "names a hidden combatant on a shared roll to the creator alone, and clears it when removed",
      () =>
        Effect.gen(function* () {
          const f = yield* aFight;
          const rolls = yield* Rolls;
          const combatants = yield* Combatants;
          // The creator's own seat, so their roll is shared on a shared night.
          const own = yield* aCharacterAt(f.campaign.id, f.dm, { name: "Fen's ranger" });
          const shot = yield* as(
            f.dm,
            rolls.create(f.campaign.id, {
              ...payload(own.character.id),
              kind: "attack",
              combatantId: f.brannoc.id,
              targetCombatantId: f.hag.id,
              outcome: "miss",
            }),
          );
          expect(shot.visibility).toBe("shared");
          // The shared Brannoc is named; the hidden hag is not.
          const asPlayer = yield* as(f.player, rolls.findById(f.campaign.id, f.sessionId, shot.id));
          expect(asPlayer).toMatchObject({
            outcome: "miss",
            combatantId: f.brannoc.id,
            targetCombatantId: null,
          });
          const asCreator = yield* as(f.dm, rolls.findById(f.campaign.id, f.sessionId, shot.id));
          expect(asCreator.targetCombatantId).toBe(f.hag.id);

          yield* combatants.remove(f.dmProof, f.sessionId, f.run.id, f.hag.id);
          const after = yield* as(f.dm, rolls.findById(f.campaign.id, f.sessionId, shot.id));
          expect(after).toMatchObject({ targetCombatantId: null, outcome: "miss" });
        }),
    );

    it.effect(
      "shows a player a PC target's AC on a shared attack, never a monster's, while the creator sees both",
      () =>
        Effect.gen(function* () {
          const f = yield* aFight;
          const rolls = yield* Rolls;
          const combatants = yield* Combatants;
          const table = yield* PlayerTable;
          const goblin = yield* combatants.create(f.dmProof, f.sessionId, f.run.id, {
            displayName: "Goblin",
            ac: 13,
            visibility: "shared",
          });
          const own = yield* aCharacterAt(f.campaign.id, f.dm, { name: "Fen's ranger" });
          const before = yield* table.ticks(f.player, f.campaign.id, f.sessionId, 0, 50);
          const atGoblin = yield* as(
            f.dm,
            rolls.create(f.campaign.id, {
              ...payload(own.character.id),
              kind: "attack",
              targetCombatantId: goblin.id,
              targetAc: 13,
              outcome: "hit",
            }),
          );
          const atBrannoc = yield* as(
            f.dm,
            rolls.create(f.campaign.id, {
              ...payload(own.character.id),
              kind: "attack",
              targetCombatantId: f.brannoc.id,
              targetAc: 17,
              outcome: "miss",
            }),
          );
          expect(atGoblin.visibility).toBe("shared");

          const listed = yield* as(f.player, rolls.list(f.campaign.id, f.sessionId, {}));
          const byId = yield* as(f.player, rolls.findById(f.campaign.id, f.sessionId, atGoblin.id));
          for (const read of [listed.find((row) => row.id === atGoblin.id), byId]) {
            expect(read).toMatchObject({
              targetCombatantId: goblin.id,
              targetAc: null,
              outcome: "hit",
            });
          }
          expect(listed.find((row) => row.id === atBrannoc.id)).toMatchObject({
            targetCombatantId: f.brannoc.id,
            targetAc: 17,
          });
          // The doorbell carries cursors and nothing of the roll.
          const ticks = yield* table.ticks(f.player, f.campaign.id, f.sessionId, 0, 50);
          expect(ticks.length).toBeGreaterThan(before.length);
          expect(ticks.every((tick) => typeof tick === "number")).toBe(true);

          const asCreator = yield* as(f.dm, rolls.list(f.campaign.id, f.sessionId, {}));
          expect(asCreator.find((row) => row.id === atGoblin.id)?.targetAc).toBe(13);
          expect(
            (yield* as(f.dm, rolls.findById(f.campaign.id, f.sessionId, atGoblin.id))).targetAc,
          ).toBe(13);
        }),
    );

    it.effect("names a shared creature under fog to the creator alone, and an ally to all", () =>
      Effect.gen(function* () {
        const f = yield* aFightWith({ ally: true });
        const rolls = yield* Rolls;
        const combatants = yield* Combatants;
        const maps = yield* BattleMaps;
        const goblin = yield* combatants.create(f.dmProof, f.sessionId, f.run.id, {
          displayName: "Goblin",
          ac: 13,
          visibility: "shared",
        });
        const square = { column: 3, row: 4 };
        yield* combatants.move(f.dmProof, f.sessionId, f.run.id, goblin.id, { position: square });
        const own = yield* aCharacterAt(f.campaign.id, f.dm, { name: "Fen's ranger" });
        const shot = yield* as(
          f.dm,
          rolls.create(f.campaign.id, {
            ...payload(own.character.id),
            kind: "attack",
            combatantId: goblin.id,
            targetCombatantId: goblin.id,
          }),
        );
        const clear = yield* as(f.player, rolls.findById(f.campaign.id, f.sessionId, shot.id));
        expect(clear).toMatchObject({ combatantId: goblin.id, targetCombatantId: goblin.id });

        // Wren, in the other player's shared seat, is an ally to this player.
        const wren = (yield* combatants.list(f.dmProof, f.sessionId, f.run.id)).find(
          (row) => row.characterId === f.ally!.character.id,
        )!;
        yield* combatants.update(f.dmProof, f.sessionId, f.run.id, wren.id, {
          visibility: "shared",
        });
        const wrenSquare = { column: 5, row: 6 };
        yield* combatants.move(f.dmProof, f.sessionId, f.run.id, wren.id, {
          position: wrenSquare,
        });
        const atWren = yield* as(
          f.dm,
          rolls.create(f.campaign.id, {
            ...payload(own.character.id),
            kind: "attack",
            targetCombatantId: wren.id,
          }),
        );

        yield* maps.updateFog(f.dmProof, f.sessionId, f.run.id, { hide: [square, wrenSquare] });
        const listed = yield* as(f.player, rolls.list(f.campaign.id, f.sessionId, {}));
        const byId = yield* as(f.player, rolls.findById(f.campaign.id, f.sessionId, shot.id));
        for (const read of [listed.find((row) => row.id === shot.id), byId]) {
          expect(read).toMatchObject({ combatantId: null, targetCombatantId: null });
        }
        // Fog hides a creature; the party knows where its ally is in the order.
        expect(listed.find((row) => row.id === atWren.id)).toMatchObject({
          targetCombatantId: wren.id,
        });
        const asCreator = yield* as(f.dm, rolls.findById(f.campaign.id, f.sessionId, shot.id));
        expect(asCreator).toMatchObject({ combatantId: goblin.id, targetCombatantId: goblin.id });
      }),
    );
  });
});
