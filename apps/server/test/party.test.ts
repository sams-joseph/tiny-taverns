import { type Actor, type Campaign, CurrentActor, NotFound } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Characters } from "../src/repo/Characters.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Memberships } from "../src/repo/Memberships.js";
import { Party } from "../src/repo/Party.js";
import {
  aCharacterAt,
  accountWide,
  admittedTo,
  anAccount,
  aPlayerAt,
  asDm,
  createCampaign,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The party: seats over shared characters, and the continuity decision they
 * implement.
 *
 * The captain's decision of 2026-09-01 inverted the old architecture's
 * isolation test: a character is **one** account-owned row of playable state,
 * and a campaign holds a *join* to it, never a fork. So the flagship
 * assertions here are the inverted §10 pair —
 *
 * - **damage taken at one table IS visible at every other table** that seats
 *   the same character (`shared state across campaigns` below), and
 * - **history stays immutable by snapshot**, not by freezing the character:
 *   the seat's `display_name` survives a rename, and a retired seat survives
 *   everything.
 *
 * The rest is the seat contract: who may seat, share, retire and damage — the
 * old campaign-scoped character's authority model, moved onto the row the
 * campaign actually owns.
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Groups.layer,
    Characters.layer,
    Party.layer.pipe(Layer.provide(LiveEvents.layer)),
    Invites.layer,
    Memberships.layer,
    CampaignCreatorActors.layer,
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_party"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * Two shared tables in two different groups, with Pim a player at both — the
 * smallest world in which "state carries across campaigns" is measurable at
 * all. Marta plays only at the Salt Road; Fen runs the Hag's Bargain and is a
 * stranger to the Salt Road.
 */
const makeFixture = Effect.gen(function* () {
  const jo = yield* anAccount("Jo");
  const saltRoad = yield* withActor(jo)(
    createCampaign({ name: "The Salt Road", visibility: "shared" }),
  );
  const pim = yield* aPlayerAt(saltRoad.id, "Pim");
  const marta = yield* aPlayerAt(saltRoad.id, "Marta");

  const fen = yield* anAccount("Fen");
  const hagsBargain = yield* withActor(fen)(
    createCampaign({ name: "The Hag's Bargain", visibility: "shared" }),
  );
  // The same person, admitted to the second table — one account, two
  // participations, which is the world the continuity decision is about.
  const pimThere = yield* admittedTo(hagsBargain.id, pim, "Pim, again");

  return { jo, pim, marta, fen, saltRoad, hagsBargain, pimThere };
});

interface Fixture {
  readonly jo: Actor;
  readonly pim: Actor;
  readonly marta: Actor;
  readonly fen: Actor;
  readonly saltRoad: Campaign;
  readonly hagsBargain: Campaign;
  /** The same person as `pim`, seated at the other table. */
  readonly pimThere: Actor;
}

let fixture: Fixture;
beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run: <A, E>(effect: Effect.Effect<A, E, any>) => Promise<A> = (effect) =>
  runtime.runPromise(effect as never);

const expectNotFound = (refused: unknown, resource: string) => {
  expect(refused).toBeInstanceOf(NotFound);
  expect((refused as NotFound).resource).toBe(resource);
};

/** A fresh character of the given owner's, seated at the given table. */
const seated = (
  campaignId: Campaign["id"],
  owner: Actor,
  name: string,
  extra?: { readonly hpMax?: number; readonly seatVisibility?: "dm" | "shared" },
) =>
  aCharacterAt(
    campaignId,
    owner,
    { name, hpMax: extra?.hpMax ?? 20 },
    { seatVisibility: extra?.seatVisibility },
  );

describe("the roster", () => {
  it("answers the creator every live seat, character and all", async () => {
    const { character } = await run(
      seated(fixture.saltRoad.id, fixture.pim, "Brannoc", { hpMax: 52 }),
    );
    const seatsForJo = await run(
      withActor(fixture.jo)(Effect.flatMap(Party, (party) => party.list(fixture.saltRoad.id))),
    );
    const brannoc = seatsForJo.find((seat) => seat.character?.id === character.id);
    expect(brannoc).toBeDefined();
    expect(brannoc!.seat.displayName).toBe("Brannoc");
    expect(brannoc!.seat.visibility).toBe("dm");
    expect(brannoc!.character?.hpMax).toBe(52);
  });

  it("hides another player's dm seat and shows your own, like every row here", async () => {
    const mine = await run(seated(fixture.saltRoad.id, fixture.pim, "Quiet Own"));
    const theirs = await run(seated(fixture.saltRoad.id, fixture.marta, "Quiet Theirs"));
    const shared = await run(
      seated(fixture.saltRoad.id, fixture.marta, "Loud Theirs", { seatVisibility: "shared" }),
    );

    const forPim = await run(
      withActor(fixture.pim)(Effect.flatMap(Party, (party) => party.list(fixture.saltRoad.id))),
    );
    const ids = forPim.map((seat) => seat.seat.id);
    expect(ids).toContain(mine.seatId);
    expect(ids).toContain(shared.seatId);
    expect(ids).not.toContain(theirs.seatId);
  });

  it("is a 404 for a stranger, naming the campaign", async () => {
    const refused = await run(
      withActor(fixture.fen)(
        Effect.flatMap(Party, (party) => party.list(fixture.saltRoad.id)),
      ).pipe(Effect.flip),
    );
    expectNotFound(refused, "campaign");
  });
});

describe("seating", () => {
  it("seats the owner's own character and snapshots the display name", async () => {
    const { character } = await run(seated(fixture.saltRoad.id, fixture.pim, "Snap"));
    // Rename after seating: the seat keeps the campaign's word for them.
    await run(
      withActor(fixture.pim)(
        Effect.flatMap(Characters, (characters) =>
          characters.updateOwn(character.id, { name: "Renamed Entirely" }),
        ),
      ),
    );
    const seats = await run(
      withActor(fixture.jo)(Effect.flatMap(Party, (party) => party.list(fixture.saltRoad.id))),
    );
    const seat = seats.find((row) => row.character?.id === character.id);
    expect(seat!.seat.displayName).toBe("Snap");
    expect(seat!.character?.name).toBe("Renamed Entirely");
  });

  it("answers a double join with the same seat", async () => {
    const { character, seatId } = await run(seated(fixture.saltRoad.id, fixture.pim, "Twice"));
    const again = await run(
      withActor(fixture.pim)(
        Effect.flatMap(Party, (party) =>
          party.join(fixture.saltRoad.id, { characterId: character.id }),
        ),
      ),
    );
    expect(again.seat.id).toBe(seatId);
  });

  it("refuses to seat somebody else's character, with the ordinary NotFound", async () => {
    const { character } = await run(seated(fixture.saltRoad.id, fixture.pim, "Not Yours"));
    const refused = await run(
      withActor(fixture.marta)(
        Effect.flatMap(Party, (party) =>
          party.join(fixture.saltRoad.id, { characterId: character.id }),
        ),
      ).pipe(Effect.flip),
    );
    expectNotFound(refused, "character");
  });

  it("lets the creator seat a character of their own — a creator is a player too", async () => {
    const { seatId } = await run(seated(fixture.saltRoad.id, fixture.jo, "Fen's Ferryman"));
    const seats = await run(
      withActor(fixture.jo)(Effect.flatMap(Party, (party) => party.list(fixture.saltRoad.id))),
    );
    expect(seats.map((seat) => seat.seat.id)).toContain(seatId);
  });
});

describe("the seat PATCH", () => {
  it("is the creator's: sharing a seat, and only campaign facts move", async () => {
    const { character, seatId } = await run(seated(fixture.saltRoad.id, fixture.pim, "Shareable"));
    const updated = await run(
      withActor(fixture.jo)(
        Effect.flatMap(Party, (party) =>
          party.update(fixture.saltRoad.id, seatId, {
            visibility: "shared",
            playerDisplayName: "Pim of the Reeds",
          }),
        ),
      ),
    );
    expect(updated.seat.visibility).toBe("shared");
    expect(updated.seat.playerDisplayName).toBe("Pim of the Reeds");
    // The shared character did not move: the PATCH is about the seat.
    expect(updated.character?.name).toBe("Shareable");
    expect(updated.character?.id).toBe(character.id);
  });

  it("refuses the seat's own player, even on their own seat", async () => {
    const { seatId } = await run(seated(fixture.saltRoad.id, fixture.pim, "Not A Lever"));
    const refused = await run(
      withActor(fixture.pim)(
        Effect.flatMap(Party, (party) =>
          party.update(fixture.saltRoad.id, seatId, { visibility: "shared" }),
        ),
      ).pipe(Effect.flip),
    );
    expectNotFound(refused, "campaign_character");
  });

  it("writes conditions through to the shared character", async () => {
    const { character, seatId } = await run(seated(fixture.saltRoad.id, fixture.pim, "Poisoned"));
    await run(
      withActor(fixture.jo)(
        Effect.flatMap(Party, (party) =>
          party.update(fixture.saltRoad.id, seatId, { conditions: ["Poisoned"] }),
        ),
      ),
    );
    const mine = await run(
      withActor(fixture.pim)(Effect.flatMap(Characters, (characters) => characters.mine)),
    );
    const row = mine.find((owned) => owned.character.id === character.id);
    expect(row?.character.conditions).toEqual(["Poisoned"]);
  });
});

describe("retiring a seat", () => {
  const listIds = (viewer: Actor, campaignId: Campaign["id"]) =>
    run(
      withActor(viewer)(
        Effect.map(
          Effect.flatMap(Party, (party) => party.list(campaignId)),
          (seats) => seats.map((seat) => seat.seat.id),
        ),
      ),
    );

  it("lets the owner leave, keeps the character, and a rejoin is a new seat", async () => {
    const { character, seatId } = await run(seated(fixture.saltRoad.id, fixture.pim, "Leaver"));
    await run(
      withActor(fixture.pim)(
        Effect.flatMap(Party, (party) => party.leave(fixture.saltRoad.id, seatId)),
      ),
    );
    expect(await listIds(fixture.jo, fixture.saltRoad.id)).not.toContain(seatId);

    // The shared character is untouched by leaving a table.
    const mine = await run(
      withActor(fixture.pim)(Effect.flatMap(Characters, (characters) => characters.mine)),
    );
    expect(mine.some((owned) => owned.character.id === character.id)).toBe(true);

    const rejoined = await run(
      withActor(fixture.pim)(
        Effect.flatMap(Party, (party) =>
          party.join(fixture.saltRoad.id, { characterId: character.id }),
        ),
      ),
    );
    expect(rejoined.seat.id).not.toBe(seatId);
  });

  it("lets the creator clear any seat, and refuses another player", async () => {
    const { seatId } = await run(seated(fixture.saltRoad.id, fixture.pim, "Cleared"));
    const refused = await run(
      withActor(fixture.marta)(
        Effect.flatMap(Party, (party) => party.leave(fixture.saltRoad.id, seatId)),
      ).pipe(Effect.flip),
    );
    expectNotFound(refused, "campaign_character");

    await run(
      withActor(fixture.jo)(
        Effect.flatMap(Party, (party) => party.leave(fixture.saltRoad.id, seatId)),
      ),
    );
    expect(await listIds(fixture.jo, fixture.saltRoad.id)).not.toContain(seatId);
  });

  it("retires the seats when a participation is revoked, in the same transaction", async () => {
    const guestActor = await run(aPlayerAt(fixture.saltRoad.id, "Guest"));
    const { character, seatId } = await run(seated(fixture.saltRoad.id, guestActor, "Guest's Own"));
    await run(
      Effect.gen(function* () {
        const memberships = yield* Memberships;
        const proof = yield* asDm(fixture.jo, fixture.saltRoad.id);
        yield* memberships.remove(proof, guestActor.accountId);
      }),
    );
    expect(await listIds(fixture.jo, fixture.saltRoad.id)).not.toContain(seatId);
    // The character itself is the guest's and survives whole.
    // Their account-wide credential: the campaign-scoped one just lost its
    // reach with the membership, which is the revocation working.
    const mine = await run(
      withActor(accountWide(guestActor))(
        Effect.flatMap(Characters, (characters) => characters.mine),
      ),
    );
    const owned = mine.find((row) => row.character.id === character.id);
    expect(owned).toBeDefined();
    expect(owned!.seats).toEqual([]);
  });
});

describe("shared state across campaigns — the continuity decision", () => {
  it("shows damage taken at one table at the other, because there is one character", async () => {
    // Pim writes one character down at the Salt Road and carries the same
    // character to the Hag's Bargain — a join, not a copy.
    const { character } = await run(
      seated(fixture.saltRoad.id, fixture.pim, "Brannoc Duskharrow", { hpMax: 40 }),
    );
    const bargainSeat = await run(
      withActor(fixture.pimThere)(
        Effect.flatMap(Party, (party) =>
          party.join(fixture.hagsBargain.id, { characterId: character.id }),
        ),
      ),
    );

    // Fen's table hurts them...
    const afterFen = await run(
      withActor(fixture.fen)(
        Effect.flatMap(Party, (party) =>
          party.damage(fixture.hagsBargain.id, bargainSeat.seat.id, { amount: 7 }),
        ),
      ),
    );
    expect(afterFen.hpCurrent).toBe(33);

    // ...and Jo's table reads the wound. This is the report's §10 test,
    // inverted on the captain's instruction: the old architecture asserted the
    // other campaign was unchanged, and that assertion is now the defect.
    const atSaltRoad = await run(
      withActor(fixture.jo)(Effect.flatMap(Party, (party) => party.list(fixture.saltRoad.id))),
    );
    const seat = atSaltRoad.find((row) => row.character?.id === character.id);
    expect(seat?.character?.hpCurrent).toBe(33);

    // Two tables' deltas total, because the clamp is atomic in SQL and there
    // is exactly one row to clamp.
    await run(
      withActor(fixture.jo)(
        Effect.flatMap(Party, (party) =>
          party.damage(fixture.saltRoad.id, seat!.seat.id, { amount: 5 }),
        ),
      ),
    );
    const back = await run(
      withActor(fixture.pimThere)(
        Effect.flatMap(Party, (party) => party.list(fixture.hagsBargain.id)),
      ),
    );
    const bargainView = back.find((row) => row.seat.id === bargainSeat.seat.id);
    expect(bargainView?.character?.hpCurrent).toBe(28);
  });

  it("carries a level-up typed between games to every table", async () => {
    const { character } = await run(
      seated(fixture.saltRoad.id, fixture.pim, "Riser", { hpMax: 18 }),
    );
    await run(
      withActor(fixture.pimThere)(
        Effect.flatMap(Party, (party) =>
          party.join(fixture.hagsBargain.id, { characterId: character.id }),
        ),
      ),
    );
    await run(
      withActor(fixture.pim)(
        Effect.flatMap(Characters, (characters) =>
          characters.updateOwn(character.id, { level: 6, className: "Paladin" }),
        ),
      ),
    );
    const there = await run(
      withActor(fixture.fen)(Effect.flatMap(Party, (party) => party.list(fixture.hagsBargain.id))),
    );
    const seat = there.find((row) => row.character?.id === character.id);
    expect(seat?.character?.level).toBe(6);
    expect(seat?.character?.descriptor).toBe("Level 6 Paladin");
  });

  it("keeps a delta inside the campaign that made it: no seat, no reach", async () => {
    // Fen never seats this one, so Fen's table has no live claim on it: a
    // damage id from another table's seat is the ordinary NotFound.
    const { seatId } = await run(seated(fixture.saltRoad.id, fixture.pim, "Unreachable"));
    const refused = await run(
      withActor(fixture.fen)(
        Effect.flatMap(Party, (party) =>
          party.damage(fixture.hagsBargain.id, seatId, { amount: 3 }),
        ),
      ).pipe(Effect.flip),
    );
    expectNotFound(refused, "campaign_character");
  });
});

describe("what deleting a character leaves standing", () => {
  it("retires the seats and keeps the shared row's history out of them", async () => {
    const { character, seatId } = await run(
      seated(fixture.saltRoad.id, fixture.pim, "Doomed", { hpMax: 12 }),
    );
    await run(
      withActor(fixture.pim)(
        Effect.flatMap(Characters, (characters) => characters.removeOwn(character.id)),
      ),
    );
    // Gone from the roster — retired, in the delete's own transaction.
    const seats = await run(
      withActor(fixture.jo)(Effect.flatMap(Party, (party) => party.list(fixture.saltRoad.id))),
    );
    expect(seats.map((seat) => seat.seat.id)).not.toContain(seatId);

    // The seat row survives as campaign history, with the pointer nulled and
    // the display snapshot intact — losing the character must not rewrite who
    // sat here.
    const rows = await run(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql<{
          readonly display_name: string;
          readonly character_id: string | null;
          readonly left_at: Date | null;
        }>`
          select display_name, character_id, left_at from campaign_character
          where id = ${seatId}
        `,
      ),
    );
    expect(rows[0]?.display_name).toBe("Doomed");
    expect(rows[0]?.character_id).toBeNull();
    expect(rows[0]?.left_at).not.toBeNull();
  });
});
