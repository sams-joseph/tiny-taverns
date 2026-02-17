import * as path from "node:path";
import { mergeConfig, type UserConfigExport } from "vitest/config";
import base from "@repo/vitest-config/base";

const config: UserConfigExport = {
  test: {
    alias: {
      "@/": path.join(__dirname, "src/"),
    },
  },
};

export default mergeConfig(base, config);
