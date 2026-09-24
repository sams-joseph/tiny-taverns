import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import app from "../../vite.config";
import { stubApi } from "./stubApi";

/**
 * The app's own Vite config plus the stub API, for Playwright's `webServer`
 * (`playwright.config.ts`, which passes the port, the API URL and an empty
 * Clerk key). No Postgres, no API server, no model or image calls.
 */
export default mergeConfig(
  app,
  defineConfig({
    root: fileURLToPath(new URL("../..", import.meta.url)),
    // Its own optimizer cache, so a `pnpm dev` in the same checkout and this
    // server never rewrite each other's pre-bundled dependencies.
    cacheDir: "node_modules/.vite-e2e",
    plugins: [stubApi()],
    // Otherwise Node's own loader imports the real `vitest`, past the shim.
    ssr: { noExternal: ["vitest"] },
    server: { hmr: false },
  }),
);
