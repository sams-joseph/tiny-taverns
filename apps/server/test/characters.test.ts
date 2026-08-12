import { Actor, type Character, CurrentActor, emptyCharacterSheet, NotFound } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { aPlayerAt, anAccount, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The party, once a character is shaped like a creature (`0012`).
 *
 * Three claims, and none of them is about the columns being there — the schema
 * test covers that. They are about the three things the shape changed:
 *
 * - **the descriptor is derived and nothing stores a second copy of it.** It is
 *   a generated column, so this is proven by writing to the columns and by
 *   trying to write to the label.
 * - **the sheet is a document and nothing queries into it**, so it round-trips
 *   whatever went in, and a character with no sheet reads the empty one rather
 *   than a null.
 * - **scoping still holds**, with the extra care that `account_id` deserves: it
 *   is a column and not a credential, and a row that names an account is not
 *   thereby reachable by it.
 */
const runtime = ManagedRuntime.make(
  Layer.mergeAll(Accounts.layer, Campaigns.layer, Characters.layer).pipe(
    Layer.provideMerge(migratedDatabase("taverns_test_characters")),
  ),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const characters = yield* Characters;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road", visibility: "shared" }));
  const otherTable = yield* as(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );

  const brannoc = yield* as(
    characters.create(campaign.id, {
      name: "Brannoc",
      playerName: "Ilse",
      level: 3,
      species: "Half-orc",
      className: "Paladin",
      ac: 18,
      hpMax: 52,
      sheetUrl: "https://example.test/sheets/brannoc",
      sheet: {
        notes: "Owes the ferryman a name.",
        abilities: [{ label: "STR", score: "18", modifier: "+4" }],
        traits: [{ name: "Lay on Hands", text: "A pool of fifteen hit points." }],
      },
      visibility: "shared",
    }),
  );
  // Typed in a hurry: a name and nothing else, which is the row every one of
  // these columns has to tolerate being absent from.
  const pell = yield* as(characters.create(campaign.id, { name: "Sister Pell" }));
  const elsewhere = yield* as(
    characters.create(otherTable.id, { name: "Sixpence Brannoc", visibility: "shared" }),
  );

  const outsider = yield* anAccount("Someone else");
  const player = yield* aPlayerAt(campaign.id, "Pim");

  return {
    dm,
    scopedDm: scopedTo(dm, campaign.id),
    outsider,
    player,
    campaign,
    otherTable,
    brannoc,
    pell,
    elsewhere,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;
let characters: (typeof Characters)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  characters = await runtime.runPromise(Characters);
}, 60_000);

const read = (actor: Actor, id: Character["id"], campaignId = fixture.campaign.id) =>
  runtime.runPromise(withActor(actor)(characters.findById(campaignId, id)).pipe(Effect.result));

describe("the descriptor is derived, and stored nowhere", () => {
  it("assembles the line the party list renders out of the three columns", () => {
    expect(fixture.brannoc.descriptor).toBe("Level 3 Half-orc Paladin");
    expect(fixture.brannoc.level).toBe(3);
    expect(fixture.brannoc.species).toBe("Half-orc");
    expect(fixture.brannoc.className).toBe("Paladin");
  });

  it("is null when there is nothing to derive it from", () => {
    // Not an empty string: `PartyList` renders the half-line only when it is
    // there, and `""` would be a blank detail the API does not have.
    expect(fixture.pell.descriptor).toBeNull();
  });

  it("follows an edit to any one of them, with no second write", async () => {
    const levelled = await runtime.runPromise(
      withActor(fixture.dm)(
        characters.update(fixture.campaign.id, fixture.brannoc.id, { level: 4 }),
      ),
    );
    expect(levelled.descriptor).toBe("Level 4 Half-orc Paladin");

    const cleared = await runtime.runPromise(
      withActor(fixture.dm)(
        characters.update(fixture.campaign.id, fixture.brannoc.id, { level: null }),
      ),
    );
    expect(cleared.descriptor).toBe("Half-orc Paladin");

    // Back where it started, so the rest of this file reads the same row.
    const restored = await runtime.runPromise(
      withActor(fixture.dm)(
        characters.update(fixture.campaign.id, fixture.brannoc.id, { level: 3 }),
      ),
    );
    expect(restored.descriptor).toBe("Level 3 Half-orc Paladin");
  });

  it("cannot be written, by anything, at any level", async () => {
    // The payload schemas have no `descriptor` field, so the compiler is the
    // first refusal and this is the second: the column is `generated always`,
    // and Postgres refuses an assignment to it from raw SQL as well.
    const refused = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql`
          update character set descriptor = 'Something else' where id = ${fixture.brannoc.id}
        `.pipe(Effect.result);
      }),
    );
    expect(refused._tag).toBe("Failure");
  });
});

