import {
  type Actor,
  type CampaignCharacterId,
  type CombatantId,
  type Conflict,
  CurrentActor,
  emptyStatBlock,
  type EncounterRunId,
  type NotFound,
  type SessionId,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import {
  aCharacterAt,
  aPlayerAt,
  anAccount,
  asDm,
  createCampaign,
  scopedTo,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * A player entering their own initiative from their Table, and what their
 * table says while the fight is rolling it.
 *
 * Every actor is minted the shipped way (`support/actors.ts`): the players
 * through real invitations, their characters through `createOwn` and
 * `party.join`. The write reaches exactly one row — the asker's own seated
 * character's combatant in the fight their table shows — and every other
 * path is refused the way the read refuses it.
 */
const live = LiveEvents.layer;
const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Groups.layer,
    Characters.layer,
    Combatants.layer.pipe(Layer.provide(live)),
    Creatures.layer,
    CampaignCreatorActors.layer,
    EncounterCreatures.layer,
    EncounterRuns.layer.pipe(Layer.provide(live)),
    Encounters.layer,
    Invites.layer,
    Party.layer.pipe(Layer.provide(live)),
    PlayerTable.layer.pipe(Layer.provide(live)),
    SessionEvents.layer,
    Sessions.layer.pipe(Layer.provide(live)),
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_player_initiative"))),
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
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);
  const campaign = yield* as(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  const pim = yield* aPlayerAt(campaign.id, "Pim");
  const wren = yield* aPlayerAt(campaign.id, "Wren");
  const tam = yield* aPlayerAt(campaign.id, "Tam");
  const { character: brannoc, seatId: brannocSeat } = yield* aCharacterAt(
    campaign.id,
    pim,
    {
      name: "Brannoc",
      hpMax: 52,
      sheet: {
        notes: "",
        abilities: [{ label: "DEX", score: "12", modifier: "+1" }],
        traits: [],
        identity: { initiative: "+4" },
      },
    },
    { seatVisibility: "shared" },
  );
  const { character: nessa } = yield* aCharacterAt(
    campaign.id,
    wren,
    { name: "Nessa", hpMax: 34 },
    { seatVisibility: "shared" },
  );
  const { character: tamsin } = yield* aCharacterAt(
    campaign.id,
    tam,
    { name: "Tamsin", hpMax: 30 },
    { seatVisibility: "shared" },
  );
  const goblin = yield* as(
    creatures.libraryCreate({
      name: "Goblin",
      size: "Small",
      type: "Humanoid",
      cr: "1/4",
      ac: 15,
      hp: 7,
      statBlock: {
        ...emptyStatBlock,
        abilities: [{ label: "DEX", score: "14", modifier: "+2" }],
      },
    }),
  );
  const elsewhere = yield* as(createCampaign({ name: "Salt and Sixpence", visibility: "shared" }));

  const proof = yield* as(asDm(dm, campaign.id));
  let number = 0;
  /**
   * Tonight's fight, shared, with every row shared — a fresh night and a fresh
   * encounter each time, the night made the campaign's current one, so no test
   * inherits another's numbers (and an encounter is played once).
   */
  const tonight = Effect.gen(function* () {
    number += 1;
    const session = yield* as(
      sessions.create(campaign.id, { number, title: "The ford", visibility: "shared" }),
    );
    yield* as(campaigns.update(campaign.id, { currentSessionId: session.id }));
    const encounter = yield* as(
      encounters.create(campaign.id, { name: "Ambush in the reeds", visibility: "shared" }),
    );
    yield* as(roster.create(campaign.id, encounter.id, { creatureId: goblin.id, count: 1 }));
    const runs = yield* EncounterRuns;
    const combatants = yield* Combatants;
    const run = yield* as(
      runs.start(proof, session.id, { encounterId: encounter.id, visibility: "shared" }),
    );
    const rows = yield* as(combatants.list(proof, session.id, run.id));
    for (const row of rows) {
      yield* as(combatants.update(proof, session.id, run.id, row.id, { visibility: "shared" }));
    }
    // A seat given up or revoked by an earlier test seeds no row; the tests
    // that do that are the last to read the row they took away.
    const rowFor = (name: string) =>
      rows.find((row) => row.displayName === name)?.id as CombatantId;
    return {
      session: session.id,
      run: run.id,
      brannoc: rowFor("Brannoc"),
      nessa: rowFor("Nessa"),
      tamsin: rowFor("Tamsin"),
      goblin: rowFor("Goblin"),
    };
  }).pipe(Effect.orDie);

  return {
    dm,
    proof,
    campaign,
    elsewhere,
    pim,
    wren,
    tam,
    brannoc,
    brannocSeat,
    nessa,
    tamsin,
    stranger: yield* anAccount("Bo"),
    tonight,
  };
}).pipe(Effect.orDie);

