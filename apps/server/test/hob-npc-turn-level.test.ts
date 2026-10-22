import { describe, expect } from "@effect/vitest";
import {
  type AssistantTurnId,
  type Combatant,
  CurrentActor,
  type HobEvent,
  type LevelAmbient,
  LEVEL_MATERIALS,
  type LevelSave,
  LevelPartId,
  type NpcTurnOutcome,
  type StatBlock,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer, Schema, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { transformedMonster } from "../src/bestiary/import.js";
import { MONSTER_RAW } from "../src/bestiary/systemMonsters.js";
import { Dice } from "../src/live/Dice.js";
import { Creatures } from "../src/repo/Creatures.js";
import { aCharacterAt, admittedTo, aPerson, type Person } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import {
  type ChatRequest,
  type Round,
  scriptedModel,
  textChunks,
  toolCallChunks,
} from "./support/model.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A monster's turn on a level sees and walks by the level** — the fight
 * toolkit's options, `proposeNpcTurn`'s check and the keep — over the real
 * application and Postgres, with real actors, the model scripted and the
 * server's dice scripted. The claims:
 *
 * - a target behind **total cover** is not among the monster's targets: the
 *   prompt says so and a shot at it is refused in words;
 * - a target **in the dark** is not seen by a monster with no darkvision, and
 *   is by one whose darkvision reaches it; a target that cannot see the
 *   attacker back is attacked at **advantage**, by the server's dice;
 * - **cover** adds to the AC a kept attack rolls against, and says so;
 * - a **move through a wall** is refused, and a kept move's feet are the
 *   walk's, **difficult terrain at double**; so are the DM's own moves.
 */
const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-level-turn", maxTokens: 512, rounds: script });

const faces: Array<number> = [];
const roll = (sides: number, ...rolled: ReadonlyArray<number>) => {
  for (const face of rolled) faces.push((face - 1) / sides + 0.000_001);
};
const dice = Dice.fixed(() => {
  const next = faces.shift();
  if (next === undefined) throw new Error("the server rolled more dice than the test scripted");
  return next;
});

const database = migratedDatabase("taverns_test_hob_npc_turn_level");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-level-turn" }).pipe(Layer.provide(model.layer)),
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

const FLAGSTONE = LEVEL_MATERIALS.indexOf("flagstone");
const WATER = LEVEL_MATERIALS.indexOf("water");
const COLUMNS = 20;
const ROWS = 12;

let parts = 0;
const part = () =>
  Schema.decodeSync(LevelPartId)(
    `1e7e3000-0000-4000-8000-${String((parts += 1)).padStart(12, "0")}`,
  );

/** A wall down x = 10 from top to bottom: nothing sees, shoots or walks past it. */
const divide = () => [
  {
    id: part(),
    x1: 10,
    y1: 0,
    x2: 10,
    y2: ROWS,
    kind: "wall" as const,
    doorState: null,
    low: false,
  },
];

interface LevelParts {
  readonly ambient?: LevelAmbient;
  readonly walls?: LevelSave["walls"];
  readonly props?: LevelSave["props"];
  /** Columns of water, every row. */
  readonly water?: ReadonlyArray<number>;
}

const aTable = Effect.gen(function* () {
  const dm = yield* aPerson("Level DM");
  const campaignId = (yield* as(dm.token, (client) =>
    client.campaigns.create({ payload: { name: "The Under-Ford", visibility: "shared" } }),
  )).id;
  const player = yield* aPerson("Level player");
  const admitted = yield* admittedTo(campaignId, player.actor, "Player");
  yield* aCharacterAt(
    campaignId,
    admitted,
    { name: "Brannoc", hpMax: 30, ac: 14 },
    { seatVisibility: "shared" },
  );
  const goblin = yield* libraryCreature(dm, "Ash Goblin", srd("Goblin"));
  const bandit = yield* libraryCreature(dm, "Reed Captain", srd("Bandit Captain"));
  return {
    dm,
    campaignId,
    creatures: { goblin: goblin.id, bandit: bandit.id },
    nights: { count: 0 },
  };
});
type Table = Effect.Success<typeof aTable>;

/**
 * A fight on a fresh level and a fresh night: the goblin at (5,5), the
 * bandit captain at (5,8) and Brannoc where the case puts him, placed while
 * initiative is rolled, then `first` up.
 */
const aFight = (
  table: Table,
  level: LevelParts,
  brannoc: readonly [number, number],
  first: "goblin" | "bandit" = "goblin",
) =>
  Effect.gen(function* () {
    const { dm, campaignId } = table;
    const made = yield* as(dm.token, (client) =>
      client.libraryLevels.create({ payload: { name: "Ford", columns: COLUMNS, rows: ROWS } }),
    );
    const saved = yield* as(dm.token, (client) =>
      client.libraryLevels.save({
        params: { levelId: made.id },
        payload: {
          name: "Ford",
          description: null,
          columns: COLUMNS,
          rows: ROWS,
          feetPerCell: 5,
          ambient: level.ambient ?? "bright",
          floor: Array.from({ length: COLUMNS * ROWS }, (_, at) =>
            (level.water ?? []).includes(at % COLUMNS) ? WATER : FLAGSTONE,
          ),
          walls: level.walls ?? [],
          props: level.props ?? [],
          lights: [],
          regions: [],
          version: made.version,
        },
      }),
    );
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
          name: `Ford ${String(table.nights.count)}`,
          visibility: "shared",
          ready: true,
          levelId: saved.id,
          creatures: [
            { creatureId: table.creatures.goblin, count: 1 },
            { creatureId: table.creatures.bandit, count: 1 },
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
    const goblin = seeded.find((row) => row.displayName === "Ash Goblin")!;
    const bandit = seeded.find((row) => row.displayName === "Reed Captain")!;
    const hero = seeded.find((row) => row.kind === "pc")!;
    yield* as(dm.token, (client) =>
      client.combatants.damage({
        params: { ...params, combatantId: hero.id },
        payload: { amount: -100 },
      }),
    );
    // Out of the way first, so nobody's start square is taken.
    for (const [row, column, line] of [
      [goblin, 0, 0],
      [bandit, 0, 1],
      [hero, 0, 2],
      [goblin, 5, 5],
      [bandit, 5, 8],
      [hero, brannoc[0], brannoc[1]],
    ] as const) {
      yield* as(dm.token, (client) =>
        client.combatants.move({
          params: { ...params, combatantId: row.id },
          payload: { position: { column, row: line } },
        }),
      );
    }
    yield* as(dm.token, (client) =>
      client.runs.setInitiative({
        params,
        payload: {
          entries: [
            { combatantId: goblin.id, initiative: first === "goblin" ? 20 : 15 },
            { combatantId: bandit.id, initiative: first === "bandit" ? 20 : 14 },
            { combatantId: hero.id, initiative: 10 },
          ],
        },
      }),
    );
    yield* as(dm.token, (client) => client.runs.begin({ params, payload: {} }));
    const order = yield* as(dm.token, (client) => client.combatants.list({ params }));
    const place = (row: Pick<Combatant, "id">) =>
      order.findIndex((other) => other.id === row.id) + 1;
    return { params, goblin, bandit, hero, place };
  });
type Fight = Effect.Success<ReturnType<typeof aFight>>;

/** Ask for one combatant's turn with these rounds scripted. */
const askTurn = (
  table: Table,
  fight: Fight,
  combatant: Pick<Combatant, "id">,
  rounds: ReadonlyArray<Round>,
) =>
  Effect.gen(function* () {
    const before = model.requests().length;
    script.length = before;
    script.push(...rounds);
    const events = yield* as(table.dm.token, (client) =>
      Effect.flatMap(
        client.hobFight.turn({
          params: { ...fight.params, combatantId: combatant.id },
          payload: { moment: "turn" },
        }),
        (stream) => Stream.runCollect(stream),
      ),
    );
    return {
      events: Array.from(events) as ReadonlyArray<HobEvent>,
      requests: model.requests().slice(before) as ReadonlyArray<ChatRequest>,
    };
  });

const proposedIn = (events: ReadonlyArray<HobEvent>) =>
  events.find((event) => event.event === "proposal");

const promptOf = (requests: ReadonlyArray<ChatRequest>): string =>
  JSON.stringify(requests[0]?.messages ?? []);

const toolAnswers = (requests: ReadonlyArray<ChatRequest>): string =>
  requests
    .flatMap((request) =>
      (request.messages ?? [])
        .filter((message) => message.role === "tool")
        .map((message) => String(message.content)),
    )
    .join("\n");

/** Ask, expecting an offer; answers the turn that holds it. */
const proposed = (
  table: Table,
  fight: Fight,
  combatant: Pick<Combatant, "id">,
  steps: ReadonlyArray<Record<string, unknown>>,
) =>
  Effect.gen(function* () {
    const { events } = yield* askTurn(table, fight, combatant, [
      toolCallChunks("proposeNpcTurn", { steps, narration: "The goblin moves." }),
    ]);
    if (proposedIn(events) === undefined) {
      throw new Error(`no proposal: ${JSON.stringify(events.at(-1))}`);
    }
    const began = events.find((event) => event.event === "began");
    if (began?.event !== "began") throw new Error("no began event");
    return began.data.turnId as AssistantTurnId;
  });

/** Ask, expecting the steps refused; answers what the tool told the model. */
const refusedTurn = (
  table: Table,
  fight: Fight,
  combatant: Pick<Combatant, "id">,
  steps: ReadonlyArray<Record<string, unknown>>,
) =>
  Effect.gen(function* () {
    const { events, requests } = yield* askTurn(table, fight, combatant, [
      toolCallChunks("proposeNpcTurn", { steps, narration: "It tries." }),
      textChunks("It waits."),
    ]);
    expect(proposedIn(events)).toBeUndefined();
    return { answered: toolAnswers(requests), prompt: promptOf(requests) };
  });

const kept = (table: Table, fight: Fight, turnId: AssistantTurnId) =>
  as(table.dm.token, (client) =>
    client.hobFight.keep({ params: { ...fight.params, turnId }, payload: {} }),
  );

const attackRolls = (turnId: AssistantTurnId) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) =>
      sql<{
        readonly mode: string;
        readonly dice: ReadonlyArray<number>;
        readonly target_ac: number;
      }>`
      select mode, dice, target_ac from character_roll
      where assistant_turn_id = ${turnId} and kind = 'attack' order by created_at, id
    `,
  ).pipe(Effect.orDie);

