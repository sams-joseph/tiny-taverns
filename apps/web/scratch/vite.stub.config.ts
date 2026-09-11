import { mergeConfig } from "vite";
import base from "../vite.config";
export default mergeConfig(base, {
  resolve: { alias: [{ find: /^vitest$/, replacement: new URL("./vitest-shim.ts", import.meta.url).pathname }] },
});
