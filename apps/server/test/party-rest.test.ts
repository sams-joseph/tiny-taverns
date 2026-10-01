import { describe, expect } from "@effect/vitest";
import {
  type Actor,
  type Character,
  type CharacterId,
  Conflict,
  type EncounterRunId,
  CurrentActor,
  NotFound,
  type PartySeat,
} from "@taverns/api";
import { Context, Effect, Layer, Result } from "effect";
import { SqlClient, Statement } from "effect/sql";
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
import { describeLayer } from "./support/suite.js";

/**
 * The creator's long rest for the whole party: the owner's own rest rule
 * (`restCharacterRow`) applied to every live seat's character, in one
 * transaction, refused mid-fight and guarded against a retry.
 */

const services = Layer.mergeAll(
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
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_party_rest")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

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
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof setup>>()(
  "party-rest.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(setup).pipe(Layer.provideMerge(services));

const mine = (owner: Actor, id: CharacterId) =>
  Effect.gen(function* () {
    const characters = yield* Characters;
    const rows = yield* withActor(owner)(characters.mine);
    const row = rows.find((entry) => entry.character.id === id);
    if (row === undefined) throw new Error(`expected ${id} among the owner's characters`);
    return row.character;
  });

const used = (character: Character | null | undefined, id: string) =>
  character?.sheet.resources?.find((resource) => resource.id === id)?.used;

const seatOf = (seats: ReadonlyArray<PartySeat>, id: CharacterId) =>
  seats.find((entry) => entry.seat.characterId === id);

const hurt = (seatId: PartySeat["seat"]["id"], amount: number) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const party = yield* Party;
    return yield* withActor(fixture.jo)(party.damage(fixture.saltRoad.id, seatId, { amount }));
  });

const refusal = (actor: Actor, requestId?: string) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    const party = yield* Party;
    const result = yield* withActor(actor)(
      party.rest(fixture.saltRoad.id, {
        kind: "long",
        ...(requestId === undefined ? {} : { requestId }),
      }),
    ).pipe(Effect.result);
    if (Result.isSuccess(result)) throw new Error("expected the rest to be refused");
    return result.failure;
  });

