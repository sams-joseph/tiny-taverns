import {
  type AccountId,
  Actor,
  type Campaign,
  type Character,
  type CharacterId,
  CurrentActor,
  NotFound,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Invites } from "../src/repo/Invites.js";
import { Search } from "../src/repo/Search.js";
import { aPlayerAt, anAccount, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * `character.account_id`, once it means something — the DM's assignment and the
 * one reach it grants.
 *
 * The defect this closes was measured before it was fixed: a player who joined
 * a shared campaign saw an empty party and a 404 on their own character,
 * because the shipped `CharacterDialog` correctly defaults a new row to `dm`
 * and owning a row granted nothing. Both halves were true and neither was
 * wrong on its own.
 *
 * The fix is one disjunct in one predicate (`ownedRowReadable`), and a
 * disjunct is exactly the kind of change that widens more than it was meant
 * to. So most of this file is the **negative space**: what ownership does not
 * grant. In order —
 *
 *   1. the assignment: who may make one, and whom it may name
 *   2. the reach it grants — your own row, whatever its visibility
 *   3. the four narrowings it must not lose
 *   4. what did not change: the DM's view, and every write
 *
 * `characters.test.ts`'s "grants nothing when it is set behind the product's
 * back" still passes unchanged, and is the complement of §3: the account there
 * is a member of nothing.
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
    Invites.layer,
    Search.layer,
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_character_ownership"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One shared table with two players, and a second table run by somebody else.
 *
 * Every character below is created with the payload `CharacterDialog.tsx`
 * sends — `visibility: "dm"`, the fail-closed default — because that default is
 * half of the defect and keeping it is half of the fix.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const characters = yield* Characters;

  const jo = yield* anAccount("Jo");
  const asJo = withActor(jo);
  const table = yield* asJo(campaigns.create({ name: "The Salt Road", visibility: "shared" }));

  const pim = yield* aPlayerAt(table.id, "Pim");
  const marta = yield* aPlayerAt(table.id, "Marta");

  const brannoc = yield* asJo(
    characters.create(table.id, { name: "Brannoc", playerName: "Pim", visibility: "dm" }),
  );
  const sorrel = yield* asJo(
    characters.create(table.id, { name: "Sorrel", playerName: "Marta", visibility: "dm" }),
  );
  // The one row the DM has shared with the table, so "the party list is not
  // empty" is never what an assertion below is really measuring.
  const pell = yield* asJo(
    characters.create(table.id, { name: "Sister Pell", visibility: "shared" }),
  );

  const fen = yield* anAccount("Fen");
  const elsewhere = yield* withActor(fen)(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );
  const sixpence = yield* withActor(fen)(
    characters.create(elsewhere.id, { name: "Sixpence", visibility: "dm" }),
  );

  return { jo, pim, marta, fen, table, elsewhere, brannoc, sorrel, pell, sixpence };
});

interface Fixture {
  readonly jo: Actor;
  readonly pim: Actor;
  readonly marta: Actor;
  readonly fen: Actor;
  readonly table: Campaign;
  readonly elsewhere: Campaign;
  readonly brannoc: Character;
  readonly sorrel: Character;
  readonly pell: Character;
  readonly sixpence: Character;
}

let fixture: Fixture;

/** Assigns as the DM, and hands back whatever the repository answered. */
const assign = (actor: Actor, id: CharacterId, accountId: AccountId | null) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const characters = yield* Characters;
      return yield* withActor(actor)(characters.assign(fixture.table.id, id, { accountId })).pipe(
        Effect.result,
      );
    }),
  );

const read = (actor: Actor, campaignId: Campaign["id"], id: CharacterId) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const characters = yield* Characters;
      return yield* withActor(actor)(characters.findById(campaignId, id)).pipe(Effect.result);
    }),
  );

const list = (actor: Actor, campaignId: Campaign["id"]) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const characters = yield* Characters;
      return yield* withActor(actor)(characters.list(campaignId)).pipe(Effect.result);
    }),
  );

