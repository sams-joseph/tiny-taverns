import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";

const testDirectory = fileURLToPath(new URL("../test", import.meta.url));

/** Every `.ts` file under `test`, recursively. */
const testFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return testFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });

describe("the in-process test server", () => {
  it("is always the long keep-alive one in support/http.ts", () => {
    // `NodeHttpServer.layerTest` keeps Node's 5 s keep-alive, which races the
    // fetch client on a loaded machine and fails with `read ECONNRESET`.
    const forbidden = /NodeHttpServer\s*\.\s*layerTest\b/;
    const users = testFiles(testDirectory)
      .filter((path) => !path.endsWith("/http.test.ts"))
      .filter((path) => forbidden.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(testDirectory.length + 1));

    expect(users).toEqual([]);
  });
});
