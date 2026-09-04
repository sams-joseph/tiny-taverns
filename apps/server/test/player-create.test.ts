import {
  type Actor,
  type CampaignId,
  type Character,
  type CharacterId,
  CharacterOwnCreate,
  CurrentActor,
  type NotFound,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Groups } from "../src/repo/Groups.js";
import { Characters } from "../src/repo/Characters.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
import { accountWide, admittedTo, aPlayerAt, anAccount, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **Writing a character down** — `createOwn`, `removeOwn`, and what the new
 * row discloses, under the continuity decision of 2026-09-01.
 *
 * A character is an account-owned, top-level row now, and `createOwn` is the
 * only way one comes into being: the owner writes the shared row and nothing
 * at any table until an explicit `party.join`. There is no DM-typed
 * character any more — the state this file used to guard against ("a row the
 * DM made and assigned") is not representable, and several of the old pins
 * are therefore **inverted on purpose** rather than lost:
 *
 * - a revoked membership used to take the character away; now it retires the
 *   **seat** and the character survives, because the character was never the
 *   campaign's to take;
 * - deleting your own character used to stop when the DM unshared the table;
 *   now it does not, because the row is campaign-scoped nowhere;
 * - "a character nobody owns" is gone as a case: `account_id` is `not null`.
 *
 * What is *not* inverted: creation still takes a campaign context and is still
 * gated by `ensureCampaignReadable` — whose vocabulary/Hob context a new sheet
 * may use is the campaign's question even though where it sits is the owner's
 * later `party.join`.
 *
 * In order —
 *
 *   1. the grant: an owner creates a character, unseated by default
 *   2. the owner: it is theirs, from the credential and from nowhere else
 *   3. the campaign-context gate: every refusal on the way in
 *   4. the disclosure: nobody at the table sees anything until `party.join`
 *   5. the delete: your own row; the creator's remedy is the seat
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Groups.layer,
    Characters.layer,
    Party.layer.pipe(Layer.provide(LiveEvents.layer)),
    Invites.layer,
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_player_create"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One shared table with two players, and a second table run by a stranger.
 *
 * Every character below is made *by the test's subject*, because that is the
 * only way a character is made now.
 */
const makeFixture = Effect.gen(function* () {
  const jo = yield* anAccount("Jo");
  const table = yield* withActor(jo)(
    createCampaign({ name: "The Salt Road", visibility: "shared" }),
  );

  const pim = yield* aPlayerAt(table.id, "Pim");
  const marta = yield* aPlayerAt(table.id, "Marta");

  const fen = yield* anAccount("Fen");
  const elsewhere = yield* withActor(fen)(
    createCampaign({ name: "Salt and Sixpence", visibility: "shared" }),
  );

  return { jo, pim, marta, fen, table, elsewhere };
});

let fixture: Effect.Success<typeof makeFixture>;
let characters: (typeof Characters)["Service"];
let party: (typeof Party)["Service"];

/** The owner's create, as a `Result` so a refusal is a value. */
const createOwn = (actor: Actor, campaignId: CampaignId, payload: CharacterOwnCreate) =>
  runtime.runPromise(
    withActor(actor)(characters.createOwn(campaignId, payload)).pipe(Effect.result, Effect.orDie),
  );

/** The owner's delete, likewise. */
const removeOwn = (actor: Actor, id: CharacterId) =>
  runtime.runPromise(withActor(actor)(characters.removeOwn(id)).pipe(Effect.result, Effect.orDie));

/** The roster as a viewer sees it — the campaign-side read a seat feeds. */
const rosterNames = (viewer: Actor, campaignId: CampaignId) =>
  runtime.runPromise(
    withActor(viewer)(party.list(campaignId)).pipe(
      Effect.map((seats) => seats.map((seat) => seat.seat.displayName)),
      Effect.orDie,
    ),
  );

/** Seat a character through the explicit owner-owned join path. */
const joinOwn = (actor: Actor, campaignId: CampaignId, characterId: CharacterId) =>
  runtime.runPromise(
    withActor(actor)(party.join(campaignId, { characterId })).pipe(Effect.result, Effect.orDie),
  );

/** One refusal shape, so a test cannot pass by matching a different failure. */
const refusal = (result: { readonly _tag: string; readonly failure?: unknown }) =>
  result._tag === "Failure"
    ? {
        _tag: (result.failure as NotFound)._tag,
        resource: (result.failure as NotFound).resource,
      }
    : { _tag: "Success", resource: "—" };

const succeeded = (result: { readonly _tag: string; readonly success?: unknown }): Character => {
  expect(result._tag).toBe("Success");
  return result.success as Character;
};

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture.pipe(Effect.orDie));
  characters = await runtime.runPromise(Characters);
  party = await runtime.runPromise(Party);
}, 60_000);

