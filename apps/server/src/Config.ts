import { Config, Redacted } from "effect";

/**
 * The database the committed `compose.yaml` brings up on `pnpm db:up`.
 *
 * These are not credentials in any meaningful sense — the same throwaway
 * user/password are in `compose.yaml`, the port is bound to loopback, and a
 * deployment supplies `DATABASE_URL` from its own secret store. Defaulting it
 * here is what makes `pnpm db:up && pnpm -F server dev` work with no setup.
 */
export const DEV_DATABASE_URL = "postgres://taverns:taverns@127.0.0.1:5433/taverns";

export const databaseUrl = Config.redacted("DATABASE_URL").pipe(
  Config.withDefault(Redacted.make(DEV_DATABASE_URL)),
);

export const port = Config.port("PORT").pipe(Config.withDefault(3000));

/**
 * Origins allowed to call the API from a browser. `apps/web` runs on 5173 in
 * development; a deployment sets `ALLOWED_ORIGINS` to its own.
 *
 * Read here rather than in `app.ts` because two things need it: the CORS
 * allowlist, and the `azp` audience check on a hosted session token. Those two
 * answer the same question — "which front end is this?" — and drifting apart
 * fails in a way nobody enjoys diagnosing: the browser is allowed to make the
 * call, and the server then rejects the credential it carries.
 */
export const allowedOrigins = Config.string("ALLOWED_ORIGINS").pipe(
  Config.map((value) => value.split(",").map((origin) => origin.trim())),
  Config.withDefault(["http://localhost:5173", "http://127.0.0.1:5173"]),
);

/**
 * Clerk's JWT public verification key, in PEM form.
 *
 * **Not a secret** — it is a public key, and verification is the only thing it
 * can do. Clerk dashboard → API keys → Show JWT public key → PEM Public Key.
 * `CLERK_SECRET_KEY` is deliberately absent from this file and from the
 * server: nothing in this design needs it, and adding it would put a
 * credential capable of *minting* sessions next to the one that only checks
 * them.
 *
 * `Option` rather than a default, because `None` is a supported mode and not a
 * missing value: unset means no hosted sign-in is configured, machine tokens
 * still work, and the whole suite still passes. There is no sensible committed
 * default for a key that differs per instance.
 */
export const clerkJwtKey = Config.option(Config.string("CLERK_JWT_KEY"));
