import {
  type Actor,
  type CampaignId,
  type CharacterId,
  CurrentActor,
  NotFound,
  type PlayerLiveTable,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
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
import { PlayerTable } from "../src/repo/PlayerTable.js";
import { Sessions } from "../src/repo/Sessions.js";
import { anAccount, aPlayerAt, asDm, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The live banner's read: what is on this table right now, to a player.
 *
 * Two halves, and the second is the one this file exists for.
 *
 * **What it says** — the night, the round, whose turn it is, and which of your
 * own characters is in the fight. Those four are what the delivery draws on
 * `CharacterSheet.jsx` and `MyCharacters.jsx`, and they are all a player would
 * hear sitting at the table.
 *
 * **What it must not say** — and the assertions below are about *absence*, not
 * about a field nobody happened to read. A monster's exact hit points, its
 * armour class, anybody's hit-point band, the initiative numbers and the rest
 * of the order are each checked for by name across the whole serialised answer,
 * so a widening of `PlayerLiveTable` fails here rather than shipping. That is
 * the same discipline `recap.test.ts` applies to `PlayerSessionRecap`, and it
 * is the reason the projection is a distinct schema on a distinct endpoint
 * rather than a filter over a DM type.
 *
 * The third claim is the seam's rather than this feature's: every layer of
 * `repo/visibility.ts` still applies, so an unshared night, an unshared fight
 * and a hidden combatant each take exactly one thing away and leave the rest.
 */
const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
  Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
  Creatures.layer,
  DmActors.layer,
  EncounterCreatures.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Encounters.layer,
  Invites.layer,
  PlayerTable.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_player_table")));
const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

type Services = Layer.Success<typeof services>;

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One table, mid-fight, with two players at it and everything shared.
 *
 * Shared throughout on purpose: every refusal asserted below is then about a
 * *predicate* rather than about a campaign that happens to be empty, which is
 * the trap the credential-scope hole sat in for as long as no test minted a
 * scoped actor.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const characters = yield* Characters;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const roster = yield* EncounterCreatures;
  const runs = yield* EncounterRuns;
  const sessions = yield* Sessions;
  const combatants = yield* Combatants;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road", visibility: "shared" }));
  const brannoc = yield* as(
    characters.create(campaign.id, {
      name: "Brannoc",
      playerName: "Ilse",
      species: "Half-orc",
      className: "Paladin",
      ac: 18,
      hpMax: 52,
      visibility: "shared",
    }),
  );
  // A second player's character, so "your own seats" is a narrowing rather than
  // "every character in the fight" wearing the right label.
  const nessa = yield* as(
    characters.create(campaign.id, {
      name: "Nessa",
      className: "Ranger",
      ac: 15,
      hpMax: 34,
      visibility: "shared",
    }),
  );
  const goblin = yield* as(
    creatures.create(campaign.id, {
      name: "Marsh Hag",
      size: "Medium",
      type: "Fey",
      cr: "2",
      // The two numbers the banner must never carry, both distinctive enough to
      // be greppable in a serialised answer.
      ac: 17,
      hp: 82,
    }),
  );
  const encounter = yield* as(
    encounters.create(campaign.id, {
      name: "Ambush in the reeds",
      difficulty: "Medium",
      visibility: "shared",
    }),
  );
  yield* as(roster.create(campaign.id, encounter.id, { creatureId: goblin.id, count: 1 }));

  const session = yield* as(
    sessions.create(campaign.id, { number: 12, title: "The ford", visibility: "shared" }),
  );
  // The campaign points at the night — the whole of what "playing right now"
  // means, and the same pointer `session/start.ts` writes from the client.
  yield* as(campaigns.update(campaign.id, { currentSessionId: session.id }));

  const player = yield* aPlayerAt(campaign.id, "Pim");
  const other = yield* aPlayerAt(campaign.id, "Wren");
  yield* as(characters.assign(campaign.id, brannoc.id, { accountId: player.accountId }));
  yield* as(characters.assign(campaign.id, nessa.id, { accountId: other.accountId }));

  const dmOf = yield* as(asDm(dm, campaign.id));
  const run = yield* as(
    runs.start(dmOf, session.id, { encounterId: encounter.id, visibility: "shared" }),
  );
  const inTheFight = yield* as(combatants.list(dmOf, session.id, run.id));
  for (const row of inTheFight) {
    yield* as(combatants.update(dmOf, session.id, run.id, row.id, { visibility: "shared" }));
  }
  // The hag takes some of it, so there is an exact remaining total in the row
  // this endpoint reads through and never selects.
  const monster = inTheFight.find((row) => row.kind === "npc")!;
  const hag = yield* as(combatants.damage(dmOf, session.id, run.id, monster.id, { amount: 41 }));

  // Somebody's turn: the marker is a pointer, and `nextTurn` is what sets it.
  const rolled = yield* as(runs.nextTurn(dmOf, session.id, run.id, {}));

  const elsewhere = yield* as(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );

  return {
    dm,
    asDm: dmOf,
    campaign,
    session,
    run,
    round: rolled.round,
    activeCombatantId: rolled.activeCombatantId,
    combatants: inTheFight,
    hag,
    brannoc,
    nessa,
    player,
    other,
    stranger: yield* anAccount("Bo"),
    elsewhere,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;
let table: (typeof PlayerTable)["Service"];
let sessions: (typeof Sessions)["Service"];
let runs: (typeof EncounterRuns)["Service"];
let combatants: (typeof Combatants)["Service"];
let campaigns: (typeof Campaigns)["Service"];
let invites: (typeof Invites)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  table = await runtime.runPromise(PlayerTable);
  sessions = await runtime.runPromise(Sessions);
  runs = await runtime.runPromise(EncounterRuns);
  combatants = await runtime.runPromise(Combatants);
  campaigns = await runtime.runPromise(Campaigns);
  invites = await runtime.runPromise(Invites);
}, 60_000);

const asActor =
  (actor: () => Actor) =>
  <A, E, R extends Services>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    runtime.runPromise(withActor(actor())(effect).pipe(Effect.orDie));

const as = asActor(() => fixture.dm);
const asPlayer = asActor(() => fixture.player);

/** The read, run as somebody, keeping the failure rather than dying on it. */
const readAs = (actor: Actor, campaignId?: CampaignId) =>
  runtime.runPromise(
    withActor(actor)(Effect.result(table.read(campaignId ?? fixture.campaign.id))),
  );

const seatFor = (answer: PlayerLiveTable | null, characterId: CharacterId) =>
  answer?.fight?.seats.find((seat) => seat.characterId === characterId);

/** Every numeric leaf of a decoded answer, however deeply nested. */
const numbersIn = (value: unknown): ReadonlyArray<number> => {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(numbersIn);
  }
  return [];
};

