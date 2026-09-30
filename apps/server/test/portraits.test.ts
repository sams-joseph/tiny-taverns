import { describe, expect } from "@effect/vitest";
import {
  Actor,
  type Character,
  type CharacterId,
  CurrentActor,
  HOUSE_BANNER_STYLE,
  HOUSE_PORTRAIT_STYLE,
  type HobEvent,
  TavernsApi,
} from "@taverns/api";
import { Context, Deferred, Effect, Layer, Option, Redacted, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { imageRequestBody } from "../src/images/ImageModel.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls, expiryFor } from "../src/images/ImageUrls.js";
import { Characters } from "../src/repo/Characters.js";
import { Party } from "../src/repo/Party.js";
import { ImageRecords } from "../src/repo/Images.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { ObjectStorage, StorageKey } from "../src/storage/ObjectStorage.js";
import { admittedTo, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { MODERATION_TEXT, scriptedImages } from "./support/imageModel.js";
import { scriptedModel, textChunks, toolCallChunks } from "./support/model.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Hob draws a portrait once, after a character is made, and whoever can see
 * the character can see it.**
 *
 * Over the real application: the real handlers, the real worker, `sharp`, the
 * memory storage adapter and Postgres. Only the two providers are scripted —
 * the image endpoint (`support/imageModel.ts`) and, for the drafting path,
 * Hob's chat model — so no request here leaves the process.
 */

const OPENAI = "https://api.openai.com/v1";
const MODEL = "gpt-image-2.5-flare";
const SECRET = Redacted.make("portrait-test-secret");
/** Four subjects' portraits and banners: each character is two draws. */
const PER_ACCOUNT = 8;

const images = scriptedImages({ apiUrl: OPENAI, model: MODEL });
const chat = scriptedModel({
  model: "scripted-local",
  maxTokens: 512,
  rounds: [
    toolCallChunks("proposeCharacter", {
      name: "Sorrel Ash",
      race: "Elf",
      subrace: null,
      className: "Druid",
      subclass: null,
      background: "Acolyte",
      abilityOrder: ["WIS", "CON", "DEX", "INT", "CHA", "STR"],
      skills: [],
      backstory: "She left Ashfen with the herbal under her coat.",
      bond: null,
      ideal: null,
      flaw: null,
      appearance: "Thirties, wiry, mud to the knees.",
      kit: [],
      rationale: ["You described someone who watches."],
    }),
    textChunks("Here she is."),
  ],
});

/** The clock image URLs are minted and checked against. */
let now = Date.now();

const database = migratedDatabase("taverns_test_portraits");
const storage = ObjectStorage.memory;
const urls = ImageUrls.layer(SECRET, () => now);
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(chat.layer)),
  undefined,
  storage,
  urls,
  HobImages.layer({
    generation: Option.some({
      limits: { perAccountPerDay: PER_ACCOUNT, perDay: 100 },
      // The production timeout (150 s). A short one here would race every
      // ordinary draw on a slow runner; the timeout test builds its own worker.
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

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

/** Wait for every drawing job to finish. */
const settled = () => Effect.flatMap(HobImages, (portraits) => portraits.idle);

interface Person {
  readonly token: string;
  readonly actor: Actor;
}

const person = (name: string) =>
  Effect.flatMap(Accounts, (accounts) => accounts.issue(name)).pipe(
    Effect.map((issued): Person => ({
      token: issued.token,
      actor: new Actor({ accountId: issued.accountId, scope: { _tag: "account" } }),
    })),
    Effect.orDie,
  );

/** Fetch a signed path without any credential, as an `<img>` does. */
const load = (path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(path);
    const bytes = new Uint8Array(yield* response.arrayBuffer);
    return { status: response.status, headers: response.headers, bytes };
  }).pipe(Effect.orDie);

const recordOf = (characterId: CharacterId) =>
  sql(
    (sql) =>
      sql<{
        readonly id: string;
        readonly state: string;
        readonly failure: string | null;
        readonly prompt: string | null;
        readonly model: string | null;
        readonly input_tokens: number | null;
        readonly output_tokens: number | null;
        readonly storage_prefix: string;
        readonly original_type: string | null;
        readonly width: number | null;
        readonly stored_bytes: number | null;
      }>`select * from character_portrait where character_id = ${characterId}`,
  ).pipe(Effect.map((rows) => rows[0]));

const bannerOf = (characterId: CharacterId) =>
  sql(
    (sql) =>
      sql<{
        readonly id: string;
        readonly state: string;
        readonly failure: string | null;
        readonly prompt: string | null;
        readonly model: string | null;
        readonly storage_prefix: string;
      }>`select * from character_banner where character_id = ${characterId}`,
  ).pipe(Effect.map((rows) => rows[0]));

/** Today's spend for an account, by kind. */
const spendOf = (accountId: string) =>
  sql(
    (sql) => sql<{ readonly kind: string; readonly count: number }>`
      select kind, count(*)::int as count from image_spend
      where account_id = ${accountId}
        and spent_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
      group by kind order by kind
    `,
  ).pipe(Effect.map((rows) => Object.fromEntries(rows.map((row) => [row.kind, row.count]))));

const stored = (key: string) =>
  Effect.flatMap(ObjectStorage, (objects) => objects.head(StorageKey(key))).pipe(
    Effect.orDie,
    Effect.map(Option.isSome),
  );

const mine = (token: string, id: CharacterId) =>
  as(token, (client) => client.me.characters()).pipe(
    Effect.map(
      (owned): Character | undefined => owned.find((entry) => entry.character.id === id)?.character,
    ),
  );

const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment();
  yield* importSystemOptions();
  const dm = yield* person("Jo");
  const ilse = yield* person("Ilse");
  const wren = yield* person("Wren");
  const stranger = yield* person("Bo");
  const campaignId = (yield* as(dm.token, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  )).id;
  // The campaign's own cover draws too; let it finish before any test counts
  // requests to the image endpoint.
  yield* settled();
  yield* admittedTo(campaignId, ilse.actor, "Ilse");
  yield* admittedTo(campaignId, wren.actor, "Wren");
  return { dm, ilse, wren, stranger, campaignId };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "portraits.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const createAs = (
  who: Person,
  payload: Parameters<Client["me"]["createCharacter"]>[0]["payload"],
) =>
  Effect.flatMap(Fixture, ({ campaignId }) =>
    as(who.token, (client) => client.me.createCharacter({ params: { campaignId }, payload })),
  );

/** The form's create, as the first describe's tests share it. */
const makeMarta = Effect.gen(function* () {
  const { ilse } = yield* Fixture;
  const before = images.requests().length;
  const character = yield* createAs(ilse, {
    name: "Marta Vell",
    race: "Dwarf",
    className: "Fighter",
    sheet: {
      notes: "",
      abilities: [],
      traits: [],
      story: { appearance: "Grey braids, a broken nose." },
    },
  });
  yield* settled();
  expect(images.requests().length - before).toBe(2);
  return character;
});

class Marta extends Context.Service<Marta, Character>()("portraits.test/Marta") {}

/** An account of its own: the others have spent their daily portraits. */
const makePip = Effect.gen(function* () {
  const { campaignId } = yield* Fixture;
  const pip = yield* person("Pip");
  yield* admittedTo(campaignId, pip.actor, "Pip");
  return pip;
});

class Pip extends Context.Service<Pip, Person>()("portraits.test/Pip") {}

const events = (actor: Actor) =>
  Effect.gen(function* () {
    const { campaignId } = yield* Fixture;
    const hob = yield* Hob;
    const stream = yield* hob.ask(campaignId, {
      text: "A wood elf herbalist.",
      intent: "character",
    });
    return Array.from(yield* Stream.runCollect(stream)) as ReadonlyArray<HobEvent>;
  }).pipe(Effect.provideService(CurrentActor, actor), Effect.orDie);

describeLayer(
  "portraits",
  shared,
  (it) => {
    it.layer(Layer.effect(Marta)(makeMarta))(
      "the form's create draws one portrait and one banner",
      (it) => {
        it.effect("answers the create with the drawing state, and the draw finishes ready", () =>
          Effect.gen(function* () {
            const { ilse } = yield* Fixture;
            const character = yield* Marta;
            expect(character.portraitPending).toBe(true);
            expect(character.portrait).toBeNull();

            const record = yield* recordOf(character.id);
            expect(record?.state).toBe("ready");
            expect(record?.failure).toBeNull();
            expect(record?.model).toBe(MODEL);
            expect(record?.prompt).toContain("Dwarf Fighter");
            expect(record?.prompt).toContain("Grey braids, a broken nose.");
            expect(record?.prompt).not.toContain("Marta");
            expect(record?.original_type).toBe("image/png");
            expect(record?.width).toBe(1);
            expect(record?.input_tokens).toBe(57);
            expect(record?.output_tokens).toBe(272);
            expect(record?.stored_bytes).toBeGreaterThan(0);

            for (const file of ["original.png", "full.webp", "card.webp", "thumb.webp"]) {
              expect(yield* stored(`${record!.storage_prefix}/${file}`)).toBe(true);
            }
            expect(record?.storage_prefix).toBe(
              `portraits/${ilse.actor.accountId}/${character.id}/${record!.id}`,
            );
          }),
        );

        it.effect("draws the banner as its own image, from the same builder framed wide", () =>
          Effect.gen(function* () {
            const { ilse } = yield* Fixture;
            const character = yield* Marta;
            const portrait = (yield* recordOf(character.id))!;
            const banner = (yield* bannerOf(character.id))!;
            expect(banner.state).toBe("ready");
            expect(banner.id).not.toBe(portrait.id);
            expect(banner.model).toBe(MODEL);
            // The same subject, the same words, the banner's framing in place of the plate's.
            expect(banner.prompt).toBe(
              portrait.prompt!.replace(HOUSE_PORTRAIT_STYLE, HOUSE_BANNER_STYLE),
            );
            expect(banner.prompt).not.toContain("Marta");
            const body = images.requests().find((request) => request.prompt === banner.prompt);
            expect(body?.size).toBe("1536x1024");
            for (const file of ["original.png", "full.webp", "card.webp"]) {
              expect(yield* stored(`${banner.storage_prefix}/${file}`)).toBe(true);
            }
            expect(yield* stored(`${banner.storage_prefix}/thumb.webp`)).toBe(false);
            expect(banner.storage_prefix).toBe(
              `portrait-banners/${ilse.actor.accountId}/${character.id}/${banner.id}`,
            );
          }),
        );

        it.effect("spends two draws, one of each kind", () =>
          Effect.gen(function* () {
            const { ilse } = yield* Fixture;
            expect(yield* spendOf(ilse.actor.accountId)).toEqual({
              character: 1,
              characterBanner: 1,
            });
          }),
        );

        it.effect(
          "sends OpenAI's dialect to api.openai.com, and exactly the prompt it recorded",
          () =>
            Effect.gen(function* () {
              const character = yield* Marta;
              const record = yield* recordOf(character.id);
              const body = images.requests().find((request) => request.prompt === record?.prompt);
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

        it.effect("sends a local endpoint only the fields sd-server documents", () =>
          Effect.sync(() => {
            expect(
              imageRequestBody(
                { apiUrl: "http://127.0.0.1:1234/v1", model: "flux-klein", quality: "medium" },
                "a prompt",
                "1024x1024",
              ),
            ).toEqual({
              model: "flux-klein",
              prompt: "a prompt",
              n: 1,
              size: "1024x1024",
              output_format: "png",
            });
          }),
        );

        it.effect("puts signed URLs on the owner's read, and serves WebP through them", () =>
          Effect.gen(function* () {
            const { ilse } = yield* Fixture;
            const character = yield* Marta;
            const read = yield* mine(ilse.token, character.id);
            expect(read?.portraitPending).toBe(false);
            const portrait = read?.portrait;
            expect(portrait).not.toBeNull();
            for (const [path, size] of [
              [portrait!.thumbUrl, 160],
              [portrait!.cardUrl, 640],
              [portrait!.fullUrl, 1024],
            ] as const) {
              const response = yield* load(path);
              expect(response.status).toBe(200);
              expect(response.headers["content-type"]).toBe("image/webp");
              expect(response.headers["cache-control"]).toMatch(
                /^private, max-age=\d+, immutable$/,
              );
              expect(response.headers["x-content-type-options"]).toBe("nosniff");
              expect(response.headers["content-security-policy"]).toBe("default-src 'none'");
              // RIFF....WEBP
              expect(new TextDecoder().decode(response.bytes.slice(8, 12))).toBe("WEBP");
              const sharp = (yield* Effect.promise(() => import("sharp"))).default;
              expect((yield* Effect.promise(() => sharp(response.bytes).metadata())).width).toBe(
                size,
              );
            }
          }),
        );

        it.effect("signs the banner beside the portrait, and serves 2:1 WebP through it", () =>
          Effect.gen(function* () {
            const { ilse } = yield* Fixture;
            const character = yield* Marta;
            const banner = (yield* mine(ilse.token, character.id))?.banner;
            expect(banner?.cardUrl).toMatch(/^\/portrait-banners\//);
            const sharp = (yield* Effect.promise(() => import("sharp"))).default;
            for (const [path, width, height] of [
              [banner!.cardUrl, 768, 384],
              [banner!.fullUrl, 1536, 768],
            ] as const) {
              const response = yield* load(path);
              expect(response.status).toBe(200);
              expect(response.headers["content-type"]).toBe("image/webp");
              const metadata = yield* Effect.promise(() => sharp(response.bytes).metadata());
              expect([metadata.width, metadata.height]).toEqual([width, height]);
            }
            // A banner's signature opens nothing on the portrait's route, and back.
            const portrait = (yield* mine(ilse.token, character.id))!.portrait!;
            expect(
              (yield* load(banner!.cardUrl.replace("/portrait-banners/", "/portraits/"))).status,
            ).toBe(404);
            expect(
              (yield* load(portrait.cardUrl.replace("/portraits/", "/portrait-banners/"))).status,
            ).toBe(404);
          }),
        );

        it.effect("refuses a forged, altered, other-size or expired URL with the same 404", () =>
          Effect.gen(function* () {
            const { ilse } = yield* Fixture;
            const character = yield* Marta;
            const { thumbUrl, cardUrl } = (yield* mine(ilse.token, character.id))!.portrait!;
            const url = new URL(thumbUrl, "http://x");
            const signature = url.searchParams.get("s")!;
            const cases = [
              thumbUrl.replace(signature, `${signature.slice(0, -2)}AA`),
              thumbUrl.replace(/s=[^&]+/, ""),
              thumbUrl.replace(/e=\d+/, `e=${String(Number(url.searchParams.get("e")) + 1)}`),
              // A signature for one size does not open another.
              cardUrl.replace("/card?", "/full?"),
              thumbUrl.replace("/thumb?", "/original?"),
              thumbUrl.replace(/portraits\/[^/]+/, "portraits/not-a-uuid"),
            ];
            for (const path of cases) expect((yield* load(path)).status).toBe(404);

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

        it.effect("is drawn once: nothing is drawn again when the character changes", () =>
          Effect.gen(function* () {
            const { ilse } = yield* Fixture;
            const character = yield* Marta;
            const before = images.requests().length;
            yield* as(ilse.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: character.id },
                payload: { level: 2 },
              }),
            );
            const record = yield* Effect.flatMap(ImageRecords, (records) =>
              records.start("character", character.id, {
                prompt: "again",
                model: MODEL,
                limits: { perAccountPerDay: 100, perDay: 100 },
              }),
            ).pipe(Effect.provideService(CurrentActor, ilse.actor));
            const banner = yield* Effect.flatMap(ImageRecords, (records) =>
              records.start("characterBanner", character.id, {
                prompt: "again",
                model: MODEL,
                limits: { perAccountPerDay: 100, perDay: 100 },
              }),
            ).pipe(Effect.provideService(CurrentActor, ilse.actor));
            yield* settled();
            expect(record).toBeUndefined();
            expect(banner).toBeUndefined();
            expect(images.requests().length).toBe(before);
            // The update's own response carries the portrait too.
            expect((yield* mine(ilse.token, character.id))?.portrait).not.toBeNull();
          }),
        );

        it.effect("gives the URLs to exactly the readers of the character", () =>
          Effect.gen(function* () {
            const { dm, ilse, wren, stranger, campaignId } = yield* Fixture;
            const character = yield* Marta;
            const joined = yield* as(ilse.token, (client) =>
              client.party.join({ params: { campaignId }, payload: { characterId: character.id } }),
            );
            const seat = joined.seat.id;
            const partyAs = (who: Person) =>
              Effect.flatMap(Party, (party) => party.list(campaignId)).pipe(
                Effect.provideService(CurrentActor, who.actor),
                Effect.result,
              );
            const characterIn = (who: Person) =>
              Effect.gen(function* () {
                const result = yield* partyAs(who);
                if (result._tag === "Failure") return "refused" as const;
                return (
                  result.success.find((entry) => entry.seat.id === seat)?.character ?? undefined
                );
              });

            // The seat starts `dm`: its owner and the creator read the character, and
            // both get the picture; a seat-mate reads no character and gets no URL.
            const thumbOf = (who: Person) =>
              Effect.gen(function* () {
                const read = yield* characterIn(who);
                return read === "refused" ? undefined : read?.portrait?.thumbUrl;
              });
            const bannerIn = (who: Person) =>
              Effect.gen(function* () {
                const read = yield* characterIn(who);
                return read === "refused" ? undefined : read?.banner?.cardUrl;
              });
            expect(yield* thumbOf(ilse)).toMatch(/^\/portraits\//);
            expect(yield* thumbOf(dm)).toMatch(/^\/portraits\//);
            expect(yield* bannerIn(ilse)).toMatch(/^\/portrait-banners\//);
            expect(yield* bannerIn(dm)).toMatch(/^\/portrait-banners\//);
            expect(yield* characterIn(wren)).toBeUndefined();

            // Shared, the seat-mate reads the character, so the seat-mate sees it too.
            yield* as(dm.token, (client) =>
              client.party.update({
                params: { campaignId, campaignCharacterId: seat },
                payload: { visibility: "shared" },
              }),
            );
            const seen = yield* thumbOf(wren);
            expect(seen).toMatch(/^\/portraits\//);
            expect((yield* load(seen!)).status).toBe(200);
            const seenBanner = yield* bannerIn(wren);
            expect(seenBanner).toMatch(/^\/portrait-banners\//);
            expect((yield* load(seenBanner!)).status).toBe(200);

            // Somebody at no table of hers reads neither the character nor a URL.
            expect(yield* characterIn(stranger)).toBe("refused");
            expect(yield* mine(stranger.token, character.id)).toBeUndefined();
            const owned = yield* as(stranger.token, (client) => client.me.characters());
            expect(JSON.stringify(owned)).not.toContain("/portraits/");
            expect(JSON.stringify(owned)).not.toContain("/portrait-banners/");
          }),
        );

        it.effect("deletes the files with the character", () =>
          Effect.gen(function* () {
            const { ilse } = yield* Fixture;
            const character = yield* Marta;
            const record = (yield* recordOf(character.id))!;
            const banner = (yield* bannerOf(character.id))!;
            yield* as(ilse.token, (client) =>
              client.me.deleteCharacter({ params: { characterId: character.id } }),
            );
            yield* Effect.flatMap(HobImages, (portraits) => portraits.drainDeletions);
            expect(yield* recordOf(character.id)).toBeUndefined();
            expect(yield* bannerOf(character.id)).toBeUndefined();
            for (const file of ["original.png", "full.webp", "card.webp", "thumb.webp"]) {
              expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(false);
            }
            for (const file of ["original.png", "full.webp", "card.webp"]) {
              expect(yield* stored(`${banner.storage_prefix}/${file}`)).toBe(false);
            }
            const queued = yield* sql(
              (sql) => sql<{ readonly count: number }>`
                select count(*)::int as count from storage_deletion where prefix = ${record.storage_prefix}
              `,
            );
            expect(queued[0]?.count).toBe(0);
          }),
        );
      },
    );

    describe("the plates beyond the character's own read", () => {
      it.effect(
        "carry the portrait on the runner, the recap and the player table, over the real wiring",
        () =>
          Effect.gen(function* () {
            const { dm, ilse, campaignId } = yield* Fixture;
            const character = yield* createAs(ilse, {
              name: "Oda Flint",
              race: "Gnome",
              className: "Wizard",
              sheet: {
                notes: "",
                abilities: [],
                traits: [],
                story: { appearance: "Ink to the elbows." },
              },
            });
            yield* settled();
            yield* as(ilse.token, (client) =>
              client.party.join({ params: { campaignId }, payload: { characterId: character.id } }),
            );
            const expected = (yield* mine(ilse.token, character.id))?.portrait;
            expect(expected).not.toBeNull();

            const session = yield* as(dm.token, (client) =>
              client.sessions.create({
                params: { campaignId },
                payload: { number: 1, title: "The ford", visibility: "shared" },
              }),
            );
            yield* as(dm.token, (client) =>
              client.campaigns.update({
                params: { campaignId },
                payload: { currentSessionId: session.id },
              }),
            );
            const encounter = yield* as(dm.token, (client) =>
              client.encounters.create({ params: { campaignId }, payload: { name: "Reeds" } }),
            );
            const fight = yield* as(dm.token, (client) =>
              client.runs.start({
                params: { campaignId, sessionId: session.id },
                payload: { encounterId: encounter.id, visibility: "shared" },
              }),
            );
            const params = { campaignId, sessionId: session.id, runId: fight.id };
            const rows = yield* as(dm.token, (client) => client.combatants.list({ params }));
            const row = rows.find((entry) => entry.characterId === character.id)!;
            expect(row.portrait).toEqual(expected);

            const recap = yield* as(dm.token, (client) =>
              client.recap.read({ params: { campaignId, sessionId: session.id } }),
            );
            const recapped = recap.fights.flatMap((entry) => entry.combatants);
            expect(recapped.find((entry) => entry.characterId === character.id)?.portrait).toEqual(
              expected,
            );

            yield* as(dm.token, (client) =>
              client.combatants.update({
                params: { ...params, combatantId: row.id },
                payload: { visibility: "shared" },
              }),
            );
            const table = yield* as(ilse.token, (client) =>
              client.table.read({ params: { campaignId } }),
            );
            const you = table?.fight?.order.find((entry) => entry.kind === "you");
            expect(you?.kind === "you" && you.portrait).toEqual(expected);
          }),
      );
    });

    describe("Hob's kept draft draws one portrait and one banner", () => {
      it.effect("starts the draw from the accept, and it ends ready", () =>
        Effect.gen(function* () {
          const { wren, campaignId } = yield* Fixture;
          const asked = yield* events(wren.actor);
          const began = asked.find((event) => event.event === "began");
          if (began?.event !== "began") throw new Error("no began event");
          expect(asked.some((event) => event.event === "proposal")).toBe(true);

          const before = images.requests().length;
          const accepted = yield* as(wren.token, (client) =>
            client.hob.accept({
              params: { campaignId, threadId: began.data.threadId, turnId: began.data.turnId },
              payload: {},
            }),
          );
          if (accepted.accepted !== "character") throw new Error("accepted something else");
          expect(accepted.character.portraitPending).toBe(true);
          yield* settled();

          expect(images.requests().length - before).toBe(2);
          const record = yield* recordOf(accepted.character.id);
          expect(record?.state).toBe("ready");
          expect((yield* bannerOf(accepted.character.id))?.state).toBe("ready");
          expect(record?.prompt).toContain("Elf Druid");
          expect(record?.prompt).toContain("Thirties, wiry, mud to the knees.");
          const read = yield* mine(wren.token, accepted.character.id);
          expect(read?.portrait).not.toBeNull();
          expect(read?.banner).not.toBeNull();
        }),
      );
    });

    describe("when there is no portrait", () => {
      it.effect("skips a character with nothing to draw from, and says so on the record", () =>
        Effect.gen(function* () {
          const { wren } = yield* Fixture;
          const before = images.requests().length;
          const character = yield* createAs(wren, { name: "Nobody In Particular" });
          yield* settled();
          expect(character.portraitPending).toBe(false);
          expect(images.requests().length).toBe(before);
          const record = yield* recordOf(character.id);
          expect(record?.state).toBe("failed");
          expect(record?.failure).toBe("skipped");
          expect(record?.prompt).toBeNull();
          // A skipped portrait starts no banner: the banner never starts alone.
          expect(yield* bannerOf(character.id)).toBeUndefined();
          const read = yield* mine(wren.token, character.id);
          expect(read?.portrait).toBeNull();
          expect(read?.banner).toBeNull();
        }),
      );

      it.effect("records a moderation refusal and puts no provider text anywhere", () =>
        Effect.gen(function* () {
          const { wren } = yield* Fixture;
          images.next({ kind: "refused" });
          const character = yield* createAs(wren, {
            name: "Grim",
            race: "Orc",
            className: "Barbarian",
          });
          yield* settled();
          const record = yield* recordOf(character.id);
          expect(record?.state).toBe("failed");
          expect(record?.failure).toBe("refused");
          const read = yield* mine(wren.token, character.id);
          expect(read?.portrait).toBeNull();
          expect(read?.portraitPending).toBe(false);
          expect(JSON.stringify(read)).not.toContain("secret-provider-words");
          expect(JSON.stringify(record)).not.toContain(MODERATION_TEXT);
        }),
      );

      it.effect("records a provider failure as provider", () =>
        Effect.gen(function* () {
          const { wren } = yield* Fixture;
          images.next({ kind: "error", status: 500 });
          const character = yield* createAs(wren, {
            name: "Tam",
            race: "Human",
            className: "Rogue",
          });
          yield* settled();
          expect((yield* recordOf(character.id))?.failure).toBe("provider");
        }),
      );

      it.effect("records a draw that outlives the job timeout as timeout", () =>
        Effect.gen(function* () {
          const { wren } = yield* Fixture;
          // A worker of its own, with a timeout a test can wait for, over an endpoint
          // that never answers — so the outcome cannot depend on how fast the
          // machine is. The shared worker keeps the production timeout.
          const hanging = scriptedImages({ apiUrl: OPENAI, model: MODEL });
          hanging.next({ kind: "hang" }, { kind: "hang" });
          const created = yield* sql(
            (sql) => sql<{ readonly id: CharacterId }>`
              insert into character ${sql.insert({
                account_id: wren.actor.accountId,
                name: "Slow",
                race: "Gnome",
                class_name: "Wizard",
              })}
              returning id
            `,
          );
          const id = created[0]!.id;
          const character = (yield* Effect.flatMap(Characters, (characters) =>
            characters.mine.pipe(
              Effect.map((owned) => owned.find((entry) => entry.character.id === id)?.character),
            ),
          ).pipe(Effect.provideService(CurrentActor, wren.actor)))!;

          yield* Effect.scoped(
            Effect.gen(function* () {
              const built = yield* Layer.build(
                HobImages.layer({
                  generation: Option.some({
                    limits: { perAccountPerDay: 100, perDay: 100 },
                    concurrency: 1,
                    timeout: "200 millis",
                  }),
                  storageOn: false,
                }).pipe(
                  Layer.provide([ImageRecords.layer, ObjectStorage.memory, urls, hanging.layer]),
                ),
              );
              const worker = Context.get(built, HobImages);
              const answered = yield* worker.drawCharacter(character);
              expect(answered.portraitPending).toBe(true);
              yield* worker.idle;
            }),
          ).pipe(Effect.provideService(CurrentActor, wren.actor));

          // The portrait and its banner, each under its own timeout.
          expect(hanging.requests().map((request) => request.size)).toEqual([
            "1024x1024",
            "1536x1024",
          ]);
          const record = yield* recordOf(id);
          expect(record?.state).toBe("failed");
          expect(record?.failure).toBe("timeout");
          expect((yield* bannerOf(id))?.failure).toBe("timeout");
          // Whatever might have been put is queued for deletion with the failure.
          const queued = yield* sql(
            (sql) => sql<{ readonly count: number }>`
              select count(*)::int as count from storage_deletion where prefix = ${record!.storage_prefix}
            `,
          );
          expect(queued[0]?.count).toBe(1);
        }),
      );

      it.effect("stops drawing for an account at its daily cap, and records why", () =>
        Effect.gen(function* () {
          const { campaignId } = yield* Fixture;
          // A fresh account, so the count is this test's alone.
          const bram = yield* person("Bram");
          yield* admittedTo(campaignId, bram.actor, "Bram");
          const drawn: Array<Character> = [];
          for (let index = 0; index < PER_ACCOUNT / 2; index += 1) {
            drawn.push(yield* createAs(bram, { name: `Bram ${String(index)}`, race: "Halfling" }));
          }
          yield* settled();
          const before = images.requests().length;
          const over = yield* createAs(bram, { name: "One too many", race: "Halfling" });
          yield* settled();
          expect(over.portraitPending).toBe(false);
          expect(images.requests().length).toBe(before);
          const record = yield* recordOf(over.id);
          expect(record?.failure).toBe("capped");
          expect(record?.prompt).toContain("Halfling");
          // A capped portrait starts no banner, so nothing is recorded for one.
          expect(yield* bannerOf(over.id)).toBeUndefined();
          expect(drawn.every((character) => character.portraitPending)).toBe(true);
          expect(yield* spendOf(bram.actor.accountId)).toEqual({
            character: PER_ACCOUNT / 2,
            characterBanner: PER_ACCOUNT / 2,
          });
        }),
      );

      it.effect("draws the portrait and caps the banner when one draw is left in the day", () =>
        Effect.gen(function* () {
          const { campaignId } = yield* Fixture;
          const odo = yield* person("Odo");
          yield* admittedTo(campaignId, odo.actor, "Odo");
          // A Shared World's cover is one draw from the same budget, which leaves an odd one.
          yield* as(odo.token, (client) =>
            client.sharedWorlds.create({ payload: { name: "Odo's World" } }),
          );
          for (let index = 0; index < PER_ACCOUNT / 2 - 1; index += 1) {
            yield* createAs(odo, { name: `Odo ${String(index)}`, race: "Gnome" });
          }
          yield* settled();
          const before = images.requests().length;
          const last = yield* createAs(odo, { name: "Odo last", race: "Gnome" });
          yield* settled();
          expect(last.portraitPending).toBe(true);
          expect(images.requests().length - before).toBe(1);
          expect((yield* recordOf(last.id))?.state).toBe("ready");
          const banner = yield* bannerOf(last.id);
          expect(banner?.state).toBe("failed");
          expect(banner?.failure).toBe("capped");
          expect(banner?.prompt).toContain(HOUSE_BANNER_STYLE);
          // The band falls back to the square: a portrait, and no banner.
          const read = yield* mine(odo.token, last.id);
          expect(read?.portrait).not.toBeNull();
          expect(read?.banner).toBeNull();
          expect(read?.portraitPending).toBe(false);
          expect(yield* spendOf(odo.actor.accountId)).toEqual({
            character: PER_ACCOUNT / 2,
            characterBanner: PER_ACCOUNT / 2 - 1,
            sharedWorld: 1,
          });
        }),
      );

      it.effect("does not give a deleted character's draw back to the account's day", () =>
        Effect.gen(function* () {
          const { campaignId } = yield* Fixture;
          // Deleting the subject cascades its portrait row; the spend must outlive it.
          const tam = yield* person("Tam");
          yield* admittedTo(campaignId, tam.actor, "Tam");
          const drawn: Array<Character> = [];
          for (let index = 0; index < PER_ACCOUNT / 2; index += 1) {
            drawn.push(yield* createAs(tam, { name: `Tam ${String(index)}`, race: "Dwarf" }));
          }
          yield* settled();
          expect(drawn.every((character) => character.portraitPending)).toBe(true);
          for (const character of drawn) {
            yield* as(tam.token, (client) =>
              client.me.deleteCharacter({ params: { characterId: character.id } }),
            );
          }
          expect(yield* Effect.all(drawn.map((character) => recordOf(character.id)))).toEqual(
            drawn.map(() => undefined),
          );

          const before = images.requests().length;
          const again = yield* createAs(tam, { name: "Tam again", race: "Dwarf" });
          yield* settled();
          expect(again.portraitPending).toBe(false);
          expect(images.requests().length).toBe(before);
          expect((yield* recordOf(again.id))?.failure).toBe("capped");
        }),
      );

      it.effect("does not give a deleted character's draw back to everybody's day", () =>
        Effect.gen(function* () {
          const { stranger } = yield* Fixture;
          const start = (name: string, perDay: number) =>
            Effect.gen(function* () {
              const sql = yield* SqlClient.SqlClient;
              const rows = yield* sql<{ readonly id: CharacterId }>`
                insert into character ${sql.insert({ account_id: stranger.actor.accountId, name })}
                returning id
              `;
              const records = yield* ImageRecords;
              const job = yield* records.start("character", rows[0]!.id, {
                prompt: "a goliath",
                model: MODEL,
                limits: { perAccountPerDay: 100, perDay },
              });
              // Nothing draws a job started here; close it so no row is left drawing.
              if (job !== undefined) yield* records.fail(job, "provider");
              return { id: rows[0]!.id, job };
            }).pipe(Effect.provideService(CurrentActor, stranger.actor), Effect.orDie);
          const spent = yield* sql(
            (sql) => sql<{ readonly count: number }>`
              select count(*)::int as count from image_spend
              where spent_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
            `,
          );
          // One below the overall cap: this start is the last draw of the day.
          const perDay = spent[0]!.count + 1;
          const last = yield* start("Last", perDay);
          expect(last.job).toBeDefined();
          yield* sql((sql) => sql`delete from character where id = ${last.id}`);
          expect(yield* recordOf(last.id)).toBeUndefined();

          const next = yield* start("Next", perDay);
          expect(next.job).toBeUndefined();
          expect((yield* recordOf(next.id))?.failure).toBe("capped");
        }),
      );

      it.effect("stops drawing for everybody at the overall cap", () =>
        Effect.gen(function* () {
          const { stranger } = yield* Fixture;
          // A character with no record yet, which only a raw row can be while
          // generation is on: every create through the product starts one.
          const other = yield* Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            const rows = yield* sql<{ readonly id: CharacterId }>`
              insert into character ${sql.insert({ account_id: stranger.actor.accountId, name: "Raw" })}
              returning id
            `;
            const records = yield* ImageRecords;
            const job = yield* records.start("character", rows[0]!.id, {
              prompt: "a tiefling",
              model: MODEL,
              limits: { perAccountPerDay: 100, perDay: 0 },
            });
            return { id: rows[0]!.id, job };
          }).pipe(Effect.provideService(CurrentActor, stranger.actor), Effect.orDie);
          expect(other.job).toBeUndefined();
          expect((yield* recordOf(other.id))?.failure).toBe("capped");
        }),
      );
    });

    it.layer(Layer.effect(Pip)(makePip))("crashes and deletes in the middle of a draw", (it) => {
      it.effect("leaves no files behind when the character is deleted mid-draw", () =>
        Effect.gen(function* () {
          const pip = yield* Pip;
          const release = yield* Deferred.make<void>();
          images.next({ kind: "held", release });
          const character = yield* createAs(pip, { name: "Brief", race: "Elf", className: "Bard" });
          const record = (yield* recordOf(character.id))!;
          expect(record.state).toBe("generating");

          yield* as(pip.token, (client) =>
            client.me.deleteCharacter({ params: { characterId: character.id } }),
          );
          yield* Deferred.succeed(release, undefined);
          yield* settled();
          yield* Effect.flatMap(HobImages, (portraits) => portraits.drainDeletions);

          for (const file of ["original.png", "full.webp", "card.webp", "thumb.webp"]) {
            expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(false);
          }
        }),
      );

      it.effect("marks a draw a dead process left behind interrupted, and queues its files", () =>
        Effect.gen(function* () {
          const pip = yield* Pip;
          const character = yield* createAs(pip, { name: "Stale" });
          yield* settled();
          // A row as a process that died mid-draw ten minutes ago left it.
          const stale = yield* sql(
            (sql) => sql<{ readonly storage_prefix: string }>`
              update character_portrait set
                state = 'generating', failure = null, finished_at = null, prompt = 'x', model = 'm',
                created_at = now() - interval '10 minutes',
                updated_at = now() - interval '10 minutes'
              where character_id = ${character.id}
              returning storage_prefix
            `,
          );
          // A fresh draw is not stale, and is left alone.
          const release = yield* Deferred.make<void>();
          images.next({ kind: "held", release });
          const fresh = yield* createAs(pip, { name: "Fresh", race: "Elf" });

          const swept = yield* Effect.flatMap(HobImages, (portraits) => portraits.sweep);
          expect(swept).toBe(1);
          const record = yield* recordOf(character.id);
          expect(record?.state).toBe("failed");
          expect(record?.failure).toBe("interrupted");
          expect((yield* recordOf(fresh.id))?.state).toBe("generating");
          const queued = yield* sql(
            (sql) => sql<{ readonly count: number }>`
              select count(*)::int as count from storage_deletion
              where prefix = ${stale[0]!.storage_prefix}
            `,
          );
          expect(queued[0]?.count).toBe(1);

          yield* Deferred.succeed(release, undefined);
          yield* settled();
          expect((yield* recordOf(fresh.id))?.state).toBe("ready");
        }),
      );
    });
  },
  { timeout: "120 seconds" },
);
