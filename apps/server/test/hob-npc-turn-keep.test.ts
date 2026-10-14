import { describe, expect } from "@effect/vitest";
import {
  type AssistantTurnId,
  type Combatant,
  CurrentActor,
  type HobEvent,
  type HobFightAsk,
  type NpcTurnOutcome,
  type StatBlock,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { transformedMonster } from "../src/bestiary/import.js";
import { MONSTER_RAW } from "../src/bestiary/systemMonsters.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Dice } from "../src/live/Dice.js";
import { Creatures } from "../src/repo/Creatures.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { SPELL_RAW } from "../src/spells/systemSpells.js";
import { aCharacterAt, admittedTo, aPerson, type Person } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { type Round, scriptedModel, toolCallChunks } from "./support/model.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Keeping a monster's turn Hob proposed** — `POST …/runs/:r/hob/turns/:t/keep`
 * — over the real application, with real actors, the model scripted to make
 * the proposal and the server's dice scripted to make the rolls. The claims:
 *
 * - **the turn is carried out through the runner's own statements**: the move
 *   counts its feet, the slot and what it spends are ticked, each attack is
 *   resolved by the shared rule and its damage lands as the DM's would — a
 *   party member dropping to zero falls unconscious, and a hit at zero is a
 *   failed death save;
 * - **a legendary action, a breath weapon and a spell** spend what they
 *   spend, a monster target's save is rolled from its stat block and halves
 *   the damage, a party member's save is left to the player, and a slot is
 *   spent for a spell;
 * - **every roll and log line it writes names the turn**, and its narration
 *   is heard by the table only when a player could see the creature act;
 * - **the refused paths**: a player is `NotFound`; a stale stamp, a second
 *   keep, a creature that died or spent its action by hand since are
 *   `Conflict`, and none of them writes anything.
 */
const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-keep", maxTokens: 512, rounds: script });

/** The faces the server's dice will come up, in order: each `(face - 1) / sides`. */
const faces: Array<number> = [];
const roll = (sides: number, ...rolled: ReadonlyArray<number>) => {
  for (const face of rolled) faces.push((face - 1) / sides + 0.000_001);
};
const dice = Dice.fixed(() => {
  const next = faces.shift();
  if (next === undefined) throw new Error("the server rolled more dice than the test scripted");
  return next;
});

const database = migratedDatabase("taverns_test_hob_npc_turn_keep");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-keep" }).pipe(Layer.provide(model.layer)),
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  dice,
);
const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(services),
  Layer.provideMerge(database),
);

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });
type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(token), call).pipe(Effect.orDie);

/** A call's failure tag and message, or `succeeded`. */
const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({
        onFailure: (error) => ({
          tag: error._tag,
          message: "message" in error && typeof error.message === "string" ? error.message : "",
        }),
        onSuccess: () => ({ tag: "succeeded", message: "" }),
      }),
    ),
  ).pipe(Effect.orDie);

const srd = (name: string): StatBlock => {
  const row = (MONSTER_RAW as ReadonlyArray<Record<string, unknown>>).find(
    (monster) => monster.name === name,
  );
  if (row === undefined) throw new Error(`no SRD ${name}`);
  return transformedMonster(row).statBlock as StatBlock;
};

const libraryCreature = (dm: Person, name: string, statBlock: StatBlock) =>
  Effect.flatMap(Creatures, (creatures) =>
    creatures.libraryCreate({ name, type: "Monster", cr: "1", ac: 15, hp: 20, statBlock }),
  ).pipe(Effect.provideService(CurrentActor, dm.actor), Effect.orDie);

/** A table: its DM, a seated player with Brannoc (AC 14, 30 hp), and its creatures. */
const aTable = Effect.gen(function* () {
  // The Priest's one spell this file casts, from the bundle.
  yield* importSystemEquipment().pipe(Effect.orDie);
  yield* importSystemOptions().pipe(Effect.orDie);
  yield* importSystemSpells(
    (SPELL_RAW as ReadonlyArray<Record<string, unknown>>).filter(
      (row) => row.name === "Guiding Bolt",
    ),
    [],
  ).pipe(Effect.orDie);

  const dm = yield* aPerson("Keep DM");
  const campaignId = (yield* as(dm.token, (client) =>
    client.campaigns.create({ payload: { name: "The Cinder Steps", visibility: "shared" } }),
  )).id;
  const player = yield* aPerson("Keep player");
  const admitted = yield* admittedTo(campaignId, player.actor, "Player");
  yield* aCharacterAt(
    campaignId,
    admitted,
    { name: "Brannoc", hpMax: 30, ac: 14 },
    { seatVisibility: "shared" },
  );
  const goblin = yield* libraryCreature(dm, "Ash Goblin", srd("Goblin"));
  const dragon = yield* libraryCreature(dm, "Cinder", srd("Adult Red Dragon"));
  const priest = yield* libraryCreature(dm, "Ember Priest", srd("Priest"));
  return {
    dm,
    player,
    campaignId,
    creatures: { goblin: goblin.id, dragon: dragon.id, priest: priest.id },
    nights: { count: 0 },
  };
});
type Table = Effect.Success<typeof aTable>;

