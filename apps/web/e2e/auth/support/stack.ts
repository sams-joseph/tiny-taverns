import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

/**
 * The real stack the authenticated suite signs in against: a database of its
 * own, the API server over it, and the app's Vite server in front. Everything
 * is started here and stopped by the teardown this returns, by the process ids
 * it spawned and nothing else.
 */

const web = fileURLToPath(new URL("../../..", import.meta.url));
const server = fileURLToPath(new URL("../../../../server", import.meta.url));

/**
 * The compose database `pnpm db:up` starts. The suite only ever connects to
 * it to create and drop a database of its own; it never reads or writes the
 * one named here.
 */
const DEFAULT_ADMIN_URL = "postgres://taverns:taverns@127.0.0.1:5433/taverns";

export interface StackOptions {
  readonly apiPort: number;
  readonly webPort: number;
  /** The instance's JWT public key (PEM). Not a secret. */
  readonly jwtKey: string;
  readonly publishableKey: string;
  /** Where each process's output goes: the report never carries it. */
  readonly logDir: string;
}

/** A throwaway database, named so that nothing else could be using it. */
const createDatabase = async (): Promise<{ url: string; drop: () => Promise<void> }> => {
  const admin = process.env.E2E_AUTH_DATABASE_URL ?? DEFAULT_ADMIN_URL;
  const name = `taverns_e2e_auth_${randomBytes(4).toString("hex")}`;
  const run = async (statement: string) => {
    const client = new pg.Client({ connectionString: admin });
    await client.connect();
    try {
      await client.query(statement);
    } finally {
      await client.end();
    }
  };
  await run(`create database ${name}`);
  const url = new URL(admin);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: () => run(`drop database if exists ${name} with (force)`),
  };
};

/**
 * The inherited environment without anything that could point a child at a
 * developer's own services or keys: their database, their model endpoint,
 * their storage, and every Clerk variable. The secret key in particular never
 * reaches the API server, which verifies offline and must not hold one.
 */
const cleanEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !/^(CLERK_|VITE_|HOB_|PORTRAIT_|STORAGE_|DATABASE_URL$|ALLOWED_ORIGINS$|PORT$)/.test(name),
    ),
  );

/** Spawns a Node child whose output lands in `<logDir>/<name>.log`. */
const start = (
  name: string,
  args: ReadonlyArray<string>,
  cwd: string,
  env: NodeJS.ProcessEnv,
  logDir: string,
): { child: ChildProcess; log: string } => {
  const log = `${logDir}/${name}.log`;
  const out = createWriteStream(log);
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  return { child, log };
};

/** Resolves once `url` answers 200, and fails if `child` exits first. */
const waitFor = async (url: string, child: ChildProcess, name: string, log: string) => {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(
        `The ${name} exited (${String(child.exitCode)}) before it answered; see ${log}`,
      );
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The ${name} did not answer ${url} within 90s; see ${log}`);
};

const stop = async (child: ChildProcess) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  await exited;
  clearTimeout(timer);
};

/** Starts the stack, and returns what stops it. */
export const startStack = async (options: StackOptions): Promise<() => Promise<void>> => {
  mkdirSync(options.logDir, { recursive: true });
  const database = await createDatabase();
  const children: Array<ChildProcess> = [];
  const teardown = async () => {
    await Promise.all(children.map(stop));
    await database.drop();
  };

  try {
    const apiOrigin = `http://127.0.0.1:${String(options.apiPort)}`;
    const webOrigin = `http://127.0.0.1:${String(options.webPort)}`;

    // `node --import tsx` rather than the `tsx` binary, so the id spawned is
    // the server itself and not a wrapper relaying signals to it. The server
    // migrates its database on boot.
    const api = start(
      "server",
      ["--import", "tsx", "src/main.ts"],
      server,
      {
        ...cleanEnv(),
        DATABASE_URL: database.url,
        PORT: String(options.apiPort),
        ALLOWED_ORIGINS: webOrigin,
        CLERK_JWT_KEY: options.jwtKey,
        CLERK_TELEMETRY_DISABLED: "1",
      },
      options.logDir,
    );
    children.push(api.child);
    await waitFor(`${apiOrigin}/health`, api.child, "API server", api.log);

    const vite = join(
      dirname(createRequire(`${web}/package.json`).resolve("vite/package.json")),
      "bin/vite.js",
    );
    const app = start(
      "vite",
      [
        vite,
        "--config",
        "e2e/auth/vite.config.ts",
        "--host",
        "127.0.0.1",
        "--port",
        String(options.webPort),
        "--strictPort",
      ],
      web,
      {
        ...cleanEnv(),
        VITE_API_URL: apiOrigin,
        VITE_CLERK_PUBLISHABLE_KEY: options.publishableKey,
      },
      options.logDir,
    );
    children.push(app.child);
    await waitFor(`${webOrigin}/`, app.child, "Vite server", app.log);
  } catch (error) {
    await teardown();
    throw error;
  }

  return teardown;
};
