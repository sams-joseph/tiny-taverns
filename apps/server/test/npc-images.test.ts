import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  CurrentActor,
  HOUSE_BANNER_STYLE,
  HOUSE_PORTRAIT_STYLE,
  type Npc,
  type NpcCreate,
  type NpcId,
  type NpcUpdate,
  TavernsApi,
  UNNAMED_NPC,
} from "@taverns/api";
import { Context, Deferred, Effect, Layer, ManagedRuntime, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls, expiryFor, signedPath } from "../src/images/ImageUrls.js";
import { ImageRecords } from "../src/repo/Images.js";
import { Npcs } from "../src/repo/Npcs.js";
import { ObjectStorage, StorageKey } from "../src/storage/ObjectStorage.js";
import { aCharacterAt, aGroupMemberAt, admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { MODERATION_TEXT, scriptedImages } from "./support/imageModel.js";

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

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(ImageRecords.layer),
    Layer.provideMerge(services),
    Layer.provideMerge(database),
  ),
);
afterAll(() => runtime.dispose());

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });
type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(Effect.flatMap(clientFor(token), call).pipe(Effect.orDie));

/** The same call, answering the failure's tag rather than dying on it. */
const attempt = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  runtime.runPromise(
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
    ),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie));

/** Wait for every drawing job to finish. */
const settled = () => runtime.runPromise(Effect.flatMap(HobImages, (worker) => worker.idle));

interface Person {
  readonly token: string;
  readonly actor: Actor;
}

const person = async (name: string): Promise<Person> => {
  const issued = await run(Effect.flatMap(Accounts, (accounts) => accounts.issue(name)));
  return {
    token: issued.token,
    actor: new Actor({ accountId: issued.accountId, scope: { _tag: "account" } }),
  };
};

/** Fetch a signed path without any credential, as an `<img>` does. */
const load = (path: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.get(path);
      const bytes = new Uint8Array(yield* response.arrayBuffer);
      return { status: response.status, headers: response.headers, bytes };
    }).pipe(Effect.orDie),
  );

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
  sql((sql) => sql<Record>`select * from npc_image where npc_id = ${npcId}`).then(
    (rows) => rows[0],
  );

const bannerOf = (npcId: NpcId) =>
  sql((sql) => sql<Record>`select * from npc_banner where npc_id = ${npcId}`).then(
    (rows) => rows[0],
  );

const stored = (key: string) =>
  run(Effect.flatMap(ObjectStorage, (objects) => objects.head(StorageKey(key)))).then(
    Option.isSome,
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
  as(who.token, (client) => client.campaigns.create({ payload: { name } })).then(
    async (campaign) => {
      await settled();
      return campaign.id;
    },
  );

const addNpc = (who: Person, campaignId: CampaignId, payload: NpcCreate) =>
  as(who.token, (client) => client.npcs.create({ params: { campaignId }, payload }));

const editNpc = (who: Person, campaignId: CampaignId, npcId: NpcId, payload: NpcUpdate) =>
  as(who.token, (client) => client.npcs.update({ params: { campaignId, npcId }, payload }));

/** What an account has spent on images today: the ledger the daily caps count. */
const spentBy = (who: Person) =>
  sql(
    (sql) => sql<{ readonly count: number }>`
      select count(*)::int as count from image_spend where account_id = ${who.actor.accountId}
    `,
  ).then((rows) => rows[0]?.count ?? 0);

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

let jo: Person;
let ilse: Person;
let stranger: Person;
let table: CampaignId;

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");
  table = await campaignOf(jo, "The Salt Road");
}, 60_000);