interface FightOptions {
  readonly first?: "goblin" | "dragon" | "priest";
  /** Who is shown to the players; every row is hidden by default. */
  readonly shown?: ReadonlyArray<"goblin" | "dragon" | "priest">;
  /** Squares the fog covers. */
  readonly fog?: ReadonlyArray<readonly [number, number]>;
}

/**
 * A fight on a fresh night: the goblin at (5,5), Brannoc beside it at (6,5),
 * the dragon at (5,8) and the priest at (9,5). Placed while initiative is
 * rolled, so nobody has walked.
 */
const aFight = (table: Table, options: FightOptions = {}) =>
  Effect.gen(function* () {
    const { dm, campaignId } = table;
    table.nights.count += 1;
    const session = yield* as(dm.token, (client) =>
      client.sessions.create({
        params: { campaignId },
        payload: { number: table.nights.count, visibility: "shared" },
      }),
    );
    yield* as(dm.token, (client) =>
      client.campaigns.update({
        params: { campaignId },
        payload: { currentSessionId: session.id },
      }),
    );
    const encounter = yield* as(dm.token, (client) =>
      client.encounters.create({
        params: { campaignId },
        payload: {
          name: `Embers ${String(table.nights.count)}`,
          visibility: "shared",
          ready: true,
          creatures: [
            { creatureId: table.creatures.goblin, count: 1 },
            { creatureId: table.creatures.dragon, count: 1 },
            { creatureId: table.creatures.priest, count: 1 },
          ],
        },
      }),
    );
    const run = yield* as(dm.token, (client) =>
      client.runs.start({
        params: { campaignId, sessionId: session.id },
        payload: { encounterId: encounter.id, visibility: "shared", includeParty: true },
      }),
    );
    const params = { campaignId, sessionId: session.id, runId: run.id };
    const seeded = yield* as(dm.token, (client) => client.combatants.list({ params }));
    const rows = {
      goblin: seeded.find((row) => row.displayName === "Ash Goblin")!,
      dragon: seeded.find((row) => row.displayName === "Cinder")!,
      priest: seeded.find((row) => row.displayName === "Ember Priest")!,
    };
    const hero = seeded.find((row) => row.kind === "pc")!;
    // Brannoc is one character across every fight here: whole again for each.
    yield* as(dm.token, (client) =>
      client.combatants.damage({
        params: { ...params, combatantId: hero.id },
        payload: { amount: -100 },
      }),
    );
    for (const [row, column, line] of [
      [rows.goblin, 5, 5],
      [hero, 6, 5],
      [rows.dragon, 5, 8],
      [rows.priest, 9, 5],
    ] as const) {
      yield* as(dm.token, (client) =>
        client.combatants.move({
          params: { ...params, combatantId: row.id },
          payload: { position: { column, row: line } },
        }),
      );
    }
    for (const name of options.shown ?? []) {
      yield* as(dm.token, (client) =>
        client.combatants.update({
          params: { ...params, combatantId: rows[name].id },
          payload: { visibility: "shared" },
        }),
      );
    }
    if (options.fog !== undefined) {
      yield* as(dm.token, (client) =>
        client.runs.updateFog({
          params,
          payload: { hide: options.fog!.map(([column, line]) => ({ column, row: line })) },
        }),
      );
    }
    const first = options.first ?? "goblin";
    yield* as(dm.token, (client) =>
      client.runs.setInitiative({
        params,
        payload: {
          entries: [
            { combatantId: rows.goblin.id, initiative: first === "goblin" ? 20 : 15 },
            { combatantId: rows.dragon.id, initiative: first === "dragon" ? 20 : 14 },
            { combatantId: rows.priest.id, initiative: first === "priest" ? 20 : 13 },
            { combatantId: hero.id, initiative: 10 },
          ],
        },
      }),
    );
    yield* as(dm.token, (client) => client.runs.begin({ params, payload: {} }));
    const order = yield* as(dm.token, (client) => client.combatants.list({ params }));
    /** A creature's place in the order, as the model names it. */
    const place = (row: Pick<Combatant, "id">) =>
      order.findIndex((other) => other.id === row.id) + 1;
    return { params, ...rows, hero, place };
  });
type Fight = Effect.Success<ReturnType<typeof aFight>>;

