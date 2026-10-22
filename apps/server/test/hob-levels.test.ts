import { describe, expect } from "@effect/vitest";
import { generateLevel, type HobEvent, type HobProposal, TavernsApi } from "@taverns/api";
import { Context, Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { aPerson, admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { type Round, scriptedModel, textChunks, toolCallChunks } from "./support/model.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Hob makes levels**: `proposeLevel` offered from the two conversations
 * that have it — a campaign's creator's and the account's own — as labels
 * and a server-picked seed, holding no row until somebody keeps it; the keep
 * lays the same level out again and writes it through the shelf's create and
 * the editor's save, owned by the keeper and stamped with the turn. Over the
 * real application, so the reach, the toolkit and the accept are the shipped
 * ones; only the model is scripted.
 */

const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-levels", maxTokens: 512, rounds: script });

const database = migratedDatabase("taverns_test_hob_levels");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-levels" }).pipe(Layer.provide(model.layer)),
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

/** The same call, answering the failure's tag rather than dying on it. */
const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
    ),
  ).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const pell = yield* aPerson("Pell");
  const stranger = yield* aPerson("Bo");
  const table = yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  );
  yield* admittedTo(table.id, pell.actor, "Pell");
  return { jo, pell, stranger, table };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob-levels.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

/** A sunken shrine, as a well-behaved model offers it: labels only. */
const aShrine = (over: Record<string, unknown> = {}) =>
  toolCallChunks("proposeLevel", {
    name: "The Sunken Shrine",
    description: "A drowned abbey under the marsh.",
    size: "small",
    rooms: [
      { purpose: "shrine", size: "large", label: "The Chapel" },
      { purpose: "cistern", size: null, label: null },
      { purpose: "library", size: "small" },
    ],
    connections: "doors",
    secrets: 1,
    mood: "firelit",
    ...over,
  });

const proposedIn = (events: ReadonlyArray<HobEvent>): HobProposal | undefined => {
  const proposed = events.find((event) => event.event === "proposal");
  return proposed?.event === "proposal" ? proposed.data.proposal : undefined;
};

const begunIn = (events: ReadonlyArray<HobEvent>) => {
  const began = events.find((event) => event.event === "began");
  if (began?.event !== "began") throw new Error("no began event");
  return began.data;
};

const asked = (
  token: string,
  ask: (client: Client) => Effect.Effect<Stream.Stream<HobEvent, unknown>, unknown>,
  rounds: ReadonlyArray<Round>,
) =>
  Effect.gen(function* () {
    const before = model.requests().length;
    script.length = before;
    script.push(...rounds);
    const events = yield* as(token, (client) =>
      Effect.flatMap(ask(client), (stream) => Stream.runCollect(stream)),
    );
    return { events: Array.from(events), requests: model.requests().slice(before) };
  });

const TEXT = "Build me a battle map: a sunken shrine with a cistern and a library.";

const rowsFrom = (turnId: string) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) =>
      sql<{ readonly account_id: string; readonly origin: string }>`
      select account_id, origin from level where assistant_turn_id = ${turnId}
    `,
  ).pipe(Effect.orDie);