describe("the live table, to a player", () => {
  it("names the night, the round and whose turn it is", async () => {
    const answer = await asPlayer(table.read(fixture.campaign.id));

    expect(answer).not.toBeNull();
    expect(answer?.campaignId).toBe(fixture.campaign.id);
    expect(answer?.sessionId).toBe(fixture.session.id);
    expect(answer?.sessionNumber).toBe(12);
    expect(answer?.fight?.id).toBe(fixture.run.id);
    expect(answer?.fight?.round).toBe(fixture.round);
    expect(answer?.fight?.upNext?.combatantId).toBe(fixture.activeCombatantId);
    // The name the DM is reading out, and it is one of the rows in the fight
    // rather than a string this endpoint composed.
    expect(fixture.combatants.map((row) => row.displayName)).toContain(
      answer?.fight?.upNext?.displayName,
    );
  });

  it("gives a player a seat for their own character and none for anybody else's", async () => {
    const answer = await asPlayer(table.read(fixture.campaign.id));

    // Both characters are in the fight and both are `shared`; the narrowing is
    // ownership, and it is `ownRowReadable`'s rather than a filter here.
    expect(seatFor(answer, fixture.brannoc.id)).toBeDefined();
    expect(seatFor(answer, fixture.nessa.id)).toBeUndefined();

    const theirs = await runtime.runPromise(
      withActor(fixture.other)(table.read(fixture.campaign.id)),
    );
    expect(seatFor(theirs, fixture.nessa.id)).toBeDefined();
    expect(seatFor(theirs, fixture.brannoc.id)).toBeUndefined();
  });

  it("says the same narrow thing to the campaign's own DM", async () => {
    // No branch on who is asking: *what will my players see* is one request
    // rather than a second implementation.
    const mine = await asPlayer(table.read(fixture.campaign.id));
    const theirs = await as(table.read(fixture.campaign.id));

    expect(theirs?.sessionNumber).toBe(mine?.sessionNumber);
    expect(theirs?.fight?.round).toBe(mine?.fight?.round);
    expect(Object.keys(theirs?.fight ?? {}).sort()).toEqual(Object.keys(mine?.fight ?? {}).sort());
  });
});

