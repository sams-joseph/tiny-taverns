import { NodeHttpServer } from "@effect/platform-node";
import { Actor, type RaceBody, TavernsApi } from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls } from "../src/images/ImageUrls.js";
import { ImageRecords } from "../src/repo/Images.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { ObjectStorage } from "../src/storage/ObjectStorage.js";
import { admittedTo, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedImages } from "./support/imageModel.js";

/**
 * **A character with no campaign at all** — `POST /me/characters` against the
 * core rules (`GET /library/options/core`), for an account that sits at no
 * table and may never.
 *
 * Over the real application, so the portrait trigger is the handler's own; only
 * the image endpoint is scripted.
 */

const images = scriptedImages({ apiUrl: "https://api.openai.com/v1", model: "core-portraits" });
const database = migratedDatabase("taverns_test_core_characters");
const services = servicesOver(
  database,
  undefined,
  undefined,
  undefined,
  ObjectStorage.memory,
  ImageUrls.layer(Redacted.make("core-characters-secret")),
  HobImages.layer({
    generation: Option.some({ limits: { perAccountPerDay: 10, perDay: 100 }, concurrency: 2 }),
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
const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(token), (client) =>
      call(client).pipe(
        Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
      ),
    ).pipe(Effect.orDie),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie));

const settled = () => runtime.runPromise(Effect.flatMap(HobImages, (drawing) => drawing.idle));

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

/** A homebrew race in the fresh account's own Library, with a subrace of its own. */
const MARSHBORN: RaceBody = {
  speed: 30,
  size: "Medium",
  abilityBonuses: [{ ability: "CON", amount: 2 }],
  hpPerLevel: 0,
  traits: [],
  subraces: [{ name: "Reed Marshborn", abilityBonuses: [], traits: [] }],
};

let fresh: Person;
let stranger: Person;

beforeAll(async () => {
  await run(importSystemEquipment());
  await run(importSystemOptions());
  // Signed up and invited nowhere: the account the captain could not make a
  // character with.
  fresh = await person("Ilse");
  stranger = await person("Bo");
  expect(await as(fresh.token, (client) => client.me.campaigns())).toEqual([]);
  await as(fresh.token, (client) =>
    client.library.createOption({
      payload: { kind: "race", name: "Marshborn", body: MARSHBORN },
    }),
  );
}, 120_000);

describe("the core rules", () => {
  it("are the shared bundle and nothing anybody authored", async () => {
    const core = await as(fresh.token, (client) => client.library.coreOptions({ query: {} }));
    const kinds = new Set(core.map((option) => option.kind));
    expect(kinds).toEqual(new Set(["class", "race", "background"]));
    expect(core.map((option) => option.name)).toContain("Fighter");
    expect(core.map((option) => option.name)).toContain("Elf");
    // The account's own Library original is in its Library and not in the core.
    expect(core.map((option) => option.name)).not.toContain("Marshborn");
    const library = await as(fresh.token, (client) => client.library.options({ query: {} }));
    expect(library.map((option) => option.name)).toContain("Marshborn");

    const bundled = await sql(
      (sql) => sql<{ readonly count: string }>`
        select count(*) from character_option
        where campaign_id is null and account_id is null and visibility = 'shared'
      `,
    );
    expect(core).toHaveLength(Number(bundled[0]!.count));
    // The same answer for every account, because nothing in it is anybody's.
    const theirs = await as(stranger.token, (client) => client.library.coreOptions({ query: {} }));
    expect(theirs.map((option) => option.id)).toEqual(core.map((option) => option.id));
  });

  it("narrow by kind", async () => {
    const races = await as(fresh.token, (client) =>
      client.library.coreOptions({ query: { kind: "race" } }),
    );
    expect(races.length).toBeGreaterThan(0);
    expect(races.every((option) => option.kind === "race")).toBe(true);
  });
});

