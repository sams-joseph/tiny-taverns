import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The identity seam, enforced rather than asserted.
 *
 * The architectural requirement is that the interface names no vendor and no
 * vendor type crosses the module boundary, so that swapping providers is a new
 * layer rather than an audit. Nothing about that is visible in a passing HTTP
 * test: an import added to `Authorization.ts` or a repository would work
 * perfectly and quietly undo it. This file is the only thing that notices.
 *
 * The type system agrees, which is why the rule is cheap to keep: a vendor
 * type reached by an exported signature fails to compile here at all (TS2742 —
 * the SDK's claim types live in a transitive dependency that `apps/server`
 * cannot name under pnpm's isolated layout).
 */
const sourceDirectory = fileURLToPath(new URL("../src", import.meta.url));

/** Every `.ts` file under `src`, recursively. */
const sourceFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });

const relative = (path: string): string => path.slice(sourceDirectory.length + 1);

describe("the identity provider seam", () => {
  it("confines every vendor SDK import to the one implementation module", () => {
    const importers = sourceFiles(sourceDirectory)
      .filter((path) => /from\s+"@clerk\//.test(readFileSync(path, "utf8")))
      .map(relative)
      .sort();

    expect(importers).toEqual(["ClerkIdentityProvider.ts"]);
  });

  it("keeps the interface free of any vendor name", () => {
    // Not style. A reader of this file should be unable to tell which vendor
    // is behind it, and the two non-vendor implementations the server already
    // ships — the disabled layer and the offline test double — are what prove
    // the interface did not bend to accommodate one.
    const declaration = readFileSync(`${sourceDirectory}/IdentityProvider.ts`, "utf8");

    expect(declaration.toLowerCase()).not.toContain("clerk");
  });
});
