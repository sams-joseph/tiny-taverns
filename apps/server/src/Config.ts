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
