import {
  ACT_TITLE_MAX,
  Actor,
  type CampaignActId,
  type CampaignId,
  CurrentActor,
  TavernsApi,
  type Visibility,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Acts } from "../src/repo/Acts.js";
import { admittedTo, aGroupMemberAt, aPlayerAt, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";

/**
 * **A campaign's acts: the creator's to write, and a player's to read only
 * once shared.**
 *
 * Over the real application and Postgres, through the client derived from the
 * contract: the creator starts an act at a night, renames, shares, unshares and
 * removes it; a second act at one night is a `Conflict`, and an act at a night
 * the campaign does not have is `NotFound`. A player lists the shared acts and
 * never a DM-only one's bytes; a player, a Shared World member and a stranger
 * are refused every write with the ordinary `NotFound` and move nothing; and an
 * act of another campaign named in this one's path is refused even to the
 * creator of both.
 */

const database = migratedDatabase("taverns_test_acts");
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

/** A GET's exact body, for the byte-level assertions a decoded value would blur. */
const rawGet = (token: string, path: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
      );
      return { status: response.status, body: yield* response.text };
    }).pipe(Effect.orDie),
  );

/** A POST the derived client would refuse to encode, sent as it stands. */
const rawPost = (token: string, path: string, body: unknown) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.post(path).pipe(
          HttpClientRequest.bearerToken(token),
          HttpClientRequest.bodyJsonUnsafe(body),
        ),
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

const listActs = (who: Person, campaignId: CampaignId) =>
  as(who.token, (client) => client.acts.list({ params: { campaignId } }));

const startAct = (
  who: Person,
  campaignId: CampaignId,
  payload: {
    readonly title: string;
    readonly firstSessionNumber: number;
    readonly visibility?: Visibility;
  },
) => as(who.token, (client) => client.acts.create({ params: { campaignId }, payload }));

const nights = async (who: Person, campaignId: CampaignId, numbers: ReadonlyArray<number>) => {
  for (const number of numbers) {
    await as(who.token, (client) =>
      client.sessions.create({ params: { campaignId }, payload: { number } }),
    );
  }
};

let jo: Person;
let ilse: Person;
let stranger: Person;
let table: CampaignId;

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");
  table = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
    )
  ).id;
  await run(admittedTo(table, ilse.actor, "Ilse"));
  await nights(jo, table, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
}, 60_000);

