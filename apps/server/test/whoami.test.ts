import { Actor, CurrentActor } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, describe, expect, it } from "vitest";
import { Accounts, DEFAULT_ACCOUNT_NAME } from "../src/Accounts.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Invites } from "../src/repo/Invites.js";
import { anAccount, aPlayerAt, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * `GET /me` — who the credential belongs to.
 *
 * **The whole endpoint is one row read by primary key, so the thing worth
 * pinning is not what it returns but what it cannot be made to return.** Every
 * other read in the product is asked about a row a caller named and is refused
 * by `repo/visibility.ts`; this one is asked about the caller, and its safety is
 * a fact about the *signature* — `Accounts.identity` takes `CurrentActor` and no
 * argument, so there is nowhere for another account's id to go. The sections
 * below are the four ways that could stop being true: a second account, a
 * credential narrowed to one table, an account that belongs nowhere at all, and
 * the declaration itself.
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(Accounts.layer, Campaigns.layer, Invites.layer).pipe(
    Layer.provideMerge(migratedDatabase("taverns_test_whoami")),
  ),
);
afterAll(() => runtime.dispose());

const asActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const run = <A, E>(
  effect: Effect.Effect<A, E, Accounts | Campaigns | Invites | SqlClient.SqlClient>,
) => runtime.runPromise(effect as Effect.Effect<A, E, never>);

describe("who am I", () => {
  it("answers the account the credential resolved to", async () => {
    const identity = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const actor = yield* anAccount("Ilse Vantar");
        return { actor, me: yield* asActor(actor)(accounts.identity) };
      }),
    );

    expect(identity.me.name).toBe("Ilse Vantar");
    // The id is the account's own — the same value `Character.accountId` and
    // `CampaignMember.accountId` already carry about this person.
    expect(identity.me.id).toBe(identity.actor.accountId);
  });

  /**
   * Two accounts, and each gets exactly its own — the property a lookup
   * endpoint would not have. There is no parameter to swap, so this is a check
   * that the `where` clause names the actor rather than anything else.
   */
  it("never answers about anybody else", async () => {
    const both = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const ilse = yield* anAccount("Ilse Vantar");
        const bram = yield* anAccount("Bram Colley");
        return {
          ilse: { actor: ilse, me: yield* asActor(ilse)(accounts.identity) },
          bram: { actor: bram, me: yield* asActor(bram)(accounts.identity) },
        };
      }),
    );

    expect(both.ilse.me.name).toBe("Ilse Vantar");
    expect(both.bram.me.name).toBe("Bram Colley");
    expect(both.ilse.me.id).not.toBe(both.bram.me.id);
    expect(both.bram.me.id).toBe(both.bram.actor.accountId);
  });

  /**
   * The two narrowings that apply to every other read do not apply here, and
   * that is correct rather than an omission.
   *
   * A credential minted for one table still belongs to the whole account, so
   * `campaignId` narrows which *campaign* it reaches and says nothing about who
   * is holding it. There is no campaign in this read for it to narrow. Same
   * answer for a player at somebody else's table: membership decides what an
   * account may see of a campaign, and this read is about no campaign.
   */
  it("answers the same account however far its credential reaches", async () => {
    const answers = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const campaigns = yield* Campaigns;
        const dm = yield* anAccount("Ilse Vantar");
        const campaign = yield* asActor(dm)(campaigns.create({ name: "The Salt Road" }));

        const player = yield* aPlayerAt(campaign.id, "Bram Colley");
        return {
          wide: yield* asActor(dm)(accounts.identity),
          scoped: yield* asActor(scopedTo(dm, campaign.id))(accounts.identity),
          player: yield* asActor(player)(accounts.identity),
          playerActor: player,
        };
      }),
    );

    expect(answers.scoped).toEqual(answers.wide);
    // A player's credential is scoped to the one table; the answer is still
    // their own account, not the DM's and not the campaign's owner.
    expect(answers.player.name).toBe("Bram Colley");
    expect(answers.player.id).toBe(answers.playerActor.accountId);
    expect(answers.player.id).not.toBe(answers.wide.id);
  });

  /**
   * An account that is a member of nothing still has a name — which is the
   * whole reason this read is in the `me` group rather than under a campaign.
   * `GET /me/campaigns` is honestly `[]` for the same person.
   */
  it("answers an account that belongs to no campaign", async () => {
    const me = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const nobody = yield* anAccount(DEFAULT_ACCOUNT_NAME);
        return yield* asActor(nobody)(accounts.identity);
      }),
    );

    expect(me.name).toBe(DEFAULT_ACCOUNT_NAME);
  });

  /**
   * It answers two columns and no more.
   *
   * `token_hash` is the credential itself, `clerk_user_id` is the vendor's
   * subject and lives below the identity seam, and `created_at` has no reader.
   * A field arriving here later should be a deliberate edit to this list rather
   * than a `select *` quietly widening.
   */
  it("carries the display name and the join key, and nothing else", async () => {
    const me = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const actor = yield* anAccount("Ilse Vantar");
        return yield* asActor(actor)(accounts.identity);
      }),
    );

    expect(Object.keys({ ...me }).sort()).toEqual(["id", "name"]);
  });
});
