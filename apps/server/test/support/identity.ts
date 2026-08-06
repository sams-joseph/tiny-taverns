import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";

/**
 * A throwaway identity provider instance, entirely in this process.
 *
 * The suite verifies the hosted sign-in path without a vendor account, a
 * network call, or a credential of any kind: `verifyToken` checks a token
 * against whatever public key it is handed, so a test can generate its own
 * keypair, sign a session-shaped JWT, and configure the server with the
 * matching PEM. Nothing here is or resembles a real key — every keypair is
 * generated fresh when the file runs and is gone when the process exits.
 *
 * This is deliberately not `@clerk/testing`. Its testing tokens are issued by
 * a live instance, need a secret key, and exist to bypass bot detection in
 * browser E2E runs — a problem this suite does not have, in exchange for a
 * vendor account this suite must never need.
 */

/** Matches the default CORS allowlist, so `azp` and the origin list agree. */
export const TEST_ORIGIN = "http://localhost:5173";

/**
 * One `kid` per keypair, per process — and the reason is a trap, not tidiness.
 *
 * `@clerk/backend` caches the PEM→JWK conversion keyed by `kid`, at module
 * level, with expiry explicitly disabled (`loadClerkJwkFromPem`). On a cache
 * hit the PEM you passed is *ignored*. So two keypairs sharing a `kid` — and
 * every token with no `kid` at all shares the key `local-undefined` — means
 * the second key silently verifies against the first, and the "wrong key is
 * rejected" test passes for the wrong reason and would keep passing if the
 * check were deleted. Same shape as the `Context.Reference` fetch memoisation
 * already recorded in AGENTS.md.
 */
let keypairCount = 0;

export interface SessionClaims {
  /** The provider's user id — what lands in `account.clerk_user_id`. */
  readonly subject: string;
  /** The optional custom name claim. Omitted means the provider sent none. */
  readonly name?: string;
  /** Authorized party. Defaults to `TEST_ORIGIN`. */
  readonly azp?: string;
  /** Lifetime from now; negative mints an already-expired token. */
  readonly expiresInSeconds?: number;
}

export interface TestIdentityInstance {
  /** The PEM public key the server is configured with. */
  readonly jwtKey: string;
  /** A session token this instance vouches for. */
  readonly sessionToken: (claims: SessionClaims) => string;
}

const base64url = (value: string): string => Buffer.from(value, "utf8").toString("base64url");

const signed = (header: object, payload: object, privateKey: KeyObject): string => {
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
};

export const testIdentityInstance = (): TestIdentityInstance => {
  // 2048 bits is not arbitrary: Clerk converts the PEM to a JWK by stripping
  // the fixed SPKI prefix of a 2048-bit RSA key, so nothing else works.
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = `test-key-${++keypairCount}`;

  return {
    jwtKey: publicKey.export({ type: "spki", format: "pem" }).toString(),

    sessionToken: ({ subject, name, azp = TEST_ORIGIN, expiresInSeconds = 60 }) => {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + expiresInSeconds;
      // An `iat` in the future is rejected in its own right, so an expired
      // token has to have been issued before it expired.
      const issuedAt = Math.min(now, exp - 1);

      return signed(
        { alg: "RS256", typ: "JWT", kid },
        {
          iss: "https://identity.test",
          sub: subject,
          sid: `sess_${subject}`,
          azp,
          iat: issuedAt,
          nbf: issuedAt,
          exp,
          ...(name === undefined ? {} : { name }),
        },
        privateKey,
      );
    },
  };
};
