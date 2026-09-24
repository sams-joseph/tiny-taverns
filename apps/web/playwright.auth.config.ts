import { defineConfig, devices } from "@playwright/test";
import { freePort } from "./e2e/support/port";

/**
 * The authenticated suite: signs in through Clerk's development instance with
 * `@clerk/testing` against the real API server and a database of its own. Its
 * own config rather than a project beside `layout`, because Playwright starts
 * every `webServer` and runs global setup whichever project is selected, and
 * the layout suite needs neither Postgres nor Clerk keys. See `e2e/README.md`.
 */

process.env.E2E_AUTH_WEB_PORT ??= String(await freePort());
process.env.E2E_AUTH_API_PORT ??= String(await freePort());

export default defineConfig({
  testDir: "e2e/auth",
  outputDir: "test-results-auth",
  globalSetup: "./e2e/auth/global-setup.ts",
  // One test at a time: they share two Clerk users and one database, and the
  // suite is three tests long.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-auth" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${process.env.E2E_AUTH_WEB_PORT}`,
    // No traces: one records every request, and a Frontend API request carries
    // the Clerk testing token in its query string. A failure keeps a
    // screenshot and the page's accessibility snapshot instead.
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "auth" }],
});
