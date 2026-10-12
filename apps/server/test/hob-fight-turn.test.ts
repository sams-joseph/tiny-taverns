import { describe, expect } from "@effect/vitest";
import {
  type AssistantTurnId,
  type Combatant,
  CurrentActor,
  type HobEvent,
  type HobFightAsk,
  type HobProposal,
  type StatBlock,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import {
  FightToolkit,
  HobToolkit,
  NO_VOCABULARY,
  playerToolkitOver,
  SharedWorldToolkit,
} from "../src/assistant/toolkit.js";
import { transformedMonster } from "../src/bestiary/import.js";
import { MONSTER_RAW } from "../src/bestiary/systemMonsters.js";
import { Creatures } from "../src/repo/Creatures.js";
import { TableFight } from "../src/repo/TableFight.js";
import { aCharacterAt, admittedTo, aPerson, asDm, type Person } from "./support/actors.js";
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
 * **Hob choosing a monster's turn** — `POST …/runs/:r/combatants/:id/hob/turn`,
 * the fight toolkit and `proposeNpcTurn` — over the real application, with
 * real actors and only the model scripted. The claims:
 *
 * - **a legal turn is offered in one round**, the fight bound into the prompt,
 *   resolved to combatant ids against a stamp of the state, saved in the
 *   fight's own thread and nowhere in the panel's list, and nothing in the
 *   fight changes;
 * - **every step is checked on the fight the steps before it leave**, and each
 *   refusal goes back to the model in words and ends the turn `unoffered`;
 * - **the endpoint refuses before the stream**: a player and another
 *   campaign's run are `NotFound`, Hob off is `HobUnavailable`, and a fight not
 *   taking turns, a player character and a moment that does not apply are
 *   `Conflict`;
 * - **no accept keeps one**, a discard turns it down, and the next ask hears it;
 * - **another fight's sentinel reaches no request byte.**
 */
const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-fight", maxTokens: 512, rounds: script });

const database = migratedDatabase("taverns_test_hob_fight_turn");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-fight" }).pipe(Layer.provide(model.layer)),
);
const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(services),
  // Hob's own read of a fight, which the stamp is checked against.
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

/** Planted in fights this file never asks about; must reach no request. */
const SENTINEL = "Quillvane-the-Unseen-7731";

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

/** A table: its DM, a seated player, and the creatures its fights are made of. */
const aTable = (name: string, monsters: { goblin: string; dragon: string }) =>
  Effect.gen(function* () {
    const dm = yield* aPerson(`${name} DM`);
    const campaignId = (yield* as(dm.token, (client) =>
      client.campaigns.create({ payload: { name, visibility: "shared" } }),
    )).id;
    const player = yield* aPerson(`${name} player`);
    const admitted = yield* admittedTo(campaignId, player.actor, "Player");
    yield* aCharacterAt(
      campaignId,
      admitted,
      { name: "Brannoc", hpMax: 30 },
      { seatVisibility: "shared" },
    );
    const goblin = yield* libraryCreature(dm, monsters.goblin, srd("Goblin"));
    const dragon = yield* libraryCreature(dm, monsters.dragon, srd("Adult Red Dragon"));
    return {
      dm,
      player,
      campaignId,
      goblin: goblin.id,
      dragon: dragon.id,
      names: monsters,
      nights: { count: 0 },
    };
  });

type Table = Effect.Success<ReturnType<typeof aTable>>;

interface FightOptions {
  /** Who goes first; the goblin by default. */
  readonly first?: "goblin" | "dragon";
  /** Leave it rolling initiative. */
  readonly rolling?: boolean;
  /** The dragon's recharges already spent when the fight begins. */
  readonly recharging?: ReadonlyArray<string>;
}

