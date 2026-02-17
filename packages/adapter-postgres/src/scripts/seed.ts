import * as Effect from "effect/Effect";
import { PostgresClient } from "../PostgresClient.js";
import { seeds } from "../seeds/index.js";

void Effect.gen(function* () {
  if (seeds.length === 0) {
    yield* Effect.log("No seeds configured.");
    return;
  }

  for (const seed of seeds) {
    yield* Effect.log(`Seeding ${seed.name}...`);
    yield* seed.effect;
    yield* Effect.log(`Seeded ${seed.name}.`);
  }
}).pipe(
  Effect.provide(PostgresClient),
  Effect.catchAllCause((cause) => Effect.logError("Seed failed", cause)),
  Effect.runPromise,
);