const optionStep = (outcome: NpcTurnOutcome, index: number) => {
  const step = outcome.steps[index];
  if (step?.kind !== "option") throw new Error(`step ${String(index)} is not an option`);
  return step;
};

const rowNow = (table: Table, fight: Fight, id: string) =>
  Effect.map(
    as(table.dm.token, (client) => client.combatants.list({ params: fight.params })),
    (rows) => rows.find((row) => row.id === id)!,
  );

class Fixture extends Context.Service<Fixture, Table>()("hob-npc-turn-level.test/Fixture") {}
const shared = Layer.effect(Fixture)(aTable).pipe(Layer.provideMerge(application));

describeLayer("hob-npc-turn-level", shared, (it) => {
  describe("what a monster may target", () => {
    it.effect("leaves a target behind total cover out, and refuses a shot at it", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table, { walls: divide() }, [14, 5]);
        const { answered, prompt } = yield* refusedTurn(table, fight, fight.goblin, [
          { option: "actions/Shortbow", targets: [fight.place(fight.hero)] },
        ]);
        expect(prompt).toMatch(/Cannot target now: [^.]*Brannoc[^.]*\(total cover\)/);
        expect(answered).toMatch(/has total cover from it and cannot be targeted/);
      }),
    );

    it.effect("does not see a target in the dark without darkvision", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table, { ambient: "dark" }, [9, 8], "bandit");
        const { answered, prompt } = yield* refusedTurn(table, fight, fight.bandit, [
          { option: "actions/Scimitar", targets: [fight.place(fight.hero)] },
        ]);
        expect(prompt).toContain("it sees by light alone");
        expect(prompt).toMatch(/Cannot target now: [^.]*Brannoc[^.]*\(out of sight\)/);
        expect(answered).toMatch(/out of its sight/);
      }),
    );

    it.effect("sees it by darkvision, and attacks at advantage one that cannot see it back", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table, { ambient: "dark" }, [9, 5]);
        const turnId = yield* proposed(table, fight, fight.goblin, [
          { option: "actions/Shortbow", targets: [fight.place(fight.hero)] },
        ]);
        faces.length = 0;
        // Two d20s at advantage, the 17 kept: 21 hits AC 14; 1d6+2 is 6.
        roll(20, 3, 17);
        roll(6, 4);
        const outcome = yield* kept(table, fight, turnId);
        const step = optionStep(outcome, 0);
        expect(step.attacks[0]).toMatchObject({ mode: "advantage", d20: 17, verdict: "hit" });
        expect(step.notes.join(" ")).toMatch(
          /could not see Ash Goblin: Shortbow was rolled at advantage/,
        );
        const [rolled] = yield* attackRolls(turnId);
        expect(rolled).toMatchObject({ mode: "advantage", dice: [3, 17], target_ac: 14 });
      }),
    );

    it.effect("adds a target's cover to the AC a kept attack rolls against", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const crate = {
          id: part(),
          kind: "crate" as const,
          x: 7,
          y: 5,
          rotation: 0 as const,
          blocksMovement: null,
          blocksSight: null,
          cover: null,
          difficult: null,
          dmOnly: false,
        };
        const fight = yield* aFight(table, { props: [crate] }, [9, 5]);
        const turnId = yield* proposed(table, fight, fight.goblin, [
          { option: "actions/Shortbow", targets: [fight.place(fight.hero)] },
        ]);
        faces.length = 0;
        // 11 + 4 = 15: a hit on AC 14, a miss on 16.
        roll(20, 11);
        const outcome = yield* kept(table, fight, turnId);
        const step = optionStep(outcome, 0);
        expect(step.attacks[0]).toMatchObject({ ac: 16, total: 15, verdict: "miss" });
        expect(step.notes).toContain("Brannoc: Half cover: +2 AC.");
        const [rolled] = yield* attackRolls(turnId);
        expect(rolled?.target_ac).toBe(16);
      }),
    );
  });

  describe("how a monster walks", () => {
    it.effect("refuses a move through a wall", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table, { walls: divide() }, [3, 3]);
        const { answered, prompt } = yield* refusedTurn(table, fight, fight.goblin, [
          { option: "move", square: { column: 11, row: 5 } },
        ]);
        expect(prompt).toContain("A move must be walkable round walls");
        expect(answered).toMatch(/\(11,5\) is not a square it can move to .*walled off/);
      }),
    );

    it.effect("counts a kept move's feet by the walk, difficult terrain at double", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table, { water: [6] }, [12, 5]);
        const turnId = yield* proposed(table, fight, fight.goblin, [
          { option: "move", square: { column: 7, row: 5 } },
        ]);
        const outcome = yield* kept(table, fight, turnId);
        // Into the water 10, out of it 5: not the straight 10.
        expect(outcome.steps[0]).toEqual({ kind: "move", to: { column: 7, row: 5 }, feet: 15 });
        expect((yield* rowNow(table, fight, fight.goblin.id)).feetMoved).toBe(15);
      }),
    );

    it.effect("counts the DM's own move on a level by the walk too", () =>
      Effect.gen(function* () {
        const table = yield* Fixture;
        const fight = yield* aFight(table, { water: [6] }, [12, 5]);
        yield* as(table.dm.token, (client) =>
          client.combatants.move({
            params: { ...fight.params, combatantId: fight.goblin.id },
            payload: { position: { column: 7, row: 5 } },
          }),
        );
        expect((yield* rowNow(table, fight, fight.goblin.id)).feetMoved).toBe(15);
      }),
    );
  });
});
