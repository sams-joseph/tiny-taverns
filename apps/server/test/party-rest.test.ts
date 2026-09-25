import {
  type Actor,
  type Character,
  type CharacterId,
  Conflict,
  CurrentActor,
  NotFound,
  type PartySeat,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Result } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
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

/**
 * The creator's long rest for the whole party: the owner's own rest rule
 * (`restCharacterRow`) applied to every live seat's character, in one
 * transaction, refused mid-fight and guarded against a retry.
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Groups.layer,
    Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
    Party.layer.pipe(Layer.provide(LiveEvents.layer)),
    Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
    CampaignCreatorActors.layer,
    EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
    Encounters.layer,
    Invites.layer,
    Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_party_rest"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const run = <A, E, R extends ManagedRuntime.ManagedRuntime.Services<typeof runtime>>(
  effect: Effect.Effect<A, E, R>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const sheet = {
  notes: "",
  abilities: [{ label: "CON", score: "14", modifier: "+2" }],
  identity: { hitDice: "d10" },
  traits: [],
  resources: [
    { id: "second-wind", name: "Second Wind", max: 1, used: 0, recharge: "short", derived: true },
    { id: "lay-on-hands", name: "Lay on Hands", max: 5, used: 0, recharge: "long", derived: true },
    { id: "luck", name: "Luck", max: 3, used: 0, recharge: "dawn", derived: true },
    {
      id: "hit-dice",
      name: "Hit Dice",
      max: 3,
      used: 0,
      unit: "d10",
      recharge: "long",
      derived: true,
    },
  ],
} as const;

/**
 * Jo runs the Salt Road: Pim's Brannoc sits at a shared seat, Marta's Wren at
 * a hidden one, and Tam's Oskar sat there once and has retired. Brannoc also
 * sits at Fen's Hag's Bargain, which is how continuity is measured. Both
 * tables have a night on.
 */
const setup = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const sessions = yield* Sessions;
  const party = yield* Party;

  const jo = yield* anAccount("Jo");
  const saltRoad = yield* withActor(jo)(
    createCampaign({ name: "The Salt Road", visibility: "shared" }),
  );
  const pim = yield* aPlayerAt(saltRoad.id, "Pim");
  const marta = yield* aPlayerAt(saltRoad.id, "Marta");
  const tam = yield* aPlayerAt(saltRoad.id, "Tam");
  const brannoc = yield* aCharacterAt(
    saltRoad.id,
    pim,
    { name: "Brannoc", hpMax: 30, sheet },
    { seatVisibility: "shared" },
  );
  const wren = yield* aCharacterAt(saltRoad.id, marta, { name: "Wren", hpMax: 20 });
  const oskar = yield* aCharacterAt(saltRoad.id, tam, { name: "Oskar", hpMax: 12 });

  const fen = yield* anAccount("Fen");
  const hagsBargain = yield* withActor(fen)(
    createCampaign({ name: "The Hag's Bargain", visibility: "shared" }),
  );
  const pimAtHags = yield* admittedTo(hagsBargain.id, pim);
  const brannocAtHags = yield* withActor(pimAtHags)(
    party.join(hagsBargain.id, { characterId: brannoc.character.id }),
  );

  const saltNight = yield* withActor(jo)(
    sessions.create(saltRoad.id, { number: 1, title: "Salt", visibility: "shared" }),
  );
  yield* sql`update campaign set current_session_id = ${saltNight.id} where id = ${saltRoad.id}`;
  const hagsNight = yield* withActor(fen)(
    sessions.create(hagsBargain.id, { number: 1, title: "Hag", visibility: "shared" }),
  );
  yield* sql`update campaign set current_session_id = ${hagsNight.id} where id = ${hagsBargain.id}`;

  return {
    jo,
    pim,
    marta,
    tam,
    fen,
    saltRoad,
    hagsBargain,
    brannoc,
    wren,
    oskar,
    brannocAtHags,
    saltNight,
    hagsNight,
  };
});

