import { type Actor, type CharacterSheet, CurrentActor, type OwnedCharacter } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
import {
  aCharacterAt,
  accountWide,
  admittedTo,
  anAccount,
  aPlayerAt,
  createCampaign,
  scopedTo,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * `GET /me/characters` — everything an account owns, with everywhere each
 * character sits.
 *
 * Under the continuity decision of 2026-09-01 this read changed meaning, and
 * the file pins the change rather than the old shape. It used to be a
 * *narrowing* of campaign reads — your rows, minus everything the campaign
 * seam refused — so a revoked membership, an unshared campaign and a
 * mis-scoped credential each took characters out of the answer. **All three
 * of those are deliberately inverted now.** A character is account-owned and
 * campaign-scoped nowhere: `ownCharacter` is the whole predicate, so the list
 * is ownership and nothing else, and what the campaign seam still governs is
 * the *seats* — which retire when a membership goes, and which are the only
 * thing a table's master toggle has any purchase on.
 *
 * The one narrowing that survives is the one that was always about ownership:
 * somebody else's character at a table you share is still not yours.
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Groups.layer,
    Characters.layer,
    Party.layer.pipe(Layer.provide(LiveEvents.layer)),
    Invites.layer,
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_my_characters"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run: <A, E>(effect: Effect.Effect<A, E, any>) => Promise<A> = (effect) =>
  runtime.runPromise(effect as never);

/**
 * Two hosts, three tables, and Ilse at all three — one account, several
 * participations, which is the state this endpoint exists to answer. Kofi is
 * the second player at the Salt Road, so "not somebody else's" is measured
 * against a row that really exists and belongs to a real member. The guest is
 * written in and then revoked *in the fixture*, so their state — an account
 * admitted nowhere that still owns a character — is a stable fact rather than
 * a mid-suite mutation.
 */
const makeFixture = Effect.gen(function* () {
  const invites = yield* Invites;

  const jo = yield* anAccount("Jo");
  const fen = yield* anAccount("Fen");
  const ilse = yield* anAccount("Ilse");
  const asJo = withActor(jo);
  const asFen = withActor(fen);

  const saltRoad = yield* asJo(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  const sixpence = yield* asFen(
    createCampaign({ name: "Salt and Sixpence", visibility: "shared" }),
  );
  // Shared for now, so Ilse can be seated; one test below unshares it.
  const marsh = yield* asJo(createCampaign({ name: "The Marsh", visibility: "shared" }));

  yield* admittedTo(saltRoad.id, ilse, "Ilse");
  yield* admittedTo(sixpence.id, ilse, "Ilse again");
  yield* admittedTo(marsh.id, ilse, "Ilse in the marsh");
  const kofi = yield* aPlayerAt(saltRoad.id, "Kofi");

  const brannoc = yield* aCharacterAt(saltRoad.id, ilse, { name: "Brannoc" });
  const sorrel = yield* aCharacterAt(sixpence.id, ilse, { name: "Sorrel Ash" });
  const mott = yield* aCharacterAt(marsh.id, ilse, { name: "Mott" });
  const wren = yield* aCharacterAt(saltRoad.id, kofi, { name: "Wren" });
  // The host plays one of their own, which is what makes a creator's `mine` a
  // narrowing rather than an empty list.
  const pell = yield* aCharacterAt(saltRoad.id, jo, { name: "Sister Pell" });

  // The guest: at the table long enough to write a character down, then
  // removed — through the shipped path, by withdrawing the invitation that
  // admitted them, which retires their seats in the same transaction.
  const guest = yield* aPlayerAt(saltRoad.id, "Guest");
  const guestsOwn = yield* aCharacterAt(saltRoad.id, guest, { name: "Guest's Own" });
  const issued = yield* asJo(invites.list(saltRoad.groupId));
  const guestInvite = issued.find((invite) => invite.label === "Guest");
  yield* asJo(invites.revoke(saltRoad.groupId, guestInvite!.id));

  return {
    jo,
    fen,
    ilse,
    kofi,
    guest,
    saltRoad,
    sixpence,
    marsh,
    brannoc,
    sorrel,
    mott,
    wren,
    pell,
    guestsOwn,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;
let characters: (typeof Characters)["Service"];
let party: (typeof Party)["Service"];

beforeAll(async () => {
  fixture = await run(makeFixture);
  characters = await run(Characters);
  party = await run(Party);
}, 60_000);

const mine = (actor: Actor): Promise<ReadonlyArray<OwnedCharacter>> =>
  run(withActor(actor)(characters.mine));

const names = (owned: ReadonlyArray<OwnedCharacter>): ReadonlyArray<string> =>
  owned.map((row) => row.character.name).sort();

describe("what an account's own list is", () => {
  it("answers their characters across every table, with seats as the join keys", async () => {
    const owned = await mine(fixture.ilse);
    expect(names(owned)).toEqual(["Brannoc", "Mott", "Sorrel Ash"]);

    // The seat carries the campaign id and nothing more: the campaign's
    // *name* comes from `GET /me/campaigns`, because a name here would be a
    // second answer to what a campaign is called.
    const brannoc = owned.find((row) => row.character.id === fixture.brannoc.character.id);
    expect(brannoc?.seats.map((seat) => seat.campaignId)).toEqual([fixture.saltRoad.id]);
    expect(brannoc?.seats[0]?.campaignCharacterId).toBe(fixture.brannoc.seatId);
  });

  it("answers the whole row, and the row has no visibility on it", async () => {
    const brannoc = (await mine(fixture.ilse)).find(
      (row) => row.character.id === fixture.brannoc.character.id,
    );
    expect(brannoc?.character.accountId).toBe(fixture.ilse.accountId);
    expect(brannoc?.character.sheet).toEqual({ notes: "", abilities: [], traits: [] });
    // Who at a table may see the character is the *seat's* question now, per
    // campaign; the shared row deliberately carries no toggle of its own, and
    // the wire says so.
    expect("visibility" in brannoc!.character).toBe(false);
  });

  it("is empty for an account that owns nothing, rather than a failure", async () => {
    const nobody = await run(anAccount("Nobody"));
    expect(await mine(nobody)).toEqual([]);
  });

  it("does not answer somebody else's character at a table they share", async () => {
    // Kofi's Wren is a real row, at a table Ilse really sits at, and it is
    // not hers — the one old narrowing that survives, because it was always
    // about ownership.
    const owned = await mine(fixture.ilse);
    expect(owned.map((row) => row.character.id)).not.toContain(fixture.wren.character.id);
    expect(names(await mine(fixture.kofi))).toEqual(["Wren"]);
  });
});

describe("characters outlive tables", () => {
  it("keeps a character in the list when the membership that seated it is revoked", async () => {
    // **Deliberately inverted.** The old file pinned that revoking the
    // membership took the character out of `mine`; under the continuity
    // decision the character is the account's, and what the revocation takes
    // is the *seat* — retired in the same transaction, so the table's history
    // keeps the line and the campaign loses its live claim.
    const guestsList = await mine(accountWide(fixture.guest));
    const guestsOwn = guestsList.find((row) => row.character.id === fixture.guestsOwn.character.id);
    expect(guestsOwn).toBeDefined();
    expect(guestsOwn!.seats).toEqual([]);

    // And the seat row still stands, retired — campaign history, not a hole.
    const seatRows = await run(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql<{ readonly left_at: Date | null; readonly display_name: string }>`
          select left_at, display_name from campaign_character
          where id = ${fixture.guestsOwn.seatId}
        `,
      ),
    );
    expect(seatRows[0]?.left_at).not.toBeNull();
    expect(seatRows[0]?.display_name).toBe("Guest's Own");
  });

  it("keeps the list whole when a table is unshared — the toggle governs seats, not sheets", async () => {
    // **Deliberately inverted.** The master toggle used to keep a player out
    // of their own character; it now has no purchase on `mine` at all,
    // because the read composes no campaign predicate. What it still gates is
    // everything campaign-side: the party read at the unshared table refuses
    // the same player it always refused.
    await run(
      withActor(fixture.jo)(
        Effect.flatMap(Campaigns, (campaigns) =>
          campaigns.update(fixture.marsh.id, { visibility: "dm" }),
        ),
      ),
    );

    const owned = await mine(fixture.ilse);
    const mott = owned.find((row) => row.character.id === fixture.mott.character.id);
    expect(mott).toBeDefined();
    // The seat ref stays too: that Ilse sits at the Marsh is a fact she made
    // by redeeming its invitation, not a disclosure the toggle guards.
    expect(mott!.seats.map((seat) => seat.campaignId)).toEqual([fixture.marsh.id]);

    const partyRead = await run(
      withActor(fixture.ilse)(party.list(fixture.marsh.id)).pipe(Effect.result),
    );
    expect(partyRead._tag).toBe("Failure");

    await run(
      withActor(fixture.jo)(
        Effect.flatMap(Campaigns, (campaigns) =>
          campaigns.update(fixture.marsh.id, { visibility: "shared" }),
        ),
      ),
    );
  });

  it("is not narrowed by a campaign-scoped credential", async () => {
    // **Deliberately inverted**, and pinned in `characters.test.ts` from the
    // service side; this is the endpoint-shaped half. The old per-table
    // narrowing was a scope clause in a campaign-scoped predicate; `mine` is
    // campaign-scoped nowhere, and `ownCharacter` mirrors
    // `libraryRowReadable`'s written reasoning — scope says which campaign a
    // credential reaches, and there is none here for it to be about.
    const scoped = scopedTo(fixture.ilse, fixture.saltRoad.id);
    expect(names(await mine(scoped))).toEqual(["Brannoc", "Mott", "Sorrel Ash"]);
  });
});

describe("a creator's own list is narrower than the table they run", () => {
  it("answers the characters they own, not the party they can read", async () => {
    // Jo reads every live seat at the Salt Road through the party — and owns
    // exactly one of the characters behind them. A `mine` written as
    // `readable OR mine` would answer the whole table here and look correct
    // doing it.
    const seats = await run(withActor(fixture.jo)(party.list(fixture.saltRoad.id)));
    expect(seats.map((seat) => seat.seat.displayName).sort()).toEqual([
      "Brannoc",
      "Sister Pell",
      "Wren",
    ]);
    expect(names(await mine(fixture.jo))).toEqual(["Sister Pell"]);
  });
});

/**
 * The full sheet the kit draws — `ui_kits/dm-screen/player-data.js`'s `sheet`,
 * mapped onto the document. Written out rather than generated, because the
 * point of the test is that every section of the drawing has somewhere to
 * land. Written by **the owner** now: the sheet is theirs, and the old DM-side
 * write it used to arrive through no longer exists.
 */
const brannocsSheet: CharacterSheet = {
  notes: "The temple on the salt road takes in what the road leaves behind.",
  identity: {
    subclass: "Oath of the Open Road",
    background: "Temple foundling",
    alignment: "Lawful neutral",
    speed: "30 ft.",
    initiative: "+1",
    proficiency: "+3",
    hitDice: "3/5 d10",
    xp: 6500,
    xpNext: 14_000,
  },
  abilities: [
    { label: "STR", score: "18", modifier: "+4", save: "+7", proficient: true },
    { label: "DEX", score: "12", modifier: "+1", save: "+1", proficient: false },
    { label: "CHA", score: "16", modifier: "+3", save: "+6", proficient: true },
  ],
  skills: [
    { name: "Athletics", ability: "STR", bonus: "+7", proficient: true },
    { name: "Arcana", ability: "INT", bonus: "-1", proficient: false },
  ],
  proficiencies: ["All armour", "Shields", "Orcish", "Smith's tools"],
  attacks: [
    { name: "Halberd", text: "Slashing", dice: "1d10+4", hit: "+7", note: "Reach 10 ft." },
    {
      name: "Divine Smite",
      text: "Radiant",
      dice: "2d8",
      hit: "—",
      note: "On hit, expend a slot.",
    },
  ],
  spellcasting: {
    ability: "CHA",
    save: "14",
    attack: "+6",
    slots: [
      { level: 1, used: 1, total: 4 },
      { level: 2, used: 0, total: 2 },
    ],
    known: [
      { name: "Bless", level: 1, note: "Concentration · 1 min", prepared: true },
      { name: "Find Steed", level: 2, note: "Ritual · 10 min", prepared: false },
    ],
  },
  traits: [
    {
      name: "Lay on Hands",
      text: "Touch a creature and restore hit points from the pool.",
      note: "25 hp pool · 15 remaining",
    },
    { name: "Extra Attack", text: "Attack twice when you take the Attack action." },
  ],
  inventory: [
    { name: "Chain mail", quantity: 1, weight: "55 lb", equipped: true },
    { name: "Ferryman's token, unspent", quantity: 1, weight: "—", note: "From session 11" },
  ],
  currency: { pp: 0, gp: 84, ep: 0, sp: 12, cp: 40 },
  deathSaves: { successes: 0, failures: 0 },
  levelUps: [{ level: 5, session: 10, note: "Extra Attack. Took Oath of the Open Road." }],
  journal: [{ session: 11, text: "The ferryman took the coin and gave back a token." }],
  story: {
    personality: "Answers questions slower than people expect.",
    ideal: "A road is a promise between two towns.",
    bond: "The temple's road marker.",
    flaw: "He cannot let a debt stand.",
  },
};

describe("the document the sheet draws from", () => {
  it("carries every drawn section through a round trip unchanged", async () => {
    await run(
      withActor(fixture.ilse)(
        characters.updateOwn(fixture.brannoc.character.id, { sheet: brannocsSheet }),
      ),
    );
    const brannoc = (await mine(fixture.ilse)).find(
      (row) => row.character.id === fixture.brannoc.character.id,
    );
    // `jsonb` does not preserve key order and does not need to; the value is
    // what the sheet reads.
    expect(brannoc?.character.sheet).toEqual(brannocsSheet);
  });

  it("still reads a row written with no sheet at all", async () => {
    // The whole growth is optional keys on one `jsonb` column: `sorrel` was
    // created with none and decodes to the same empty document it always did.
    const sorrel = (await mine(fixture.ilse)).find(
      (row) => row.character.id === fixture.sorrel.character.id,
    );
    expect(sorrel?.character.sheet).toEqual({ notes: "", abilities: [], traits: [] });
  });
});