describe("creating a character with no campaign", () => {
  it("writes an ordinary account-owned row with no seat, and draws its portrait once", async () => {
    const before = images.requests().length;
    const character = await as(fresh.token, (client) =>
      client.me.createCoreCharacter({
        payload: {
          name: "Sorrel Ash",
          race: "Elf",
          subrace: "High Elf",
          className: "Wizard",
          level: 1,
          sheet: {
            notes: "",
            abilities: [],
            traits: [],
            story: { appearance: "Thirties, wiry, mud to the knees." },
          },
        },
      }),
    );
    expect(character.name).toBe("Sorrel Ash");
    expect(character.subrace).toBe("High Elf");
    expect(character.portraitPending).toBe(true);
    await settled();
    expect(images.requests().length - before).toBe(1);

    const rows = await sql(
      (sql) => sql<{
        readonly account_id: string;
        readonly origin: string;
        readonly seats: string;
        readonly portraits: string;
      }>`
        select character.account_id, character.origin,
               (select count(*) from campaign_character
                where campaign_character.character_id = character.id) as seats,
               (select count(*) from character_portrait
                where character_portrait.character_id = character.id) as portraits
        from character where character.id = ${character.id}
      `,
    );
    expect(rows).toEqual([
      { account_id: fresh.actor.accountId, origin: "authored", seats: "0", portraits: "1" },
    ]);

    const mine = await as(fresh.token, (client) => client.me.characters());
    const owned = mine.find((entry) => entry.character.id === character.id);
    expect(owned?.seats).toEqual([]);
    expect(owned?.character.portrait).not.toBeNull();

    // Editing it changes nothing about the drawing: drawn once.
    await as(fresh.token, (client) =>
      client.me.updateCharacter({
        params: { characterId: character.id },
        payload: { level: 2 },
      }),
    );
    await settled();
    expect(images.requests().length - before).toBe(1);
  });

  it("validates a subrace against the core rules, not the account's Library", async () => {
    // Elf does not contain Hill Dwarf.
    expect(
      await refusal(fresh.token, (client) =>
        client.me.createCoreCharacter({
          payload: { name: "Wrong Root", race: "Elf", subrace: "Hill Dwarf" },
        }),
      ),
    ).toBe("Conflict");
    // A subrace with no race at all.
    expect(
      await refusal(fresh.token, (client) =>
        client.me.createCoreCharacter({ payload: { name: "No Root", subrace: "High Elf" } }),
      ),
    ).toBe("Conflict");
    // The account's own homebrew race is not core rules, so its subrace does
    // not resolve here — the same answer the pickers give.
    expect(
      await refusal(fresh.token, (client) =>
        client.me.createCoreCharacter({
          payload: { name: "Reedling", race: "Marshborn", subrace: "Reed Marshborn" },
        }),
      ),
    ).toBe("Conflict");
    // A race the core rules do not know is a free label, as it is everywhere.
    const labelled = await as(fresh.token, (client) =>
      client.me.createCoreCharacter({ payload: { name: "Pim", race: "Marshborn" } }),
    );
    expect(labelled.race).toBe("Marshborn");
  });

  it("is invisible and unwritable to every other account", async () => {
    const character = await as(fresh.token, (client) =>
      client.me.createCoreCharacter({ payload: { name: "Kept Close", className: "Rogue" } }),
    );
    const theirs = await as(stranger.token, (client) => client.me.characters());
    expect(theirs.map((entry) => entry.character.id)).not.toContain(character.id);
    expect(
      await refusal(stranger.token, (client) =>
        client.me.updateCharacter({
          params: { characterId: character.id },
          payload: { name: "Taken" },
        }),
      ),
    ).toBe("NotFound");
    expect(
      await refusal(stranger.token, (client) =>
        client.me.deleteCharacter({ params: { characterId: character.id } }),
      ),
    ).toBe("NotFound");
    expect(
      await refusal(stranger.token, (client) =>
        client.me.characterSpells({ params: { characterId: character.id } }),
      ),
    ).toBe("NotFound");
  });

  it("can be added to a campaign later, by the ordinary seat", async () => {
    const character = await as(fresh.token, (client) =>
      client.me.createCoreCharacter({ payload: { name: "Late Arrival", className: "Cleric" } }),
    );
    const dm = await person("Jo");
    const campaign = await as(dm.token, (client) =>
      campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
    );
    await run(admittedTo(campaign.id, fresh.actor, "Ilse"));

    await as(fresh.token, (client) =>
      client.party.join({
        params: { campaignId: campaign.id },
        payload: { characterId: character.id },
      }),
    );

    const mine = await as(fresh.token, (client) => client.me.characters());
    const owned = mine.find((entry) => entry.character.id === character.id);
    expect(owned?.seats.map((seat) => seat.campaignId)).toEqual([campaign.id]);
    const party = await as(dm.token, (client) =>
      client.party.list({ params: { campaignId: campaign.id } }),
    );
    expect(JSON.stringify(party)).toContain("Late Arrival");
  });
});
