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
import { PlayerTable } from "../src/repo/PlayerTable.js";
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
import { SqlClient } from "effect/unstable/sql";

const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  Groups.layer,
  Characters.layer,
  Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
  Creatures.layer,
  CampaignCreatorActors.layer,
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

const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const characters = yield* Characters;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const roster = yield* EncounterCreatures;
  const runs = yield* EncounterRuns;
  const sessions = yield* Sessions;
  const combatants = yield* Combatants;
  const sql = yield* SqlClient.SqlClient;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);
  const campaign = yield* as(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  // The players first, because a character is theirs from its first moment now:
  // created through the owner's `createOwn`, then explicitly seated with
  // `party.join`. There is no DM-typed character to assign.
  const player = yield* aPlayerAt(campaign.id, "Pim");
  const other = yield* aPlayerAt(campaign.id, "Wren");
  const unseated = yield* aPlayerAt(campaign.id, "Unseated");
  const { character: brannoc, seatId: brannocSeat } = yield* aCharacterAt(
    campaign.id,
    player,
    {
      name: "Brannoc",
      playerName: "Pim",
      race: "Half-orc",
      className: "Paladin",
      ac: 18,
      hpMax: 52,
    },
    { seatVisibility: "shared" },
  );
  const { character: nessa, seatId: nessaSeat } = yield* aCharacterAt(
    campaign.id,
    other,
    { name: "Nessa", playerName: "Wren", className: "Ranger", ac: 15, hpMax: 34 },
    { seatVisibility: "shared" },
  );
  const unseatedCharacter = yield* Effect.provideService(
    characters.createOwn(campaign.id, { name: "Between Tables", hpMax: 20 }),
    CurrentActor,
    unseated,
  );

  const hagSource = yield* as(
    creatures.libraryCreate({
      name: "Marsh Hag",
      size: "Medium",
      type: "Fey",
      cr: "2",
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
  yield* as(roster.create(campaign.id, encounter.id, { creatureId: hagSource.id, count: 1 }));
  const session = yield* as(
    sessions.create(campaign.id, { number: 12, title: "The ford", visibility: "shared" }),
  );
  yield* as(campaigns.update(campaign.id, { currentSessionId: session.id }));
  const dmOf = yield* as(asDm(dm, campaign.id));
  const run = yield* as(
    runs.start(dmOf, session.id, { encounterId: encounter.id, visibility: "shared" }),
  );
  const seeded = yield* as(combatants.list(dmOf, session.id, run.id));
  for (const row of seeded) {
    yield* as(combatants.update(dmOf, session.id, run.id, row.id, { visibility: "shared" }));
  }
  const monster = seeded.find((row) => row.kind === "npc")!;
  const hag = yield* as(combatants.damage(dmOf, session.id, run.id, monster.id, { amount: 41 }));
  const rolled = yield* as(runs.nextTurn(dmOf, session.id, run.id, {}));

  // A bad historical row: a combatant points at a character with no active
  // campaign_character seat. The player table must not treat that pointer as
  // table presence.
  yield* sql`
    insert into combatant
      (encounter_run_id, character_id, display_name, kind, hp_current, hp_max, visibility)
    values
      (${run.id}, ${unseatedCharacter.id}, 'Between Tables', 'pc', 20, 20, 'shared')
  `;

  const elsewhere = yield* as(createCampaign({ name: "Salt and Sixpence", visibility: "shared" }));

  return {
    dm,
    asDm: dmOf,
    campaign,
    session,
    run,
    round: rolled.round,
    activeCombatantId: rolled.activeCombatantId,
    hag,
    brannoc,
    brannocSeat,
    nessa,
    nessaSeat,
    unseated,
    unseatedCharacter,
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
let party: (typeof Party)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  table = await runtime.runPromise(PlayerTable);
  sessions = await runtime.runPromise(Sessions);
  runs = await runtime.runPromise(EncounterRuns);
  combatants = await runtime.runPromise(Combatants);
  campaigns = await runtime.runPromise(Campaigns);
  invites = await runtime.runPromise(Invites);
  party = await runtime.runPromise(Party);
}, 60_000);

const asActor =
  (actor: () => Actor) =>
  <A, E, R extends Services>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    runtime.runPromise(withActor(actor())(effect).pipe(Effect.orDie));

const as = asActor(() => fixture.dm);
const asPlayer = asActor(() => fixture.player);

const readAs = (actor: Actor, campaignId?: CampaignId) =>
  runtime.runPromise(
    withActor(actor)(Effect.result(table.read(campaignId ?? fixture.campaign.id))),
  );

const seatFor = (answer: PlayerLiveTable | null, characterId: CharacterId) =>
  answer?.fight?.seats.find((seat) => seat.characterId === characterId);

const numbersIn = (value: unknown): ReadonlyArray<number> => {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(numbersIn);
  }
  return [];
};

describe("the live table, to a seated player", () => {
  it("names the night, the round, whose turn it is and the projected order", async () => {
    const answer = await asPlayer(table.read(fixture.campaign.id));

    expect(answer?.campaignId).toBe(fixture.campaign.id);
    expect(answer?.sessionId).toBe(fixture.session.id);
    expect(answer?.sessionNumber).toBe(12);
    expect(answer?.fight?.id).toBe(fixture.run.id);
    expect(answer?.fight?.round).toBe(fixture.round);
    expect(answer?.fight?.upNext?.combatantId).toBe(fixture.activeCombatantId);
    expect(answer?.fight?.encounterId).toBeTruthy();
    expect(answer?.fight?.order.map((row) => row.kind).sort()).toEqual(["ally", "npc", "you"]);
  });

  it("uses the active campaign_character seat for your row and not combatant.character_id alone", async () => {
    const answer = await asPlayer(table.read(fixture.campaign.id));
    const you = answer?.fight?.order.find((row) => row.kind === "you");
    const ally = answer?.fight?.order.find((row) => row.kind === "ally");

    expect(seatFor(answer, fixture.brannoc.id)?.campaignCharacterId).toBe(fixture.brannocSeat);
    expect(seatFor(answer, fixture.nessa.id)).toBeUndefined();
    expect(you).toMatchObject({ characterId: fixture.brannoc.id, hpMax: 52, tempHp: 0 });
    expect(ally).toMatchObject({ characterId: fixture.nessa.id, displayName: "Nessa" });
    expect(JSON.stringify(answer)).not.toContain(fixture.unseatedCharacter.id);
  });

  it("drops another player's seat the DM has hidden", async () => {
    await as(party.update(fixture.campaign.id, fixture.nessaSeat, { visibility: "dm" }));

    const answer = await asPlayer(table.read(fixture.campaign.id));
    expect(answer?.fight?.order.some((row) => row.kind === "ally")).toBe(false);
    expect(seatFor(answer, fixture.brannoc.id)).toBeTruthy();

    await as(party.update(fixture.campaign.id, fixture.nessaSeat, { visibility: "shared" }));
  });

  it("bands NPC hit points and never carries NPC exact totals or armour class", async () => {
    const answer = await asPlayer(table.read(fixture.campaign.id));
    const npc = answer?.fight?.order.find((row) => row.kind === "npc");
    const text = JSON.stringify(answer);

    expect(npc).toMatchObject({ displayName: "Marsh Hag", hpBand: "bloodied" });
    expect(text).not.toContain('"ac"');
    expect(text).not.toContain('"encounterName"');
    expect(numbersIn(answer)).not.toContain(fixture.hag.hpCurrent);
    expect(numbersIn(answer)).not.toContain(fixture.hag.hpMax);
    expect(numbersIn(answer)).not.toContain(fixture.hag.ac!);
  });

  it("requires an active seat even for the campaign's own creator", async () => {
    expect(await as(table.read(fixture.campaign.id))).toBeNull();
  });
});

describe("who is absent or refused", () => {
  it("answers null for a member with no active character seat", async () => {
    expect(await asActor(() => fixture.unseated)(table.read(fixture.campaign.id))).toBeNull();
  });

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
    const gone = await asActor(() => fixture.dm)(
      Effect.gen(function* () {
        const listed = yield* invites.listForCampaign(fixture.asDm);
        const wren = listed.find((invite) => invite.label === "Wren")!;
        return yield* invites.revokeForCampaign(fixture.asDm, wren.id);
      }),
    );
    expect(gone.status).toBe("revoked");

    const refused = await readAs(fixture.other);
    expect(refused._tag).toBe("Failure");
  });
});

