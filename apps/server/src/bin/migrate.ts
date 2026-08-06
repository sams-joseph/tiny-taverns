import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import * as Database from "../Database.js";

/**
 * Runs pending migrations and exits.
 *
 *   pnpm -F server migrate
 *
 * `pnpm -F server dev` and `start` migrate on boot too, so this is for CI and
 * for running migrations without holding a port.
 */
NodeRuntime.runMain(
  Console.log("migrations up to date").pipe(
    Effect.provide(Layer.provide(Database.layer, NodeServices.layer)),
  ),
);
