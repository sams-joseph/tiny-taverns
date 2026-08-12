import { type AccountId, Actor } from "@taverns/api";
import { Context, Effect, Layer, Option } from "effect";
import type { SqlError } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql";
import { createHash, randomBytes } from "node:crypto";
import type { VerifiedIdentity } from "./IdentityProvider.js";

/**
 * What a provisioned account is called when the identity provider offered no
 * name.
 *
 * **It was `"DM"`, and it stopped being right the moment players existed.**
 * Just-in-time provisioning runs on the first authenticated request from anyone,
 * and from this release most of those are people following an invitation to
 * somebody else's table. A default that asserted a role was harmless only while
 * every account was a DM by construction; now it would be wrong for the majority
 * of accounts and would be rendered as a lie on the one screen that shows a
 * name — the invitation page, which says who is asking.
 *
 * Role-neutral and honest: we do not know this person's name yet. The
 * alternative — a Backend API call to fetch the real one — buys a secret key on
 * the server and a vendor outage on the first-ever sign-in, and `identity.name`
 * already carries the real name whenever the provider offers one.
 */
export const DEFAULT_ACCOUNT_NAME = "Someone";

/** What `token:issue` prints. The plaintext token exists only here and once. */
export interface IssuedToken {
  readonly accountId: AccountId;
  readonly name: string;
  readonly token: string;
}

/**
 * Tokens are stored as a SHA-256 digest, never in plaintext: the column is a
 * lookup key, not a recoverable secret. There is no salt because the token is
 * 32 bytes of `randomBytes` — there is nothing to guess and nothing to rainbow.
 */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

/**
 * An account's identity, and the only thing a bearer token can resolve to.
 *
 * Two kinds of credential reach an account — a machine token minted by
 * `issue`, and a session token from a hosted identity provider — and they
 * converge here, on one `Actor`. Below this service nothing knows there is
 * more than one kind.
 *
 * **An actor is no longer a role.** It says which account is asking and how far
 * its credential reaches; whether it may see `dm` rows is decided per campaign,
 * by a `campaign_member` row, in `repo/visibility.ts`. So there is nothing here
 * for a player credential to be *different* about — what does not exist yet is
 * the invite that would give an account a `player` membership at somebody
 * else's table. Nothing in `src` writes one.
 */
export class Accounts extends Context.Service<
  Accounts,
  {
    readonly issue: (name: string) => Effect.Effect<IssuedToken, SqlError.SqlError>;
    readonly actorForToken: (
      token: string,
    ) => Effect.Effect<Option.Option<Actor>, SqlError.SqlError>;
    /**
     * The account belonging to a verified external identity, creating it on
     * first sight.
     *
     * Returns an `Actor` rather than an `Option`: the identity is already
     * proven, so there is no "unknown person" case to represent — just-in-time
     * provisioning means a verified stranger *is* an account. That asymmetry
     * with `actorForToken` is the point, and the type says so.
     */
    readonly actorForIdentity: (
      identity: VerifiedIdentity,
    ) => Effect.Effect<Actor, SqlError.SqlError>;
  }
>()("Accounts") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        issue: (name) =>
          Effect.gen(function* () {
            const token = randomBytes(32).toString("base64url");
            const rows = yield* sql<{ readonly id: AccountId }>`
              insert into account ${sql.insert({ name, token_hash: hashToken(token) })}
              returning id
            `;
            return { accountId: rows[0]!.id, name, token };
          }),

        actorForToken: (token) =>
          Effect.gen(function* () {
            if (token.length === 0) return Option.none();
            const rows = yield* sql<{ readonly id: AccountId }>`
              select id from account where token_hash = ${hashToken(token)}
            `;
            const row = rows[0];
            return row === undefined
              ? Option.none()
              : // `campaignId: null` — an account token reaches every campaign
                // the account is a member of. A credential scoped to one table
                // sets it, and none is minted here yet.
                Option.some(accountActor(row.id));
          }),

        actorForIdentity: (identity) =>
          Effect.gen(function* () {
            // Steady state: one indexed read, no write.
            const existing = yield* accountForSubject(sql, identity.subject);
            if (Option.isSome(existing)) return accountActor(existing.value);

            // First request from this person. `do nothing` plus a re-read
            // settles the real race — two tabs firing their first request
            // together — without either of them failing.
            const inserted = yield* sql<{ readonly id: AccountId }>`
              insert into account ${sql.insert({
                clerk_user_id: identity.subject,
                name: Option.getOrElse(identity.name, () => DEFAULT_ACCOUNT_NAME),
              })}
              on conflict (clerk_user_id) do nothing
              returning id
            `;
            const created = inserted[0];
            if (created !== undefined) return accountActor(created.id);

            const raced = yield* accountForSubject(sql, identity.subject);
            if (Option.isSome(raced)) return accountActor(raced.value);

            // The insert conflicted, so a row with this subject exists, and
            // the read that follows cannot miss it. Reaching here means the
            // unique constraint is gone, not that the request was bad.
            return yield* Effect.die(
              new Error(
                "account row vanished between an `on conflict do nothing` insert and the re-read",
              ),
            );
          }),
      };
    }),
  );
}

/**
 * An actor for a whole account.
 *
 * Both credential kinds land here, and both get `campaignId: null` — the
 * credential is minted for an account, so it reaches every campaign that
 * account is a member of. A credential scoped to one table would set it; none
 * exists yet.
 */
const accountActor = (accountId: AccountId): Actor => new Actor({ accountId, campaignId: null });

/**
 * The one place an external identity is looked up.
 *
 * `clerk_user_id` is the only vendor-named thing below the seam. It holds a
 * value only Clerk can mint or interpret, so naming it honestly beats a
 * generic column that hides which provider wrote each row — and a second
 * provider is a second column plus a layer, which the internal `uuid` primary
 * key already makes cheap.
 */
const accountForSubject = (
  sql: SqlClient.SqlClient,
  subject: string,
): Effect.Effect<Option.Option<AccountId>, SqlError.SqlError> =>
  Effect.map(
    sql<{ readonly id: AccountId }>`select id from account where clerk_user_id = ${subject}`,
    (rows) => Option.fromUndefinedOr(rows[0]?.id),
  );
