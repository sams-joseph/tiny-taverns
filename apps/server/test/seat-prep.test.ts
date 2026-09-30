import { describe, expect } from "@effect/vitest";
import {
  type Actor,
  type CampaignCharacterId,
  type CampaignId,
  SEAT_PREP_MAX,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { applicationOver, servicesOver } from "../src/app.js";
import {
  type Person,
  aCharacterAt,
  admittedTo,
  aGroupMemberAt,
  aPerson,
  asDm,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

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

/** A GET's exact body, for the byte-for-byte comparison a decoded value would blur. */
const rawGet = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

/** A PATCH the derived client would refuse to encode, sent as it stands. */
const rawPatch = (token: string, path: string, body: unknown) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.patch(path).pipe(
        HttpClientRequest.bearerToken(token),
        HttpClientRequest.bodyJsonUnsafe(body),
      ),
    );
    return response.status;
  }).pipe(Effect.orDie);

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

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const marta = yield* aPerson("Marta");
  const stranger = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const player = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* admittedTo(table, marta.actor, "Marta");
  /** Ilse's character, seated and shared with the table. */
  const ilseSeat = (yield* aCharacterAt(
    table,
    ilse.actor,
    { name: "Tamsin" },
    { seatVisibility: "shared" },
  )).seatId;
  /** Marta's character, seated and left hidden (`dm`). */
  const martaSeat = (yield* aCharacterAt(table, marta.actor, { name: "Odo" })).seatId;
  return { jo, ilse, marta, stranger, table, player, ilseSeat, martaSeat };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "seat-prep.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const makeBystander = Effect.gen(function* () {
  const { jo, table, ilseSeat, martaSeat } = yield* Fixture;
  const bystander = yield* aGroupMemberAt(table, "Wren");
  yield* writePrep(jo, table, ilseSeat, { hook: "HOOK-ILSE", secret: "SECRET-ILSE" });
  yield* writePrep(jo, table, martaSeat, { hook: "HOOK-MARTA", secret: "SECRET-MARTA" });
  return bystander;
}).pipe(Effect.orDie);

class Bystander extends Context.Service<Bystander, Actor>()("seat-prep.test/Bystander") {}

