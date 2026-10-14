import { describe, expect } from "@effect/vitest";
import {
  type Combatant,
  type HobEvent,
  type StatBlock,
  TavernsApi,
  CurrentActor,
} from "@taverns/api";
import { Context, Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { transformedMonster } from "../src/bestiary/import.js";
import { MONSTER_RAW } from "../src/bestiary/systemMonsters.js";
import { Creatures } from "../src/repo/Creatures.js";
import { TableFight } from "../src/repo/TableFight.js";
import { aCharacterAt, admittedTo, aPerson } from "./support/actors.js";
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
 * **Hob playing a member of the Cast in a fight, as itself** — the persona in
 * the fight prompt (`fightPersona.ts`) and the line it says aloud
 * (`proposeNpcTurn`'s `line`), over the real application with real actors and
 * only the model scripted. The claims:
 *
 * - the DM's fight prompt carries the NPC's public persona, the DM's attitude
 *   and the DM's instructions for play, and **never its secret or its prep's
 *   whereabouts**;
 * - a kept turn's spoken line reaches the player's table under the
 *   narration's rule, and no byte of the NPC's private material or prep does,
 *   on the table or in a request the player's own Hob sends;
 * - an archived NPC is played as its stat block.
 */
const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-cast", maxTokens: 512, rounds: script });

const database = migratedDatabase("taverns_test_hob_cast_npc_turn");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-cast" }).pipe(Layer.provide(model.layer)),
);
const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(services),
  Layer.provideMerge(TableFight.unsigned),
  Layer.provideMerge(database),
);

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });
type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(token), call).pipe(Effect.orDie);

const raw = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

const SECRET = "SENTINEL-SILDAR-REPORTS-TO-THE-BLACK-SPIDER";
const WHEREABOUTS = "SENTINEL-UNDER-THE-MILL";
const INSTRUCTIONS =
  "Plays it safe and shields the weakest; never retreats while a friend is down.";
const LINE = "For Neverwinter!";

const srdGoblin = (() => {
  const row = (MONSTER_RAW as ReadonlyArray<Record<string, unknown>>).find(
    (monster) => monster.name === "Goblin",
  );
  if (row === undefined) throw new Error("no SRD Goblin");
  return transformedMonster(row).statBlock as StatBlock;
})();

