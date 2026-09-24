import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import app from "../../vite.config";

/**
 * The app's own Vite config, unchanged but for its own optimizer cache, for
 * the authenticated suite's stack (`support/stack.ts` passes the port, the API
 * URL and the publishable key).
 */
export default mergeConfig(
  app,
  defineConfig({
    root: fileURLToPath(new URL("../..", import.meta.url)),
    // So a `pnpm dev` or the layout suite in the same checkout and this server
    // never rewrite each other's pre-bundled dependencies.
    cacheDir: "node_modules/.vite-e2e-auth",
    server: { hmr: false },
  }),
);
