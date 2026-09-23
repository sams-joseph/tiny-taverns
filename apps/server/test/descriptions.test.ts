import { NodeHttpServer } from "@effect/platform-node";
import { type CampaignId, type SharedWorldId, TavernsApi } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **The three player-facing descriptions** — a campaign's and a Shared World's
 * `description` columns and an NPC's `persona.identity.appearance` — written by
 * every composer and read by exactly whoever reads the row they are on.
 *
 * Over HTTP with images off, which is what CI runs; the draws they feed are
 * `campaign-images.test.ts`, `shared-world-images.test.ts` and
 * `npc-images.test.ts`. The players are real accounts admitted by real
 * invitations.
 */
const database = migratedDatabase("taverns_test_descriptions");
const services = servicesOver(database);

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
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
const tagOf = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(token), call).pipe(
      Effect.map(() => "Success"),
      Effect.catch((error: unknown) =>
        Effect.succeed(
          typeof error === "object" && error !== null && "_tag" in error
            ? String(error._tag)
            : "unknown",
        ),
      ),
    ),
  );

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, query));

const issue = (name: string) =>
  runtime.runPromise(
    Effect.flatMap(Accounts, (accounts) => accounts.issue(name)).pipe(
      Effect.map((issued) => issued.token),
      Effect.orDie,
    ),
  );

/** Admits `token`'s account to a campaign through a real invitation. */
const admit = (dm: string, campaignId: CampaignId, token: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const creator = yield* clientFor(dm);
      const issued = yield* creator.campaignInvites.create({
        params: { campaignId },
        payload: { label: "a player" },
      });
      const joining = yield* clientFor(token);
      yield* joining.join.redeem({ payload: { token: issued.token } });
    }).pipe(Effect.orDie),
  );

const PITCH = "Caravans cross white salt flats between glass storms; the road remembers.";
const LAND = "A drowned coast of reed marshes and sunken bell towers, always at dusk.";
const LOOK = "Sixties, stooped, river-grey eyes, a lantern hung from his pole.";

let jo: string;
let pim: string;
let wren: string;
let stranger: string;
let worldId: SharedWorldId;
let campaignId: CampaignId;

beforeAll(async () => {
  jo = await issue("Jo");
  pim = await issue("Pim");
  wren = await issue("Wren");
  stranger = await issue("Bo");

  const world = await as(jo, (client) =>
    client.sharedWorlds.create({ payload: { name: "The Marches", description: `  ${LAND}  ` } }),
  );
  worldId = world.id;
  const campaign = await as(jo, (client) =>
    client.sharedWorlds.createCampaign({
      params: { worldId },
      payload: { name: "The Salt Road", description: PITCH, visibility: "shared" },
    }),
  );
  campaignId = campaign.id;
  await admit(jo, campaignId, pim);
  // Wren plays another table in the same world: a member, not a participant.
  const other = await as(jo, (client) =>
    client.sharedWorlds.createCampaign({ params: { worldId }, payload: { name: "Elsewhere" } }),
  );
  await admit(jo, other.id, wren);
}, 60_000);