describe("adding an NPC to the cast draws one portrait and one banner", () => {
  let npc: Npc;
  let requestsBefore: number;
  let bannersBefore: number;

  beforeAll(async () => {
    requestsBefore = npcRequests().length;
    bannersBefore = bannerRequests().length;
    npc = await addNpc(jo, table, FERRYMAN);
    await settled();
  }, 60_000);

  it("answers the create with the drawing state, and the draw finishes ready", async () => {
    expect(npcRequests().length - requestsBefore).toBe(1);
    expect(bannerRequests().length - bannersBefore).toBe(1);
    expect(npc.imagePending).toBe(true);
    expect(npc.image).toBeNull();

    const record = await recordOf(npc.id);
    expect(record?.state).toBe("ready");
    expect(record?.failure).toBeNull();
    expect(record?.model).toBe(MODEL);
    expect(record?.account_id).toBe(jo.actor.accountId);
    expect(record?.campaign_id).toBe(table);
    expect(record?.input_tokens).toBe(57);
    expect(record?.original_type).toBe("image/png");
    expect(record?.storage_prefix).toBe(`npc-images/${jo.actor.accountId}/${npc.id}/${record!.id}`);
    for (const file of FILES) {
      expect(await stored(`${record!.storage_prefix}/${file}`)).toBe(true);
    }
  });

  it("draws from the public persona only: never the name, the secrets or the instructions", async () => {
    const record = await recordOf(npc.id);
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
  });

  it("draws the banner from the same public persona, framed wide, as its own image", async () => {
    const portrait = (await recordOf(npc.id))!;
    const banner = (await bannerOf(npc.id))!;
    expect(banner.state).toBe("ready");
    expect(banner.campaign_id).toBe(table);
    expect(banner.account_id).toBe(jo.actor.accountId);
    expect(banner.prompt).toBe(portrait.prompt!.replace(HOUSE_PORTRAIT_STYLE, HOUSE_BANNER_STYLE));
    for (const hidden of ["Cazril", "SECRET", "INSTRUCTION", "VOICE", "INTENT"]) {
      expect(banner.prompt).not.toContain(hidden);
    }
    for (const file of BANNER_FILES) {
      expect(await stored(`${banner.storage_prefix}/${file}`)).toBe(true);
    }
    expect(banner.storage_prefix).toBe(`npc-banners/${jo.actor.accountId}/${npc.id}/${banner.id}`);
  });

  it("signs the banner on the creator's reads, and serves 2:1 WebP through it", async () => {
    const found = await as(jo.token, (client) =>
      client.npcs.findById({ params: { campaignId: table, npcId: npc.id } }),
    );
    const listed = await as(jo.token, (client) =>
      client.npcs.list({ params: { campaignId: table }, query: {} }),
    );
    expect(listed.find((entry) => entry.id === npc.id)?.banner).toEqual(found.banner);
    const sharp = (await import("sharp")).default;
    for (const [path, width, height] of [
      [found.banner!.cardUrl, 768, 384],
      [found.banner!.fullUrl, 1536, 768],
    ] as const) {
      expect(path).toMatch(/^\/npc-banners\/[0-9a-f-]+\/(card|full)\?e=\d+&s=/);
      const response = await load(path);
      expect(response.status).toBe(200);
      const metadata = await sharp(response.bytes).metadata();
      expect([metadata.format, metadata.width, metadata.height]).toEqual(["webp", width, height]);
    }
    // The kind is signed: a banner's URL opens nothing on the portrait's route.
    expect(
      (await load(found.banner!.cardUrl.replace("/npc-banners/", "/npc-images/"))).status,
    ).toBe(404);
  });

  it("signs three sizes on the creator's reads, and serves square WebP through them", async () => {
    const found = await as(jo.token, (client) =>
      client.npcs.findById({ params: { campaignId: table, npcId: npc.id } }),
    );
    expect(found.imagePending).toBe(false);
    const listed = await as(jo.token, (client) =>
      client.npcs.list({ params: { campaignId: table }, query: {} }),
    );
    expect(listed.find((entry) => entry.id === npc.id)?.image).toEqual(found.image);

    const sharp = (await import("sharp")).default;
    for (const [path, size] of [
      [found.image!.thumbUrl, 160],
      [found.image!.cardUrl, 640],
      [found.image!.fullUrl, 1024],
    ] as const) {
      expect(path).toMatch(/^\/npc-images\/[0-9a-f-]+\/(thumb|card|full)\?e=\d+&s=/);
      const response = await load(path);
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("image/webp");
      expect(response.headers["cache-control"]).toMatch(/^private, max-age=\d+, immutable$/);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["content-security-policy"]).toBe("default-src 'none'");
      const metadata = await sharp(response.bytes).metadata();
      expect([metadata.format, metadata.width, metadata.height]).toEqual(["webp", size, size]);
    }
  });

  it("refuses a forged, altered, other-size, other-kind or expired URL with the same 404", async () => {
    const { thumbUrl } = (
      await as(jo.token, (client) =>
        client.npcs.findById({ params: { campaignId: table, npcId: npc.id } }),
      )
    ).image!;
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
      signedPath(SECRET, "character", imageId, "thumb", now).replace("/portraits/", "/npc-images/"),
      signedPath(SECRET, "campaign", imageId, "card", now).replace(
        "/campaign-images/",
        "/npc-images/",
      ),
    ];
    for (const path of cases) expect((await load(path)).status, path).toBe(404);

    const before = now;
    now = expiryFor(before) * 1000 + 1;
    try {
      expect((await load(thumbUrl)).status).toBe(404);
    } finally {
      now = before;
    }
  });

  it("is drawn once: an edit draws nothing, and a second start finds the record", async () => {
    const before = npcRequests().length;
    await as(jo.token, (client) =>
      client.npcs.update({
        params: { campaignId: table, npcId: npc.id },
        payload: {
          role: "the ferryman, retired",
          persona: { identity: { summary: "Older.", appearance: "White-haired now." } },
        },
      }),
    );
    const again = await run(
      Effect.flatMap(ImageRecords, (records) =>
        records.start("npc", npc.id, {
          prompt: "again",
          model: MODEL,
          limits: { perAccountPerDay: 100, perDay: 100 },
        }),
      ).pipe(Effect.provideService(CurrentActor, jo.actor)),
    );
    await settled();
    expect(again).toBeUndefined();
    expect(npcRequests().length).toBe(before);
  });

  it("draws no banner on an edit of an NPC drawn before banners existed", async () => {
    // An NPC whose square was drawn before banners: a portrait, no banner record.
    await sql((sql) => sql`delete from npc_banner where npc_id = ${npc.id}`);
    const before = bannerRequests().length;
    const edited = await editNpc(jo, table, npc.id, { role: "the ferryman, once more" });
    await settled();
    expect(edited.imagePending).toBe(false);
    expect(bannerRequests().length).toBe(before);
    expect(await bannerOf(npc.id)).toBeUndefined();
    // Its band falls back to the square.
    expect(edited.image).not.toBeNull();
    expect(edited.banner).toBeNull();
  });

  it("keeps the portrait through archive and restore, on the archived shelf too", async () => {
    const archived = await as(jo.token, (client) =>
      client.npcs.archive({ params: { campaignId: table, npcId: npc.id }, payload: {} }),
    );
    expect(archived.image).not.toBeNull();
    const shelf = await as(jo.token, (client) =>
      client.npcs.list({ params: { campaignId: table }, query: { archived: true } }),
    );
    expect(shelf.find((entry) => entry.id === npc.id)?.image).not.toBeNull();
    const restored = await as(jo.token, (client) =>
      client.npcs.restore({ params: { campaignId: table, npcId: npc.id }, payload: {} }),
    );
    expect(restored.image).not.toBeNull();
    expect((await recordOf(npc.id))?.state).toBe("ready");
  });
});

