import { type Actor, Conflict, CurrentActor, type CharacterId } from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Result } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aPlayerAt, anAccount, asDm, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Groups.layer,
    Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
    Party.layer.pipe(Layer.provide(LiveEvents.layer)),
    Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
    Creatures.layer,
    CampaignCreatorActors.layer,
    EncounterCreatures.layer,
    EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
    Encounters.layer,
    Invites.layer,
    Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_character_resources"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const sheet = {
  notes: "",
  abilities: [{ label: "CON", score: "14", modifier: "+2" }],
  identity: { hitDice: "d10" },
  traits: [{ name: "Second Wind", text: "Catch your breath." }],
  resources: [
    { id: "second-wind", name: "Second Wind", max: 1, used: 0, recharge: "short", derived: true },
    {
      id: "lay-on-hands",
      name: "Lay on Hands",
      max: 5,
      used: 2,
      unit: "hp",
      recharge: "long",
      derived: true,
    },
    {
      id: "hit-dice",
      name: "Hit Dice",
      max: 3,
      used: 0,
      unit: "die",
      recharge: "long",
      derived: true,
    },
  ],
} as const;

const setup = Effect.gen(function* () {
  const characters = yield* Characters;
  const party = yield* Party;
  const sql = yield* SqlClient.SqlClient;
  const sessions = yield* Sessions;
  const encounters = yield* Encounters;
  const runs = yield* EncounterRuns;
  const dm = yield* anAccount("Fen");
  const table = yield* withActor(dm)(
    createCampaign({ name: "The Salt Road", visibility: "shared" }),
  );
  const player = yield* aPlayerAt(table.id, "Pim");
  const character = yield* withActor(player)(
    characters.createOwn(table.id, { name: "Brannoc", hpMax: 30, sheet }),
  );
  const [seat] = yield* withActor(dm)(party.list(table.id));
  if (seat === undefined) throw new Error("expected a party seat");
  const creator = yield* withActor(dm)(asDm(dm, table.id));
  const session = yield* withActor(dm)(
    sessions.create(table.id, { number: 1, title: "Trouble", visibility: "shared" }),
  );
  yield* sql`update campaign set current_session_id = ${session.id} where id = ${table.id}`;
  const encounter = yield* withActor(dm)(encounters.create(table.id, { name: "Brawl" }));

  return { dm, player, table, character, seat: seat.seat, creator, session, encounter, runs };
});

let fixture: Effect.Success<typeof setup>;
let characters: (typeof Characters)["Service"];
let party: (typeof Party)["Service"];
let sql: SqlClient.SqlClient;

beforeAll(async () => {
  ({ characters, party, sql } = await runtime.runPromise(
    Effect.all({ characters: Characters, party: Party, sql: SqlClient.SqlClient }).pipe(
      Effect.orDie,
    ),
  ));
  fixture = await runtime.runPromise(setup.pipe(Effect.orDie));
}, 60_000);

const mine = async (actor: Actor, id: CharacterId) => {
  const rows = await runtime.runPromise(withActor(actor)(characters.mine).pipe(Effect.orDie));
  const row = rows.find((entry) => entry.character.id === id);
  expect(row).toBeDefined();
  return row!.character;
};

