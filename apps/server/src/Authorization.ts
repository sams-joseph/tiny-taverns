import { Authorization, CurrentActor, Unauthorized } from "@taverns/api";
import { Effect, Layer, Option, Redacted } from "effect";
import { Accounts } from "./Accounts.js";

/**
 * Resolves the bearer token once, at the edge, and provides `CurrentActor` for
 * the rest of the request.
 *
 * A missing or malformed `Authorization` header *does* reach here. The declared
 * `HttpApiSecurity.bearer` scheme answers no 401 of its own: `HttpApiBuilder`
 * hands the middleware `Redacted.make("")` when the header is absent or does
 * not parse, and runs it anyway. Rejecting the empty credential is ours to do —
 * today that is `Accounts.actorForToken`, which returns `None` for a
 * zero-length token before it touches the database, and every middleware added
 * here must keep an explicit empty-credential rejection rather than inherit a
 * guarantee that was never there.
 */
export const AuthorizationLive = Layer.effect(Authorization)(
  Effect.gen(function* () {
    const accounts = yield* Accounts;

    return {
      bearer: (handler, { credential }) =>
        Effect.gen(function* () {
          const actor = yield* accounts.actorForToken(Redacted.value(credential)).pipe(
            // A database failure here must not read as "your token is bad".
            Effect.orDie,
          );
          if (Option.isNone(actor)) {
            return yield* new Unauthorized({ message: "unknown or revoked token" });
          }
          return yield* Effect.provideService(handler, CurrentActor, actor.value);
        }),
    };
  }),
);