describeLayer("hob-levels", shared, (it) => {
  describe("a campaign's Hob", () => {
    it.effect(
      "offers labels and a seed, writes nothing, and only the creator's keep makes the level",
      () =>
        Effect.gen(function* () {
          const { jo, pell, stranger, table } = yield* Fixture;
          const { events, requests } = yield* asked(
            jo.token,
            (client) =>
              client.hob.ask({ params: { campaignId: table.id }, payload: { text: TEXT } }),
            [aShrine(), textChunks("The Sunken Shrine, three rooms.")],
          );
          expect(JSON.stringify(requests[0]?.tools)).toContain("proposeLevel");
          // The model is told what it offered, in the generator's own count.
          expect(JSON.stringify(requests[1]?.messages)).toContain(
            'Offered the level \\"The Sunken Shrine\\": 3 rooms on a small board',
          );

          const proposal = proposedIn(events);
          if (proposal?.target !== "level") throw new Error("no level was offered");
          // Every default filled, and the seed the server picked.
          expect(proposal).toMatchObject({
            name: "The Sunken Shrine",
            description: "A drowned abbey under the marsh.",
            size: "small",
            rooms: [
              { purpose: "shrine", size: "large", label: "The Chapel" },
              { purpose: "cistern", size: "medium", label: null },
              { purpose: "library", size: "small", label: null },
            ],
            connections: "doors",
            secrets: 1,
            mood: "firelit",
          });
          expect(Number.isInteger(proposal.seed)).toBe(true);
          const { threadId, turnId } = begunIn(events);
          expect(yield* rowsFrom(turnId)).toEqual([]);
          expect(yield* as(jo.token, (client) => client.libraryLevels.list())).toEqual([]);

          // A player at the table and a stranger cannot keep the DM's offer.
          for (const token of [pell.token, stranger.token]) {
            expect(
              yield* refusal(token, (client) =>
                client.hob.accept({
                  params: { campaignId: table.id, threadId, turnId },
                  payload: {},
                }),
              ),
            ).toBe("NotFound");
          }
          expect(yield* rowsFrom(turnId)).toEqual([]);

          const kept = yield* as(jo.token, (client) =>
            client.hob.accept({ params: { campaignId: table.id, threadId, turnId }, payload: {} }),
          );
          if (kept.accepted !== "level") throw new Error("no level was kept");
          // The level the card drew: the same spec and seed, laid out again.
          const { target: _target, ...spec } = proposal;
          const drawn = generateLevel(spec).level;
          expect(kept.level).toMatchObject({
            origin: "assistant",
            name: drawn.name,
            description: drawn.description,
            columns: drawn.columns,
            rows: drawn.rows,
            ambient: drawn.ambient,
          });
          expect(kept.level.floor).toEqual(drawn.floor);
          expect(kept.level.walls).toEqual(drawn.walls);
          expect(kept.level.props).toEqual(drawn.props);
          expect(kept.level.lights).toEqual(drawn.lights);
          expect(yield* rowsFrom(turnId)).toEqual([
            { account_id: jo.actor.accountId, origin: "assistant" },
          ]);

          // On the keeper's shelf, and nobody else's.
          expect(
            (yield* as(jo.token, (client) => client.libraryLevels.list())).map((row) => row.id),
          ).toEqual([kept.level.id]);
          expect(
            yield* refusal(pell.token, (client) =>
              client.libraryLevels.findById({ params: { levelId: kept.level.id } }),
            ),
          ).toBe("NotFound");

          // The turn points at it, and a second keep is a conflict.
          const turns = yield* as(jo.token, (client) =>
            client.hob.turns({ params: { campaignId: table.id, threadId } }),
          );
          expect(turns.find((turn) => turn.id === turnId)?.kept).toEqual({
            accepted: "level",
            id: kept.level.id,
          });
          expect(
            yield* refusal(jo.token, (client) =>
              client.hob.accept({
                params: { campaignId: table.id, threadId, turnId },
                payload: {},
              }),
            ),
          ).toBe("Conflict");
        }),
    );

    it.effect("refuses more rooms than the size holds, to the model", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const { events, requests } = yield* asked(
          jo.token,
          (client) => client.hob.ask({ params: { campaignId: table.id }, payload: { text: TEXT } }),
          [
            aShrine({ rooms: Array.from({ length: 9 }, () => ({ purpose: "store" })) }),
            textChunks("I could not."),
          ],
        );
        expect(proposedIn(events)).toBeUndefined();
        expect(JSON.stringify(requests[1]?.messages)).toContain(
          "a small level holds at most 6 rooms",
        );
      }),
    );

    it.effect("discarding writes nothing", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const { events } = yield* asked(
          jo.token,
          (client) => client.hob.ask({ params: { campaignId: table.id }, payload: { text: TEXT } }),
          [aShrine({ name: "Turned Down" }), textChunks("Here.")],
        );
        const { threadId, turnId } = begunIn(events);
        yield* as(jo.token, (client) =>
          client.hob.discard({ params: { campaignId: table.id, threadId, turnId }, payload: {} }),
        );
        expect(yield* rowsFrom(turnId)).toEqual([]);
        expect(
          yield* refusal(jo.token, (client) =>
            client.hob.accept({ params: { campaignId: table.id, threadId, turnId }, payload: {} }),
          ),
        ).toBe("Conflict");
      }),
    );
  });

  describe("the account's own Hob", () => {
    it.effect("keeps a level into the keeper's Library, and a stranger cannot keep it", () =>
      Effect.gen(function* () {
        const { pell, stranger } = yield* Fixture;
        const { events, requests } = yield* asked(
          pell.token,
          (client) => client.meHob.ask({ payload: { text: TEXT } }),
          [aShrine({ name: "Pell's Vault", size: "medium", mood: "dark" }), textChunks("Done.")],
        );
        expect(JSON.stringify(requests[0]?.tools)).toContain("proposeLevel");
        const { threadId, turnId } = begunIn(events);
        expect(yield* rowsFrom(turnId)).toEqual([]);
        expect(
          yield* refusal(stranger.token, (client) =>
            client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
          ),
        ).toBe("NotFound");

        const kept = yield* as(pell.token, (client) =>
          client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
        );
        if (kept.accepted !== "level") throw new Error("no level was kept");
        expect(kept.level).toMatchObject({ name: "Pell's Vault", origin: "assistant" });
        // In the dark nothing burns.
        expect(kept.level.lights.every((light) => !light.lit)).toBe(true);
        expect(yield* rowsFrom(turnId)).toEqual([
          { account_id: pell.actor.accountId, origin: "assistant" },
        ]);
        // The editor's own save takes it from there.
        const saved = yield* as(pell.token, (client) =>
          client.libraryLevels.save({
            params: { levelId: kept.level.id },
            payload: { ...kept.level, name: "Renamed", version: kept.level.version },
          }),
        );
        expect(saved.name).toBe("Renamed");
      }),
    );
  });
  describe("a campaign's Hob offers an encounter on a level", () => {
    const ENCOUNTER_TEXT = "Make me a parley at the drowned shrine.";

    /** A social encounter, so no creature has to be found first. */
    const aParley = (over: Record<string, unknown> = {}) =>
      toolCallChunks("proposeEncounter", {
        name: "Parley at the shrine",
        kind: "social",
        setting: "A drowned abbey under the marsh",
        ...over,
      });

    const levelRow = (levelId: string) =>
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) =>
          sql<{ readonly origin: string; readonly assistant_turn_id: string | null }>`
          select origin, assistant_turn_id from level where id = ${levelId}
        `,
      ).pipe(Effect.orDie);

    it.effect("keeps an empty level with the encounter, stamped with the turn", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const { events } = yield* asked(
          jo.token,
          (client) =>
            client.hob.ask({ params: { campaignId: table.id }, payload: { text: ENCOUNTER_TEXT } }),
          [aParley(), textChunks("A parley.")],
        );
        const proposal = proposedIn(events);
        if (proposal?.target !== "encounter") throw new Error("no encounter was offered");
        expect(proposal).not.toHaveProperty("level");
        const { threadId, turnId } = begunIn(events);
        const kept = yield* as(jo.token, (client) =>
          client.hob.accept({ params: { campaignId: table.id, threadId, turnId }, payload: {} }),
        );
        if (kept.accepted !== "encounter") throw new Error("no encounter was kept");
        expect(kept.encounter.levelId).not.toBeNull();
        const level = yield* as(jo.token, (client) =>
          client.libraryLevels.findById({ params: { levelId: kept.encounter.levelId! } }),
        );
        expect(level).toMatchObject({
          name: "Parley at the shrine",
          description: "A drowned abbey under the marsh",
          columns: 24,
          rows: 16,
          origin: "assistant",
          walls: [],
          props: [],
        });
        expect(yield* levelRow(level.id)).toEqual([
          { origin: "assistant", assistant_turn_id: turnId },
        ]);
      }),
    );

    it.effect("lays the level out from the rooms Hob named, and keeps it with the encounter", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const { events, requests } = yield* asked(
          jo.token,
          (client) =>
            client.hob.ask({ params: { campaignId: table.id }, payload: { text: ENCOUNTER_TEXT } }),
          [
            aParley({
              rooms: [
                { purpose: "shrine", size: "large", label: "The Chapel" },
                { purpose: "cistern" },
              ],
              secrets: 1,
              mood: "dim",
            }),
            textChunks("A parley in the shrine."),
          ],
        );
        expect(JSON.stringify(requests[1]?.messages)).toContain("on a small level of 2 rooms");
        const proposal = proposedIn(events);
        if (proposal?.target !== "encounter") throw new Error("no encounter was offered");
        // The spec, named after the encounter, its setting the description,
        // the smallest size that holds the rooms, and the server's seed.
        expect(proposal.level).toMatchObject({
          name: "Parley at the shrine",
          description: "A drowned abbey under the marsh",
          size: "small",
          rooms: [
            { purpose: "shrine", size: "large", label: "The Chapel" },
            { purpose: "cistern", size: "medium", label: null },
          ],
          connections: "mixed",
          secrets: 1,
          mood: "dim",
        });
        const { threadId, turnId } = begunIn(events);
        expect(yield* rowsFrom(turnId)).toEqual([]);

        const kept = yield* as(jo.token, (client) =>
          client.hob.accept({ params: { campaignId: table.id, threadId, turnId }, payload: {} }),
        );
        if (kept.accepted !== "encounter") throw new Error("no encounter was kept");
        const level = yield* as(jo.token, (client) =>
          client.libraryLevels.findById({ params: { levelId: kept.encounter.levelId! } }),
        );
        const drawn = generateLevel(proposal.level!).level;
        expect(level).toMatchObject({
          name: drawn.name,
          description: drawn.description,
          columns: drawn.columns,
          rows: drawn.rows,
          ambient: drawn.ambient,
          origin: "assistant",
        });
        expect(level.walls.length).toBeGreaterThan(0);
        expect(level.walls).toEqual(drawn.walls);
        expect(level.props).toEqual(drawn.props);
        // One level, the generated one: no empty level beside it.
        expect(yield* rowsFrom(turnId)).toEqual([
          { account_id: jo.actor.accountId, origin: "assistant" },
        ]);
      }),
    );

    it.effect("refuses more rooms than the size holds, offering nothing", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const { events, requests } = yield* asked(
          jo.token,
          (client) =>
            client.hob.ask({ params: { campaignId: table.id }, payload: { text: ENCOUNTER_TEXT } }),
          [
            aParley({
              mapSize: "small",
              rooms: Array.from({ length: 9 }, () => ({ purpose: "store" })),
            }),
            textChunks("I could not."),
          ],
        );
        expect(proposedIn(events)).toBeUndefined();
        const said = JSON.stringify(requests[1]?.messages);
        expect(said).toContain("a small level holds at most 6 rooms");
        expect(said).toContain("call proposeEncounter again");
      }),
    );
  });
});