describe("character resource spending and rests", () => {
  it("lets only the owner spend and recover a bounded sheet resource idempotently", async () => {
    const first = await runtime.runPromise(
      withActor(fixture.player)(
        characters.spendResource(fixture.character.id, {
          resourceId: "second-wind",
          amount: 1,
          requestId: "spend-second-wind",
        }),
      ).pipe(Effect.orDie),
    );
    expect(first.sheet.resources?.find((resource) => resource.id === "second-wind")?.used).toBe(1);

    const duplicate = await runtime.runPromise(
      withActor(fixture.player)(
        characters.spendResource(fixture.character.id, {
          resourceId: "second-wind",
          amount: 1,
          requestId: "spend-second-wind",
        }),
      ).pipe(Effect.orDie),
    );
    expect(duplicate.sheet.resources?.find((resource) => resource.id === "second-wind")?.used).toBe(
      1,
    );
    const events = await runtime.runPromise(
      sql<{ readonly count: string }>`
        select count(*) from session_event
        where session_id = ${fixture.session.id}
          and kind = 'character-updated'
          and request_id = 'spend-second-wind'
      `.pipe(Effect.orDie),
    );
    expect(Number(events[0]!.count)).toBe(1);

    const recovered = await runtime.runPromise(
      withActor(fixture.player)(
        characters.spendResource(fixture.character.id, { resourceId: "second-wind", amount: -4 }),
      ).pipe(Effect.orDie),
    );
    expect(recovered.sheet.resources?.find((resource) => resource.id === "second-wind")?.used).toBe(
      0,
    );

    const refused = await runtime.runPromise(
      withActor(fixture.dm)(
        characters.spendResource(fixture.character.id, { resourceId: "second-wind", amount: 1 }),
      ).pipe(Effect.result, Effect.orDie),
    );
    expect(Result.isFailure(refused)).toBe(true);
  });

  it("heals and refreshes on rests, but refuses while the character is in a live fight", async () => {
    await runtime.runPromise(
      sql`update character set hp_current = 10 where id = ${fixture.character.id}`.pipe(
        Effect.orDie,
      ),
    );
    await runtime.runPromise(
      withActor(fixture.player)(
        characters.spendResource(fixture.character.id, { resourceId: "hit-dice", amount: 1 }),
      ).pipe(Effect.orDie),
    );
    const shortRested = await runtime.runPromise(
      withActor(fixture.player)(
        characters.rest(fixture.character.id, {
          kind: "short",
          hitDice: 1,
          requestId: "short-rest",
        }),
      ).pipe(Effect.orDie),
    );
    expect(shortRested.hpCurrent).toBeGreaterThanOrEqual(13);
    expect(shortRested.sheet.resources?.find((resource) => resource.id === "hit-dice")?.used).toBe(
      2,
    );
    expect(
      shortRested.sheet.resources?.find((resource) => resource.id === "second-wind")?.used,
    ).toBe(0);
    expect(
      shortRested.sheet.resources?.find((resource) => resource.id === "lay-on-hands")?.used,
    ).toBe(2);

    await runtime.runPromise(
      withActor(fixture.dm)(
        party.update(fixture.table.id, fixture.seat.id, {
          tempHp: 7,
          conditions: ["Concentrating", "Poisoned"],
        }),
      ).pipe(Effect.orDie),
    );
    const longRested = await runtime.runPromise(
      withActor(fixture.player)(characters.rest(fixture.character.id, { kind: "long" })).pipe(
        Effect.orDie,
      ),
    );
    expect(longRested.hpCurrent).toBe(30);
    expect(longRested.tempHp).toBe(0);
    expect(longRested.conditions).toEqual(["Poisoned"]);
    expect(longRested.sheet.resources?.find((resource) => resource.id === "hit-dice")?.used).toBe(
      0,
    );
    expect(
      longRested.sheet.resources?.find((resource) => resource.id === "lay-on-hands")?.used,
    ).toBe(0);

    await runtime.runPromise(
      withActor(fixture.dm)(
        fixture.runs.start(fixture.creator, fixture.session.id, {
          encounterId: fixture.encounter.id,
          includeParty: true,
          visibility: "shared",
        }),
      ).pipe(Effect.orDie),
    );
    const fighting = await runtime.runPromise(
      withActor(fixture.player)(characters.rest(fixture.character.id, { kind: "short" })).pipe(
        Effect.result,
        Effect.orDie,
      ),
    );
    expect(Result.isFailure(fighting)).toBe(true);
    if (Result.isFailure(fighting)) expect(fighting.failure).toBeInstanceOf(Conflict);
  });

  it("lets the creator patch temporary hit points on the seat without touching the sheet", async () => {
    const updated = await runtime.runPromise(
      withActor(fixture.dm)(party.update(fixture.table.id, fixture.seat.id, { tempHp: 9 })).pipe(
        Effect.orDie,
      ),
    );
    expect(updated.character?.tempHp).toBe(9);
    expect((await mine(fixture.player, fixture.character.id)).tempHp).toBe(9);
  });
});