describe("the Library", () => {
  it("never draws an original, and draws the copy a cast takes of it", async () => {
    const before = npcRequests().length;
    const source = await as(jo.token, (client) =>
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
    await settled();
    expect(npcRequests().length).toBe(before);
    expect(await recordOf(source.id)).toBeUndefined();
    // Not by the handler, and not by a direct start either: an original has no
    // campaign, so there is nobody's table to bill it to.
    await run(
      Effect.flatMap(ImageRecords, (records) =>
        records.start("npc", source.id, {
          prompt: "a lamplighter",
          model: MODEL,
          limits: { perAccountPerDay: 100, perDay: 100 },
        }),
      ).pipe(Effect.provideService(CurrentActor, jo.actor)),
    );
    expect(await recordOf(source.id)).toBeUndefined();

    const copy = await as(jo.token, (client) =>
      client.npcs.copyFromSource({
        params: { campaignId: table, sourceNpcId: source.id },
        payload: {},
      }),
    );
    expect(copy.imagePending).toBe(true);
    await settled();
    expect(npcRequests().length - before).toBe(1);
    expect((await bannerOf(copy.id))?.state).toBe("ready");
    expect(await bannerOf(source.id)).toBeUndefined();
    const record = await recordOf(copy.id);
    expect(record?.state).toBe("ready");
    expect(record?.campaign_id).toBe(table);
    expect(record?.prompt).toContain("a lamplighter");
    expect(record?.prompt).toContain("How they look: A long hooked pole.");
    expect(record?.prompt).not.toContain("SECRET");
    expect(record?.prompt).not.toContain("Wren");
  });

  it("refuses an image row for an NPC outside the campaign it names", async () => {
    const other = await campaignOf(jo, "Elsewhere");
    const npc = await addNpc(jo, table, { name: "Pell" });
    await settled();
    const refused = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`
          insert into npc_image (npc_id, campaign_id, account_id, storage_prefix)
          values (${npc.id}, ${other}, ${jo.actor.accountId}, 'x')
        `,
      ).pipe(Effect.result),
    );
    expect(refused._tag).toBe("Failure");
  });
});

