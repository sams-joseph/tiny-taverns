import { createHash } from "node:crypto";
import { describe, expect } from "@effect/vitest";
import {
  type Ability,
  type AssistantThreadId,
  asBackgroundOption,
  asClassOption,
  asRaceOption,
  type CharacterId,
  type CharacterOption,
  CurrentActor,
  type HobEvent,
  optionNamed,
  type SessionId,
  type SharedWorldId,
  type SheetBody,
  startingSheetBody,
  TavernsApi,
} from "@taverns/api";
import { Context, Deferred, Effect, Fiber, Layer, Stream } from "effect";
import { Tool } from "effect/ai";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import {
  accountToolkitListing,
  accountToolkitOver,
  coreToolkitListing,
  coreToolkitOver,
  HobToolkit,
  NO_VOCABULARY,
  playerToolkitListing,
  playerToolkitOver,
  SharedWorldToolkit,
} from "../src/assistant/toolkit.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Advancement } from "../src/repo/Advancement.js";
import { importSystemFeats, importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { admittedTo, aPerson, campaignVia, type Person } from "./support/actors.js";
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
 * **Hob proposing a level-up** — `/me/hob` with `intent: "levelUp"`, the
 * character sheet's level-up composer — and the keep that applies it.
 *
 * Over the real application and the imported 2014 corpus, so the reach, the
 * offer, the toolkit built from it, the accept and the level-up write are the
 * shipped ones; only the model is scripted. The claims:
 *
 * - **the other five toolkits are byte-identical**: what each is shown is
 *   pinned by a hash taken before this surface existed;
 * - **the toolkit is the offer's**: two tools, every name an enum of what the
 *   offer lists (an option whose prerequisites are unmet is not in it), and no
 *   hit point method, score, level or character to set;
 * - **keeping applies it through the owner's own write**, stamped `origin =
 *   'assistant'` with the turn, ringing an open night once the keep commits;
 * - **nothing is applied that the offer does not allow**, and a refusal goes
 *   back to the model;
 * - **a stale version refuses the keep, and a discard works**;
 * - **another account's character is `NotFound`** before the model is called.
 */

const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-level-up", maxTokens: 512, rounds: script });

const database = migratedDatabase("taverns_test_hob_level_up");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-level-up" }).pipe(Layer.provide(model.layer)),
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

/** The same call, answering the failure's tag and message rather than dying on it. */
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

const ASKED = "Level them up. They are a bruiser who leads from the front.";

interface Asked {
  readonly events: ReadonlyArray<HobEvent>;
  readonly requests: ReadonlyArray<ChatRequest>;
}

/** Ask the level-up composer for one character, with these rounds scripted. */
const ask = (
  person: Person,
  characterId: CharacterId,
  rounds: ReadonlyArray<Round>,
  options: { readonly threadId?: AssistantThreadId; readonly text?: string } = {},
) =>
  Effect.gen(function* () {
    const before = model.requests().length;
    script.length = before;
    script.push(...rounds);
    const events = yield* as(person.token, (client) =>
      Effect.flatMap(
        client.meHob.ask({
          payload: {
            text: options.text ?? ASKED,
            intent: "levelUp",
            characterId,
            ...(options.threadId === undefined ? {} : { threadId: options.threadId }),
          },
        }),
        (stream) => Stream.runCollect(stream),
      ),
    );
    return { events: Array.from(events), requests: model.requests().slice(before) } as Asked;
  });

const begunIn = (events: ReadonlyArray<HobEvent>) => {
  const began = events.find((event) => event.event === "began");
  if (began?.event !== "began") throw new Error("no began event");
  return began.data;
};

const proposedIn = (events: ReadonlyArray<HobEvent>) => {
  const proposed = events.find((event) => event.event === "proposal");
  return proposed?.event === "proposal" ? proposed.data : undefined;
};

/** A request's tools, by name. */
const toolsOf = (request: ChatRequest | undefined) =>
  new Map(
    (request?.tools ?? []).map((tool) => {
      const fn = (
        tool as { readonly function: { readonly name: string; readonly parameters: unknown } }
      ).function;
      return [fn.name, fn.parameters] as const;
    }),
  );

/** A tool parameter schema's properties, as the provider was shown them. */
const propertiesOf = (parameters: unknown): Record<string, unknown> =>
  (parameters as { readonly properties?: Record<string, unknown> }).properties ?? {};

/** Six scores laid in the order the cells are drawn: STR, DEX, CON, INT, WIS, CHA. */
const cells = (scores: readonly [number, number, number, number, number, number]) =>
  (["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const).map((label, index): Ability => {
    const score = scores[index]!;
    const modifier = Math.floor((score - 10) / 2);
    return {
      label,
      score: String(score),
      modifier: modifier < 0 ? String(modifier) : `+${String(modifier)}`,
    };
  });

interface Recipe {
  readonly name: string;
  readonly className: string;
  readonly race: string;
  readonly subclass?: string;
  readonly level: number;
  readonly scores: readonly [number, number, number, number, number, number];
  readonly then?: (body: SheetBody) => SheetBody;
}

/** A character of the core rules, composed at its level the way the create form composes one. */
const aCoreCharacter = (
  person: Person,
  options: ReadonlyArray<CharacterOption>,
  recipe: Recipe,
) => {
  const composed = startingSheetBody({
    classOption: asClassOption(optionNamed(options, "class", recipe.className)),
    raceOption: asRaceOption(optionNamed(options, "race", recipe.race)),
    backgroundOption: asBackgroundOption(optionNamed(options, "background", "Acolyte")),
    background: "Acolyte",
    subclass: recipe.subclass,
    abilities: cells(recipe.scores),
    level: recipe.level,
  });
  const body = recipe.then === undefined ? composed.body : recipe.then(composed.body);
  return as(person.token, (client) =>
    client.me.createCoreCharacter({
      payload: {
        name: recipe.name,
        race: recipe.race,
        className: recipe.className,
        level: recipe.level,
        ac: composed.seed.ac,
        ...(composed.seed.hpMax === undefined ? {} : { hpMax: composed.seed.hpMax }),
        sheet: { notes: "", ...body },
      },
    }),
  );
};

/** A level 3 Champion whose next level is an Ability Score Improvement. */
const aChampion = (person: Person, options: ReadonlyArray<CharacterOption>, name: string) =>
  aCoreCharacter(person, options, {
    name,
    className: "Fighter",
    race: "Human",
    subclass: "Champion",
    level: 3,
    scores: [15, 14, 14, 10, 12, 8],
  });

/** What a well-behaved model does: read the offer, then propose. */
const offerThenPropose = (
  proposal: Record<string, unknown>,
  said = "Here is level 4.",
): Array<Round> => [
  toolCallChunks("readLevelUpOffer", {}),
  toolCallChunks("proposeLevelUp", proposal),
  textChunks(said),
];

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

const recordsOf = (characterId: CharacterId) =>
  sql(
    (sql) => sql<{
      readonly level: number;
      readonly origin: string;
      readonly assistant_turn_id: string | null;
      readonly hp_method: string;
    }>`
      select level, origin, assistant_turn_id, hp_method from character_advancement
      where character_id = ${characterId}
      order by level
    `,
  );

const ownedOf = (person: Person, characterId: CharacterId) =>
  Effect.map(
    as(person.token, (client) => client.me.characters()),
    (rows) => rows.find((row) => row.character.id === characterId)!.character,
  );

/** A level 3 Champion seated at a campaign whose night is open, and that night. */
const aSeatAtAnOpenNight = (owner: Person, options: ReadonlyArray<CharacterOption>, name: string) =>
  Effect.gen(function* () {
    const dm = yield* aPerson(`${name}'s DM`);
    const campaign = yield* as(dm.token, (client) =>
      campaignVia(client, { name: `${name}'s table`, visibility: "shared" }),
    );
    yield* admittedTo(campaign.id, owner.actor, "Ilse");
    const champion = yield* aChampion(owner, options, name);
    yield* as(owner.token, (client) =>
      client.party.join({
        params: { campaignId: campaign.id },
        payload: { characterId: champion.id },
      }),
    );
    const session = yield* as(dm.token, (client) =>
      client.sessions.create({
        params: { campaignId: campaign.id },
        payload: { number: 1, title: "At the ford", visibility: "shared" },
      }),
    );
    yield* as(dm.token, (client) =>
      client.campaigns.update({
        params: { campaignId: campaign.id },
        payload: { currentSessionId: session.id },
      }),
    );
    return { champion, session: session.id };
  });