const makeFixture = Effect.gen(function* () {
  const dm = yield* aPerson("Cast DM");
  const player = yield* aPerson("Cast player");
  const campaignId = (yield* as(dm.token, (client) =>
    client.campaigns.create({ payload: { name: "Phandalin", visibility: "shared" } }),
  )).id;
  const admitted = yield* admittedTo(campaignId, player.actor, "Player");
  yield* aCharacterAt(
    campaignId,
    admitted,
    { name: "Brannoc", hpMax: 30 },
    { seatVisibility: "shared" },
  );
  const goblin = yield* Effect.flatMap(Creatures, (creatures) =>
    creatures.libraryCreate({
      name: "Cragmaw Goblin",
      type: "Humanoid",
      cr: "1/4",
      ac: 15,
      hp: 7,
      statBlock: srdGoblin,
    }),
  ).pipe(Effect.provideService(CurrentActor, dm.actor), Effect.orDie);
  const sildar = yield* as(dm.token, (client) =>
    client.npcs.create({
      params: { campaignId },
      payload: {
        name: "Sildar Hallwinter",
        role: "Agent of the Lords' Alliance",
        persona: {
          identity: { pronouns: "he/him", summary: "A grey-haired soldier sworn to order." },
          voice: { manner: "Clipped and soldierly.", phrases: ["Steady, now"] },
          intent: { wants: "Find Gundren alive.", fears: "Another ambush on the road." },
        },
        privateMaterial: { secrets: SECRET, instructions: INSTRUCTIONS },
      },
    }),
  );
  yield* as(dm.token, (client) =>
    client.npcs.updatePrep({
      params: { campaignId, npcId: sildar.id },
      payload: { attitude: "friendly", whereabouts: WHEREABOUTS },
    }),
  );
  return { dm, player, campaignId, goblin: goblin.id, sildar, nights: { count: 0 } };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob-cast-npc-turn.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

/**
 * A fight on a fresh night: Sildar, fighting as a goblin on the party's side,
 * up first at (5,5), the goblin he faces at (6,5) and Brannoc at (5,6). Every
 * row shared, so what Sildar does is the table's to hear.
 */
const aFight = Effect.gen(function* () {
  const { dm, campaignId, goblin, sildar, nights } = yield* Fixture;
  nights.count += 1;
  const session = yield* as(dm.token, (client) =>
    client.sessions.create({
      params: { campaignId },
      payload: { number: nights.count, visibility: "shared" },
    }),
  );
  yield* as(dm.token, (client) =>
    client.campaigns.update({ params: { campaignId }, payload: { currentSessionId: session.id } }),
  );
  const encounter = yield* as(dm.token, (client) =>
    client.encounters.create({
      params: { campaignId },
      payload: {
        name: `Cragmaw ambush ${String(nights.count)}`,
        visibility: "shared",
        ready: true,
        creatures: [
          { creatureId: goblin, count: 1 },
          { creatureId: goblin, npcId: sildar.id, count: 1, side: "party" },
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
  const him = seeded.find((row) => row.npcId === sildar.id)!;
  const foe = seeded.find((row) => row.kind === "npc" && row.npcId === null)!;
  const hero = seeded.find((row) => row.kind === "pc")!;
  for (const [row, column, line] of [
    [him, 5, 5],
    [foe, 6, 5],
    [hero, 5, 6],
  ] as const) {
    yield* as(dm.token, (client) =>
      client.combatants.update({
        params: { ...params, combatantId: row.id },
        payload: { visibility: "shared" },
      }),
    );
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
          { combatantId: him.id, initiative: 20 },
          { combatantId: foe.id, initiative: 15 },
          { combatantId: hero.id, initiative: 10 },
        ],
      },
    }),
  );
  yield* as(dm.token, (client) => client.runs.begin({ params, payload: {} }));
  const order = yield* as(dm.token, (client) => client.combatants.list({ params }));
  const place = (row: Combatant) => order.findIndex((other) => other.id === row.id) + 1;
  return { params, him, foe, hero, place };
});

const askTurn = (
  fight: Effect.Success<typeof aFight>,
  rounds: ReadonlyArray<Round>,
): Effect.Effect<
  { readonly events: ReadonlyArray<HobEvent>; readonly requests: ReadonlyArray<ChatRequest> },
  never,
  Fixture | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const { dm } = yield* Fixture;
    const before = model.requests().length;
    script.length = before;
    script.push(...rounds);
    const events = yield* as(dm.token, (client) =>
      Effect.flatMap(
        client.hobFight.turn({
          params: { ...fight.params, combatantId: fight.him.id },
          payload: { moment: "turn" },
        }),
        (stream) => Stream.runCollect(stream),
      ),
    );
    return { events: Array.from(events), requests: model.requests().slice(before) };
  });

const systemOf = (request: ChatRequest | undefined): string =>
  String((request?.messages ?? []).find((message) => message.role === "system")?.content ?? "");

const strike = (fight: Effect.Success<typeof aFight>, line?: string) =>
  toolCallChunks("proposeNpcTurn", {
    steps: [{ option: "actions/Scimitar", targets: [fight.place(fight.foe)] }],
    narration: "Sildar steps between Brannoc and the goblin and cuts low.",
    ...(line === undefined ? {} : { line }),
  });

describeLayer("hob-cast-npc-turn", shared, (it) => {
  describe("the DM's fight prompt", () => {
    it.effect(
      "plays the NPC in its persona, and carries no secret and no prep but its attitude",
      () =>
        Effect.gen(function* () {
          const fight = yield* aFight;
          const { events, requests } = yield* askTurn(fight, [strike(fight, LINE)]);
          const system = systemOf(requests[0]);
          expect(system).toContain("This creature is Sildar Hallwinter");
          expect(system).toContain("Agent of the Lords' Alliance");
          expect(system).toContain("How they talk: Clipped and soldierly.");
          expect(system).toContain('Phrases: "Steady, now"');
          expect(system).toContain("Wants: Find Gundren alive.");
          expect(system).toContain("Toward the party: friendly");
          expect(system).toContain(`The DM says to play them: ${INSTRUCTIONS}`);
          // He fights on the party's side: Brannoc is his ally.
          expect(system).toMatch(/creature on the party's side/);
          const everything = JSON.stringify(requests);
          expect(everything).not.toContain(SECRET);
          expect(everything).not.toContain(WHEREABOUTS);

          const proposed = events.find((event) => event.event === "proposal");
          expect(proposed?.event === "proposal" ? proposed.data.proposal : undefined).toMatchObject(
            {
              target: "npcTurn",
              line: LINE,
            },
          );
        }),
    );

    it.effect("plays an archived NPC as its stat block alone", () =>
      Effect.gen(function* () {
        const { dm, campaignId, sildar } = yield* Fixture;
        const fight = yield* aFight;
        yield* as(dm.token, (client) =>
          client.npcs.archive({ params: { campaignId, npcId: sildar.id }, payload: {} }),
        );
        const { requests } = yield* askTurn(fight, [strike(fight)]);
        yield* as(dm.token, (client) =>
          client.npcs.restore({ params: { campaignId, npcId: sildar.id }, payload: {} }),
        );
        const system = systemOf(requests[0]);
        expect(system).not.toContain("This creature is Sildar Hallwinter");
        expect(system).not.toContain(INSTRUCTIONS);
        expect(system).toContain('"Sildar Hallwinter"');
      }),
    );
  });

  describe("what the table hears", () => {
    it.effect("is the kept turn's narration and line, and nothing the NPC keeps to itself", () =>
      Effect.gen(function* () {
        const { dm, player, campaignId } = yield* Fixture;
        const fight = yield* aFight;
        const { events } = yield* askTurn(fight, [strike(fight, LINE)]);
        const began = events.find((event) => event.event === "began");
        if (began?.event !== "began") throw new Error("no began event");
        yield* as(dm.token, (client) =>
          client.hobFight.keep({
            params: { ...fight.params, turnId: began.data.turnId },
            payload: {},
          }),
        );

        const table = yield* as(player.token, (client) =>
          client.table.read({ params: { campaignId } }),
        );
        expect(table?.fight?.narration[0]).toMatchObject({
          combatantName: "Sildar Hallwinter",
          said: LINE,
        });
        const body = (yield* raw(player.token, `/campaigns/${campaignId}/table`)).body;
        for (const sentinel of [SECRET, WHEREABOUTS, INSTRUCTIONS]) {
          expect(body).not.toContain(sentinel);
        }
        expect(body).not.toContain('"npcId"');

        // The player's own Hob, asked about the fight: none of it reaches a request.
        const before = model.requests().length;
        script.length = before;
        script.push(textChunks("Sildar is holding the line."));
        yield* as(player.token, (client) =>
          Effect.flatMap(
            client.hob.ask({
              params: { campaignId },
              payload: { text: "What is Sildar up to, and what is he hiding?" },
            }),
            (stream) => Stream.runCollect(stream),
          ),
        );
        const asked = JSON.stringify(model.requests().slice(before));
        expect(asked.length).toBeGreaterThan(0);
        for (const sentinel of [SECRET, WHEREABOUTS, INSTRUCTIONS]) {
          expect(asked).not.toContain(sentinel);
        }
      }),
    );
  });
});