describe("who sees a portrait is who sees the NPC", () => {
  let shown: Npc;
  let hidden: Npc;
  let bystander: Actor;

  beforeAll(async () => {
    await as(jo.token, (client) =>
      client.campaigns.update({ params: { campaignId: table }, payload: { visibility: "shared" } }),
    );
    shown = await addNpc(jo, table, {
      name: "Mara",
      role: "the innkeeper",
      visibility: "shared",
    });
    hidden = await addNpc(jo, table, {
      name: "The Patron",
      role: "a masked figure behind the plot",
      privateMaterial: { secrets: "SECRET-IDENTITY" },
    });
    await settled();
    await run(admittedTo(table, ilse.actor, "Ilse"));
    bystander = await run(aGroupMemberAt(table, "Wren"));
  }, 60_000);

  it("draws a hidden NPC too, for its creator's eyes", async () => {
    expect((await recordOf(hidden.id))?.state).toBe("ready");
    const found = await as(jo.token, (client) =>
      client.npcs.findById({ params: { campaignId: table, npcId: hidden.id } }),
    );
    expect(found.image?.thumbUrl).toMatch(/^\/npc-images\//);
    expect(found.banner?.cardUrl).toMatch(/^\/npc-banners\//);
  });

  it("gives a player the portrait of a shared NPC, and nothing of a hidden one", async () => {
    const hiddenImageId = (await recordOf(hidden.id))!.id;
    const hiddenBannerId = (await bannerOf(hidden.id))!.id;
    const listed = await as(ilse.token, (client) =>
      client.npcs.playerList({ params: { campaignId: table } }),
    );
    expect(listed.map((npc) => npc.id)).toContain(shown.id);
    expect(listed.map((npc) => npc.id)).not.toContain(hidden.id);
    const url = listed.find((npc) => npc.id === shown.id)?.image?.thumbUrl;
    expect(url).toMatch(/^\/npc-images\//);
    expect((await load(url!)).status).toBe(200);
    expect(JSON.stringify(listed)).not.toContain(hiddenImageId);
    const banner = listed.find((npc) => npc.id === shown.id)?.banner?.cardUrl;
    expect(banner).toMatch(/^\/npc-banners\//);
    expect((await load(banner!)).status).toBe(200);
    expect(JSON.stringify(listed)).not.toContain(hiddenBannerId);

    const found = await attempt(ilse.token, (client) =>
      client.npcs.playerFindById({ params: { campaignId: table, npcId: shown.id } }),
    );
    expect(found.ok && found.value.image?.thumbUrl).toMatch(/^\/npc-images\//);
    expect(found.ok && found.value.banner?.cardUrl).toMatch(/^\/npc-banners\//);
    expect(
      await attempt(ilse.token, (client) =>
        client.npcs.playerFindById({ params: { campaignId: table, npcId: hidden.id } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
    expect(
      await attempt(ilse.token, (client) =>
        client.npcs.findById({ params: { campaignId: table, npcId: hidden.id } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
  });

  it("takes the portrait away from players when the NPC goes back to the cast", async () => {
    await as(jo.token, (client) =>
      client.npcs.update({
        params: { campaignId: table, npcId: shown.id },
        payload: { visibility: "dm" },
      }),
    );
    try {
      const listed = await as(ilse.token, (client) =>
        client.npcs.playerList({ params: { campaignId: table } }),
      );
      expect(JSON.stringify(listed)).not.toContain("/npc-images/");
      expect(JSON.stringify(listed)).not.toContain("/npc-banners/");
    } finally {
      await as(jo.token, (client) =>
        client.npcs.update({
          params: { campaignId: table, npcId: shown.id },
          payload: { visibility: "shared" },
        }),
      );
    }
  });

  it("carries the portrait on the player's shared conversation, and never through the NPC agent", async () => {
    // The shared conversation is for players with a seat at tonight's table.
    await run(aCharacterAt(table, ilse.actor, { name: "Ilse's Ranger" }));
    const session = await as(jo.token, (client) =>
      client.sessions.create({
        params: { campaignId: table },
        payload: { number: 1, title: "At the ford", visibility: "shared" },
      }),
    );
    await as(jo.token, (client) =>
      client.campaigns.update({
        params: { campaignId: table },
        payload: { currentSessionId: session.id },
      }),
    );
    await as(jo.token, (client) =>
      client.npcs.openSession({
        params: { campaignId: table, npcId: shown.id, sessionId: session.id },
        payload: {},
      }),
    );
    const theirs = await as(ilse.token, (client) =>
      client.npcs.sessionList({ params: { campaignId: table, sessionId: session.id } }),
    );
    expect(theirs.find((npc) => npc.id === shown.id)?.image?.thumbUrl).toMatch(/^\/npc-images\//);
    // The runner's monitor is read through the NPC agent, whose repositories
    // are the bare copies a model's context is built from: it holds no bearer
    // URL, and the runner draws no NPC plate.
    const monitor = await as(jo.token, (client) =>
      client.npcs.sessionMonitor({ params: { campaignId: table, sessionId: session.id } }),
    );
    expect(monitor.map((row) => row.npc.id)).toContain(shown.id);
    expect(JSON.stringify(monitor)).not.toContain("/npc-images/");
    expect(JSON.stringify(monitor)).not.toContain("/npc-banners/");
  });

  it("gives a Shared World member who does not play, and a stranger, nothing", async () => {
    // A stranger's player list of a table they do not sit at is empty.
    const listed = await attempt(stranger.token, (client) =>
      client.npcs.playerList({ params: { campaignId: table } }),
    );
    expect(listed.ok ? listed.value : []).toEqual([]);
    expect(
      await attempt(stranger.token, (client) =>
        client.npcs.playerFindById({ params: { campaignId: table, npcId: shown.id } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
    const reads = await run(
      Effect.gen(function* () {
        const npcs = yield* Npcs;
        return {
          listed: yield* Effect.result(npcs.playerList(table)),
          shown: yield* Effect.result(npcs.playerFindById(table, shown.id)),
          hidden: yield* Effect.result(npcs.playerFindById(table, hidden.id)),
        };
      }).pipe(Effect.provideService(CurrentActor, bystander)),
    );
    expect(reads.listed._tag === "Success" ? reads.listed.success : []).toEqual([]);
    expect(reads.shown._tag).toBe("Failure");
    expect(reads.hidden._tag).toBe("Failure");
    expect(JSON.stringify(reads)).not.toContain("/npc-images/");
    expect(JSON.stringify(reads)).not.toContain("/npc-banners/");

    const unsigned = (
      await as(jo.token, (client) =>
        client.npcs.findById({ params: { campaignId: table, npcId: shown.id } }),
      )
    ).image!.thumbUrl.replace(/\?.*$/, "");
    expect((await load(unsigned)).status).toBe(404);
  });

  it("lets only the creator start the draw", async () => {
    await sql((sql) => sql`delete from npc_image where npc_id = ${hidden.id}`);
    const start = (actor: Actor) =>
      run(
        Effect.flatMap(ImageRecords, (records) =>
          records.start("npc", hidden.id, {
            prompt: undefined,
            model: MODEL,
            limits: { perAccountPerDay: 100, perDay: 100 },
          }),
        ).pipe(Effect.provideService(CurrentActor, actor)),
      );
    await start(ilse.actor);
    await start(bystander);
    await start(stranger.actor);
    expect(await recordOf(hidden.id)).toBeUndefined();
    await start(jo.actor);
    expect((await recordOf(hidden.id))?.failure).toBe("skipped");
  });
});

describe("an NPC created blank is drawn by the first edit that gives it a subject", () => {
  let blank: Npc;
  let requestsBefore: number;

  beforeAll(async () => {
    requestsBefore = npcRequests().length;
    blank = await addNpc(jo, table, { name: UNNAMED_NPC });
    await settled();
  }, 60_000);

  it("creates it under the placeholder name, with no record and no request", async () => {
    expect(blank.name).toBe(UNNAMED_NPC);
    expect(blank.role).toBe("");
    expect(blank.imagePending).toBe(false);
    expect(blank.image).toBeNull();
    expect(await recordOf(blank.id)).toBeUndefined();
    expect(npcRequests().length).toBe(requestsBefore);
  });

  it("draws nothing for an edit that gives it no subject: a real name, a voice, a secret", async () => {
    const edited = await editNpc(jo, table, blank.id, {
      name: "Joss",
      persona: { voice: { manner: "VOICE-NOT-VISUAL" }, intent: { wants: "INTENT-NOT-VISUAL" } },
      privateMaterial: { secrets: "SECRET-JOSS-OWES-THE-HAG" },
    });
    await settled();
    expect(edited.name).toBe("Joss");
    expect(edited.imagePending).toBe(false);
    expect(await recordOf(blank.id)).toBeUndefined();
    expect(npcRequests().length).toBe(requestsBefore);
  });

  it("refuses a player's and a stranger's edit with the same 404, and neither starts a draw", async () => {
    for (const who of [ilse, stranger]) {
      expect(
        await attempt(who.token, (client) =>
          client.npcs.update({
            params: { campaignId: table, npcId: blank.id },
            payload: { role: "a smuggler", persona: { identity: { appearance: "Scarred." } } },
          }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
    }
    await settled();
    expect(await recordOf(blank.id)).toBeUndefined();
    expect(npcRequests().length).toBe(requestsBefore);
    const found = await as(jo.token, (client) =>
      client.npcs.findById({ params: { campaignId: table, npcId: blank.id } }),
    );
    expect(found.role).toBe("");
  });

  it("starts its one draw on the edit that first sets a role, from the public persona only", async () => {
    const edited = await editNpc(jo, table, blank.id, {
      role: "the ferryman's daughter",
      expectedVersion: (
        await as(jo.token, (client) =>
          client.npcs.findById({ params: { campaignId: table, npcId: blank.id } }),
        )
      ).version,
    });
    expect(edited.imagePending).toBe(true);
    await settled();
    expect(npcRequests().length - requestsBefore).toBe(1);
    expect((await bannerOf(blank.id))?.state).toBe("ready");
    const record = await recordOf(blank.id);
    expect(record?.state).toBe("ready");
    expect(record?.account_id).toBe(jo.actor.accountId);
    expect(record?.campaign_id).toBe(table);
    expect(record?.prompt).toContain("the ferryman's daughter");
    for (const hidden of ["Joss", UNNAMED_NPC, "SECRET", "VOICE", "INTENT"]) {
      expect(record?.prompt).not.toContain(hidden);
    }
    const found = await as(jo.token, (client) =>
      client.npcs.findById({ params: { campaignId: table, npcId: blank.id } }),
    );
    expect(found.imagePending).toBe(false);
    expect(found.image?.thumbUrl).toMatch(/^\/npc-images\//);
    expect(found.banner?.cardUrl).toMatch(/^\/npc-banners\//);
  });

  it("draws nothing on any later edit, even one that changes what it would be drawn from", async () => {
    const before = npcRequests().length;
    const bannersBefore = bannerRequests().length;
    const record = await recordOf(blank.id);
    for (const payload of [
      { role: "the ferryman's heir" },
      { persona: { identity: { appearance: "Tall, with her father's lantern." } } },
      { name: "Joss Ferrier" },
    ] satisfies ReadonlyArray<NpcUpdate>) {
      const edited = await editNpc(jo, table, blank.id, payload);
      expect(edited.imagePending).toBe(false);
    }
    await settled();
    expect(npcRequests().length).toBe(before);
    expect(bannerRequests().length).toBe(bannersBefore);
    const after = await recordOf(blank.id);
    expect(after?.id).toBe(record?.id);
    expect(after?.prompt).toContain("the ferryman's daughter");
  });
});

describe("when there is no portrait", () => {
  let theirs: CampaignId;

  beforeAll(async () => {
    theirs = await campaignOf(stranger, "Bo's Table");
  }, 60_000);

  it("records nothing for an NPC that is only a name, so a later edit can still draw it", async () => {
    const before = npcRequests().length;
    const spent = await spentBy(stranger);
    const npc = await addNpc(stranger, theirs, {
      name: "Nobody",
      persona: { voice: { manner: "Quiet." } },
      privateMaterial: { secrets: "SECRET-ONLY" },
    });
    await settled();
    expect(npc.imagePending).toBe(false);
    expect(npc.image).toBeNull();
    expect(npcRequests().length).toBe(before);
    expect(await recordOf(npc.id)).toBeUndefined();
    expect(await bannerOf(npc.id)).toBeUndefined();
    expect(await spentBy(stranger)).toBe(spent);
  });

  it("records a moderation refusal and puts no provider text anywhere", async () => {
    images.next({ kind: "refused" });
    const npc = await addNpc(stranger, theirs, { name: "Red", role: "a butcher" });
    await settled();
    const record = await recordOf(npc.id);
    expect(record?.failure).toBe("refused");
    const read = await as(stranger.token, (client) =>
      client.npcs.findById({ params: { campaignId: theirs, npcId: npc.id } }),
    );
    expect(read.image).toBeNull();
    expect(read.imagePending).toBe(false);
    expect(JSON.stringify(read)).not.toContain("secret-provider-words");
    expect(JSON.stringify(record)).not.toContain(MODERATION_TEXT);
  });

  it("records a provider failure as provider", async () => {
    images.next({ kind: "error", status: 500 });
    const npc = await addNpc(stranger, theirs, { name: "Low", role: "a tide-watcher" });
    await settled();
    expect((await recordOf(npc.id))?.failure).toBe("provider");
  });

  it("records a draw that outlives the job timeout as timeout, and queues its files", async () => {
    const hanging = scriptedImages({ apiUrl: OPENAI, model: MODEL });
    hanging.next({ kind: "hang" });
    const npc = await addNpc(stranger, theirs, { name: "Slow", role: "a patient heron-keeper" });
    await settled();
    // The shared worker drew both; forget that, so the slow worker can start them.
    await sql((sql) => sql`delete from npc_image where npc_id = ${npc.id}`);
    await sql((sql) => sql`delete from npc_banner where npc_id = ${npc.id}`);

    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const built = yield* Layer.build(
            HobImages.layer({
              generation: Option.some({
                limits: { perAccountPerDay: 100, perDay: 100 },
                concurrency: 1,
                timeout: "200 millis",
              }),
              storageOn: false,
            }).pipe(Layer.provide([ImageRecords.layer, ObjectStorage.memory, urls, hanging.layer])),
          );
          const worker = Context.get(built, HobImages);
          const answered = yield* worker.drawNpc(npc);
          expect(answered.imagePending).toBe(true);
          yield* worker.idle;
        }),
      ).pipe(Effect.provideService(CurrentActor, stranger.actor)),
    );

    // The portrait and its banner, each under its own timeout.
    expect(hanging.requests().map((request) => request.size)).toEqual(["1024x1024", "1536x1024"]);
    const record = await recordOf(npc.id);
    expect(record?.failure).toBe("timeout");
    expect((await bannerOf(npc.id))?.failure).toBe("timeout");
    const queued = await sql(
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion where prefix = ${record!.storage_prefix}
      `,
    );
    expect(queued[0]?.count).toBe(1);
  });

  it("spends the one daily budget portraits, banners and covers spend", async () => {
    // A fresh account: its cover and its NPCs' portraits and banners count
    // against one per-account limit. The cover and seven NPCs leave one draw.
    const bram = await person("Bram");
    const own = await campaignOf(bram, "Bram's Table");
    for (let index = 0; index < PER_ACCOUNT / 2 - 1; index += 1) {
      await addNpc(bram, own, { name: `Bram's ${String(index)}`, role: "a regular" });
    }
    await settled();
    expect(await spentBy(bram)).toBe(PER_ACCOUNT - 1);

    // The last draw of the day goes to the portrait, and the banner is capped.
    const before = npcRequests().length;
    const bannersBefore = bannerRequests().length;
    const last = await addNpc(bram, own, { name: "Last Orders", role: "the barkeep" });
    await settled();
    expect(last.imagePending).toBe(true);
    expect(npcRequests().length - before).toBe(1);
    expect(bannerRequests().length).toBe(bannersBefore);
    expect((await recordOf(last.id))?.state).toBe("ready");
    const banner = await bannerOf(last.id);
    expect(banner?.failure).toBe("capped");
    expect(banner?.prompt).toContain("the barkeep");
    const read = await as(bram.token, (client) =>
      client.npcs.findById({ params: { campaignId: own, npcId: last.id } }),
    );
    expect(read.image).not.toBeNull();
    expect(read.banner).toBeNull();
    expect(read.imagePending).toBe(false);
    expect(await spentBy(bram)).toBe(PER_ACCOUNT);

    // Past the cap the portrait is capped, and a capped portrait starts no banner.
    const over = await addNpc(bram, own, { name: "One Too Many", role: "a latecomer" });
    await settled();
    expect(over.imagePending).toBe(false);
    expect(npcRequests().length - before).toBe(1);
    const record = await recordOf(over.id);
    expect(record?.failure).toBe("capped");
    expect(record?.prompt).toContain("a latecomer");
    expect(await bannerOf(over.id)).toBeUndefined();
    expect(await spentBy(bram)).toBe(PER_ACCOUNT);
  });

  it("spends nothing on a blank NPC, and caps the edit that gives it a subject over the limit, once", async () => {
    const cass = await person("Cass");
    const own = await campaignOf(cass, "Cass's Table");
    const blank = await addNpc(cass, own, { name: UNNAMED_NPC });
    await settled();
    // The cover spent one; the blank NPC nothing.
    expect(await spentBy(cass)).toBe(1);
    // Seven NPCs drawn whole, and an eighth whose portrait is the day's last draw.
    for (let index = 0; index < PER_ACCOUNT / 2; index += 1) {
      await addNpc(cass, own, { name: `Cass's ${String(index)}`, role: "a regular" });
    }
    await settled();
    expect(await spentBy(cass)).toBe(PER_ACCOUNT);

    const before = npcRequests().length;
    const edited = await editNpc(cass, own, blank.id, { role: "a card sharp" });
    await settled();
    expect(edited.imagePending).toBe(false);
    expect(npcRequests().length).toBe(before);
    const record = await recordOf(blank.id);
    expect(record?.failure).toBe("capped");
    expect(record?.prompt).toContain("a card sharp");
    expect(await bannerOf(blank.id)).toBeUndefined();
    expect(await spentBy(cass)).toBe(PER_ACCOUNT);

    // A capped NPC is not tried again by its next edit: one record, ever.
    await editNpc(cass, own, blank.id, { role: "a card sharp, retired" });
    await settled();
    expect(npcRequests().length).toBe(before);
    expect((await recordOf(blank.id))?.id).toBe(record?.id);
    expect(await spentBy(cass)).toBe(PER_ACCOUNT);
  });
});

describe("deleting an NPC", () => {
  let theirs: CampaignId;

  beforeAll(async () => {
    theirs = await campaignOf(ilse, "Ilse's Table");
  }, 60_000);

  it("queues its portrait's files through the outbox, and the drain removes them", async () => {
    // The product archives a campaign NPC rather than deleting it, so the row
    // goes the way a campaign delete's cascade, or a future delete, would take it.
    const npc = await addNpc(ilse, theirs, { name: "Brief", role: "a candle-seller" });
    await settled();
    const record = (await recordOf(npc.id))!;
    const banner = (await bannerOf(npc.id))!;
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(true);
    for (const file of BANNER_FILES) {
      expect(await stored(`${banner.storage_prefix}/${file}`)).toBe(true);
    }

    await sql((sql) => sql`delete from npc where id = ${npc.id}`);
    expect(await recordOf(npc.id)).toBeUndefined();
    expect(await bannerOf(npc.id)).toBeUndefined();
    await run(Effect.flatMap(HobImages, (worker) => worker.drainDeletions));
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(false);
    for (const file of BANNER_FILES) {
      expect(await stored(`${banner.storage_prefix}/${file}`)).toBe(false);
    }
    const queued = await sql(
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion where prefix = ${record.storage_prefix}
      `,
    );
    expect(queued[0]?.count).toBe(0);
  });

  it("takes the portrait with its campaign when the campaign is deleted", async () => {
    const doomed = await campaignOf(ilse, "Doomed Table");
    const npc = await addNpc(ilse, doomed, { name: "Last", role: "the last guest" });
    await settled();
    const record = (await recordOf(npc.id))!;
    await as(ilse.token, (client) =>
      client.campaigns.deletePermanently({ params: { campaignId: doomed } }),
    );
    expect(await recordOf(npc.id)).toBeUndefined();
    await run(Effect.flatMap(HobImages, (worker) => worker.drainDeletions));
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(false);
  });

  it("leaves no files behind when the NPC is deleted mid-draw", async () => {
    const release = await run(Deferred.make<void>());
    images.next({ kind: "held", release });
    const npc = await addNpc(ilse, theirs, { name: "Gone", role: "a night traveller" });
    const record = (await recordOf(npc.id))!;
    expect(record.state).toBe("generating");

    await sql((sql) => sql`delete from npc where id = ${npc.id}`);
    await run(Deferred.succeed(release, undefined));
    await settled();
    await run(Effect.flatMap(HobImages, (worker) => worker.drainDeletions));
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(false);
  });

  it("marks a portrait a dead process left behind interrupted, beside the other kinds", async () => {
    const npc = await addNpc(ilse, theirs, { name: "Stale", role: "a lantern-keeper" });
    await settled();
    await sql(
      (sql) => sql`
        update npc_image set
          state = 'generating', failure = null, finished_at = null,
          created_at = now() - interval '10 minutes'
        where npc_id = ${npc.id}
      `,
    );
    const swept = await run(Effect.flatMap(HobImages, (worker) => worker.sweep));
    expect(swept).toBe(1);
    expect((await recordOf(npc.id))?.failure).toBe("interrupted");
  });
});