let fixture: Effect.Success<typeof setup>;
let characters: (typeof Characters)["Service"];
let party: (typeof Party)["Service"];
let sql: SqlClient.SqlClient;

beforeAll(async () => {
  ({ characters, party, sql } = await run(
    Effect.all({ characters: Characters, party: Party, sql: SqlClient.SqlClient }),
  ));
  fixture = await run(setup);
}, 60_000);

const mine = async (owner: Actor, id: CharacterId): Promise<Character> => {
  const rows = await run(withActor(owner)(characters.mine));
  const row = rows.find((entry) => entry.character.id === id);
  if (row === undefined) throw new Error(`expected ${id} among the owner's characters`);
  return row.character;
};

const used = (character: Character | null | undefined, id: string) =>
  character?.sheet.resources?.find((resource) => resource.id === id)?.used;

const seatOf = (seats: ReadonlyArray<PartySeat>, id: CharacterId) =>
  seats.find((entry) => entry.seat.characterId === id);

const hurt = (seatId: PartySeat["seat"]["id"], amount: number) =>
  run(withActor(fixture.jo)(party.damage(fixture.saltRoad.id, seatId, { amount })));

const refusal = async (actor: Actor, requestId?: string) => {
  const result = await run(
    withActor(actor)(
      party.rest(fixture.saltRoad.id, {
        kind: "long",
        ...(requestId === undefined ? {} : { requestId }),
      }),
    ).pipe(Effect.result),
  );
  if (Result.isSuccess(result)) throw new Error("expected the rest to be refused");
  return result.failure;
};

