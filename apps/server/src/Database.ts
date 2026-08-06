import { NodeServices } from "@effect/platform-node";
import { PgClient, PgMigrator } from "@effect/sql-pg";
import { Config, Effect, Layer } from "effect";
import { Migrator, SqlError } from "effect/unstable/sql";
import { fileURLToPath } from "node:url";
import { databaseUrl } from "./Config.js";

/** Connection pool. Provides both `PgClient` and the generic `SqlClient`. */
export const layerClient = PgClient.layerConfig({
  url: databaseUrl,
  // `layerConfig` takes a `Config.Wrap`, so every field is a `Config` — even the
  // ones that are not configurable.
  applicationName: Config.succeed("taverns"),
});

/**
 * Directory holding the numbered migration files.
 *
 * Resolved from this module's own location rather than the working directory,
 * so it points at `src/migrations/*.ts` under `tsx`/Vitest and at
 * `dist/migrations/*.js` under `node dist/main.js` without a second setting.
 */
export const migrationsDirectory = fileURLToPath(new URL("./migrations", import.meta.url));

/**
 * Runs pending migrations during layer construction, so the server refuses to
 * start against a schema it does not understand. Forward-only: `Migrator` has
 * no down-migration concept and none is faked here.
 */
export const layerMigrator = PgMigrator.layer({
  loader: Migrator.fromFileSystem(migrationsDirectory),
});

/**
 * Pool plus migrations. What everything else depends on.
 *
 * `NodeServices` is provided here rather than by every caller: the migrator
 * needs `FileSystem` and `Path` to read the migration directory, and
 * `ChildProcessSpawner` because `PgMigrator` can shell out to `pg_dump` for a
 * schema dump — a capability nothing here asks for but that is in the type.
 */
export const layer = Layer.provideMerge(layerMigrator, layerClient).pipe(
  Layer.provide(NodeServices.layer),
  // `pnpm -F server test` runs the built server for real, so an unreachable
  // database shows up as a boot failure. Say what to do about it there too,
  // not only in the test harness.
  Layer.tapError((error) =>
    SqlError.isSqlError(error) && error.reason._tag === "ConnectionError"
      ? Effect.logError(
          "Cannot reach Postgres. In development, `pnpm db:up` starts it; otherwise check DATABASE_URL.",
        )
      : Effect.void,
  ),
);
