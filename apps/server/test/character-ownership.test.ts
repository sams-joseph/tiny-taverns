import { type Actor, type Campaign, CurrentActor, NotFound } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
import { Search } from "../src/repo/Search.js";
import {
  aCharacterAt,
  accountWide,
  anAccount,
  aPlayerAt,
  createCampaign,
  scopedTo,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * Ownership and reach, once they are different questions.
 *
 * Under the continuity decision a character is **account-owned and top-level**,
 * and the two predicates that answer for it answer different things:
 *
 * - **`ownCharacter`** — `character.account_id` is the actor's own. No
 *   campaign, no membership, no credential-scope narrowing, deliberately: a
 *   top-level character has no campaign for any of those to be about, the same
 *   argument `libraryRowReadable` wrote down first. It is what `mine`,
 *   `updateOwn` and `removeOwn` compose, so the owner reaches their own
 *   character **everywhere and always** — through an unshared table, past a
 *   revocation, on a credential minted for somewhere else.
 * - **`characterSeatedAt`** — a campaign reaches a character exactly when a
 *   **live seat** there is readable. The seat's own `ownedRowReadable` carries
 *   the whole campaign gate (live membership, credential scope, the
 *   `campaign.visibility` master toggle) plus the seat's `visibility` with the
 *   creator/owner disjuncts. It is what the campaign search's character arm
 *   composes, and it is the only way a campaign read ever touches the shared
 *   row.
 *
 * **Neither leaks into the other**, and that is the file: retiring a seat ends
 * the campaign's reach without touching the owner's, and owning a character
 * grants a table nothing it did not seat. The old file's subject — the DM's
 * assignment — is gone with the model: ownership is set at creation from the
 * credential, `CharacterAssign` left the wire, and re-pointing a character is
 * not expressible (pinned below at the type level, not merely untested).
 *
 * `party.test.ts` owns the seat lifecycle itself (join, share, retire, the
 * revocation's transaction); this file drives the *predicates* through the
 * reads that compose them.
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Characters.layer,
    Groups.layer,
    Invites.layer,
    Party.layer.pipe(Layer.provide(LiveEvents.layer)),
    Search.layer,
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_character_ownership"))),
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
 * One shared table (Jo's, with Pim and Marta playing) and one stranger's (Fen's
 * own). Every seat starts `dm` — the fail-closed default — except Sister
 * Pell's, which Jo shares so "the answer is not empty" is never what an
 * assertion is measuring.
 */
const makeFixture = Effect.gen(function* () {
  const jo = yield* anAccount("Jo");
  const asJo = withActor(jo);
  const table = yield* asJo(createCampaign({ name: "The Salt Road", visibility: "shared" }));

  const pim = yield* aPlayerAt(table.id, "Pim");
  const marta = yield* aPlayerAt(table.id, "Marta");

  const brannoc = yield* aCharacterAt(table.id, pim, { name: "Brannoc" });
  const sorrel = yield* aCharacterAt(table.id, marta, { name: "Sorrel" });
  const pell = yield* aCharacterAt(
    table.id,
    jo,
    { name: "Sister Pell" },
    { seatVisibility: "shared" },
  );

  const fen = yield* anAccount("Fen");
  const elsewhere = yield* withActor(fen)(
    createCampaign({ name: "Salt and Sixpence", visibility: "shared" }),
  );
  const sixpence = yield* aCharacterAt(elsewhere.id, fen, { name: "Sixpence" });

  return { jo, pim, marta, fen, table, elsewhere, brannoc, sorrel, pell, sixpence };
});

type Fixture = Effect.Success<typeof makeFixture>;
let fixture: Fixture;
beforeAll(async () => {
  fixture = await run(makeFixture);
}, 30_000);

/** The character arm of a campaign search — `characterSeatedAt`, driven. */
const found = (actor: Actor, campaignId: Campaign["id"], q: string) =>
  run(
    withActor(actor)(
      Effect.map(
        Effect.flatMap(Search, (search) => search.search(campaignId, { q })),
        (hits) => hits.filter((hit) => hit.source === "character").map((hit) => hit.title),
      ),
    ),
  );

/** The same read, expected to be refused — hands back the typed failure. */
const foundRefused = (actor: Actor, campaignId: Campaign["id"], q: string) =>
  run(
    withActor(actor)(Effect.flatMap(Search, (search) => search.search(campaignId, { q }))).pipe(
      Effect.flip,
    ),
  );

const mineNames = (actor: Actor) =>
  run(
    withActor(actor)(
      Effect.map(
        Effect.flatMap(Characters, (characters) => characters.mine),
        (owned) => owned.map((row) => row.character.name).sort(),
      ),
    ),
  );

describe("ownership: the owner, everywhere and always", () => {
  it("answers `mine` with the owner's characters and their seats, and nobody else's", async () => {
    const names = await mineNames(fixture.pim);
    expect(names).toEqual(["Brannoc"]);

    const owned = await run(
      withActor(fixture.pim)(Effect.flatMap(Characters, (characters) => characters.mine)),
    );
    expect(owned[0]!.seats.map((seat) => seat.campaignId)).toEqual([fixture.table.id]);
    // Sorrel is Marta's and Sixpence is Fen's; owning a character grants no
    // reach into anybody else's, whatever tables they share.
    expect(names).not.toContain("Sorrel");
    expect(names).not.toContain("Sixpence");
  });

  it("ignores credential scope, deliberately — a top-level row has no campaign for it to be about", async () => {
    // Pim's own account, scoped to Fen's table: the campaign reads below all
    // refuse this credential, and `mine` still answers, because `ownCharacter`
    // applies no scope clause — `libraryRowReadable`'s documented reasoning,
    // one table across. Whoever mints the first scoped credential over HTTP
    // should know this is a decision, not an omission.
    const misScoped = scopedTo(fixture.pim, fixture.elsewhere.id);
    expect(await mineNames(misScoped)).toEqual(["Brannoc"]);
  });

  it("survives everything a campaign can do, because it is not a campaign fact", async () => {
    // The owner edits their character through a table that was never shared:
    // creation needed a readable campaign (campaign-first), but the ownership
    // write is campaign-free — the sheet is theirs between games, after a
    // falling-out, wherever.
    const quiet = await run(
      withActor(fixture.jo)(createCampaign({ name: "The Weir", visibility: "shared" })),
    );
    const guest = await run(aPlayerAt(quiet.id, "Kofi"));
    const { character } = await run(aCharacterAt(quiet.id, guest, { name: "Kofi's Own" }));
    await run(
      withActor(fixture.jo)(
        Effect.flatMap(Campaigns, (campaigns) => campaigns.update(quiet.id, { visibility: "dm" })),
      ),
    );
    const updated = await run(
      withActor(guest)(
        Effect.flatMap(Characters, (characters) =>
          characters.updateOwn(character.id, { level: 3 }),
        ),
      ),
    );
    expect(updated.level).toBe(3);
    expect(await mineNames(guest)).toContain("Kofi's Own");
  });

  it("cannot be re-pointed: assignment left the model with the campaign-scoped row", async () => {
    await run(
      Effect.gen(function* () {
        const characters = yield* Characters;
        // @ts-expect-error — `assign` is gone from the service, as
        // `CharacterAssign` is gone from the wire. Ownership is set at
        // creation from the credential and no act re-points a character; if
        // this line ever compiles again, that boundary has been reopened.
        expect(characters.assign).toBeUndefined();
      }),
    );
  });
});

describe("the seat: a campaign's only reach into the shared row", () => {
  it("reaches your own character through your own seat, whatever the seat's visibility", async () => {
    // Brannoc's seat is `dm` — the DM shared nothing — and Pim still finds
    // their own character in the campaign search. The owner disjunct on the
    // *seat*, doing what the old ownership disjunct on the row did.
    expect(await found(fixture.pim, fixture.table.id, "Brannoc")).toEqual(["Brannoc"]);
  });

  it("hides another player's dm seat and shows a shared one — the seat's visibility deciding", async () => {
    expect(await found(fixture.pim, fixture.table.id, "Sorrel")).toEqual([]);
    expect(await found(fixture.pim, fixture.table.id, "Pell")).toEqual(["Sister Pell"]);
    // The creator reads every seat, shared or not.
    expect(await found(fixture.jo, fixture.table.id, "Sorrel")).toEqual(["Sorrel"]);
  });

  it("ends with the seat: a retired seat stops the campaign's reach and leaves the owner's alone", async () => {
    // The headline. Pim seats a second character, then leaves the table with
    // it: the campaign can no longer say the character exists — even to its
    // creator — while `mine` still answers its owner in full.
    const { character, seatId } = await run(
      aCharacterAt(fixture.table.id, fixture.pim, { name: "Reedwalker" }),
    );
    expect(await found(fixture.jo, fixture.table.id, "Reedwalker")).toEqual(["Reedwalker"]);

    await run(
      withActor(fixture.pim)(
        Effect.flatMap(Party, (party) => party.leave(fixture.table.id, seatId)),
      ),
    );

    expect(await found(fixture.jo, fixture.table.id, "Reedwalker")).toEqual([]);
    expect(await found(fixture.pim, fixture.table.id, "Reedwalker")).toEqual([]);
    expect(await mineNames(fixture.pim)).toContain("Reedwalker");
    // …and the character is untouched by the retirement.
    const owned = await run(
      withActor(fixture.pim)(Effect.flatMap(Characters, (characters) => characters.mine)),
    );
    expect(owned.find((row) => row.character.id === character.id)?.seats).toEqual([]);
  });

  it("does not survive the membership being revoked", async () => {
    const scratch = await run(
      withActor(fixture.jo)(createCampaign({ name: "The Ferry", visibility: "shared" })),
    );
    const guest = await run(aPlayerAt(scratch.id, "Wren"));
    await run(aCharacterAt(scratch.id, guest, { name: "Wrenkin" }));
    expect(await found(guest, scratch.id, "Wrenkin")).toEqual(["Wrenkin"]);

    // Withdraw the invitation they took — the shipped path, which revokes the
    // membership it granted and retires their seats in the same transaction.
    await run(
      withActor(fixture.jo)(
        Effect.gen(function* () {
          const invites = yield* Invites;
          const issued = yield* invites.list(scratch.groupId);
          yield* invites.revoke(scratch.groupId, issued[0]!.id);
        }),
      ),
    );

    // The campaign gate answers the ex-member the ordinary 404…
    const refused = await foundRefused(guest, scratch.id, "Wrenkin");
    expect(refused).toBeInstanceOf(NotFound);
    expect((refused as NotFound).resource).toBe("campaign");
    // …the retired seat answers the creator nothing (party.test.ts owns the
    // deep assertion)…
    expect(await found(fixture.jo, scratch.id, "Wrenkin")).toEqual([]);
    // …and the character is still whole, and still theirs.
    expect(await mineNames(accountWide(guest))).toContain("Wrenkin");
  });

  it("does not survive a credential minted for another table", async () => {
    // Membership and credential scope narrow independently and the seat's
    // predicate composes both: Pim's own account, scoped to Fen's campaign,
    // reaches nothing of the table Pim actually plays at.
    const misScoped = scopedTo(fixture.pim, fixture.elsewhere.id);
    const refused = await foundRefused(misScoped, fixture.table.id, "Brannoc");
    expect(refused).toBeInstanceOf(NotFound);
    expect((refused as NotFound).resource).toBe("campaign");
  });

  it("does not lift the campaign's master toggle", async () => {
    const quiet = await run(
      withActor(fixture.jo)(createCampaign({ name: "Not Yet", visibility: "shared" })),
    );
    const guest = await run(aPlayerAt(quiet.id, "Ilse"));
    await run(aCharacterAt(quiet.id, guest, { name: "Ilsewife" }));

    // Un-share the campaign: the guest's own seat is under it, so even their
    // own character stops answering through the campaign — the same answer
    // `GET /me/campaigns` gives, and not a gap. `mine` is where their
    // character still is.
    await run(
      withActor(fixture.jo)(
        Effect.flatMap(Campaigns, (campaigns) => campaigns.update(quiet.id, { visibility: "dm" })),
      ),
    );
    const closed = await foundRefused(guest, quiet.id, "Ilsewife");
    expect(closed).toBeInstanceOf(NotFound);
    expect(await mineNames(guest)).toContain("Ilsewife");

    await run(
      withActor(fixture.jo)(
        Effect.flatMap(Campaigns, (campaigns) =>
          campaigns.update(quiet.id, { visibility: "shared" }),
        ),
      ),
    );
    expect(await found(guest, quiet.id, "Ilsewife")).toEqual(["Ilsewife"]);
  });
});

describe("what did not change", () => {
  it("keeps a creator's reach at their own tables, and only theirs", async () => {
    // Fen's table is still Fen's: Jo searching it gets the ordinary 404, and
    // Sixpence never comes back through Jo's own campaign.
    const refused = await foundRefused(fixture.jo, fixture.elsewhere.id, "Sixpence");
    expect(refused).toBeInstanceOf(NotFound);
    expect(await found(fixture.jo, fixture.table.id, "Sixpence")).toEqual([]);
    expect(await found(fixture.fen, fixture.elsewhere.id, "Sixpence")).toEqual(["Sixpence"]);
  });
});