const names = (result: Awaited<ReturnType<typeof list>>): ReadonlyArray<string> =>
  result._tag === "Success" ? result.success.map((character) => character.name).sort() : ["FAILED"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture.pipe(Effect.orDie));
  // The state the rest of the file is about: each player's character points at
  // them, assigned through the product rather than behind its back.
  const first = await assign(fixture.jo, fixture.brannoc.id, fixture.pim.accountId);
  const second = await assign(fixture.jo, fixture.sorrel.id, fixture.marta.accountId);
  expect(first._tag).toBe("Success");
  expect(second._tag).toBe("Success");
}, 30_000);

describe("the assignment: the DM's act, and whom it may name", () => {
  it("points a character at a member of this table, and says so on the wire", async () => {
    const asDm = await read(fixture.jo, fixture.table.id, fixture.brannoc.id);
    expect(asDm._tag === "Success" && asDm.success.accountId).toBe(fixture.pim.accountId);
  });

  it("refuses an account that is not a member here — including one that is a member elsewhere", async () => {
    // Fen runs their own table and is a stranger at this one. The refusal names
    // the member rather than the character, because the caller is the DM and
    // has already proved they may write this row: telling them "that person is
    // not at your table" is the whole usefulness of the endpoint failing.
    const stranger = await assign(fixture.jo, fixture.pell.id, fixture.fen.accountId);
    expect(stranger._tag).toBe("Failure");
    expect(stranger._tag === "Failure" && (stranger.failure as NotFound).resource).toBe("member");

    // …and nothing was written.
    const after = await read(fixture.jo, fixture.table.id, fixture.pell.id);
    expect(after._tag === "Success" && after.success.accountId).toBeNull();
  });

  it("refuses a member whose membership has been revoked", async () => {
    const revoked = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const characters = yield* Characters;
        const invites = yield* Invites;

        const asJo = withActor(fixture.jo);
        const scratch = yield* asJo(campaigns.create({ name: "The Ferry", visibility: "shared" }));
        const guest = yield* aPlayerAt(scratch.id, "Wren");
        const character = yield* asJo(characters.create(scratch.id, { name: "Wren's own" }));

        // Withdraw the invitation they took, which revokes the membership it
        // granted — the shipped path, not a hand-written update.
        const issued = yield* asJo(invites.list(scratch.id));
        yield* asJo(invites.revoke(scratch.id, issued[0]!.id));

        return yield* asJo(
          characters.assign(scratch.id, character.id, { accountId: guest.accountId }),
        ).pipe(Effect.result);
      }).pipe(Effect.orDie),
    );

    expect(revoked._tag).toBe("Failure");
    expect(revoked._tag === "Failure" && (revoked.failure as NotFound).resource).toBe("member");
  });

  it("is refused to a player — including for their own character", async () => {
    // A player may not hand their character to somebody else, and may not take
    // one. The refusal is the ordinary `NotFound` naming the character, so a
    // caller who is not the DM learns nothing about the account they named.
    const ownRow = await assign(fixture.pim, fixture.brannoc.id, fixture.marta.accountId);
    const someoneElses = await assign(fixture.marta, fixture.brannoc.id, fixture.marta.accountId);

    expect(ownRow._tag).toBe("Failure");
    expect(ownRow._tag === "Failure" && (ownRow.failure as NotFound).resource).toBe("character");
    expect(someoneElses._tag).toBe("Failure");

    const unchanged = await read(fixture.jo, fixture.table.id, fixture.brannoc.id);
    expect(unchanged._tag === "Success" && unchanged.success.accountId).toBe(fixture.pim.accountId);
  });

  it("cannot reach a character in another campaign by naming this one", async () => {
    // The campaign in the path is a claim, as everywhere else: Jo naming their
    // own table and Fen's character gets the ordinary 404.
    const smuggled = await assign(fixture.jo, fixture.sixpence.id, fixture.pim.accountId);
    expect(smuggled._tag).toBe("Failure");
    expect(smuggled._tag === "Failure" && (smuggled.failure as NotFound).resource).toBe(
      "character",
    );
  });

  it("unassigns with null, and the row stops being anybody's", async () => {
    const character = await runtime.runPromise(
      Effect.gen(function* () {
        const characters = yield* Characters;
        return yield* withActor(fixture.jo)(characters.create(fixture.table.id, { name: "Loan" }));
      }).pipe(Effect.orDie),
    );

    const given = await assign(fixture.jo, character.id, fixture.pim.accountId);
    expect(given._tag === "Success" && given.success.accountId).toBe(fixture.pim.accountId);
    expect((await read(fixture.pim, fixture.table.id, character.id))._tag).toBe("Success");

    const taken = await assign(fixture.jo, character.id, null);
    expect(taken._tag === "Success" && taken.success.accountId).toBeNull();
    expect((await read(fixture.pim, fixture.table.id, character.id))._tag).toBe("Failure");
  });
});

