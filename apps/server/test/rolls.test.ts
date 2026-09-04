import { Conflict, CurrentActor, NotFound, type Actor, type CharacterId } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import { Rolls } from "../src/repo/Rolls.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aCampaignBy, aCharacterAt, aPlayerAt, anAccount, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

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
  LiveEvents.layer,
  Rolls.layer.pipe(Layer.provide(LiveEvents.layer)),
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("rolls")));

const runtime = ManagedRuntime.make(services);

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

describe("rolls", () => {
  beforeAll(async () => void (await runtime.runPromise(Effect.void)), 60_000);
  afterAll(async () => void (await runtime.dispose()), 60_000);

  it("persists a player's browser roll, emits a doorbell marker, and is idempotent by request", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
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
      }),
    );

    expect(seen.repeat.id).toBe(seen.first.id);
    expect(seen.listed.map((roll) => roll.id)).toEqual([seen.first.id]);
    expect(seen.first.encounterRunId).toBeNull();
    expect(seen.first.accountName).toBe("Brannoc");
    expect(seen.first.characterName).toBe("Brannoc");
    expect(seen.first.visibility).toBe("shared");
    expect(seen.ownLog.map((roll) => roll.id)).toEqual([seen.first.id]);
    expect(seen.log.map((event) => event.kind)).toEqual(["roll-made"]);
  });

  it("uses the active run at append time, without trusting a payload", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const f = yield* fixture;
        const encounters = yield* Encounters;
        const runs = yield* EncounterRuns;
        const rolls = yield* Rolls;
        const dm = yield* asDm(f.dm, f.campaign.id);
        const encounter = yield* as(f.dm, encounters.create(f.campaign.id, { name: "Ambush" }));
        const run = yield* runs.start(dm, f.sessionId, { encounterId: encounter.id });
        const roll = yield* as(f.player, rolls.create(f.campaign.id, payload(f.character.id)));
        return { run, roll };
      }),
    );

    expect(seen.roll.encounterRunId).toBe(seen.run.id);
  });

  it("refuses a player's table roll when the night is not shared", async () => {
    const refused = await runtime.runPromise(
      Effect.gen(function* () {
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
      }),
    );

    expect(refused).toBeInstanceOf(Conflict);
  });

  it("refuses no-open-night and somebody else's character", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
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
      }),
    );

    expect(seen.noNight).toBeInstanceOf(Conflict);
    expect(seen.wrongOwner).toBeInstanceOf(NotFound);
  });
});