describe("an owner creating their character", () => {
  it("writes the row, and it comes out theirs — unseated from the table context", async () => {
    const made = succeeded(
      await createOwn(fixture.pim, fixture.table.id, {
        name: "Brannoc",
        playerName: "Pim",
        level: 1,
        race: "Half-orc",
        className: "Paladin",
        ac: 16,
        hpMax: 12,
      }),
    );

    expect(made.name).toBe("Brannoc");
    // From the credential, and from nowhere a caller could reach.
    expect(made.accountId).toBe(fixture.pim.accountId);
    // The generated column follows the three it is derived from.
    expect(made.descriptor).toBe("Level 1 Half-orc Paladin");
    // Fresh sheets start at version 1 — the counter `expectedVersion` reads.
    expect(made.version).toBe(1);
    // There is no campaign on the character: the seat is the campaign's fact.
    expect("campaignId" in made).toBe(false);
    const mine = await runtime.runPromise(
      withActor(fixture.pim)(characters.mine).pipe(Effect.orDie),
    );
    const owned = mine.find((row) => row.character.id === made.id);
    expect(owned?.seats).toEqual([]);
    expect(await rosterNames(fixture.jo, fixture.table.id)).not.toContain("Brannoc");
  });

  it("leaves the live trio at its defaults, and carries no disclosure toggle at all", async () => {
    const made = succeeded(
      await createOwn(fixture.pim, fixture.table.id, { name: "Untouched", hpMax: 9 }),
    );

    // `hp_current` null is `0014`'s own meaning: *nobody has said yet*.
    expect(made.hpCurrent).toBeNull();
    expect(made.tempHp).toBe(0);
    expect(made.conditions).toEqual([]);
    // Who at a table may see them is the SEAT's question now. Creation creates
    // no seat, and the shared character has no visibility field for a payload
    // to have set.
    expect("visibility" in made).toBe(false);
    // Not the assistant's. `repo/Proposals.ts` is still the only writer of
    // `assistant`.
    expect(made.origin).toBe("authored");
    expect(made.assistantTurnId).toBeNull();
  });

  it("cannot name an account, a live value, or a version, in the payload or anywhere else", () => {
    // The compile-time half of the boundary. Excess-property checking reports
    // the *first* offending key and stops, so each refused field needs its own
    // literal or the directives after the first go unused.
    // @ts-expect-error — the owner is `CurrentActor`'s.
    const named: CharacterOwnCreate = { name: "Not yours", accountId: fixture.marta.accountId };
    // @ts-expect-error — the live trio moves by delta, through a seat.
    const hurt: CharacterOwnCreate = { name: "Not yours", hpCurrent: 3 };
    // @ts-expect-error — likewise.
    const temp: CharacterOwnCreate = { name: "Not yours", tempHp: 3 };
    // @ts-expect-error — likewise.
    const marked: CharacterOwnCreate = { name: "Not yours", conditions: ["Prone"] };
    // @ts-expect-error — disclosure is the seat's; there is no such column here.
    const shared: CharacterOwnCreate = { name: "Not yours", visibility: "shared" };
    // @ts-expect-error — derived, and writable by nobody.
    const described: CharacterOwnCreate = { name: "Not yours", descriptor: "Level 1" };
    // @ts-expect-error — the counter is the server's; a fresh row starts at 1.
    const versioned: CharacterOwnCreate = { name: "Not yours", version: 9 };

    // And the runtime half: even encoded by hand, an excess key does not
    // survive the schema, so a client that sent one is sending an ordinary
    // create.
    const encoded = Schema.encodeSync(CharacterOwnCreate)({ name: "Not yours" } as never);
    expect(Object.keys(encoded)).toEqual(["name"]);
    expect([named, hurt, temp, marked, shared, described, versioned].length).toBe(7);
  });

  it("is refused at a campaign this account is not a member of", async () => {
    const result = await createOwn(fixture.pim, fixture.elsewhere.id, { name: "Trespasser" });
    // The campaign, not the character: there is no character yet, and the
    // thing the caller asked about and could not have is the table.
    expect(refusal(result)).toEqual({ _tag: "NotFound", resource: "campaign" });

    // And no campaign-side row was written for that table's creator to be
    // looking at.
    expect(await rosterNames(fixture.fen, fixture.elsewhere.id)).not.toContain("Trespasser");
  });

  it("is refused at a table the creator has not shared, and allowed the moment they do", async () => {
    // The master toggle. Creation is campaign-contextual, so this is the one
    // place the campaign still gets a say over the owner's write: not whether
    // the character may exist, but whether its vocabulary/Hob context is
    // readable.
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const asJo = withActor(fixture.jo);

        const quiet = yield* asJo(createCampaign({ name: "Not yet", visibility: "dm" }));
        const ilse = yield* aPlayerAt(quiet.id, "Ilse");

        const closed = yield* withActor(ilse)(
          characters.createOwn(quiet.id, { name: "Too early" }),
        ).pipe(Effect.result);
        yield* asJo(campaigns.update(quiet.id, { visibility: "shared" }));
        const opened = yield* withActor(ilse)(
          characters.createOwn(quiet.id, { name: "Just in time" }),
        ).pipe(Effect.result);

        return { closed: refusal(closed), opened: opened._tag };
      }).pipe(Effect.orDie),
    );

    expect(measured.closed).toEqual({ _tag: "NotFound", resource: "campaign" });
    expect(measured.opened).toBe("Success");
  }, 60_000);

  it("stops at a revoked membership — and the character already made survives it", async () => {
    // **Inverted from the campaign-scoped model, deliberately.** Withdrawing
    // the invitation used to take the character with the membership; under the
    // continuity decision the character stays its owner's, because it was never
    // the campaign's to take. Only the next create using that table's context
    // is refused.
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const invites = yield* Invites;
        const asJo = withActor(fixture.jo);

        const scratch = yield* asJo(createCampaign({ name: "The Weir", visibility: "shared" }));
        const kofi = yield* aPlayerAt(scratch.id, "Kofi");

        const made = yield* withActor(kofi)(
          characters.createOwn(scratch.id, { name: "Kofi's own" }),
        );

        // The shipped path: withdrawing the invitation revokes the membership
        // it granted; any seats would be retired in the same transaction.
        const issued = yield* asJo(invites.list(scratch.groupId));
        yield* asJo(invites.revoke(scratch.groupId, issued[0]!.id));

        const after = yield* withActor(kofi)(
          characters.createOwn(scratch.id, { name: "Kofi's second" }),
        ).pipe(Effect.result);
        const roster = yield* asJo(party.list(scratch.id));
        // The account-wide credential is how the person still reads what is
        // theirs once the campaign-scoped one has nothing left to reach.
        const mine = yield* withActor(accountWide(kofi))(characters.mine);

        return {
          after: refusal(after),
          roster: roster.map((seat) => seat.seat.displayName),
          kept: mine.find((row) => row.character.id === made.id),
        };
      }).pipe(Effect.orDie),
    );

    expect(measured.after).toEqual({ _tag: "NotFound", resource: "campaign" });
    // There never was an automatic seat, so the creator's roster is empty…
    expect(measured.roster).toEqual([]);
    // …and the character outlived the table, seatless.
    expect(measured.kept).toBeDefined();
    expect(measured.kept!.seats).toEqual([]);
  }, 60_000);

  it("does not survive a credential minted for another table", async () => {
    // Membership and credential scope narrow independently, and the campaign
    // gate applies both. Pim's own account, scoped to Fen's campaign, cannot
    // use the Salt Road's character context — and cannot at Fen's either,
    // where the account is not a member.
    const misScoped = await runtime.runPromise(
      admittedTo(fixture.elsewhere.id, fixture.pim, "Pim, elsewhere"),
    );
    expect(refusal(await createOwn(misScoped, fixture.table.id, { name: "Out of scope" }))).toEqual(
      { _tag: "NotFound", resource: "campaign" },
    );
    // At the table the credential *does* reach, the create is ordinary.
    expect(
      (await createOwn(misScoped, fixture.elsewhere.id, { name: "In scope after all" }))._tag,
    ).toBe("Success");
  });

  it("uses the named campaign as context and seats nowhere automatically", async () => {
    // The path segment is a claim and the gate is what makes it safe, so the
    // interesting case is an account the gate would let through twice: naming
    // one table must not seat anything at any table.
    const second = await runtime.runPromise(
      withActor(fixture.fen)(
        createCampaign({ name: "The Hag's Bargain", visibility: "shared" }),
      ).pipe(Effect.orDie),
    );
    const pimThere = await runtime.runPromise(admittedTo(second.id, fixture.pim, "Pim, again"));

    const made = succeeded(await createOwn(pimThere, second.id, { name: "Second table" }));
    const mine = await runtime.runPromise(
      withActor(accountWide(fixture.pim))(characters.mine).pipe(Effect.orDie),
    );
    const owned = mine.find((row) => row.character.id === made.id);
    expect(owned?.seats).toEqual([]);
    expect(await rosterNames(fixture.jo, fixture.table.id)).not.toContain("Second table");
    expect(await rosterNames(fixture.fen, second.id)).not.toContain("Second table");
  }, 60_000);
});