/**
 * A fight on a fresh night: the goblin at (5,5), the party's Brannoc beside it
 * at (6,5), and the dragon at (5,8) — 15 ft from both. Placed while
 * initiative is rolled, so nobody has walked.
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
          name: `Ash and teeth ${String(table.nights.count)}`,
          visibility: "shared",
          ready: true,
          tactics: ["The goblin fights from cover and flees below half its hit points."],
          creatures: [
            { creatureId: table.goblin, count: 1 },
            { creatureId: table.dragon, count: 1 },
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
    // A roster add copies the creature into the campaign, so its row names
    // the copy; the names are the table's own.
    const goblin = seeded.find((row) => row.displayName === table.names.goblin)!;
    const dragon = seeded.find((row) => row.displayName === table.names.dragon)!;
    const hero = seeded.find((row) => row.kind === "pc")!;
    for (const [row, column, line] of [
      [goblin, 5, 5],
      [hero, 6, 5],
      [dragon, 5, 8],
    ] as const) {
      yield* as(dm.token, (client) =>
        client.combatants.move({
          params: { ...params, combatantId: row.id },
          payload: { position: { column, row: line } },
        }),
      );
    }
    const first = options.first ?? "goblin";
    yield* as(dm.token, (client) =>
      client.runs.setInitiative({
        params,
        payload: {
          entries: [
            { combatantId: goblin.id, initiative: first === "goblin" ? 20 : 15 },
            { combatantId: dragon.id, initiative: first === "dragon" ? 20 : 15 },
            { combatantId: hero.id, initiative: 10 },
          ],
        },
      }),
    );
    if (options.recharging !== undefined) {
      yield* as(dm.token, (client) =>
        client.combatants.resources({
          params: { ...params, combatantId: dragon.id },
          payload: { rechargeSpent: [...options.recharging!] },
        }),
      );
    }
    if (options.rolling !== true) {
      yield* as(dm.token, (client) => client.runs.begin({ params, payload: {} }));
    }
    const order = yield* as(dm.token, (client) => client.combatants.list({ params }));
    /** A creature's place in the order, as the model names it. */
    const place = (row: Combatant) => order.findIndex((other) => other.id === row.id) + 1;
    return { params, goblin, dragon, hero, order, place };
  });

type Fight = Effect.Success<ReturnType<typeof aFight>>;

interface Asked {
  readonly events: ReadonlyArray<HobEvent>;
  readonly requests: ReadonlyArray<ChatRequest>;
}

/** Ask for one combatant's turn with these rounds scripted. */
const askTurn = (
  who: Person,
  fight: Pick<Fight, "params">,
  combatant: Pick<Combatant, "id">,
  ask: HobFightAsk,
  rounds: ReadonlyArray<Round>,
) =>
  Effect.gen(function* () {
    const before = model.requests().length;
    script.length = before;
    script.push(...rounds);
    const events = yield* as(who.token, (client) =>
      Effect.flatMap(
        client.hobFight.turn({
          params: { ...fight.params, combatantId: combatant.id },
          payload: ask,
        }),
        (stream) => Stream.runCollect(stream),
      ),
    );
    return { events: Array.from(events), requests: model.requests().slice(before) } as Asked;
  });

const proposedIn = (events: ReadonlyArray<HobEvent>) => {
  const proposed = events.find((event) => event.event === "proposal");
  return proposed?.event === "proposal" ? proposed.data : undefined;
};

const begunIn = (events: ReadonlyArray<HobEvent>) => {
  const began = events.find((event) => event.event === "began");
  if (began?.event !== "began") throw new Error("no began event");
  return began.data;
};

const toolNames = (request: ChatRequest | undefined) =>
  (request?.tools ?? [])
    .map((tool) => (tool as { readonly function: { readonly name: string } }).function.name)
    .sort();

/** What the tool answered the model, as the next round was sent it. */
const toolAnswers = (requests: ReadonlyArray<ChatRequest>): string =>
  requests
    .flatMap((request) =>
      (request.messages ?? [])
        .filter((message) => message.role === "tool")
        .map((message) => String(message.content)),
    )
    .join("\n");