/** Hob proposes these steps for one combatant; answers the turn that holds the proposal. */
const proposed = (
  table: Table,
  fight: Fight,
  combatant: Pick<Combatant, "id">,
  ask: HobFightAsk,
  steps: ReadonlyArray<Record<string, unknown>>,
  narration = "Cinder rears and the air shimmers.",
) =>
  Effect.gen(function* () {
    script.length = model.requests().length;
    script.push(toolCallChunks("proposeNpcTurn", { steps, narration }));
    const events = yield* as(table.dm.token, (client) =>
      Effect.flatMap(
        client.hobFight.turn({
          params: { ...fight.params, combatantId: combatant.id },
          payload: ask,
        }),
        (stream) => Stream.runCollect(stream),
      ),
    );
    const list = Array.from(events) as ReadonlyArray<HobEvent>;
    if (!list.some((event) => event.event === "proposal")) {
      throw new Error(`no proposal: ${JSON.stringify(list.at(-1))}`);
    }
    const began = list.find((event) => event.event === "began");
    if (began?.event !== "began") throw new Error("no began event");
    return began.data.turnId as AssistantTurnId;
  });

const keep = (who: Person, fight: Fight, turnId: AssistantTurnId) =>
  refusal(who.token, (client) =>
    client.hobFight.keep({ params: { ...fight.params, turnId }, payload: {} }),
  );
const kept = (table: Table, fight: Fight, turnId: AssistantTurnId) =>
  as(table.dm.token, (client) =>
    client.hobFight.keep({ params: { ...fight.params, turnId }, payload: {} }),
  );
const rowsOf = (table: Table, fight: Fight) =>
  as(table.dm.token, (client) => client.combatants.list({ params: fight.params }));
const rowOf = (rows: ReadonlyArray<Combatant>, id: string) => rows.find((row) => row.id === id)!;

/** What the keep wrote under this turn, straight from the tables. */
const writtenBy = (turnId: AssistantTurnId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rolls = yield* sql<{
      readonly kind: string;
      readonly origin: string;
      readonly visibility: string;
      readonly mode: string;
      readonly dice: ReadonlyArray<number>;
      readonly total: number;
      readonly outcome: string | null;
    }>`
      select kind, origin, visibility, mode, dice, total, outcome from character_roll
      where assistant_turn_id = ${turnId} order by created_at, id
    `;
    const events = yield* sql<{
      readonly kind: string;
      readonly origin: string;
      readonly visibility: string;
      readonly payload: unknown;
    }>`
      select kind, origin, visibility, payload from session_event
      where assistant_turn_id = ${turnId} order by seq
    `;
    const turnRows = yield* sql<{ readonly combatant_name: string }>`
      select hob_npc_turn_row.combatant_name from hob_npc_turn_row
      join hob_npc_turn on hob_npc_turn.id = hob_npc_turn_row.hob_npc_turn_id
      where hob_npc_turn.assistant_turn_id = ${turnId}
      order by hob_npc_turn_row.combatant_name
    `;
    return { rolls, events, snapshotted: turnRows.map((row) => row.combatant_name) };
  }).pipe(Effect.orDie);

/** The hit points a kept turn's snapshot says it left a combatant on. */
const snapshotHp = (turnId: AssistantTurnId, combatantId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly hp: number }>`
      select (hob_npc_turn_row.after ->> 'hpCurrent')::int as hp from hob_npc_turn_row
      join hob_npc_turn on hob_npc_turn.id = hob_npc_turn_row.hob_npc_turn_id
      where hob_npc_turn.assistant_turn_id = ${turnId}
        and hob_npc_turn_row.combatant_id = ${combatantId}
    `;
    return rows[0]?.hp;
  }).pipe(Effect.orDie);

/** A response body as the wire carries it, for asserting on what is absent. */
const rawBody = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, text: yield* response.text };
  }).pipe(Effect.orDie);

/** Every roll and log line in the run, so a refused keep can be shown to have written none. */
const writesIn = (fight: Fight) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rolls = yield* sql<{ readonly n: number }>`
      select count(*)::int as n from character_roll where encounter_run_id = ${fight.params.runId}
    `;
    const events = yield* sql<{ readonly n: number }>`
      select count(*)::int as n from session_event where encounter_run_id = ${fight.params.runId}
    `;
    return [rolls[0]!.n, events[0]!.n];
  }).pipe(Effect.orDie);

const optionStep = (outcome: NpcTurnOutcome, index: number) => {
  const step = outcome.steps[index];
  if (step?.kind !== "option") throw new Error(`step ${String(index)} is not an option`);
  return step;
};

class Fixture extends Context.Service<Fixture, Table>()("hob-npc-turn-keep.test/Fixture") {}
const shared = Layer.effect(Fixture)(aTable).pipe(Layer.provideMerge(application));

