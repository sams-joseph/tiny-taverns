import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A second kind of credential: an account may now be reached by a hosted
 * identity provider's session token as well as by a machine token.
 *
 * The column names Clerk because it holds *Clerk's* opaque user id and nothing
 * else — a value only Clerk can mint and only Clerk can interpret. The service
 * that reads it names no vendor (`IdentityProvider`); this is the one place
 * below the seam where the provider is written down, and that is deliberate:
 * a second provider is a new column and a new layer, not a rewrite. The
 * internal `uuid` stays the primary key, so nothing else in the schema ever
 * references an external id.
 *
 * Forward-only, like every migration here. `Migrator` has no down concept.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table account add column clerk_user_id text unique`;

  // A Clerk-authenticated DM holds no machine token, and minting one that
  // nobody will ever hold would be inventing a credential to satisfy a
  // constraint. In Postgres a unique constraint permits many NULLs, so the
  // existing unique index on `token_hash` keeps working untouched.
  yield* sql`alter table account alter column token_hash drop not null`;

  // …but an account with neither credential can never be authenticated by
  // anyone, so it is a bug rather than a state. Every existing row was created
  // by `accounts.issue` and already has a `token_hash`, so this holds on the
  // current data with no backfill.
  yield* sql`
    alter table account add constraint account_has_a_credential
      check (clerk_user_id is not null or token_hash is not null)
  `;
});
