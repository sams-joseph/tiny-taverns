import { describe, expect } from "@effect/vitest";
import { TavernsApi } from "@taverns/api";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls } from "../src/images/ImageUrls.js";
import { ObjectStorage } from "../src/storage/ObjectStorage.js";
import { aPerson, admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedImages } from "./support/imageModel.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A place's picture and its pins, over the wire.** A place made by hand is
 * drawn once as it is made, by its owner; a place with no picture record can
 * be drawn once more by its owner and by nobody else; every reader who may
 * see the place sees its picture, and a pin shows only where its parent does.
 */

const images = scriptedImages({ apiUrl: "https://api.openai.com/v1", model: "place-maps" });

const database = migratedDatabase("taverns_test_location_images");
const services = servicesOver(
  database,
  undefined,
  undefined,
  undefined,
  ObjectStorage.memory,
  ImageUrls.layer(Redacted.make("location-images-secret")),
  HobImages.layer({
    generation: Option.some({ limits: { perAccountPerDay: 20, perDay: 100 }, concurrency: 2 }),
    storageOn: true,
  }).pipe(Layer.provide(images.layer)),
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

const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
    ),
  ).pipe(Effect.orDie);

const settled = Effect.flatMap(HobImages, (worker) => worker.idle);

const recordsOf = (locationId: string) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) =>
      sql<{ readonly state: string; readonly prompt: string | null }>`
      select state, prompt from location_image where location_id = ${locationId}
    `,
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
  return { jo, pell, stranger, world, table };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "location-images.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describeLayer("location-images", shared, (it) => {
  describe("the picture", () => {
    it.effect("is drawn once as a place is made, as a map from what it says it looks like", () =>
      Effect.gen(function* () {
        const { jo, stranger } = yield* Fixture;
        const town = yield* as(jo.token, (client) =>
          client.libraryLocations.create({
            payload: {
              kind: "town",
              name: "Gullport",
              appearance: "A crescent of tarred piers around a grey harbour.",
              notes: "NOTES_NEVER_DRAWN",
            },
          }),
        );
        expect(town).toMatchObject({ imagePending: true, pictured: true });
        yield* settled;

        const [record] = yield* recordsOf(town.id);
        expect(record?.state).toBe("ready");
        expect(record?.prompt).toContain("A map for a tabletop roleplaying game of a whole town");
        expect(record?.prompt).toContain("A crescent of tarred piers");
        expect(record?.prompt).not.toContain("NOTES_NEVER_DRAWN");

        const read = yield* as(jo.token, (client) =>
          client.libraryLocations.findById({ params: { locationId: town.id } }),
        );
        expect(read.image?.fullUrl).toContain("/location-images/");
        expect(read.imagePending).toBe(false);

        // Drawn once: asking again starts nothing, and nobody else may ask.
        yield* as(jo.token, (client) =>
          client.libraryLocations.draw({ params: { locationId: town.id } }),
        );
        yield* settled;
        expect((yield* recordsOf(town.id)).length).toBe(1);
        expect(
          yield* refusal(stranger.token, (client) =>
            client.libraryLocations.draw({ params: { locationId: town.id } }),
          ),
        ).toBe("NotFound");
      }),
    );

    it.effect("is seen by a player only once the place is revealed to their table", () =>
      Effect.gen(function* () {
        const { jo, pell, table } = yield* Fixture;
        const keep = yield* as(jo.token, (client) =>
          client.libraryLocations.create({ payload: { kind: "landmark", name: "Grey Keep" } }),
        );
        yield* settled;
        yield* as(jo.token, (client) =>
          client.locations.place({ params: { campaignId: table.id, locationId: keep.id } }),
        );
        const atTable = yield* as(jo.token, (client) =>
          client.locations.list({ params: { campaignId: table.id } }),
        );
        expect(atTable.find((place) => place.id === keep.id)?.image?.cardUrl).toContain(
          "/location-images/",
        );
        expect(
          (yield* as(pell.token, (client) =>
            client.playerLocations.list({ params: { campaignId: table.id } }),
          )).map((place) => place.id),
        ).not.toContain(keep.id);

        yield* as(jo.token, (client) =>
          client.locations.reveal({ params: { campaignId: table.id, locationId: keep.id } }),
        );
        const told = yield* as(pell.token, (client) =>
          client.playerLocations.list({ params: { campaignId: table.id } }),
        );
        expect(told.find((place) => place.id === keep.id)?.image?.fullUrl).toContain(
          "/location-images/",
        );
        const [record] = yield* recordsOf(keep.id);
        expect(record?.prompt).toContain("A picture for a tabletop roleplaying game of a landmark");
      }),
    );
  });

  describe("the pins", () => {
    it.effect("are the owner's to set on a place with a parent, and go with a new parent", () =>
      Effect.gen(function* () {
        const { jo, stranger } = yield* Fixture;
        const region = yield* as(jo.token, (client) =>
          client.libraryLocations.create({ payload: { kind: "region", name: "The Fens" } }),
        );
        const other = yield* as(jo.token, (client) =>
          client.libraryLocations.create({ payload: { kind: "region", name: "The Downs" } }),
        );
        const village = yield* as(jo.token, (client) =>
          client.libraryLocations.create({
            payload: { kind: "village", name: "Reedholm", parentId: region.id },
          }),
        );
        yield* settled;

        const pinned = yield* as(jo.token, (client) =>
          client.libraryLocations.update({
            params: { locationId: village.id },
            payload: { pin: { x: 0.25, y: 0.75 } },
          }),
        );
        expect(pinned.pin).toEqual({ x: 0.25, y: 0.75 });
        expect(
          yield* refusal(stranger.token, (client) =>
            client.libraryLocations.update({
              params: { locationId: village.id },
              payload: { pin: { x: 0.5, y: 0.5 } },
            }),
          ),
        ).toBe("NotFound");
        expect(
          yield* refusal(jo.token, (client) =>
            client.libraryLocations.update({
              params: { locationId: region.id },
              payload: { pin: { x: 0.5, y: 0.5 } },
            }),
          ),
        ).toBe("Conflict");

        const moved = yield* as(jo.token, (client) =>
          client.libraryLocations.update({
            params: { locationId: village.id },
            payload: { parentId: other.id },
          }),
        );
        expect(moved.pin).toBeNull();
      }),
    );

    it.effect("show a player only when the parent is revealed too", () =>
      Effect.gen(function* () {
        const { jo, pell, table } = yield* Fixture;
        const city = yield* as(jo.token, (client) =>
          client.libraryLocations.create({ payload: { kind: "city", name: "Varnhold" } }),
        );
        const inn = yield* as(jo.token, (client) =>
          client.libraryLocations.create({
            payload: { kind: "building", name: "The Lamb", parentId: city.id },
          }),
        );
        yield* settled;
        yield* as(jo.token, (client) =>
          client.libraryLocations.update({
            params: { locationId: inn.id },
            payload: { pin: { x: 0.4, y: 0.6 } },
          }),
        );
        yield* as(jo.token, (client) =>
          client.locations.place({ params: { campaignId: table.id, locationId: city.id } }),
        );
        yield* as(jo.token, (client) =>
          client.locations.reveal({ params: { campaignId: table.id, locationId: inn.id } }),
        );
        const alone = yield* as(pell.token, (client) =>
          client.playerLocations.list({ params: { campaignId: table.id } }),
        );
        expect(alone.find((place) => place.id === inn.id)).toMatchObject({
          parentId: null,
          pin: null,
        });

        yield* as(jo.token, (client) =>
          client.locations.reveal({ params: { campaignId: table.id, locationId: city.id } }),
        );
        const both = yield* as(pell.token, (client) =>
          client.playerLocations.list({ params: { campaignId: table.id } }),
        );
        expect(both.find((place) => place.id === inn.id)).toMatchObject({
          parentId: city.id,
          pin: { x: 0.4, y: 0.6 },
        });
      }),
    );
  });
});
