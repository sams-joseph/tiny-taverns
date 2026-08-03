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
    while (Date.now() < deadline) {
      if (server.exitCode !== null) {
        throw new Error(`server exited with code ${server.exitCode}:\n${output}`);
      }
      try {
        response = await fetch(`http://127.0.0.1:${port}/health`);
        break;
      } catch {
        await delay(100);
      }
    }

    if (response === undefined) {
      throw new Error(`server never became reachable on port ${port}:\n${output}`);
    }

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body: unknown = await response.json();
    expect(body).toMatchObject({ status: "ok" });
    expect((body as { uptime: number }).uptime).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