describe("a campaign's description", () => {
  it("is written by both create paths, trimmed, and is null when none or a blank was given", async () => {
    const inWorld = await as(jo, (client) => client.campaigns.findById({ params: { campaignId } }));
    expect(inWorld.description).toBe(PITCH);

    const standalone = await as(jo, (client) =>
      client.campaigns.create({ payload: { name: "Rime", description: "  Ice, and under it.  " } }),
    );
    expect(standalone.description).toBe("Ice, and under it.");

    const none = await as(jo, (client) => client.campaigns.create({ payload: { name: "Plain" } }));
    const blank = await as(jo, (client) =>
      client.campaigns.create({ payload: { name: "Blank", description: "   " } }),
    );
    expect(none.description).toBeNull();
    expect(blank.description).toBeNull();
  });

  it("is rewritten by an update, and cleared by a null or a blank", async () => {
    const made = await as(jo, (client) =>
      client.campaigns.create({ payload: { name: "Edits", description: "First." } }),
    );
    const params = { campaignId: made.id };
    const rewritten = await as(jo, (client) =>
      client.campaigns.update({ params, payload: { description: "Second." } }),
    );
    expect(rewritten.description).toBe("Second.");
    // A patch that does not name it leaves it alone.
    const renamed = await as(jo, (client) =>
      client.campaigns.update({ params, payload: { name: "Edits, renamed" } }),
    );
    expect(renamed.description).toBe("Second.");
    const cleared = await as(jo, (client) =>
      client.campaigns.update({ params, payload: { description: null } }),
    );
    expect(cleared.description).toBeNull();
    await as(jo, (client) =>
      client.campaigns.update({ params, payload: { description: "Back." } }),
    );
    const blanked = await as(jo, (client) =>
      client.campaigns.update({ params, payload: { description: "  " } }),
    );
    expect(blanked.description).toBeNull();
  });

  it("reaches a player at the table, and nobody who cannot read the campaign", async () => {
    const asPlayer = await as(pim, (client) =>
      client.campaigns.findById({ params: { campaignId } }),
    );
    expect(asPlayer.description).toBe(PITCH);
    const mine = await as(pim, (client) => client.me.campaigns());
    expect(mine.find((entry) => entry.campaign.id === campaignId)?.campaign.description).toBe(
      PITCH,
    );

    expect(
      await tagOf(stranger, (client) => client.campaigns.findById({ params: { campaignId } })),
    ).toBe("NotFound");
    expect(
      await tagOf(wren, (client) => client.campaigns.findById({ params: { campaignId } })),
    ).toBe("NotFound");
    // The world's directory names the campaign to a member who does not play
    // there, and says nothing more about it.
    const directory = await as(wren, (client) =>
      client.sharedWorlds.campaigns({ params: { worldId } }),
    );
    const card = directory.find((entry) => entry.id === campaignId);
    expect(card?.name).toBe("The Salt Road");
    expect(JSON.stringify(card)).not.toContain(PITCH);
  });

  it("is refused blank or overlong by the column itself, not only by the wire", async () => {
    const write = (value: string) =>
      sql((sql) => sql`update campaign set description = ${value} where id = ${campaignId}`).then(
        () => "written",
        () => "refused",
      );
    expect(await write("   ")).toBe("refused");
    expect(await write("x".repeat(601))).toBe("refused");
    expect(await write("x".repeat(600))).toBe("written");
  });
});

describe("a Shared World's description", () => {
  it("is written by create, trimmed, and read by every member", async () => {
    for (const member of [jo, pim, wren]) {
      const found = await as(member, (client) =>
        client.sharedWorlds.findById({ params: { worldId } }),
      );
      expect(found.description).toBe(LAND);
      const listed = await as(member, (client) => client.sharedWorlds.list());
      expect(
        listed.find((entry) => entry.sharedWorld.id === worldId)?.sharedWorld.description,
      ).toBe(LAND);
    }
    expect(
      await tagOf(stranger, (client) => client.sharedWorlds.findById({ params: { worldId } })),
    ).toBe("NotFound");
  });

  it("is null when none was given, rewritten by an update, and cleared by a null or a blank", async () => {
    const made = await as(jo, (client) =>
      client.sharedWorlds.create({ payload: { name: "Plainland" } }),
    );
    expect(made.description).toBeNull();
    const params = { worldId: made.id };
    const written = await as(jo, (client) =>
      client.sharedWorlds.update({ params, payload: { description: "Hills." } }),
    );
    expect(written.description).toBe("Hills.");
    const renamed = await as(jo, (client) =>
      client.sharedWorlds.update({ params, payload: { name: "Hill Country" } }),
    );
    expect(renamed.description).toBe("Hills.");
    const cleared = await as(jo, (client) =>
      client.sharedWorlds.update({ params, payload: { description: null } }),
    );
    expect(cleared.description).toBeNull();
    await as(jo, (client) =>
      client.sharedWorlds.update({ params, payload: { description: "Hills." } }),
    );
    const blanked = await as(jo, (client) =>
      client.sharedWorlds.update({ params, payload: { description: " " } }),
    );
    expect(blanked.description).toBeNull();
  });

  it("is written when a campaign's hidden context is promoted, and absent when none is given", async () => {
    const first = await as(jo, (client) => client.campaigns.create({ payload: { name: "Promo" } }));
    const promoted = await as(jo, (client) =>
      client.campaigns.promoteSharedWorld({
        params: { campaignId: first.id },
        payload: { name: "The Promoted Reach", description: " Cliffs over a grey sea. " },
      }),
    );
    expect(promoted.description).toBe("Cliffs over a grey sea.");

    const second = await as(jo, (client) =>
      client.campaigns.create({ payload: { name: "Plain" } }),
    );
    const bare = await as(jo, (client) =>
      client.campaigns.promoteSharedWorld({
        params: { campaignId: second.id },
        payload: { name: "The Bare Reach" },
      }),
    );
    expect(bare.description).toBeNull();
  });
});

