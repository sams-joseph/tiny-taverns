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
    /**
     * Vitest's default 5000ms is a local-machine number, and this suite has
     * tests that spend most of it.
     *
     * The four slowest drive Base UI's keyboard-driven `Select` through a
     * whole dialog — see AGENTS.md, "The web suite has its own load-sensitive
     * flake", which measured the worst of them across ten whole-suite runs on
     * an unchanged tree and found it landing a hair under the default. That is
     * a budget problem rather than a performance regression: idle and in
     * isolation the same test finishes in well under a second, and what eats
     * the rest is contention from the other workers Vitest sizes off the core
     * count.
     *
     * CI's 2-core runner is where that ran out. It has an order of magnitude
     * fewer cores than the machine those numbers were taken on, so its per-test
     * wall clock is not comparable and the default cannot be tuned against a
     * local measurement at all — the honest move is a budget big enough that
     * the machine stops being the variable. 20s is four times the measured
     * local ceiling under load, and roughly thirty times the isolated cost of
     * the slowest test. It is still short enough that a genuinely hung test
     * fails the run rather than sitting on the runner's job timeout.
     */
    testTimeout: 20_000,
  },
});
