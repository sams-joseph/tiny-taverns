import * as Command from "@effect/platform/Command";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { PgMigrator } from "@effect/sql-pg";
import * as PgClient from "@effect/sql-pg/PgClient";
import { Effect, Redacted } from "effect";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresClient } from "../PostgresClient.js";

NodeRuntime.runMain(
  Effect.gen(function* () {
    const migrations = yield* PgMigrator.run({
      loader: PgMigrator.fromFileSystem(
        path.join(
          fileURLToPath(new URL(".", import.meta.url)),
          "../migrations",
        ),
      ),
    });
    const schemaDirectory = path.join(
      fileURLToPath(new URL(".", import.meta.url)),
      "../migrations/sql",
    );

    if (migrations.length === 0) {
      yield* Effect.log("No new migrations to run.");
    } else {
      yield* Effect.log("Migrations applied:");
      for (const [id, name] of migrations) {
        yield* Effect.log(`- ${id.toString().padStart(4, "0")}_${name}`);
      }
    }

    const dumpSchema = Effect.gen(function* () {
      const sql = yield* PgClient.PgClient;
      const fs = yield* FileSystem.FileSystem;
      const path_ = yield* Path.Path;

      const password = sql.config.password
        ? String(Redacted.value(sql.config.password))
        : undefined;
      const databaseUrl = sql.config.url
        ? String(Redacted.value(sql.config.url))
        : undefined;
      const env = {
        PATH: globalThis.process?.env.PATH,
        PGHOST: sql.config.host,
        PGPORT: sql.config.port?.toString(),
        PGUSER: sql.config.username,
        PGPASSWORD: password,
        PGDATABASE: sql.config.database,
        PGSSLMODE: sql.config.ssl ? "require" : "prefer",
      } satisfies Record<string, string | undefined>;

      const buildCommand = (args: Array<string>) =>
        Command.env(
          Command.stderr(
            Command.make(
              "pg_dump",
              ...args,
              ...(databaseUrl ? [`--dbname=${databaseUrl}`] : []),
            ),
            "inherit",
          ),
          env,
        );

      const [schema, migrationsDump] = yield* Effect.all(
        [
          Command.string(
            buildCommand(["--schema-only", "--no-owner", "--no-privileges"]),
          ),
          Command.string(
            buildCommand([
              "--column-inserts",
              "--data-only",
              "--no-owner",
              "--no-privileges",
              "--table=effect_sql_migrations",
            ]),
          ),
        ],
        { concurrency: 2 },
      );

      const dump = `${schema}\n\n${migrationsDump}`
        .replace(/^--.*$/gm, "")
        .replace(/^\\.*$/gm, "")
        .replace(/^SET .*$/gm, "")
        .replace(/^SELECT pg_catalog\..*$/gm, "")
        .replace(/\n{2,}/gm, "\n\n")
        .trim();

      const schemaPath = path_.join(schemaDirectory, "_schema.sql");
      yield* fs.makeDirectory(path_.dirname(schemaPath), { recursive: true });
      yield* fs.writeFileString(schemaPath, dump);
    }).pipe(
      Effect.tap(() => Effect.log("Schema dumped to _schema.sql.")),
      Effect.catchAllCause((cause) =>
        Effect.logInfo("Could not dump schema", cause),
      ),
    );

    yield* dumpSchema;
    return;
  }).pipe(Effect.provide([NodeContext.layer, PostgresClient])),
);