/** How many times a night's log heard a character change. */
const rungAt = (session: SessionId) =>
  sql(
    (sql) => sql<{ readonly count: number }>`
      select count(*)::int as count from session_event
      where session_id = ${session} and kind = 'character-updated'
    `,
  ).pipe(Effect.map((rows) => rows[0]!.count));

const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment().pipe(Effect.orDie);
  yield* importSystemOptions().pipe(Effect.orDie);
  yield* importSystemFeats().pipe(Effect.orDie);
  yield* importSystemSpells().pipe(Effect.orDie);
  const owner = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const options = yield* as(owner.token, (client) => client.library.coreOptions({ query: {} }));
  return { owner, stranger, options };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob-level-up.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

/**
 * What one toolkit shows the provider — every tool's name, description and
 * parameter schema — hashed. Over a fixed vocabulary and one Shared World, so
 * the per-request toolkits are measured in a shape that names something.
 */
const shown = (toolkit: { readonly tools: Record<string, Tool.Any> }): string =>
  createHash("sha256")
    .update(
      JSON.stringify(
        Object.values(toolkit.tools).map((tool) => [
          tool.name,
          Tool.getDescription(tool),
          Tool.getJsonSchema(tool),
        ]),
      ),
    )
    .digest("hex");

const WORLDS = [
  { id: "00000000-0000-4000-8000-000000000001" as SharedWorldId, name: "The Drowned Coast" },
];

