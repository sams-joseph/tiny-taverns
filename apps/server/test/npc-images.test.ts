import { describe, expect } from "@effect/vitest";
import {
  Actor,
  type CampaignId,
  CurrentActor,
  HOUSE_BANNER_STYLE,
  HOUSE_PORTRAIT_STYLE,
  type NpcCreate,
  type NpcId,
  type NpcUpdate,
  TavernsApi,
  UNNAMED_NPC,
} from "@taverns/api";
import { Context, Deferred, type Duration, Effect, Layer, Option, Redacted } from "effect";
import { TestClock } from "effect/testing";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls, expiryFor, signedPath } from "../src/images/ImageUrls.js";
import { ImageRecords } from "../src/repo/Images.js";
import { Npcs } from "../src/repo/Npcs.js";
import { ObjectStorage, StorageKey } from "../src/storage/ObjectStorage.js";
import {
  type Person,
  aCharacterAt,
  aGroupMemberAt,
  aPerson,
  admittedTo,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { MODERATION_TEXT, type ScriptedImages, scriptedImages } from "./support/imageModel.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Hob draws a campaign NPC's portrait once, when it joins the cast or — for
 * one created blank — at the first edit that gives it something to draw from,
 * from its public persona only; and whoever can see the NPC sees it.** One more kind
 * of Hob-drawn image, over the same worker, signer and records as a
 * character's portrait (`portraits.test.ts`) and the campaign and Shared World
 * covers (`campaign-images.test.ts`, `shared-world-images.test.ts`).
 *
 * Over the real application: the real handlers, the real worker, `sharp`, the
 * memory storage adapter and Postgres. Only the image endpoint is scripted
 * (`support/imageModel.ts`), so no request here leaves the process.
 */

const OPENAI = "https://api.openai.com/v1";
const MODEL = "gpt-image-2.5-flare";
const SECRET = Redacted.make("npc-image-test-secret");
/** Eight NPCs' portraits and banners: each NPC is two draws. */
const PER_ACCOUNT = 16;

const images = scriptedImages({ apiUrl: OPENAI, model: MODEL });

/** The clock image URLs are minted and checked against. */
let now = Date.now();

const database = migratedDatabase("taverns_test_npc_images");
const urls = ImageUrls.layer(SECRET, () => now);
const services = servicesOver(
  database,
  undefined,
  undefined,
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

const as = <A, E>(who: Person, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(who.token), call).pipe(Effect.orDie);

/** The same call, answering the failure's tag rather than dying on it. */
const attempt = <A, E extends { readonly _tag: string }>(
  who: Person,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(who.token), call).pipe(
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

/** Fetch a signed path without any credential, as an `<img>` does. */
const load = (path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(path);
    const bytes = new Uint8Array(yield* response.arrayBuffer);
    return { status: response.status, headers: response.headers, bytes };
  }).pipe(Effect.orDie);

interface Record {
  readonly id: string;
  readonly campaign_id: string;
  readonly account_id: string;
  readonly state: string;
  readonly failure: string | null;
  readonly prompt: string | null;
  readonly model: string | null;
  readonly input_tokens: number | null;
  readonly storage_prefix: string;
  readonly original_type: string | null;
}

const recordOf = (npcId: NpcId) =>
  sql((sql) => sql<Record>`select * from npc_image where npc_id = ${npcId}`).pipe(
    Effect.map((rows) => rows[0]),
  );

const bannerOf = (npcId: NpcId) =>
  sql((sql) => sql<Record>`select * from npc_banner where npc_id = ${npcId}`).pipe(
    Effect.map((rows) => rows[0]),
  );

const stored = (key: string) =>
  Effect.flatMap(ObjectStorage, (objects) => objects.head(StorageKey(key))).pipe(
    Effect.orDie,
    Effect.map(Option.isSome),
  );

const FILES = ["original.png", "thumb.webp", "card.webp", "full.webp"];

const BANNER_FILES = ["original.png", "card.webp", "full.webp"];

const isNpcPrompt = (request: { readonly prompt?: unknown }) =>
  String(request.prompt).startsWith("Head-and-shoulders portrait of a character in a fantasy");

/** The requests that asked for an NPC's bust, told apart from covers by the prompt. */
const npcRequests = () =>
  images.requests().filter((request) => isNpcPrompt(request) && request.size === "1024x1024");

/** The requests that asked for an NPC's banner: the same prompt, framed wide. */
const bannerRequests = () =>
  images.requests().filter((request) => isNpcPrompt(request) && request.size === "1536x1024");

const campaignOf = (who: Person, name: string) =>
  as(who, (client) => client.campaigns.create({ payload: { name } })).pipe(
    Effect.tap(() => settled),
    Effect.map((campaign) => campaign.id),
  );

const addNpc = (who: Person, campaignId: CampaignId, payload: NpcCreate) =>
  as(who, (client) => client.npcs.create({ params: { campaignId }, payload }));

const editNpc = (who: Person, campaignId: CampaignId, npcId: NpcId, payload: NpcUpdate) =>
  as(who, (client) => client.npcs.update({ params: { campaignId, npcId }, payload }));

/** What an account has spent on images today: the ledger the daily caps count. */
const spentBy = (who: Person) =>
  sql(
    (sql) => sql<{ readonly count: number }>`
      select count(*)::int as count from image_spend where account_id = ${who.actor.accountId}
    `,
  ).pipe(Effect.map((rows) => rows[0]?.count ?? 0));

/** A worker of its own over `endpoint`, for the tests that need a slow one. */
const slowWorker = (endpoint: ScriptedImages, timeout: Duration.Input) =>
  Layer.build(
    HobImages.layer({
      generation: Option.some({
        limits: { perAccountPerDay: 100, perDay: 100 },
        concurrency: 1,
        timeout,
      }),
      storageOn: false,
    }).pipe(Layer.provide([ImageRecords.layer, ObjectStorage.memory, urls, endpoint.layer])),
  ).pipe(Effect.map((built) => Context.get(built, HobImages)));

/**
 * The `count`th request reaching `endpoint`. A draw that is never sent fails
 * here, once the worker has nothing left to run, rather than leaving the test
 * to wait out its budget.
 */
const requested = (
  endpoint: ScriptedImages,
  worker: (typeof HobImages)["Service"],
  count: number,
) =>
  Effect.raceFirst(
    endpoint.sent(count),
    Effect.andThen(
      worker.idle,
      Effect.die(new Error(`Every job ended before request ${String(count)} was sent`)),
    ),
  );

const FERRYMAN: NpcCreate = {
  name: "Cazril",
  role: "the ferryman at the crossing",
  persona: {
    identity: {
      pronouns: "he/him",
      summary: "An old ferryman with a lantern, who takes names instead of coin.",
      appearance: "Stooped, river-grey eyes, a patched oilskin coat.",
    },
    voice: { manner: "VOICE-NOT-VISUAL" },
    intent: { wants: "INTENT-NOT-VISUAL" },
  },
  privateMaterial: {
    secrets: "SECRET-THE-HAG-PAYS-HIM",
    instructions: "INSTRUCTION-GO-SILENT",
  },
};

const makeTable = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const table = yield* campaignOf(jo, "The Salt Road");
  return { jo, ilse, stranger, table };
});

