import { verifyToken } from "@clerk/backend";
import { Effect, Layer, Option } from "effect";
import { createPublicKey } from "node:crypto";
import { IdentityProvider, type VerifiedIdentity } from "./IdentityProvider.js";

/**
 * Clerk behind the `IdentityProvider` seam. The only module in the server that
 * imports a vendor SDK, and nothing it returns mentions one.
 *
 * `verifyToken`, not `authenticateRequest`. `authenticateRequest` exists for
 * browser navigations carrying Clerk's cookies — it does handshake redirects,
 * dev-browser negotiation and satellite-domain sync, it *throws* without a
 * publishable key, and it reports a cookie-flow `dev-browser-missing` for an
 * API that has no cookies. This API is cross-origin and bearer-only.
 * `verifyToken` with a PEM is the whole job: no network call, no publishable
 * key, and — the property worth defending — no secret key on the server at
 * all. Someone holding this process's entire environment gets a database URL
 * and a *public* key, and cannot mint a token for anybody.
 */

/**
 * The custom session claim a display name is read from, when it is present.
 *
 * Configured outside this repository (Clerk dashboard → Customize session
 * token, e.g. `{"name": "{{user.full_name}}"}`). It is optional by design and
 * must stay that way: the server falls back to a default name rather than
 * failing to provision, so a dashboard setting that is missing or removed
 * costs a nice-looking name and nothing else.
 */
const NAME_CLAIM = "name";

/**
 * Clerk's claims, reduced to the local shape, at the boundary.
 *
 * The parameter is structural rather than Clerk's `JwtPayload` on purpose —
 * see `IdentityProvider` for why naming that type does not compile here.
 */
const identityFrom = (claims: {
  readonly sub: string;
  readonly [NAME_CLAIM]?: unknown;
}): VerifiedIdentity => {
  const claimed = claims[NAME_CLAIM];
  const name = typeof claimed === "string" ? claimed.trim() : "";
  return {
    subject: claims.sub,
    name: name.length === 0 ? Option.none() : Option.some(name),
  };
};

/** Clerk's rejection reason if it gave one, for a log line. Never a Clerk type. */
const reasonFor = (error: unknown): string => {
  const reason: unknown = (error as { readonly reason?: unknown } | null)?.reason;
  return typeof reason === "string" ? reason : "unrecognised credential";
};

/**
 * Rejects a verification key Clerk cannot actually use, during layer
 * construction.
 *
 * Worth the twelve lines because of *how* Clerk consumes the PEM: it converts
 * it to a JWK by string surgery, stripping the fixed SPKI prefix of a 2048-bit
 * RSA key and treating what is left as the modulus (`loadClerkJwkFromPem`).
 * Hand it anything else — an EC key, a 4096-bit RSA key, a certificate, a
 * truncated paste — and it builds a JWK that is quietly wrong. Nothing throws.
 * Every token then fails with "invalid signature", which is indistinguishable
 * from a forged token, so the symptom is "nobody can sign in" with a log full
 * of what look like attacks. Boot failure is a much better answer.
 */
const assertUsableVerificationKey = (pem: string): Effect.Effect<void> =>
  Effect.sync(() => {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== "rsa") {
      throw new Error(
        `CLERK_JWT_KEY must be an RSA public key; this one is ${String(key.asymmetricKeyType)}.`,
      );
    }
    const bits = key.asymmetricKeyDetails?.modulusLength;
    if (bits !== 2048) {
      throw new Error(`CLERK_JWT_KEY must be a 2048-bit RSA public key; this one is ${bits}-bit.`);
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.die(
        new Error(
          "CLERK_JWT_KEY is not a usable JWT verification key. Copy the PEM from the Clerk " +
            "dashboard: API keys → Show JWT public key → PEM Public Key. Unset it entirely to " +
            `run without hosted sign-in.\n${String(cause)}`,
        ),
      ),
    ),
  );

export interface ClerkOptions {
  /** The instance's JWT public key, in PEM form. Not a secret. */
  readonly jwtKey: string;
  /**
   * Origins whose tokens this server accepts, checked against the `azp` claim.
   *
   * Fed from the same list as the CORS allowlist so the two cannot drift.
   * Note that supplying it makes `azp` *required*: Clerk rejects a token with
   * no `azp` whenever this list is non-empty, so an empty list — not a
   * placeholder origin — is how you turn the check off.
   */
  readonly authorizedParties: ReadonlyArray<string>;
}

export const ClerkIdentityProvider = {
  layer: (options: ClerkOptions): Layer.Layer<IdentityProvider> =>
    Layer.effect(IdentityProvider)(
      Effect.gen(function* () {
        yield* assertUsableVerificationKey(options.jwtKey);
        const authorizedParties = [...options.authorizedParties];

        return {
          verify: (credential) =>
            Effect.tryPromise(() =>
              verifyToken(credential, { jwtKey: options.jwtKey, authorizedParties }),
            ).pipe(
              Effect.map((claims) => Option.some(identityFrom(claims))),
              // Every verification failure is the same answer to the caller:
              // this is not a credential. Logged at debug because a rejected
              // token is routine traffic, not an incident — and never with the
              // token itself, which is still a live credential elsewhere.
              Effect.catch((error) =>
                Effect.as(
                  Effect.logDebug(`Rejected a session token: ${reasonFor(error.cause)}`),
                  Option.none(),
                ),
              ),
            ),
        };
      }),
    ),
};