describeLayer(
  "hob-level-up",
  shared,
  (it) => {
    describe("the other five toolkits", () => {
      it("are byte-identical to what they were before the level-up composer existed", () => {
        // Hashed on `main` before `proposeLevelUp` was written. A level-up
        // tool added to any of them — or any other change to what they show
        // the model — moves its hash, which makes that a visible decision.
        expect({
          creator: shown(HobToolkit),
          sharedWorld: shown(SharedWorldToolkit),
          player: shown(playerToolkitOver(NO_VOCABULARY)),
          playerListing: shown(playerToolkitListing(NO_VOCABULARY)),
          core: shown(coreToolkitOver(NO_VOCABULARY)),
          coreListing: shown(coreToolkitListing(NO_VOCABULARY)),
          account: shown(accountToolkitOver(NO_VOCABULARY, WORLDS)),
          accountListing: shown(accountToolkitListing(NO_VOCABULARY, WORLDS)),
        }).toEqual({
          creator: "fe65bd8eb0cbf6dbf3f2127f421fbd02f2537036c164aee940dd1c0cf389a1a3",
          sharedWorld: "605ead7fad5f09d1fde9b8173e608ca83ea65132b673aa65c8055af9cc1072fa",
          player: "9e020ea51ee08f9b492682c991710708543ab6d52e0414eff40dc034ea8447f2",
          playerListing: "ecde02bdb58c2c0bfe0b325b018b42ae351be184dea9757d70fc503d6785d6a9",
          core: "5b6ccff95f0751239118a2196f51d2d918d90acdad03b01e8a96eda86ba22abd",
          coreListing: "3b51f22a3bdeab5ffd5472160933fe6011ae8707b4469790f26e9f4d80212f73",
          account: "d232b6fa3fcef517229fcf319b13821192ee31c8cc712ccf5d0d1471790acc71",
          accountListing: "fa3a35cfad02f9cf449d98d3d44bb9e175c2a3c51eb85a141a18b883dad62e54",
        });
      });
    });

    describe("the composer's toolkit is the offer's", () => {
      it.effect("reads the offer and proposes from it, and nothing else", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const champion = yield* aChampion(owner, options, "Brannoc");
          const { requests } = yield* ask(owner, champion.id, [textChunks("Tell me more.")]);
          const tools = toolsOf(requests[0]);
          expect([...tools.keys()].sort()).toEqual(["proposeLevelUp", "readLevelUpOffer"]);

          // An Ability Score Improvement level: its points and, since STR 15
          // meets Grappler's 13, the one feat — and no subclass, which the
          // sheet already names. Nothing sets hit points, a score, a level or
          // a character.
          const properties = propertiesOf(tools.get("proposeLevelUp"));
          expect(Object.keys(properties).sort()).toEqual([
            "abilityScoreImprovement",
            "feat",
            "rationale",
          ]);
          const shownTools = JSON.stringify(requests[0]?.tools);
          expect(shownTools).toContain('"Grappler"');
          for (const absent of ["hitPoints", "method", "score", "toLevel", "characterId"]) {
            expect(shownTools).not.toContain(`"${absent}"`);
          }
          // The prompt names the character and its next level.
          expect(JSON.stringify(requests[0]?.messages)).toContain("to level 4");
        }),
      );

      it.effect("builds each enum from the offer, leaving out what cannot be taken yet", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const warlock = yield* aCoreCharacter(owner, options, {
            name: "Ivar",
            className: "Warlock",
            race: "Tiefling",
            subclass: "Fiend",
            level: 1,
            scores: [8, 14, 13, 10, 12, 15],
            then: (body) => ({
              ...body,
              spellcasting: { ...body.spellcasting, known: [{ name: "Eldritch Blast", level: 0 }] },
            }),
          });
          const offer = yield* as(owner.token, (client) =>
            client.me.levelUpOffer({ params: { characterId: warlock.id } }),
          );
          const { requests } = yield* ask(owner, warlock.id, [textChunks("Tell me more.")]);
          const properties = propertiesOf(toolsOf(requests[0]).get("proposeLevelUp"));
          const picks = JSON.stringify(properties.picks);
          const invocations = offer.choices.find(
            (choice) => choice.offeredBy.name === "Eldritch Invocations",
          );
          if (invocations?.kind !== "feature") throw new Error("no invocations offered");
          for (const option of invocations.options) {
            // Every invocation the warlock can take now is in the grammar, and
            // none it cannot: Thirsting Blade wants a pact and level 5.
            if (option.available) expect(picks).toContain(JSON.stringify(option.name));
            else expect(picks).not.toContain(JSON.stringify(option.name));
          }
          expect(picks).not.toContain("Thirsting Blade");
          expect(Object.keys(properties)).not.toContain("abilityScoreImprovement");
        }),
      );
    });

    describe("proposing and keeping", () => {
      it.effect(
        "offers the level with fixed hit points, and keeping applies it as the assistant's",
        () =>
          Effect.gen(function* () {
            const { owner, options } = yield* Fixture;
            const champion = yield* aChampion(owner, options, "Ulla");
            const { events, requests } = yield* ask(
              owner,
              champion.id,
              offerThenPropose({
                abilityScoreImprovement: [{ ability: "STR", points: 2 }],
                rationale: ["Strength first: they lead from the front."],
              }),
            );

            // The offer reached the model, in words.
            expect(JSON.stringify(requests[1]?.messages)).toContain("Ability Score Improvement");
            const proposed = proposedIn(events);
            if (proposed?.proposal.target !== "levelUp") throw new Error("no level-up offered");
            const { proposal } = proposed;
            expect(proposal).toMatchObject({
              characterId: champion.id,
              characterName: "Ulla",
              className: "Fighter",
              fromLevel: 3,
              toLevel: 4,
              payload: {
                expectedVersion: champion.version,
                toLevel: 4,
                hitPoints: "fixed",
                abilityScoreImprovement: { increases: [{ ability: "STR", amount: 2 }] },
              },
              choices: { abilityScores: [{ ability: "STR", from: 16, to: 18 }] },
              rationale: ["Strength first: they lead from the front."],
            });
            // A d10's 6, and CON 15's +2.
            expect(proposal.hitPointGain).toBe(8);
            expect(events.at(-1)?.event).toBe("done");
            // Nothing applied yet.
            expect((yield* ownedOf(owner, champion.id)).level).toBe(3);
            expect(yield* recordsOf(champion.id)).toEqual([]);

            const { threadId, turnId } = begunIn(events);
            const accepted = yield* as(owner.token, (client) =>
              client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
            );
            if (accepted.accepted !== "levelUp") throw new Error("not a level-up");
            expect(accepted.owned.character).toMatchObject({
              id: champion.id,
              level: 4,
              hpMax: (champion.hpMax ?? 0) + 8,
            });
            expect(
              accepted.owned.character.sheet.abilities.find((cell) => cell.label === "STR")?.score,
            ).toBe("18");
            expect(accepted.advancement).toMatchObject({
              level: 4,
              hitPoints: { method: "fixed", gain: 8 },
              origin: "assistant",
              assistantTurnId: turnId,
            });
            expect(yield* recordsOf(champion.id)).toEqual([
              { level: 4, origin: "assistant", assistant_turn_id: turnId, hp_method: "fixed" },
            ]);
            const turns = yield* as(owner.token, (client) =>
              client.meHob.turns({ params: { threadId } }),
            );
            const kept = turns.find((turn) => turn.id === turnId);
            expect(kept?.acceptedAt).not.toBeNull();
            expect(kept?.kept).toEqual({ accepted: "levelUp", characterId: champion.id });

            // A second keep is one level-up, not two.
            expect(
              (yield* refusal(owner.token, (client) =>
                client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
              )).tag,
            ).toBe("Conflict");
            expect((yield* ownedOf(owner, champion.id)).level).toBe(4);
          }),
      );

      it.effect("shows the model what it offered when it is asked to change it", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const champion = yield* aChampion(owner, options, "Sigrun");
          const first = yield* ask(
            owner,
            champion.id,
            offerThenPropose({ abilityScoreImprovement: [{ ability: "STR", points: 2 }] }),
          );
          const { threadId } = begunIn(first.events);
          const second = yield* ask(
            owner,
            champion.id,
            offerThenPropose({ feat: "Grappler" }, "Grappler, then."),
            { threadId, text: "Take the feat instead." },
          );
          expect(JSON.stringify(second.requests[0]?.messages)).toContain(
            'You offered a level-up for \\"Sigrun\\"',
          );
          const proposed = proposedIn(second.events);
          if (proposed?.proposal.target !== "levelUp") throw new Error("no level-up offered");
          expect(proposed.proposal.choices.feat?.name).toBe("Grappler");
          expect(proposed.proposal.payload.abilityScoreImprovement).toMatchObject({
            featId: proposed.proposal.choices.feat?.featId,
          });
        }),
      );

      it.effect("refuses what the offer does not allow, to the model, and offers nothing", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const champion = yield* aChampion(owner, options, "Hakon");
          // No points where the level asks for them.
          const missing = yield* ask(
            owner,
            champion.id,
            offerThenPropose({ rationale: ["Nothing to choose."] }, "Done."),
          );
          expect(proposedIn(missing.events)).toBeUndefined();
          expect(JSON.stringify(missing.requests[2]?.messages)).toContain(
            "Choose where the Ability Score Improvement's points go",
          );
          expect(missing.events.at(-1)?.event).toBe("failed");

          // Three points, and a score past 20, are both refused in words.
          const greedy = yield* ask(
            owner,
            champion.id,
            offerThenPropose({ abilityScoreImprovement: [{ ability: "STR", points: 3 }] }, "Done."),
          );
          expect(proposedIn(greedy.events)).toBeUndefined();
          expect(JSON.stringify(greedy.requests[2]?.messages)).toContain("3 to STR is neither");
          expect((yield* ownedOf(owner, champion.id)).level).toBe(3);
          expect(yield* recordsOf(champion.id)).toEqual([]);
        }),
      );

      it.effect("rings an open night where the character sits once it is kept", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const { champion, session } = yield* aSeatAtAnOpenNight(owner, options, "Ragna");
          const { events } = yield* ask(
            owner,
            champion.id,
            offerThenPropose({ abilityScoreImprovement: [{ ability: "CON", points: 2 }] }),
          );
          const { threadId, turnId } = begunIn(events);
          const before = yield* rungAt(session);

          // A screen at the table re-reads on the doorbell.
          const live = yield* LiveEvents;
          const heard = yield* Deferred.make<number>();
          const listening = yield* live.subscribe(session).pipe(
            Stream.take(1),
            Stream.runForEach(() =>
              Effect.flatMap(
                Effect.map(recordsOf(champion.id), (rows) => rows.length),
                (count) => Deferred.succeed(heard, count),
              ),
            ),
            Effect.forkChild,
          );
          yield* Effect.sleep("100 millis");
          const accepted = yield* as(owner.token, (client) =>
            client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
          );
          if (accepted.accepted !== "levelUp") throw new Error("not a level-up");
          // The roster's row, so the keep can name every table it moved.
          expect(accepted.owned.seats.map((seat) => seat.campaignId)).toHaveLength(1);
          expect(yield* rungAt(session)).toBe(before + 1);
          expect(yield* Deferred.await(heard).pipe(Effect.timeout("5 seconds"))).toBe(1);
          yield* Fiber.interrupt(listening);
        }),
      );

      it.effect("hands the doorbell back to the accept rather than ringing inside it", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const { champion, session } = yield* aSeatAtAnOpenNight(owner, options, "Eydis");
          const { events } = yield* ask(
            owner,
            champion.id,
            offerThenPropose({ abilityScoreImprovement: [{ ability: "STR", points: 2 }] }),
          );
          const proposed = proposedIn(events);
          if (proposed?.proposal.target !== "levelUp") throw new Error("no level-up offered");

          const live = yield* LiveEvents;
          const heard = yield* Deferred.make<void>();
          const listening = yield* live.subscribe(session).pipe(
            Stream.take(1),
            Stream.runForEach(() => Deferred.succeed(heard, undefined)),
            Effect.forkChild,
          );
          yield* Effect.sleep("100 millis");

          // The accept's write, inside a transaction of the caller's: an open
          // night must not hear it until that transaction has committed, so
          // it hands the ring back instead of ringing.
          const advancement = yield* Advancement;
          const sql = yield* SqlClient.SqlClient;
          const { ring } = yield* sql
            .withTransaction(
              advancement.levelUpForAccept(champion.id, proposed.proposal.payload, {
                assistantTurnId: proposed.turnId,
              }),
            )
            .pipe(Effect.provideService(CurrentActor, owner.actor), Effect.orDie);
          yield* Effect.sleep("100 millis");
          expect(yield* Deferred.isDone(heard)).toBe(false);
          yield* ring;
          yield* Deferred.await(heard).pipe(Effect.timeout("5 seconds"));
          yield* Fiber.interrupt(listening);
        }),
      );
    });

    describe("refusals", () => {
      it.effect("refuses the keep once the sheet has moved on, and a discard still works", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const champion = yield* aChampion(owner, options, "Torvi");
          const { events } = yield* ask(
            owner,
            champion.id,
            offerThenPropose({ abilityScoreImprovement: [{ ability: "DEX", points: 2 }] }),
          );
          const { threadId, turnId } = begunIn(events);
          // The owner edits the sheet by hand after the offer was read.
          yield* as(owner.token, (client) =>
            client.me.updateCharacter({
              params: { characterId: champion.id },
              payload: { expectedVersion: champion.version, name: "Torvi the Bold" },
            }),
          );
          const stale = yield* refusal(owner.token, (client) =>
            client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
          );
          expect(stale.tag).toBe("Conflict");
          expect(stale.message).toContain("the sheet moved on since the level-up was offered");
          expect((yield* ownedOf(owner, champion.id)).level).toBe(3);
          expect(yield* recordsOf(champion.id)).toEqual([]);
          const turns = yield* as(owner.token, (client) =>
            client.meHob.turns({ params: { threadId } }),
          );
          expect(turns.find((turn) => turn.id === turnId)?.acceptedAt).toBeNull();

          // Discarding it is still the owner's to do, and then it is no offer.
          yield* as(owner.token, (client) =>
            client.meHob.discard({ params: { threadId, turnId }, payload: {} }),
          );
          const after = yield* as(owner.token, (client) =>
            client.meHob.turns({ params: { threadId } }),
          );
          expect(after.find((turn) => turn.id === turnId)?.discardedAt).not.toBeNull();
          expect(
            (yield* refusal(owner.token, (client) =>
              client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
            )).tag,
          ).toBe("Conflict");
          expect((yield* ownedOf(owner, champion.id)).level).toBe(3);
        }),
      );

      it.effect("is NotFound for another account's character, before the model is called", () =>
        Effect.gen(function* () {
          const { owner, stranger, options } = yield* Fixture;
          const champion = yield* aChampion(owner, options, "Gunnar");
          const before = model.requests().length;
          const asked = yield* refusal(stranger.token, (client) =>
            client.meHob.ask({
              payload: { text: ASKED, intent: "levelUp", characterId: champion.id },
            }),
          );
          expect(asked.tag).toBe("NotFound");
          expect(model.requests().length).toBe(before);

          // Nor can a stranger keep the owner's proposal.
          const { events } = yield* ask(
            owner,
            champion.id,
            offerThenPropose({ abilityScoreImprovement: [{ ability: "STR", points: 2 }] }),
          );
          const { threadId, turnId } = begunIn(events);
          expect(
            (yield* refusal(stranger.token, (client) =>
              client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
            )).tag,
          ).toBe("NotFound");
          expect((yield* ownedOf(owner, champion.id)).level).toBe(3);

          // And with no model behind Hob it is still a NotFound, not a cheaper probe.
          const off = yield* Effect.gen(function* () {
            const hob = yield* Hob;
            return yield* Effect.flip(
              hob.askDraft({ text: ASKED, intent: "levelUp", characterId: champion.id }),
            );
          }).pipe(
            Effect.provide(Hob.unavailable),
            Effect.provideService(CurrentActor, stranger.actor),
          );
          expect(off._tag).toBe("NotFound");
        }),
      );
    });
  },
  { timeout: "120 seconds" },
);
