import { afterAll, describe, expect, it } from "vitest";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import net from "node:net";
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
 * This is not a tuning knob, and it stays even though the hang it was written
 * for is fixed. The server used to start accepting TCP *before* it could
 * answer: `NodeHttpServer.layer` calls `server.listen` while it is being
 * constructed, and it was constructed first because `main.ts` provided it *to*
 * the application layer — the layer that opens the connection pool and runs the
 * migrations. Measured on an idle machine, the socket accepted at 273ms and the
 * first request was answered at 307ms; a request that arrived inside that
 * window was accepted and then dropped on the floor, not answered late but
 * never answered at all, verified by holding one open for 30s against a server
 * that had long since logged "Listening" and was answering fresh connections
 * with 200. Under `turbo --force` the database work widened the window from
 * tens of milliseconds to seconds, which is why this file failed roughly one
 * run in five with a 65s timeout against a 60s budget while the compile it was
 * blamed on took only 1.6s.
 *
 * `main.ts` now provides `services` to the listener, so the socket binds only
 * once the application can serve — see the test below, which is what fails if
 * that is ever rearranged back. A bounded attempt on a fresh connection is
 * still the right thing for a *client* to do, though: `fetch` has no response
 * timeout, and a test that assumes a perfect server is a worse test.
 *
 * 2s is ~150x the observed healthy response time (13ms), so it cannot fire on a
 * server that is actually serving; it only cuts short an attempt that is
 * already doomed.
 */
const ATTEMPT_TIMEOUT_MS = 2_000;

/**
 * Compile once per run of this file, and never outside it.
 *
 * Both tests here execute `dist/`, and both need the guarantee above — that
 * they cannot pass against a stale or absent build. Hoisting the compile to a
 * lazy memo keeps it inside this file and unconditional on every run; it only
 * stops the second test paying for it twice.
 */
let compiled: Promise<unknown> | undefined;
const buildOnce = () =>
  (compiled ??= execFileAsync("node_modules/typescript/bin/tsc", ["-p", "tsconfig.build.json"], {
    cwd: appDir,
  }));

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

const spawned: ChildProcess[] = [];