class Table extends Context.Service<Table, Effect.Success<typeof makeTable>>()(
  "npc-images.test/Table",
) {}

const makeFerryman = Effect.gen(function* () {
  const { jo, table } = yield* Table;
  const requestsBefore = npcRequests().length;
  const bannersBefore = bannerRequests().length;
  const npc = yield* addNpc(jo, table, FERRYMAN);
  yield* settled;
  return { npc, requestsBefore, bannersBefore };
});

class Ferryman extends Context.Service<Ferryman, Effect.Success<typeof makeFerryman>>()(
  "npc-images.test/Ferryman",
) {}

const makeAudience = Effect.gen(function* () {
  const { jo, ilse, table } = yield* Table;
  yield* as(jo, (client) =>
    client.campaigns.update({ params: { campaignId: table }, payload: { visibility: "shared" } }),
  );
  const shown = yield* addNpc(jo, table, {
    name: "Mara",
    role: "the innkeeper",
    visibility: "shared",
  });
  const hidden = yield* addNpc(jo, table, {
    name: "The Patron",
    role: "a masked figure behind the plot",
    privateMaterial: { secrets: "SECRET-IDENTITY" },
  });
  yield* settled;
  yield* admittedTo(table, ilse.actor, "Ilse");
  const bystander = yield* aGroupMemberAt(table, "Wren");
  return { shown, hidden, bystander };
});

class Audience extends Context.Service<Audience, Effect.Success<typeof makeAudience>>()(
  "npc-images.test/Audience",
) {}

const makeBlank = Effect.gen(function* () {
  const { jo, table } = yield* Table;
  const requestsBefore = npcRequests().length;
  const blank = yield* addNpc(jo, table, { name: UNNAMED_NPC });
  yield* settled;
  return { blank, requestsBefore };
});

class Blank extends Context.Service<Blank, Effect.Success<typeof makeBlank>>()(
  "npc-images.test/Blank",
) {}

/** A table of another account's own, for the describe blocks that spend on it. */
class Theirs extends Context.Service<Theirs, CampaignId>()("npc-images.test/Theirs") {}