describeLayer("party-rest", shared, (it) => {
  describe("the creator's party long rest", () => {
    it.effect("rests every live seat by the owner's rule, and nobody else", () =>
      Effect.gen(function* () {
        const party = yield* Party;
        const sql = yield* SqlClient.SqlClient;
        const characters = yield* Characters;
        const fixture = yield* Fixture;
        const { pim, jo, tam, brannoc, wren, oskar, saltRoad } = fixture;
        yield* hurt(brannoc.seatId, 25);
        yield* hurt(wren.seatId, 10);
        yield* hurt(oskar.seatId, 5);
        yield* withActor(jo)(
          party.update(saltRoad.id, brannoc.seatId, {
            tempHp: 4,
            conditions: ["Concentrating on Bless", "Poisoned"],
          }),
        );
        for (const [resourceId, amount] of [
          ["hit-dice", 3],
          ["second-wind", 1],
          ["lay-on-hands", 4],
          ["luck", 2],
        ] as const) {
          yield* withActor(pim)(
            characters.spendResource(brannoc.character.id, { resourceId, amount }),
          );
        }
        yield* withActor(tam)(party.leave(saltRoad.id, oskar.seatId));
        const oskarBefore = yield* mine(tam, oskar.character.id);

        const seats = yield* withActor(jo)(
          party.rest(saltRoad.id, { kind: "long", requestId: "night-1" }),
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
        expect((yield* mine(pim, brannoc.character.id)).hpCurrent).toBe(30);
        // The retired seat's character is untouched, version and all.
        const oskarAfter = yield* mine(tam, oskar.character.id);
        expect(oskarAfter.hpCurrent).toBe(7);
        expect(oskarAfter.version).toBe(oskarBefore.version);

        // One `character-updated` per rested character, on this table's night only.
        const events = yield* sql<{
          readonly character_id: CharacterId;
          readonly session_id: string;
        }>`
      select character_id, session_id from session_event
      where kind = 'character-updated' and payload->>'rest' = 'long'
    `;
        expect(events.map((event) => event.character_id).sort()).toEqual(
          [brannoc.character.id, wren.character.id].sort(),
        );
        expect(new Set(events.map((event) => event.session_id))).toEqual(
          new Set([fixture.saltNight.id]),
        );
      }),
    );

    it.effect("shows the rest at every other table the character sits at", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const party = yield* Party;
        const seats = yield* withActor(fixture.fen)(party.list(fixture.hagsBargain.id));
        const there = seatOf(seats, fixture.brannoc.character.id)?.character;
        expect(there?.hpCurrent).toBe(30);
        expect(there?.conditions).toEqual(["Poisoned"]);
        expect(used(there, "hit-dice")).toBe(1);
      }),
    );

    it.effect("applies a repeated requestId once", () =>
      Effect.gen(function* () {
        const party = yield* Party;
        const { jo, saltRoad, brannoc } = yield* Fixture;
        yield* hurt(brannoc.seatId, 10);

        const retried = yield* withActor(jo)(
          party.rest(saltRoad.id, { kind: "long", requestId: "night-1" }),
        );
        expect(seatOf(retried, brannoc.character.id)?.character?.hpCurrent).toBe(20);

        const fresh = yield* withActor(jo)(
          party.rest(saltRoad.id, { kind: "long", requestId: "night-2" }),
        );
        expect(seatOf(fresh, brannoc.character.id)?.character?.hpCurrent).toBe(30);
      }),
    );

    it.effect("is NotFound for a seated player, a stranger and another table's creator", () =>
      Effect.gen(function* () {
        const { pim, fen, brannoc } = yield* Fixture;
        yield* hurt(brannoc.seatId, 6);
        const stranger = yield* anAccount("Quill");
        for (const actor of [pim, stranger, fen]) {
          expect(yield* refusal(actor)).toBeInstanceOf(NotFound);
        }
        expect((yield* mine(pim, brannoc.character.id)).hpCurrent).toBe(24);
      }),
    );

    it.effect("is a Conflict while a seated character is in a live fight, and writes nothing", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const fixture = yield* Fixture;
        const { jo, fen, saltRoad, hagsBargain, brannoc, wren } = fixture;
        const encounters = yield* Encounters;
        const runs = yield* EncounterRuns;
        yield* hurt(wren.seatId, 3);

        // A fight at another table: refused, without naming that campaign.
        const hagsProof = yield* asDm(fen, hagsBargain.id);
        const hagsFight = yield* withActor(fen)(encounters.create(hagsBargain.id, { name: "Bog" }));
        const hagsRun = yield* runs.start(hagsProof, fixture.hagsNight.id, {
          encounterId: hagsFight.id,
          includeParty: true,
          visibility: "shared",
        });
        const elsewhere = yield* refusal(jo);
        expect(elsewhere).toBeInstanceOf(Conflict);
        expect((elsewhere as Conflict).message).toContain("Brannoc");
        expect((elsewhere as Conflict).message).not.toContain("Hag");
        yield* runs.end(hagsProof, fixture.hagsNight.id, hagsRun.id);

        // A fight at this table.
        const saltProof = yield* asDm(jo, saltRoad.id);
        const saltFight = yield* withActor(jo)(encounters.create(saltRoad.id, { name: "Brawl" }));
        yield* runs.start(saltProof, fixture.saltNight.id, {
          encounterId: saltFight.id,
          includeParty: true,
          visibility: "shared",
        });
        expect(yield* refusal(jo, "night-3")).toBeInstanceOf(Conflict);

        // Nobody was rested and the request id was not spent.
        expect((yield* mine(fixture.pim, brannoc.character.id)).hpCurrent).toBe(24);
        expect((yield* mine(fixture.marta, wren.character.id)).hpCurrent).toBe(17);
        const claims = yield* sql<{ readonly count: string }>`
      select count(*) from character_resource_request where request_id = 'night-3'
    `;
        expect(Number(claims[0]!.count)).toBe(0);
      }),
    );

    it.effect("checks the whole party for a live fight in one statement", () =>
      Effect.gen(function* () {
        const party = yield* Party;
        const sql = yield* SqlClient.SqlClient;
        const { jo, saltRoad, saltNight } = yield* Fixture;
        // End the fight the test above started, through the runner, so the rest
        // goes ahead and every seat is checked.
        const live = yield* sql<{ readonly id: EncounterRunId }>`
      select id from encounter_run where session_id = ${saltNight.id} and ended_at is null
    `;
        const proof = yield* asDm(jo, saltRoad.id);
        const runs = yield* EncounterRuns;
        for (const { id } of live) yield* runs.end(proof, saltNight.id, id);

        const statements: Array<string> = [];
        const seats = yield* withActor(jo)(
          party.rest(saltRoad.id, { kind: "long", requestId: "night-4" }),
        ).pipe(
          Effect.provideService(Statement.CurrentTransformer, (statement) =>
            Effect.sync(() => {
              statements.push(statement.compile()[0]);
              return statement;
            }),
          ),
        );
        // Two live seats, and their fights read once — not once a character.
        expect(seats).toHaveLength(2);
        expect(statements.filter((text) => text.includes("ended_at is null"))).toHaveLength(1);
      }),
    );
  });
});
