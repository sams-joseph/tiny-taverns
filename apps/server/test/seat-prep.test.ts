import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignCharacterId,
  type CampaignId,
  SEAT_PREP_MAX,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { aCharacterAt, admittedTo, aGroupMemberAt, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **A seat's hook and secret are the creator's alone.**
 *
 * The DM's own notes about each character at their table, on a table of their
 * own (`0063_seat_prep.ts`) and behind the creator proof. Over the real
 * application and Postgres, through the client derived from the contract: the
 * creator writes, reads back and clears them; a player — whose seat is shared,
 * or is hidden — a Shared World member and a stranger are refused both
 * endpoints with the ordinary `NotFound`; a seat of another campaign named in
 * this one's path is refused even to the creator of both; a retired seat's
 * prep is gone with it; and nothing a player reads moves when prep is written.
 */

const database = migratedDatabase("taverns_test_seat_prep");
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

/** A GET's exact body, for the byte-for-byte comparison a decoded value would blur. */
const rawGet = (token: string, path: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
      );
      return { status: response.status, body: yield* response.text };
    }).pipe(Effect.orDie),
  );

/** A PATCH the derived client would refuse to encode, sent as it stands. */
const rawPatch = (token: string, path: string, body: unknown) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.patch(path).pipe(
          HttpClientRequest.bearerToken(token),
          HttpClientRequest.bodyJsonUnsafe(body),
        ),
      );
      return response.status;
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

const prepList = (who: Person, campaignId: CampaignId) =>
  as(who.token, (client) => client.seatPrep.list({ params: { campaignId } }));

const writePrep = (
  who: Person,
  campaignId: CampaignId,
  campaignCharacterId: CampaignCharacterId,
  payload: { readonly hook?: string | null; readonly secret?: string | null },
) =>
  as(who.token, (client) =>
    client.seatPrep.update({ params: { campaignId, campaignCharacterId }, payload }),
  );

let jo: Person;
let ilse: Person;
let marta: Person;
let stranger: Person;
let table: CampaignId;
let player: Actor;
/** Ilse's character, seated and shared with the table. */
let ilseSeat: CampaignCharacterId;
/** Marta's character, seated and left hidden (`dm`). */
let martaSeat: CampaignCharacterId;

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  marta = await person("Marta");
  stranger = await person("Bo");
  table = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
    )
  ).id;
  player = await run(admittedTo(table, ilse.actor, "Ilse"));
  await run(admittedTo(table, marta.actor, "Marta"));
  ilseSeat = (
    await run(aCharacterAt(table, ilse.actor, { name: "Tamsin" }, { seatVisibility: "shared" }))
  ).seatId;
  martaSeat = (await run(aCharacterAt(table, marta.actor, { name: "Odo" }))).seatId;
}, 60_000);

describe("the creator's seat prep", () => {
  it("answers every live seat in the roster's order, two nulls where nothing is written", async () => {
    const listed = await prepList(jo, table);
    const roster = await as(jo.token, (client) =>
      client.party.list({ params: { campaignId: table } }),
    );
    expect(listed.map((entry) => entry.campaignCharacterId)).toEqual(
      roster.map((entry) => entry.seat.id),
    );
    expect(listed.find((entry) => entry.campaignCharacterId === martaSeat)).toMatchObject({
      hook: null,
      secret: null,
    });
  });

  it("writes, reads back, leaves what a patch does not name, and clears with null", async () => {
    const written = await writePrep(jo, table, ilseSeat, {
      hook: "  Owes the Guild 40 gp  ",
      secret: "Her sister is the Veiled Hand.",
    });
    // Trimmed on the way in, as every prose line is.
    expect(written).toMatchObject({
      campaignCharacterId: ilseSeat,
      hook: "Owes the Guild 40 gp",
      secret: "Her sister is the Veiled Hand.",
    });
    expect((await prepList(jo, table)).find((e) => e.campaignCharacterId === ilseSeat)).toEqual(
      written,
    );

    const hookOnly = await writePrep(jo, table, ilseSeat, { hook: "Seeks the lost map" });
    expect(hookOnly).toMatchObject({
      hook: "Seeks the lost map",
      secret: "Her sister is the Veiled Hand.",
    });

    const cleared = await writePrep(jo, table, ilseSeat, { hook: null, secret: null });
    expect(cleared).toMatchObject({ hook: null, secret: null });
    expect((await prepList(jo, table)).find((e) => e.campaignCharacterId === ilseSeat)).toEqual(
      cleared,
    );
  });

  it("refuses a blank line and one past the bound at the wire", async () => {
    const path = `/campaigns/${table}/party/${martaSeat}/prep`;
    expect(await rawPatch(jo.token, path, { hook: "   " })).toBe(400);
    expect(await rawPatch(jo.token, path, { secret: "x".repeat(SEAT_PREP_MAX + 1) })).toBe(400);
    const odo = (await prepList(jo, table)).find((e) => e.campaignCharacterId === martaSeat);
    expect(odo).toMatchObject({ hook: null, secret: null });

    const longest = "x".repeat(SEAT_PREP_MAX);
    expect((await writePrep(jo, table, martaSeat, { secret: longest })).secret).toBe(longest);
    await writePrep(jo, table, martaSeat, { secret: null });
  });
});