describe("what it must not carry", () => {
  /**
   * Absence asserted by name, over the whole serialised answer.
   *
   * A field this projection may not have is one nobody has *written*, so the
   * check is structural rather than a spot read: `JSON.stringify` reaches every
   * nested object, and the key list below is the DM's half of a combatant. If a
   * future change adds `ac` back — anywhere, at any depth — this fails.
   */
  const forbidden = [
    "ac",
    "hp",
    "hpCurrent",
    "hpMax",
    "tempHp",
    "hpBand",
    "conditions",
    "initiative",
    "kind",
    "playerName",
    "subtitle",
    "encounterName",
    "visibility",
    "combatants",
    "order",
  ] as const;

  it("carries no hit points, no armour class and no band, at any depth", async () => {
    const answer = await asPlayer(table.read(fixture.campaign.id));
    const text = JSON.stringify(answer);

    for (const key of forbidden) {
      expect(text, `the live table carries ${key}`).not.toContain(`"${key}"`);
    }
  });

  it("carries exactly two numbers, and they are the night and the round", async () => {
    const answer = await asPlayer(table.read(fixture.campaign.id));

    // The strongest form of "no hit points": every numeric leaf in the answer,
    // whatever it is called and however deeply it is nested. A monster's
    // remaining total, its maximum and its armour class are all read *through*
    // by the predicate and none is selected, so there is nowhere for one of
    // them to be — and the hag really does have all three.
    expect(fixture.hag.hpCurrent).toBe(41);
    expect(fixture.hag.hpMax).toBe(82);
    expect(fixture.hag.ac).toBe(17);
    expect([...numbersIn(answer)].sort((a, b) => a - b)).toEqual([fixture.round, 12]);
  });

  it("has exactly the fields the banner needs and no others", async () => {
    const answer = await asPlayer(table.read(fixture.campaign.id));

    expect(Object.keys(answer ?? {}).sort()).toEqual([
      "campaignId",
      "fight",
      "sessionId",
      "sessionNumber",
    ]);
    expect(Object.keys(answer?.fight ?? {}).sort()).toEqual(["id", "round", "seats", "upNext"]);
    expect(Object.keys(answer?.fight?.upNext ?? {}).sort()).toEqual(["combatantId", "displayName"]);
    expect(Object.keys(seatFor(answer, fixture.brannoc.id) ?? {}).sort()).toEqual([
      "characterId",
      "combatantId",
    ]);
  });

  it("does not carry the rest of the initiative order", async () => {
    const answer = await asPlayer(table.read(fixture.campaign.id));

    // Whose turn it is, and your own seats. Everything else in the fight is the
    // player fight view's decision to take deliberately, and a banner must not
    // settle it by accident.
    expect(answer?.fight?.seats).toHaveLength(1);
    expect(fixture.combatants.length).toBeGreaterThan(2);
  });
});

describe("who is refused", () => {
  it("refuses somebody who is not a member, naming the campaign", async () => {
    const refused = await readAs(fixture.stranger);

    expect(refused._tag).toBe("Failure");
    expect(refused._tag === "Failure" && refused.failure).toBeInstanceOf(NotFound);
    expect(refused._tag === "Failure" && (refused.failure as NotFound).resource).toBe("campaign");
  });

  it("refuses a credential minted for another table", async () => {
    const refused = await readAs(scopedTo(fixture.dm, fixture.elsewhere.id));

    expect(refused._tag).toBe("Failure");
  });

  it("refuses a member whose membership has been revoked", async () => {
    // Through the shipped path: revoking the invitation that granted the seat
    // revokes the membership with it, in the same transaction.
    const gone = await asActor(() => fixture.dm)(
      Effect.gen(function* () {
        const listed = yield* invites.list(fixture.campaign.id);
        const wren = listed.find((invite) => invite.label === "Wren")!;
        return yield* invites.revoke(fixture.campaign.id, wren.id);
      }),
    );
    expect(gone.status).toBe("revoked");

    const refused = await readAs(fixture.other);
    expect(refused._tag).toBe("Failure");
    expect(refused._tag === "Failure" && refused.failure).toBeInstanceOf(NotFound);
  });
});