describeLayer("seat-prep", shared, (it) => {
  describe("the creator's seat prep", () => {
    it.effect(
      "answers every live seat in the roster's order, two nulls where nothing is written",
      () =>
        Effect.gen(function* () {
          const { jo, table, martaSeat } = yield* Fixture;
          const listed = yield* prepList(jo, table);
          const roster = yield* as(jo.token, (client) =>
            client.party.list({ params: { campaignId: table } }),
          );
          expect(listed.map((entry) => entry.campaignCharacterId)).toEqual(
            roster.map((entry) => entry.seat.id),
          );
          expect(listed.find((entry) => entry.campaignCharacterId === martaSeat)).toMatchObject({
            hook: null,
            secret: null,
          });
        }),
    );

    it.effect("writes, reads back, leaves what a patch does not name, and clears with null", () =>
      Effect.gen(function* () {
        const { jo, table, ilseSeat } = yield* Fixture;
        const written = yield* writePrep(jo, table, ilseSeat, {
          hook: "  Owes the Guild 40 gp  ",
          secret: "Her sister is the Veiled Hand.",
        });
        // Trimmed on the way in, as every prose line is.
        expect(written).toMatchObject({
          campaignCharacterId: ilseSeat,
          hook: "Owes the Guild 40 gp",
          secret: "Her sister is the Veiled Hand.",
        });
        expect(
          (yield* prepList(jo, table)).find((e) => e.campaignCharacterId === ilseSeat),
        ).toEqual(written);

        const hookOnly = yield* writePrep(jo, table, ilseSeat, { hook: "Seeks the lost map" });
        expect(hookOnly).toMatchObject({
          hook: "Seeks the lost map",
          secret: "Her sister is the Veiled Hand.",
        });

        const cleared = yield* writePrep(jo, table, ilseSeat, { hook: null, secret: null });
        expect(cleared).toMatchObject({ hook: null, secret: null });
        expect(
          (yield* prepList(jo, table)).find((e) => e.campaignCharacterId === ilseSeat),
        ).toEqual(cleared);
      }),
    );

    it.effect("refuses a blank line and one past the bound at the wire", () =>
      Effect.gen(function* () {
        const { jo, table, martaSeat } = yield* Fixture;
        const path = `/campaigns/${table}/party/${martaSeat}/prep`;
        expect(yield* rawPatch(jo.token, path, { hook: "   " })).toBe(400);
        expect(yield* rawPatch(jo.token, path, { secret: "x".repeat(SEAT_PREP_MAX + 1) })).toBe(
          400,
        );
        const odo = (yield* prepList(jo, table)).find((e) => e.campaignCharacterId === martaSeat);
        expect(odo).toMatchObject({ hook: null, secret: null });

        const longest = "x".repeat(SEAT_PREP_MAX);
        expect((yield* writePrep(jo, table, martaSeat, { secret: longest })).secret).toBe(longest);
        yield* writePrep(jo, table, martaSeat, { secret: null });
      }),
    );
  });

  it.layer(Layer.effect(Bystander)(makeBystander))("nobody but the creator", (it) => {
    it.effect(
      "answers a player, whose seat is shared or hidden, and a stranger NotFound on the list",
      () =>
        Effect.gen(function* () {
          const { ilse, marta, stranger, table, player } = yield* Fixture;
          const bystander = yield* Bystander;
          for (const who of [ilse, marta, stranger]) {
            expect(
              yield* attempt(who.token, (client) =>
                client.seatPrep.list({ params: { campaignId: table } }),
              ),
            ).toEqual({ ok: false, tag: "NotFound" });
          }
          // The proof the prep endpoints require: a player and a Shared World member
          // who is not at this table cannot get one.
          for (const actor of [player, bystander]) {
            const proof = yield* Effect.result(asDm(actor, table));
            expect(proof._tag).toBe("Failure");
          }
        }),
    );

    it.effect("answers a player NotFound writing their own seat's prep or anybody else's", () =>
      Effect.gen(function* () {
        const { jo, ilse, marta, stranger, table, ilseSeat, martaSeat } = yield* Fixture;
        for (const [who, seat] of [
          [ilse, ilseSeat],
          [ilse, martaSeat],
          [marta, martaSeat],
          [stranger, ilseSeat],
        ] as const) {
          expect(
            yield* attempt(who.token, (client) =>
              client.seatPrep.update({
                params: { campaignId: table, campaignCharacterId: seat },
                payload: { secret: "Mine now" },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
        }
        const listed = yield* prepList(jo, table);
        expect(listed.find((e) => e.campaignCharacterId === ilseSeat)?.secret).toBe("SECRET-ILSE");
        expect(listed.find((e) => e.campaignCharacterId === martaSeat)?.secret).toBe(
          "SECRET-MARTA",
        );
      }),
    );

    it.effect("carries neither note on anything a player reads", () =>
      Effect.gen(function* () {
        const { jo, ilse, marta, table } = yield* Fixture;
        for (const who of [ilse, marta]) {
          for (const path of [`/campaigns/${table}/party`, "/me/characters"]) {
            const read = yield* rawGet(who.token, path);
            expect(read.status).toBe(200);
            for (const marker of ["HOOK-ILSE", "SECRET-ILSE", "HOOK-MARTA", "SECRET-MARTA"]) {
              expect(read.body).not.toContain(marker);
            }
          }
        }
        // Nor on the creator's own seat read, which is the wide type a player's
        // projection is cut from: the notes are a read of their own.
        const roster = yield* rawGet(jo.token, `/campaigns/${table}/party`);
        expect(roster.body).not.toContain("SECRET-ILSE");
      }),
    );

    it.effect("leaves a player's party read byte for byte what it was", () =>
      Effect.gen(function* () {
        const { jo, ilse, table, ilseSeat, martaSeat } = yield* Fixture;
        const path = `/campaigns/${table}/party`;
        const before = yield* rawGet(ilse.token, path);
        yield* writePrep(jo, table, ilseSeat, { hook: "A new hook", secret: "A new secret" });
        yield* writePrep(jo, table, martaSeat, { hook: null });
        const after = yield* rawGet(ilse.token, path);
        expect(after).toEqual(before);
      }),
    );
  });

  describe("the seat the path names", () => {
    it.effect(
      "refuses another campaign's seat named in this one's path, even to the creator of both",
      () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const other = (yield* as(jo.token, (client) =>
            client.campaigns.create({ payload: { name: "The Hag's Bargain" } }),
          )).id;
          const theirs = (yield* aCharacterAt(other, jo.actor, { name: "Brannoc" })).seatId;
          yield* writePrep(jo, other, theirs, { secret: "SECRET-ELSEWHERE" });

          expect(
            yield* attempt(jo.token, (client) =>
              client.seatPrep.update({
                params: { campaignId: table, campaignCharacterId: theirs },
                payload: { secret: "Smuggled" },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
          expect((yield* prepList(jo, table)).map((e) => e.campaignCharacterId)).not.toContain(
            theirs,
          );
          expect(
            (yield* prepList(jo, other)).find((e) => e.campaignCharacterId === theirs)?.secret,
          ).toBe("SECRET-ELSEWHERE");
        }),
    );

    it.effect("drops a retired seat's prep from the list and refuses a write to it", () =>
      Effect.gen(function* () {
        const { jo, ilse, table } = yield* Fixture;
        const retiring = (yield* aCharacterAt(table, ilse.actor, { name: "Pell" })).seatId;
        yield* writePrep(jo, table, retiring, { hook: "Leaving soon" });
        yield* as(jo.token, (client) =>
          client.party.leave({ params: { campaignId: table, campaignCharacterId: retiring } }),
        );

        expect((yield* prepList(jo, table)).map((e) => e.campaignCharacterId)).not.toContain(
          retiring,
        );
        expect(
          yield* attempt(jo.token, (client) =>
            client.seatPrep.update({
              params: { campaignId: table, campaignCharacterId: retiring },
              payload: { hook: "Back again" },
            }),
          ),
        ).toEqual({ ok: false, tag: "NotFound" });
      }),
    );
  });
});