describe("nobody but the creator", () => {
  let bystander: Actor;

  beforeAll(async () => {
    bystander = await run(aGroupMemberAt(table, "Wren"));
    await writePrep(jo, table, ilseSeat, { hook: "HOOK-ILSE", secret: "SECRET-ILSE" });
    await writePrep(jo, table, martaSeat, { hook: "HOOK-MARTA", secret: "SECRET-MARTA" });
  }, 60_000);

  it("answers a player, whose seat is shared or hidden, and a stranger NotFound on the list", async () => {
    for (const who of [ilse, marta, stranger]) {
      expect(
        await attempt(who.token, (client) =>
          client.seatPrep.list({ params: { campaignId: table } }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
    }
    // The proof the prep endpoints require: a player and a Shared World member
    // who is not at this table cannot get one.
    for (const actor of [player, bystander]) {
      const proof = await runtime.runPromise(Effect.result(asDm(actor, table)));
      expect(proof._tag).toBe("Failure");
    }
  });

  it("answers a player NotFound writing their own seat's prep or anybody else's", async () => {
    for (const [who, seat] of [
      [ilse, ilseSeat],
      [ilse, martaSeat],
      [marta, martaSeat],
      [stranger, ilseSeat],
    ] as const) {
      expect(
        await attempt(who.token, (client) =>
          client.seatPrep.update({
            params: { campaignId: table, campaignCharacterId: seat },
            payload: { secret: "Mine now" },
          }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
    }
    const listed = await prepList(jo, table);
    expect(listed.find((e) => e.campaignCharacterId === ilseSeat)?.secret).toBe("SECRET-ILSE");
    expect(listed.find((e) => e.campaignCharacterId === martaSeat)?.secret).toBe("SECRET-MARTA");
  });

  it("carries neither note on anything a player reads", async () => {
    for (const who of [ilse, marta]) {
      for (const path of [`/campaigns/${table}/party`, "/me/characters"]) {
        const read = await rawGet(who.token, path);
        expect(read.status).toBe(200);
        for (const marker of ["HOOK-ILSE", "SECRET-ILSE", "HOOK-MARTA", "SECRET-MARTA"]) {
          expect(read.body).not.toContain(marker);
        }
      }
    }
    // Nor on the creator's own seat read, which is the wide type a player's
    // projection is cut from: the notes are a read of their own.
    const roster = await rawGet(jo.token, `/campaigns/${table}/party`);
    expect(roster.body).not.toContain("SECRET-ILSE");
  });

  it("leaves a player's party read byte for byte what it was", async () => {
    const path = `/campaigns/${table}/party`;
    const before = await rawGet(ilse.token, path);
    await writePrep(jo, table, ilseSeat, { hook: "A new hook", secret: "A new secret" });
    await writePrep(jo, table, martaSeat, { hook: null });
    const after = await rawGet(ilse.token, path);
    expect(after).toEqual(before);
  });
});

describe("the seat the path names", () => {
  it("refuses another campaign's seat named in this one's path, even to the creator of both", async () => {
    const other = (
      await as(jo.token, (client) =>
        client.campaigns.create({ payload: { name: "The Hag's Bargain" } }),
      )
    ).id;
    const theirs = (await run(aCharacterAt(other, jo.actor, { name: "Brannoc" }))).seatId;
    await writePrep(jo, other, theirs, { secret: "SECRET-ELSEWHERE" });

    expect(
      await attempt(jo.token, (client) =>
        client.seatPrep.update({
          params: { campaignId: table, campaignCharacterId: theirs },
          payload: { secret: "Smuggled" },
        }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
    expect((await prepList(jo, table)).map((e) => e.campaignCharacterId)).not.toContain(theirs);
    expect((await prepList(jo, other)).find((e) => e.campaignCharacterId === theirs)?.secret).toBe(
      "SECRET-ELSEWHERE",
    );
  });

  it("drops a retired seat's prep from the list and refuses a write to it", async () => {
    const retiring = (await run(aCharacterAt(table, ilse.actor, { name: "Pell" }))).seatId;
    await writePrep(jo, table, retiring, { hook: "Leaving soon" });
    await as(jo.token, (client) =>
      client.party.leave({ params: { campaignId: table, campaignCharacterId: retiring } }),
    );

    expect((await prepList(jo, table)).map((e) => e.campaignCharacterId)).not.toContain(retiring);
    expect(
      await attempt(jo.token, (client) =>
        client.seatPrep.update({
          params: { campaignId: table, campaignCharacterId: retiring },
          payload: { hook: "Back again" },
        }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
  });
});
