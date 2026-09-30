import {
  Actor,
  type CampaignCharacterId,
  type CampaignId,
  type EncounterId,
  type NpcId,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Invites } from "../src/repo/Invites.js";
import { aCharacterAt, admittedTo, asDm, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";

/**
 * **An NPC's links: the creator's prep, gone with their target while the NPC
 * stays, and never a player's.**
 *
 * Over the real application and Postgres. A link ties an NPC to an encounter
 * or a seat of its own campaign; anything else is `NotFound`, as is every link
 * endpoint to anybody but the creator — a seated player, a player whose
 * invitation was revoked, and a stranger. A player's reads of a shared, linked
 * NPC are read on the raw wire, because the derived client decodes into the
 * narrow class and would drop a field the server should never have sent.
 *
 * The people are minted the shipped way: a player admitted through a real
 * invitation, seated through `party.join`.
 */
const database = migratedDatabase("taverns_test_npc_links");
const services = servicesOver(database);

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(testServer),
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

/** A request as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, method: "GET" | "POST" | "DELETE", path: string, body?: unknown) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const request =
        method === "GET"
          ? HttpClientRequest.get(path)
          : method === "DELETE"
            ? HttpClientRequest.delete(path)
            : HttpClientRequest.post(path).pipe(HttpClientRequest.bodyJsonUnsafe(body));
      const response = yield* HttpClient.execute(
        request.pipe(HttpClientRequest.bearerToken(token)),
      );
      return { status: response.status, body: yield* response.text };
    }).pipe(Effect.orDie),
  );

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

/** How many link rows an NPC has, whatever any read says. */
const linkRows = (npcId: NpcId) =>
  run(
    Effect.flatMap(
      SqlClient.SqlClient,
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from npc_link where npc_link.npc_id = ${npcId}
      `,
    ),
  ).then((rows) => rows[0]!.count);

/** An error and every cause under it, as text: the constraint's name is in the driver's. */
const causes = (error: unknown): string => {
  const seen: Array<string> = [];
  for (let cause = error; cause !== null && cause !== undefined;) {
    seen.push(String(cause));
    cause = (cause as { readonly cause?: unknown }).cause;
  }
  return seen.join("\n");
};

let jo: Person;
let ilse: Person;
let wren: Person;
let stranger: Person;
let table: CampaignId;
let elsewhere: CampaignId;
let ambush: EncounterId;
let ford: EncounterId;
let ilseSeat: CampaignCharacterId;
let joSeat: CampaignCharacterId;
let otherEncounter: EncounterId;
let otherSeat: CampaignCharacterId;
let otherNpc: NpcId;
let hollis: NpcId;
let ferryman: NpcId;

const encounter = (campaignId: CampaignId, name: string) =>
  as(jo.token, (client) =>
    client.encounters.create({ params: { campaignId }, payload: { name } }),
  ).then((made) => made.id);

const npc = (name: string, campaignId: CampaignId = table, visibility?: "shared") =>
  as(jo.token, (client) =>
    client.npcs.create({
      params: { campaignId },
      payload: visibility === undefined ? { name } : { name, visibility },
    }),
  ).then((made) => made.id);

const linksPath = (npcId: NpcId, campaignId: CampaignId = table) =>
  `/campaigns/${campaignId}/npcs/${npcId}/links`;

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  wren = await person("Wren");
  stranger = await person("Bo");

  table = (
    await as(jo.token, (client) =>
      campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
    )
  ).id;
  await run(admittedTo(table, ilse.actor, "Ilse"));
  ilseSeat = (await run(aCharacterAt(table, ilse.actor, { name: "Ilse's Ranger" }))).seatId;
  joSeat = (await run(aCharacterAt(table, jo.actor, { name: "Brannoc" }))).seatId;
  ambush = await encounter(table, "Ambush in the reeds");
  ford = await encounter(table, "The ford");

  // Wren was a player until the DM revoked the invitation: still an account,
  // still in the Shared World, no longer at this table.
  await run(admittedTo(table, wren.actor, "Wren"));
  await run(
    Effect.gen(function* () {
      const invites = yield* Invites;
      const proof = yield* asDm(jo.actor, table);
      const listed = yield* invites.listForCampaign(proof);
      yield* invites.revokeForCampaign(proof, listed.find((invite) => invite.label === "Wren")!.id);
    }),
  );

  // Another of Jo's own tables: the same creator, so only the campaign
  // boundary stands between its encounter, seat and NPC and an NPC here.
  elsewhere = (
    await as(jo.token, (client) => campaignVia(client, { name: "Rook's Rest", visibility: "dm" }))
  ).id;
  otherEncounter = await encounter(elsewhere, "A fight elsewhere");
  otherSeat = (await run(aCharacterAt(elsewhere, jo.actor, { name: "Wick" }))).seatId;
  otherNpc = await npc("Rook", elsewhere);

  hollis = await npc("Hollis Grey");
  ferryman = await npc("The ferryman", table, "shared");
}, 60_000);

describe("the creator linking an NPC", () => {
  it("adds encounters and seats, in order, and reads them back", async () => {
    const before = await as(jo.token, (client) =>
      client.npcs.findById({ params: { campaignId: table, npcId: hollis } }),
    );
    const empty = await as(jo.token, (client) =>
      client.npcs.links({ params: { campaignId: table, npcId: hollis } }),
    );
    expect(empty).toMatchObject({ npcId: hollis, links: [] });

    await as(jo.token, (client) =>
      client.npcs.addLink({
        params: { campaignId: table, npcId: hollis },
        payload: { kind: "encounter", id: ambush },
      }),
    );
    await as(jo.token, (client) =>
      client.npcs.addLink({
        params: { campaignId: table, npcId: hollis },
        payload: { kind: "seat", id: ilseSeat },
      }),
    );
    const linked = await as(jo.token, (client) =>
      client.npcs.addLink({
        params: { campaignId: table, npcId: hollis },
        payload: { kind: "encounter", id: ford },
      }),
    );
    const expected = [
      { kind: "encounter", id: ambush },
      { kind: "seat", id: ilseSeat },
      { kind: "encounter", id: ford },
    ];
    expect(linked).toMatchObject({ npcId: hollis, links: expected });

    const read = await as(jo.token, (client) =>
      client.npcs.links({ params: { campaignId: table, npcId: hollis } }),
    );
    expect(read.links).toEqual(expected);

    // A tie is not an edit of the persona: the NPC's version and time stand.
    const after = await as(jo.token, (client) =>
      client.npcs.findById({ params: { campaignId: table, npcId: hollis } }),
    );
    expect(after.version).toBe(before.version);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it("is idempotent both ways, and removes exactly the link it names", async () => {
    const npcId = await npc("Mother Sallow");
    const add = () =>
      as(jo.token, (client) =>
        client.npcs.addLink({
          params: { campaignId: table, npcId },
          payload: { kind: "seat", id: joSeat },
        }),
      );
    await add();
    const again = await add();
    expect(again.links).toEqual([{ kind: "seat", id: joSeat }]);
    expect(await linkRows(npcId)).toBe(1);

    await as(jo.token, (client) =>
      client.npcs.addLink({
        params: { campaignId: table, npcId },
        payload: { kind: "encounter", id: ambush },
      }),
    );
    const remove = () =>
      as(jo.token, (client) =>
        client.npcs.removeLink({
          params: { campaignId: table, npcId, kind: "seat", targetId: joSeat },
        }),
      );
    expect((await remove()).links).toEqual([{ kind: "encounter", id: ambush }]);
    expect((await remove()).links).toEqual([{ kind: "encounter", id: ambush }]);

    // The kind is part of the key: an encounter id named as a seat removes
    // nothing.
    const wrongKind = await as(jo.token, (client) =>
      client.npcs.removeLink({
        params: { campaignId: table, npcId, kind: "seat", targetId: ambush },
      }),
    );
    expect(wrongKind.links).toEqual([{ kind: "encounter", id: ambush }]);
  });

  it("refuses a target in another campaign, a retired seat and a stranger's id", async () => {
    const npcId = await npc("Snagtooth");
    const bodies = [
      { kind: "encounter", id: otherEncounter },
      { kind: "seat", id: otherSeat },
      // An encounter's id named as a seat, and a seat's as an encounter.
      { kind: "seat", id: ambush },
      { kind: "encounter", id: ilseSeat },
      { kind: "encounter", id: crypto.randomUUID() },
      // An NPC is not something an NPC links to.
      { kind: "npc", id: hollis },
    ];
    for (const body of bodies) {
      const answer = await wire(jo.token, "POST", linksPath(npcId), body);
      expect({ body, status: answer.status }).toEqual({
        body,
        // The last is refused by the contract before any row is read.
        status: body.kind === "npc" ? 400 : 404,
      });
    }

    // The NPC in the path is checked against the campaign in the path.
    const crossed = await wire(jo.token, "POST", linksPath(otherNpc), {
      kind: "encounter",
      id: ambush,
    });
    expect(crossed.status).toBe(404);
    const crossedRead = await wire(jo.token, "GET", linksPath(npcId, elsewhere));
    expect(crossedRead.status).toBe(404);

    // A seat whose character has left: no chip could open its page.
    const leaving = (await run(aCharacterAt(table, jo.actor, { name: "Old Tam" }))).seatId;
    await as(jo.token, (client) =>
      client.party.leave({ params: { campaignId: table, campaignCharacterId: leaving } }),
    );
    const retired = await wire(jo.token, "POST", linksPath(npcId), { kind: "seat", id: leaving });
    expect(retired.status).toBe(404);

    expect(await linkRows(npcId)).toBe(0);
  });

  it("is a key, not a check: the table refuses a link across campaigns", async () => {
    const refused = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`
          insert into npc_link (npc_id, campaign_id, encounter_id)
          values (${hollis}, ${table}, ${otherEncounter})
        `,
      ).pipe(Effect.flip, Effect.map(causes)),
    );
    expect(refused).toContain("npc_link_encounter_fkey");
  });
});

describe("the link endpoints, to anybody but the creator", () => {
  it("are NotFound for a seated player, a revoked one and a stranger, and write nothing", async () => {
    await as(jo.token, (client) =>
      client.npcs.addLink({
        params: { campaignId: table, npcId: ferryman },
        payload: { kind: "encounter", id: ambush },
      }),
    );
    for (const who of [ilse, wren, stranger]) {
      const read = await wire(who.token, "GET", linksPath(ferryman));
      expect(read.status).toBe(404);
      expect(read.body).not.toContain(ambush);
      const added = await wire(who.token, "POST", linksPath(ferryman), {
        kind: "seat",
        id: ilseSeat,
      });
      expect(added.status).toBe(404);
      const removed = await wire(who.token, "DELETE", `${linksPath(ferryman)}/encounter/${ambush}`);
      expect(removed.status).toBe(404);
      expect(removed.body).not.toContain("ferryman");
    }
    expect(await linkRows(ferryman)).toBe(1);
  });
});

describe("a player's reads of a shared, linked NPC", () => {
  it("carry no links, and name no linked encounter or seat", async () => {
    await as(jo.token, (client) =>
      client.npcs.addLink({
        params: { campaignId: table, npcId: ferryman },
        payload: { kind: "seat", id: joSeat },
      }),
    );
    const listed = await wire(ilse.token, "GET", `/campaigns/${table}/npcs/-/player`);
    expect(listed.status).toBe(200);
    expect(listed.body).toContain("The ferryman");
    const found = await wire(ilse.token, "GET", `/campaigns/${table}/npcs/${ferryman}/player`);
    expect(found.status).toBe(200);
    for (const body of [listed.body, found.body]) {
      expect(body).not.toContain('"links"');
      expect(body).not.toContain(ambush);
      expect(body).not.toContain(joSeat);
    }
  });
});

describe("what happens to a link", () => {
  it("goes with a deleted encounter, and the NPC stays", async () => {
    const npcId = await npc("Grusk");
    const doomed = await encounter(table, "Grusk collects the toll");
    for (const id of [doomed, ford]) {
      await as(jo.token, (client) =>
        client.npcs.addLink({
          params: { campaignId: table, npcId },
          payload: { kind: "encounter", id },
        }),
      );
    }

    await as(jo.token, (client) =>
      client.encounters.remove({ params: { campaignId: table, encounterId: doomed } }),
    );

    const after = await as(jo.token, (client) =>
      client.npcs.links({ params: { campaignId: table, npcId } }),
    );
    expect(after.links).toEqual([{ kind: "encounter", id: ford }]);
  });

  it("stays in the record when the seat is retired", async () => {
    const npcId = await npc("Joss");
    const leaving = (await run(aCharacterAt(table, jo.actor, { name: "Odo" }))).seatId;
    await as(jo.token, (client) =>
      client.npcs.addLink({
        params: { campaignId: table, npcId },
        payload: { kind: "seat", id: leaving },
      }),
    );
    await as(jo.token, (client) =>
      client.party.leave({ params: { campaignId: table, campaignCharacterId: leaving } }),
    );

    const after = await as(jo.token, (client) =>
      client.npcs.links({ params: { campaignId: table, npcId } }),
    );
    expect(after.links).toEqual([{ kind: "seat", id: leaving }]);
    // And it can still be taken off.
    const removed = await as(jo.token, (client) =>
      client.npcs.removeLink({
        params: { campaignId: table, npcId, kind: "seat", targetId: leaving },
      }),
    );
    expect(removed.links).toEqual([]);
  });

  it("survives archiving the NPC, and is there again on restore", async () => {
    const npcId = await npc("Marl");
    await as(jo.token, (client) =>
      client.npcs.addLink({
        params: { campaignId: table, npcId },
        payload: { kind: "encounter", id: ambush },
      }),
    );
    await as(jo.token, (client) =>
      client.npcs.archive({ params: { campaignId: table, npcId }, payload: {} }),
    );
    const archived = await as(jo.token, (client) =>
      client.npcs.links({ params: { campaignId: table, npcId } }),
    );
    expect(archived.links).toEqual([{ kind: "encounter", id: ambush }]);

    await as(jo.token, (client) =>
      client.npcs.restore({ params: { campaignId: table, npcId }, payload: {} }),
    );
    const restored = await as(jo.token, (client) =>
      client.npcs.links({ params: { campaignId: table, npcId } }),
    );
    expect(restored.links).toEqual([{ kind: "encounter", id: ambush }]);
  });
});
