import {
  Actor,
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
import { Characters } from "../src/repo/Characters.js";
import { Invites } from "../src/repo/Invites.js";
import { anAccount, aPlayerAt, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **A player writes down a character of their own** — the first row a non-DM
 * has ever been able to bring into being, and the last third of what ownership
 * grants.
 *
 * `character-ownership.test.ts` pins the read, `player-write.test.ts` the edit;
 * this is the create and the delete. Together the three are the whole of what a
 * player may do to a `character`, and each is bounded by the same two kinds of
 * thing, neither of which may stand in for the other:
 *
 * - **which rows** — a predicate. `ensureCampaignReadable` decides where a new
 *   character may go; `ownRowWritable` decides which one may be thrown away.
 * - **which columns** — `CharacterOwnCreate`, which has no field for
 *   `hpCurrent`, `tempHp`, `conditions`, `visibility` or `accountId`.
 *
 * In order —
 *
 *   1. the grant: a player creates a character at a table they sit at
 *   2. the owner: it is theirs, from the credential and from nowhere else
 *   3. the campaign: every refusal, each shown failing with the answer it gives
 *   4. the disclosure: the DM sees it, the rest of the table does not
 *   5. the delete: your own row, and nobody else's
 *
 * The fourth is the acceptance criterion this slice was written against, and it
 * is measured through the shipped reads from three sides rather than asserted
 * about the column.
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
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
 * Deliberately thinner than `player-write.test.ts`'s: every character here is
 * made *by the test's subject* rather than handed over by the DM, because that
 * is the state this slice introduces and the one the assertions have to be
 * about.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;

  const jo = yield* anAccount("Jo");
  const table = yield* withActor(jo)(
    campaigns.create({ name: "The Salt Road", visibility: "shared" }),
  );

  const pim = yield* aPlayerAt(table.id, "Pim");
  const marta = yield* aPlayerAt(table.id, "Marta");

  const fen = yield* anAccount("Fen");
  const elsewhere = yield* withActor(fen)(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );

  return { jo, pim, marta, fen, table, elsewhere };
});

let fixture: Effect.Success<typeof makeFixture>;
let characters: (typeof Characters)["Service"];

/** The player's own create, as a `Result` so a refusal is a value. */
const createOwn = (actor: Actor, campaignId: CampaignId, payload: CharacterOwnCreate) =>
  runtime.runPromise(
    withActor(actor)(characters.createOwn(campaignId, payload)).pipe(Effect.result, Effect.orDie),
  );

/** The player's own delete, likewise. */
const removeOwn = (actor: Actor, id: CharacterId) =>
  runtime.runPromise(withActor(actor)(characters.removeOwn(id)).pipe(Effect.result, Effect.orDie));

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
}, 60_000);

