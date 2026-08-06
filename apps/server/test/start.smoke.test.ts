import { afterAll, describe, expect, it } from "vitest";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * How long one `GET /health` attempt may take before it is abandoned and
 * retried on a new connection.
 *
 * This is not a tuning knob, it is the fix for a real hang. The server starts
 * accepting TCP *before* it can answer: `NodeHttpServer.layer` calls
 * `server.listen` while it is being constructed, and it is constructed first
 * because `main.ts` provides it *to* the application layer — which is the layer
 * that opens the connection pool and runs the migrations. Measured on an idle
 * machine, the socket accepts at 481ms and the request handler is attached at
 * 534ms.
 *
 * A request that arrives inside that window is accepted and then dropped on the
 * floor: it is not answered late, it is never answered at all. Verified by
 * holding one open for 30s against a server that had long since logged
 * "Listening" and was answering fresh connections with 200.
 *
 * `fetch` has no response timeout, so a single retry unlucky enough to land in
 * the window used to wait forever. Under `turbo --force` the database work
 * widens the window from tens of milliseconds to seconds, which is why this
 * failed roughly one run in five with a 65s timeout against a 60s budget while
 * the compile it was blamed on took only 1.6s.
 *
 * 2s is ~150x the observed healthy response time (13ms), so it cannot fire on a
 * server that is actually serving; it only cuts short an attempt that is
 * already doomed.
 */
const ATTEMPT_TIMEOUT_MS = 2_000;

/**
 * Ask the OS for a free port so parallel runs (and a locally running `dev`
 * server on 3000) never collide.
 */
async function freePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected a TCP address from the probe server");
  }
  const { port } = address;
  probe.close();
  await once(probe, "close");
  return port;
}

let server: ChildProcess | undefined;

/** Kill the child on every exit path, including assertion failures. */
afterAll(async () => {
  if (server === undefined || server.exitCode !== null || server.killed) return;
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), delay(5_000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
});

/**
 * Smoke test for the *production* start path: `tsc` emit executed by plain
 * `node`, exactly as `pnpm -F server start` does it.
 *
 * This must not run through `tsx` or import `src` through Vitest. Both of those
 * resolve extensionless relative specifiers that Node's ESM loader rejects, and
 * that blind spot is precisely what let a broken `dist/` ship. Only running the
 * real build output under the real runtime proves the emit is loadable.
 *
 * The `tsc` invocation stays *inside* the test on purpose. Compiling here is
 * what makes it impossible for this to pass against a stale or absent `dist/`;
 * hand the compile to the build pipeline and the test's guarantee becomes a
 * guarantee about whatever happened to be on disk. It is also not the slow part
 * — measured at 1.5–1.8s under full `turbo --force` load, the same as it takes
 * alone.
 */
describe("production start (built output under plain node)", () => {
  it("boots dist/main.js and answers GET /health", async () => {
    await execFileAsync("node_modules/typescript/bin/tsc", ["-p", "tsconfig.build.json"], {
      cwd: appDir,
    });

    const port = await freePort();
    server = spawn(process.execPath, ["dist/main.js"], {
      cwd: appDir,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    server.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    server.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));

    const deadline = Date.now() + 20_000;
    let response: Response | undefined;
    let lastFailure = "no attempt completed";
    while (Date.now() < deadline) {
      if (server.exitCode !== null) {
        throw new Error(`server exited with code ${server.exitCode}:\n${output}`);
      }
      try {
        // Every attempt is bounded, and each retry opens a fresh connection.
        // See ATTEMPT_TIMEOUT_MS: an attempt that lands in the boot window is
        // never answered, so an unbounded `fetch` here hangs for the whole test
        // and the `deadline` above — only checked between iterations — never
        // gets a chance to fire.
        response = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        });
        break;
      } catch (error) {
        lastFailure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        await delay(100);
      }
    }

    if (response === undefined) {
      throw new Error(
        `server never answered GET /health on port ${port} within 20s ` +
          `(last attempt: ${lastFailure}):\n${output}`,
      );
    }

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body: unknown = await response.json();
    expect(body).toMatchObject({ status: "ok" });
    expect((body as { uptime: number }).uptime).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
