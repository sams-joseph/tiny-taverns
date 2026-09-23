import { NodeHttpServer } from "@effect/platform-node";
import { type CampaignId, TavernsApi } from "@taverns/api";
import { ConfigProvider, Context, Effect, Layer, ManagedRuntime, Option } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, hobImagesFromConfig, servicesOver } from "../src/app.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls } from "../src/images/ImageUrls.js";
import { ImageRecords } from "../src/repo/Images.js";
import { ObjectStorage } from "../src/storage/ObjectStorage.js";
import { campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **Portraits are opt-in, and OFF is the configuration CI runs.**
 *
 * The default `servicesOver`, with no `PORTRAIT_*` variable set: a character
 * made through the real create endpoint is not drawn, records nothing, and
 * keeps its lettered plate. Then the four-part ON condition, read the way the
 * server reads it at boot, and the boot sweep a restarted server runs.
 */
const database = migratedDatabase("taverns_test_portraits_off");
const services = servicesOver(database);

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

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie));

let token: string;
let campaignId: CampaignId;

beforeAll(async () => {
  token = await runtime.runPromise(
    Effect.flatMap(Accounts, (accounts) => accounts.issue("Jo")).pipe(
      Effect.map((issued) => issued.token),
      Effect.orDie,
    ),
  );
  campaignId = (
    await runtime.runPromise(
      Effect.flatMap(clientFor(token), (client) =>
        campaignVia(client, { name: "The Salt Road" }),
      ).pipe(Effect.orDie),
    )
  ).id;
}, 60_000);

const create = (name: string) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(token), (client) =>
      client.me.createCharacter({
        params: { campaignId },
        payload: { name, race: "Dwarf", className: "Fighter" },
      }),
    ).pipe(Effect.orDie),
  );

describe("with no portrait configuration", () => {
  it("draws nothing, records nothing, and every plate stays lettered", async () => {
    const character = await create("Marta Vell");
    expect(character.portrait).toBeNull();
    expect(character.portraitPending).toBe(false);
    const rows = await sql(
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from character_portrait
      `,
    );
    expect(rows[0]?.count).toBe(0);
  });

  it("founds a Shared World with no cover and no record", async () => {
    const world = await runtime.runPromise(
      Effect.flatMap(clientFor(token), (client) =>
        client.sharedWorlds.create({ payload: { name: "The Salt Company" } }),
      ).pipe(Effect.orDie),
    );
    expect(world.image).toBeNull();
    expect(world.imagePending).toBe(false);
    const rows = await sql(
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from shared_world_image
      `,
    );
    expect(rows[0]?.count).toBe(0);
  });

  it("answers the image route with the same 404 as a bad signature", async () => {
    const response = await runtime.runPromise(
      HttpClient.get(
        `/portraits/${crypto.randomUUID()}/thumb?e=${String(Math.floor(Date.now() / 1000) + 600)}&s=abc`,
      ).pipe(Effect.orDie),
    );
    expect(response.status).toBe(404);
  });
});

/** Whether the boot-time layer would draw, under exactly these variables. */
const generatingUnder = (env: Record<string, string>) =>
  runtime.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const built = yield* Layer.build(
          Layer.fresh(hobImagesFromConfig).pipe(
            Layer.provide([ImageRecords.layer, ObjectStorage.memory, ImageUrls.off]),
          ),
        );
        return Context.get(built, HobImages).generating;
      }),
    ).pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })),
      Effect.orDie,
    ),
  );

describe("what turns portraits on", () => {
  const all = {
    PORTRAIT_API_URL: "https://api.openai.com/v1",
    PORTRAIT_MODEL: "gpt-image-2.5-flare",
    PORTRAIT_URL_SECRET: "a-secret",
    STORAGE_DRIVER: "filesystem",
  };

  it("needs the endpoint, the model, the URL secret and storage, all four", async () => {
    expect(await generatingUnder(all)).toBe(true);
    for (const missing of Object.keys(all)) {
      const env = Object.fromEntries(Object.entries(all).filter(([key]) => key !== missing));
      expect(await generatingUnder(env), `${missing} unset`).toBe(false);
    }
  });
});

describe("a server that restarts mid-draw", () => {
  it("marks the dead process's draw interrupted as it boots", async () => {
    const character = await create("Left Behind");
    const accountId = await sql(
      (sql) => sql<{ readonly account_id: string }>`
        select account_id from character where id = ${character.id}
      `,
    ).then((rows) => rows[0]!.account_id);
    // The row a process that died mid-draw ten minutes ago left behind.
    await sql(
      (sql) => sql`
        insert into character_portrait ${sql.insert({
          character_id: character.id,
          account_id: accountId,
          prompt: "a dwarf",
          model: "m",
          storage_prefix: `portraits/${accountId}/${character.id}/stale`,
          created_at: new Date(Date.now() - 10 * 60 * 1000),
        })}
      `,
    );

    const state = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* Layer.build(
            HobImages.layer({ generation: Option.none(), storageOn: true }).pipe(
              Layer.provide([ImageRecords.layer, ObjectStorage.memory, ImageUrls.off]),
            ),
          );
          const sql = yield* SqlClient.SqlClient;
          // The boot sweep runs on the service's own fiber; wait for it, up to
          // ten seconds so a loaded runner is not a failure.
          for (let attempt = 0; attempt < 500; attempt += 1) {
            const rows = yield* sql<{ readonly state: string; readonly failure: string | null }>`
              select state, failure from character_portrait where character_id = ${character.id}
            `;
            if (rows[0]?.state !== "generating") return rows[0];
            yield* Effect.sleep("20 millis");
          }
          return undefined;
        }),
      ).pipe(Effect.orDie),
    );
    expect(state).toEqual({ state: "failed", failure: "interrupted" });
  });
});
