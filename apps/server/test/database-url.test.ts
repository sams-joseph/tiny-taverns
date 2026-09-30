import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * How the suite finds its Postgres, and why it never guesses.
 *
 * Turbo runs tasks in strict env mode, which drops any variable `turbo.json`
 * does not name. Before `DATABASE_URL` was passed through, `turbo run test`
 * quietly lost it and the suite fell back to the development default on 5433:
 * CI passed only because its service happened to sit there, and a worker who
 * pointed the suite at a private Postgres landed on somebody else's database,
 * where every file force-drops a database of a fixed name.
 */
const turboJson: {
  readonly tasks: Record<string, { readonly passThroughEnv?: ReadonlyArray<string> }>;
} = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../turbo.json", import.meta.url)), "utf8"),
) as { readonly tasks: Record<string, { readonly passThroughEnv?: ReadonlyArray<string> }> };

describe("the database the suite runs against", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reaches the suite through turbo", () => {
    expect(turboJson.tasks.test?.passThroughEnv).toContain("DATABASE_URL");
  });

  it.each([undefined, ""])("refuses to run when DATABASE_URL is %j", async (value) => {
    vi.stubEnv("DATABASE_URL", value);
    vi.resetModules();
    await expect(import("./support/database.js")).rejects.toThrow(/DATABASE_URL is not set/);
  });
});
