import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  type Character,
  type CharacterId,
  CurrentActor,
  type HobEvent,
  TavernsApi,
} from "@taverns/api";
import { Context, Deferred, Effect, Layer, ManagedRuntime, Option, Redacted, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
const PER_ACCOUNT = 4;

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

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie));

/** Wait for every drawing job to finish. */
const settled = () => runtime.runPromise(Effect.flatMap(HobImages, (portraits) => portraits.idle));

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
  ).then((rows) => rows[0]);

const stored = (key: string) =>
  run(Effect.flatMap(ObjectStorage, (objects) => objects.head(StorageKey(key)))).then(
    Option.isSome,
  );

const mine = (token: string, id: CharacterId): Promise<Character | undefined> =>
  as(token, (client) => client.me.characters()).then(
    (owned) => owned.find((entry) => entry.character.id === id)?.character,
  );

let dm: Person;
let ilse: Person;
let wren: Person;
let stranger: Person;
let campaignId: CampaignId;

beforeAll(async () => {
  await run(importSystemEquipment());
  await run(importSystemOptions());
  dm = await person("Jo");
  ilse = await person("Ilse");
  wren = await person("Wren");
  stranger = await person("Bo");
  campaignId = (
    await as(dm.token, (client) =>
      campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
    )
  ).id;
  // The campaign's own cover draws too; let it finish before any test counts
  // requests to the image endpoint.
  await settled();
  await run(admittedTo(campaignId, ilse.actor, "Ilse"));
  await run(admittedTo(campaignId, wren.actor, "Wren"));
}, 120_000);

const createAs = (
  who: Person,
  payload: Parameters<Client["me"]["createCharacter"]>[0]["payload"],
) => as(who.token, (client) => client.me.createCharacter({ params: { campaignId }, payload }));