describe("a player creating their own character", () => {
  it("writes the row, and it comes out theirs", async () => {
    const made = succeeded(
      await createOwn(fixture.pim, fixture.table.id, {
        name: "Brannoc",
        playerName: "Pim",
        level: 1,
        species: "Half-orc",
        className: "Paladin",
        ac: 16,
        hpMax: 12,
      }),
    );

    expect(made.name).toBe("Brannoc");
    expect(made.campaignId).toBe(fixture.table.id);
    // From the credential, and from nowhere a caller could reach.
    expect(made.accountId).toBe(fixture.pim.accountId);
    // The generated column follows the three it is derived from, unchanged by
    // which endpoint wrote them.
    expect(made.descriptor).toBe("Level 1 Half-orc Paladin");
  });

  it("leaves the live trio and the disclosure seam at their column defaults", async () => {
    const made = succeeded(
      await createOwn(fixture.pim, fixture.table.id, { name: "Untouched", hpMax: 9 }),
    );

    // `hp_current` null is `0014`'s own meaning: *nobody has said yet*, which is
    // neither zero nor full. A payload that could set it is one that eventually
    // would, so `CharacterOwnCreate` has no field for it and the insert names
    // no column.
    expect(made.hpCurrent).toBeNull();
    expect(made.tempHp).toBe(0);
    expect(made.conditions).toEqual([]);
    // Fail-closed, and it is the column default rather than a decision the
    // payload got to make.
    expect(made.visibility).toBe("dm");
    // Not the assistant's. Nothing on this path can claim otherwise — see
    // `repo/Proposals.ts`, which is still the only writer of `assistant`.
    expect(made.origin).toBe("authored");
    expect(made.assistantTurnId).toBeNull();
  });

  it("cannot name an account, in the payload or anywhere else", () => {
    // The compile-time half of the boundary, and the one that matters most: the
    // owner of a row is precisely the field a player must not be able to send,
    // and `CharacterAssign` keeps that true for the DM's path by being its own
    // endpoint. Here it is true because there is nowhere to put one.
    //
    // Excess-property checking reports the *first* offending key and stops, so
    // each refused field needs its own literal or the directives after the first
    // go unused.
    // @ts-expect-error — the owner is `CurrentActor`'s.
    const named: CharacterOwnCreate = { name: "Not yours", accountId: fixture.marta.accountId };
    // @ts-expect-error — `0014`'s live trio is the DM's.
    const hurt: CharacterOwnCreate = { name: "Not yours", hpCurrent: 3 };
    // @ts-expect-error — likewise.
    const temp: CharacterOwnCreate = { name: "Not yours", tempHp: 3 };
    // @ts-expect-error — likewise.
    const marked: CharacterOwnCreate = { name: "Not yours", conditions: ["Prone"] };
    // @ts-expect-error — the row's own half of the disclosure seam is the DM's.
    const shared: CharacterOwnCreate = { name: "Not yours", visibility: "shared" };
    // @ts-expect-error — derived, and writable by nobody.
    const described: CharacterOwnCreate = { name: "Not yours", descriptor: "Level 1" };

    // And the runtime half: even encoded by hand, an excess key does not survive
    // the schema, so a client that sent one is sending an ordinary create.
    const encoded = Schema.encodeSync(CharacterOwnCreate)({ name: "Not yours" } as never);
    expect(Object.keys(encoded)).toEqual(["name"]);
    expect([named, hurt, temp, marked, shared, described].length).toBe(6);
  });

  it("is refused at a campaign this account is not a member of", async () => {
    const result = await createOwn(fixture.pim, fixture.elsewhere.id, { name: "Trespasser" });
    // The campaign, not the character: there is no character yet, and the thing
    // the caller asked about and could not have is the table.
    expect(refusal(result)).toEqual({ _tag: "NotFound", resource: "campaign" });

    // And nothing was written. A refusal that left a row would be the worse
    // failure, because the DM of that table would see it.
    const there = await runtime.runPromise(
      withActor(fixture.fen)(characters.list(fixture.elsewhere.id)).pipe(Effect.orDie),
    );
    expect(there.map((row) => row.name)).not.toContain("Trespasser");
  });

  it("is refused at a table the DM has not shared, and allowed the moment they do", async () => {
    // The master toggle, two levels above the row and the narrowing easiest to
    // lose. `ensureCampaignReadable` is the campaign half of
    // `withinReadableCampaign`, so the answer here and the answer to everything
    // else at that table are the same clause.
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const asJo = withActor(fixture.jo);

        const quiet = yield* asJo(campaigns.create({ name: "Not yet", visibility: "dm" }));
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

  it("stops the moment the membership that carried it is revoked", async () => {
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const invites = yield* Invites;
        const asJo = withActor(fixture.jo);

        const scratch = yield* asJo(campaigns.create({ name: "The Weir", visibility: "shared" }));
        const kofi = yield* aPlayerAt(scratch.id, "Kofi");

        const before = yield* withActor(kofi)(
          characters.createOwn(scratch.id, { name: "Kofi's own" }),
        ).pipe(Effect.result);

        // The shipped path: withdrawing the invitation revokes the membership it
        // granted, in one transaction.
        const issued = yield* asJo(invites.list(scratch.id));
        yield* asJo(invites.revoke(scratch.id, issued[0]!.id));

        const after = yield* withActor(kofi)(
          characters.createOwn(scratch.id, { name: "Kofi's second" }),
        ).pipe(Effect.result);
        const rows = yield* asJo(characters.list(scratch.id));

        return {
          before: before._tag,
          after: refusal(after),
          names: rows.map((row) => row.name),
        };
      }).pipe(Effect.orDie),
    );

    expect(measured.before).toBe("Success");
    expect(measured.after).toEqual({ _tag: "NotFound", resource: "campaign" });
    // The one they made while they were a member stays; the one they were
    // refused was never written.
    expect(measured.names).toEqual(["Kofi's own"]);
  }, 60_000);

  it("does not survive a credential minted for another table", async () => {
    // Membership and credential scope narrow independently. Pim's own account,
    // scoped to Fen's campaign, cannot write at the table Pim is really at — and
    // cannot write at Fen's either, where the account is not a member.
    const misScoped = scopedTo(fixture.pim, fixture.elsewhere.id);
    expect(refusal(await createOwn(misScoped, fixture.table.id, { name: "Out of scope" }))).toEqual(
      { _tag: "NotFound", resource: "campaign" },
    );
    expect(
      refusal(await createOwn(misScoped, fixture.elsewhere.id, { name: "Still not yours" })),
    ).toEqual({ _tag: "NotFound", resource: "campaign" });
  });

  it("is one campaign per campaign — a member of two writes into the one they named", async () => {
    // The path segment is a claim and the gate is what makes it safe, so the
    // interesting case is an account the gate *would* let through twice: naming
    // one table must not reach the other.
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const second = yield* withActor(fixture.fen)(
          campaigns.create({ name: "The Hag's Bargain", visibility: "shared" }),
        );
        // Pim's account, at a second table, on an account-wide credential.
        const invites = yield* Invites;
        const issued = yield* withActor(fixture.fen)(invites.create(second.id, { label: "Pim" }));
        const account = new Actor({ accountId: fixture.pim.accountId, campaignId: null });
        yield* withActor(account)(invites.redeem(issued.token));

        const made = yield* withActor(account)(
          characters.createOwn(second.id, { name: "Second table" }),
        );
        const here = yield* withActor(fixture.jo)(characters.list(fixture.table.id));
        return { campaignId: made.campaignId, second: second.id, names: here.map((r) => r.name) };
      }).pipe(Effect.orDie),
    );

    expect(measured.campaignId).toBe(measured.second);
    expect(measured.names).not.toContain("Second table");
  }, 60_000);
});

