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
type TurboTask = { readonly cache?: boolean; readonly passThroughEnv?: ReadonlyArray<string> };
const turboJson: { readonly tasks: Record<string, TurboTask> } = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../turbo.json", import.meta.url)), "utf8"),
) as { readonly tasks: Record<string, TurboTask> };

/**
 * `server#test` replaces the generic `test` for this package rather than
 * merging with it, so both must name the variables.
 */
const serverTestTasks = ["test", "server#test"] as const;

describe("the database the suite runs against", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each(serverTestTasks)("reaches the suite through turbo's %s", (task) => {
    expect(turboJson.tasks[task]?.passThroughEnv).toContain("DATABASE_URL");
  });

  /**
   * CI keeps turbo's cache between runs, and a replayed pass says nothing about
   * the database this run would have met: no input turbo hashes can see it.
   */
  it("is never answered from turbo's cache", () => {
    expect(turboJson.tasks["server#test"]?.cache).toBe(false);
  });

  it.each([undefined, ""])("refuses to run when DATABASE_URL is %j", async (value) => {
    vi.stubEnv("DATABASE_URL", value);
    vi.resetModules();
    await expect(import("./support/database.js")).rejects.toThrow(/DATABASE_URL is not set/);
  });
  it.each(serverTestTasks)("passes a run's database prefix through turbo's %s too", (task) => {
    expect(turboJson.tasks[task]?.passThroughEnv).toContain("TAVERNS_TEST_DATABASE_PREFIX");
  });
});

/**
 * A run sharing a Postgres server with somebody else's (the gate on the
 * development server) names its per-file databases under a prefix of its own,
 * because every file force-drops the database it is about to create.
 */
describe("the per-file database name", () => {
  it("is the file's own name without a prefix", async () => {
    const { testDatabaseName } = await import("./support/database.js");
    expect(testDatabaseName("taverns_test_spells", undefined)).toBe("taverns_test_spells");
    expect(testDatabaseName("taverns_test_spells", "")).toBe("taverns_test_spells");
  });

  it("sits under the run's prefix when one is set", async () => {
    const { testDatabaseName } = await import("./support/database.js");
    expect(testDatabaseName("taverns_test_spells", "taverns_gate_0a1b2c3d")).toBe(
      "taverns_gate_0a1b2c3d_taverns_test_spells",
    );
  });

  it("refuses a prefix that is not a plain identifier", async () => {
    const { testDatabaseName } = await import("./support/database.js");
    expect(() => testDatabaseName("taverns_test_spells", 'x"; drop database taverns; --')).toThrow(
      /TAVERNS_TEST_DATABASE_PREFIX/,
    );
  });

  it("refuses a name Postgres would truncate", async () => {
    const { testDatabaseName } = await import("./support/database.js");
    expect(() => testDatabaseName("taverns_test_spells", "p".repeat(44))).toThrow(/63 characters/);
  });
});