describe("the form's create draws one portrait", () => {
  let character: Character;

  beforeAll(async () => {
    const before = images.requests().length;
    character = await createAs(ilse, {
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
    await settled();
    expect(images.requests().length - before).toBe(1);
  }, 60_000);

  it("answers the create with the drawing state, and the draw finishes ready", async () => {
    expect(character.portraitPending).toBe(true);
    expect(character.portrait).toBeNull();

    const record = await recordOf(character.id);
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
      expect(await stored(`${record!.storage_prefix}/${file}`)).toBe(true);
    }
    expect(record?.storage_prefix).toBe(
      `portraits/${ilse.actor.accountId}/${character.id}/${record!.id}`,
    );
  });

  it("sends OpenAI's dialect to api.openai.com, and exactly the prompt it recorded", async () => {
    const record = await recordOf(character.id);
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
  });

  it("sends a local endpoint only the fields sd-server documents", () => {
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
  });

  it("puts signed URLs on the owner's read, and serves WebP through them", async () => {
    const read = await mine(ilse.token, character.id);
    expect(read?.portraitPending).toBe(false);
    const portrait = read?.portrait;
    expect(portrait).not.toBeNull();
    for (const [path, size] of [
      [portrait!.thumbUrl, 160],
      [portrait!.cardUrl, 640],
      [portrait!.fullUrl, 1024],
    ] as const) {
      const response = await load(path);
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("image/webp");
      expect(response.headers["cache-control"]).toMatch(/^private, max-age=\d+, immutable$/);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["content-security-policy"]).toBe("default-src 'none'");
      // RIFF....WEBP
      expect(new TextDecoder().decode(response.bytes.slice(8, 12))).toBe("WEBP");
      const sharp = (await import("sharp")).default;
      expect((await sharp(response.bytes).metadata()).width).toBe(size);
    }
  });

  it("refuses a forged, altered, other-size or expired URL with the same 404", async () => {
    const { thumbUrl, cardUrl } = (await mine(ilse.token, character.id))!.portrait!;
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
    for (const path of cases) expect((await load(path)).status).toBe(404);

    const before = now;
    now = expiryFor(before) * 1000 + 1;
    try {
      expect((await load(thumbUrl)).status).toBe(404);
    } finally {
      now = before;
    }
  });

  it("is drawn once: nothing is drawn again when the character changes", async () => {
    const before = images.requests().length;
    await as(ilse.token, (client) =>
      client.me.updateCharacter({ params: { characterId: character.id }, payload: { level: 2 } }),
    );
    const record = await run(
      Effect.flatMap(ImageRecords, (records) =>
        records.start("character", character.id, {
          prompt: "again",
          model: MODEL,
          limits: { perAccountPerDay: 100, perDay: 100 },
        }),
      ).pipe(Effect.provideService(CurrentActor, ilse.actor)),
    );
    await settled();
    expect(record).toBeUndefined();
    expect(images.requests().length).toBe(before);
    // The update's own response carries the portrait too.
    expect((await mine(ilse.token, character.id))?.portrait).not.toBeNull();
  });

  it("gives the URLs to exactly the readers of the character", async () => {
    const joined = await as(ilse.token, (client) =>
      client.party.join({ params: { campaignId }, payload: { characterId: character.id } }),
    );
    const seat = joined.seat.id;
    const partyAs = (who: Person) =>
      run(
        Effect.flatMap(Party, (party) => party.list(campaignId)).pipe(
          Effect.provideService(CurrentActor, who.actor),
          Effect.result,
        ),
      );
    const characterIn = async (who: Person) => {
      const result = await partyAs(who);
      if (result._tag === "Failure") return "refused" as const;
      return result.success.find((entry) => entry.seat.id === seat)?.character ?? undefined;
    };

    // The seat starts `dm`: its owner and the creator read the character, and
    // both get the picture; a seat-mate reads no character and gets no URL.
    const thumbOf = async (who: Person) => {
      const read = await characterIn(who);
      return read === "refused" ? undefined : read?.portrait?.thumbUrl;
    };
    expect(await thumbOf(ilse)).toMatch(/^\/portraits\//);
    expect(await thumbOf(dm)).toMatch(/^\/portraits\//);
    expect(await characterIn(wren)).toBeUndefined();

    // Shared, the seat-mate reads the character, so the seat-mate sees it too.
    await as(dm.token, (client) =>
      client.party.update({
        params: { campaignId, campaignCharacterId: seat },
        payload: { visibility: "shared" },
      }),
    );
    const seen = await thumbOf(wren);
    expect(seen).toMatch(/^\/portraits\//);
    expect((await load(seen!)).status).toBe(200);

    // Somebody at no table of hers reads neither the character nor a URL.
    expect(await characterIn(stranger)).toBe("refused");
    expect(await mine(stranger.token, character.id)).toBeUndefined();
    const owned = await as(stranger.token, (client) => client.me.characters());
    expect(JSON.stringify(owned)).not.toContain("/portraits/");
  });

  it("deletes the files with the character", async () => {
    const record = (await recordOf(character.id))!;
    await as(ilse.token, (client) =>
      client.me.deleteCharacter({ params: { characterId: character.id } }),
    );
    await run(Effect.flatMap(HobImages, (portraits) => portraits.drainDeletions));
    expect(await recordOf(character.id)).toBeUndefined();
    for (const file of ["original.png", "full.webp", "card.webp", "thumb.webp"]) {
      expect(await stored(`${record.storage_prefix}/${file}`)).toBe(false);
    }
    const queued = await sql(
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion where prefix = ${record.storage_prefix}
      `,
    );
    expect(queued[0]?.count).toBe(0);
  });
});

describe("the plates beyond the character's own read", () => {
  it("carry the portrait on the runner, the recap and the player table, over the real wiring", async () => {
    const character = await createAs(ilse, {
      name: "Oda Flint",
      race: "Gnome",
      className: "Wizard",
      sheet: { notes: "", abilities: [], traits: [], story: { appearance: "Ink to the elbows." } },
    });
    await settled();
    await as(ilse.token, (client) =>
      client.party.join({ params: { campaignId }, payload: { characterId: character.id } }),
    );
    const expected = (await mine(ilse.token, character.id))?.portrait;
    expect(expected).not.toBeNull();

    const session = await as(dm.token, (client) =>
      client.sessions.create({
        params: { campaignId },
        payload: { number: 1, title: "The ford", visibility: "shared" },
      }),
    );
    await as(dm.token, (client) =>
      client.campaigns.update({
        params: { campaignId },
        payload: { currentSessionId: session.id },
      }),
    );
    const encounter = await as(dm.token, (client) =>
      client.encounters.create({ params: { campaignId }, payload: { name: "Reeds" } }),
    );
    const fight = await as(dm.token, (client) =>
      client.runs.start({
        params: { campaignId, sessionId: session.id },
        payload: { encounterId: encounter.id, visibility: "shared" },
      }),
    );
    const params = { campaignId, sessionId: session.id, runId: fight.id };
    const rows = await as(dm.token, (client) => client.combatants.list({ params }));
    const row = rows.find((entry) => entry.characterId === character.id)!;
    expect(row.portrait).toEqual(expected);

    const recap = await as(dm.token, (client) =>
      client.recap.read({ params: { campaignId, sessionId: session.id } }),
    );
    const recapped = recap.fights.flatMap((entry) => entry.combatants);
    expect(recapped.find((entry) => entry.characterId === character.id)?.portrait).toEqual(
      expected,
    );

    await as(dm.token, (client) =>
      client.combatants.update({
        params: { ...params, combatantId: row.id },
        payload: { visibility: "shared" },
      }),
    );
    const table = await as(ilse.token, (client) => client.table.read({ params: { campaignId } }));
    const you = table?.fight?.order.find((entry) => entry.kind === "you");
    expect(you?.kind === "you" && you.portrait).toEqual(expected);
  });
});

const events = (actor: Actor) =>
  run(
    Effect.gen(function* () {
      const hob = yield* Hob;
      const stream = yield* hob.ask(campaignId, {
        text: "A wood elf herbalist.",
        intent: "character",
      });
      return Array.from(yield* Stream.runCollect(stream)) as ReadonlyArray<HobEvent>;
    }).pipe(Effect.provideService(CurrentActor, actor)),
  );

describe("Hob's kept draft draws one portrait", () => {
  it("starts the draw from the accept, and it ends ready", async () => {
    const asked = await events(wren.actor);
    const began = asked.find((event) => event.event === "began");
    if (began?.event !== "began") throw new Error("no began event");
    expect(asked.some((event) => event.event === "proposal")).toBe(true);

    const before = images.requests().length;
    const accepted = await as(wren.token, (client) =>
      client.hob.accept({
        params: { campaignId, threadId: began.data.threadId, turnId: began.data.turnId },
        payload: {},
      }),
    );
    if (accepted.accepted !== "character") throw new Error("accepted something else");
    expect(accepted.character.portraitPending).toBe(true);
    await settled();

    expect(images.requests().length - before).toBe(1);
    const record = await recordOf(accepted.character.id);
    expect(record?.state).toBe("ready");
    expect(record?.prompt).toContain("Elf Druid");
    expect(record?.prompt).toContain("Thirties, wiry, mud to the knees.");
    expect((await mine(wren.token, accepted.character.id))?.portrait).not.toBeNull();
  });
});

describe("when there is no portrait", () => {
  it("skips a character with nothing to draw from, and says so on the record", async () => {
    const before = images.requests().length;
    const character = await createAs(wren, { name: "Nobody In Particular" });
    await settled();
    expect(character.portraitPending).toBe(false);
    expect(images.requests().length).toBe(before);
    const record = await recordOf(character.id);
    expect(record?.state).toBe("failed");
    expect(record?.failure).toBe("skipped");
    expect(record?.prompt).toBeNull();
    expect((await mine(wren.token, character.id))?.portrait).toBeNull();
  });

  it("records a moderation refusal and puts no provider text anywhere", async () => {
    images.next({ kind: "refused" });
    const character = await createAs(wren, { name: "Grim", race: "Orc", className: "Barbarian" });
    await settled();
    const record = await recordOf(character.id);
    expect(record?.state).toBe("failed");
    expect(record?.failure).toBe("refused");
    const read = await mine(wren.token, character.id);
    expect(read?.portrait).toBeNull();
    expect(read?.portraitPending).toBe(false);
    expect(JSON.stringify(read)).not.toContain("secret-provider-words");
    expect(JSON.stringify(record)).not.toContain(MODERATION_TEXT);
  });

  it("records a provider failure as provider", async () => {
    images.next({ kind: "error", status: 500 });
    const character = await createAs(wren, { name: "Tam", race: "Human", className: "Rogue" });
    await settled();
    expect((await recordOf(character.id))?.failure).toBe("provider");
  });

  it("records a draw that outlives the job timeout as timeout", async () => {
    // A worker of its own, with a timeout a test can wait for, over an endpoint
    // that never answers — so the outcome cannot depend on how fast the
    // machine is. The shared worker keeps the production timeout.
    const hanging = scriptedImages({ apiUrl: OPENAI, model: MODEL });
    hanging.next({ kind: "hang" });
    const created = await sql(
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
    const character = (await run(
      Effect.flatMap(Characters, (characters) => characters.mine).pipe(
        Effect.provideService(CurrentActor, wren.actor),
      ),
    ).then((owned) => owned.find((entry) => entry.character.id === id)?.character))!;

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
          const answered = yield* worker.drawCharacter(character);
          expect(answered.portraitPending).toBe(true);
          yield* worker.idle;
        }),
      ).pipe(Effect.provideService(CurrentActor, wren.actor)),
    );

    expect(hanging.requests()).toHaveLength(1);
    const record = await recordOf(id);
    expect(record?.state).toBe("failed");
    expect(record?.failure).toBe("timeout");
    // Whatever might have been put is queued for deletion with the failure.
    const queued = await sql(
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion where prefix = ${record!.storage_prefix}
      `,
    );
    expect(queued[0]?.count).toBe(1);
  });

  it("stops drawing for an account at its daily cap, and records why", async () => {
    // A fresh account, so the count is this test's alone.
    const bram = await person("Bram");
    await run(admittedTo(campaignId, bram.actor, "Bram"));
    const drawn: Array<Character> = [];
    for (let index = 0; index < PER_ACCOUNT; index += 1) {
      drawn.push(await createAs(bram, { name: `Bram ${String(index)}`, race: "Halfling" }));
    }
    await settled();
    const before = images.requests().length;
    const over = await createAs(bram, { name: "One too many", race: "Halfling" });
    await settled();
    expect(over.portraitPending).toBe(false);
    expect(images.requests().length).toBe(before);
    const record = await recordOf(over.id);
    expect(record?.failure).toBe("capped");
    expect(record?.prompt).toContain("Halfling");
    expect(drawn.every((character) => character.portraitPending)).toBe(true);
  });

  it("stops drawing for everybody at the overall cap", async () => {
    // A character with no record yet, which only a raw row can be while
    // generation is on: every create through the product starts one.
    const other = await run(
      Effect.gen(function* () {
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
      }).pipe(Effect.provideService(CurrentActor, stranger.actor)),
    );
    expect(other.job).toBeUndefined();
    expect((await recordOf(other.id))?.failure).toBe("capped");
  });
});

describe("crashes and deletes in the middle of a draw", () => {
  // An account of its own: the others have spent their daily portraits.
  let pip: Person;
  beforeAll(async () => {
    pip = await person("Pip");
    await run(admittedTo(campaignId, pip.actor, "Pip"));
  });

  it("leaves no files behind when the character is deleted mid-draw", async () => {
    const release = await run(Deferred.make<void>());
    images.next({ kind: "held", release });
    const character = await createAs(pip, { name: "Brief", race: "Elf", className: "Bard" });
    const record = (await recordOf(character.id))!;
    expect(record.state).toBe("generating");

    await as(pip.token, (client) =>
      client.me.deleteCharacter({ params: { characterId: character.id } }),
    );
    await run(Deferred.succeed(release, undefined));
    await settled();
    await run(Effect.flatMap(HobImages, (portraits) => portraits.drainDeletions));

    for (const file of ["original.png", "full.webp", "card.webp", "thumb.webp"]) {
      expect(await stored(`${record.storage_prefix}/${file}`)).toBe(false);
    }
  });

  it("marks a draw a dead process left behind interrupted, and queues its files", async () => {
    const character = await createAs(pip, { name: "Stale" });
    await settled();
    // A row as a process that died mid-draw ten minutes ago left it.
    const stale = await sql(
      (sql) => sql<{ readonly storage_prefix: string }>`
        update character_portrait set
          state = 'generating', failure = null, finished_at = null, prompt = 'x', model = 'm',
          created_at = now() - interval '10 minutes'
        where character_id = ${character.id}
        returning storage_prefix
      `,
    );
    // A fresh draw is not stale, and is left alone.
    const release = await run(Deferred.make<void>());
    images.next({ kind: "held", release });
    const fresh = await createAs(pip, { name: "Fresh", race: "Elf" });

    const swept = await run(Effect.flatMap(HobImages, (portraits) => portraits.sweep));
    expect(swept).toBe(1);
    const record = await recordOf(character.id);
    expect(record?.state).toBe("failed");
    expect(record?.failure).toBe("interrupted");
    expect((await recordOf(fresh.id))?.state).toBe("generating");
    const queued = await sql(
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion
        where prefix = ${stale[0]!.storage_prefix}
      `,
    );
    expect(queued[0]?.count).toBe(1);

    await run(Deferred.succeed(release, undefined));
    await settled();
    expect((await recordOf(fresh.id))?.state).toBe("ready");
  });
});
