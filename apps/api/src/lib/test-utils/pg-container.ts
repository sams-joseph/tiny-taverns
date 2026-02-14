import * as NodeContext from "@effect/platform-node/NodeContext";
import * as FileSystem from "@effect/platform/FileSystem";
import { PgMigrator } from "@effect/sql-pg";
import * as PgClient from "@effect/sql-pg/PgClient";
import * as SqlClient from "@effect/sql/SqlClient";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { String } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export class PgContainer extends Effect.Service<PgContainer>()("PgContainer", {
  scoped: Effect.acquireRelease(
    Effect.promise(() =>
      new PostgreSqlContainer("postgres:alpine")
        .withUsername("postgres")
        .withPassword("postgres")
        .withDatabase("tiny-taverns")
        .start(),
    ),
    (container) => Effect.promise(() => container.stop()),
  ),
}) {
  static readonly Live = Layer.effectDiscard(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const fs = yield* FileSystem.FileSystem;

      const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
      const schemaPath = path.resolve(
        currentFileDir,
        "../../../../../packages/adapter-postgres/src/migrations/sql/_schema.sql",
      );

      const schema = yield* fs.readFileString(schemaPath);
      yield* sql.unsafe(schema);

      // yield* PgMigrator.run({
      //   loader: PgMigrator.fromFileSystem(
      //     path.resolve(
      //       currentFileDir,
      //       "../../../../../packages/adapter-postgres/src/migrations",
      //     ),
      //   ),
      // });
    }),
  ).pipe(
    Layer.provideMerge(
      Layer.unwrapEffect(
        Effect.gen(function* () {
          const container = yield* PgContainer;
          return PgClient.layer({
            url: Redacted.make(container.getConnectionUri()),
            transformQueryNames: String.camelToSnake,
            transformResultNames: String.snakeToCamel,
          });
        }),
      ),
    ),
    Layer.provide(PgContainer.Default),
    Layer.provide(NodeContext.layer),
    Layer.orDie,
  );
}
