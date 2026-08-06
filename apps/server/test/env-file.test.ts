import { ConfigProvider, Effect, Logger } from "effect";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { identityFromConfig } from "../src/app.js";
import { testIdentityInstance } from "./support/identity.js";

/**
 * How this server reads a local env file, and the one place it deliberately
 * does not.
 *
 * `.env.local` is a *Vite* convention. `apps/web` gets it for free; nothing
 * ever gave it to `apps/server`, so a key put in `apps/server/.env.local` was
 * silently ignored — the failure that produced this file. The fix is Node's
 * own `--env-file-if-exists`, in the scripts, and the "if-exists" form is
 * required rather than tidy: every variable it can carry is optional, so the
 * flag must not turn a missing file into a boot failure.
 *
 * The `test` script is excluded on purpose. A suite that loads a developer's
 * real environment says something different on their machine than in CI or on
 * a colleague's — the exact hazard AGENTS.md already records for the web app.
 */
const packageJson: { readonly scripts: Record<string, string> } = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { readonly scripts: Record<string, string> };

describe("the env file the server reads", () => {
  it.each(["dev", "start", "migrate", "token:issue", "bestiary:import"])(
    "`%s` loads apps/server/.env.local through Node, tolerating its absence",
    (script) => {
      expect(packageJson.scripts[script]).toContain("--env-file-if-exists=.env.local");
    },
  );

  it("never uses the plain --env-file form, which fails when the file is absent", () => {
    // `CLERK_JWT_KEY` and every other variable here is optional by design;
    // `pnpm -F server dev` on a fresh clone has no env file at all.
    for (const command of Object.values(packageJson.scripts)) {
      expect(command).not.toMatch(/--env-file[= ]/);
    }
  });

  it("keeps the test run hermetic by loading no env file at all", () => {
    // Same result with the file present or absent — that is the whole property.
    expect(packageJson.scripts.test).not.toContain("--env-file");
  });
});

/**
 * The boot line, which is the other half of the fix.
 *
 * Loading the file without saying so would leave the original complaint
 * intact: the captain set a variable, restarted, and nothing told them the
 * server had not seen it. One line at boot, in both modes, turns "why is my
 * session token rejected" into a glance at the first screen of output.
 */
const bootLines = async (env: Record<string, string>): Promise<ReadonlyArray<string>> => {
  const lines: Array<string> = [];
  const capture = Logger.make<unknown, void>(({ message }) => {
    lines.push(Array.isArray(message) ? message.map(String).join(" ") : String(message));
  });

  await Effect.runPromise(
    Effect.void.pipe(
      Effect.provide(identityFromConfig),
      // Outside the layer being built, so it captures construction itself.
      Effect.provide(Logger.layer([capture])),
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })),
      Effect.orDie,
    ),
  );

  return lines;
};

describe("what the server says at boot about hosted sign-in", () => {
  it("says OFF, and names the file to set it in, when no key is configured", async () => {
    const lines = await bootLines({});

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Hosted sign-in is OFF");
    // The whole point of the line is that a key set in the wrong place is
    // obvious immediately, which needs the right place named.
    expect(lines[0]).toContain("apps/server/.env.local");
  });

  it("says ON when a key is configured, so a key that was not read is obvious", async () => {
    const instance = testIdentityInstance();

    const lines = await bootLines({ CLERK_JWT_KEY: instance.jwtKey });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Hosted sign-in is ON");
  });

  it("logs no key material, not even a prefix or a length", async () => {
    const instance = testIdentityInstance();

    const lines = await bootLines({ CLERK_JWT_KEY: instance.jwtKey });
    const output = lines.join("\n");

    expect(output).not.toContain(instance.jwtKey);
    // Boot output ends up in log aggregators, and "configured" already says
    // everything a prefix would. The modulus body, in any fragment.
    const body = instance.jwtKey.replace(/-----[^-]+-----|\s/g, "");
    expect(output).not.toContain(body.slice(0, 12));
    expect(output).not.toContain(String(instance.jwtKey.length));
  });
});
