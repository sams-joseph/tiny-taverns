import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Config, Console, Effect, Layer, Redacted } from "effect";
import { PgClient } from "@effect/sql-pg";
import { SqlClient } from "effect/unstable/sql";
import { databaseUrl } from "../Config.js";
import * as Database from "../Database.js";

/**
 * The explicit operator reset — `pnpm -F server db:reset:fresh -- --force`.
 *
 * The clean-baseline decision of 2026-09-01 (see `0001_init.ts`) rewrote the
 * migration ledger, and `Migrator.run` skips ids at or below the highest
 * applied — so a database that ran the old ledger silently keeps the old shape
 * for ever. `pnpm db:reset` is the Docker spelling of the remedy; this is the
 * one for a Postgres this project does not own the container of: drop the
 * database `DATABASE_URL` names, create it empty, and run the whole ledger.
 *
 * **This is the only destructive DDL in the product, and it never runs at
 * server startup** — the server migrates on boot and refuses a schema it does
 * not know, but it drops nothing, ever. Destruction is this command, run by a
 * person, twice-armed: the command's own name says what it does, and it still
 * refuses without `--force`, because a reset typed into the wrong shell with
 * the wrong `DATABASE_URL` is somebody's campaign gone.
 */
const FORCE = process.argv.includes("--force");

const program = Effect.gen(function* () {
  const url = new URL(Redacted.value(yield* databaseUrl));
  const target = url.pathname.replace(/^\//, "");
  if (target === "") {
    return yield* Effect.die(new Error("DATABASE_URL names no database to reset"));
  }
  if (!FORCE) {
    yield* Console.error(
      `refusing to drop "${target}" on ${url.host} — run with --force if you really mean it:\n` +
        `  pnpm -F server db:reset:fresh -- --force`,
    );
    return yield* Effect.die(new Error("not forced"));
  }

  // The maintenance connection: same server, the `postgres` database, because
  // Postgres cannot drop the database it is connected to.
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";

  yield* Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // `with (force)` (Postgres 13+) disconnects lingering sessions, so a dev
    // server left running does not turn the reset into a hung command.
    yield* sql.unsafe(`drop database if exists "${target}" with (force)`);
    yield* sql.unsafe(`create database "${target}"`);
    yield* Console.log(`dropped and recreated "${target}" on ${url.host}`);
  }).pipe(
    Effect.provide(
      Layer.provide(
        PgClient.layerConfig({ url: Config.succeed(Redacted.make(maintenance.toString())) }),
        NodeServices.layer,
      ),
    ),
  );

  // The whole ledger, through the same layer the server boots with.
  yield* Console.log("running migrations…");
  yield* Effect.provide(
    Console.log("fresh database ready"),
    Layer.provide(Database.layer, NodeServices.layer),
  );
});

NodeRuntime.runMain(program);
