import { createServer } from "node:net";
import { defineConfig, devices } from "@playwright/test";

/**
 * A port nobody holds right now, so the suite never lands on somebody's 5173.
 * The config is evaluated again in every worker; the runner sets `E2E_PORT`
 * before it forks them, so they all agree on one server.
 */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });

process.env.E2E_PORT ??= String(await freePort());
const origin = `http://127.0.0.1:${process.env.E2E_PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // The web and server suites' load-sensitive budget (AGENTS.md): each test
  // loads the dev server's unbundled app from cold, which a busy machine slows.
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: origin,
    trace: "retain-on-failure",
  },
  projects: [
    /**
     * The shell's geometry over the stub API, signed in with a machine token.
     * An authenticated suite against a real server is a second project with
     * its own `testDir` and `webServer` entry; see `e2e/README.md`.
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
