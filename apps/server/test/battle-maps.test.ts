import { describe, expect } from "@effect/vitest";
import {
  type Actor,
  type CampaignId,
  CurrentActor,
  type Encounter,
  type EncounterCreate,
  type EncounterId,
  type EncounterRunId,
  type HobEvent,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Option, Redacted, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls, signedPath } from "../src/images/ImageUrls.js";
import { Creatures } from "../src/repo/Creatures.js";
import { ImageRecords } from "../src/repo/Images.js";
import { ObjectStorage, StorageKey } from "../src/storage/ObjectStorage.js";
import {
  type Person,
  aCharacterAt,
  aGroupMemberAt,
  aPerson,
  admittedTo,
  asDm,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedImages } from "./support/imageModel.js";
import { type Round, scriptedModel, textChunks, toolCallChunks } from "./support/model.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Every encounter has one battle map, and Hob draws its picture once, as the
 * encounter is made, from its setting line or, without one, its name, tags and
 * roster types — for the creator's eyes only.** The
 * fifth kind of Hob-drawn image, over the same worker, signer, records and
 * daily ledger as the portraits and covers (`npc-images.test.ts`).
 *
 * Over the real application: the real handlers, the real worker, `sharp`, the
 * memory storage adapter and Postgres. The image endpoint and Hob's model are
 * scripted (`support/imageModel.ts`, `support/model.ts`), so no request here
 * leaves the process.
 */

const OPENAI = "https://api.openai.com/v1";
const MODEL = "gpt-image-2.5-flare";
const SECRET = Redacted.make("battle-map-test-secret");
const PER_ACCOUNT = 12;

const images = scriptedImages({ apiUrl: OPENAI, model: MODEL });

/**
 * Hob's script, filled in once the creature it names exists: the model is
 * read round by round, so a round pushed before the ask is the one it plays.
 */
const rounds: Array<Round> = [];
const chat = scriptedModel({ model: "scripted-local", maxTokens: 512, rounds });

/** The clock image URLs are minted and checked against. */
const now = Date.now();

const database = migratedDatabase("taverns_test_battle_maps");
const urls = ImageUrls.layer(SECRET, () => now);
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(chat.layer)),
  undefined,
  ObjectStorage.memory,
  urls,
  HobImages.layer({
    generation: Option.some({
      limits: { perAccountPerDay: PER_ACCOUNT, perDay: 100 },
      concurrency: 2,
    }),
    storageOn: true,
  }).pipe(Layer.provide(images.layer)),
);

const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(ImageRecords.layer),
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
const attempt = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), call).pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catch((error: unknown) =>
      Effect.succeed({
        ok: false as const,
        tag:
          typeof error === "object" && error !== null && "_tag" in error
            ? String(error._tag)
            : "unknown",
      }),
    ),
  );

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

/** Wait for every drawing job to finish. */
const settled = Effect.flatMap(HobImages, (worker) => worker.idle);

/** Fetch a path as an `<img>` does. */
const load = (path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(path);
    const bytes = new Uint8Array(yield* response.arrayBuffer);
    return { status: response.status, bytes };
  }).pipe(Effect.orDie);

/** A PATCH the derived client would refuse to encode, sent as it stands. */
const rawPatch = (token: string, path: string, body: unknown) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.patch(path).pipe(
        HttpClientRequest.bearerToken(token),
        HttpClientRequest.bodyJsonUnsafe(body),
      ),
    );
    return response.status;
  }).pipe(Effect.orDie);

interface Record {
  readonly id: string;
  readonly campaign_id: string;
  readonly account_id: string;
  readonly state: string;
  readonly failure: string | null;
  readonly prompt: string | null;
  readonly model: string | null;
  readonly storage_prefix: string;
}

const recordOf = (mapId: string) =>
  sql((sql) => sql<Record>`select * from battle_map_image where map_id = ${mapId}`).pipe(
    Effect.map((rows) => rows[0]),
  );

const spentBy = (who: Person) =>
  sql(
    (sql) => sql<{ readonly count: number }>`
      select count(*)::int as count from image_spend where account_id = ${who.actor.accountId}
    `,
  ).pipe(Effect.map((rows) => rows[0]?.count ?? 0));

const stored = (key: string) =>
  Effect.flatMap(ObjectStorage, (objects) => objects.head(StorageKey(key))).pipe(
    Effect.orDie,
    Effect.map(Option.isSome),
  );

const FILES = ["original.png", "card.webp", "full.webp"];

/** The requests that asked for a battle map, told apart from covers by the prompt. */
const mapRequests = () =>
  images.requests().filter((request) => String(request.prompt).startsWith("Top-down battle map"));

const campaignOf = (who: Person, name: string) =>
  as(who.token, (client) => client.campaigns.create({ payload: { name } })).pipe(
    Effect.tap(() => settled),
    Effect.map((campaign) => campaign.id),
  );

const encounterAt = (who: Person, campaignId: CampaignId, payload: EncounterCreate) =>
  as(who.token, (client) => client.encounters.create({ params: { campaignId }, payload }));

const mapOf = (who: Person, campaignId: CampaignId, encounterId: EncounterId) =>
  as(who.token, (client) => client.battleMaps.find({ params: { campaignId, encounterId } }));

