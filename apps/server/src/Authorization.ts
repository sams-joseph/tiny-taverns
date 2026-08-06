import { Actor, Authorization, CurrentActor, Unauthorized } from "@taverns/api";
import { Effect, Layer, Option, Redacted } from "effect";
import { Accounts } from "./Accounts.js";
import { IdentityProvider } from "./IdentityProvider.js";

/**
 * A JWS compact serialization is exactly three dot-separated segments; a
 * machine token is `randomBytes(32).toString("base64url")`, and the base64url
 * alphabet (`A–Z a–z 0–9 - _`) contains no dot at all.
 *
 * So this is a total classification, not a heuristic: it cannot misfile a
 * machine token, and a malformed three-segment string simply fails
 * verification and comes back unknown. No prefix convention, no configuration,
 * and no second `HttpApiSecurity` scheme — v4 would try two bearer schemes in
 * order, but that emits two identical schemes into the OpenAPI document,
 * reports the *last* scheme's error for every failure, and makes every request
 * pay a losing verification first.
 */
const isSessionToken = (credential: string): boolean => credential.split(".").length === 3;

/**
 * Resolves the bearer token once, at the edge, and provides `CurrentActor` for
 * the rest of the request.
 *
 * A missing or malformed `Authorization` header *does* reach here. The declared
 * `HttpApiSecurity.bearer` scheme answers no 401 of its own: `HttpApiBuilder`
 * hands the middleware `Redacted.make("")` when the header is absent or does
 * not parse, and runs it anyway. Rejecting the empty credential is ours to do,
 * and it is the first rule below rather than something inherited — there is no
 * guarantee to inherit, and the tests pass either way, so nothing would catch
 * its omission.
 *
 * Two credential kinds arrive here and exactly one `Actor` leaves, so the
 * count is invisible below this line: no handler, repository or SQL predicate
 * learns that a hosted identity provider exists. `Authorization` still
 * declares `provides: CurrentActor`, so the type-level guarantee that a read
 * cannot go unscoped is untouched by any of it.
 */
export const AuthorizationLive = Layer.effect(Authorization)(
  Effect.gen(function* () {
    const accounts = yield* Accounts;
    const identity = yield* IdentityProvider;

    const actorFor = (credential: string): Effect.Effect<Option.Option<Actor>, never> =>
      (isSessionToken(credential)
        ? identity.verify(credential).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.succeedNone,
                // Verified, so provisioning is not conditional: an
                // unrecognised person gets an account on first request.
                onSome: (verified) => Effect.asSome(accounts.actorForIdentity(verified)),
              }),
            ),
          )
        : accounts.actorForToken(credential)
      ).pipe(
        // A database failure here must not read as "your token is bad".
        Effect.orDie,
      );

    return {
      bearer: (handler, { credential }) =>
        Effect.gen(function* () {
          const presented = Redacted.value(credential);
          if (presented.length === 0) {
            return yield* new Unauthorized({ message: "no credential" });
          }

          const actor = yield* actorFor(presented);
          if (Option.isNone(actor)) {
            // Deliberately the same message for every kind of failure. Which
            // of the two paths rejected it, and why, is not the caller's
            // business.
            return yield* new Unauthorized({ message: "unknown or revoked credential" });
          }
          return yield* Effect.provideService(handler, CurrentActor, actor.value);
        }),
    };
  }),
);
