import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import * as Database from "../Database.js";
import { importSystemSpells } from "../spells/import.js";

/**
 * Loads the pinned 2014 SRD spells into the shared `system` corpus and exits.
 *
 *   pnpm -F server spell:import
 *
 * Idempotent and offline: the source data is the checked-in snapshot in
 * `spells/systemSpells.ts`, and `Database.layer` runs migrations first.
 */
NodeRuntime.runMain(
  importSystemSpells().pipe(
    Effect.flatMap((result) =>
      Console.log(
        `spells: ${result.seen} seen, ${result.inserted} inserted, ${result.updated} updated`,
      ),
    ),
    Effect.provide(Layer.provide(Database.layer, NodeServices.layer)),
  ),
);