describe("the sheet is a document", () => {
  it("round-trips whatever went into it", async () => {
    const read = await runtime.runPromise(
      withActor(fixture.dm)(characters.findById(fixture.campaign.id, fixture.brannoc.id)),
    );

    expect(read.sheet.notes).toBe("Owes the ferryman a name.");
    expect(read.sheet.abilities).toEqual([{ label: "STR", score: "18", modifier: "+4" }]);
    expect(read.sheet.traits).toEqual([
      { name: "Lay on Hands", text: "A pool of fifteen hit points." },
    ]);
    expect(read.sheetUrl).toBe("https://example.test/sheets/brannoc");
  });

  it("reads as the empty document when nobody wrote one", () => {
    // The column default, stated in the migration and again as
    // `emptyCharacterSheet`, so a client renders it without a special case.
    expect(fixture.pell.sheet).toEqual(emptyCharacterSheet);
    expect(fixture.pell.sheetUrl).toBeNull();
  });
});

describe("scoping still holds, one column later", () => {
  it("refuses a character in a campaign this account is not a member of", async () => {
    const result = await read(fixture.outsider, fixture.brannoc.id);

    expect(result._tag).toBe("Failure");
    // `NotFound`, not `Forbidden`: "it exists but is not yours" is itself a
    // disclosure.
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
  });

  it("refuses a campaign the credential was not minted for", async () => {
    // Same account, same DM, a table they really do run. Membership and
    // credential scope narrow independently and both apply.
    const result = await read(fixture.scopedDm, fixture.elsewhere.id, fixture.otherTable.id);

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
  });

  it("refuses a character named through the wrong campaign", async () => {
    // The path is a claim. A character that exists, in a campaign this actor
    // really can read, is still not in *this* one.
    const result = await read(fixture.dm, fixture.elsewhere.id, fixture.campaign.id);

    expect(result._tag).toBe("Failure");
  });

  it("gives a player the shared half of the party and no more", async () => {
    const listed = await runtime.runPromise(
      withActor(fixture.player)(characters.list(fixture.campaign.id)),
    );

    expect(listed.map((row) => row.name)).toEqual(["Brannoc"]);
    expect((await read(fixture.player, fixture.pell.id))._tag).toBe("Failure");
  });

  it("refuses a player the write, including on the character they can read", async () => {
    // No player owns anything yet — the predicate that will let one edit their
    // own character belongs with the step that mints a player actor. Until
    // then, `rowWritable` is the whole answer and it says no.
    const updated = await runtime.runPromise(
      withActor(fixture.player)(
        characters.update(fixture.campaign.id, fixture.brannoc.id, { level: 9 }),
      ).pipe(Effect.result),
    );
    const created = await runtime.runPromise(
      withActor(fixture.player)(characters.create(fixture.campaign.id, { name: "A ringer" })).pipe(
        Effect.result,
      ),
    );

    expect(updated._tag).toBe("Failure");
    expect(created._tag).toBe("Failure");
  });
});

describe("account_id is a column, not a credential", () => {
  it("is null on every row the product can write, and is on no payload", () => {
    // Nothing mints a player credential yet and no `create` or `update` accepts
    // one, so there is no way to set it through the product at all.
    expect(fixture.brannoc.accountId).toBeNull();
    expect(fixture.pell.accountId).toBeNull();
  });

  it("grants nothing when it is set behind the product's back", async () => {
    // The property worth pinning before step 4 arrives to lean on it: reach is
    // a `campaign_member` row, and pointing a character at an account is not a
    // membership. Written with raw SQL because the product cannot express it —
    // which is the point.
    await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`
          update character set account_id = ${fixture.outsider.accountId}
          where id = ${fixture.brannoc.id}
        `;
      }).pipe(Effect.orDie),
    );

    const asOutsider = await read(fixture.outsider, fixture.brannoc.id);
    const asDm = await read(fixture.dm, fixture.brannoc.id);

    expect(asOutsider._tag).toBe("Failure");
    // And it is carried on the wire as what it is: provenance the DM can see.
    expect(asDm._tag === "Success" && asDm.success.accountId).toBe(fixture.outsider.accountId);
  });
});