describe("what the new character discloses, and to whom", () => {
  /**
   * Creation is now only the top-level account row. The campaign creator and
   * the rest of the table see nothing until the owner explicitly joins.
   */
  it("reaches its owner and nobody at the table until an explicit join", async () => {
    const made = succeeded(
      await createOwn(fixture.pim, fixture.table.id, { name: "Only ours", hpMax: 11 }),
    );

    const mine = await runtime.runPromise(
      withActor(fixture.pim)(characters.mine).pipe(Effect.orDie),
    );
    expect(mine.map((row) => row.character.id)).toContain(made.id);
    expect(mine.find((row) => row.character.id === made.id)?.seats).toEqual([]);

    expect(await rosterNames(fixture.jo, fixture.table.id)).not.toContain("Only ours");
    expect(await rosterNames(fixture.marta, fixture.table.id)).not.toContain("Only ours");
  }, 60_000);

  it("appears on the campaign only after party.join, with the seat still private", async () => {
    const made = succeeded(
      await createOwn(fixture.pim, fixture.table.id, { name: "Joined ours", hpMax: 11 }),
    );
    const joined = await joinOwn(fixture.pim, fixture.table.id, made.id);
    expect(joined._tag).toBe("Success");

    const creatorSees = await runtime.runPromise(
      withActor(fixture.jo)(party.list(fixture.table.id)).pipe(Effect.orDie),
    );
    const seat = creatorSees.find((row) => row.character?.id === made.id);
    expect(seat).toBeDefined();
    expect(seat!.seat.displayName).toBe("Joined ours");
    expect(seat!.seat.visibility).toBe("dm");
    expect(await rosterNames(fixture.marta, fixture.table.id)).not.toContain("Joined ours");
  }, 60_000);

  it("is writable by its owner afterwards — and would be with no table at all", async () => {
    // Under the old model this was a property of one predicate holding two
    // jobs; now it is simpler than that: the character is the owner's, full
    // stop, and `player-write.test.ts` pins that the campaign has no further
    // say.
    const made = succeeded(await createOwn(fixture.pim, fixture.table.id, { name: "Then edited" }));
    const edited = await runtime.runPromise(
      withActor(fixture.pim)(characters.updateOwn(made.id, { level: 2, className: "Ranger" })).pipe(
        Effect.result,
        Effect.orDie,
      ),
    );

    expect(edited._tag).toBe("Success");
    expect(succeeded(edited).descriptor).toBe("Level 2 Ranger");
    expect(succeeded(edited).version).toBe(2);
  });
});

