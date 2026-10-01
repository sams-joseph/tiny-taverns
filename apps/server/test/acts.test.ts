import { describe, expect } from "@effect/vitest";
import {
  ACT_TITLE_MAX,
  type CampaignActId,
  type CampaignId,
  CurrentActor,
  TavernsApi,
  type Visibility,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { applicationOver, servicesOver } from "../src/app.js";
import { Acts } from "../src/repo/Acts.js";
import {
  type Person,
  aPerson,
  admittedTo,
  aGroupMemberAt,
  aPlayerAt,
  asDm,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

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

const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
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

/** The same call, answering the failure's tag rather than dying on it. */
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
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
  );

/** A GET's exact body, for the byte-level assertions a decoded value would blur. */
const rawGet = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

/** A POST the derived client would refuse to encode, sent as it stands. */
const rawPost = (token: string, path: string, body: unknown) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.post(path).pipe(
        HttpClientRequest.bearerToken(token),
        HttpClientRequest.bodyJsonUnsafe(body),
      ),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

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

const nights = (who: Person, campaignId: CampaignId, numbers: ReadonlyArray<number>) =>
  Effect.gen(function* () {
    for (const number of numbers) {
      yield* as(who.token, (client) =>
        client.sessions.create({ params: { campaignId }, payload: { number } }),
      );
    }
  });

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  yield* admittedTo(table, ilse.actor, "Ilse");
  yield* nights(jo, table, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  return { jo, ilse, stranger, table };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "acts.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

/** A DM-only act and a shared one, removed again when the block ends. */
const makeTold = Effect.gen(function* () {
  const { jo, table } = yield* Fixture;
  return yield* Effect.acquireRelease(
    Effect.gen(function* () {
      const hidden = (yield* startAct(jo, table, {
        title: "SENTINEL-DM-ACT",
        firstSessionNumber: 3,
      })).id;
      const told = (yield* startAct(jo, table, {
        title: "The salt road",
        firstSessionNumber: 7,
        visibility: "shared",
      })).id;
      return { hidden, told };
    }),
    ({ hidden, told }) =>
      Effect.gen(function* () {
        for (const actId of [hidden, told]) {
          yield* as(jo.token, (client) =>
            client.acts.remove({ params: { campaignId: table, actId } }),
          );
        }
      }),
  );
});

class Told extends Context.Service<Told, Effect.Success<typeof makeTold>>()("acts.test/Told") {}

const makeLongDark = Effect.gen(function* () {
  const { jo, table } = yield* Fixture;
  return (yield* startAct(jo, table, {
    title: "The long dark",
    firstSessionNumber: 10,
    visibility: "shared",
  })).id;
});

class LongDark extends Context.Service<LongDark, CampaignActId>()("acts.test/LongDark") {}

describeLayer("acts", shared, (it) => {
  describe("the creator's acts", () => {
    it.effect("starts an act at a night, DM-only and authored, with its title trimmed", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const act = yield* startAct(jo, table, { title: "  The ferry  ", firstSessionNumber: 1 });
        expect(act).toMatchObject({
          campaignId: table,
          title: "The ferry",
          firstSessionNumber: 1,
          visibility: "dm",
          origin: "authored",
          assistantTurnId: null,
        });
        expect(yield* listActs(jo, table)).toEqual([act]);
        yield* as(jo.token, (client) =>
          client.acts.remove({ params: { campaignId: table, actId: act.id } }),
        );
      }),
    );

    it.effect("lists every act oldest start first, renames, shares, unshares and removes", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const second = yield* startAct(jo, table, {
          title: "The salt road",
          firstSessionNumber: 7,
        });
        const first = yield* startAct(jo, table, {
          title: "The drowned bell",
          firstSessionNumber: 1,
        });
        expect((yield* listActs(jo, table)).map((act) => act.id)).toEqual([first.id, second.id]);

        const renamed = yield* as(jo.token, (client) =>
          client.acts.update({
            params: { campaignId: table, actId: second.id },
            payload: { title: "The salt flats" },
          }),
        );
        expect(renamed).toMatchObject({ title: "The salt flats", visibility: "dm" });

        const shared = yield* as(jo.token, (client) =>
          client.acts.update({
            params: { campaignId: table, actId: second.id },
            payload: { visibility: "shared" },
          }),
        );
        expect(shared).toMatchObject({ title: "The salt flats", visibility: "shared" });

        const unshared = yield* as(jo.token, (client) =>
          client.acts.update({
            params: { campaignId: table, actId: second.id },
            payload: { visibility: "dm" },
          }),
        );
        expect(unshared.visibility).toBe("dm");

        for (const act of [first, second]) {
          yield* as(jo.token, (client) =>
            client.acts.remove({ params: { campaignId: table, actId: act.id } }),
          );
        }
        expect(yield* listActs(jo, table)).toEqual([]);
        expect(
          yield* attempt(jo.token, (client) =>
            client.acts.remove({ params: { campaignId: table, actId: first.id } }),
          ),
        ).toEqual({ ok: false, tag: "NotFound" });
      }),
    );

    it.effect("refuses a second act at a night that already starts one", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const act = yield* startAct(jo, table, { title: "The fens", firstSessionNumber: 4 });
        expect(
          yield* attempt(jo.token, (client) =>
            client.acts.create({
              params: { campaignId: table },
              payload: { title: "Also the fens", firstSessionNumber: 4 },
            }),
          ),
        ).toEqual({ ok: false, tag: "Conflict" });
        expect((yield* listActs(jo, table)).map((a) => a.title)).toEqual(["The fens"]);
        yield* as(jo.token, (client) =>
          client.acts.remove({ params: { campaignId: table, actId: act.id } }),
        );
      }),
    );

    it.effect(
      "refuses an act at a night this campaign does not have, even one another campaign has",
      () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const other = (yield* as(jo.token, (client) =>
            client.campaigns.create({ payload: { name: "The Hag's Bargain" } }),
          )).id;
          yield* nights(jo, other, [40]);

          expect(
            yield* attempt(jo.token, (client) =>
              client.acts.create({
                params: { campaignId: table },
                payload: { title: "Out of nowhere", firstSessionNumber: 40 },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
          expect(yield* listActs(jo, table)).toEqual([]);
        }),
    );

    it.effect("refuses a blank title, one past the bound, and takes no origin from the wire", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const path = `/campaigns/${table}/acts`;
        expect(
          (yield* rawPost(jo.token, path, { title: "   ", firstSessionNumber: 2 })).status,
        ).toBe(400);
        expect(
          (yield* rawPost(jo.token, path, {
            title: "x".repeat(ACT_TITLE_MAX + 1),
            firstSessionNumber: 2,
          })).status,
        ).toBe(400);

        // `origin` is not a field of the payload, so a client claiming Hob wrote
        // it is ignored rather than recorded.
        const claimed = yield* rawPost(jo.token, path, {
          title: "x".repeat(ACT_TITLE_MAX),
          firstSessionNumber: 2,
          origin: "assistant",
        });
        expect(claimed.status).toBe(200);
        const [act] = yield* listActs(jo, table);
        expect(act).toMatchObject({ title: "x".repeat(ACT_TITLE_MAX), origin: "authored" });
        yield* as(jo.token, (client) =>
          client.acts.remove({ params: { campaignId: table, actId: act!.id } }),
        );
      }),
    );
  });

  it.layer(Layer.effect(Told)(makeTold))("what a player reads", (it) => {
    it.effect("lists only the shared acts, with no byte of a DM-only one", () =>
      Effect.gen(function* () {
        const { jo, ilse, table } = yield* Fixture;
        const { hidden, told } = yield* Told;
        expect((yield* listActs(ilse, table)).map((act) => act.id)).toEqual([told]);
        const raw = yield* rawGet(ilse.token, `/campaigns/${table}/acts`);
        expect(raw.status).toBe(200);
        expect(raw.body).not.toContain("SENTINEL-DM-ACT");
        expect(raw.body).not.toContain(hidden);
        // The creator reads both.
        expect((yield* listActs(jo, table)).map((act) => act.id)).toEqual([hidden, told]);
      }),
    );

    it.effect("answers a campaign-scoped player credential the same, through the repository", () =>
      Effect.gen(function* () {
        const { table } = yield* Fixture;
        const { told } = yield* Told;
        const player = yield* aPlayerAt(table, "Tamsin");
        const listed = yield* Effect.flatMap(Acts, (acts) => acts.list(table)).pipe(
          Effect.provideService(CurrentActor, player),
          Effect.orDie,
        );
        expect(listed.map((act) => act.id)).toEqual([told]);
      }),
    );

    it.effect("drops an act from the player's list when it is unshared, and brings it back", () =>
      Effect.gen(function* () {
        const { jo, ilse, table } = yield* Fixture;
        const { told } = yield* Told;
        const setVisibility = (visibility: Visibility) =>
          as(jo.token, (client) =>
            client.acts.update({
              params: { campaignId: table, actId: told },
              payload: { visibility },
            }),
          );
        yield* setVisibility("dm");
        expect(yield* listActs(ilse, table)).toEqual([]);
        yield* setVisibility("shared");
        expect((yield* listActs(ilse, table)).map((act) => act.id)).toEqual([told]);
      }),
    );

    it.effect(
      "answers a stranger NotFound on the list, and a Shared World member no DM-only act",
      () =>
        Effect.gen(function* () {
          const { stranger, table } = yield* Fixture;
          expect(
            yield* attempt(stranger.token, (client) =>
              client.acts.list({ params: { campaignId: table } }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });

          // A live member of the campaign's context whose seat was withdrawn:
          // eligible for the table, not at it.
          const bystander = yield* aGroupMemberAt(table, "Wren");
          const listed = yield* Effect.flatMap(Acts, (acts) => acts.list(table)).pipe(
            Effect.provideService(CurrentActor, bystander),
            Effect.result,
          );
          if (listed._tag === "Success") {
            expect(listed.success.map((act) => act.title)).not.toContain("SENTINEL-DM-ACT");
          } else {
            expect(listed.failure._tag).toBe("NotFound");
          }
        }),
    );
  });

  it.layer(Layer.effect(LongDark)(makeLongDark))("nobody but the creator writes", (it) => {
    it.effect("refuses a player and a stranger every write with NotFound, and moves nothing", () =>
      Effect.gen(function* () {
        const { jo, ilse, stranger, table } = yield* Fixture;
        const act = yield* LongDark;
        const before = yield* listActs(jo, table);
        for (const who of [ilse, stranger]) {
          expect(
            yield* attempt(who.token, (client) =>
              client.acts.create({
                params: { campaignId: table },
                payload: { title: "Mine now", firstSessionNumber: 11 },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
          expect(
            yield* attempt(who.token, (client) =>
              client.acts.update({
                params: { campaignId: table, actId: act },
                payload: { title: "Mine now", visibility: "dm" },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
          expect(
            yield* attempt(who.token, (client) =>
              client.acts.remove({ params: { campaignId: table, actId: act } }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
        }
        expect(yield* listActs(jo, table)).toEqual(before);
      }),
    );

    it.effect("gives neither a player nor a Shared World member the proof the writes require", () =>
      Effect.gen(function* () {
        const { table } = yield* Fixture;
        const player = yield* aPlayerAt(table, "Odo");
        const bystander = yield* aGroupMemberAt(table, "Pell");
        for (const actor of [player, bystander]) {
          const proof = yield* Effect.result(asDm(actor, table));
          expect(proof._tag).toBe("Failure");
        }
      }),
    );

    it.effect(
      "refuses another campaign's act named in this one's path, even to the creator of both",
      () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const other = (yield* as(jo.token, (client) =>
            client.campaigns.create({ payload: { name: "The Sunken Keep" } }),
          )).id;
          yield* nights(jo, other, [1]);
          const theirs = (yield* startAct(jo, other, {
            title: "ELSEWHERE",
            firstSessionNumber: 1,
          })).id;

          expect(
            yield* attempt(jo.token, (client) =>
              client.acts.update({
                params: { campaignId: table, actId: theirs },
                payload: { title: "Smuggled" },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
          expect(
            yield* attempt(jo.token, (client) =>
              client.acts.remove({ params: { campaignId: table, actId: theirs } }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
          expect((yield* listActs(jo, table)).map((a) => a.id)).not.toContain(theirs);
          expect((yield* listActs(jo, other)).map((a) => a.title)).toEqual(["ELSEWHERE"]);
        }),
    );
  });
});
