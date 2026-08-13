import {
  type AccountId,
  Actor,
  type Campaign,
  type CampaignId,
  type Character,
  type CharacterSheet,
  CurrentActor,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Invites } from "../src/repo/Invites.js";
import { anAccount, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * `GET /me/characters` — the one read on `character` that names no campaign.
 *
 * The endpoint is a **narrowing**, not a reach: `ownRowReadable` is
 * `ownedRowReadable` conjoined with ownership, so the interesting question is
 * not "what does it open" but "does anything the seam already refuses survive
 * the loss of a campaign in the path". Four things could have, and each is a
 * section below — a campaign never joined, a campaign left, a credential minted
 * for another table, and a campaign the DM has not shared.
 *
 * The fifth section is the other half of the narrowing: a DM reading their own
 * `mine` gets the characters *assigned to them* and not the tableful they can
 * read through `characters.list`. That is the direction a predicate written as a
 * disjunction rather than a conjunction would have got wrong.
 *
 * The last section is the document. The sheet grew about thirty optional keys
 * and no columns, so the thing worth pinning is that a full sheet survives a
 * round trip byte for byte and that a row written before any of it still reads.
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
    Invites.layer,
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_my_characters"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * Puts an existing account at a table, through the shipped path.
 *
 * `support/actors.ts`'s `aPlayerAt` mints a fresh account each time, which is
 * right for every other file and wrong for this one: the whole subject here is
 * **one** account at more than one table, which is the state the role switch
 * depends on and the state a cross-campaign read is about. So the invitation is
 * minted and redeemed the same way, with the account supplied.
 */
const admit = (
  dm: Actor,
  campaignId: CampaignId,
  account: Actor,
): Effect.Effect<void, never, Invites> =>
  Effect.gen(function* () {
    const invites = yield* Invites;
    const issued = yield* withActor(dm)(invites.create(campaignId, { label: "a player" }));
    yield* withActor(account)(invites.redeem(issued.token));
  }).pipe(Effect.orDie);

/**
 * Two DMs, three shared tables and one the DM never shared.
 *
 * Ilse plays at two of them and has a character at each; she was never invited
 * to the third, and the fourth is hers but unshared. Kofi is the second player
 * at Ilse's first table, so "not somebody else's" is measured against a row that
 * really exists and really belongs to a real member.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const characters = yield* Characters;

  const jo = yield* anAccount("Jo");
  const fen = yield* anAccount("Fen");
  const ilse = yield* anAccount("Ilse");
  const kofi = yield* anAccount("Kofi");

  const asJo = withActor(jo);
  const asFen = withActor(fen);

  const saltRoad = yield* asJo(campaigns.create({ name: "The Salt Road", visibility: "shared" }));
  const sixpence = yield* asFen(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );
  // Jo runs this one too and Ilse was never invited to it.
  const ferry = yield* asJo(campaigns.create({ name: "The Ferry", visibility: "shared" }));
  // Ilse *is* a member here, and Jo has not shared it. The master toggle is the
  // whole of this campaign's job.
  const marsh = yield* asJo(campaigns.create({ name: "The Marsh" }));

  yield* admit(jo, saltRoad.id, ilse);
  yield* admit(jo, saltRoad.id, kofi);
  yield* admit(fen, sixpence.id, ilse);
  yield* admit(jo, marsh.id, ilse);

  // Every character starts `dm`, which is `CharacterDialog`'s fail-closed
  // default and therefore the state a player's own screen has to work in.
  const brannoc = yield* asJo(characters.create(saltRoad.id, { name: "Brannoc" }));
  const wren = yield* asJo(characters.create(saltRoad.id, { name: "Wren" }));
  const pell = yield* asJo(characters.create(saltRoad.id, { name: "Sister Pell" }));
  const sorrel = yield* asFen(characters.create(sixpence.id, { name: "Sorrel Ash" }));
  const kes = yield* asJo(characters.create(ferry.id, { name: "Kes" }));
  const mott = yield* asJo(characters.create(marsh.id, { name: "Mott" }));

  yield* asJo(characters.assign(saltRoad.id, brannoc.id, { accountId: ilse.accountId }));
  yield* asJo(characters.assign(saltRoad.id, wren.id, { accountId: kofi.accountId }));
  // The DM plays one of their own, which is what makes the DM's `mine` a
  // narrowing rather than an empty list.
  yield* asJo(characters.assign(saltRoad.id, pell.id, { accountId: jo.accountId }));
  yield* asFen(characters.assign(sixpence.id, sorrel.id, { accountId: ilse.accountId }));
  yield* asJo(characters.assign(marsh.id, mott.id, { accountId: ilse.accountId }));
  // `kes` is deliberately left unassigned.

  return {
    jo,
    fen,
    ilse,
    kofi,
    saltRoad,
    sixpence,
    ferry,
    marsh,
    brannoc,
    wren,
    pell,
    sorrel,
    kes,
    mott,
  };
});

interface Fixture {
  readonly jo: Actor;
  readonly fen: Actor;
  readonly ilse: Actor;
  readonly kofi: Actor;
  readonly saltRoad: Campaign;
  readonly sixpence: Campaign;
  readonly ferry: Campaign;
  readonly marsh: Campaign;
  readonly brannoc: Character;
  readonly wren: Character;
  readonly pell: Character;
  readonly sorrel: Character;
  readonly kes: Character;
  readonly mott: Character;
}

let fixture: Fixture;

const mine = (actor: Actor): Promise<ReadonlyArray<Character>> =>
  runtime.runPromise(Effect.flatMap(Characters, (characters) => withActor(actor)(characters.mine)));

const names = (characters: ReadonlyArray<Character>): ReadonlyArray<string> =>
  characters.map((character) => character.name).sort();

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture.pipe(Effect.orDie));
}, 30_000);

describe("what a player's own list is", () => {
  it("returns their characters across every table they are at", async () => {
    const characters = await mine(fixture.ilse);
    expect(names(characters)).toEqual(["Brannoc", "Sorrel Ash"]);
    // Two campaigns, and the row says which — `campaignId` is the join key the
    // screen matches against `GET /me/campaigns`, because a campaign's *name*
    // here would be a second answer to what a campaign is called.
    expect(new Set(characters.map((character) => character.campaignId))).toEqual(
      new Set([fixture.saltRoad.id, fixture.sixpence.id]),
    );
  });

  it("answers the whole row, so a sheet needs no second read", async () => {
    const brannoc = (await mine(fixture.ilse)).find(
      (character) => character.id === fixture.brannoc.id,
    );
    expect(brannoc?.accountId).toBe(fixture.ilse.accountId);
    expect(brannoc?.visibility).toBe("dm");
    expect(brannoc?.sheet).toEqual({ notes: "", abilities: [], traits: [] });
  });

  it("is empty for an account that is a member of nothing, rather than a failure", async () => {
    const nobody = await runtime.runPromise(anAccount("Nobody"));
    expect(await mine(nobody)).toEqual([]);
  });

  it("leaves out a character nobody has been assigned", async () => {
    // `kes` belongs to no account at all, which is the ordinary state of a row
    // the DM typed up before the player arrived.
    const everyone = await Promise.all([
      mine(fixture.ilse),
      mine(fixture.jo),
      mine(fixture.kofi),
      mine(fixture.fen),
    ]);
    expect(everyone.flat().map((character) => character.id)).not.toContain(fixture.kes.id);
  });
});

describe("the four narrowings a missing campaign in the path could have lost", () => {
  it("does not return somebody else's character at a table they share", async () => {
    // Kofi's Wren is a real row, in a campaign Ilse really is a member of, and
    // it is not hers. `pell` is `dm` and Jo's, so it is out for two reasons —
    // Wren is the one that isolates ownership.
    const characters = await mine(fixture.ilse);
    expect(characters.map((character) => character.id)).not.toContain(fixture.wren.id);
    expect(await mine(fixture.kofi)).toHaveLength(1);
    expect(names(await mine(fixture.kofi))).toEqual(["Wren"]);
  });

  it("does not return a character in a campaign they never joined", async () => {
    // Ilse is not a member of The Ferry. Assigning her a character there is not
    // even expressible — `Characters.assign` refuses an account that is not a
    // live member — so the honest version of this test is to prove the campaign
    // is invisible to her at all.
    const refused = await runtime.runPromise(
      Effect.flatMap(Characters, (characters) =>
        withActor(fixture.ilse)(characters.list(fixture.ferry.id)),
      ).pipe(Effect.result),
    );
    expect(refused._tag).toBe("Failure");
    expect((await mine(fixture.ilse)).map((character) => character.campaignId)).not.toContain(
      fixture.ferry.id,
    );
  });

  it("takes a character back when the membership that carried it is revoked", async () => {
    const before = await mine(fixture.ilse);
    expect(before.map((character) => character.id)).toContain(fixture.sorrel.id);

    // Fen withdraws the invitation Ilse took, which revokes the membership it
    // granted — the shipped path, in one transaction, not a hand-written update.
    await runtime.runPromise(
      Effect.gen(function* () {
        const invites = yield* Invites;
        const asFen = withActor(fixture.fen);
        const issued = yield* asFen(invites.list(fixture.sixpence.id));
        yield* asFen(invites.revoke(fixture.sixpence.id, issued[0]!.id));
      }).pipe(Effect.orDie),
    );

    // The row still exists and still names her account. What went is the reach.
    expect(names(await mine(fixture.ilse))).toEqual(["Brannoc"]);
    const stillAssigned = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql<{ readonly account_id: AccountId | null }>`
          select account_id from character where id = ${fixture.sorrel.id}
        `;
        return rows[0]!.account_id;
      }).pipe(Effect.orDie),
    );
    expect(stillAssigned).toBe(fixture.ilse.accountId);

    // Put her back, so the sections after this one read the fixture as written.
    await runtime.runPromise(admit(fixture.fen, fixture.sixpence.id, fixture.ilse));
    expect(names(await mine(fixture.ilse))).toEqual(["Brannoc", "Sorrel Ash"]);
  });

  it("refuses to reach past a credential minted for one table", async () => {
    // Membership and credential scope narrow independently, and a read with no
    // campaign in its path is exactly where a missing scope clause would not
    // show up: the same account, one table's worth of reach.
    const atTheSaltRoad = scopedTo(fixture.ilse, fixture.saltRoad.id);
    expect(names(await mine(atTheSaltRoad))).toEqual(["Brannoc"]);

    const atSixpence = scopedTo(fixture.ilse, fixture.sixpence.id);
    expect(names(await mine(atSixpence))).toEqual(["Sorrel Ash"]);
  });

  it("keeps a player out of their own character while the campaign is unshared", async () => {
    // Ilse is a live member of The Marsh and Mott is assigned to her. The master
    // toggle is above ownership in the predicate, so it wins — which is the same
    // answer `GET /me/campaigns` gives about that campaign, and not a gap.
    expect((await mine(fixture.ilse)).map((character) => character.id)).not.toContain(
      fixture.mott.id,
    );

    // Share it and she has it, which is what makes the clause above the toggle
    // rather than a coincidence.
    await runtime.runPromise(
      Effect.flatMap(Campaigns, (campaigns) =>
        withActor(fixture.jo)(campaigns.update(fixture.marsh.id, { visibility: "shared" })),
      ).pipe(Effect.orDie),
    );
    expect(names(await mine(fixture.ilse))).toEqual(["Brannoc", "Mott", "Sorrel Ash"]);

    await runtime.runPromise(
      Effect.flatMap(Campaigns, (campaigns) =>
        withActor(fixture.jo)(campaigns.update(fixture.marsh.id, { visibility: "dm" })),
      ).pipe(Effect.orDie),
    );
  });
});

describe("a DM's own list is narrower than the table they run", () => {
  it("returns the characters assigned to them and not the ones they can read", async () => {
    // Jo can read all three Salt Road characters through `characters.list`, and
    // plays one of them. `mine` is the second fact, not the first — a predicate
    // written as `readable OR mine` rather than `readable AND mine` would answer
    // the whole table here and look correct doing it.
    const readable = await runtime.runPromise(
      Effect.flatMap(Characters, (characters) =>
        withActor(fixture.jo)(characters.list(fixture.saltRoad.id)),
      ),
    );
    expect(names(readable)).toEqual(["Brannoc", "Sister Pell", "Wren"]);
    expect(names(await mine(fixture.jo))).toEqual(["Sister Pell"]);
  });
});

/**
 * The full sheet the kit draws — `ui_kits/dm-screen/player-data.js`'s `sheet`,
 * mapped onto the document.
 *
 * Written out rather than generated, because the point of the test is that every
 * section of the drawing has somewhere to land: identity and its tagline half,
 * abilities with saves, skills, proficiencies, attacks, spellcasting with live
 * slots, features, inventory, coin, death saves, level-ups, journal and the four
 * story lines.
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
    const written = await runtime.runPromise(
      Effect.gen(function* () {
        const characters = yield* Characters;
        const asJo = withActor(fixture.jo);
        yield* asJo(
          characters.update(fixture.saltRoad.id, fixture.brannoc.id, { sheet: brannocsSheet }),
        );
        return yield* withActor(fixture.ilse)(characters.mine);
      }).pipe(Effect.orDie),
    );

    const brannoc = written.find((character) => character.id === fixture.brannoc.id);
    // `jsonb` does not preserve key order and does not need to; the value is
    // what the sheet reads.
    expect(brannoc?.sheet).toEqual(brannocsSheet);
  });

  it("still reads a row written before any of it existed", async () => {
    // The whole growth is optional keys on one `jsonb` column, so this is what
    // "no migration and no backfill" means in practice: `sorrel` was created
    // with no sheet at all and decodes to the same empty document it always did.
    const sorrel = (await mine(fixture.ilse)).find(
      (character) => character.id === fixture.sorrel.id,
    );
    expect(sorrel?.sheet).toEqual({ notes: "", abilities: [], traits: [] });
  });
});