describe("what the new character discloses, and to whom", () => {
  /**
   * **The acceptance criterion of the whole slice**, measured through the
   * shipped reads from three sides rather than asserted about the column.
   *
   * Nothing here is new machinery. A new row is `dm`; its owner reads it because
   * `ownedRowReadable` has an ownership disjunct, its DM reads it because `isDm`
   * is another, and a second player at the same table satisfies neither. What
   * the slice had to get right was not to reach past any of that.
   */
  it("reaches its author, reaches the DM, and reaches nobody else at the table", async () => {
    const made = succeeded(
      await createOwn(fixture.pim, fixture.table.id, { name: "Only ours", hpMax: 11 }),
    );

    const [mine, dmSees, martaSees] = await runtime.runPromise(
      Effect.all([
        withActor(fixture.pim)(characters.mine),
        withActor(fixture.jo)(characters.list(fixture.table.id)),
        withActor(fixture.marta)(characters.list(fixture.table.id)),
      ]).pipe(Effect.orDie),
    );

    // Its author, through `GET /me/characters`.
    expect(mine.map((row) => row.id)).toContain(made.id);
    // Its DM, through the party list the screen draws.
    expect(dmSees.map((row) => row.id)).toContain(made.id);
    // And the other player at the same shared table, through the same read, does
    // not — which is the half that would be silently wrong if the create had
    // reached for `shared`.
    expect(martaSees.map((row) => row.id)).not.toContain(made.id);
    // Nor by naming it directly, which is the read a curious client would try.
    expect(
      refusal(
        await runtime.runPromise(
          withActor(fixture.marta)(characters.findById(fixture.table.id, made.id)).pipe(
            Effect.result,
            Effect.orDie,
          ),
        ),
      ),
    ).toEqual({ _tag: "NotFound", resource: "character" });
  }, 60_000);

  it("is writable by its author afterwards, which is what the gate bought", async () => {
    // `ensureCampaignReadable` is the campaign half of `withinReadableCampaign`,
    // the same fragment `ownRowWritable` composes — so *"a row created through
    // this gate is editable by its creator"* is a property of one predicate
    // rather than of two kept in step. Measured, because it is the argument the
    // whole endpoint rests on.
    const made = succeeded(await createOwn(fixture.pim, fixture.table.id, { name: "Then edited" }));
    const edited = await runtime.runPromise(
      withActor(fixture.pim)(characters.updateOwn(made.id, { level: 2, className: "Ranger" })).pipe(
        Effect.result,
        Effect.orDie,
      ),
    );

    expect(edited._tag).toBe("Success");
    expect(succeeded(edited).descriptor).toBe("Level 2 Ranger");
  });
});

