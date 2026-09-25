import { type Actor, type CampaignId, CurrentActor, emptyStatBlock, NotFound } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Creatures } from "../src/repo/Creatures.js";
import { type CampaignCreatorActor, CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
import { Sessions } from "../src/repo/Sessions.js";
import {
  aCharacterAt,
  aGroupMemberAt,
  aPlayerAt,
  anAccount,
  asDm,
  createCampaign,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { items } from "./support/paging.js";

/**
 * What an encounter read computes rather than stores: each roster line's
 * numbers, the difficulty against the seated party, and the last time it came
 * off the table — each over what *the reader* can see. The numbers are the
 * creator's alone: a player's `PlayerEncounter` is names and counts.
 */
const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Groups.layer,
    Characters.layer,
    Creatures.layer,
    CampaignCreatorActors.layer,
    EncounterCreatures.layer,
    EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
    Encounters.layer,
    Invites.layer,
    Party.layer.pipe(Layer.provide(LiveEvents.layer)),
    Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_encounter_computed"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One shared table. The party is four seats: two level-5s (one the player's
 * own, one the DM shared), a level-3 and a character with no level, those two
 * kept `dm`. The ambush holds four archers (shared) and a hag (the DM's
 * secret), and was played twice: once on a shared night in a shared fight, and
 * once in a fight the DM kept hidden.
 */
const makeFixture = Effect.gen(function* () {
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const roster = yield* EncounterCreatures;
  const sessions = yield* Sessions;
  const runs = yield* EncounterRuns;
  const campaigns = yield* Campaigns;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);
  const campaign = yield* as(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  const player = yield* aPlayerAt(campaign.id, "Pim");

  yield* aCharacterAt(campaign.id, player, { name: "Tamsin", level: 5 });
  yield* aCharacterAt(campaign.id, dm, { name: "Brannoc", level: 5 }, { seatVisibility: "shared" });
  yield* aCharacterAt(campaign.id, dm, { name: "Wren", level: 3 });
  yield* aCharacterAt(campaign.id, dm, { name: "Odo" });

  // No XP in its stat block: the XP table's 50 for CR 1/4 answers.
  const archer = yield* as(
    creatures.libraryCreate({ name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 }),
  );
  // The stat block says, and wins over the table's 1,800 for CR 5.
  const hag = yield* as(
    creatures.libraryCreate({
      name: "Marsh Hag",
      type: "Fey",
      cr: "5",
      ac: 17,
      hp: 82,
      statBlock: { ...emptyStatBlock, xp: 2000 },
    }),
  );
  // A rating the table does not know, and no XP in the stat block.
  const bogThing = yield* as(
    creatures.libraryCreate({ name: "Bog Thing", type: "Plant", cr: "—", ac: 12, hp: 30 }),
  );

  const ambush = yield* as(
    encounters.create(campaign.id, {
      name: "Ambush in the reeds",
      visibility: "shared",
      ready: true,
    }),
  );
  yield* as(
    roster.create(campaign.id, ambush.id, {
      creatureId: archer.id,
      count: 4,
      visibility: "shared",
    }),
  );
  yield* as(roster.create(campaign.id, ambush.id, { creatureId: hag.id, count: 1 }));

  const bog = yield* as(encounters.create(campaign.id, { name: "Something in the bog" }));
  yield* as(roster.create(campaign.id, bog.id, { creatureId: bogThing.id, count: 1 }));

  const empty = yield* as(encounters.create(campaign.id, { name: "The ferryman's price" }));

  const proof = yield* as(asDm(dm, campaign.id));
  const night11 = yield* as(sessions.create(campaign.id, { number: 11, visibility: "shared" }));
  const played = yield* runs.start(proof, night11.id, {
    encounterId: ambush.id,
    includeParty: false,
    visibility: "shared",
  });
  yield* runs.end(proof, night11.id, played.id);
  const night12 = yield* as(sessions.create(campaign.id, { number: 12, visibility: "shared" }));
  const hidden = yield* runs.start(proof, night12.id, {
    encounterId: ambush.id,
    includeParty: false,
  });
  yield* runs.end(proof, night12.id, hidden.id);
  // Still on the table: not "played" yet, for anybody.
  const night13 = yield* as(sessions.create(campaign.id, { number: 13, visibility: "shared" }));
  yield* runs.start(proof, night13.id, {
    encounterId: ambush.id,
    includeParty: false,
    visibility: "shared",
  });

  // A table with nobody seated.
  const emptyTable = yield* as(createCampaign({ name: "Nobody yet" }));
  const lonely = yield* as(encounters.create(emptyTable.id, { name: "Toll bridge" }));
  yield* as(roster.create(emptyTable.id, lonely.id, { creatureId: archer.id, count: 2 }));

  // A member of this table's Shared World who plays at another table in it,
  // not this one.
  const worldMember = yield* aGroupMemberAt(campaign.id, "Rook");
  yield* withActor(worldMember)(
    campaigns.create(campaign.contextId, { name: "Rook's table", visibility: "shared" }),
  );

  return {
    dm,
    player,
    worldMember,
    stranger: yield* anAccount("Nobody"),
    campaign,
    ambush,
    bog,
    empty,
    night11,
    night12,
    played,
    hidden,
    emptyTable,
    lonely,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;
let encounters: (typeof Encounters)["Service"];
let roster: (typeof EncounterCreatures)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  encounters = await runtime.runPromise(Encounters);
  roster = await runtime.runPromise(EncounterCreatures);
}, 60_000);

const read = <A, E>(actor: Actor, effect: Effect.Effect<A, E, CurrentActor>) =>
  runtime.runPromise(withActor(actor)(effect));

/** A creator-only read, through the proof the handlers mint. */
const asCreator = <A, E>(
  campaignId: CampaignId,
  effect: (creator: CampaignCreatorActor) => Effect.Effect<A, E>,
) => runtime.runPromise(Effect.flatMap(asDm(fixture.dm, campaignId), effect));

const refused = <A, E>(actor: Actor, effect: Effect.Effect<A, E, CurrentActor>) =>
  runtime.runPromise(Effect.flip(withActor(actor)(effect)));

describe("the roster's numbers", () => {
  it("carries each creature's CR, AC, HP and XP, from the stat block or the XP table", async () => {
    const lines = await asCreator(fixture.campaign.id, (dm) => roster.list(dm, fixture.ambush.id));
    expect(
      lines.map(({ name, count, cr, ac, hp, xp }) => ({ name, count, cr, ac, hp, xp })),
    ).toEqual([
      { name: "Goblin Archer", count: 4, cr: "1/4", ac: 15, hp: 7, xp: 50 },
      { name: "Marsh Hag", count: 1, cr: "5", ac: 17, hp: 82, xp: 2000 },
    ]);
  }, 60_000);

  it("leaves XP null for a rating the table does not know, rather than guessing", async () => {
    const lines = await asCreator(fixture.campaign.id, (dm) => roster.list(dm, fixture.bog.id));
    expect(lines[0]).toMatchObject({ name: "Bog Thing", cr: "—", xp: null });
  }, 60_000);
});

describe("computed difficulty", () => {
  it("rates the whole roster against the whole visible party for the creator", async () => {
    const ambush = await asCreator(fixture.campaign.id, (dm) =>
      encounters.findById(dm, fixture.ambush.id),
    );
    // 4 × 50 + 2,000 = 2,200 XP; five creatures ×2 against a party of three.
    // Thresholds: 2 × level 5 + level 3; Odo has no level and is counted out.
    expect(ambush.difficulty).toEqual({
      _tag: "rated",
      band: "Deadly",
      xp: 2200,
      adjustedXp: 4400,
      multiplier: 2,
      party: { size: 3, minLevel: 3, maxLevel: 5, unlevelled: 1 },
      thresholds: { easy: 575, medium: 1150, hard: 1725, deadly: 2600 },
    });
  }, 60_000);

  it("says why it cannot rate: no creatures, a creature with no XP, nobody seated", async () => {
    const list = await asCreator(fixture.campaign.id, (dm) => items(encounters.list(dm, {})));
    const byName = new Map(list.map((encounter) => [encounter.name, encounter]));
    expect(byName.get("The ferryman's price")?.difficulty).toEqual({
      _tag: "unrated",
      reason: "no-creatures",
    });
    expect(byName.get("Something in the bog")?.difficulty).toEqual({
      _tag: "unrated",
      reason: "missing-xp",
    });
    const lonely = await asCreator(fixture.emptyTable.id, (dm) =>
      encounters.findById(dm, fixture.lonely.id),
    );
    expect(lonely.difficulty).toEqual({ _tag: "unrated", reason: "no-party" });
  }, 60_000);

  it("moves with the roster, on the write's own answer", async () => {
    const as = withActor(fixture.dm);
    const archer = (
      await asCreator(fixture.emptyTable.id, (dm) => roster.list(dm, fixture.lonely.id))
    )[0]!;
    await runtime.runPromise(
      as(roster.update(fixture.emptyTable.id, fixture.lonely.id, archer.id, { count: 3 })),
    );
    const renamed = await runtime.runPromise(
      as(
        encounters.update(fixture.emptyTable.id, fixture.lonely.id, { name: "Toll bridge, again" }),
      ),
    );
    expect(renamed.creatureCount).toBe(3);
    // Still nobody seated: the update reads back through the same computation.
    expect(renamed.difficulty).toEqual({ _tag: "unrated", reason: "no-party" });
  }, 60_000);
});

describe("last played", () => {
  it("is the latest ended run the creator can see, with the night and the run to link to", async () => {
    const ambush = await asCreator(fixture.campaign.id, (dm) =>
      encounters.findById(dm, fixture.ambush.id),
    );
    expect(ambush.lastPlayed).toMatchObject({
      runId: fixture.hidden.id,
      sessionId: fixture.night12.id,
      sessionNumber: 12,
      endedReason: "resolved",
    });
  }, 60_000);

  it("skips a fight the DM kept hidden when a player reads it", async () => {
    const ambush = await read(
      fixture.player,
      encounters.findAsPlayer(fixture.campaign.id, fixture.ambush.id),
    );
    expect(ambush.lastPlayed).toMatchObject({
      runId: fixture.played.id,
      sessionId: fixture.night11.id,
      sessionNumber: 11,
    });
  }, 60_000);

  it("is null for an encounter never off the table", async () => {
    const empty = await asCreator(fixture.campaign.id, (dm) =>
      encounters.findById(dm, fixture.empty.id),
    );
    expect(empty.lastPlayed).toBeNull();
  }, 60_000);
});

describe("a player's encounter", () => {
  it("is the shared roster lines as names and counts, and no number of any creature", async () => {
    const ambush = await read(
      fixture.player,
      encounters.findAsPlayer(fixture.campaign.id, fixture.ambush.id),
    );
    // The hag is the DM's line: not named, not counted.
    expect(ambush.creatures).toEqual([{ name: "Goblin Archer", count: 4 }]);
    // The whole answer, by its keys: no difficulty, no count to disagree with
    // the lines, nothing of the DM's.
    expect(Object.keys(ambush).sort()).toEqual(
      ["campaignId", "creatures", "id", "kind", "lastPlayed", "name", "tags"].sort(),
    );
    expect(ambush.creatures.flatMap((line) => Object.keys(line))).toEqual(["name", "count"]);
    expect(JSON.stringify(ambush)).not.toContain("Marsh Hag");
  }, 60_000);

  it("lists only the shared encounters, the same shape", async () => {
    const listed = await read(fixture.player, encounters.listAsPlayer(fixture.campaign.id));
    expect(listed.map((encounter) => encounter.name)).toEqual(["Ambush in the reeds"]);
    expect(listed[0]!.creatures).toEqual([{ name: "Goblin Archer", count: 4 }]);
  }, 60_000);

  it("is the same narrow shape for the creator, over every row they hold", async () => {
    const ambush = await read(
      fixture.dm,
      encounters.findAsPlayer(fixture.campaign.id, fixture.ambush.id),
    );
    expect(ambush.creatures).toEqual([
      { name: "Goblin Archer", count: 4 },
      { name: "Marsh Hag", count: 1 },
    ]);
    expect(Object.keys(ambush)).not.toContain("difficulty");
  }, 60_000);
});

describe("refusals", () => {
  it("gives a player, a Shared World member and a stranger no creator proof", async () => {
    // The wide reads — `Encounter` with its difficulty, the roster with each
    // creature's numbers — take the proof, so this is the whole refusal.
    for (const who of [fixture.player, fixture.worldMember, fixture.stranger]) {
      expect(await runtime.runPromise(Effect.flip(asDm(who, fixture.campaign.id)))).toBeInstanceOf(
        NotFound,
      );
    }
  }, 60_000);

  it("is NotFound on the player read for a stranger, a Shared World member, and a dm encounter", async () => {
    for (const who of [fixture.stranger, fixture.worldMember]) {
      expect(
        await refused(who, encounters.findAsPlayer(fixture.campaign.id, fixture.ambush.id)),
      ).toBeInstanceOf(NotFound);
      expect(await refused(who, encounters.listAsPlayer(fixture.campaign.id))).toBeInstanceOf(
        NotFound,
      );
    }
    expect(
      await refused(fixture.player, encounters.findAsPlayer(fixture.campaign.id, fixture.bog.id)),
    ).toBeInstanceOf(NotFound);
  }, 60_000);
});
