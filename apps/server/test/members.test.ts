import { type CampaignId, CurrentActor, NotFound } from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Groups } from "../src/repo/Groups.js";
import { Characters } from "../src/repo/Characters.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Invites } from "../src/repo/Invites.js";
import { Memberships } from "../src/repo/Memberships.js";
import { Party } from "../src/repo/Party.js";
import {
  aCharacterAt,
  aPlayerAt,
  anAccount,
  asDm,
  createCampaign,
  scopedTo,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * `GET /campaigns/:c/members` — the roster, and **the answer to whether the
 * party screen needs a seat.**
 *
 * The fourth delivery draws four statuses per chair: `playing`, `no-character`,
 * `invited` and `open`. Three of them are questions about rows that already
 * exist and the fourth is not representable, because a `campaign_member` row
 * cannot exist before an account — and neither can a `campaign_character`
 * seat, whose `account_id` is `not null` too. So there is no empty chair, and
 * this file is where that is measured rather than asserted: the last block
 * derives each of the three from this list plus `invites.list` plus
 * `Party.list` (the live seats), and shows the counts the screen's subtitle
 * needs falling out of the same three reads.
 *
 * Four blocks:
 *
 *   1. the gate — a player, a DM of another table, a scoped credential, and the
 *      campaign's own DM
 *   2. what the list carries, and in what order
 *   3. what it leaves out: a revoked member, and every other table
 *   4. the seat vocabulary, derived
 */

const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  Groups.layer,
  Characters.layer,
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
  CampaignCreatorActors.layer,
  Invites.layer,
  Memberships.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_members")));
const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

const as =
  (actor: (typeof CurrentActor)["Service"]) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * A mixed table: the DM, a player with a character, a player without one, and
 * one invitation nobody has taken yet.
 *
 * Plus a second campaign the same DM runs, and a stranger who is a DM of their
 * own somewhere else — the two credentials that must not read this roster.
 *
 * The campaign is `shared`, so every refusal below is about the roster rather
 * than about a table nobody has opened.
 */
const makeFixture = Effect.gen(function* () {
  const invites = yield* Invites;

  const dm = yield* anAccount("Ada");
  const campaign = yield* as(dm)(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  const otherTable = yield* as(dm)(createCampaign({ name: "Salt and Sixpence" }));

  // Both through a real invitation, which is the only way the product mints a
  // player membership at all.
  const playing = yield* aPlayerAt(campaign.id, "Ilse");
  const seated = yield* aPlayerAt(campaign.id, "Marta");
  const creator = yield* asDm(dm, campaign.id);

  // Ilse writes her own character down and explicitly seats it — the shipped
  // path, and what the fourth block below needs: a member with a live seat
  // beside one without.
  const brannoc = yield* aCharacterAt(campaign.id, playing, {
    name: "Brannoc",
    playerName: "Ilse",
  });

  // Outstanding: minted, never redeemed. It is what *"invited, hasn't opened
  // it"* is, and it is on `campaign_invite` rather than anywhere near this list.
  const outstanding = yield* invites.createForCampaign(creator, { label: "Pell" });

  return {
    dm,
    playing,
    seated,
    stranger: yield* anAccount("Bo"),
    campaign,
    otherTable,
    brannoc: brannoc.character,
    outstanding,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

/** The read exactly as `handlers.ts` performs it: a path segment, then a proof. */
const roster = (actor: (typeof CurrentActor)["Service"], campaignId: CampaignId) =>
  runtime.runPromise(
    Effect.flatMap(asDm(actor, campaignId), (dm) =>
      Effect.flatMap(Memberships, (memberships) => memberships.list(dm)),
    ).pipe(Effect.result),
  );

describe("the gate", () => {
  it("refuses a player of this very campaign, with a NotFound", async () => {
    // The whole reason `Memberships` is gated. A player at the table has an
    // ordinary, live membership and reads the campaign fine; what they do not
    // get is the roster — other people's account names, who was invited and
    // when. And the refusal is the same 404 every denial in the product
    // answers with, because "it exists but is not yours" is a disclosure.
    const refused = await roster(fixture.playing, fixture.campaign.id);

    expect(refused._tag).toBe("Failure");
    expect(refused._tag === "Failure" && refused.failure).toBeInstanceOf(NotFound);
    expect(refused._tag === "Failure" && (refused.failure as NotFound).resource).toBe("campaign");
  }, 60_000);

  it("refuses a DM of another table asking about this one", async () => {
    // Being a DM somewhere is not being a DM here: the proof is a fact about a
    // pair, and there is no campaign-less version of it to spend.
    const refused = await roster(fixture.stranger, fixture.campaign.id);

    expect(refused._tag).toBe("Failure");
    expect(refused._tag === "Failure" && refused.failure).toBeInstanceOf(NotFound);
  }, 60_000);

  it("refuses a credential scoped to another table, though the account is its DM", async () => {
    // Membership and credential scope narrow independently and both apply. Ada
    // is the DM of both campaigns; a credential minted for the second reaches
    // only the second.
    const scoped = scopedTo(fixture.dm, fixture.otherTable.id);

    const here = await roster(scoped, fixture.campaign.id);
    const there = await roster(scoped, fixture.otherTable.id);

    expect(here._tag).toBe("Failure");
    expect(there._tag).toBe("Success");
  }, 60_000);

  it("refuses a campaign that does not exist, the same way", async () => {
    const nothing = await roster(fixture.dm, crypto.randomUUID() as CampaignId);

    expect(nothing._tag).toBe("Failure");
  }, 60_000);

  it("gives the campaign's own DM the whole table", async () => {
    const mine = await roster(fixture.dm, fixture.campaign.id);

    expect(mine._tag).toBe("Success");
    expect(mine._tag === "Success" ? mine.success.map((member) => member.name) : []).toEqual([
      "Ada",
      "Ilse",
      "Marta",
    ]);
  }, 60_000);
});

describe("what a member row carries", () => {
  it("names the account, the role and when they joined, and nothing else", async () => {
    const listed = await roster(fixture.dm, fixture.campaign.id);
    const members = listed._tag === "Success" ? listed.success : [];

    // Four fields. A wider row here would be the place a leak lands, since
    // this is the one read in the product that is about *other people*.
    expect(Object.keys(members[0]!).sort()).toEqual(["accountId", "joinedAt", "name", "relation"]);

    expect(members.map((member) => member.relation)).toEqual(["creator", "player", "player"]);
    // `accountId` is the join key the whole party screen hangs off — it is what
    // `Character.accountId` is matched against, and what a write that assigns
    // one will name.
    expect(members.map((member) => member.accountId)).toEqual([
      fixture.dm.accountId,
      fixture.playing.accountId,
      fixture.seated.accountId,
    ]);
    // The DM's own row is the campaign's creation, so the roster is never
    // empty and there is always somebody to attribute the table to.
    expect(members[0]!.joinedAt).toBeDefined();
  }, 60_000);

  it("puts the DM first and then the order people arrived", async () => {
    // Ordered on the role explicitly rather than relying on the DM's row being
    // written first: it is today (`Campaigns.create` writes it in the campaign's
    // own transaction), and that is an accident of insert order rather than a
    // guarantee — a co-DM invited later must still sort above the players.
    const listed = await roster(fixture.dm, fixture.campaign.id);
    const members = listed._tag === "Success" ? listed.success : [];

    expect(members.map((member) => member.relation)[0]).toBe("creator");
    const joined = members.slice(1).map((member) => DateTime.toEpochMillis(member.joinedAt));
    expect([...joined].sort((a, b) => a - b)).toEqual(joined);
  }, 60_000);
});

describe("what the list leaves out", () => {
  it("drops a member whose invitation was revoked after they took it", async () => {
    // Revoking a spent invitation takes the membership back, and the roster is
    // live members only — every predicate in the product tests
    // `revoked_at is null`. A withdrawal is legible on the *invitation*, which
    // reads `revoked` and names who took it, so listing the dead row here would
    // be a second and worse answer to the same question.
    const gone = await runtime.runPromise(
      Effect.gen(function* () {
        const invites = yield* Invites;
        const campaign = yield* as(fixture.dm)(createCampaign({ name: "A table to leave" }));
        const guest = yield* aPlayerAt(campaign.id, "Pim");

        const creator = yield* asDm(fixture.dm, campaign.id);
        const before = yield* Effect.flatMap(Memberships, (memberships) =>
          memberships.list(creator),
        );
        const issued = yield* invites.listForCampaign(creator);
        yield* invites.revokeForCampaign(creator, issued[0]!.id);
        const after = yield* Effect.flatMap(Memberships, (memberships) =>
          memberships.list(creator),
        );

        return {
          before: before.map((member) => member.name),
          after: after.map((member) => member.name),
          guest: guest.accountId,
          // The invitation is still there and still says what happened.
          status: (yield* invites.listForCampaign(creator))[0]!.status,
        };
      }).pipe(Effect.orDie),
    );

    expect(gone.before).toEqual(["Ada", "Pim"]);
    expect(gone.after).toEqual(["Ada"]);
    expect(gone.status).toBe("revoked");
  }, 60_000);

  it("stops at this campaign, though the DM runs two", async () => {
    const here = await roster(fixture.dm, fixture.campaign.id);
    const there = await roster(fixture.dm, fixture.otherTable.id);

    expect(here._tag === "Success" ? here.success.length : 0).toBe(3);
    // The second table has only its DM — the proof carries the campaign, so
    // there is no id for the read to be pointed at the wrong one.
    expect(there._tag === "Success" ? there.success.map((member) => member.name) : []).toEqual([
      "Ada",
    ]);
  }, 60_000);
});

describe("the seat vocabulary, derived", () => {
  it("answers three of the drawn statuses from three shipped reads, and cannot answer the fourth", async () => {
    // The decision, exercised. `Party.jsx` draws `playing` / `no-character` /
    // `invited` / `open`; this is all four of them computed from the roster,
    // `invites.list` and `Party.list` — the live seats — with no fourth
    // source and no empty chair anywhere.
    const derived = await runtime.runPromise(
      Effect.gen(function* () {
        const dm = yield* asDm(fixture.dm, fixture.campaign.id);
        const members = yield* Effect.flatMap(Memberships, (m) => m.list(dm));
        const seats = yield* as(fixture.dm)(
          Effect.flatMap(Party, (party) => party.list(fixture.campaign.id)),
        );
        const invites = yield* Effect.flatMap(Invites, (i) => i.listForCampaign(dm));

        const owned = new Set(seats.map((row) => row.seat.accountId));
        const players = members.filter((member) => member.relation === "player");

        return {
          playing: players
            .filter((member) => owned.has(member.accountId))
            .map((member) => member.name),
          noCharacter: players
            .filter((member) => !owned.has(member.accountId))
            .map((member) => member.name),
          invited: invites
            .filter((invite) => invite.status === "live")
            .map((invite) => invite.label),
          // The subtitle the report replaces *"N of M seats"* with: what is
          // true, rather than a capacity nothing stores.
          subtitle: `${players.length} players, ${invites.filter((i) => i.status === "live").length} invitation outstanding`,
        };
      }).pipe(Effect.orDie),
    );

    expect(derived.playing).toEqual(["Ilse"]);
    expect(derived.noCharacter).toEqual(["Marta"]);
    expect(derived.invited).toEqual(["Pell"]);
    expect(derived.subtitle).toBe("2 players, 1 invitation outstanding");
  }, 60_000);

  it("has nowhere to put an empty chair", async () => {
    // The negative half, and the reason it is a schema property rather than a
    // convention: a membership cannot precede the account it names, and a
    // seat cannot either — `account_id` is `not null` and a real foreign key
    // on both `campaign_member` and `campaign_character`. So *"Add seat"* is
    // not a button somebody declined to build, it is one with nothing behind
    // it: every chair the roster can draw has a person in it.
    const nullable = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql<{
          readonly table_name: string;
          readonly is_nullable: string;
        }>`
          select table_name, is_nullable from information_schema.columns
          where table_name in ('campaign_member', 'campaign_character')
            and column_name = 'account_id'
          order by table_name
        `;
        return rows.map((row) => `${row.table_name}:${row.is_nullable}`);
      }).pipe(Effect.orDie),
    );

    expect(nullable).toEqual(["campaign_character:NO", "campaign_member:NO"]);
  }, 60_000);
});
