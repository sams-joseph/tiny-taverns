import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import { importSystemBestiary } from "../bestiary/import.js";
import * as Database from "../Database.js";

/**
 * Loads the Taverns starter bestiary and the pinned 2014 SRD monster corpus
 * into the shared `system` corpus and exits.
 *
 *   pnpm -F server bestiary:import
 *
 * Idempotent — see `bestiary/import.ts`, which also explains why this is a
 * shell command and not an endpoint. Migrations run first, because
 * `Database.layer` includes them, so this works on a fresh database.
 */
NodeRuntime.runMain(
  importSystemBestiary().pipe(
    Effect.flatMap((result) =>
      Console.log(
        `bestiary: starter ${result.starter.inserted} inserted, ${result.starter.updated} updated; ` +
          `2014 SRD monsters ${result.srd.inserted} inserted, ${result.srd.updated} updated (${result.srd.seen} seen)`,
      ),
    ),
    Effect.provide(Layer.provide(Database.layer, NodeServices.layer)),
  ),
);