interface Night {
  readonly session: SessionId;
  readonly run: EncounterRunId;
  readonly brannoc: CombatantId;
  readonly nessa: CombatantId;
  readonly tamsin: CombatantId;
  readonly goblin: CombatantId;
}

let fixture: Effect.Success<typeof makeFixture>;
let table: (typeof PlayerTable)["Service"];
let runs: (typeof EncounterRuns)["Service"];
let combatants: (typeof Combatants)["Service"];
let party: (typeof Party)["Service"];
let invites: (typeof Invites)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  table = await runtime.runPromise(PlayerTable);
  runs = await runtime.runPromise(EncounterRuns);
  combatants = await runtime.runPromise(Combatants);
  party = await runtime.runPromise(Party);
  invites = await runtime.runPromise(Invites);
}, 60_000);

const tonight = (): Promise<Night> => runtime.runPromise(fixture.tonight);

const as = <A, E>(actor: Actor, effect: Effect.Effect<A, E, CurrentActor>) =>
  runtime.runPromise(withActor(actor)(effect).pipe(Effect.orDie));

const asDmDo = <A, E>(effect: Effect.Effect<A, E, CurrentActor>) => as(fixture.dm, effect);

/** Enter a number as somebody, answering the failure's tag or `ok`. */
const enter = (actor: Actor, night: Night, combatantId: CombatantId, initiative: number) =>
  runtime.runPromise(
    withActor(actor)(table.setInitiative(fixture.campaign.id, night.run, combatantId, initiative))
      .pipe(
        Effect.as("ok" as const),
        Effect.catch((error: NotFound | Conflict) => Effect.succeed(error._tag)),
      )
      .pipe(Effect.orDie),
  );

const initiativeOf = async (night: Night, combatantId: CombatantId) =>
  (await asDmDo(combatants.list(fixture.proof, night.session, night.run))).find(
    (row) => row.id === combatantId,
  );

describe("what a seated player's table says while initiative is rolled", () => {
  it("names the phase, has no numbers, and carries a bonus on your own row alone", async () => {
    await tonight();
    const answer = await as(fixture.pim, table.read(fixture.campaign.id));
    const fight = answer?.fight;

    expect(fight?.phase).toBe("initiative");
    expect(fight?.upNext).toBeNull();
    expect(fight?.order.every((row) => row.initiative === null)).toBe(true);
    const you = fight?.order.find((row) => row.kind === "you");
    expect(you).toMatchObject({ initiativeBonus: 4, initiativeSetBy: null });
    for (const row of fight?.order ?? []) {
      if (row.kind === "you") continue;
      expect(Object.keys(row)).not.toContain("initiativeBonus");
      expect(Object.keys(row)).not.toContain("initiativeSetBy");
    }
    // The monster's bonus is a number from its stat block, like its AC.
    expect(JSON.stringify(answer)).not.toContain('"ac"');
  });
});

describe("entering your own initiative", () => {
  it("writes your own character's number as yours, and you may correct it", async () => {
    const night = await tonight();

    expect(await enter(fixture.pim, night, night.brannoc, 17)).toBe("ok");
    expect(await initiativeOf(night, night.brannoc)).toMatchObject({
      initiative: 17,
      initiativeSetBy: "player",
    });
    expect(await enter(fixture.pim, night, night.brannoc, 19)).toBe("ok");
    expect((await initiativeOf(night, night.brannoc))?.initiative).toBe(19);

    const answer = await as(fixture.pim, table.read(fixture.campaign.id));
    expect(answer?.fight?.order.find((row) => row.kind === "you")).toMatchObject({
      initiative: 19,
      initiativeSetBy: "player",
    });
    // A seat-mate sees the number, not who wrote it.
    const theirs = await as(fixture.wren, table.read(fixture.campaign.id));
    expect(theirs?.fight?.order.find((row) => row.combatantId === night.brannoc)).toMatchObject({
      kind: "ally",
      initiative: 19,
    });
  });

  it("lets the DM overwrite it, after which the DM's number stands", async () => {
    const night = await tonight();
    expect(await enter(fixture.pim, night, night.brannoc, 17)).toBe("ok");

    await asDmDo(
      combatants.setInitiative(fixture.proof, night.session, night.run, {
        entries: [{ combatantId: night.brannoc, initiative: 11 }],
      }),
    );
    expect(await enter(fixture.pim, night, night.brannoc, 20)).toBe("Conflict");
    expect(await initiativeOf(night, night.brannoc)).toMatchObject({
      initiative: 11,
      initiativeSetBy: "dm",
    });
  });

  it("never overwrites a number the DM wrote first", async () => {
    const night = await tonight();
    await asDmDo(
      combatants.update(fixture.proof, night.session, night.run, night.brannoc, {
        initiative: 8,
      }),
    );

    expect(await enter(fixture.pim, night, night.brannoc, 20)).toBe("Conflict");
    expect((await initiativeOf(night, night.brannoc))?.initiative).toBe(8);
  });

  it("is refused once round 1 has started, and again once the DM goes back to rolling", async () => {
    const night = await tonight();
    await asDmDo(
      combatants.setInitiative(fixture.proof, night.session, night.run, {
        entries: [night.nessa, night.tamsin, night.goblin].map((combatantId) => ({
          combatantId,
          initiative: 10,
        })),
      }),
    );
    expect(await enter(fixture.pim, night, night.brannoc, 12)).toBe("ok");
    await asDmDo(runs.begin(fixture.proof, night.session, night.run, {}));

    expect(await enter(fixture.pim, night, night.brannoc, 18)).toBe("Conflict");
    expect((await initiativeOf(night, night.brannoc))?.initiative).toBe(12);

    // Back to rolling, with the player's own number still theirs to change.
    await asDmDo(runs.reroll(fixture.proof, night.session, night.run, {}));
    expect(await enter(fixture.pim, night, night.brannoc, 18)).toBe("ok");
  });

  it("is refused once the fight is over", async () => {
    const night = await tonight();
    await asDmDo(runs.end(fixture.proof, night.session, night.run));
    expect(await enter(fixture.pim, night, night.brannoc, 18)).not.toBe("ok");
    expect((await initiativeOf(night, night.brannoc))?.initiative).toBeNull();
  });
});

