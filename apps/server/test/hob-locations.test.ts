import { describe, expect } from "@effect/vitest";
import { type HobEvent, type HobProposal, TavernsApi } from "@taverns/api";
import { Context, Effect, Layer, Option, Redacted, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls } from "../src/images/ImageUrls.js";
import { ObjectStorage } from "../src/storage/ObjectStorage.js";
import { aPerson, admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { type Round, scriptedModel, textChunks, toolCallChunks } from "./support/model.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Places, over the wire**: the Library shelf, a table's placements and
 * reveals, the player's narrow read, and Hob's `proposeLocation` kept from
 * each of the three conversations that offer it — a campaign's, a Shared
 * World's and the account's own. Over the real application, so the reach,
 * the toolkit and the accept are the shipped ones; only the model is scripted.
 */

const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-locations", maxTokens: 512, rounds: script });

const database = migratedDatabase("taverns_test_hob_locations");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-locations" }).pipe(Layer.provide(model.layer)),
  undefined,
  ObjectStorage.memory,
  ImageUrls.layer(Redacted.make("hob-locations-secret")),
  HobImages.layer({ generation: Option.none(), storageOn: true }),
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
  const world = yield* as(jo.token, (client) =>
    client.sharedWorlds.create({ payload: { name: "The Drowned Coast" } }),
  );
  const table = yield* as(jo.token, (client) =>
    client.sharedWorlds.createCampaign({
      params: { worldId: world.id },
      payload: { name: "The Salt Road", visibility: "shared" },
    }),
  );
  yield* admittedTo(table.id, pell.actor, "Pell");
  const strangers = yield* as(stranger.token, (client) =>
    client.libraryLocations.create({ payload: { kind: "city", name: "STRANGER_CITY" } }),
  );
  return { jo, pell, stranger, world, table, strangers };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob-locations.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

/** A port town with a district and a tavern in it, as a well-behaved model offers it. */
const aPortTown = (over: Record<string, unknown> = {}) =>
  toolCallChunks("proposeLocation", {
    kind: "town",
    name: "Gullport",
    description: "A fishing town of tarred piers and gull-loud mornings.",
    appearance: "A crescent of piers around a grey harbour, roofs of slate.",
    notes: "HOB_NOTES the harbourmaster takes bribes.",
    parentId: null,
    children: [
      {
        kind: "district",
        name: "The Stacks",
        description: "Net lofts and smokehouses.",
        appearance: null,
        x: 0.3,
        y: 0.65,
        children: [{ kind: "building", name: "The Drowned Lamb", description: null, x: 0.5 }],
      },
    ],
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

/** Ask one of the three Hob surfaces, with these rounds scripted. */
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

const TEXT = "Make me a port town with a district and a tavern in it.";

const rowsFrom = (turnId: string) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) =>
      sql<{ readonly name: string; readonly origin: string; readonly assistant_turn_id: string }>`
      select name, origin, assistant_turn_id from location
      where assistant_turn_id = ${turnId} order by name
    `,
  ).pipe(Effect.orDie);

describeLayer("hob-locations", shared, (it) => {
  describe("the endpoints", () => {
    it.effect("serve the shelf to its owner, and refuse every other reader as NotFound", () =>
      Effect.gen(function* () {
        const { jo, pell, stranger, table, strangers } = yield* Fixture;
        const mine = yield* as(jo.token, (client) =>
          client.libraryLocations.create({
            payload: { kind: "village", name: "Reedholm", notes: "ENDPOINT_NOTES" },
          }),
        );
        expect(
          yield* refusal(stranger.token, (client) =>
            client.libraryLocations.findById({ params: { locationId: mine.id } }),
          ),
        ).toBe("NotFound");
        expect(
          yield* refusal(jo.token, (client) =>
            client.libraryLocations.update({
              params: { locationId: strangers.id },
              payload: { name: "Mine" },
            }),
          ),
        ).toBe("NotFound");

        yield* as(jo.token, (client) =>
          client.locations.place({ params: { campaignId: table.id, locationId: mine.id } }),
        );
        // A player holds no creator proof.
        expect(
          yield* refusal(pell.token, (client) =>
            client.locations.list({ params: { campaignId: table.id } }),
          ),
        ).toBe("NotFound");
        expect(
          yield* refusal(pell.token, (client) =>
            client.locations.reveal({ params: { campaignId: table.id, locationId: mine.id } }),
          ),
        ).toBe("NotFound");
        expect(
          (yield* as(pell.token, (client) =>
            client.playerLocations.list({ params: { campaignId: table.id } }),
          )).map((place) => place.id),
        ).not.toContain(mine.id);

        yield* as(jo.token, (client) =>
          client.locations.reveal({ params: { campaignId: table.id, locationId: mine.id } }),
        );
        const told = yield* as(pell.token, (client) =>
          client.playerLocations.list({ params: { campaignId: table.id } }),
        );
        expect(told.map((place) => place.name)).toContain("Reedholm");
        expect(JSON.stringify(told)).not.toContain("ENDPOINT_NOTES");
        expect(
          yield* refusal(stranger.token, (client) =>
            client.playerLocations.list({ params: { campaignId: table.id } }),
          ),
        ).toBe("NotFound");
      }),
    );
  });

  describe("a campaign's Hob", () => {
    it.effect(
      "offers a place and its children, writes nothing, and the creator's keep places it",
      () =>
        Effect.gen(function* () {
          const { jo, pell, table } = yield* Fixture;
          const { events, requests } = yield* asked(
            jo.token,
            (client) =>
              client.hob.ask({ params: { campaignId: table.id }, payload: { text: TEXT } }),
            [aPortTown(), textChunks("Gullport, on the coast.")],
          );
          const tools = JSON.stringify(requests[0]?.tools);
          expect(tools).toContain("proposeLocation");
          expect(tools).toContain("listLocations");

          const proposal = proposedIn(events);
          expect(proposal).toMatchObject({
            target: "location",
            kind: "town",
            name: "Gullport",
            parent: null,
            children: [
              {
                kind: "district",
                name: "The Stacks",
                appearance: null,
                children: [
                  {
                    kind: "building",
                    name: "The Drowned Lamb",
                    description: null,
                    appearance: null,
                  },
                ],
              },
            ],
          });
          const { threadId, turnId } = begunIn(events);
          expect(yield* rowsFrom(turnId)).toEqual([]);

          // A player at the table cannot keep the DM's offer.
          expect(
            yield* refusal(pell.token, (client) =>
              client.hob.accept({
                params: { campaignId: table.id, threadId, turnId },
                payload: {},
              }),
            ),
          ).toBe("NotFound");

          const kept = yield* as(jo.token, (client) =>
            client.hob.accept({ params: { campaignId: table.id, threadId, turnId }, payload: {} }),
          );
          if (kept.accepted !== "location") throw new Error("no place was kept");
          expect(kept.location).toMatchObject({ name: "Gullport", origin: "assistant" });
          expect(kept.descendants.map((place) => place.name)).toEqual([
            "The Stacks",
            "The Drowned Lamb",
          ]);
          // Hob's layout is where the district stands on the town's map; half
          // a layout is none.
          expect(kept.descendants.map((place) => place.pin)).toEqual([{ x: 0.3, y: 0.65 }, null]);
          expect((yield* rowsFrom(turnId)).map((row) => row.origin)).toEqual([
            "assistant",
            "assistant",
            "assistant",
          ]);

          const atTable = yield* as(jo.token, (client) =>
            client.locations.list({ params: { campaignId: table.id } }),
          );
          expect(atTable.find((place) => place.id === kept.location.id)).toMatchObject({
            placed: true,
            revealed: false,
            mine: true,
          });
          expect(atTable.map((place) => place.name)).toEqual(
            expect.arrayContaining(["The Stacks", "The Drowned Lamb"]),
          );
          // No reveal: the players see nothing yet.
          expect(
            (yield* as(pell.token, (client) =>
              client.playerLocations.list({ params: { campaignId: table.id } }),
            )).map((place) => place.name),
          ).not.toContain("Gullport");

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

    it.effect("refuses to nest a place under somebody else's, to the model", () =>
      Effect.gen(function* () {
        const { jo, table, strangers } = yield* Fixture;
        const { events, requests } = yield* asked(
          jo.token,
          (client) => client.hob.ask({ params: { campaignId: table.id }, payload: { text: TEXT } }),
          [aPortTown({ parentId: strangers.id }), textChunks("I could not.")],
        );
        expect(proposedIn(events)).toBeUndefined();
        expect(JSON.stringify(requests[1]?.messages)).toContain("not one of their places");
        expect(JSON.stringify(requests)).not.toContain("STRANGER_CITY");
      }),
    );
  });

  describe("the account's own Hob", () => {
    it.effect("keeps a place into the Library and puts it in no world", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const { events } = yield* asked(
          jo.token,
          (client) => client.meHob.ask({ payload: { text: TEXT } }),
          [aPortTown({ name: "Saltmere", children: [] }), textChunks("Saltmere.")],
        );
        const { threadId, turnId } = begunIn(events);
        const kept = yield* as(jo.token, (client) =>
          client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
        );
        if (kept.accepted !== "location") throw new Error("no place was kept");
        expect(kept.location.origin).toBe("assistant");
        const appearances = yield* as(jo.token, (client) =>
          client.libraryLocations.appearances({ params: { locationId: kept.location.id } }),
        );
        expect(appearances).toEqual([]);
      }),
    );
  });

  describe("a Shared World's Hob", () => {
    it.effect("keeps a place into the keeper's Library and places it in the world", () =>
      Effect.gen(function* () {
        const { jo, world } = yield* Fixture;
        const { events } = yield* asked(
          jo.token,
          (client) =>
            client.sharedWorldHob.ask({ params: { worldId: world.id }, payload: { text: TEXT } }),
          [aPortTown({ name: "Blackwater", kind: "region", children: [] }), textChunks("Done.")],
        );
        const { threadId, turnId } = begunIn(events);
        const kept = yield* as(jo.token, (client) =>
          client.sharedWorldHob.accept({
            params: { worldId: world.id, threadId, turnId },
            payload: {},
          }),
        );
        if (kept.accepted !== "location") throw new Error("no place was kept");
        const atlas = yield* as(jo.token, (client) =>
          client.sharedWorldLocations.list({ params: { worldId: world.id } }),
        );
        expect(atlas.find((place) => place.id === kept.location.id)).toMatchObject({
          name: "Blackwater",
          placed: true,
        });
      }),
    );
  });

  describe("a campaign's Hob and the party", () => {
    it.effect(
      "offers to move the party to a place at the table, and only the DM's keep moves it",
      () =>
        Effect.gen(function* () {
          const { jo, pell, table, strangers } = yield* Fixture;
          const inn = yield* as(jo.token, (client) =>
            client.libraryLocations.create({ payload: { kind: "building", name: "The Lamb" } }),
          );
          yield* as(jo.token, (client) =>
            client.locations.place({ params: { campaignId: table.id, locationId: inn.id } }),
          );

          // A place not at the table is refused to the model.
          const refused = yield* asked(
            jo.token,
            (client) =>
              client.hob.ask({
                params: { campaignId: table.id },
                payload: { text: "The party walks into the city." },
              }),
            [
              toolCallChunks("proposePartyMove", { locationId: strangers.id }),
              textChunks("I could not."),
            ],
          );
          expect(proposedIn(refused.events)).toBeUndefined();
          expect(JSON.stringify(refused.requests[1]?.messages)).toContain(
            "not a place at this table",
          );

          const { events } = yield* asked(
            jo.token,
            (client) =>
              client.hob.ask({
                params: { campaignId: table.id },
                payload: { text: "The party heads to the Lamb." },
              }),
            [
              toolCallChunks("proposePartyMove", { locationId: inn.id }),
              textChunks("Off they go."),
            ],
          );
          expect(proposedIn(events)).toEqual({
            target: "partyMove",
            locationId: inn.id,
            locationName: "The Lamb",
          });
          const { threadId, turnId } = begunIn(events);
          expect(
            yield* as(jo.token, (client) =>
              client.partyTravel.list({ params: { campaignId: table.id } }),
            ),
          ).toEqual([]);

          const kept = yield* as(jo.token, (client) =>
            client.hob.accept({ params: { campaignId: table.id, threadId, turnId }, payload: {} }),
          );
          if (kept.accepted !== "partyMove") throw new Error("no move was kept");
          expect(kept.move).toMatchObject({ locationName: "The Lamb", origin: "assistant" });
          const told = yield* as(pell.token, (client) =>
            client.playerPartyTravel.list({ params: { campaignId: table.id } }),
          );
          expect(told[0]).toMatchObject({ locationId: inn.id, locationName: "The Lamb" });
        }),
    );
  });
});
