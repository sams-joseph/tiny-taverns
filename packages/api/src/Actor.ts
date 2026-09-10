import { Context, Schema } from "effect";
import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi";
import { AccountId, CampaignId, SharedWorldId } from "./Ids.js";

/**
 * How far a credential reaches — the whole account, one Shared World, or one campaign.
 *
 * A tagged union rather than a pair of nullable ids, because a nullable
 * `worldId` beside a nullable `campaignId` admits combinations that mean
 * nothing (both set, disagreeing) and every predicate would have to refuse
 * them. Scope is one decision, made when the credential is minted, and the
 * union makes it exactly one.
 *
 * This is *scope*, not reach: membership decides which Shared Worlds and campaigns
 * the account touches at all, and scope narrows that set further. Without it a
 * credential minted for one table would reach every campaign the same account
 * belongs to, so a person running two tables would leak table A's shared rows
 * to table B's players.
 */
export const ActorScope = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("account") }),
  Schema.Struct({ _tag: Schema.tag("sharedWorld"), worldId: SharedWorldId }),
  Schema.Struct({ _tag: Schema.tag("campaign"), campaignId: CampaignId }),
]);
export type ActorScope = typeof ActorScope.Type;

/** The whole-account scope — what `token:issue` and hosted sign-in mint. */
export const accountScope: ActorScope = { _tag: "account" };

/** A credential narrowed to one Shared World. */
export const sharedWorldScope = (worldId: SharedWorldId): ActorScope => ({
  _tag: "sharedWorld",
  worldId,
});

/** A credential narrowed to one campaign. */
export const campaignScope = (campaignId: CampaignId): ActorScope => ({
  _tag: "campaign",
  campaignId,
});

/**
 * Who is making the current request. Resolved once, at the edge.
 *
 * **It carries no role, and cannot.** A person is the creator of one campaign
 * and a player at another *at the same time, on the same credential*, so "may
 * this actor see creator-only rows" is not a property of the credential — it
 * is a property of the pair (account, campaign), which since the group model
 * is `campaign.creator_account_id`. The question is asked in SQL, by
 * `isCreator` in `apps/server/src/repo/visibility.ts`, and there is nowhere on
 * this class it could honestly live.
 *
 * What remains is two independent narrowings, and both apply to every read:
 * *which account is asking*, and *how far its credential reaches*.
 */
export class Actor extends Schema.Class<Actor>("Actor")({
  accountId: AccountId,
  /**
   * How far this credential reaches. Not optional, for the reason the old
   * nullable `campaignId` was not: minting an actor is a decision about reach,
   * and the compiler makes you take it.
   */
  scope: ActorScope,
}) {}

/**
 * The actor for the request in flight.
 *
 * This is deliberately a service and not a handler argument: every repository
 * read declares `CurrentActor` in its requirements, so an unscoped read does
 * not typecheck. Enforcement is the type system's job, not the reviewer's.
 */
export class CurrentActor extends Context.Service<CurrentActor, Actor>()("CurrentActor") {}

/** Returned when a bearer token is missing, malformed, or unknown. */
export class Unauthorized extends Schema.ErrorClass<Unauthorized>("Unauthorized")(
  {
    _tag: Schema.tag("Unauthorized"),
    message: Schema.String,
  },
  { httpApiStatus: 401 },
) {}

/**
 * Resolves the bearer token to an `Actor` and provides it to the handler.
 *
 * Because the middleware declares `provides: CurrentActor`, a group carrying
 * `.middleware(Authorization)` is the only way a handler can obtain an actor —
 * and a handler that yields `CurrentActor` without it does not compile.
 */
export class Authorization extends HttpApiMiddleware.Service<
  Authorization,
  { provides: CurrentActor }
>()("Authorization", {
  error: Unauthorized,
  security: { bearer: HttpApiSecurity.bearer },
}) {}