describe("a player throwing their own character away", () => {
  it("removes it, and it leaves every read it was in", async () => {
    const made = succeeded(await createOwn(fixture.pim, fixture.table.id, { name: "Regretted" }));
    expect((await removeOwn(fixture.pim, made.id))._tag).toBe("Success");

    const [mine, dmSees] = await runtime.runPromise(
      Effect.all([
        withActor(fixture.pim)(characters.mine),
        withActor(fixture.jo)(characters.list(fixture.table.id)),
      ]).pipe(Effect.orDie),
    );
    expect(mine.map((row) => row.name)).not.toContain("Regretted");
    // Gone from the DM's party list too — which is the point of it existing: an
    // abandoned draft is a row somebody else is looking at.
    expect(dmSees.map((row) => row.name)).not.toContain("Regretted");
  }, 60_000);

  it("is refused on somebody else's, even one the DM shared", async () => {
    const martas = succeeded(await createOwn(fixture.marta, fixture.table.id, { name: "Sorrel" }));
    // Shared with the table, so Marta's character is a row Pim can *read*. The
    // write half is narrower and that is exactly what is being measured: nothing
    // a player may delete is something they merely happen to be able to see.
    await runtime.runPromise(
      withActor(fixture.jo)(
        characters.update(fixture.table.id, martas.id, { visibility: "shared" }),
      ).pipe(Effect.orDie),
    );

    const readable = await runtime.runPromise(
      withActor(fixture.pim)(characters.list(fixture.table.id)).pipe(Effect.orDie),
    );
    expect(readable.map((row) => row.id)).toContain(martas.id);

    expect(refusal(await removeOwn(fixture.pim, martas.id))).toEqual({
      _tag: "NotFound",
      resource: "character",
    });
    // The refusal really refused: it is still Marta's.
    const still = await runtime.runPromise(
      withActor(fixture.marta)(characters.mine).pipe(Effect.orDie),
    );
    expect(still.map((row) => row.id)).toContain(martas.id);
  }, 60_000);

  it("is refused on a character nobody owns", async () => {
    // `account_id = ${actor.accountId}` never matches null, so an unassigned row
    // is out of reach of every player at once rather than of a list of them.
    const orphan = await runtime.runPromise(
      withActor(fixture.jo)(
        characters.create(fixture.table.id, { name: "Sister Pell", visibility: "shared" }),
      ).pipe(Effect.orDie),
    );
    expect(refusal(await removeOwn(fixture.pim, orphan.id))).toEqual({
      _tag: "NotFound",
      resource: "character",
    });
    expect(
      (
        await runtime.runPromise(
          withActor(fixture.jo)(characters.findById(fixture.table.id, orphan.id)).pipe(
            Effect.orDie,
          ),
        )
      ).name,
    ).toBe("Sister Pell");
  }, 60_000);

  it("is refused by the campaign's own DM, who has a delete of their own", async () => {
    // The two are not one endpoint under two names. `removeOwn` is *yours*, and
    // the DM owns nothing here however much they may write it; `remove` is the
    // whole table's and is what a DM presses. Both exist, and each refuses what
    // the other is for.
    const made = succeeded(await createOwn(fixture.pim, fixture.table.id, { name: "The DM's go" }));
    expect(refusal(await removeOwn(fixture.jo, made.id))).toEqual({
      _tag: "NotFound",
      resource: "character",
    });

    const asDmDelete = await runtime.runPromise(
      withActor(fixture.jo)(characters.remove(fixture.table.id, made.id)).pipe(
        Effect.result,
        Effect.orDie,
      ),
    );
    expect(asDmDelete._tag).toBe("Success");
  }, 60_000);

  it("stops when the campaign is unshared, and gives the row back when it is shared again", async () => {
    // `ownRowWritable`'s campaign half, met on the delete: the master toggle
    // takes the write away without taking the row, so a DM who closes the table
    // mid-evening has not destroyed anything.
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const asJo = withActor(fixture.jo);

        const scratch = yield* asJo(campaigns.create({ name: "The Ford", visibility: "shared" }));
        const nan = yield* aPlayerAt(scratch.id, "Nan");
        const made = yield* withActor(nan)(characters.createOwn(scratch.id, { name: "Nan's own" }));

        yield* asJo(campaigns.update(scratch.id, { visibility: "dm" }));
        const closed = yield* withActor(nan)(characters.removeOwn(made.id)).pipe(Effect.result);
        yield* asJo(campaigns.update(scratch.id, { visibility: "shared" }));
        const opened = yield* withActor(nan)(characters.removeOwn(made.id)).pipe(Effect.result);

        return { closed: refusal(closed), opened: opened._tag };
      }).pipe(Effect.orDie),
    );

    expect(measured.closed).toEqual({ _tag: "NotFound", resource: "character" });
    expect(measured.opened).toBe("Success");
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
