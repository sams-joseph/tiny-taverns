import { Context, Schema } from "effect";
import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi";
import { AccountId, CampaignId } from "./Ids.js";

/**
 * Who is making the current request. Resolved once, at the edge.
 *
 * **It carries no role, and cannot.** A person is the DM of one table and a
 * player at another *at the same time, on the same credential*, so "may this
 * actor see `dm` rows" is not a property of the credential — it is a property
 * of the pair (account, campaign), which is a `campaign_member` row. The
 * question is asked in SQL, by `isDm` in `apps/server/src/repo/visibility.ts`,
 * and there is nowhere on this class it could honestly live.
 *
 * What remains is two independent narrowings, and both apply to every read:
 * *which account is asking*, and *how far its credential reaches*.
 */
export class Actor extends Schema.Class<Actor>("Actor")({
  accountId: AccountId,
  /**
   * The one campaign this credential reaches, or `null` for the whole account.
   *
   * A DM's token is minted for an account and reads every campaign that account
   * is a member of, so it carries `null`. A credential minted for a single
   * table carries that table's id, and `campaignInScope` narrows every read to
   * it.
   *
   * This is *scope*, not reach: membership decides which campaigns the account
   * touches at all, and this narrows that set further. Without it a credential
   * minted for one table would reach every campaign the same account belongs
   * to, so a DM running two tables would leak table A's shared rows to table
   * B's players. The field is not optional for exactly that reason — minting an
   * actor is a decision about reach, and the compiler makes you take it.
   */
  campaignId: Schema.NullOr(CampaignId),
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