describe("an NPC's appearance", () => {
  it("is written by the cast form's create and update, in the public persona", async () => {
    const made = await as(jo, (client) =>
      client.npcs.create({
        params: { campaignId },
        payload: {
          name: "Cazril",
          role: "the ferryman",
          persona: { identity: { summary: "Takes names, not coin.", appearance: LOOK } },
          privateMaterial: { secrets: "He owes the hag." },
        },
      }),
    );
    expect(made.persona.identity?.appearance).toBe(LOOK);
    expect(JSON.stringify(made.persona)).not.toContain("hag");

    const cleared = await as(jo, (client) =>
      client.npcs.update({
        params: { campaignId, npcId: made.id },
        payload: {
          expectedVersion: made.version,
          persona: { identity: { summary: "Takes names, not coin." } },
        },
      }),
    );
    expect(cleared.persona.identity?.appearance).toBeUndefined();
  });

  it("reaches a player exactly when the NPC does", async () => {
    const hidden = await as(jo, (client) =>
      client.npcs.create({
        params: { campaignId },
        payload: { name: "Mara", persona: { identity: { appearance: LOOK } } },
      }),
    );
    const read = () =>
      tagOf(pim, (client) =>
        client.npcs.playerFindById({ params: { campaignId, npcId: hidden.id } }),
      );
    expect(await read()).toBe("NotFound");
    const list = await as(pim, (client) => client.npcs.playerList({ params: { campaignId } }));
    expect(JSON.stringify(list)).not.toContain(LOOK);

    await as(jo, (client) =>
      client.npcs.update({
        params: { campaignId, npcId: hidden.id },
        payload: { expectedVersion: hidden.version, visibility: "shared" },
      }),
    );
    const shared = await as(pim, (client) =>
      client.npcs.playerFindById({ params: { campaignId, npcId: hidden.id } }),
    );
    expect(shared.persona.identity?.appearance).toBe(LOOK);
    expect(
      await tagOf(stranger, (client) =>
        client.npcs.playerFindById({ params: { campaignId, npcId: hidden.id } }),
      ),
    ).toBe("NotFound");
  });

  it("is written by the Library form and carried by a copy into a cast", async () => {
    const source = await as(jo, (client) =>
      client.library.createNpc({
        payload: { name: "Old Fen", persona: { identity: { appearance: LOOK } } },
      }),
    );
    expect(source.persona.identity?.appearance).toBe(LOOK);
    const copy = await as(jo, (client) =>
      client.npcs.copyFromSource({
        params: { campaignId, sourceNpcId: source.id },
        payload: {},
      }),
    );
    expect(copy.persona.identity?.appearance).toBe(LOOK);
  });
});