describe("every other row, and every other asker, is not found", () => {
  it("refuses another player's character and a monster, and writes neither", async () => {
    const night = await tonight();

    expect(await enter(fixture.pim, night, night.nessa, 20)).toBe("NotFound");
    expect(await enter(fixture.pim, night, night.goblin, 20)).toBe("NotFound");
    expect((await initiativeOf(night, night.nessa))?.initiative).toBeNull();
    expect((await initiativeOf(night, night.goblin))?.initiative).toBeNull();
  });

  it("refuses your own row named under another fight", async () => {
    const earlier = await tonight();
    await asDmDo(runs.end(fixture.proof, earlier.session, earlier.run));
    const night = await tonight();

    expect(await enter(fixture.pim, { ...night, run: earlier.run }, night.brannoc, 20)).toBe(
      "NotFound",
    );
  });

  it("refuses a fight the DM has not shared, and a row the DM has hidden", async () => {
    const night = await tonight();
    await asDmDo(
      combatants.update(fixture.proof, night.session, night.run, night.brannoc, {
        visibility: "dm",
      }),
    );
    expect(await enter(fixture.pim, night, night.brannoc, 20)).toBe("NotFound");

    const other = await tonight();
    await asDmDo(runs.update(fixture.proof, other.session, other.run, { visibility: "dm" }));
    expect(await enter(fixture.pim, other, other.brannoc, 20)).toBe("NotFound");
  });

  it("refuses the campaign's creator, who has no seat, and a stranger", async () => {
    const night = await tonight();

    expect(await enter(fixture.dm, night, night.brannoc, 20)).toBe("NotFound");
    expect(await enter(fixture.stranger, night, night.brannoc, 20)).toBe("NotFound");
    expect(await enter(scopedTo(fixture.pim, fixture.elsewhere.id), night, night.brannoc, 20)).toBe(
      "NotFound",
    );
    expect((await initiativeOf(night, night.brannoc))?.initiative).toBeNull();
  });

  it("refuses a player whose seat has been given up", async () => {
    const night = await tonight();
    await as(fixture.tam, party.leave(fixture.campaign.id, await seatOf(fixture.tam)));

    expect(await enter(fixture.tam, night, night.tamsin, 20)).toBe("NotFound");
    expect((await initiativeOf(night, night.tamsin))?.initiative).toBeNull();
  });

  it("refuses a member whose membership has been revoked", async () => {
    const night = await tonight();
    await asDmDo(
      Effect.gen(function* () {
        const listed = yield* invites.listForCampaign(fixture.proof);
        const wren = listed.find((invite) => invite.label === "Wren")!;
        return yield* invites.revokeForCampaign(fixture.proof, wren.id);
      }),
    );

    expect(await enter(fixture.wren, night, night.nessa, 20)).toBe("NotFound");
    expect((await initiativeOf(night, night.nessa))?.initiative).toBeNull();
  });
});

/** An account's own live seat at the campaign, read the way the party list reads it. */
const seatOf = async (actor: Actor): Promise<CampaignCharacterId> => {
  const seats = await as(actor, party.list(fixture.campaign.id));
  return seats.find((row) => row.seat.accountId === actor.accountId)!.seat.id;
};
