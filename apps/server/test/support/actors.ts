import { Actor, type CampaignId, CurrentActor, type NotFound } from "@taverns/api";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Accounts } from "../../src/Accounts.js";
import { type DmActor, DmActors } from "../../src/repo/DmActor.js";

/**
 * The actors every repository test needs, and what each of them is now that
 * reach is a `campaign_member` row rather than `campaign.account_id`.
 *
 * The shape these replaced was `new Actor({ accountId, role, campaignId })`,
 * built by hand in ten files. It does not exist any more, and the compiler
 * removed every one of them in a single pass — which is the property worth
 * having: there is no version of this change that typechecks while half done.
 *
 * A test that kept constructing a player by naming a role would be asserting
 * against a thing the product cannot produce, which is worse than a failing
 * test. So a player here is what a player will be: **their own account**, a
 * `player` membership at somebody else's table, and a credential scoped to it.
 */

/**
 * An account with an account-wide credential — what `token:issue` mints, and
 * what every request in the product carries today.
 *
 * It reaches every campaign this account is a member of, which for a DM means
 * every campaign it created (`Campaigns.create` writes the owner's `dm` row in
 * the same transaction) and nothing else.
 */
export const anAccount = (name: string): Effect.Effect<Actor, never, Accounts> =>
  Effect.gen(function* () {
    const accounts = yield* Accounts;
    const issued = yield* accounts.issue(name);
    return new Actor({ accountId: issued.accountId, campaignId: null });
  }).pipe(Effect.orDie);

/**
 * The same account's credential, narrowed to one campaign.
 *
 * Scope and membership are two independent narrowings and both apply: this one
 * cannot reach past its campaign even where the account is a member of others.
 * Nothing mints such a credential over HTTP yet — the clause exists so that
 * whatever mints one first inherits it rather than needing an audit.
 */
export const scopedTo = (actor: Actor, campaignId: CampaignId): Actor =>
  new Actor({ accountId: actor.accountId, campaignId });

/**
 * A player at somebody else's table.
 *
 * **The `campaign_member` row is written here with raw SQL, and that is
 * deliberate rather than a shortcut.** `apps/server/src` has exactly one
 * membership writer (`repo/Memberships.ts`'s `addOwner`) and it cannot express
 * a player: there is no invite yet, and until there is, the honest state of the
 * product is that no player membership can be minted at all. This is a test
 * reaching past the product to build a state the product cannot yet produce,
 * and it should look like one — step 4 replaces it with a redeemed invite, and
 * the diff that does so will be exactly this function.
 *
 * The credential is scoped to the campaign, because that is what an invite will
 * mint: a player has no business reaching the rest of the account it belongs
 * to, and the tests assert both narrowings separately.
 */
export const aPlayerAt = (
  campaignId: CampaignId,
  name: string,
): Effect.Effect<Actor, never, Accounts | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const account = yield* anAccount(name);
    yield* sql`
      insert into campaign_member ${sql.insert({
        campaign_id: campaignId,
        account_id: account.accountId,
        role: "player",
      })}
    `;
    return scopedTo(account, campaignId);
  }).pipe(Effect.orDie);

/**
 * The proof `Combatants`, `EncounterRuns` and `SessionEvents` require.
 *
 * There is deliberately no way to build one here by hand, unlike the
 * `campaign_member` row above: `aPlayerAt` reaches past the product because the
 * product cannot yet mint a player, whereas this is a check the product *does*
 * perform and a test that forged it would be testing nothing. So it goes
 * through `DmActors.of` like every caller in `src`, and a test that expects a
 * refusal asserts on this failing rather than on the read that follows it.
 */
export const asDm = (
  actor: Actor,
  campaignId: CampaignId,
): Effect.Effect<DmActor, NotFound, DmActors> =>
  Effect.flatMap(DmActors, (dmActors) =>
    Effect.provideService(dmActors.of(campaignId), CurrentActor, actor),
  );
