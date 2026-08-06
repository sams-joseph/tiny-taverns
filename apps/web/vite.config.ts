import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    /**
     * Hosted sign-in is off for the test run, always.
     *
     * Vitest loads `.env.local` like any other Vite build, so without this
     * line the suite behaves differently for a developer who has configured
     * Clerk than for one who has not: `AuthProvider` would mount the real
     * `ClerkProvider`, which reaches for Clerk's script over the network, and
     * the tests asserting the unconfigured path would fail on a machine that
     * is merely *set up*. Pinning it here — in committed code rather than an
     * ignored env file — makes the suite say the same thing everywhere,
     * including CI.
     *
     * Empty rather than deleted because `publishableKey()` already treats the
     * empty string as absent, and `test.env` is applied over the loaded env
     * rather than instead of it. A test that wants the configured branch
     * stubs it with `vi.stubEnv`.
     */
    env: {
      VITE_CLERK_PUBLISHABLE_KEY: "",
    },
  },
});
