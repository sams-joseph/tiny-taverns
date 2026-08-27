import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every consumer of this package builds it before doing anything that reads it.
 *
 * `@taverns/api` is the one workspace package consumed through `dist` rather
 * than through source — `apps/server` is executed by plain `node`, which cannot
 * load `.ts` out of `node_modules`, so the exports map names `dist/index.js`
 * and nothing else. That makes this package's build a real prerequisite of
 * anything that imports it: its tests, its typecheck and its own build.
 *
 * `turbo.json` already says so — `build`, `typecheck` and `test` each declare
 * `dependsOn: ["^build"]`. **But a per-package script run directly never goes
 * through turbo**, and `pnpm -F server test` is how people run one suite. The
 * declaration did not apply, so those commands ran against whatever happened to
 * be on disk.
 *
 * What made it expensive is that neither failure names the build. An *absent*
 * `dist` is at least legible ("Failed to resolve entry for package"). A *stale*
 * one resolves fine and hands the importer `undefined` for every export added
 * since it was built:
 *
 * - the suite fails to collect with
 *   `TypeError: Cannot read properties of undefined (reading 'ast')` raised
 *   inside `SchemaAST`, pointing at the `Schema.Struct` in
 *   `apps/server/src/assistant/toolkit.ts` that named the missing export;
 * - `typecheck` reports one `TS2307` and then dozens of consequent type errors
 *   spread across untouched files.
 *
 * Both were reported as bugs in the code they pointed at, twice each, and one
 * of them had a task opened against it. So each script opens by asking turbo
 * for its own dependencies' `build`, which is `^build` spelled as a filter. On
 * an up to date tree that is a cache hit costing ~160ms; on a fresh clone it is
 * the build that makes the command work at all.
 *
 * Two details are deliberate:
 *
 * - **`<package>^...`, not `@taverns/api`.** `^...` selects the package's own
 *   declared dependencies, so the clause stays the same statement `turbo.json`
 *   makes and cannot drift out of step with what a package actually depends on.
 * - **`lint` and `dev` are out.** `eslint` here reads no cross-package types and
 *   was measured clean with `dist` deleted; `dev` is the one task `turbo.json`
 *   deliberately declares no `^build` for, and a script that disagreed with the
 *   declaration would be a second answer to the same question.
 */
const root = new URL("../../../", import.meta.url);

/** The tasks `turbo.json` declares `^build` for that provably read `dist`. */
const guarded = ["build", "typecheck", "test"] as const;

type Manifest = {
  readonly name?: string;
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
};

const workspace = (): ReadonlyArray<readonly [string, Manifest]> =>
  ["apps", "packages"]
    .flatMap((group) =>
      readdirSync(new URL(`${group}/`, root), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${group}/${entry.name}`),
    )
    .flatMap((directory) => {
      try {
        return [
          [
            directory,
            JSON.parse(
              readFileSync(fileURLToPath(new URL(`${directory}/package.json`, root)), "utf8"),
            ) as Manifest,
          ],
        ] as const;
      } catch {
        // `packages/design-system` is a vendored delivery with no manifest.
        return [];
      }
    });

const consumers = workspace().filter(
  ([, manifest]) =>
    ({ ...manifest.dependencies, ...manifest.devDependencies })["@taverns/api"] !== undefined,
);

const cases = consumers.flatMap(([directory, manifest]) =>
  guarded
    .filter((script) => manifest.scripts?.[script] !== undefined)
    .map((script) => [directory, script, manifest] as const),
);

describe("the packages that consume @taverns/api through its dist", () => {
  it("finds them — a sweep that matched nothing would pass vacuously", () => {
    expect(consumers.map(([directory]) => directory).sort()).toEqual(["apps/server", "apps/web"]);
    expect(cases).toHaveLength(6);
  });

  it.each(cases)(
    "%s: `%s` builds its workspace dependencies first",
    (_directory, script, manifest) => {
      // Deleting this clause is the regression: the command then runs against
      // whatever dist happens to be on disk and blames the code it points at.
      expect(manifest.scripts?.[script]).toMatch(
        new RegExp(`^turbo run build --filter=${manifest.name}\\^\\.\\.\\. &&`),
      );
    },
  );
});

describe("why that build is a prerequisite at all", () => {
  it("publishes dist and nothing else, so a consumer cannot fall back to source", () => {
    const self = JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ) as { readonly exports: Record<string, unknown> };

    // If this ever points at `src` the way `packages/ui`'s does, the coupling
    // above is gone and the guard should be reconsidered rather than kept.
    expect(self.exports["."]).toEqual({
      types: "./dist/index.d.ts",
      default: "./dist/index.js",
    });
  });
});