const REEDS: EncounterCreate = {
  name: "Ambush in the reeds",
  tags: ["Marsh", "Night"],
  setting: "A boardwalk over black water, reed beds on both sides and a sunken barge",
};

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const table = yield* campaignOf(jo, "The Salt Road");
  return { jo, ilse, stranger, table };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "battle-maps.test/Fixture",
) {}

const makeReeds = Effect.gen(function* () {
  const { jo, table } = yield* Fixture;
  const requestsBefore = mapRequests().length;
  const encounter = yield* encounterAt(jo, table, REEDS);
  yield* settled;
  const map = yield* mapOf(jo, table, encounter.id);
  return { encounter, map, requestsBefore };
});

/** The encounter made from `REEDS`, its map, and the request count before it. */
class Reeds extends Context.Service<Reeds, Effect.Success<typeof makeReeds>>()(
  "battle-maps.test/Reeds",
) {}

const makeYard = Effect.gen(function* () {
  const { jo, table } = yield* Fixture;
  const encounterId = (yield* encounterAt(jo, table, { name: "The yard" })).id;
  yield* settled;
  return encounterId;
});

/** The encounter whose grid "the grid" edits. */
class Yard extends Context.Service<Yard, EncounterId>()("battle-maps.test/Yard") {}

const makeShown = Effect.gen(function* () {
  const { jo, ilse, table } = yield* Fixture;
  yield* as(jo.token, (client) =>
    client.campaigns.update({ params: { campaignId: table }, payload: { visibility: "shared" } }),
  );
  const shown: Encounter = yield* encounterAt(jo, table, {
    ...REEDS,
    name: "Shown to the table",
    setting: "SETTING-A-SECRET-DOOR in the east wall",
    visibility: "shared",
    ready: true,
  });
  yield* settled;
  const player: Actor = yield* admittedTo(table, ilse.actor, "Ilse").pipe(Effect.orDie);
  const bystander: Actor = yield* aGroupMemberAt(table, "Wren").pipe(Effect.orDie);
  return { shown, player, bystander };
});

/** A shared, Ready encounter on the shared table, with a player and a member. */
class Shown extends Context.Service<Shown, Effect.Success<typeof makeShown>>()(
  "battle-maps.test/Shown",
) {}

/**
 * The pier with its picture drawn. Written once per fight: an encounter is
 * played once (`playthroughOf` in `repo/EncounterRuns.ts`).
 */
const aPier = (kit: Person, own: CampaignId) =>
  Effect.gen(function* () {
    const encounter = yield* encounterAt(kit, own, {
      name: "On the pier",
      setting: "SETTING-A-ROTTEN-PIER over a grey harbour",
      visibility: "shared",
    });
    yield* settled;
    const drawn = yield* mapOf(kit, own, encounter.id);
    expect(drawn.image).not.toBeNull();
    return { pier: encounter, map: drawn };
  });

const makeKit = Effect.gen(function* () {
  const kit = yield* aPerson("Kit");
  const own = yield* campaignOf(kit, "Kit's Table");
  yield* as(kit.token, (client) =>
    client.campaigns.update({ params: { campaignId: own }, payload: { visibility: "shared" } }),
  );
  const { pier, map } = yield* aPier(kit, own);
  return { kit, own, pier, map };
});

/** Kit's shared table and its first pier, for "a fight keeps its board". */
class Kit extends Context.Service<Kit, Effect.Success<typeof makeKit>>()("battle-maps.test/Kit") {}

