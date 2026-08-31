import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import * as Database from "../Database.js";
import { importSystemEquipment } from "../equipment/import.js";

const program = Effect.gen(function* () {
  const result = yield* importSystemEquipment();
  yield* Effect.logInfo(
    `Imported ${result.seen} equipment rows (${result.inserted} inserted, ${result.updated} updated).`,
  );
});

NodeRuntime.runMain(program.pipe(Effect.provide(Database.layer)));
