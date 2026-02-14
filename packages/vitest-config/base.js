import * as path from "node:path";
import { fileURLToPath } from "url";
import tsconfigPaths from "vite-tsconfig-paths";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const alias = (name) => {
  const target = process.env.TEST_DIST !== undefined ? "dist" : "src";
  const scopedName = `@repo/${name}`;
  return {
    [`${scopedName}/test`]: path.join(__dirname, "packages", name, "test"),
    [`${scopedName}`]: path.join(__dirname, "packages", name, target),
    [`${scopedName}/*`]: path.join(__dirname, "packages", name, target),
    [`${scopedName}/test`]: path.join(__dirname, "apps", name, "test"),
    [`${scopedName}`]: path.join(__dirname, "apps", name, target),
    [`${scopedName}/*`]: path.join(__dirname, "apps", name, target),
  };
};

// This is a workaround, see https://github.com/vitest-dev/vitest/issues/4744
const config = {
  plugins: [tsconfigPaths()],
  esbuild: {
    target: "es2020",
  },
  optimizeDeps: {
    exclude: ["bun:sqlite"],
  },
  test: {
    onConsoleLog: (log) => {
      console.log(log);
    },
    setupFiles: [path.join(__dirname, "setupTests.js")],
    fakeTimers: {
      toFake: undefined,
    },
    sequence: {
      concurrent: true,
    },
    pool: "forks",
    poolOptions: {
      forks: {
        isolate: true,
      },
    },
    slowTestThreshold: 5_000,
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    alias: {
      ...alias("@repo/adapter-postgres"),
      ...alias("@repo/domain"),
      ...alias("@repo/api"),
    },
  },
};

export default config;
