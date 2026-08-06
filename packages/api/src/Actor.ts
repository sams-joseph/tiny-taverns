import { Context, Schema } from "effect";
import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi";
import { AccountId } from "./Ids.js";

/**
 * `dm` sees everything in the campaigns they own. `player` sees only rows
 * marked `shared`.
 *
 * No player-facing surface exists yet, and no credential resolves to a player
 * actor. The role is here so the read predicate has always had two branches:
 * adding the player surface later is a share-token table and a second set of
 * endpoints, not a retrofit of every query in the product.
 */
export const Role = Schema.Literals(["dm", "player"]);
export type Role = typeof Role.Type;

/** Who is making the current request. Resolved once, at the edge. */
export class Actor extends Schema.Class<Actor>("Actor")({
  accountId: AccountId,
  role: Role,
}) {
  /** True when this actor may see rows whose visibility is `dm`. */
  get seesDmContent(): boolean {
    return this.role === "dm";
  }
}

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