describe("the seam decides how much there is to say", () => {
  it("says nothing at all about a night the DM has not shared", async () => {
    await as(sessions.update(fixture.campaign.id, fixture.session.id, { visibility: "dm" }));
    // Fail-closed, and the same answer the player Chronicle gives: a table ten
    // nights old shows nothing until its DM shares a night.
    expect(await asPlayer(table.read(fixture.campaign.id))).toBeNull();
    // The DM still sees it, which is what says this is the row predicate rather
    // than the pointer having moved.
    expect((await as(table.read(fixture.campaign.id)))?.sessionId).toBe(fixture.session.id);

    await as(sessions.update(fixture.campaign.id, fixture.session.id, { visibility: "shared" }));
    expect(await asPlayer(table.read(fixture.campaign.id))).not.toBeNull();
  });

  it("says the night and nothing about the table when the fight is not shared", async () => {
    await as(runs.update(fixture.asDm, fixture.session.id, fixture.run.id, { visibility: "dm" }));

    const answer = await asPlayer(table.read(fixture.campaign.id));
    expect(answer?.sessionNumber).toBe(12);
    expect(answer?.fight).toBeNull();

    await as(
      runs.update(fixture.asDm, fixture.session.id, fixture.run.id, { visibility: "shared" }),
    );
    expect((await asPlayer(table.read(fixture.campaign.id)))?.fight).not.toBeNull();
  });

  it("names nobody when the row whose turn it is has been hidden", async () => {
    const active = fixture.combatants.find((row) => row.id === fixture.activeCombatantId)!;
    await as(
      combatants.update(fixture.asDm, fixture.session.id, fixture.run.id, active.id, {
        visibility: "dm",
      }),
    );

    const answer = await asPlayer(table.read(fixture.campaign.id));
    // The round survives, the name does not. A banner that said "somebody is
    // up" would be right; one that named a row the DM took off the board would
    // not.
    expect(answer?.fight?.round).toBe(fixture.round);
    expect(answer?.fight?.upNext).toBeNull();

    await as(
      combatants.update(fixture.asDm, fixture.session.id, fixture.run.id, active.id, {
        visibility: "shared",
      }),
    );
    expect((await asPlayer(table.read(fixture.campaign.id)))?.fight?.upNext).not.toBeNull();
  });

  it("drops a seat whose combatant the DM has hidden", async () => {
    const mine = seatFor(await asPlayer(table.read(fixture.campaign.id)), fixture.brannoc.id)!;
    await as(
      combatants.update(fixture.asDm, fixture.session.id, fixture.run.id, mine.combatantId, {
        visibility: "dm",
      }),
    );

    // Fail closed even for your own row: what a player is told about the fight
    // is what the DM shared of it, and there is no ownership disjunct anywhere
    // in the containment chain.
    expect(
      seatFor(await asPlayer(table.read(fixture.campaign.id)), fixture.brannoc.id),
    ).toBeUndefined();

    await as(
      combatants.update(fixture.asDm, fixture.session.id, fixture.run.id, mine.combatantId, {
        visibility: "shared",
      }),
    );
    expect(
      seatFor(await asPlayer(table.read(fixture.campaign.id)), fixture.brannoc.id),
    ).toBeDefined();
  });
});

describe("when nothing is happening", () => {
  it("answers null for a campaign that is on no night, without failing", async () => {
    // The common case, and it is a success rather than a 404: a banner's
    // absence must not be indistinguishable from a table that is not yours.
    const answer = await asActor(() => fixture.dm)(table.read(fixture.elsewhere.id));

    expect(answer).toBeNull();
  });

  it("answers a night with no fight on the table", async () => {
    // A session opened in a tavern is the ordinary state of an evening — see
    // `Session`, where "running" stopped meaning "a fight is on the table".
    await as(runs.update(fixture.asDm, fixture.session.id, fixture.run.id, { visibility: "dm" }));
    const answer = await asPlayer(table.read(fixture.campaign.id));
    expect(answer?.sessionId).toBe(fixture.session.id);
    expect(answer?.fight).toBeNull();
    await as(
      runs.update(fixture.asDm, fixture.session.id, fixture.run.id, { visibility: "shared" }),
    );
  });

  it("answers null once the night is over", async () => {
    // `campaign_current_session_id_fkey` makes a finished session unpointable,
    // and `Sessions` clears the pointer in the same transaction — so this is the
    // lifecycle working rather than a check here.
    await as(campaigns.update(fixture.campaign.id, { currentSessionId: null }));

    expect(await asPlayer(table.read(fixture.campaign.id))).toBeNull();

    await as(campaigns.update(fixture.campaign.id, { currentSessionId: fixture.session.id }));
  });
});