describeLayer("hob-npc-turn-keep", shared, (it) => {
  describe("a kept turn", () => {
    it.effect("moves, multiattacks, and drops a party member as the DM's own hit would", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table, { first: "dragon" });
        const turnId = yield* proposed(table, fight, fight.dragon, { moment: "turn" }, [
          { option: "move", square: { column: 6, row: 6 } },
          {
            option: "actions/Multiattack",
            targets: [
              fight.place(fight.hero),
              fight.place(fight.hero),
              fight.place(fight.hero),
              fight.place(fight.hero),
            ],
          },
        ]);
        faces.length = 0;
        // Bite: 15 to hit, 2d10 10 and 10, 2d6 fire 1 and 1 — 30, all of Brannoc.
        roll(20, 15);
        roll(10, 10, 10);
        roll(6, 1, 1);
        // Claw: a natural 1.
        roll(20, 1);
        // Claw: 18 to hit, 2d6 3 and 3 — a hit on a creature already at zero.
        roll(20, 18);
        roll(6, 3, 3);

        const outcome = yield* kept(table, fight, turnId);
        expect(faces).toEqual([]);
        expect(outcome.steps[0]).toEqual({ kind: "move", to: { column: 6, row: 6 }, feet: 10 });
        const multiattack = optionStep(outcome, 1);
        expect(multiattack.attacks.map((attack) => [attack.name, attack.verdict])).toEqual([
          ["Bite", "hit"],
          ["Claw", "natural-1"],
          ["Claw", "hit"],
        ]);
        expect(multiattack.attacks[0]).toMatchObject({
          target: { combatantId: fight.hero.id, name: "Brannoc" },
          d20: 15,
          toHit: 14,
          total: 29,
          ac: 14,
          hit: { amount: 30, hpBefore: 30, hpAfter: 0, dropped: true },
        });
        expect(multiattack.attacks[2]?.hit).toMatchObject({
          amount: 14,
          hpAfter: 0,
          dropped: false,
        });
        // Frightful Presence is a strike with no roll, and the last claw hit a
        // creature lying unconscious: both are the DM's to judge.
        expect(multiattack.notes.join("\n")).toMatch(/Frightful Presence/);
        expect(multiattack.notes.join("\n")).toMatch(/Brannoc was unconscious/);

        const rows = yield* rowsOf(table, fight);
        const dragon = rowOf(rows, fight.dragon.id);
        const hero = rowOf(rows, fight.hero.id);
        expect([dragon.position, dragon.feetMoved, dragon.actionUsed]).toEqual([
          { column: 6, row: 6 },
          10,
          true,
        ]);
        expect(hero.hpCurrent).toBe(0);
        expect(hero.conditions).toContain("Unconscious");
        expect(hero.deathSaves).toEqual({ successes: 0, failures: 1 });
        // Written through to the character, as the DM's damage is.
        const party = yield* as(table.dm.token, (client) =>
          client.party.list({ params: { campaignId: table.campaignId } }),
        );
        expect(JSON.stringify(party)).toContain('"hpCurrent":0');

        const written = yield* writtenBy(turnId);
        expect(written.rolls.map((row) => row.kind)).toEqual([
          "attack",
          "damage",
          "damage",
          "attack",
          "attack",
          "damage",
        ]);
        expect(written.rolls.every((row) => row.origin === "assistant")).toBe(true);
        expect(written.rolls.every((row) => row.visibility === "dm")).toBe(true);
        expect(
          written.rolls.filter((row) => row.kind === "attack").map((row) => row.outcome),
        ).toEqual(["hit", "fumble", "hit"]);
        expect(written.events.every((row) => row.origin === "assistant")).toBe(true);
        expect(new Set(written.events.map((row) => row.kind))).toEqual(
          new Set([
            "combatant-moved",
            "combatant-updated",
            "roll-made",
            "combatant-damaged",
            "hob-turn-kept",
          ]),
        );
        expect(written.snapshotted).toEqual(["Brannoc", "Cinder"]);

        // Kept, and the card can say what it made.
        const thread = yield* as(table.dm.token, (client) =>
          client.hobFight.thread({ params: fight.params }),
        );
        const turns = yield* as(table.dm.token, (client) =>
          client.hob.turns({ params: { campaignId: table.campaignId, threadId: thread.id } }),
        );
        const turn = turns.find((row) => row.id === turnId)!;
        expect(turn.acceptedAt).not.toBeNull();
        expect(turn.kept).toEqual({
          accepted: "npcTurn",
          sessionId: fight.params.sessionId,
          runId: fight.params.runId,
          combatantId: fight.dragon.id,
        });
      }),
    );

    it.effect("takes a legendary action between turns, and spends it", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table);
        const turnId = yield* proposed(table, fight, fight.dragon, { moment: "legendary" }, [
          { option: "legendaryActions/Tail Attack>Tail", targets: [fight.place(fight.hero)] },
        ]);
        faces.length = 0;
        roll(20, 12);
        roll(8, 4, 4);
        const outcome = yield* kept(table, fight, turnId);
        expect(optionStep(outcome, 0).attacks[0]).toMatchObject({
          name: "Tail Attack: Tail",
          verdict: "hit",
          hit: { amount: 16, hpBefore: 30, hpAfter: 14 },
        });
        const dragon = rowOf(yield* rowsOf(table, fight), fight.dragon.id);
        expect([dragon.legendarySpent, dragon.actionUsed, dragon.reactionUsed]).toEqual([
          1,
          false,
          false,
        ]);
      }),
    );

    it.effect(
      "breathes fire: rolls the damage once, a monster's save halves it, a player's waits",
      () =>
        Effect.gen(function* () {
          const table = yield* Fixture;
          const fight = yield* aFight(table, { first: "dragon" });
          // The cone from the dragon toward the goblin catches Brannoc beside it.
          const turnId = yield* proposed(table, fight, fight.dragon, { moment: "turn" }, [
            { option: "actions/Fire Breath", square: { column: 5, row: 5 } },
          ]);
          faces.length = 0;
          roll(6, ...Array.from({ length: 18 }, () => 1));
          // The goblin's Dexterity save: 18 + 2, against DC 21.
          roll(20, 19);
          const outcome = yield* kept(table, fight, turnId);
          const breath = optionStep(outcome, 0);
          expect(breath.save).toMatchObject({ dc: 21, ability: "DEX", onSuccess: "half" });
          expect(breath.save?.damage.map((rolled) => rolled.total)).toEqual([18]);
          const byName = Object.fromEntries(
            (breath.save?.targets ?? []).map((target) => [target.target.name, target]),
          );
          expect(byName["Ash Goblin"]).toMatchObject({
            roll: { d20: 19, modifier: 2, total: 21 },
            succeeded: true,
            hit: { amount: 9, hpBefore: 20, hpAfter: 11, dropped: false },
          });
          // Hob never rolls for a player: the save waits on the DM.
          expect(byName["Brannoc"]).toMatchObject({
            target: { combatantId: fight.hero.id, name: "Brannoc" },
            roll: null,
            succeeded: null,
          });
          const pendingSaveId = byName["Brannoc"]!.pendingSaveId!;
          // The pending save says it waits; no note that would outlive it.
          expect(breath.notes.join("\n")).not.toMatch(/Brannoc/);

          const rows = yield* rowsOf(table, fight);
          expect(rowOf(rows, fight.hero.id).hpCurrent).toBe(30);
          expect(rowOf(rows, fight.dragon.id).rechargeSpent).toEqual(["actions/Fire Breath"]);
          const written = yield* writtenBy(turnId);
          expect(written.rolls.map((row) => row.kind)).toEqual(["damage", "save"]);

          // The DM reads the save and enters Brannoc's total: 22 against DC 21,
          // so half of the 18.
          const saves = yield* as(table.dm.token, (client) =>
            client.hobFight.saves({ params: fight.params }),
          );
          expect(saves).toEqual([
            {
              id: pendingSaveId,
              turnId,
              combatantId: fight.hero.id,
              targetName: "Brannoc",
              optionName: "Fire Breath",
              ability: "DEX",
              dc: 21,
              onSuccess: "half",
              amount: 18,
              damageTypes: ["Fire"],
              state: "pending",
              total: null,
              succeeded: null,
            },
          ]);
          const resolve = (who: Person, total: number) =>
            refusal(who.token, (client) =>
              client.hobFight.resolveSave({
                params: { ...fight.params, saveId: pendingSaveId },
                payload: { total },
              }),
            );
          expect((yield* resolve(table.player, 22)).tag).toBe("NotFound");
          const resolved = yield* as(table.dm.token, (client) =>
            client.hobFight.resolveSave({
              params: { ...fight.params, saveId: pendingSaveId },
              payload: { total: 22 },
            }),
          );
          expect(resolved).toMatchObject({
            save: { state: "resolved", total: 22, succeeded: true },
            hit: { amount: 9, hpBefore: 30, hpAfter: 21, dropped: false },
            judged: false,
          });
          expect(rowOf(yield* rowsOf(table, fight), fight.hero.id).hpCurrent).toBe(21);
          // Stamped with the turn the save belongs to, and the turn's snapshot
          // of Brannoc moved with it.
          const after = yield* writtenBy(turnId);
          expect(after.events.filter((row) => row.kind === "combatant-damaged")).toHaveLength(2);
          expect(yield* snapshotHp(turnId, fight.hero.id)).toBe(21);
          expect(yield* resolve(table.dm, 22)).toEqual({
            tag: "Conflict",
            message: "That save was already resolved.",
          });
        }),
    );

    it.effect("lapses a save still pending when the fight ends, and applies nothing", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table, { first: "dragon" });
        const turnId = yield* proposed(table, fight, fight.dragon, { moment: "turn" }, [
          { option: "actions/Fire Breath", square: { column: 5, row: 5 } },
        ]);
        faces.length = 0;
        roll(6, ...Array.from({ length: 18 }, () => 2));
        roll(20, 2);
        const outcome = yield* kept(table, fight, turnId);
        const pending = optionStep(outcome, 0).save!.targets.find(
          (target) => target.target.name === "Brannoc",
        )!.pendingSaveId!;
        yield* as(table.dm.token, (client) =>
          client.runs.end({ params: fight.params, payload: {} }),
        );
        const saves = yield* as(table.dm.token, (client) =>
          client.hobFight.saves({ params: fight.params }),
        );
        expect(saves.map((save) => save.state)).toEqual(["lapsed"]);
        expect(
          yield* refusal(table.dm.token, (client) =>
            client.hobFight.resolveSave({
              params: { ...fight.params, saveId: pending },
              payload: { total: 1 },
            }),
          ),
        ).toEqual({ tag: "Conflict", message: "That save lapsed: its damage was never applied." });
        expect(rowOf(yield* rowsOf(table, fight), fight.hero.id).hpCurrent).toBe(30);
      }),
    );

    it.effect("casts a spell with a slot, at its range", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table, { first: "priest" });
        const turnId = yield* proposed(table, fight, fight.priest, { moment: "turn" }, [
          { option: "spell/Spellcasting/Guiding Bolt", targets: [fight.place(fight.hero)] },
        ]);
        faces.length = 0;
        roll(20, 13);
        roll(6, 2, 2, 2, 2);
        const outcome = yield* kept(table, fight, turnId);
        expect(optionStep(outcome, 0).attacks[0]).toMatchObject({
          name: "Guiding Bolt",
          toHit: 5,
          total: 18,
          verdict: "hit",
          damage: [{ notation: "4d6", total: 8, type: "Radiant" }],
          hit: { amount: 8, hpAfter: 22 },
        });
        const priest = rowOf(yield* rowsOf(table, fight), fight.priest.id);
        expect(priest.slotsSpent).toEqual({ "slot/Spellcasting/1": 1 });
        expect(priest.actionUsed).toBe(true);
      }),
    );
  });

  describe("undo", () => {
    const undo = (who: Person, fight: Fight, turnId: AssistantTurnId) =>
      refusal(who.token, (client) =>
        client.hobFight.undo({ params: { ...fight.params, turnId }, payload: {} }),
      );
    /** The goblin's scimitar at Brannoc, kept: a 17 on the d20 and 4 slashing. */
    const goblinSwings = (table: Table, fight: Fight) =>
      Effect.gen(function* () {
        const turnId = yield* proposed(table, fight, fight.goblin, { moment: "turn" }, [
          { option: "actions/Scimitar", targets: [fight.place(fight.hero)] },
        ]);
        faces.length = 0;
        roll(20, 17);
        roll(6, 2);
        yield* kept(table, fight, turnId);
        return turnId;
      });

    it.effect("puts back every row as the turn found it, and keeps its rolls, marked", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table, { first: "dragon" });
        const before = yield* rowsOf(table, fight);
        const turnId = yield* proposed(table, fight, fight.dragon, { moment: "turn" }, [
          { option: "move", square: { column: 6, row: 6 } },
          { option: "actions/Multiattack", targets: [fight.place(fight.hero)] },
        ]);
        faces.length = 0;
        roll(20, 15);
        roll(10, 10, 10);
        roll(6, 1, 1);
        roll(20, 1);
        roll(20, 18);
        roll(6, 3, 3);
        yield* kept(table, fight, turnId);
        expect((yield* undo(table.player, fight, turnId)).tag).toBe("NotFound");

        const undone = yield* as(table.dm.token, (client) =>
          client.hobFight.undo({ params: { ...fight.params, turnId }, payload: {} }),
        );
        expect(undone.restored.map((row) => row.name)).toEqual(["Brannoc", "Cinder"]);
        const after = yield* rowsOf(table, fight);
        const pick = (row: Combatant) => [
          row.hpCurrent,
          [...row.conditions],
          row.deathSaves,
          row.position,
          row.feetMoved,
          row.actionUsed,
        ];
        for (const id of [fight.hero.id, fight.dragon.id]) {
          expect(pick(rowOf(after, id))).toEqual(pick(rowOf(before, id)));
        }
        const party = yield* as(table.dm.token, (client) =>
          client.party.list({ params: { campaignId: table.campaignId } }),
        );
        expect(JSON.stringify(party)).toContain('"hpCurrent":30');

        // The rolls stay, marked; the undo is the DM's own line.
        const sql = yield* SqlClient.SqlClient;
        const rolls = yield* sql<{ readonly undone: boolean }>`
          select undone_at is not null as undone from character_roll
          where assistant_turn_id = ${turnId}
        `.pipe(Effect.orDie);
        expect(rolls.length).toBe(6);
        expect(rolls.every((row) => row.undone)).toBe(true);
        const lines = yield* sql<{ readonly kind: string; readonly origin: string }>`
          select kind, origin from session_event
          where encounter_run_id = ${fight.params.runId} and kind = 'hob-turn-undone'
        `.pipe(Effect.orDie);
        expect(lines).toEqual([{ kind: "hob-turn-undone", origin: "authored" }]);
        const keptTurns = yield* as(table.dm.token, (client) =>
          client.hobFight.kept({ params: fight.params }),
        );
        expect(keptTurns.map((turn) => [turn.outcome.turnId, turn.undoneAt !== null])).toEqual([
          [turnId, true],
        ]);
        expect(yield* undo(table.dm, fight, turnId)).toEqual({
          tag: "Conflict",
          message: "That turn was already undone.",
        });
      }),
    );

    it.effect("refuses a row that has moved since, naming it, and writes nothing", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table);
        const turnId = yield* goblinSwings(table, fight);
        yield* as(table.dm.token, (client) =>
          client.combatants.damage({
            params: { ...fight.params, combatantId: fight.hero.id },
            payload: { amount: 1 },
          }),
        );
        const before = yield* writesIn(fight);
        expect(yield* undo(table.dm, fight, turnId)).toEqual({
          tag: "Conflict",
          message:
            "That turn can't be undone, because something has moved since: Brannoc's hit points. " +
            "Put it right by hand.",
        });
        expect(yield* writesIn(fight)).toEqual(before);
        expect(rowOf(yield* rowsOf(table, fight), fight.hero.id).hpCurrent).toBe(25);
      }),
    );

    it.effect("takes back only the latest kept turn", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table);
        const swing = yield* goblinSwings(table, fight);
        const lash = yield* proposed(table, fight, fight.dragon, { moment: "legendary" }, [
          { option: "legendaryActions/Tail Attack>Tail", targets: [fight.place(fight.hero)] },
        ]);
        faces.length = 0;
        roll(20, 1);
        yield* kept(table, fight, lash);
        expect(yield* undo(table.dm, fight, swing)).toEqual({
          tag: "Conflict",
          message: "Only the latest Hob turn can be undone.",
        });
        expect((yield* undo(table.dm, fight, lash)).tag).toBe("succeeded");
        expect((yield* undo(table.dm, fight, swing)).tag).toBe("succeeded");
        expect(rowOf(yield* rowsOf(table, fight), fight.hero.id).hpCurrent).toBe(30);
      }),
    );

    it.effect("undoes a resolved save with its turn, and lapses one still pending", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table, { first: "dragon" });
        const turnId = yield* proposed(table, fight, fight.dragon, { moment: "turn" }, [
          { option: "actions/Fire Breath", square: { column: 5, row: 5 } },
        ]);
        faces.length = 0;
        roll(6, ...Array.from({ length: 18 }, () => 1));
        roll(20, 1);
        const outcome = yield* kept(table, fight, turnId);
        const pending = optionStep(outcome, 0).save!.targets.find(
          (target) => target.target.name === "Brannoc",
        )!.pendingSaveId!;
        yield* as(table.dm.token, (client) =>
          client.hobFight.resolveSave({
            params: { ...fight.params, saveId: pending },
            payload: { total: 3 },
          }),
        );
        expect(rowOf(yield* rowsOf(table, fight), fight.hero.id).hpCurrent).toBe(12);
        // The resolved save moved the snapshot, so the undo still stands.
        expect((yield* undo(table.dm, fight, turnId)).tag).toBe("succeeded");
        const rows = yield* rowsOf(table, fight);
        expect(rowOf(rows, fight.hero.id).hpCurrent).toBe(30);
        expect(rowOf(rows, fight.goblin.id).hpCurrent).toBe(20);
        expect(rowOf(rows, fight.dragon.id).rechargeSpent).toEqual([]);

        // A save still pending when its turn is undone lapses.
        const again = yield* aFight(table, { first: "dragon" });
        const second = yield* proposed(table, again, again.dragon, { moment: "turn" }, [
          { option: "actions/Fire Breath", square: { column: 5, row: 5 } },
        ]);
        faces.length = 0;
        roll(6, ...Array.from({ length: 18 }, () => 1));
        roll(20, 1);
        yield* kept(table, again, second);
        yield* as(table.dm.token, (client) =>
          client.hobFight.undo({ params: { ...again.params, turnId: second }, payload: {} }),
        );
        const saves = yield* as(table.dm.token, (client) =>
          client.hobFight.saves({ params: again.params }),
        );
        expect(saves.map((save) => save.state)).toEqual(["lapsed"]);
      }),
    );
  });

  describe("the narration", () => {
    const narrated = (options: FightOptions) =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table, options);
        const turnId = yield* proposed(
          table,
          fight,
          fight.goblin,
          { moment: "turn" },
          [{ option: "standard/Dodge" }],
          "The goblin ducks behind its shield.",
        );
        yield* kept(table, fight, turnId);
        const written = yield* writtenBy(turnId);
        // What the seated player's table carries, byte for byte.
        const heard = yield* rawBody(table.player.token, `/campaigns/${table.campaignId}/table`);
        expect(heard.status).toBe(200);
        return {
          line: written.events.find((row) => row.kind === "hob-turn-kept"),
          heard: heard.text,
          table,
          fight,
          turnId,
        };
      });
    const NARRATED = "The goblin ducks behind its shield.";

    it.effect("is shared when a player could see the creature act, and on their table", () =>
      Effect.gen(function* () {
        const { line, heard, table, fight, turnId } = yield* narrated({ shown: ["goblin"] });
        const fightRead = (JSON.parse(heard) as { fight: { narration: unknown } }).fight;
        expect(fightRead.narration).toEqual([
          {
            id: expect.any(String),
            combatantName: "Ash Goblin",
            text: NARRATED,
            // It said nothing aloud.
            said: null,
            round: 1,
          },
        ]);
        // Undone, the line leaves the table with the turn.
        yield* as(table.dm.token, (client) =>
          client.hobFight.undo({ params: { ...fight.params, turnId }, payload: {} }),
        );
        const after = yield* rawBody(table.player.token, `/campaigns/${table.campaignId}/table`);
        expect(after.text).not.toContain(NARRATED);
        expect(line).toMatchObject({
          visibility: "shared",
          origin: "assistant",
          payload: {
            narration: "The goblin ducks behind its shield.",
            combatantName: "Ash Goblin",
            moment: "turn",
          },
        });
      }),
    );

    it.effect("stays the DM's for a hidden creature, and for one under fog", () =>
      Effect.gen(function* () {
        const hidden = yield* narrated({});
        expect(hidden.line?.visibility).toBe("dm");
        expect(hidden.heard).not.toContain(NARRATED);
        const fogged = yield* narrated({ shown: ["goblin"], fog: [[5, 5]] });
        expect(fogged.line?.visibility).toBe("dm");
        expect(fogged.heard).not.toContain(NARRATED);
      }),
    );
  });

  describe("the refused paths", () => {
    it.effect("is NotFound to a player, and writes nothing", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table);
        const turnId = yield* proposed(table, fight, fight.goblin, { moment: "turn" }, [
          { option: "actions/Scimitar", targets: [fight.place(fight.hero)] },
        ]);
        const before = yield* writesIn(fight);
        expect((yield* keep(table.player, fight, turnId)).tag).toBe("NotFound");
        expect(yield* writesIn(fight)).toEqual(before);
      }),
    );

    it.effect("keeps a turn once: a second keep is a Conflict and rolls nothing", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table);
        const turnId = yield* proposed(table, fight, fight.goblin, { moment: "turn" }, [
          { option: "actions/Scimitar", targets: [fight.place(fight.hero)] },
        ]);
        faces.length = 0;
        roll(20, 3);
        const [first, second] = yield* Effect.all(
          [keep(table.dm, fight, turnId), keep(table.dm, fight, turnId)],
          { concurrency: "unbounded" },
        );
        expect([first.tag, second.tag].sort()).toEqual(["Conflict", "succeeded"]);
        expect([first, second].find((result) => result.tag === "Conflict")?.message).toBe(
          "That turn was already kept.",
        );
        expect((yield* writtenBy(turnId)).rolls).toHaveLength(1);
      }),
    );

    it.effect("refuses a turn the fight has moved past, and writes nothing", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table);
        const stale = yield* proposed(table, fight, fight.goblin, { moment: "turn" }, [
          { option: "actions/Scimitar", targets: [fight.place(fight.hero)] },
        ]);
        // The DM spends the goblin's action by hand.
        yield* as(table.dm.token, (client) =>
          client.combatants.turn({
            params: { ...fight.params, combatantId: fight.goblin.id },
            payload: { actionUsed: true },
          }),
        );
        const before = yield* writesIn(fight);
        expect(yield* keep(table.dm, fight, stale)).toEqual({
          tag: "Conflict",
          message: "The fight has changed since Hob proposed that turn. Ask Hob again.",
        });
        expect(yield* writesIn(fight)).toEqual(before);

        // And one whose creature has died since.
        const fresh = yield* aFight(table);
        const doomed = yield* proposed(table, fresh, fresh.goblin, { moment: "turn" }, [
          { option: "actions/Scimitar", targets: [fresh.place(fresh.hero)] },
        ]);
        yield* as(table.dm.token, (client) =>
          client.combatants.damage({
            params: { ...fresh.params, combatantId: fresh.goblin.id },
            payload: { amount: 50 },
          }),
        );
        expect((yield* keep(table.dm, fresh, doomed)).tag).toBe("Conflict");
        const goblin = rowOf(yield* rowsOf(table, fresh), fresh.goblin.id);
        expect(goblin.actionUsed).toBe(false);
      }),
    );

    it.effect("refuses a discarded proposal", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table);
        const turnId = yield* proposed(table, fight, fight.goblin, { moment: "turn" }, [
          { option: "standard/Dodge" },
        ]);
        const thread = yield* as(table.dm.token, (client) =>
          client.hobFight.thread({ params: fight.params }),
        );
        yield* as(table.dm.token, (client) =>
          client.hob.discard({
            params: { campaignId: table.campaignId, threadId: thread.id, turnId },
            payload: {},
          }),
        );
        expect(yield* keep(table.dm, fight, turnId)).toEqual({
          tag: "Conflict",
          message: "that was discarded",
        });
      }),
    );
  });
});
