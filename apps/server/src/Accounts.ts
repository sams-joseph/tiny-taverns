import { type AccountId, Actor } from "@taverns/api";
import { Context, Effect, Layer, Option } from "effect";
import type { SqlError } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql";
import { createHash, randomBytes } from "node:crypto";

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
 * The DM's identity, and the only thing a bearer token can resolve to today.
 *
 * There is deliberately no player credential: the report is explicit that no
 * player-facing surface is built yet, only the seam. The `player` role exists
 * in `Actor` and in every SQL predicate; nothing mints one over HTTP.
 */
export class Accounts extends Context.Service<
  Accounts,
  {
    readonly issue: (name: string) => Effect.Effect<IssuedToken, SqlError.SqlError>;
    readonly actorForToken: (
      token: string,
    ) => Effect.Effect<Option.Option<Actor>, SqlError.SqlError>;
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
              : Option.some(new Actor({ accountId: row.id, role: "dm" }));
          }),
      };
    }),
  );
}
