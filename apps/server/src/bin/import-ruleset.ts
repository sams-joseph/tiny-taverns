import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import * as Database from "../Database.js";
import { importSystemOptions } from "../ruleset/import.js";

/**
 * Loads the bundled classes and species into the shared `system` vocabulary and
 * exits.
 *
 *   pnpm -F server ruleset:import
 *
 * Idempotent — see `ruleset/import.ts`, which also explains why this is a shell
 * command and not an endpoint, and why it is the one importer that writes a
 * visibility. Migrations run first, because `Database.layer` includes them, so
 * this works on a fresh database.
 *
 * A campaign with no options copied in still has a full picker after this: the
 * bundle belongs to every campaign at once, which is what `corpusRowReadable`'s
 * `unowned` half means.
 */
NodeRuntime.runMain(
  importSystemOptions().pipe(
    Effect.flatMap((result) =>
      Console.log(`ruleset: ${result.inserted} inserted, ${result.updated} updated`),
    ),
    Effect.provide(Layer.provide(Database.layer, NodeServices.layer)),
  ),
);
