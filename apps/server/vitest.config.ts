import { defineConfig } from "vitest/config";

/**
 * The server suite's only Vitest configuration, and it exists for one reason:
 * to say the timeout budget once instead of 289 times.
 *
 * There was no config file here at all, so `vitest run` took the library
 * defaults — `testTimeout: 5000`, `hookTimeout: 10_000`. The suite disagreed
 * with both and said so a test at a time: 289 sites across 34 of the 37 files
 * carry an inline budget of their own (283 say `60_000`, three `30_000`, two
 * `180_000`, one `120_000`), stapled on whenever a file was seen to be slow.
 * What that leaves is not a budget but a lottery — **322 of 629 tests, in 22
 * files, still run on the bare 5000ms**, and which ones is an accident of who
 * happened to be watching.
 *
 * `whoami.test.ts` is the file that lost it. Almost every database-backed file
 * here seeds fixtures in a `beforeAll`, which is where the layer gets built and
 * therefore where `migratedDatabase`'s `drop database` / `create database` /
 * eighteen-migration run is paid for — charged to `hookTimeout`, and annotated.
 * `whoami.test.ts` has no `beforeAll`: its `ManagedRuntime` is lazy, so the
 * whole of that cost lands inside the body of its *first* test, against
 * `testTimeout`, with no annotation. Measured against a real Postgres on a
 * 24-core box that same test costs **2369ms idle** — half the default budget
 * gone before it asserts anything — and 4555ms with the machine oversubscribed.
 * Under the pipeline CI actually runs (`turbo run lint typecheck test build`,
 * every package's suites concurrent) it went red in 2 of 6 runs at 5050ms and
 * 5051ms, which is the flake as reported, to within a few milliseconds.
 *
 * So the number is not a guess and it is not the web app's 20s copied across:
 *
 * - It is the number **this** suite already asserts, 283 times, for exactly
 *   this class of work. Choosing anything else would add yet another number to
 *   a file set that already speaks in 30/60/120/180; choosing this one makes
 *   the 283 redundant rather than contradictory, and makes the next file that
 *   forgets to write one safe by default. (They are deliberately left in
 *   place for now — deleting 289 lines across 34 files is a mechanical diff
 *   that would collide with everything else in flight, and it changes no
 *   behaviour once this is set.)
 * - It is eight times the measured loaded ceiling of the slowest test that is
 *   on the bare default today — `whoami.test.ts`'s first, which ranged 3.7s to
 *   **7.0s** across fourteen loaded pipeline runs — and the suite itself runs
 *   in 6.5s idle and ~40s fully loaded end to end. So a single test sitting for
 *   a minute is unambiguously stuck rather than merely unlucky, and still fails
 *   the run far inside any CI job timeout.
 * - It is not generous for the tail. `start.smoke.test.ts` compiles the server
 *   with `tsc` inside the test body — 2.2s idle, **15.5s** under the same load,
 *   before a process is even spawned — and blew its own inline 60s in 3 of
 *   those 6 runs, reaching 101.1s at the worst. That test keeps a budget of its
 *   own (180s); see the reasoning there. It is the evidence against going lower
 *   here, not for going higher.
 *
 * This is *not* the connection-pool ceiling AGENTS.md describes under "A pool
 * per file against `max_connections = 100`". That one is a different failure
 * with a different signature: sampled every 250ms through a fully loaded run,
 * this suite peaked at **30 client backends out of 100** and never saw a
 * refusal, and exhaustion surfaces as `test/support/database.ts`'s loud
 * `pnpm db:up` message rather than as a timeout — so a bigger budget here
 * cannot hide one. What gets you to the ceiling is several suites sharing one
 * Postgres, not this one.
 */
export default defineConfig({
  test: {
    testTimeout: 60_000,
    /**
     * The same budget for the same work. Nothing relies on this today — every
     * `beforeAll` in the suite is already annotated — but the hook and the test
     * body are paying for the identical `migratedDatabase` build, and which of
     * the two is charged is an accident of whether a file happens to seed
     * fixtures. Leaving the hook on 10_000 would leave the next `whoami.test.ts`
     * to be written the other way round.
     */
    hookTimeout: 60_000,
  },
});