describe("the creator's acts", () => {
  it("starts an act at a night, DM-only and authored, with its title trimmed", async () => {
    const act = await startAct(jo, table, { title: "  The ferry  ", firstSessionNumber: 1 });
    expect(act).toMatchObject({
      campaignId: table,
      title: "The ferry",
      firstSessionNumber: 1,
      visibility: "dm",
      origin: "authored",
      assistantTurnId: null,
    });
    expect(await listActs(jo, table)).toEqual([act]);
    await as(jo.token, (client) =>
      client.acts.remove({ params: { campaignId: table, actId: act.id } }),
    );
  });

  it("lists every act oldest start first, renames, shares, unshares and removes", async () => {
    const second = await startAct(jo, table, { title: "The salt road", firstSessionNumber: 7 });
    const first = await startAct(jo, table, { title: "The drowned bell", firstSessionNumber: 1 });
    expect((await listActs(jo, table)).map((act) => act.id)).toEqual([first.id, second.id]);

    const renamed = await as(jo.token, (client) =>
      client.acts.update({
        params: { campaignId: table, actId: second.id },
        payload: { title: "The salt flats" },
      }),
    );
    expect(renamed).toMatchObject({ title: "The salt flats", visibility: "dm" });

    const shared = await as(jo.token, (client) =>
      client.acts.update({
        params: { campaignId: table, actId: second.id },
        payload: { visibility: "shared" },
      }),
    );
    expect(shared).toMatchObject({ title: "The salt flats", visibility: "shared" });

    const unshared = await as(jo.token, (client) =>
      client.acts.update({
        params: { campaignId: table, actId: second.id },
        payload: { visibility: "dm" },
      }),
    );
    expect(unshared.visibility).toBe("dm");

    for (const act of [first, second]) {
      await as(jo.token, (client) =>
        client.acts.remove({ params: { campaignId: table, actId: act.id } }),
      );
    }
    expect(await listActs(jo, table)).toEqual([]);
    expect(
      await attempt(jo.token, (client) =>
        client.acts.remove({ params: { campaignId: table, actId: first.id } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
  });

  it("refuses a second act at a night that already starts one", async () => {
    const act = await startAct(jo, table, { title: "The fens", firstSessionNumber: 4 });
    expect(
      await attempt(jo.token, (client) =>
        client.acts.create({
          params: { campaignId: table },
          payload: { title: "Also the fens", firstSessionNumber: 4 },
        }),
      ),
    ).toEqual({ ok: false, tag: "Conflict" });
    expect((await listActs(jo, table)).map((a) => a.title)).toEqual(["The fens"]);
    await as(jo.token, (client) =>
      client.acts.remove({ params: { campaignId: table, actId: act.id } }),
    );
  });

  it("refuses an act at a night this campaign does not have, even one another campaign has", async () => {
    const other = (
      await as(jo.token, (client) =>
        client.campaigns.create({ payload: { name: "The Hag's Bargain" } }),
      )
    ).id;
    await nights(jo, other, [40]);

    expect(
      await attempt(jo.token, (client) =>
        client.acts.create({
          params: { campaignId: table },
          payload: { title: "Out of nowhere", firstSessionNumber: 40 },
        }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
    expect(await listActs(jo, table)).toEqual([]);
  });

  it("refuses a blank title, one past the bound, and takes no origin from the wire", async () => {
    const path = `/campaigns/${table}/acts`;
    expect((await rawPost(jo.token, path, { title: "   ", firstSessionNumber: 2 })).status).toBe(
      400,
    );
    expect(
      (
        await rawPost(jo.token, path, {
          title: "x".repeat(ACT_TITLE_MAX + 1),
          firstSessionNumber: 2,
        })
      ).status,
    ).toBe(400);

    // `origin` is not a field of the payload, so a client claiming Hob wrote
    // it is ignored rather than recorded.
    const claimed = await rawPost(jo.token, path, {
      title: "x".repeat(ACT_TITLE_MAX),
      firstSessionNumber: 2,
      origin: "assistant",
    });
    expect(claimed.status).toBe(200);
    const [act] = await listActs(jo, table);
    expect(act).toMatchObject({ title: "x".repeat(ACT_TITLE_MAX), origin: "authored" });
    await as(jo.token, (client) =>
      client.acts.remove({ params: { campaignId: table, actId: act!.id } }),
    );
  });
});

describe("what a player reads", () => {
  let hidden: CampaignActId;
  let told: CampaignActId;

  beforeAll(async () => {
    hidden = (await startAct(jo, table, { title: "SENTINEL-DM-ACT", firstSessionNumber: 3 })).id;
    told = (
      await startAct(jo, table, {
        title: "The salt road",
        firstSessionNumber: 7,
        visibility: "shared",
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    for (const actId of [hidden, told]) {
      await as(jo.token, (client) => client.acts.remove({ params: { campaignId: table, actId } }));
    }
  });

  it("lists only the shared acts, with no byte of a DM-only one", async () => {
    expect((await listActs(ilse, table)).map((act) => act.id)).toEqual([told]);
    const raw = await rawGet(ilse.token, `/campaigns/${table}/acts`);
    expect(raw.status).toBe(200);
    expect(raw.body).not.toContain("SENTINEL-DM-ACT");
    expect(raw.body).not.toContain(hidden);
    // The creator reads both.
    expect((await listActs(jo, table)).map((act) => act.id)).toEqual([hidden, told]);
  });

  it("answers a campaign-scoped player credential the same, through the repository", async () => {
    const player = await run(aPlayerAt(table, "Tamsin"));
    const listed = await run(
      Effect.flatMap(Acts, (acts) => acts.list(table)).pipe(
        Effect.provideService(CurrentActor, player),
      ),
    );
    expect(listed.map((act) => act.id)).toEqual([told]);
  });

  it("drops an act from the player's list when it is unshared, and brings it back", async () => {
    const setVisibility = (visibility: Visibility) =>
      as(jo.token, (client) =>
        client.acts.update({ params: { campaignId: table, actId: told }, payload: { visibility } }),
      );
    await setVisibility("dm");
    expect(await listActs(ilse, table)).toEqual([]);
    await setVisibility("shared");
    expect((await listActs(ilse, table)).map((act) => act.id)).toEqual([told]);
  });

  it("answers a stranger NotFound on the list, and a Shared World member no DM-only act", async () => {
    expect(
      await attempt(stranger.token, (client) =>
        client.acts.list({ params: { campaignId: table } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });

    // A live member of the campaign's context whose seat was withdrawn:
    // eligible for the table, not at it.
    const bystander = await run(aGroupMemberAt(table, "Wren"));
    const listed = await runtime.runPromise(
      Effect.flatMap(Acts, (acts) => acts.list(table)).pipe(
        Effect.provideService(CurrentActor, bystander),
        Effect.result,
      ),
    );
    if (listed._tag === "Success") {
      expect(listed.success.map((act) => act.title)).not.toContain("SENTINEL-DM-ACT");
    } else {
      expect(listed.failure._tag).toBe("NotFound");
    }
  });
});

describe("nobody but the creator writes", () => {
  let act: CampaignActId;

  beforeAll(async () => {
    act = (
      await startAct(jo, table, {
        title: "The long dark",
        firstSessionNumber: 10,
        visibility: "shared",
      })
    ).id;
  }, 60_000);

  it("refuses a player and a stranger every write with NotFound, and moves nothing", async () => {
    const before = await listActs(jo, table);
    for (const who of [ilse, stranger]) {
      expect(
        await attempt(who.token, (client) =>
          client.acts.create({
            params: { campaignId: table },
            payload: { title: "Mine now", firstSessionNumber: 11 },
          }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
      expect(
        await attempt(who.token, (client) =>
          client.acts.update({
            params: { campaignId: table, actId: act },
            payload: { title: "Mine now", visibility: "dm" },
          }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
      expect(
        await attempt(who.token, (client) =>
          client.acts.remove({ params: { campaignId: table, actId: act } }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
    }
    expect(await listActs(jo, table)).toEqual(before);
  });

  it("gives neither a player nor a Shared World member the proof the writes require", async () => {
    const player = await run(aPlayerAt(table, "Odo"));
    const bystander = await run(aGroupMemberAt(table, "Pell"));
    for (const actor of [player, bystander]) {
      const proof = await runtime.runPromise(Effect.result(asDm(actor, table)));
      expect(proof._tag).toBe("Failure");
    }
  });

  it("refuses another campaign's act named in this one's path, even to the creator of both", async () => {
    const other = (
      await as(jo.token, (client) =>
        client.campaigns.create({ payload: { name: "The Sunken Keep" } }),
      )
    ).id;
    await nights(jo, other, [1]);
    const theirs = (await startAct(jo, other, { title: "ELSEWHERE", firstSessionNumber: 1 })).id;

    expect(
      await attempt(jo.token, (client) =>
        client.acts.update({
          params: { campaignId: table, actId: theirs },
          payload: { title: "Smuggled" },
        }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
    expect(
      await attempt(jo.token, (client) =>
        client.acts.remove({ params: { campaignId: table, actId: theirs } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
    expect((await listActs(jo, table)).map((a) => a.id)).not.toContain(theirs);
    expect((await listActs(jo, other)).map((a) => a.title)).toEqual(["ELSEWHERE"]);
  });
});
