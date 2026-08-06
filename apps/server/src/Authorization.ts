import { Authorization, CurrentActor, Unauthorized } from "@taverns/api";
import { Effect, Layer, Option, Redacted } from "effect";
import { Accounts } from "./Accounts.js";

/**
 * Resolves the bearer token once, at the edge, and provides `CurrentActor` for
 * the rest of the request.
 *
 * A missing or malformed `Authorization` header never reaches here — the
 * declared `HttpApiSecurity.bearer` scheme answers 401 on its own. This only
 * has to reject a well-formed token that resolves to nothing.
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