describe("the creator's party long rest", () => {
  it("rests every live seat by the owner's rule, and nobody else", async () => {
    const { pim, jo, tam, brannoc, wren, oskar, saltRoad } = fixture;
    await hurt(brannoc.seatId, 25);
    await hurt(wren.seatId, 10);
    await hurt(oskar.seatId, 5);
    await run(
      withActor(jo)(
        party.update(saltRoad.id, brannoc.seatId, {
          tempHp: 4,
          conditions: ["Concentrating on Bless", "Poisoned"],
        }),
      ),
    );
    for (const [resourceId, amount] of [
      ["hit-dice", 3],
      ["second-wind", 1],
      ["lay-on-hands", 4],
      ["luck", 2],
    ] as const) {
      await run(
        withActor(pim)(characters.spendResource(brannoc.character.id, { resourceId, amount })),
      );
    }
    await run(withActor(tam)(party.leave(saltRoad.id, oskar.seatId)));
    const oskarBefore = await mine(tam, oskar.character.id);

    const seats = await run(
      withActor(jo)(party.rest(saltRoad.id, { kind: "long", requestId: "night-1" })),
    );

    // The answer is the party as it now stands: two live seats, both whole.
    expect(seats.map((entry) => entry.seat.characterId).sort()).toEqual(
      [brannoc.character.id, wren.character.id].sort(),
    );
    const rested = seatOf(seats, brannoc.character.id)?.character;
    expect(rested?.hpCurrent).toBe(30);
    expect(rested?.tempHp).toBe(0);
    expect(rested?.conditions).toEqual(["Poisoned"]);
    expect(used(rested, "second-wind")).toBe(0);
    expect(used(rested, "lay-on-hands")).toBe(0);
    // A dawn counter is not a long-rest one; half of three hit dice is two.
    expect(used(rested, "luck")).toBe(2);
    expect(used(rested, "hit-dice")).toBe(1);
    // A hidden seat is the creator's to rest all the same.
    expect(seatOf(seats, wren.character.id)?.character?.hpCurrent).toBe(20);

    // The owner reads the same row: one copy of the character.
    expect((await mine(pim, brannoc.character.id)).hpCurrent).toBe(30);
    // The retired seat's character is untouched, version and all.
    const oskarAfter = await mine(tam, oskar.character.id);
    expect(oskarAfter.hpCurrent).toBe(7);
    expect(oskarAfter.version).toBe(oskarBefore.version);

    // One `character-updated` per rested character, on this table's night only.
    const events = await run(sql<{
      readonly character_id: CharacterId;
      readonly session_id: string;
    }>`
      select character_id, session_id from session_event
      where kind = 'character-updated' and payload->>'rest' = 'long'
    `);
    expect(events.map((event) => event.character_id).sort()).toEqual(
      [brannoc.character.id, wren.character.id].sort(),
    );
    expect(new Set(events.map((event) => event.session_id))).toEqual(
      new Set([fixture.saltNight.id]),
    );
  });

  it("shows the rest at every other table the character sits at", async () => {
    const seats = await run(withActor(fixture.fen)(party.list(fixture.hagsBargain.id)));
    const there = seatOf(seats, fixture.brannoc.character.id)?.character;
    expect(there?.hpCurrent).toBe(30);
    expect(there?.conditions).toEqual(["Poisoned"]);
    expect(used(there, "hit-dice")).toBe(1);
  });

  it("applies a repeated requestId once", async () => {
    const { jo, saltRoad, brannoc } = fixture;
    await hurt(brannoc.seatId, 10);

    const retried = await run(
      withActor(jo)(party.rest(saltRoad.id, { kind: "long", requestId: "night-1" })),
    );
    expect(seatOf(retried, brannoc.character.id)?.character?.hpCurrent).toBe(20);

    const fresh = await run(
      withActor(jo)(party.rest(saltRoad.id, { kind: "long", requestId: "night-2" })),
    );
    expect(seatOf(fresh, brannoc.character.id)?.character?.hpCurrent).toBe(30);
  });

  it("is NotFound for a seated player, a stranger and another table's creator", async () => {
    const { pim, fen, brannoc } = fixture;
    await hurt(brannoc.seatId, 6);
    const stranger = await run(anAccount("Quill"));
    for (const actor of [pim, stranger, fen]) {
      expect(await refusal(actor)).toBeInstanceOf(NotFound);
    }
    expect((await mine(pim, brannoc.character.id)).hpCurrent).toBe(24);
  });

  it("is a Conflict while a seated character is in a live fight, and writes nothing", async () => {
    const { jo, fen, saltRoad, hagsBargain, brannoc, wren } = fixture;
    const encounters = await run(Encounters);
    const runs = await run(EncounterRuns);
    await hurt(wren.seatId, 3);

    // A fight at another table: refused, without naming that campaign.
    const hagsProof = await run(asDm(fen, hagsBargain.id));
    const hagsFight = await run(withActor(fen)(encounters.create(hagsBargain.id, { name: "Bog" })));
    const hagsRun = await run(
      runs.start(hagsProof, fixture.hagsNight.id, {
        encounterId: hagsFight.id,
        includeParty: true,
        visibility: "shared",
      }),
    );
    const elsewhere = await refusal(jo);
    expect(elsewhere).toBeInstanceOf(Conflict);
    expect((elsewhere as Conflict).message).toContain("Brannoc");
    expect((elsewhere as Conflict).message).not.toContain("Hag");
    await run(runs.end(hagsProof, fixture.hagsNight.id, hagsRun.id));

    // A fight at this table.
    const saltProof = await run(asDm(jo, saltRoad.id));
    const saltFight = await run(withActor(jo)(encounters.create(saltRoad.id, { name: "Brawl" })));
    await run(
      runs.start(saltProof, fixture.saltNight.id, {
        encounterId: saltFight.id,
        includeParty: true,
        visibility: "shared",
      }),
    );
    expect(await refusal(jo, "night-3")).toBeInstanceOf(Conflict);

    // Nobody was rested and the request id was not spent.
    expect((await mine(fixture.pim, brannoc.character.id)).hpCurrent).toBe(24);
    expect((await mine(fixture.marta, wren.character.id)).hpCurrent).toBe(17);
    const claims = await run(sql<{ readonly count: string }>`
      select count(*) from character_resource_request where request_id = 'night-3'
    `);
    expect(Number(claims[0]!.count)).toBe(0);
  });
});