describe("the reach it grants: your own row, whatever its visibility", () => {
  it("is the defect, closed: a character created by the dialog is reachable by the player it names", async () => {
    // `visibility: "dm"` throughout — the DM shared nothing by hand. Before the
    // ownership disjunct this list held only `Sister Pell` and the read was a
    // 404.
    expect(names(await list(fixture.pim, fixture.table.id))).toEqual(["Brannoc", "Sister Pell"]);
    expect((await read(fixture.pim, fixture.table.id, fixture.brannoc.id))._tag).toBe("Success");
  });

  it("finds it in search, by the same predicate the list reads through", async () => {
    const hits = await runtime.runPromise(
      Effect.gen(function* () {
        const search = yield* Search;
        return yield* withActor(fixture.pim)(search.search(fixture.table.id, { q: "Brannoc" }));
      }).pipe(Effect.orDie),
    );
    expect(hits.map((hit) => (hit.source === "character" ? hit.title : hit.source))).toEqual([
      "Brannoc",
    ]);
  });
});

describe("what ownership does not grant", () => {
  it("does not reach another player's row", async () => {
    // Marta's character is `dm` and points at Marta. Pim is a member of the
    // same campaign and gets the ordinary refusal — from the list and by id.
    expect(names(await list(fixture.pim, fixture.table.id))).not.toContain("Sorrel");
    expect((await read(fixture.pim, fixture.table.id, fixture.sorrel.id))._tag).toBe("Failure");

    const hits = await runtime.runPromise(
      Effect.gen(function* () {
        const search = yield* Search;
        return yield* withActor(fixture.pim)(search.search(fixture.table.id, { q: "Sorrel" }));
      }).pipe(Effect.orDie),
    );
    expect(hits).toEqual([]);
  });

  it("does not reach a row in a campaign the account is not a member of", async () => {
    // Written with raw SQL because the product refuses to produce it — which is
    // the point: this is the predicate answering, with no endpoint in front of
    // it. Pim has never been at Fen's table.
    await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`
          update character set account_id = ${fixture.pim.accountId}
          where id = ${fixture.sixpence.id}
        `;
      }).pipe(Effect.orDie),
    );

    expect((await read(fixture.pim, fixture.elsewhere.id, fixture.sixpence.id))._tag).toBe(
      "Failure",
    );
    expect((await list(fixture.pim, fixture.elsewhere.id))._tag).toBe("Failure");
  });

  it("does not survive the membership being revoked", async () => {
    const after = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const characters = yield* Characters;
        const invites = yield* Invites;
        const asJo = withActor(fixture.jo);

        const scratch = yield* asJo(campaigns.create({ name: "The Weir", visibility: "shared" }));
        const guest = yield* aPlayerAt(scratch.id, "Kofi");
        const character = yield* asJo(characters.create(scratch.id, { name: "Kofi's own" }));
        yield* asJo(characters.assign(scratch.id, character.id, { accountId: guest.accountId }));

        const before = yield* withActor(guest)(characters.findById(scratch.id, character.id)).pipe(
          Effect.result,
        );

        const issued = yield* asJo(invites.list(scratch.id));
        yield* asJo(invites.revoke(scratch.id, issued[0]!.id));

        const afterRevoke = yield* withActor(guest)(
          characters.findById(scratch.id, character.id),
        ).pipe(Effect.result);

        return { before: before._tag, after: afterRevoke._tag };
      }).pipe(Effect.orDie),
    );

    expect(after).toEqual({ before: "Success", after: "Failure" });
  });

  it("does not survive a credential minted for another table", async () => {
    // Membership and credential scope narrow independently, and the ownership
    // disjunct sits under both. Pim's own account, scoped to Fen's campaign,
    // reaches nothing of the campaign Pim is actually a member of.
    const misScoped = scopedTo(fixture.pim, fixture.elsewhere.id);
    expect((await read(misScoped, fixture.table.id, fixture.brannoc.id))._tag).toBe("Failure");
    expect((await list(misScoped, fixture.table.id))._tag).toBe("Failure");
  });

  it("does not lift the campaign's master toggle", async () => {
    // The row's own visibility is the only thing ownership relaxes. A campaign
    // the DM has not shared stays closed to its players, and a character
    // inside it is not the exception — which is the same answer
    // `GET /me/campaigns` gives, and the reason `InviteRedeemed` carries
    // `shared`.
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const characters = yield* Characters;
        const asJo = withActor(fixture.jo);

        const quiet = yield* asJo(campaigns.create({ name: "Not yet", visibility: "dm" }));
        const guest = yield* aPlayerAt(quiet.id, "Ilse");
        const character = yield* asJo(
          characters.create(quiet.id, { name: "Ilse's own", visibility: "shared" }),
        );
        yield* asJo(characters.assign(quiet.id, character.id, { accountId: guest.accountId }));

        const closed = yield* withActor(guest)(characters.findById(quiet.id, character.id)).pipe(
          Effect.result,
        );
        yield* asJo(campaigns.update(quiet.id, { visibility: "shared" }));
        const opened = yield* withActor(guest)(characters.findById(quiet.id, character.id)).pipe(
          Effect.result,
        );

        return { closed: closed._tag, opened: opened._tag };
      }).pipe(Effect.orDie),
    );

    expect(measured).toEqual({ closed: "Failure", opened: "Success" });
  });

  it("grants no write at all — the player still cannot edit, damage or delete their own row", async () => {
    // `player-edits-own-character` is settled and is not this change. Every
    // write below composes `rowWritable`, which is untouched, so the first
    // player write in the product's history is still ahead rather than
    // half-arrived.
    const refused = await runtime.runPromise(
      Effect.gen(function* () {
        const characters = yield* Characters;
        const as = withActor(fixture.pim);
        const id = fixture.brannoc.id;
        return {
          update: (yield* as(characters.update(fixture.table.id, id, { level: 4 })).pipe(
            Effect.result,
          ))._tag,
          damage: (yield* as(characters.damage(fixture.table.id, id, { amount: 5 })).pipe(
            Effect.result,
          ))._tag,
          remove: (yield* as(characters.remove(fixture.table.id, id)).pipe(Effect.result))._tag,
        };
      }).pipe(Effect.orDie),
    );

    expect(refused).toEqual({ update: "Failure", damage: "Failure", remove: "Failure" });
  });
});

describe("what the DM sees is unchanged", () => {
  it("is every row of the party, assigned or not, shared or not", async () => {
    expect(names(await list(fixture.jo, fixture.table.id))).toEqual([
      "Brannoc",
      "Loan",
      "Sister Pell",
      "Sorrel",
    ]);
  });

  it("still stops at their own tables", async () => {
    // The disjunct is `or`-ed with `isDm`, which was already satisfied for a
    // DM — so nothing about the DM's reach could have moved, in either
    // direction. Fen's table is still Fen's.
    expect((await list(fixture.jo, fixture.elsewhere.id))._tag).toBe("Failure");
    expect((await read(fixture.jo, fixture.elsewhere.id, fixture.sixpence.id))._tag).toBe(
      "Failure",
    );
  });
});
