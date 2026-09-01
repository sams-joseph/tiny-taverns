import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import * as Database from "../Database.js";
import { importSystemOptions } from "../ruleset/import.js";
import { importSystemRuleArticles } from "../ruleset/rules.js";

/**
 * Loads the bundled classes, races, backgrounds and rules reference into the shared `system`
 * vocabulary and exits.
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
  Effect.gen(function* () {
    const options = yield* importSystemOptions();
    const articles = yield* importSystemRuleArticles();
    yield* Console.log(
      `ruleset: ${options.inserted} options inserted, ${options.updated} options updated; ` +
        `${articles.articlesInserted} articles inserted, ${articles.articlesUpdated} articles updated, ` +
        `${articles.sections} sections synced`,
    );
  }).pipe(Effect.provide(Layer.provide(Database.layer, NodeServices.layer))),
);
