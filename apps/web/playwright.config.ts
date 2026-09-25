import { defineConfig, devices } from "@playwright/test";
import { freePort } from "./e2e/support/port";

process.env.E2E_PORT ??= String(await freePort());
const origin = `http://127.0.0.1:${process.env.E2E_PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // The web and server suites' load-sensitive budget (AGENTS.md): each test
  // loads the dev server's unbundled app from cold, which a busy machine slows.
  timeout: 60_000,
  // A web-first wait is on the same dev server: a screen's reads run in a
  // chain (the campaign, then the encounter, then the bestiary), and under
  // load the chain outlasts the default 5s while nothing is wrong with the
  // page. Only waits retry; a measured layout value is asserted once.
  expect: { timeout: 20_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: origin,
    trace: "retain-on-failure",
  },
  projects: [
    /**
     * The shell's geometry over the stub API, signed in with a stand-in session.
     * Signing in through Clerk against a real server is the authenticated
     * suite's, in its own config (`playwright.auth.config.ts`).
     */
    {
      name: "layout",
      testDir: "e2e/layout",
      use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    command: `vite --config e2e/stub/vite.config.ts --host 127.0.0.1 --port ${process.env.E2E_PORT} --strictPort`,
    url: `${origin}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    // Process env beats `.env.local`, so a developer's own API URL or Clerk
    // key cannot redirect the suite.
    env: { VITE_API_URL: `${origin}/stub`, VITE_CLERK_PUBLISHABLE_KEY: "" },
  },
});
