import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import * as Database from "../Database.js";
import { importSystemMagicItems } from "../magic-items/import.js";

NodeRuntime.runMain(
  Effect.gen(function* () {
    const result = yield* importSystemMagicItems();
    yield* Effect.logInfo(
      `Imported ${result.seen} magic items (${result.inserted} inserted, ${result.updated} updated).`,
    );
  }).pipe(Effect.provide(Database.layer), Effect.orDie),
);