/** Start `dist/main.js` under plain `node`, exactly as `pnpm -F server start` does. */
function startServer(port: number): { server: ChildProcess; output: () => string } {
  const server = spawn(process.execPath, ["dist/main.js"], {
    cwd: appDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  spawned.push(server);
  let output = "";
  const collect = (chunk: Buffer) => (output += chunk.toString());
  server.stdout?.on("data", collect);
  server.stderr?.on("data", collect);
  return { server, output: () => output };
}

/** Kill every child on every exit path, including assertion failures. */
afterAll(async () => {
  for (const server of spawned) {
    if (server.exitCode !== null || server.killed) continue;
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), delay(5_000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
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
 * guarantee about whatever happened to be on disk.
 *
 * It *is* the slow part, though, and the line that used to sit here saying
 * otherwise — "1.5–1.8s under full `turbo --force` load, the same as it takes
 * alone" — was measured on a quiet machine and does not survive a busy one.
 * Re-measured on the same 24-core box with the cores oversubscribed two to one,
 * the same `tsc` takes **15.5s** against 2.2s alone; and CI's own pipeline
 * (`turbo run lint typecheck test build`) has `server:build` and
 * `server:typecheck` compiling this very project alongside it.
 *
 * **Hence the 180_000 on both tests below, where the rest of the suite gets
 * `vitest.config.ts`'s 60s.** Each of these is compile + spawn + poll, and the
 * poll is already bounded at 20s by its own `deadline` — which is the bound
 * that produces a *useful* failure, naming the port, the last attempt and the
 * server's own output. The outer budget should only ever fire on something
 * wedged past that, and at 60s it did not: under the load above it timed out at
 * ~60_070ms in three runs out of six, losing that diagnostic to a bare
 * `Test timed out in 60000ms`.
 *
 * The cost is not merely large, it is tail-heavy, which is why the headroom is
 * wide. Across sixteen loaded runs of CI's own pipeline this test measured
 * 15.6, 16.6, 62.2, 63.0, 64.5, 70.8, 80.2, 89.8, 94.3 and **101.1** seconds —
 * a factor of six between the quiet runs and the busy ones, with the busy ones
 * clustered at the top. 180s is a shade under twice the worst of those, and the
 * worst was not the harshest load tried. Nothing is bought by tightening it: the failure this file guards against is "never answers", so
 * every real one is reported by the inner deadline long before the outer one,
 * and the only thing a tight outer bound buys is the loss of that message.
 *
 * If this is ever worth making *faster* rather than merely survivable, the
 * lever is not here. CI runs `lint typecheck test build` together on a cold
 * cache, so `server:build` and `server:typecheck` each compile this project at
 * the same moment this test does — three `tsc` runs over one `tsconfig`. The
 * compile cannot move out of the test without giving up the guarantee above, so
 * that would be a change to the pipeline, deliberately not made here.
 */
describe("production start (built output under plain node)", () => {
  it("boots dist/main.js and answers GET /health", async () => {
    await buildOnce();

    const port = await freePort();
    const { server, output } = startServer(port);

    const deadline = Date.now() + 20_000;
    let response: Response | undefined;
    let lastFailure = "no attempt completed";
    while (Date.now() < deadline) {
      if (server.exitCode !== null) {
        throw new Error(`server exited with code ${server.exitCode}:\n${output()}`);
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
          `(last attempt: ${lastFailure}):\n${output()}`,
      );
    }

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body: unknown = await response.json();
    expect(body).toMatchObject({ status: "ok" });
    expect((body as { uptime: number }).uptime).toBeGreaterThanOrEqual(0);
  }, 180_000);

  /**
   * The boot-order guarantee: the socket must not accept until the application
   * can answer on it.
   *
   * Written against the raw socket rather than `fetch` on purpose. The property
   * is about *one particular connection* — the very first one the kernel
   * accepts — and `fetch` gives no control over which connection a request goes
   * out on, nor any way to hold one open and watch nothing come back.
   *
   * This is what a readiness probe experiences, and it is why the ordering
   * matters outside the test suite: before the fix, this connection was
   * accepted and then never answered (5 runs out of 5, held 8s while the same
   * server answered fresh connections 200). After it, every connection made
   * before the listener binds is refused outright — ~250 `ECONNREFUSED` in the
   * ~290ms before `listen`, which is a clean, retryable answer — and the first
   * one accepted is answered within milliseconds.
   *
   * The budget below is deliberately enormous relative to the ~7ms observed:
   * the failure this guards against is "never", so there is nothing to gain
   * from a tight bound and a flaky test to lose.
   */
  it("answers the first connection it accepts, having refused every earlier one", async () => {
    await buildOnce();

    const port = await freePort();
    const { server, output } = startServer(port);

    // Hammer connect() until one succeeds. Everything before that must be
    // refused — the socket is not bound yet — and the one that succeeds is the
    // first connection this server ever accepted.
    const refusals = new Map<string, number>();
    const deadline = Date.now() + 20_000;
    let accepted: net.Socket | undefined;
    while (accepted === undefined && Date.now() < deadline) {
      if (server.exitCode !== null) {
        throw new Error(`server exited with code ${server.exitCode}:\n${output()}`);
      }
      const socket = net.connect({ port, host: "127.0.0.1" });
      const outcome = await new Promise<string>((resolve) => {
        socket.once("connect", () => resolve("connect"));
        socket.once("error", (error: NodeJS.ErrnoException) => resolve(error.code ?? "unknown"));
      });
      if (outcome === "connect") {
        accepted = socket;
      } else {
        socket.destroy();
        refusals.set(outcome, (refusals.get(outcome) ?? 0) + 1);
        await delay(0);
      }
    }

    if (accepted === undefined) {
      throw new Error(`nothing ever accepted a connection on port ${port}:\n${output()}`);
    }

    let giveUp: NodeJS.Timeout | undefined;
    try {
      const reply = new Promise<string>((resolve, reject) => {
        let received = "";
        accepted.setEncoding("utf8");
        accepted.on("data", (chunk: string) => {
          received += chunk;
          if (received.includes("\r\n\r\n")) resolve(received);
        });
        accepted.once("error", reject);
        giveUp = setTimeout(
          () =>
            reject(
              new Error(
                "the first accepted connection was never answered — the listener is binding " +
                  `before the application can serve. Refused before accept: ${
                    [...refusals].map(([code, n]) => `${n}x ${code}`).join(", ") || "none"
                  }\n${output()}`,
              ),
            ),
          10_000,
        );
      });
      accepted.write(
        `GET /health HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
      );
      expect(await reply).toContain("HTTP/1.1 200");
    } finally {
      clearTimeout(giveUp);
      accepted.destroy();
    }

    // Everything before the accept was refused, not accepted-and-dropped. An
    // empty map would mean the server bound before the first attempt, which no
    // observed run has done — but it is not the property under test, so it is
    // the unexpected *codes* that are asserted on, not the count.
    expect([...refusals.keys()].filter((code) => code !== "ECONNREFUSED")).toEqual([]);
  }, 180_000);
});