const NARRATION = "The goblin darts round Brannoc and jabs its scimitar at his ribs.";

const makeFixture = Effect.gen(function* () {
  const table = yield* aTable("The Ashen Ford", { goblin: "Ford Goblin", dragon: "Cinder" });
  // Another fight at this very table, on an earlier night, and another
  // campaign's: neither is the fight being asked about.
  const earlier = yield* aTable("The Far Table", {
    goblin: SENTINEL,
    dragon: `${SENTINEL} wyrm`,
  });
  const elsewhere = yield* aFight(earlier);
  const ownSentinel = yield* libraryCreature(table.dm, `${SENTINEL} lurker`, srd("Goblin"));
  const lurking = yield* aFight({
    ...table,
    goblin: ownSentinel.id,
    names: { ...table.names, goblin: `${SENTINEL} lurker` },
  });
  return { table, earlier, elsewhere, lurking };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob-fight-turn.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describeLayer("hob-fight-turn", shared, (it) => {
  describe("the fight toolkit", () => {
    it("is readFight and proposeNpcTurn, and no other toolkit proposes a turn", () => {
      expect(Object.keys(FightToolkit.tools).sort()).toEqual(["proposeNpcTurn", "readFight"]);
      for (const toolkit of [HobToolkit, SharedWorldToolkit, playerToolkitOver(NO_VOCABULARY)]) {
        expect(Object.keys(toolkit.tools)).not.toContain("proposeNpcTurn");
      }
    });
  });

  describe("a legal turn", () => {
    it.effect("is offered in one round, against the fight bound into the prompt", () =>
      Effect.gen(function* () {
        const { table } = yield* Fixture;
        const fight = yield* aFight(table);
        const { events, requests } = yield* askTurn(
          table.dm,
          fight,
          fight.goblin,
          { moment: "turn" },
          [
            toolCallChunks("proposeNpcTurn", {
              steps: [
                { option: "move", square: { column: 6, row: 6 } },
                { option: "actions/Scimitar", targets: [fight.place(fight.hero)] },
              ],
              narration: NARRATION,
            }),
          ],
        );
        // One provider call: no `readFight` round, and none for a closing line.
        expect(requests.length).toBe(1);
        expect(toolNames(requests[0])).toEqual(["proposeNpcTurn", "readFight"]);
        const prompt = JSON.stringify(requests[0]?.messages);
        expect(prompt).toContain("Its turn");
        expect(prompt).toContain("actions/Scimitar");
        expect(prompt).toContain("flees below half its hit points");
        expect(events.map((event) => event.event)).toEqual([
          "began",
          "tool",
          "tool",
          "proposal",
          "done",
        ]);

        const proposal = proposedIn(events)?.proposal as Extract<
          HobProposal,
          { target: "npcTurn" }
        >;
        expect(proposal).toMatchObject({
          target: "npcTurn",
          sessionId: fight.params.sessionId,
          runId: fight.params.runId,
          combatantId: fight.goblin.id,
          combatantName: "Ford Goblin",
          moment: "turn",
          round: 1,
          narration: NARRATION,
          instruction: null,
          steps: [
            { kind: "move", to: { column: 6, row: 6 }, feet: 5 },
            {
              kind: "option",
              optionId: "actions/Scimitar",
              slot: "action",
              targets: [{ combatantId: fight.hero.id, name: "Brannoc" }],
            },
          ],
        });
        expect(proposal.stamp).toMatch(/^[0-9a-f]{64}$/);
        // The stamp is the fight as it stands, and nothing in it moved.
        const proof = yield* asDm(table.dm.actor, table.campaignId);
        const read = yield* Effect.flatMap(TableFight, (tableFight) =>
          tableFight.read(proof, fight.params.sessionId, fight.params.runId),
        ).pipe(Effect.orDie);
        expect(read.stamp).toBe(proposal.stamp);
        const after = yield* as(table.dm.token, (client) =>
          client.combatants.list({ params: fight.params }),
        );
        expect(after.map((row) => [row.position, row.actionUsed, row.feetMoved])).toEqual(
          fight.order.map((row) => [row.position, row.actionUsed, row.feetMoved]),
        );

        // Saved in the fight's own thread, which the panel's list leaves out.
        const { threadId, turnId } = begunIn(events);
        const thread = yield* as(table.dm.token, (client) =>
          client.hobFight.thread({ params: fight.params }),
        );
        expect(thread.id).toBe(threadId);
        expect(thread.title).toContain("Ash and teeth");
        const listed = yield* as(table.dm.token, (client) =>
          client.hob.threads({ params: { campaignId: table.campaignId } }),
        );
        expect(listed.map((row) => row.id)).not.toContain(threadId);
        const turns = yield* as(table.dm.token, (client) =>
          client.hob.turns({ params: { campaignId: table.campaignId, threadId } }),
        );
        expect(turns.map((turn) => turn.who)).toEqual(["user", "hob"]);
        expect(turns[1]?.id).toBe(turnId);
        expect(turns[1]?.proposal?.target).toBe("npcTurn");
      }),
    );

    it.effect("takes a legendary action between turns", () =>
      Effect.gen(function* () {
        const { table } = yield* Fixture;
        const fight = yield* aFight(table);
        const { events, requests } = yield* askTurn(
          table.dm,
          fight,
          fight.dragon,
          { moment: "legendary", instruction: "Lash the one nearest the goblin." },
          [
            toolCallChunks("proposeNpcTurn", {
              steps: [
                { option: "legendaryActions/Tail Attack>Tail", targets: [fight.place(fight.hero)] },
              ],
              narration: "The dragon's tail sweeps round.",
            }),
          ],
        );
        expect(JSON.stringify(requests[0]?.messages)).toContain("Lash the one nearest the goblin.");
        expect(proposedIn(events)?.proposal).toMatchObject({
          target: "npcTurn",
          moment: "legendary",
          instruction: "Lash the one nearest the goblin.",
          steps: [
            { kind: "option", slot: "legendary", optionId: "legendaryActions/Tail Attack>Tail" },
          ],
        });
      }),
    );
  });

  describe("each step is checked on the fight the steps before it leave", () => {
    const refused = (
      label: string,
      options: FightOptions,
      who: "goblin" | "dragon",
      steps: (fight: Fight) => ReadonlyArray<Record<string, unknown>>,
      expected: RegExp,
    ) =>
      it.effect(`refuses ${label}, in words, and offers nothing`, () =>
        Effect.gen(function* () {
          const { table } = yield* Fixture;
          const fight = yield* aFight(table, options);
          const { events, requests } = yield* askTurn(
            table.dm,
            fight,
            fight[who],
            { moment: "turn" },
            [
              toolCallChunks("proposeNpcTurn", { steps: steps(fight), narration: NARRATION }),
              textChunks("It attacks."),
            ],
          );
          const answered = toolAnswers(requests);
          expect(answered).toMatch(expected);
          expect(answered).toContain("Nothing was offered to the DM");
          expect(proposedIn(events)).toBeUndefined();
          const last = events.at(-1);
          expect(last?.event).toBe("failed");
          expect(last?.event === "failed" ? last.data.message : "").toContain("turned back");
        }),
      );

    refused(
      "an attack out of reach",
      {},
      "goblin",
      (fight) => [{ option: "actions/Scimitar", targets: [fight.place(fight.dragon)] }],
      /Step 1: #2 \\"Cinder\\" is 15 ft away, out of Scimitar's reach/,
    );
    refused(
      "a second action",
      {},
      "goblin",
      (fight) => [
        { option: "actions/Scimitar", targets: [fight.place(fight.hero)] },
        { option: "actions/Shortbow", targets: [fight.place(fight.hero)] },
      ],
      /Step 2: actions\/Shortbow needs an action, already spent/,
    );
    refused(
      "a recharge that is not ready",
      { first: "dragon", recharging: ["actions/Fire Breath"] },
      "dragon",
      () => [{ option: "actions/Fire Breath", square: { column: 6, row: 5 } }],
      /actions\/Fire Breath is not available now: recharging/,
    );
    refused(
      "a reaction on its own turn",
      {},
      "goblin",
      (fight) => [{ option: "opportunity/actions/Scimitar", targets: [fight.place(fight.hero)] }],
      /is a reaction, which is not taken as its own turn/,
    );
    refused(
      "an option it does not have",
      {},
      "goblin",
      () => [{ option: "actions/Fireball" }],
      /there is no option \\"actions\/Fireball\\"; the options offered now are .*actions\/Scimitar/,
    );
    refused(
      "a place in the order nobody holds",
      {},
      "goblin",
      () => [{ option: "actions/Scimitar", targets: [9] }],
      /there is no #9 in the order/,
    );
  });

  describe("the endpoint refuses before the stream", () => {
    it.effect("is NotFound to a player, and for another campaign's run", () =>
      Effect.gen(function* () {
        const { table, earlier, elsewhere } = yield* Fixture;
        const fight = yield* aFight(table);
        const before = model.requests().length;
        const turn = (who: Person, params: Fight["params"], combatantId: Combatant["id"]) =>
          refusal(who.token, (client) =>
            client.hobFight.turn({
              params: { ...params, combatantId },
              payload: { moment: "turn" },
            }),
          );
        expect((yield* turn(table.player, fight.params, fight.goblin.id)).tag).toBe("NotFound");
        // The other table's run, through this campaign's path and its own.
        expect(
          (yield* turn(
            table.dm,
            { ...elsewhere.params, campaignId: table.campaignId },
            elsewhere.goblin.id,
          )).tag,
        ).toBe("NotFound");
        expect((yield* turn(table.dm, elsewhere.params, elsewhere.goblin.id)).tag).toBe("NotFound");
        expect((yield* turn(earlier.dm, fight.params, fight.goblin.id)).tag).toBe("NotFound");
        // A combatant of another fight, named under this one.
        expect((yield* turn(table.dm, fight.params, elsewhere.goblin.id)).tag).toBe("NotFound");
        expect(
          (yield* refusal(table.player.token, (client) =>
            client.hobFight.thread({ params: fight.params }),
          )).tag,
        ).toBe("NotFound");
        expect(model.requests().length).toBe(before);
      }),
    );

    it.effect(
      "is Conflict for a moment that does not apply, a player character, or a fight still rolling",
      () =>
        Effect.gen(function* () {
          const { table } = yield* Fixture;
          const fight = yield* aFight(table);
          const before = model.requests().length;
          const turn = (
            combatantId: Combatant["id"],
            moment: HobFightAsk["moment"],
            params = fight.params,
          ) =>
            refusal(table.dm.token, (client) =>
              client.hobFight.turn({ params: { ...params, combatantId }, payload: { moment } }),
            );
          expect(yield* turn(fight.dragon.id, "turn")).toEqual({
            tag: "Conflict",
            message: "it is not its turn",
          });
          expect(yield* turn(fight.goblin.id, "legendary")).toEqual({
            tag: "Conflict",
            message: "it has no legendary action it can take now",
          });
          expect((yield* turn(fight.hero.id, "turn")).tag).toBe("Conflict");
          const rolling = yield* aFight(table, { rolling: true });
          expect(yield* turn(rolling.goblin.id, "turn", rolling.params)).toEqual({
            tag: "Conflict",
            message: "this fight is still rolling initiative",
          });
          expect(model.requests().length).toBe(before);
        }),
    );

    it.effect("is HobUnavailable with no model, and still NotFound to a player", () =>
      Effect.gen(function* () {
        const { table } = yield* Fixture;
        const fight = yield* aFight(table);
        const tagFor = (actor: Person) =>
          Effect.gen(function* () {
            const hob = yield* Hob;
            const failed = yield* Effect.flip(
              hob.askFight(
                fight.params.campaignId,
                fight.params.sessionId,
                fight.params.runId,
                fight.goblin.id,
                { moment: "turn" },
              ),
            );
            return failed._tag;
          }).pipe(
            Effect.provide(Hob.unavailable.pipe(Layer.provide(TableFight.unsigned))),
            Effect.provideService(CurrentActor, actor.actor),
          );
        expect(yield* tagFor(table.dm)).toBe("HobUnavailable");
        expect(yield* tagFor(table.player)).toBe("NotFound");
      }),
    );
  });

  describe("an offered turn", () => {
    it.effect("is kept by no accept, turned down by a discard, and heard by the next ask", () =>
      Effect.gen(function* () {
        const { table } = yield* Fixture;
        const fight = yield* aFight(table);
        const first = yield* askTurn(table.dm, fight, fight.goblin, { moment: "turn" }, [
          toolCallChunks("proposeNpcTurn", {
            steps: [{ option: "actions/Scimitar", targets: [fight.place(fight.hero)] }],
            narration: NARRATION,
          }),
        ]);
        const { threadId, turnId } = begunIn(first.events);
        const params = {
          campaignId: table.campaignId,
          threadId,
          turnId: turnId as AssistantTurnId,
        };
        expect(
          yield* refusal(table.dm.token, (client) => client.hob.accept({ params, payload: {} })),
        ).toEqual({
          tag: "Conflict",
          message: "that is a monster's turn — it is not kept through Hob's panel",
        });
        yield* as(table.dm.token, (client) => client.hob.discard({ params, payload: {} }));

        const again = yield* askTurn(
          table.dm,
          fight,
          fight.goblin,
          { moment: "turn", instruction: "Have it flee instead." },
          [
            toolCallChunks("proposeNpcTurn", {
              steps: [
                { option: "standard/Disengage" },
                { option: "move", square: { column: 2, row: 5 } },
              ],
              narration: "The goblin squeals and bolts for the reeds.",
            }),
          ],
        );
        const prompt = JSON.stringify(again.requests[0]?.messages);
        expect(prompt).toContain("Ford Goblin");
        expect(prompt).toContain("— discarded: actions/Scimitar at");
        expect(prompt).toContain("Have it flee instead.");
        // The same fight, the same thread.
        expect(begunIn(again.events).threadId).toBe(threadId);
        expect(proposedIn(again.events)?.proposal).toMatchObject({ target: "npcTurn" });
      }),
    );

    it.effect("carries only the end of a long fight's thread into the prompt", () =>
      Effect.gen(function* () {
        const { table } = yield* Fixture;
        const fight = yield* aFight(table);
        for (let asked = 0; asked < 4; asked++) {
          yield* askTurn(table.dm, fight, fight.goblin, { moment: "turn" }, [
            textChunks("Thinking."),
          ]);
        }
        const last = yield* askTurn(table.dm, fight, fight.goblin, { moment: "turn" }, [
          textChunks("Thinking."),
        ]);
        // The system prompt, the last four turns, and the question.
        expect(last.requests[0]?.messages?.length).toBe(6);
      }),
    );
  });

  it.effect("sends no byte of another fight to the model", () =>
    Effect.gen(function* () {
      const { table } = yield* Fixture;
      const fight = yield* aFight(table);
      yield* askTurn(table.dm, fight, fight.goblin, { moment: "turn" }, [
        toolCallChunks("readFight", {}),
        textChunks("Nothing to do."),
      ]);
      const sent = JSON.stringify(model.requests());
      expect(sent).toContain("Ford Goblin");
      expect(sent).not.toContain(SENTINEL);
    }),
  );
});