describe("the seam decides how much there is to say", () => {
  it("says nothing at all about a night the DM has not shared", async () => {
    await as(sessions.update(fixture.campaign.id, fixture.session.id, { visibility: "dm" }));
    expect(await asPlayer(table.read(fixture.campaign.id))).toBeNull();

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
  });

  it("drops a combatant the DM has hidden", async () => {
    const mine = seatFor(await asPlayer(table.read(fixture.campaign.id)), fixture.brannoc.id)!;
    await as(
      combatants.update(fixture.asDm, fixture.session.id, fixture.run.id, mine.combatantId, {
        visibility: "dm",
      }),
    );

    expect(
      seatFor(await asPlayer(table.read(fixture.campaign.id)), fixture.brannoc.id),
    ).toBeUndefined();

    await as(
      combatants.update(fixture.asDm, fixture.session.id, fixture.run.id, mine.combatantId, {
        visibility: "shared",
      }),
    );
  });
});

describe("player live ticks", () => {
  it("are contentless cursors over shared table events", async () => {
    const ticks = await runtime.runPromise(
      table
        .ticks(fixture.player, fixture.campaign.id, fixture.session.id, 0, 20)
        .pipe(Effect.orDie),
    );

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((seq) => Number.isSafeInteger(seq))).toBe(true);
  });
});

describe("when nothing is happening", () => {
  it("answers null for a campaign that is on no night, without failing", async () => {
    expect(await asActor(() => fixture.dm)(table.read(fixture.elsewhere.id))).toBeNull();
  });

  it("answers null once the night is over", async () => {
    await as(campaigns.update(fixture.campaign.id, { currentSessionId: null }));
    expect(await asPlayer(table.read(fixture.campaign.id))).toBeNull();
    await as(campaigns.update(fixture.campaign.id, { currentSessionId: fixture.session.id }));
  });
});
