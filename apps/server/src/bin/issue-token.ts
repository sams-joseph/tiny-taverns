import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import { Accounts, DEFAULT_ACCOUNT_NAME } from "../Accounts.js";
import * as Database from "../Database.js";

/**
 * Creates an account and prints its bearer token once.
 *
 *   pnpm -F server token:issue "Jo"
 *
 * The plaintext token is never stored — only a SHA-256 digest — so a lost token
 * is reissued, not recovered.
 */
const program = Effect.gen(function* () {
  // Not "DM": a machine token is a credential for whoever holds it, and since
  // the invite landed that is as likely to be somebody at the table as the
  // person running it. One answer to "we were not told a name", in `Accounts`.
  const name = process.argv[2] ?? DEFAULT_ACCOUNT_NAME;
  const accounts = yield* Accounts;
  const issued = yield* accounts.issue(name);
  yield* Console.log(`account ${issued.accountId} (${issued.name})`);
  yield* Console.log(`token   ${issued.token}`);
  yield* Console.log("");
  yield* Console.log("Shown once. Use it as: Authorization: Bearer <token>");
});

NodeRuntime.runMain(
  program.pipe(
    Effect.provide(
      Accounts.layer.pipe(Layer.provide(Database.layer), Layer.provide(NodeServices.layer)),
    ),
  ),
);
