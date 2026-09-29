import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  type CreatureId,
  CurrentActor,
  type EncounterId,
  type EncounterPlacement,
  MAX_PAGE_SIZE,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Encounters } from "../src/repo/Encounters.js";
import { admittedTo, aGroupMemberAt, anAccount, aPlayerAt } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **The DM's planned order: a campaign's encounters in the order the table
 * will play them** (`0078_encounter_order.ts`, `Encounters.move`).
 *
 * Over the real application and Postgres, through the client derived from the
 * contract. A new encounter lands at the end; a move puts one just before or
 * just after another and is not an edit; a played encounter keeps its slot and
 * is back in it when its night is deleted; creates and moves racing each other
 * all apply. Nobody but the creator can move one, and an anchor outside the
 * campaign is `NotFound`. The refused people are minted the shipped way
 * (`support/actors.ts`): a player through a real invitation, a Shared World
 * member whose seat was withdrawn, and a stranger.
 *
 * What a player is told of the order — array order and no number — is
 * `encounter-player.test.ts`; an accepted Hob proposal landing at the end is
 * `hob-proposals.test.ts`; the backfill is `migrations.test.ts`.
 */
const database = migratedDatabase("taverns_test_encounter_order");
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
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(token), call).pipe(
      Effect.map(() => "ok"),
      Effect.catch((error: unknown) =>
        Effect.succeed(
          typeof error === "object" && error !== null && "_tag" in error
            ? String(error._tag)
            : "unknown",
        ),
      ),
    ),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie));

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

let jo: Person;
let archerId: CreatureId;

const aTable = async (name = "The Salt Road"): Promise<CampaignId> =>
  (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name, visibility: "shared" } }),
    )
  ).id;

const anEncounter = async (campaignId: CampaignId, name: string): Promise<EncounterId> =>
  (
    await as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId },
        payload: { name, creatures: [{ creatureId: archerId, count: 2 }] },
      }),
    )
  ).id;

/** Encounters made one after another, by name. */
const encounters = async (campaignId: CampaignId, names: ReadonlyArray<string>) => {
  const ids: Record<string, EncounterId> = {};
  for (const name of names) ids[name] = await anEncounter(campaignId, name);
  return ids;
};

/** The creator's list, by name, in the order it arrives. */
const listed = async (campaignId: CampaignId) =>
  (
    await as(jo.token, (client) =>
      client.encounters.list({ params: { campaignId }, query: { limit: MAX_PAGE_SIZE } }),
    )
  ).items.map((encounter) => encounter.name);

const move = (
  who: Person,
  campaignId: CampaignId,
  encounterId: EncounterId,
  placement: EncounterPlacement,
) =>
  attempt(who.token, (client) =>
    // One branch each: the derived client's argument is a union of its own,
    // which a union payload does not distribute into.
    "before" in placement
      ? client.encounters.move({
          params: { campaignId, encounterId },
          payload: { before: placement.before },
        })
      : client.encounters.move({
          params: { campaignId, encounterId },
          payload: { after: placement.after },
        }),
  );

/** The stored slots, as a campaign holds them, in slot order. */
const slots = (campaignId: CampaignId) =>
  sql(
    (sql) => sql<{ readonly encounter_id: EncounterId; readonly position: number }>`
      select encounter_id, position from encounter_prep
      where campaign_id = ${campaignId}
      order by position
    `,
  );

beforeAll(async () => {
  jo = await person("Jo");
  archerId = (
    await as(jo.token, (client) =>
      client.library.create({
        payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
      }),
    )
  ).id;
}, 60_000);

describe("a new encounter", () => {
  it("lands at the end, whatever order the list is in", async () => {
    const table = await aTable();
    const { A, C } = await encounters(table, ["A", "B", "C"]);
    expect(await listed(table)).toEqual(["A", "B", "C"]);

    expect(await move(jo, table, C!, { before: A! })).toBe("ok");
    await anEncounter(table, "D");
    expect(await listed(table)).toEqual(["C", "A", "B", "D"]);
    expect((await slots(table)).map((slot) => slot.position)).toEqual([0, 1, 2, 3]);
  }, 60_000);

  it("lands after a gap a delete left, and a move closes the gap", async () => {
    const table = await aTable();
    const { A, B } = await encounters(table, ["A", "B", "C"]);
    await as(jo.token, (client) =>
      client.encounters.remove({ params: { campaignId: table, encounterId: B! } }),
    );
    await anEncounter(table, "D");
    expect(await listed(table)).toEqual(["A", "C", "D"]);
    expect((await slots(table)).map((slot) => slot.position)).toEqual([0, 2, 3]);

    expect(await move(jo, table, A!, { after: A! })).toBe("ok");
    expect((await slots(table)).map((slot) => slot.position)).toEqual([0, 2, 3]);
    const D = (await slots(table))[2]!.encounter_id;
    expect(await move(jo, table, D, { before: A! })).toBe("ok");
    expect(await listed(table)).toEqual(["D", "A", "C"]);
    expect((await slots(table)).map((slot) => slot.position)).toEqual([0, 1, 2]);
  }, 60_000);
});