describeLayer(
  "battle-maps",
  Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application)),
  (it) => {
    it.layer(Layer.effect(Reeds)(makeReeds))(
      "making an encounter draws its battle map once",
      (it) => {
        it.effect(
          "draws one picture at the cover's size, billed to the creator, and ends ready",
          () =>
            Effect.gen(function* () {
              const { jo, table } = yield* Fixture;
              const { map, requestsBefore } = yield* Reeds;
              expect(mapRequests().length - requestsBefore).toBe(1);
              const record = yield* recordOf(map.id);
              expect(record?.state).toBe("ready");
              expect(record?.account_id).toBe(jo.actor.accountId);
              expect(record?.campaign_id).toBe(table);
              expect(record?.storage_prefix).toBe(
                `battle-map-images/${jo.actor.accountId}/${map.id}/${record!.id}`,
              );
              for (const file of FILES) {
                expect(yield* stored(`${record!.storage_prefix}/${file}`)).toBe(true);
              }
              const body = mapRequests().find((request) => request.prompt === record?.prompt);
              expect(body?.size).toBe("1536x1024");
              expect(body?.model).toBe(MODEL);
            }),
        );

        it.effect("draws top-down, with no grid and no creatures, from the setting line", () =>
          Effect.gen(function* () {
            const { map } = yield* Reeds;
            const prompt = (yield* recordOf(map.id))!.prompt!;
            expect(prompt).toContain("A boardwalk over black water, reed beds on both sides");
            expect(prompt).toContain("Ambush in the reeds");
            expect(prompt).toContain("Marsh, Night");
            expect(prompt.toLowerCase()).toContain("top-down");
            expect(prompt.toLowerCase()).toContain("no grid");
            expect(prompt.toLowerCase()).toContain("no creatures");
          }),
        );

        it.effect("answers the creator's map read with the board and the signed picture", () =>
          Effect.gen(function* () {
            const { table } = yield* Fixture;
            const { encounter, map } = yield* Reeds;
            expect(map.encounterId).toBe(encounter.id);
            expect(map.campaignId).toBe(table);
            expect(map.setting).toBe(REEDS.setting);
            expect(map.grid).toBe("square");
            expect([map.columns, map.rows, map.feetPerCell]).toEqual([24, 16, 5]);
            expect(map.alignment).toEqual({ cellPx: 64, offsetXPx: 0, offsetYPx: 0 });
            expect(map.imagePending).toBe(false);
            // The scripted provider answers a 1 × 1 picture: the original's size is
            // what the grid is measured in.
            expect([map.image?.width, map.image?.height]).toEqual([1, 1]);

            const sharp = (yield* Effect.promise(() => import("sharp"))).default;
            for (const path of [map.image!.cardUrl, map.image!.fullUrl]) {
              expect(path).toMatch(/^\/battle-map-images\/[0-9a-f-]+\/(card|full)\?e=\d+&s=/);
              const response = yield* load(path);
              expect(response.status).toBe(200);
              // Never cropped: a square answer stays square inside the 3:2 box.
              const metadata = yield* Effect.promise(() => sharp(response.bytes).metadata());
              expect(metadata.width).toBe(metadata.height);
            }
          }),
        );

        it.effect("refuses a URL signed for another kind or tampered with", () =>
          Effect.gen(function* () {
            const { map } = yield* Reeds;
            const url = new URL(map.image!.cardUrl, "http://x");
            const imageId = url.pathname.split("/")[2]!;
            const signature = url.searchParams.get("s")!;
            const cases = [
              map.image!.cardUrl.replace(signature, `${signature.slice(0, -2)}AA`),
              map.image!.cardUrl.replace("/card?", "/full?"),
              map.image!.cardUrl.replace("/battle-map-images/", "/campaign-images/"),
              signedPath(SECRET, "campaign", imageId, "card", now).replace(
                "/campaign-images/",
                "/battle-map-images/",
              ),
              map.image!.cardUrl.replace(/\?.*$/, ""),
            ];
            for (const path of cases) expect((yield* load(path)).status, path).toBe(404);
          }),
        );

        it.effect("gives a new encounter no map field: the map is its own read", () =>
          Effect.gen(function* () {
            const { encounter } = yield* Reeds;
            expect(JSON.stringify(encounter)).not.toContain("battle-map-images");
            expect(JSON.stringify(encounter)).not.toContain("boardwalk");
          }),
        );

        it.effect("is drawn once: editing the setting line redraws nothing", () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Fixture;
            const { encounter, map } = yield* Reeds;
            const before = mapRequests().length;
            yield* as(jo.token, (client) =>
              client.encounters.update({
                params: { campaignId: table, encounterId: encounter.id },
                payload: { setting: "  A drier boardwalk  " },
              }),
            );
            yield* settled;
            expect(mapRequests().length).toBe(before);
            const edited = yield* mapOf(jo, table, encounter.id);
            expect(edited.setting).toBe("A drier boardwalk");
            expect(edited.image).toEqual(map.image);

            yield* as(jo.token, (client) =>
              client.encounters.update({
                params: { campaignId: table, encounterId: encounter.id },
                payload: { setting: null },
              }),
            );
            expect((yield* mapOf(jo, table, encounter.id)).setting).toBeNull();
          }),
        );
      },
    );

    describe("Hob's accepted encounter", () => {
      it.effect("draws its map from the setting Hob wrote, never from the roster", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const croaker = yield* Effect.flatMap(Creatures, (creatures) =>
            creatures.libraryCreate({
              name: "Bullywug Croaker",
              type: "humanoid",
              size: "Medium",
              cr: "1/4",
              ac: 15,
              hp: 11,
            }),
          ).pipe(Effect.provideService(CurrentActor, jo.actor), Effect.orDie);
          rounds.push(
            toolCallChunks("proposeEncounter", {
              name: "Song in the reeds",
              tags: ["Marsh"],
              setting: "A flooded causeway between two stone huts",
              creatures: [{ creatureId: croaker.id, count: 3 }],
            }),
            textChunks("There you are."),
          );
          const events = yield* Effect.gen(function* () {
            const hob = yield* Hob;
            const stream = yield* hob.ask(table, { text: "A fight in the marsh." });
            return Array.from(yield* Stream.runCollect(stream)) as ReadonlyArray<HobEvent>;
          }).pipe(Effect.provideService(CurrentActor, jo.actor), Effect.orDie);
          const began = events.find((event) => event.event === "began");
          if (began?.event !== "began") throw new Error("no began event");
          const proposed = events.find((event) => event.event === "proposal");
          expect(proposed?.event === "proposal" && proposed.data.proposal).toMatchObject({
            target: "encounter",
            setting: "A flooded causeway between two stone huts",
          });

          const before = mapRequests().length;
          const accepted = yield* as(jo.token, (client) =>
            client.hob.accept({
              params: {
                campaignId: table,
                threadId: began.data.threadId,
                turnId: began.data.turnId,
              },
              payload: {},
            }),
          );
          if (accepted.accepted !== "encounter") throw new Error("accepted something else");
          yield* settled;

          expect(mapRequests().length - before).toBe(1);
          const map = yield* mapOf(jo, table, accepted.encounter.id);
          expect(map.setting).toBe("A flooded causeway between two stone huts");
          expect(map.image).not.toBeNull();
          const prompt = (yield* recordOf(map.id))!.prompt!;
          expect(prompt).toContain("A flooded causeway between two stone huts");
          expect(prompt).not.toContain("Bullywug");
          expect(prompt).not.toContain("Croaker");
        }),
      );
    });

    describe("an encounter with only a name", () => {
      it.effect("still draws once, from its name and tags, and counts against the day", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const before = mapRequests().length;
          const spent = yield* spentBy(jo);
          const encounter = yield* encounterAt(jo, table, {
            name: "Goblin ambush",
            tags: ["Road"],
          });
          yield* settled;
          expect(mapRequests().length - before).toBe(1);
          expect(yield* spentBy(jo)).toBe(spent + 1);
          const map = yield* mapOf(jo, table, encounter.id);
          expect(map.setting).toBeNull();
          expect(map.image).not.toBeNull();
          expect([map.grid, map.columns, map.rows]).toEqual(["square", 24, 16]);
          const prompt = (yield* recordOf(map.id))!.prompt!;
          expect(prompt).toContain("a fight called Goblin ambush");
          expect(prompt).toContain("Its feel: Road.");
          expect(prompt.toLowerCase()).toContain("no creatures");
          // The form's create carries no roster, so there are no types to read.
          expect(prompt).not.toContain("would be found");
        }),
      );

      it.effect("reads the types on Hob's accepted roster, never the creatures' names", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const hag = yield* Effect.flatMap(Creatures, (creatures) =>
            creatures.libraryCreate({
              name: "Mirelight Hag",
              type: "Fey",
              size: "Medium",
              cr: "2",
              ac: 14,
              hp: 40,
            }),
          ).pipe(Effect.provideService(CurrentActor, jo.actor), Effect.orDie);
          rounds.push(
            toolCallChunks("proposeEncounter", {
              name: "Lights on the water",
              creatures: [{ creatureId: hag.id, count: 1 }],
            }),
            textChunks("There you are."),
          );
          const events = yield* Effect.gen(function* () {
            const hob = yield* Hob;
            const stream = yield* hob.ask(table, { text: "Something eerie." });
            return Array.from(yield* Stream.runCollect(stream)) as ReadonlyArray<HobEvent>;
          }).pipe(Effect.provideService(CurrentActor, jo.actor), Effect.orDie);
          const began = events.find((event) => event.event === "began");
          if (began?.event !== "began") throw new Error("no began event");

          const before = mapRequests().length;
          const accepted = yield* as(jo.token, (client) =>
            client.hob.accept({
              params: {
                campaignId: table,
                threadId: began.data.threadId,
                turnId: began.data.turnId,
              },
              payload: {},
            }),
          );
          if (accepted.accepted !== "encounter") throw new Error("accepted something else");
          yield* settled;

          expect(mapRequests().length - before).toBe(1);
          const map = yield* mapOf(jo, table, accepted.encounter.id);
          const prompt = (yield* recordOf(map.id))!.prompt!;
          expect(prompt).toContain("a fight called Lights on the water");
          expect(prompt).toContain("where fey creatures would be found");
          expect(prompt).not.toContain("Mirelight");
          expect(prompt).not.toContain("Hag");
        }),
      );
    });

    describe("when there is no picture", () => {
      it.effect("records a refusal and still keeps the board", () =>
        Effect.gen(function* () {
          const bram = yield* aPerson("Bram");
          const own = yield* campaignOf(bram, "Bram's Table");
          images.next({ kind: "refused" });
          const encounter = yield* encounterAt(bram, own, {
            name: "Red",
            setting: "A butcher's yard",
          });
          yield* settled;
          const map = yield* mapOf(bram, own, encounter.id);
          expect(map.image).toBeNull();
          expect((yield* recordOf(map.id))?.failure).toBe("refused");
        }),
      );

      it.effect(
        "spends the one daily budget covers and portraits spend, and is capped with them",
        () =>
          Effect.gen(function* () {
            // A fresh account: its cover and its maps count against one per-account
            // limit, so the map after the cover and PER_ACCOUNT - 1 maps is capped.
            const tam = yield* aPerson("Tam");
            const own = yield* campaignOf(tam, "Tam's Table");
            for (let index = 0; index < PER_ACCOUNT - 1; index += 1) {
              yield* encounterAt(tam, own, {
                name: `Fight ${String(index)}`,
                setting: "A cave mouth",
              });
            }
            yield* settled;
            expect(yield* spentBy(tam)).toBe(PER_ACCOUNT);
            const before = mapRequests().length;
            const over = yield* encounterAt(tam, own, {
              name: "One more",
              setting: "A cold hillside",
            });
            yield* settled;
            expect(mapRequests().length).toBe(before);
            const map = yield* mapOf(tam, own, over.id);
            expect(map.image).toBeNull();
            const record = yield* recordOf(map.id);
            expect(record?.failure).toBe("capped");
            expect(record?.prompt).toContain("A cold hillside");
          }),
      );
    });

    describe("deleting an encounter", () => {
      it.effect("deletes its map, queues and drains the picture's files, and keeps the spend", () =>
        Effect.gen(function* () {
          const vale = yield* aPerson("Vale");
          const own = yield* campaignOf(vale, "Vale's Table");
          const encounter = yield* encounterAt(vale, own, {
            name: "Brief",
            setting: "A narrow bridge",
          });
          yield* settled;
          const map = yield* mapOf(vale, own, encounter.id);
          const record = (yield* recordOf(map.id))!;
          for (const file of FILES) {
            expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(true);
          }
          const spent = yield* spentBy(vale);

          yield* as(vale.token, (client) =>
            client.encounters.remove({ params: { campaignId: own, encounterId: encounter.id } }),
          );
          expect(yield* recordOf(map.id)).toBeUndefined();
          const maps = yield* sql(
            (sql) => sql`select id from battle_map where encounter_id = ${encounter.id}`,
          );
          expect(maps).toHaveLength(0);
          expect(
            yield* attempt(vale.token, (client) =>
              client.battleMaps.find({ params: { campaignId: own, encounterId: encounter.id } }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });

          yield* Effect.flatMap(HobImages, (worker) => worker.drainDeletions).pipe(Effect.orDie);
          for (const file of FILES) {
            expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(false);
          }
          // The draw was paid for; deleting the encounter gives nothing back.
          expect(yield* spentBy(vale)).toBe(spent);
        }),
      );
    });

    describe("deleting a campaign permanently", () => {
      it.effect(
        "takes its encounters' maps and pictures, queues the files, and keeps the spend",
        () =>
          Effect.gen(function* () {
            const rue = yield* aPerson("Rue");
            const doomed = yield* campaignOf(rue, "Doomed Table");
            const encounter = yield* encounterAt(rue, doomed, {
              name: "Last",
              setting: "A burning jetty",
            });
            yield* settled;
            const map = yield* mapOf(rue, doomed, encounter.id);
            const record = (yield* recordOf(map.id))!;
            expect(record.state).toBe("ready");
            const spent = yield* spentBy(rue);

            yield* as(rue.token, (client) =>
              client.campaigns.deletePermanently({ params: { campaignId: doomed } }),
            );
            const left = yield* sql(
              (sql) => sql<{ readonly maps: number; readonly images: number }>`
              select
                (select count(*)::int from battle_map where campaign_id = ${doomed}) as maps,
                (select count(*)::int from battle_map_image where campaign_id = ${doomed}) as images
            `,
            );
            expect(left[0]).toEqual({ maps: 0, images: 0 });
            const queued = yield* sql(
              (sql) => sql<{ readonly count: number }>`
              select count(*)::int as count from storage_deletion where prefix = ${record.storage_prefix}
            `,
            );
            expect(queued[0]?.count).toBe(1);
            yield* Effect.flatMap(HobImages, (worker) => worker.drainDeletions).pipe(Effect.orDie);
            for (const file of FILES) {
              expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(false);
            }
            expect(yield* spentBy(rue)).toBe(spent);
          }),
      );
    });

    it.layer(Layer.effect(Yard)(makeYard))("the grid", (it) => {
      it.effect("is changed in place by the creator, and read back", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const encounterId = yield* Yard;
          const updated = yield* as(jo.token, (client) =>
            client.battleMaps.update({
              params: { campaignId: table, encounterId },
              payload: {
                grid: "none",
                columns: 20,
                rows: 12,
                feetPerCell: 10,
                alignment: { cellPx: 76.8, offsetXPx: 12.5, offsetYPx: 0 },
              },
            }),
          );
          expect(updated.grid).toBe("none");
          expect([updated.columns, updated.rows, updated.feetPerCell]).toEqual([20, 12, 10]);
          expect(updated.alignment).toEqual({ cellPx: 76.8, offsetXPx: 12.5, offsetYPx: 0 });
          expect(yield* mapOf(jo, table, encounterId)).toEqual(updated);

          // A partial patch leaves the rest alone.
          const squared = yield* as(jo.token, (client) =>
            client.battleMaps.update({
              params: { campaignId: table, encounterId },
              payload: { grid: "square" },
            }),
          );
          expect([squared.grid, squared.columns, squared.alignment.cellPx]).toEqual([
            "square",
            20,
            76.8,
          ]);
        }),
      );

      it.effect("refuses an offset of a square or more, a hex grid and an empty board", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const encounterId = yield* Yard;
          const path = `/campaigns/${table}/encounters/${encounterId}/map`;
          for (const body of [
            { alignment: { cellPx: 64, offsetXPx: 64, offsetYPx: 0 } },
            { alignment: { cellPx: 64, offsetXPx: 0, offsetYPx: -1 } },
            { alignment: { cellPx: 64 } },
            { grid: "hex" },
            { columns: 0 },
            { rows: 201 },
            { feetPerCell: 0 },
          ]) {
            expect(yield* rawPatch(jo.token, path, body), JSON.stringify(body)).toBe(400);
          }
          expect((yield* mapOf(jo, table, encounterId)).columns).toBe(20);
        }),
      );

      it.effect("is refused by the table's own checks too", () =>
        Effect.gen(function* () {
          const encounterId = yield* Yard;
          const outside = yield* Effect.flatMap(
            SqlClient.SqlClient,
            (sql) => sql`
              update battle_map set offset_x_px = cell_px where encounter_id = ${encounterId}
            `,
          ).pipe(Effect.result);
          expect(outside._tag).toBe("Failure");
        }),
      );
    });

    describe("one map per encounter, in its own campaign", () => {
      it.effect(
        "refuses a second map for an encounter, and a map filed under another campaign",
        () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Fixture;
            const encounter = yield* encounterAt(jo, table, { name: "Keyed" });
            const other = yield* campaignOf(jo, "Elsewhere");
            const insert = (campaignId: CampaignId) =>
              Effect.flatMap(
                SqlClient.SqlClient,
                (sql) => sql`
                insert into battle_map (encounter_id, campaign_id)
                values (${encounter.id}, ${campaignId})
              `,
              ).pipe(Effect.result);
            expect((yield* insert(table))._tag).toBe("Failure");
            expect((yield* insert(other))._tag).toBe("Failure");
          }),
      );
    });

    it.layer(Layer.effect(Shown)(makeShown))("the map is the creator's alone", (it) => {
      it.effect(
        "answers a player, a Shared World member and a stranger NotFound on every map endpoint",
        () =>
          Effect.gen(function* () {
            const { jo, ilse, stranger, table } = yield* Fixture;
            const { shown, player, bystander } = yield* Shown;
            const params = { campaignId: table, encounterId: shown.id };
            for (const who of [ilse, stranger]) {
              expect(
                yield* attempt(who.token, (client) => client.battleMaps.find({ params })),
              ).toEqual({
                ok: false,
                tag: "NotFound",
              });
              expect(
                yield* attempt(who.token, (client) =>
                  client.battleMaps.update({ params, payload: { grid: "none" } }),
                ),
              ).toEqual({ ok: false, tag: "NotFound" });
            }
            // The proof the map reads require: the player and the member cannot get one.
            for (const actor of [player, bystander]) {
              const proof = yield* Effect.result(asDm(actor, table));
              expect(proof._tag).toBe("Failure");
            }
            expect((yield* mapOf(jo, table, shown.id)).grid).toBe("square");
          }),
      );

      it.effect("puts no map, setting or picture on a player's reads of a shared encounter", () =>
        Effect.gen(function* () {
          const { ilse, table } = yield* Fixture;
          const { shown } = yield* Shown;
          const found = yield* as(ilse.token, (client) =>
            client.playerEncounters.find({ params: { campaignId: table, encounterId: shown.id } }),
          );
          const listed = yield* as(ilse.token, (client) =>
            client.playerEncounters.list({ params: { campaignId: table } }),
          );
          expect(listed.map((entry) => entry.id)).toContain(shown.id);
          for (const read of [found, listed]) {
            const text = JSON.stringify(read);
            expect(text).not.toContain("battle-map-images");
            expect(text).not.toContain("SETTING-A-SECRET-DOOR");
          }
        }),
      );

      it.effect(
        "puts no map on the live player table while the fight is shared and the map is not shown",
        () =>
          Effect.gen(function* () {
            const { jo, ilse, table } = yield* Fixture;
            const { shown } = yield* Shown;
            yield* aCharacterAt(table, ilse.actor, { name: "Ilse's Ranger" }).pipe(Effect.orDie);
            const session = yield* as(jo.token, (client) =>
              client.sessions.create({
                params: { campaignId: table },
                payload: { number: 1, title: "At the ford", visibility: "shared" },
              }),
            );
            yield* as(jo.token, (client) =>
              client.campaigns.update({
                params: { campaignId: table },
                payload: { currentSessionId: session.id },
              }),
            );
            yield* as(jo.token, (client) =>
              client.runs.start({
                params: { campaignId: table, sessionId: session.id },
                payload: { encounterId: shown.id, visibility: "shared" },
              }),
            );
            const read = yield* as(ilse.token, (client) =>
              client.table.read({ params: { campaignId: table } }),
            );
            expect(read?.fight).not.toBeNull();
            const text = JSON.stringify(read);
            expect(text).not.toContain("battle-map-images");
            expect(text).not.toContain("SETTING-A-SECRET-DOOR");
          }),
      );
    });

    /**
     * **A fight keeps its board** (`0058_encounter_run_boards.ts`): `start` copies
     * the encounter's grid onto the run, `resume` copies the predecessor's, and the
     * picture is read through the map. The runner reads it; a player's table
     * shows it only once the DM shows the map (`player-board.test.ts`).
     */
    it.layer(Layer.effect(Kit)(makeKit))("a fight keeps its board", (it) => {
      let sessionNumber = 0;

      const night = Effect.gen(function* () {
        const { kit, own } = yield* Kit;
        sessionNumber += 1;
        return yield* as(kit.token, (client) =>
          client.sessions.create({
            params: { campaignId: own },
            payload: { number: sessionNumber, visibility: "shared" },
          }),
        );
      });

      const startOn = (sessionId: SessionId, encounterId: EncounterId) =>
        Effect.flatMap(Kit, ({ kit, own }) =>
          as(kit.token, (client) =>
            client.runs.start({
              params: { campaignId: own, sessionId },
              payload: { encounterId, visibility: "shared" },
            }),
          ),
        );

      const boardOf = (sessionId: SessionId, runId: EncounterRunId) =>
        Effect.flatMap(Kit, ({ kit, own }) =>
          as(kit.token, (client) =>
            client.runs.board({ params: { campaignId: own, sessionId, runId } }),
          ),
        );

      const regrid = (encounterId: EncounterId) =>
        Effect.flatMap(Kit, ({ kit, own }) =>
          as(kit.token, (client) =>
            client.battleMaps.update({
              params: { campaignId: own, encounterId },
              payload: {
                columns: 12,
                rows: 8,
                alignment: { cellPx: 128, offsetXPx: 3, offsetYPx: 4 },
              },
            }),
          ),
        );

      it.effect("copies the encounter's grid and names its map when the fight starts", () =>
        Effect.gen(function* () {
          const { kit, own, pier, map } = yield* Kit;
          const session = yield* night;
          const fight = yield* startOn(session.id, pier.id);
          const board = yield* boardOf(session.id, fight.id);
          expect(board).toMatchObject({
            mapId: map.id,
            setting: map.setting,
            grid: map.grid,
            columns: map.columns,
            rows: map.rows,
            feetPerCell: map.feetPerCell,
            alignment: map.alignment,
            imagePending: false,
          });
          expect(board?.image).toEqual(map.image);
          yield* as(kit.token, (client) =>
            client.runs.end({
              params: { campaignId: own, sessionId: session.id, runId: fight.id },
              payload: {},
            }),
          );
        }),
      );

      it.effect(
        "keeps its grid when the encounter's grid changes mid-fight; a fight started after an edit takes the new one",
        () =>
          Effect.gen(function* () {
            const { kit, own } = yield* Kit;
            const encounter = yield* encounterAt(kit, own, { name: "The loft" });
            // The same encounter is never started twice, so the fight after the edit
            // is another encounter's, edited before it starts.
            const later = yield* encounterAt(kit, own, { name: "The loft, later" });
            yield* settled;
            const before = yield* mapOf(kit, own, encounter.id);
            const session = yield* night;
            const fight = yield* startOn(session.id, encounter.id);

            const edited = yield* regrid(encounter.id);
            expect(edited.columns).toBe(12);

            const board = yield* boardOf(session.id, fight.id);
            expect([board?.columns, board?.rows, board?.alignment]).toEqual([
              before.columns,
              before.rows,
              before.alignment,
            ]);
            expect(board?.mapId).toBe(before.id);

            yield* as(kit.token, (client) =>
              client.runs.end({
                params: { campaignId: own, sessionId: session.id, runId: fight.id },
                payload: {},
              }),
            );
            yield* regrid(later.id);
            const next = yield* startOn(session.id, later.id);
            const nextBoard = yield* boardOf(session.id, next.id);
            expect([nextBoard?.columns, nextBoard?.rows, nextBoard?.alignment]).toEqual([
              12,
              8,
              { cellPx: 128, offsetXPx: 3, offsetYPx: 4 },
            ]);
            yield* as(kit.token, (client) =>
              client.runs.end({
                params: { campaignId: own, sessionId: session.id, runId: next.id },
                payload: {},
              }),
            );
          }),
      );

      it.effect(
        "carries the predecessor's board to a resumed fight, not the map as it stands",
        () =>
          Effect.gen(function* () {
            const { kit, own } = yield* Kit;
            const encounter = yield* encounterAt(kit, own, { name: "The long night" });
            yield* settled;
            const first = yield* night;
            const fight = yield* startOn(first.id, encounter.id);
            const played = yield* boardOf(first.id, fight.id);
            yield* as(kit.token, (client) =>
              client.sessions.update({
                params: { campaignId: own, sessionId: first.id },
                payload: { endedAt: DateTime.nowUnsafe() },
              }),
            );
            yield* regrid(encounter.id);

            const second = yield* night;
            const resumed = yield* as(kit.token, (client) =>
              client.runs.resume({
                params: { campaignId: own, sessionId: second.id },
                payload: { continuedFrom: fight.id },
              }),
            );
            expect(resumed.continuedFrom).toBe(fight.id);
            expect(yield* boardOf(second.id, resumed.id)).toEqual(played);
            yield* as(kit.token, (client) =>
              client.runs.end({
                params: { campaignId: own, sessionId: second.id, runId: resumed.id },
                payload: {},
              }),
            );
          }),
      );

      it.effect("shows the picture Hob finishes after the fight began", () =>
        Effect.gen(function* () {
          const { kit, own } = yield* Kit;
          const encounter = yield* encounterAt(kit, own, {
            name: "Quick start",
            setting: "A lamplit alley between warehouses",
          });
          const session = yield* night;
          // Started before the draw is waited for; whether it had landed by then is
          // the worker's race, and either way the board ends with the picture.
          const fight = yield* startOn(session.id, encounter.id);
          yield* settled;
          const board = yield* boardOf(session.id, fight.id);
          const drawn = yield* mapOf(kit, own, encounter.id);
          expect(drawn.image).not.toBeNull();
          expect(board?.image).toEqual(drawn.image);
          expect(board?.imagePending).toBe(false);
          yield* as(kit.token, (client) =>
            client.runs.end({
              params: { campaignId: own, sessionId: session.id, runId: fight.id },
              payload: {},
            }),
          );
        }),
      );

      it.effect(
        "survives its encounter's delete: the grid stays, the map and picture go, the runner still runs",
        () =>
          Effect.gen(function* () {
            const { kit, own } = yield* Kit;
            const doomed = yield* encounterAt(kit, own, {
              name: "Doomed",
              setting: "A collapsing rope bridge",
            });
            yield* settled;
            const session = yield* night;
            const fight = yield* startOn(session.id, doomed.id);
            const played = yield* boardOf(session.id, fight.id);
            expect(played?.image).not.toBeNull();

            yield* as(kit.token, (client) =>
              client.encounters.remove({ params: { campaignId: own, encounterId: doomed.id } }),
            );

            const params = { campaignId: own, sessionId: session.id, runId: fight.id };
            const board = yield* boardOf(session.id, fight.id);
            expect(board).toMatchObject({
              mapId: null,
              setting: null,
              image: null,
              imagePending: false,
              grid: played?.grid,
              columns: played?.columns,
              rows: played?.rows,
              alignment: played?.alignment,
            });
            const stillOn = yield* as(kit.token, (client) => client.runs.findById({ params }));
            expect(stillOn.encounterId).toBeNull();
            expect(stillOn.endedAt).toBeNull();
            const rows = yield* as(kit.token, (client) => client.combatants.list({ params }));
            if (rows.length > 0) {
              yield* as(kit.token, (client) =>
                client.runs.setInitiative({
                  params,
                  payload: {
                    entries: rows.map((row) => ({ combatantId: row.id, initiative: 10 })),
                  },
                }),
              );
            }
            yield* as(kit.token, (client) => client.runs.begin({ params, payload: {} }));
            yield* as(kit.token, (client) =>
              client.runs.nextTurn({ params, payload: { requestId: crypto.randomUUID() } }),
            );
            yield* as(kit.token, (client) => client.runs.end({ params, payload: {} }));
          }),
      );

      it.effect("answers null for a fight with no board", () =>
        Effect.gen(function* () {
          const { kit, own } = yield* Kit;
          const encounter = yield* encounterAt(kit, own, { name: "Boardless" });
          const session = yield* night;
          const fight = yield* startOn(session.id, encounter.id);
          yield* sql((sql) => sql`delete from encounter_run_board where run_id = ${fight.id}`);
          expect(yield* boardOf(session.id, fight.id)).toBeNull();
          yield* as(kit.token, (client) =>
            client.runs.end({
              params: { campaignId: own, sessionId: session.id, runId: fight.id },
              payload: {},
            }),
          );
        }),
      );

      it.effect(
        "is the creator's alone: a player and a stranger get NotFound, and the player's table carries no board until the DM shows it",
        () =>
          Effect.gen(function* () {
            const { jo, stranger, table } = yield* Fixture;
            const { kit, own } = yield* Kit;
            const player = yield* aPerson("Pip");
            yield* admittedTo(own, player.actor, "Pip").pipe(Effect.orDie);
            yield* aCharacterAt(own, player.actor, { name: "Pip's Rogue" }).pipe(Effect.orDie);
            const session = yield* night;
            yield* as(kit.token, (client) =>
              client.campaigns.update({
                params: { campaignId: own },
                payload: { currentSessionId: session.id },
              }),
            );
            const { pier: shownPier, map: shownMap } = yield* aPier(kit, own);
            const fight = yield* startOn(session.id, shownPier.id);
            const params = { campaignId: own, sessionId: session.id, runId: fight.id };
            for (const who of [player, stranger]) {
              expect(yield* attempt(who.token, (client) => client.runs.board({ params }))).toEqual({
                ok: false,
                tag: "NotFound",
              });
            }
            // Another creator's run id under this table's path is not this table's board.
            expect(
              yield* attempt(jo.token, (client) =>
                client.runs.board({ params: { ...params, campaignId: table } }),
              ),
            ).toEqual({ ok: false, tag: "NotFound" });

            const read = yield* as(player.token, (client) =>
              client.table.read({ params: { campaignId: own } }),
            );
            expect(read?.fight?.id).toBe(fight.id);
            // The player's table as it was before fights kept boards, and no board.
            expect(Object.keys(read!.fight!).sort()).toEqual(
              [
                "board",
                "encounterId",
                "id",
                "mode",
                "order",
                "phase",
                "round",
                "seats",
                "upNext",
              ].sort(),
            );
            expect(read?.fight?.board).toBeNull();
            const text = JSON.stringify(read);
            expect(text).not.toContain("battle-map-images");
            expect(text).not.toContain("SETTING-A-ROTTEN-PIER");
            expect(text).not.toContain(shownMap.id);
          }),
      );
    });
  },
);
