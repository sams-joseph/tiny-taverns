import { describe, expect } from "@effect/vitest";
import { type Actor, CurrentActor, NotFound, type Session } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
import { Recap } from "../src/repo/Recap.js";
import { Rolls } from "../src/repo/Rolls.js";
import { Sessions } from "../src/repo/Sessions.js";
import {
  aCampaignBy,
  aCharacterAt,
  aPlayerAt,
  accountWide,
  anAccount,
  asDm,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

/**
 * A fight whose Share switch is off is not on the table, as far as a player
 * can tell. Every run read already answers them `NotFound`; these are the
 * pointers *into* the run that ride on other rows — `Session.activeEncounterRunId`
 * and `Roll.encounterRunId` — which used to carry the hidden run's id to
 * anybody who could read the session or the roll.
 */

const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  Groups.layer,
  Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
  CampaignCreatorActors.layer,
  Encounters.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Invites.layer,
  Recap.layer,
  Rolls.layer.pipe(Layer.provide(LiveEvents.layer)),
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_hidden_run_pointer")));
const as = <A, E, R>(actor: Actor, effect: Effect.Effect<A, E, R | CurrentActor>) =>
  Effect.provideService(effect, CurrentActor, actor);

const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const sessions = yield* Sessions;
  const encounters = yield* Encounters;
  const dm = yield* anAccount("Jo");
  const campaign = yield* aCampaignBy(dm, { name: "The Salt Road", visibility: "shared" });
  const player = yield* aPlayerAt(campaign.id, "Pim");
  const other = yield* aPlayerAt(campaign.id, "Wren");
  const { character } = yield* aCharacterAt(
    campaign.id,
    player,
    { name: "Brannoc", hpMax: 52 },
    { seatVisibility: "shared" },
  );
  // Somebody at another table of the same Shared World: a member of the
  // world, and of nothing in this campaign.
  const elsewhere = yield* as(dm, campaigns.create(campaign.contextId, { name: "Elsewhere" }));
  const neighbour = accountWide(yield* aPlayerAt(elsewhere.id, "Fen"));

  const encounter = yield* as(
    dm,
    encounters.create(campaign.id, { name: "Ambush in the reeds", visibility: "shared" }),
  );
  const session = yield* as(
    dm,
    sessions.create(campaign.id, { number: 1, title: "The ford", visibility: "shared" }),
  );
  yield* as(dm, campaigns.update(campaign.id, { currentSessionId: session.id }));
  const dmOf = yield* asDm(dm, campaign.id);
  return { dm, dmOf, player, other, neighbour, character, campaign, encounter, session };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hidden-run-pointer.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

const pointers = (actor: Actor) =>
  Effect.gen(function* () {
    const f = yield* Fixture;
    const sessions = yield* Sessions;
    const recap = yield* Recap;
    const listed = yield* as(actor, sessions.list(f.campaign.id));
    const found = yield* as(actor, sessions.findById(f.campaign.id, f.session.id));
    const night = yield* as(actor, recap.readAsPlayer(f.campaign.id, f.session.id));
    const pointer = (session: Session) => session.activeEncounterRunId;
    return {
      list: listed.map(pointer),
      findById: pointer(found),
      recap: pointer(night.session),
    };
  });

describeLayer("hidden-run-pointer", shared, (it) => {
  describe("a hidden fight's id", () => {
    it.effect("is not on a player's session read while the fight is hidden", () =>
      Effect.gen(function* () {
        const f = yield* Fixture;
        const runs = yield* EncounterRuns;
        const sessions = yield* Sessions;
        // No `visibility`: a fight starts `dm`, which is the Start dialog's default.
        const hidden = yield* runs.start(f.dmOf, f.session.id, { encounterId: f.encounter.id });
        expect(hidden.visibility).toBe("dm");

        // The creator still has the pointer: the runner is driven from it.
        expect(yield* pointers(f.dm)).toEqual({
          list: [hidden.id],
          findById: hidden.id,
          recap: hidden.id,
        });
        // A player reads the session as though nothing were on the table.
        expect(yield* pointers(f.player)).toEqual({ list: [null], findById: null, recap: null });

        // A member of the world from another table does not reach the session.
        const refused = yield* as(f.neighbour, sessions.findById(f.campaign.id, f.session.id)).pipe(
          Effect.flip,
        );
        expect(refused).toBeInstanceOf(NotFound);

        // Sharing the fight is what puts it on the player's table, from the same read.
        yield* runs.update(f.dmOf, f.session.id, hidden.id, { visibility: "shared" });
        expect(yield* pointers(f.player)).toEqual({
          list: [hidden.id],
          findById: hidden.id,
          recap: hidden.id,
        });
        yield* runs.update(f.dmOf, f.session.id, hidden.id, { visibility: "dm" });
      }),
    );

    it.effect("is not on a roll made while the fight is hidden", () =>
      Effect.gen(function* () {
        const f = yield* Fixture;
        const rolls = yield* Rolls;
        const sessions = yield* Sessions;
        const roll = yield* as(
          f.player,
          rolls.create(f.campaign.id, {
            characterId: f.character.id,
            label: "Longsword",
            notation: "1d20+5",
            dice: [17],
            kept: [17],
            modifier: 5,
            total: 22,
            mode: "normal",
            critical: null,
          }),
        );
        // The roll is shared (the night is), so the other player reads it — and
        // neither player learns which fight it was rolled in.
        expect(roll.visibility).toBe("shared");
        expect(roll.encounterRunId).toBeNull();
        const seenBy = (actor: Actor) =>
          as(actor, rolls.findById(f.campaign.id, f.session.id, roll.id));
        expect((yield* seenBy(f.other)).encounterRunId).toBeNull();
        expect((yield* seenBy(f.player)).encounterRunId).toBeNull();
        const listed = yield* as(f.other, rolls.list(f.campaign.id, f.session.id, { limit: 10 }));
        expect(listed.map((row) => row.encounterRunId)).toEqual([null]);

        // The creator still sees which fight it belongs to.
        const live = yield* as(f.dm, sessions.findById(f.campaign.id, f.session.id));
        expect((yield* seenBy(f.dm)).encounterRunId).toBe(live.activeEncounterRunId);
      }),
    );
  });
});
