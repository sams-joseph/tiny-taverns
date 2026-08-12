import { Actor, type AccountId, type CampaignId, CurrentActor, type NotFound } from "@taverns/api";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Accounts } from "../../src/Accounts.js";
import { type DmActor, DmActors } from "../../src/repo/DmActor.js";
import { Invites } from "../../src/repo/Invites.js";

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
 * A player at somebody else's table — **minted by the product, through a real
 * invitation.**
 *
 * This function used to insert a `campaign_member` row with raw SQL, and said so
 * at length: `apps/server/src` had exactly one membership writer, `addOwner`,
 * which cannot express a player, so the honest state of the product was that no
 * player membership could be minted at all and a test that needed one had to
 * reach past it. Its own note predicted that step 4 would replace it with a
 * redeemed invite and that the diff doing so would be exactly this function. It
 * is.
 *
 * Nothing here is a fixture shortcut any more: the DM mints an invitation
 * through `Invites.create`, a fresh account redeems it through `Invites.redeem`,
 * and the membership that results is the same row a person following a link
 * gets. So every player in this suite — ten files, including the one that pins
 * the DM gate — now exercises the shipped path rather than a hand-built
 * approximation of it, and a refusal that stops being true of a *real* player
 * fails somewhere instead of staying green against a state nobody can reach.
 *
 * The DM is looked up rather than passed, so the ten call sites did not have to
 * change: a campaign's DM is its live `dm` member, which is exactly what
 * `Invites.create` checks for one line later.
 *
 * The credential is scoped to the campaign, because that is what a player's
 * credential should be: a player has no business reaching the rest of the
 * account it belongs to, and the tests assert both narrowings separately.
 */
export const aPlayerAt = (
  campaignId: CampaignId,
  name: string,
): Effect.Effect<Actor, never, Accounts | Invites | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const invites = yield* Invites;
    const dm = yield* dmOf(campaignId);
    const issued = yield* Effect.provideService(
      invites.create(campaignId, { label: name }),
      CurrentActor,
      dm,
    );
    const account = yield* anAccount(name);
    yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, account);
    return scopedTo(account, campaignId);
  }).pipe(Effect.orDie);

/**
 * The campaign's DM, as an actor — who a test has to be in order to invite
 * somebody.
 *
 * Asked of `campaign_member` rather than of `campaign.account_id`: since `0011`
 * the DM of a campaign *is* its live `dm` member, and this is the same question
 * `Invites.create` asks through `campaignWritable` one line later. Naming the
 * table here is a test reaching for a fact rather than a reach path — the grep
 * in `membership.test.ts` governs `src`, which is where the rule matters.
 */
const dmOf = (campaignId: CampaignId): Effect.Effect<Actor, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly account_id: AccountId }>`
      select account_id from campaign_member
      where campaign_id = ${campaignId} and role = 'dm' and revoked_at is null
      order by created_at asc limit 1
    `;
    return new Actor({ accountId: rows[0]!.account_id, campaignId: null });
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