describe("an owner throwing their character away", () => {
  it("removes it, and any roster line it had stays retired", async () => {
    const made = succeeded(await createOwn(fixture.pim, fixture.table.id, { name: "Regretted" }));
    expect(await rosterNames(fixture.jo, fixture.table.id)).not.toContain("Regretted");
    await joinOwn(fixture.pim, fixture.table.id, made.id);
    expect(await rosterNames(fixture.jo, fixture.table.id)).toContain("Regretted");

    expect((await removeOwn(fixture.pim, made.id))._tag).toBe("Success");

    const mine = await runtime.runPromise(
      withActor(fixture.pim)(characters.mine).pipe(Effect.orDie),
    );
    expect(mine.map((row) => row.character.name)).not.toContain("Regretted");
    // Gone from the creator's roster too — the delete retires the explicit
    // seats in its own transaction. (That the retired row *survives*
    // underneath, as campaign history with the pointer nulled, is
    // `party.test.ts`'s pin.)
    expect(await rosterNames(fixture.jo, fixture.table.id)).not.toContain("Regretted");
  }, 60_000);

  it("is refused on somebody else's, even one whose seat the whole table can see", async () => {
    const martas = succeeded(await createOwn(fixture.marta, fixture.table.id, { name: "Sorrel" }));
    await joinOwn(fixture.marta, fixture.table.id, martas.id);
    // The creator shares the SEAT — the disclosure control that replaced the
    // old row-level toggle — so Sorrel is a character Pim can see at this
    // table. Seeing is not holding.
    const martasSeat = (
      await runtime.runPromise(withActor(fixture.marta)(characters.mine).pipe(Effect.orDie))
    ).find((row) => row.character.id === martas.id)!.seats[0]!;
    await runtime.runPromise(
      withActor(fixture.jo)(
        party.update(fixture.table.id, martasSeat.campaignCharacterId, { visibility: "shared" }),
      ).pipe(Effect.orDie),
    );
    expect(await rosterNames(fixture.pim, fixture.table.id)).toContain("Sorrel");

    expect(refusal(await removeOwn(fixture.pim, martas.id))).toEqual({
      _tag: "NotFound",
      resource: "character",
    });
    // The refusal really refused: it is still Marta's.
    const still = await runtime.runPromise(
      withActor(fixture.marta)(characters.mine).pipe(Effect.orDie),
    );
    expect(still.map((row) => row.character.id)).toContain(martas.id);
  }, 60_000);

  it("is refused by the campaign's creator, whose remedy is the seat", async () => {
    // The creator owns nothing here however much table authority they hold:
    // there is no DM delete of the shared character any more, and `removeOwn`
    // refuses them like any other non-owner. What the creator *can* do is
    // retire the seat — clear their own table — and the character survives it.
    const made = succeeded(
      await createOwn(fixture.pim, fixture.table.id, { name: "The creator's go" }),
    );
    await joinOwn(fixture.pim, fixture.table.id, made.id);
    expect(refusal(await removeOwn(fixture.jo, made.id))).toEqual({
      _tag: "NotFound",
      resource: "character",
    });

    const seat = (
      await runtime.runPromise(withActor(fixture.pim)(characters.mine).pipe(Effect.orDie))
    ).find((row) => row.character.id === made.id)!.seats[0]!;
    await runtime.runPromise(
      withActor(fixture.jo)(party.leave(fixture.table.id, seat.campaignCharacterId)).pipe(
        Effect.orDie,
      ),
    );

    expect(await rosterNames(fixture.jo, fixture.table.id)).not.toContain("The creator's go");
    const mine = await runtime.runPromise(
      withActor(fixture.pim)(characters.mine).pipe(Effect.orDie),
    );
    const kept = mine.find((row) => row.character.id === made.id);
    expect(kept).toBeDefined();
    expect(kept!.seats).toEqual([]);
  }, 60_000);

  it("does not stop when the campaign is unshared — the character outlives the table", async () => {
    // **Inverted, deliberately.** The old delete composed the campaign's
    // master toggle and stopped when the table closed; the shared character is
    // campaign-scoped nowhere, so the owner's delete has no campaign to ask.
    // A creator closing their table mid-evening still loses nothing — the
    // delete was always the owner's to make.
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const asJo = withActor(fixture.jo);

        const scratch = yield* asJo(createCampaign({ name: "The Ford", visibility: "shared" }));
        const nan = yield* aPlayerAt(scratch.id, "Nan");
        const made = yield* withActor(nan)(characters.createOwn(scratch.id, { name: "Nan's own" }));

        yield* asJo(campaigns.update(scratch.id, { visibility: "dm" }));
        const closed = yield* withActor(nan)(characters.removeOwn(made.id)).pipe(Effect.result);

        return { closed: closed._tag };
      }).pipe(Effect.orDie),
    );

    expect(measured.closed).toBe("Success");
  }, 60_000);

  it("answers the same sentence for a character that does not exist", async () => {
    // One answer, so a caller cannot probe for ids.
    const invented = "2b1f2a1e-0000-4000-8000-00000000c0de" as CharacterId;
    expect(refusal(await removeOwn(fixture.pim, invented))).toEqual({
      _tag: "NotFound",
      resource: "character",
    });
  });
});