describe("moving an encounter", () => {
  it("puts it just before or just after another, up or down the list", async () => {
    const table = await aTable();
    const { A, B, C, D, E } = await encounters(table, ["A", "B", "C", "D", "E"]);

    expect(await move(jo, table, D!, { before: B! })).toBe("ok");
    expect(await listed(table)).toEqual(["A", "D", "B", "C", "E"]);
    expect(await move(jo, table, A!, { after: E! })).toBe("ok");
    expect(await listed(table)).toEqual(["D", "B", "C", "E", "A"]);
    expect(await move(jo, table, E!, { before: D! })).toBe("ok");
    expect(await listed(table)).toEqual(["E", "D", "B", "C", "A"]);
    expect(await move(jo, table, B!, { after: A! })).toBe("ok");
    expect(await listed(table)).toEqual(["E", "D", "C", "A", "B"]);
    // Relative to itself, and to where it already is: nothing changes.
    expect(await move(jo, table, C!, { before: C! })).toBe("ok");
    expect(await move(jo, table, C!, { after: D! })).toBe("ok");
    expect(await listed(table)).toEqual(["E", "D", "C", "A", "B"]);

    // The prep list, the other creator read the screens order by, agrees.
    const prep = await as(jo.token, (client) =>
      client.encounterPrep.list({ params: { campaignId: table } }),
    );
    const names = Object.fromEntries(
      Object.entries({ A, B, C, D, E }).map(([name, id]) => [id!, name]),
    );
    expect(prep.map((row) => names[row.encounterId])).toEqual(["E", "D", "C", "A", "B"]);
  }, 60_000);

  it("is not an edit: neither encounter's updated time moves", async () => {
    const table = await aTable();
    const { A, C } = await encounters(table, ["A", "B", "C"]);
    const stamps = () =>
      sql(
        (sql) => sql<{ readonly encounter: Date; readonly prep: Date }>`
          select encounter.updated_at as encounter, encounter_prep.updated_at as prep
          from encounter join encounter_prep on encounter_prep.encounter_id = encounter.id
          where encounter.campaign_id = ${table}
          order by encounter.name
        `,
      );
    const before = await stamps();
    expect(await move(jo, table, C!, { before: A! })).toBe("ok");
    expect(await listed(table)).toEqual(["C", "A", "B"]);
    expect(await stamps()).toEqual(before);
  }, 60_000);

  it("moves across played encounters, which keep their slots and have them back when their night goes", async () => {
    const table = await aTable();
    const { A, B, C, D } = await encounters(table, ["A", "B", "C", "D"]);

    // B is played, on a night of its own.
    const night = await as(jo.token, (client) =>
      client.sessions.create({
        params: { campaignId: table },
        payload: { number: 1, visibility: "shared" },
      }),
    );
    const sessionId: SessionId = night.id;
    await as(jo.token, (client) =>
      client.campaigns.update({
        params: { campaignId: table },
        payload: { currentSessionId: sessionId },
      }),
    );
    const fight = await as(jo.token, (client) =>
      client.runs.start({ params: { campaignId: table, sessionId }, payload: { encounterId: B! } }),
    );
    await as(jo.token, (client) =>
      client.runs.end({ params: { campaignId: table, sessionId, runId: fight.id }, payload: {} }),
    );

    // The unplayed ones move past it, relative to their neighbours.
    expect(await move(jo, table, D!, { after: A! })).toBe("ok");
    expect(await listed(table)).toEqual(["A", "D", "B", "C"]);
    expect(await move(jo, table, A!, { after: B! })).toBe("ok");
    expect(await listed(table)).toEqual(["D", "B", "A", "C"]);
    // A played one is still a slot a move can anchor on, and can be moved.
    expect(await move(jo, table, C!, { before: B! })).toBe("ok");
    expect(await listed(table)).toEqual(["D", "C", "B", "A"]);

    // The night goes, and its fight with it: B is unplayed again, where the
    // DM last had it.
    await as(jo.token, (client) =>
      client.sessions.remove({ params: { campaignId: table, sessionId } }),
    );
    const after = await as(jo.token, (client) =>
      client.encounters.list({ params: { campaignId: table }, query: { limit: MAX_PAGE_SIZE } }),
    );
    expect(after.items.map((encounter) => [encounter.name, encounter.lastPlayed])).toEqual([
      ["D", null],
      ["C", null],
      ["B", null],
      ["A", null],
    ]);
  }, 60_000);

  it("pages in the planned order, a cursor at a time", async () => {
    const table = await aTable();
    const { A, E } = await encounters(table, ["A", "B", "C", "D", "E"]);
    expect(await move(jo, table, E!, { before: A! })).toBe("ok");
    const names: Array<string> = [];
    let cursor: Parameters<Client["encounters"]["list"]>[0]["query"]["cursor"];
    for (;;) {
      const page = await as(jo.token, (client) =>
        client.encounters.list({
          params: { campaignId: table },
          query: cursor === undefined ? { limit: 2 } : { limit: 2, cursor },
        }),
      );
      names.push(...page.items.map((encounter) => encounter.name));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    expect(names).toEqual(["E", "A", "B", "C", "D"]);
  }, 60_000);
});

describe("a move, to anybody but the creator", () => {
  it("is NotFound for a player, a Shared World member and a stranger, and moves nothing", async () => {
    const table = await aTable();
    const { A, C } = await encounters(table, ["A", "B", "C"]);
    await as(jo.token, (client) =>
      client.encounters.update({
        params: { campaignId: table, encounterId: C! },
        payload: { visibility: "shared", ready: true },
      }),
    );
    const player = await run(aPlayerAt(table, "Ilse"));
    const member = await run(aGroupMemberAt(table, "Wren"));
    const stranger = await run(anAccount("Bo"));

    for (const actor of [player, member, stranger]) {
      const refused = await runtime.runPromise(
        Effect.flatMap(Encounters, (repo) => repo.move(table, C!, { before: A! })).pipe(
          Effect.provideService(CurrentActor, actor),
          Effect.flip,
          Effect.orDie,
        ),
      );
      expect(refused._tag).toBe("NotFound");
    }

    // Over the wire too, for a player admitted with an account of their own.
    const ilse = await person("Ilse again");
    await run(admittedTo(table, ilse.actor, "Ilse again"));
    expect(await move(ilse, table, C!, { before: A! })).toBe("NotFound");

    expect(await listed(table)).toEqual(["A", "B", "C"]);
  }, 60_000);

  it("is NotFound when the anchor or the encounter is another campaign's", async () => {
    const table = await aTable();
    const other = await aTable("Rook's Rest");
    const { A } = await encounters(table, ["A", "B"]);
    const { Z } = await encounters(other, ["Z"]);

    expect(await move(jo, table, A!, { after: Z! })).toBe("NotFound");
    expect(await move(jo, table, Z!, { before: A! })).toBe("NotFound");
    // And the other campaign's path does not reach this one's encounter.
    expect(await move(jo, other, A!, { before: Z! })).toBe("NotFound");
    expect(await listed(table)).toEqual(["A", "B"]);
    expect(await listed(other)).toEqual(["Z"]);
  }, 60_000);

  it("is NotFound for an anchor since deleted", async () => {
    const table = await aTable();
    const { A, B } = await encounters(table, ["A", "B", "C"]);
    await as(jo.token, (client) =>
      client.encounters.remove({ params: { campaignId: table, encounterId: B! } }),
    );
    expect(await move(jo, table, A!, { after: B! })).toBe("NotFound");
    expect(await listed(table)).toEqual(["A", "C"]);
  }, 60_000);
});

describe("racing writes", () => {
  it("gives two creates at once two slots at the end", async () => {
    const table = await aTable();
    await encounters(table, ["A"]);
    const results = await Promise.all(
      ["B", "C", "D", "E"].map((name) =>
        attempt(jo.token, (client) =>
          client.encounters.create({ params: { campaignId: table }, payload: { name } }),
        ),
      ),
    );
    expect(results).toEqual(["ok", "ok", "ok", "ok"]);
    const names = await listed(table);
    expect(names[0]).toBe("A");
    expect([...names].sort()).toEqual(["A", "B", "C", "D", "E"]);
    expect((await slots(table)).map((slot) => slot.position)).toEqual([0, 1, 2, 3, 4]);
  }, 60_000);

  it("applies a move and a create that race, both of them", async () => {
    const table = await aTable();
    const { A, C } = await encounters(table, ["A", "B", "C"]);
    const [moved, made] = await Promise.all([
      move(jo, table, C!, { before: A! }),
      attempt(jo.token, (client) =>
        client.encounters.create({ params: { campaignId: table }, payload: { name: "D" } }),
      ),
    ]);
    expect([moved, made]).toEqual(["ok", "ok"]);
    expect(await listed(table)).toEqual(["C", "A", "B", "D"]);
  }, 60_000);

  it("applies two moves that race in the order they commit", async () => {
    const table = await aTable();
    const { A, B, C, D } = await encounters(table, ["A", "B", "C", "D"]);
    const results = await Promise.all([
      move(jo, table, D!, { before: A! }),
      move(jo, table, B!, { after: C! }),
    ]);
    expect(results).toEqual(["ok", "ok"]);
    const names = await listed(table);
    // Whichever went first, both placements hold at the end.
    expect(names.indexOf("D")).toBeLessThan(names.indexOf("A"));
    expect(names.indexOf("B")).toBe(names.indexOf("C") + 1);
    expect((await slots(table)).map((slot) => slot.position)).toEqual([0, 1, 2, 3]);
  }, 60_000);
});
