import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import { importSystemCreatures } from "../bestiary/import.js";
import * as Database from "../Database.js";

/**
 * Loads the bundled bestiary into the shared `system` corpus and exits.
 *
 *   pnpm -F server bestiary:import
 *
 * Idempotent — see `bestiary/import.ts`, which also explains why this is a
 * shell command and not an endpoint. Migrations run first, because
 * `Database.layer` includes them, so this works on a fresh database.
 */
NodeRuntime.runMain(
  importSystemCreatures().pipe(
    Effect.flatMap((result) =>
      Console.log(`bestiary: ${result.inserted} inserted, ${result.updated} updated`),
    ),
    Effect.provide(Layer.provide(Database.layer, NodeServices.layer)),
  ),
);