describeLayer(
  "npc-images",
  Layer.effect(Table)(makeTable).pipe(Layer.provideMerge(application)),
  (it) => {
    it.layer(Layer.effect(Ferryman)(makeFerryman))(
      "adding an NPC to the cast draws one portrait and one banner",
      (it) => {
        it.effect("answers the create with the drawing state, and the draw finishes ready", () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Table;
            const { npc, requestsBefore, bannersBefore } = yield* Ferryman;
            expect(npcRequests().length - requestsBefore).toBe(1);
            expect(bannerRequests().length - bannersBefore).toBe(1);
            expect(npc.imagePending).toBe(true);
            expect(npc.image).toBeNull();

            const record = yield* recordOf(npc.id);
            expect(record?.state).toBe("ready");
            expect(record?.failure).toBeNull();
            expect(record?.model).toBe(MODEL);
            expect(record?.account_id).toBe(jo.actor.accountId);
            expect(record?.campaign_id).toBe(table);
            expect(record?.input_tokens).toBe(57);
            expect(record?.original_type).toBe("image/png");
            expect(record?.storage_prefix).toBe(
              `npc-images/${jo.actor.accountId}/${npc.id}/${record!.id}`,
            );
            for (const file of FILES) {
              expect(yield* stored(`${record!.storage_prefix}/${file}`)).toBe(true);
            }
          }),
        );

        it.effect(
          "draws from the public persona only: never the name, the secrets or the instructions",
          () =>
            Effect.gen(function* () {
              const { npc } = yield* Ferryman;
              const record = yield* recordOf(npc.id);
              expect(record?.prompt).toContain("the ferryman at the crossing");
              expect(record?.prompt).toContain(
                "How they look: Stooped, river-grey eyes, a patched oilskin coat.",
              );
              expect(record?.prompt).toContain("takes names instead of coin");
              expect(record?.prompt).toContain("Pronouns: he/him.");
              expect(record?.prompt).toContain("Single subject, centred bust");
              for (const hidden of ["Cazril", "SECRET", "INSTRUCTION", "VOICE", "INTENT"]) {
                expect(record?.prompt).not.toContain(hidden);
              }
              const body = npcRequests().find((request) => request.prompt === record?.prompt);
              expect(body).toEqual({
                model: MODEL,
                prompt: record?.prompt,
                n: 1,
                size: "1024x1024",
                output_format: "png",
                quality: "medium",
                moderation: "auto",
              });
            }),
        );

        it.effect(
          "draws the banner from the same public persona, framed wide, as its own image",
          () =>
            Effect.gen(function* () {
              const { jo, table } = yield* Table;
              const { npc } = yield* Ferryman;
              const portrait = (yield* recordOf(npc.id))!;
              const banner = (yield* bannerOf(npc.id))!;
              expect(banner.state).toBe("ready");
              expect(banner.campaign_id).toBe(table);
              expect(banner.account_id).toBe(jo.actor.accountId);
              expect(banner.prompt).toBe(
                portrait.prompt!.replace(HOUSE_PORTRAIT_STYLE, HOUSE_BANNER_STYLE),
              );
              for (const hidden of ["Cazril", "SECRET", "INSTRUCTION", "VOICE", "INTENT"]) {
                expect(banner.prompt).not.toContain(hidden);
              }
              for (const file of BANNER_FILES) {
                expect(yield* stored(`${banner.storage_prefix}/${file}`)).toBe(true);
              }
              expect(banner.storage_prefix).toBe(
                `npc-banners/${jo.actor.accountId}/${npc.id}/${banner.id}`,
              );
            }),
        );

        it.effect("signs the banner on the creator's reads, and serves 2:1 WebP through it", () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Table;
            const { npc } = yield* Ferryman;
            const found = yield* as(jo, (client) =>
              client.npcs.findById({ params: { campaignId: table, npcId: npc.id } }),
            );
            const listed = yield* as(jo, (client) =>
              client.npcs.list({ params: { campaignId: table }, query: {} }),
            );
            expect(listed.find((entry) => entry.id === npc.id)?.banner).toEqual(found.banner);
            const sharp = (yield* Effect.promise(() => import("sharp"))).default;
            for (const [path, width, height] of [
              [found.banner!.cardUrl, 768, 384],
              [found.banner!.fullUrl, 1536, 768],
            ] as const) {
              expect(path).toMatch(/^\/npc-banners\/[0-9a-f-]+\/(card|full)\?e=\d+&s=/);
              const response = yield* load(path);
              expect(response.status).toBe(200);
              const metadata = yield* Effect.promise(() => sharp(response.bytes).metadata());
              expect([metadata.format, metadata.width, metadata.height]).toEqual([
                "webp",
                width,
                height,
              ]);
            }
            // The kind is signed: a banner's URL opens nothing on the portrait's route.
            expect(
              (yield* load(found.banner!.cardUrl.replace("/npc-banners/", "/npc-images/"))).status,
            ).toBe(404);
          }),
        );

        it.effect(
          "signs three sizes on the creator's reads, and serves square WebP through them",
          () =>
            Effect.gen(function* () {
              const { jo, table } = yield* Table;
              const { npc } = yield* Ferryman;
              const found = yield* as(jo, (client) =>
                client.npcs.findById({ params: { campaignId: table, npcId: npc.id } }),
              );
              expect(found.imagePending).toBe(false);
              const listed = yield* as(jo, (client) =>
                client.npcs.list({ params: { campaignId: table }, query: {} }),
              );
              expect(listed.find((entry) => entry.id === npc.id)?.image).toEqual(found.image);

              const sharp = (yield* Effect.promise(() => import("sharp"))).default;
              for (const [path, size] of [
                [found.image!.thumbUrl, 160],
                [found.image!.cardUrl, 640],
                [found.image!.fullUrl, 1024],
              ] as const) {
                expect(path).toMatch(/^\/npc-images\/[0-9a-f-]+\/(thumb|card|full)\?e=\d+&s=/);
                const response = yield* load(path);
                expect(response.status).toBe(200);
                expect(response.headers["content-type"]).toBe("image/webp");
                expect(response.headers["cache-control"]).toMatch(
                  /^private, max-age=\d+, immutable$/,
                );
                expect(response.headers["x-content-type-options"]).toBe("nosniff");
                expect(response.headers["content-security-policy"]).toBe("default-src 'none'");
                const metadata = yield* Effect.promise(() => sharp(response.bytes).metadata());
                expect([metadata.format, metadata.width, metadata.height]).toEqual([
                  "webp",
                  size,
                  size,
                ]);
              }
            }),
        );

        it.effect(
          "refuses a forged, altered, other-size, other-kind or expired URL with the same 404",
          () =>
            Effect.gen(function* () {
              const { jo, table } = yield* Table;
              const { npc } = yield* Ferryman;
              const { thumbUrl } = (yield* as(jo, (client) =>
                client.npcs.findById({ params: { campaignId: table, npcId: npc.id } }),
              )).image!;
              const url = new URL(thumbUrl, "http://x");
              const signature = url.searchParams.get("s")!;
              const imageId = url.pathname.split("/")[2]!;
              const cases = [
                thumbUrl.replace(signature, `${signature.slice(0, -2)}AA`),
                thumbUrl.replace(/s=[^&]+/, ""),
                thumbUrl.replace(/e=\d+/, `e=${String(Number(url.searchParams.get("e")) + 1)}`),
                // A signature for one size does not open another, or a file that is not a size.
                thumbUrl.replace("/thumb?", "/card?"),
                thumbUrl.replace("/thumb?", "/original?"),
                thumbUrl.replace(/npc-images\/[^/]+/, "npc-images/not-a-uuid"),
                // An NPC's signature on the other kinds' routes, and theirs for this id
                // on the NPC route: the kind is signed too.
                thumbUrl.replace("/npc-images/", "/portraits/"),
                thumbUrl.replace("/npc-images/", "/campaign-images/"),
                signedPath(SECRET, "character", imageId, "thumb", now).replace(
                  "/portraits/",
                  "/npc-images/",
                ),
                signedPath(SECRET, "campaign", imageId, "card", now).replace(
                  "/campaign-images/",
                  "/npc-images/",
                ),
              ];
              for (const path of cases) expect((yield* load(path)).status, path).toBe(404);

              const before = now;
              now = expiryFor(before) * 1000 + 1;
              const expired = yield* load(thumbUrl).pipe(
                Effect.ensuring(
                  Effect.sync(() => {
                    now = before;
                  }),
                ),
              );
              expect(expired.status).toBe(404);
            }),
        );

        it.effect("is drawn once: an edit draws nothing, and a second start finds the record", () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Table;
            const { npc } = yield* Ferryman;
            const before = npcRequests().length;
            yield* as(jo, (client) =>
              client.npcs.update({
                params: { campaignId: table, npcId: npc.id },
                payload: {
                  role: "the ferryman, retired",
                  persona: { identity: { summary: "Older.", appearance: "White-haired now." } },
                },
              }),
            );
            const again = yield* Effect.flatMap(ImageRecords, (records) =>
              records.start("npc", npc.id, {
                prompt: "again",
                model: MODEL,
                limits: { perAccountPerDay: 100, perDay: 100 },
              }),
            ).pipe(Effect.provideService(CurrentActor, jo.actor), Effect.orDie);
            yield* settled;
            expect(again).toBeUndefined();
            expect(npcRequests().length).toBe(before);
          }),
        );

        it.effect("draws no banner on an edit of an NPC drawn before banners existed", () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Table;
            const { npc } = yield* Ferryman;
            // An NPC whose square was drawn before banners: a portrait, no banner record.
            yield* sql((sql) => sql`delete from npc_banner where npc_id = ${npc.id}`);
            const before = bannerRequests().length;
            const edited = yield* editNpc(jo, table, npc.id, { role: "the ferryman, once more" });
            yield* settled;
            expect(edited.imagePending).toBe(false);
            expect(bannerRequests().length).toBe(before);
            expect(yield* bannerOf(npc.id)).toBeUndefined();
            // Its band falls back to the square.
            expect(edited.image).not.toBeNull();
            expect(edited.banner).toBeNull();
          }),
        );

        it.effect("keeps the portrait through archive and restore, on the archived shelf too", () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Table;
            const { npc } = yield* Ferryman;
            const archived = yield* as(jo, (client) =>
              client.npcs.archive({ params: { campaignId: table, npcId: npc.id }, payload: {} }),
            );
            expect(archived.image).not.toBeNull();
            const shelf = yield* as(jo, (client) =>
              client.npcs.list({ params: { campaignId: table }, query: { archived: true } }),
            );
            expect(shelf.find((entry) => entry.id === npc.id)?.image).not.toBeNull();
            const restored = yield* as(jo, (client) =>
              client.npcs.restore({ params: { campaignId: table, npcId: npc.id }, payload: {} }),
            );
            expect(restored.image).not.toBeNull();
            expect((yield* recordOf(npc.id))?.state).toBe("ready");
          }),
        );
      },
    );

    describe("the Library", () => {
      it.effect("never draws an original, and draws the copy a cast takes of it", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Table;
          const before = npcRequests().length;
          const source = yield* as(jo, (client) =>
            client.library.createNpc({
              payload: {
                name: "Wren",
                role: "a lamplighter",
                persona: {
                  identity: { summary: "Soot on her sleeves.", appearance: "A long hooked pole." },
                },
                privateMaterial: { secrets: "SECRET-SOURCE" },
              },
            }),
          );
          yield* settled;
          expect(npcRequests().length).toBe(before);
          expect(yield* recordOf(source.id)).toBeUndefined();
          // Not by the handler, and not by a direct start either: an original has no
          // campaign, so there is nobody's table to bill it to.
          yield* Effect.flatMap(ImageRecords, (records) =>
            records.start("npc", source.id, {
              prompt: "a lamplighter",
              model: MODEL,
              limits: { perAccountPerDay: 100, perDay: 100 },
            }),
          ).pipe(Effect.provideService(CurrentActor, jo.actor), Effect.orDie);
          expect(yield* recordOf(source.id)).toBeUndefined();

          const copy = yield* as(jo, (client) =>
            client.npcs.copyFromSource({
              params: { campaignId: table, sourceNpcId: source.id },
              payload: {},
            }),
          );
          expect(copy.imagePending).toBe(true);
          yield* settled;
          expect(npcRequests().length - before).toBe(1);
          expect((yield* bannerOf(copy.id))?.state).toBe("ready");
          expect(yield* bannerOf(source.id)).toBeUndefined();
          const record = yield* recordOf(copy.id);
          expect(record?.state).toBe("ready");
          expect(record?.campaign_id).toBe(table);
          expect(record?.prompt).toContain("a lamplighter");
          expect(record?.prompt).toContain("How they look: A long hooked pole.");
          expect(record?.prompt).not.toContain("SECRET");
          expect(record?.prompt).not.toContain("Wren");
        }),
      );

      it.effect("refuses an image row for an NPC outside the campaign it names", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Table;
          const other = yield* campaignOf(jo, "Elsewhere");
          const npc = yield* addNpc(jo, table, { name: "Pell" });
          yield* settled;
          const sql = yield* SqlClient.SqlClient;
          const refused = yield* Effect.result(
            sql`
            insert into npc_image (npc_id, campaign_id, account_id, storage_prefix)
            values (${npc.id}, ${other}, ${jo.actor.accountId}, 'x')
          `,
          );
          expect(refused._tag).toBe("Failure");
        }),
      );
    });

    it.layer(Layer.effect(Audience)(makeAudience))(
      "who sees a portrait is who sees the NPC",
      (it) => {
        it.effect("draws a hidden NPC too, for its creator's eyes", () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Table;
            const { hidden } = yield* Audience;
            expect((yield* recordOf(hidden.id))?.state).toBe("ready");
            const found = yield* as(jo, (client) =>
              client.npcs.findById({ params: { campaignId: table, npcId: hidden.id } }),
            );
            expect(found.image?.thumbUrl).toMatch(/^\/npc-images\//);
            expect(found.banner?.cardUrl).toMatch(/^\/npc-banners\//);
          }),
        );

        it.effect("gives a player the portrait of a shared NPC, and nothing of a hidden one", () =>
          Effect.gen(function* () {
            const { ilse, table } = yield* Table;
            const { shown, hidden } = yield* Audience;
            const hiddenImageId = (yield* recordOf(hidden.id))!.id;
            const hiddenBannerId = (yield* bannerOf(hidden.id))!.id;
            const listed = yield* as(ilse, (client) =>
              client.npcs.playerList({ params: { campaignId: table } }),
            );
            expect(listed.map((npc) => npc.id)).toContain(shown.id);
            expect(listed.map((npc) => npc.id)).not.toContain(hidden.id);
            const url = listed.find((npc) => npc.id === shown.id)?.image?.thumbUrl;
            expect(url).toMatch(/^\/npc-images\//);
            expect((yield* load(url!)).status).toBe(200);
            expect(JSON.stringify(listed)).not.toContain(hiddenImageId);
            const banner = listed.find((npc) => npc.id === shown.id)?.banner?.cardUrl;
            expect(banner).toMatch(/^\/npc-banners\//);
            expect((yield* load(banner!)).status).toBe(200);
            expect(JSON.stringify(listed)).not.toContain(hiddenBannerId);

            const found = yield* attempt(ilse, (client) =>
              client.npcs.playerFindById({ params: { campaignId: table, npcId: shown.id } }),
            );
            expect(found.ok && found.value.image?.thumbUrl).toMatch(/^\/npc-images\//);
            expect(found.ok && found.value.banner?.cardUrl).toMatch(/^\/npc-banners\//);
            expect(
              yield* attempt(ilse, (client) =>
                client.npcs.playerFindById({ params: { campaignId: table, npcId: hidden.id } }),
              ),
            ).toEqual({ ok: false, tag: "NotFound" });
            expect(
              yield* attempt(ilse, (client) =>
                client.npcs.findById({ params: { campaignId: table, npcId: hidden.id } }),
              ),
            ).toEqual({ ok: false, tag: "NotFound" });
          }),
        );

        it.effect("takes the portrait away from players when the NPC goes back to the cast", () =>
          Effect.gen(function* () {
            const { jo, ilse, table } = yield* Table;
            const { shown } = yield* Audience;
            const share = (visibility: "dm" | "shared") =>
              as(jo, (client) =>
                client.npcs.update({
                  params: { campaignId: table, npcId: shown.id },
                  payload: { visibility },
                }),
              );
            yield* share("dm");
            const listed = yield* as(ilse, (client) =>
              client.npcs.playerList({ params: { campaignId: table } }),
            ).pipe(Effect.ensuring(share("shared")));
            expect(JSON.stringify(listed)).not.toContain("/npc-images/");
            expect(JSON.stringify(listed)).not.toContain("/npc-banners/");
          }),
        );

        it.effect(
          "carries the portrait on the player's shared conversation, and never through the NPC agent",
          () =>
            Effect.gen(function* () {
              const { jo, ilse, table } = yield* Table;
              const { shown } = yield* Audience;
              // The shared conversation is for players with a seat at tonight's table.
              yield* aCharacterAt(table, ilse.actor, { name: "Ilse's Ranger" });
              const session = yield* as(jo, (client) =>
                client.sessions.create({
                  params: { campaignId: table },
                  payload: { number: 1, title: "At the ford", visibility: "shared" },
                }),
              );
              yield* as(jo, (client) =>
                client.campaigns.update({
                  params: { campaignId: table },
                  payload: { currentSessionId: session.id },
                }),
              );
              yield* as(jo, (client) =>
                client.npcs.openSession({
                  params: { campaignId: table, npcId: shown.id, sessionId: session.id },
                  payload: {},
                }),
              );
              const theirs = yield* as(ilse, (client) =>
                client.npcs.sessionList({ params: { campaignId: table, sessionId: session.id } }),
              );
              expect(theirs.find((npc) => npc.id === shown.id)?.image?.thumbUrl).toMatch(
                /^\/npc-images\//,
              );
              // The runner's monitor is read through the NPC agent, whose repositories
              // are the bare copies a model's context is built from: it holds no bearer
              // URL, and the runner draws no NPC plate.
              const monitor = yield* as(jo, (client) =>
                client.npcs.sessionMonitor({
                  params: { campaignId: table, sessionId: session.id },
                }),
              );
              expect(monitor.map((row) => row.npc.id)).toContain(shown.id);
              expect(JSON.stringify(monitor)).not.toContain("/npc-images/");
              expect(JSON.stringify(monitor)).not.toContain("/npc-banners/");
            }),
        );

        it.effect("gives a Shared World member who does not play, and a stranger, nothing", () =>
          Effect.gen(function* () {
            const { jo, stranger, table } = yield* Table;
            const { shown, hidden, bystander } = yield* Audience;
            // A stranger's player list of a table they do not sit at is refused.
            expect(
              yield* attempt(stranger, (client) =>
                client.npcs.playerList({ params: { campaignId: table } }),
              ),
            ).toEqual({ ok: false, tag: "NotFound" });
            expect(
              yield* attempt(stranger, (client) =>
                client.npcs.playerFindById({ params: { campaignId: table, npcId: shown.id } }),
              ),
            ).toEqual({ ok: false, tag: "NotFound" });
            const npcs = yield* Npcs;
            const reads = yield* Effect.all({
              listed: Effect.result(npcs.playerList(table)),
              shown: Effect.result(npcs.playerFindById(table, shown.id)),
              hidden: Effect.result(npcs.playerFindById(table, hidden.id)),
            }).pipe(Effect.provideService(CurrentActor, bystander));
            expect(reads.listed._tag).toBe("Failure");
            expect(reads.shown._tag).toBe("Failure");
            expect(reads.hidden._tag).toBe("Failure");
            expect(JSON.stringify(reads)).not.toContain("/npc-images/");
            expect(JSON.stringify(reads)).not.toContain("/npc-banners/");

            const unsigned = (yield* as(jo, (client) =>
              client.npcs.findById({ params: { campaignId: table, npcId: shown.id } }),
            )).image!.thumbUrl.replace(/\?.*$/, "");
            expect((yield* load(unsigned)).status).toBe(404);
          }),
        );

        it.effect("lets only the creator start the draw", () =>
          Effect.gen(function* () {
            const { jo, ilse, stranger } = yield* Table;
            const { hidden, bystander } = yield* Audience;
            yield* sql((sql) => sql`delete from npc_image where npc_id = ${hidden.id}`);
            const start = (actor: Actor) =>
              Effect.flatMap(ImageRecords, (records) =>
                records.start("npc", hidden.id, {
                  prompt: undefined,
                  model: MODEL,
                  limits: { perAccountPerDay: 100, perDay: 100 },
                }),
              ).pipe(Effect.provideService(CurrentActor, actor), Effect.orDie);
            yield* start(ilse.actor);
            yield* start(bystander);
            yield* start(stranger.actor);
            expect(yield* recordOf(hidden.id)).toBeUndefined();
            yield* start(jo.actor);
            expect((yield* recordOf(hidden.id))?.failure).toBe("skipped");
          }),
        );
      },
    );

    it.layer(Layer.effect(Blank)(makeBlank))(
      "an NPC created blank is drawn by the first edit that gives it a subject",
      (it) => {
        it.effect("creates it under the placeholder name, with no record and no request", () =>
          Effect.gen(function* () {
            const { blank, requestsBefore } = yield* Blank;
            expect(blank.name).toBe(UNNAMED_NPC);
            expect(blank.role).toBe("");
            expect(blank.imagePending).toBe(false);
            expect(blank.image).toBeNull();
            expect(yield* recordOf(blank.id)).toBeUndefined();
            expect(npcRequests().length).toBe(requestsBefore);
          }),
        );

        it.effect(
          "draws nothing for an edit that gives it no subject: a real name, a voice, a secret",
          () =>
            Effect.gen(function* () {
              const { jo, table } = yield* Table;
              const { blank, requestsBefore } = yield* Blank;
              const edited = yield* editNpc(jo, table, blank.id, {
                name: "Joss",
                persona: {
                  voice: { manner: "VOICE-NOT-VISUAL" },
                  intent: { wants: "INTENT-NOT-VISUAL" },
                },
                privateMaterial: { secrets: "SECRET-JOSS-OWES-THE-HAG" },
              });
              yield* settled;
              expect(edited.name).toBe("Joss");
              expect(edited.imagePending).toBe(false);
              expect(yield* recordOf(blank.id)).toBeUndefined();
              expect(npcRequests().length).toBe(requestsBefore);
            }),
        );

        it.effect(
          "refuses a player's and a stranger's edit with the same 404, and neither starts a draw",
          () =>
            Effect.gen(function* () {
              const { jo, ilse, stranger, table } = yield* Table;
              const { blank, requestsBefore } = yield* Blank;
              for (const who of [ilse, stranger]) {
                expect(
                  yield* attempt(who, (client) =>
                    client.npcs.update({
                      params: { campaignId: table, npcId: blank.id },
                      payload: {
                        role: "a smuggler",
                        persona: { identity: { appearance: "Scarred." } },
                      },
                    }),
                  ),
                ).toEqual({ ok: false, tag: "NotFound" });
              }
              yield* settled;
              expect(yield* recordOf(blank.id)).toBeUndefined();
              expect(npcRequests().length).toBe(requestsBefore);
              const found = yield* as(jo, (client) =>
                client.npcs.findById({ params: { campaignId: table, npcId: blank.id } }),
              );
              expect(found.role).toBe("");
            }),
        );

        it.effect(
          "starts its one draw on the edit that first sets a role, from the public persona only",
          () =>
            Effect.gen(function* () {
              const { jo, table } = yield* Table;
              const { blank, requestsBefore } = yield* Blank;
              const current = yield* as(jo, (client) =>
                client.npcs.findById({ params: { campaignId: table, npcId: blank.id } }),
              );
              const edited = yield* editNpc(jo, table, blank.id, {
                role: "the ferryman's daughter",
                expectedVersion: current.version,
              });
              expect(edited.imagePending).toBe(true);
              yield* settled;
              expect(npcRequests().length - requestsBefore).toBe(1);
              expect((yield* bannerOf(blank.id))?.state).toBe("ready");
              const record = yield* recordOf(blank.id);
              expect(record?.state).toBe("ready");
              expect(record?.account_id).toBe(jo.actor.accountId);
              expect(record?.campaign_id).toBe(table);
              expect(record?.prompt).toContain("the ferryman's daughter");
              for (const hidden of ["Joss", UNNAMED_NPC, "SECRET", "VOICE", "INTENT"]) {
                expect(record?.prompt).not.toContain(hidden);
              }
              const found = yield* as(jo, (client) =>
                client.npcs.findById({ params: { campaignId: table, npcId: blank.id } }),
              );
              expect(found.imagePending).toBe(false);
              expect(found.image?.thumbUrl).toMatch(/^\/npc-images\//);
              expect(found.banner?.cardUrl).toMatch(/^\/npc-banners\//);
            }),
        );

        it.effect(
          "draws nothing on any later edit, even one that changes what it would be drawn from",
          () =>
            Effect.gen(function* () {
              const { jo, table } = yield* Table;
              const { blank } = yield* Blank;
              const before = npcRequests().length;
              const bannersBefore = bannerRequests().length;
              const record = yield* recordOf(blank.id);
              for (const payload of [
                { role: "the ferryman's heir" },
                { persona: { identity: { appearance: "Tall, with her father's lantern." } } },
                { name: "Joss Ferrier" },
              ] satisfies ReadonlyArray<NpcUpdate>) {
                const edited = yield* editNpc(jo, table, blank.id, payload);
                expect(edited.imagePending).toBe(false);
              }
              yield* settled;
              expect(npcRequests().length).toBe(before);
              expect(bannerRequests().length).toBe(bannersBefore);
              const after = yield* recordOf(blank.id);
              expect(after?.id).toBe(record?.id);
              expect(after?.prompt).toContain("the ferryman's daughter");
            }),
        );
      },
    );

    it.layer(
      Layer.effect(Theirs)(
        Effect.flatMap(Table, ({ stranger }) => campaignOf(stranger, "Bo's Table")),
      ),
    )("when there is no portrait", (it) => {
      it.effect(
        "records nothing for an NPC that is only a name, so a later edit can still draw it",
        () =>
          Effect.gen(function* () {
            const { stranger } = yield* Table;
            const theirs = yield* Theirs;
            const before = npcRequests().length;
            const spent = yield* spentBy(stranger);
            const npc = yield* addNpc(stranger, theirs, {
              name: "Nobody",
              persona: { voice: { manner: "Quiet." } },
              privateMaterial: { secrets: "SECRET-ONLY" },
            });
            yield* settled;
            expect(npc.imagePending).toBe(false);
            expect(npc.image).toBeNull();
            expect(npcRequests().length).toBe(before);
            expect(yield* recordOf(npc.id)).toBeUndefined();
            expect(yield* bannerOf(npc.id)).toBeUndefined();
            expect(yield* spentBy(stranger)).toBe(spent);
          }),
      );

      it.effect("records a moderation refusal and puts no provider text anywhere", () =>
        Effect.gen(function* () {
          const { stranger } = yield* Table;
          const theirs = yield* Theirs;
          images.next({ kind: "refused" });
          const npc = yield* addNpc(stranger, theirs, { name: "Red", role: "a butcher" });
          yield* settled;
          const record = yield* recordOf(npc.id);
          expect(record?.failure).toBe("refused");
          const read = yield* as(stranger, (client) =>
            client.npcs.findById({ params: { campaignId: theirs, npcId: npc.id } }),
          );
          expect(read.image).toBeNull();
          expect(read.imagePending).toBe(false);
          expect(JSON.stringify(read)).not.toContain("secret-provider-words");
          expect(JSON.stringify(record)).not.toContain(MODERATION_TEXT);
        }),
      );

      it.effect("records a provider failure as provider", () =>
        Effect.gen(function* () {
          const { stranger } = yield* Table;
          const theirs = yield* Theirs;
          images.next({ kind: "error", status: 500 });
          const npc = yield* addNpc(stranger, theirs, { name: "Low", role: "a tide-watcher" });
          yield* settled;
          expect((yield* recordOf(npc.id))?.failure).toBe("provider");
        }),
      );

      it.effect(
        "records a draw that outlives the job timeout as timeout, and queues its files",
        () =>
          Effect.gen(function* () {
            const { stranger } = yield* Table;
            const theirs = yield* Theirs;
            const hanging = scriptedImages({ apiUrl: OPENAI, model: MODEL });
            hanging.next({ kind: "hang" }, { kind: "hang" });
            const npc = yield* addNpc(stranger, theirs, {
              name: "Slow",
              role: "a patient heron-keeper",
            });
            yield* settled;
            // The shared worker drew both; forget that, so the slow worker can start them.
            yield* sql((sql) => sql`delete from npc_image where npc_id = ${npc.id}`);
            yield* sql((sql) => sql`delete from npc_banner where npc_id = ${npc.id}`);

            // On the test clock, so the budget runs out when the test says and no sooner.
            yield* Effect.gen(function* () {
              const worker = yield* slowWorker(hanging, "200 millis");
              const answered = yield* worker.drawNpc(npc);
              expect(answered.imagePending).toBe(true);
              yield* requested(hanging, worker, 1);
              yield* TestClock.adjust("200 millis");
              yield* requested(hanging, worker, 2);
              yield* TestClock.adjust("200 millis");
              yield* worker.idle;
            }).pipe(
              Effect.scoped,
              Effect.provide(TestClock.layer()),
              Effect.provideService(CurrentActor, stranger.actor),
            );

            // The portrait and its banner, each under its own timeout.
            expect(hanging.requests().map((request) => request.size)).toEqual([
              "1024x1024",
              "1536x1024",
            ]);
            const record = yield* recordOf(npc.id);
            expect(record?.failure).toBe("timeout");
            expect((yield* bannerOf(npc.id))?.failure).toBe("timeout");
            const queued = yield* sql(
              (sql) => sql<{ readonly count: number }>`
            select count(*)::int as count from storage_deletion
            where prefix = ${record!.storage_prefix}
          `,
            );
            expect(queued[0]?.count).toBe(1);
          }),
      );

      it.effect("starts each draw's timeout when it gets its permit, not while it queues", () =>
        Effect.gen(function* () {
          // One permit and three draws: the portrait hangs out its whole budget
          // while the banner and the cover queue behind it, and each of those
          // answers well inside a budget of its own, but not inside what was left
          // of one that had been running while it queued.
          const { stranger } = yield* Table;
          const theirs = yield* Theirs;
          const slow = scriptedImages({ apiUrl: OPENAI, model: MODEL });
          const banner = yield* Deferred.make<void>();
          const cover = yield* Deferred.make<void>();
          slow.next(
            { kind: "hang" },
            { kind: "held", release: banner },
            { kind: "held", release: cover },
          );
          const npc = yield* addNpc(stranger, theirs, { name: "Queued", role: "a weary ferryman" });
          const campaign = yield* as(stranger, (client) =>
            client.campaigns.findById({ params: { campaignId: theirs } }),
          );
          yield* settled;
          // The shared worker drew all three; forget that, so the slow worker can start them.
          yield* sql((sql) => sql`delete from npc_image where npc_id = ${npc.id}`);
          yield* sql((sql) => sql`delete from npc_banner where npc_id = ${npc.id}`);
          yield* sql((sql) => sql`delete from campaign_image where campaign_id = ${theirs}`);

          yield* Effect.gen(function* () {
            const worker = yield* slowWorker(slow, "5 seconds");
            expect((yield* worker.drawNpc(npc)).imagePending).toBe(true);
            expect((yield* worker.drawCampaign(campaign)).imagePending).toBe(true);
            // The portrait's whole budget, with the other two queued throughout.
            yield* requested(slow, worker, 1);
            yield* TestClock.adjust("5 seconds");
            // Each of the others answers a second after it is sent.
            yield* requested(slow, worker, 2);
            yield* TestClock.adjust("1 second");
            yield* Deferred.succeed(banner, undefined);
            yield* requested(slow, worker, 3);
            yield* TestClock.adjust("1 second");
            yield* Deferred.succeed(cover, undefined);
            yield* worker.idle;
          }).pipe(
            Effect.scoped,
            Effect.provide(TestClock.layer()),
            Effect.provideService(CurrentActor, stranger.actor),
          );

          expect(slow.requests().map((request) => request.size)).toEqual([
            "1024x1024",
            "1536x1024",
            "1536x1024",
          ]);
          expect((yield* recordOf(npc.id))?.failure).toBe("timeout");
          expect(yield* bannerOf(npc.id)).toMatchObject({ state: "ready", failure: null });
          const drawn = yield* sql(
            (sql) => sql<{ readonly state: string; readonly failure: string | null }>`
            select state, failure from campaign_image where campaign_id = ${theirs}
          `,
          );
          expect(drawn[0]).toMatchObject({ state: "ready", failure: null });
        }),
      );

      it.effect(
        "never sweeps a job its live worker holds, however long it queues, and still sweeps an orphan",
        () =>
          Effect.gen(function* () {
            // The portrait holds the one permit until it is released; the banner
            // queues behind it past the stale age (backdated here). Another NPC's
            // portrait, left `generating` with no job holding it, is what a process
            // that died leaves behind.
            const { stranger } = yield* Table;
            const theirs = yield* Theirs;
            const slow = scriptedImages({ apiUrl: OPENAI, model: MODEL });
            const portrait = yield* Deferred.make<void>();
            slow.next({ kind: "held", release: portrait });
            const npc = yield* addNpc(stranger, theirs, { name: "Patient", role: "a lamplighter" });
            const orphan = yield* addNpc(stranger, theirs, {
              name: "Orphan",
              role: "a ditch-digger",
            });
            yield* settled;
            yield* sql((sql) => sql`delete from npc_image where npc_id = ${npc.id}`);
            yield* sql((sql) => sql`delete from npc_banner where npc_id = ${npc.id}`);
            yield* sql(
              (sql) => sql`
              update npc_image set
                state = 'generating', failure = null, finished_at = null,
                created_at = now() - interval '10 minutes',
                updated_at = now() - interval '10 minutes'
              where npc_id = ${orphan.id}
            `,
            );

            const swept = yield* Effect.gen(function* () {
              const worker = yield* slowWorker(slow, "5 seconds");
              expect((yield* worker.drawNpc(npc)).imagePending).toBe(true);
              yield* requested(slow, worker, 1);
              yield* sql(
                (sql) => sql`
                update npc_banner set
                  created_at = now() - interval '10 minutes',
                  updated_at = now() - interval '10 minutes'
                where npc_id = ${npc.id}
              `,
              );
              const swept = yield* worker.sweep;
              yield* Deferred.succeed(portrait, undefined);
              yield* worker.idle;
              return swept;
            }).pipe(Effect.scoped, Effect.provideService(CurrentActor, stranger.actor));

            // Only the orphan was swept: the drawing portrait and the queued banner
            // were both held, and the banner still sent its request.
            expect(swept).toBe(1);
            expect(slow.requests().map((request) => request.size)).toEqual([
              "1024x1024",
              "1536x1024",
            ]);
            expect((yield* recordOf(npc.id))?.state).toBe("ready");
            expect(yield* bannerOf(npc.id)).toMatchObject({ state: "ready", failure: null });
            expect((yield* recordOf(orphan.id))?.failure).toBe("interrupted");
          }),
      );

      it.effect("spends the one daily budget portraits, banners and covers spend", () =>
        Effect.gen(function* () {
          // A fresh account: its cover and its NPCs' portraits and banners count
          // against one per-account limit. The cover and seven NPCs leave one draw.
          const bram = yield* aPerson("Bram");
          const own = yield* campaignOf(bram, "Bram's Table");
          for (let index = 0; index < PER_ACCOUNT / 2 - 1; index += 1) {
            yield* addNpc(bram, own, { name: `Bram's ${String(index)}`, role: "a regular" });
          }
          yield* settled;
          expect(yield* spentBy(bram)).toBe(PER_ACCOUNT - 1);

          // The last draw of the day goes to the portrait, and the banner is capped.
          const before = npcRequests().length;
          const bannersBefore = bannerRequests().length;
          const last = yield* addNpc(bram, own, { name: "Last Orders", role: "the barkeep" });
          yield* settled;
          expect(last.imagePending).toBe(true);
          expect(npcRequests().length - before).toBe(1);
          expect(bannerRequests().length).toBe(bannersBefore);
          expect((yield* recordOf(last.id))?.state).toBe("ready");
          const banner = yield* bannerOf(last.id);
          expect(banner?.failure).toBe("capped");
          expect(banner?.prompt).toContain("the barkeep");
          const read = yield* as(bram, (client) =>
            client.npcs.findById({ params: { campaignId: own, npcId: last.id } }),
          );
          expect(read.image).not.toBeNull();
          expect(read.banner).toBeNull();
          expect(read.imagePending).toBe(false);
          expect(yield* spentBy(bram)).toBe(PER_ACCOUNT);

          // Past the cap the portrait is capped, and a capped portrait starts no banner.
          const over = yield* addNpc(bram, own, { name: "One Too Many", role: "a latecomer" });
          yield* settled;
          expect(over.imagePending).toBe(false);
          expect(npcRequests().length - before).toBe(1);
          const record = yield* recordOf(over.id);
          expect(record?.failure).toBe("capped");
          expect(record?.prompt).toContain("a latecomer");
          expect(yield* bannerOf(over.id)).toBeUndefined();
          expect(yield* spentBy(bram)).toBe(PER_ACCOUNT);
        }),
      );

      it.effect(
        "spends nothing on a blank NPC, and caps the edit that gives it a subject over the limit, once",
        () =>
          Effect.gen(function* () {
            const cass = yield* aPerson("Cass");
            const own = yield* campaignOf(cass, "Cass's Table");
            const blank = yield* addNpc(cass, own, { name: UNNAMED_NPC });
            yield* settled;
            // The cover spent one; the blank NPC nothing.
            expect(yield* spentBy(cass)).toBe(1);
            // Seven NPCs drawn whole, and an eighth whose portrait is the day's last draw.
            for (let index = 0; index < PER_ACCOUNT / 2; index += 1) {
              yield* addNpc(cass, own, { name: `Cass's ${String(index)}`, role: "a regular" });
            }
            yield* settled;
            expect(yield* spentBy(cass)).toBe(PER_ACCOUNT);

            const before = npcRequests().length;
            const edited = yield* editNpc(cass, own, blank.id, { role: "a card sharp" });
            yield* settled;
            expect(edited.imagePending).toBe(false);
            expect(npcRequests().length).toBe(before);
            const record = yield* recordOf(blank.id);
            expect(record?.failure).toBe("capped");
            expect(record?.prompt).toContain("a card sharp");
            expect(yield* bannerOf(blank.id)).toBeUndefined();
            expect(yield* spentBy(cass)).toBe(PER_ACCOUNT);

            // A capped NPC is not tried again by its next edit: one record, ever.
            yield* editNpc(cass, own, blank.id, { role: "a card sharp, retired" });
            yield* settled;
            expect(npcRequests().length).toBe(before);
            expect((yield* recordOf(blank.id))?.id).toBe(record?.id);
            expect(yield* spentBy(cass)).toBe(PER_ACCOUNT);
          }),
      );
    });

    it.layer(
      Layer.effect(Theirs)(Effect.flatMap(Table, ({ ilse }) => campaignOf(ilse, "Ilse's Table"))),
    )("deleting an NPC", (it) => {
      it.effect("queues its portrait's files through the outbox, and the drain removes them", () =>
        Effect.gen(function* () {
          // The product archives a campaign NPC rather than deleting it, so the row
          // goes the way a campaign delete's cascade, or a future delete, would take it.
          const { ilse } = yield* Table;
          const theirs = yield* Theirs;
          const npc = yield* addNpc(ilse, theirs, { name: "Brief", role: "a candle-seller" });
          yield* settled;
          const record = (yield* recordOf(npc.id))!;
          const banner = (yield* bannerOf(npc.id))!;
          for (const file of FILES) {
            expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(true);
          }
          for (const file of BANNER_FILES) {
            expect(yield* stored(`${banner.storage_prefix}/${file}`)).toBe(true);
          }

          yield* sql((sql) => sql`delete from npc where id = ${npc.id}`);
          expect(yield* recordOf(npc.id)).toBeUndefined();
          expect(yield* bannerOf(npc.id)).toBeUndefined();
          yield* Effect.flatMap(HobImages, (worker) => worker.drainDeletions);
          for (const file of FILES) {
            expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(false);
          }
          for (const file of BANNER_FILES) {
            expect(yield* stored(`${banner.storage_prefix}/${file}`)).toBe(false);
          }
          const queued = yield* sql(
            (sql) => sql<{ readonly count: number }>`
            select count(*)::int as count from storage_deletion
            where prefix = ${record.storage_prefix}
          `,
          );
          expect(queued[0]?.count).toBe(0);
        }),
      );

      it.effect("takes the portrait with its campaign when the campaign is deleted", () =>
        Effect.gen(function* () {
          const { ilse } = yield* Table;
          const doomed = yield* campaignOf(ilse, "Doomed Table");
          const npc = yield* addNpc(ilse, doomed, { name: "Last", role: "the last guest" });
          yield* settled;
          const record = (yield* recordOf(npc.id))!;
          yield* as(ilse, (client) =>
            client.campaigns.deletePermanently({ params: { campaignId: doomed } }),
          );
          expect(yield* recordOf(npc.id)).toBeUndefined();
          yield* Effect.flatMap(HobImages, (worker) => worker.drainDeletions);
          for (const file of FILES) {
            expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(false);
          }
        }),
      );

      it.effect("leaves no files behind when the NPC is deleted mid-draw", () =>
        Effect.gen(function* () {
          const { ilse } = yield* Table;
          const theirs = yield* Theirs;
          const release = yield* Deferred.make<void>();
          images.next({ kind: "held", release });
          const npc = yield* addNpc(ilse, theirs, { name: "Gone", role: "a night traveller" });
          const record = (yield* recordOf(npc.id))!;
          expect(record.state).toBe("generating");

          yield* sql((sql) => sql`delete from npc where id = ${npc.id}`);
          yield* Deferred.succeed(release, undefined);
          yield* settled;
          yield* Effect.flatMap(HobImages, (worker) => worker.drainDeletions);
          for (const file of FILES) {
            expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(false);
          }
        }),
      );

      it.effect(
        "marks a portrait a dead process left behind interrupted, beside the other kinds",
        () =>
          Effect.gen(function* () {
            const { ilse } = yield* Table;
            const theirs = yield* Theirs;
            const npc = yield* addNpc(ilse, theirs, { name: "Stale", role: "a lantern-keeper" });
            yield* settled;
            yield* sql(
              (sql) => sql`
            update npc_image set
              state = 'generating', failure = null, finished_at = null,
              created_at = now() - interval '10 minutes',
              updated_at = now() - interval '10 minutes'
            where npc_id = ${npc.id}
          `,
            );
            const swept = yield* Effect.flatMap(HobImages, (worker) => worker.sweep);
            expect(swept).toBe(1);
            expect((yield* recordOf(npc.id))?.failure).toBe("interrupted");
          }),
      );
    });
  },
);
