import designSystem from "@taverns/eslint-config/design-system";
import react from "@taverns/eslint-config/react";
import shadcn from "@taverns/eslint-config/shadcn";

export default [
  ...react,
  ...designSystem,
  ...shadcn,
  {
    // The Playwright suite runs in Node and measures pixels: a `2000px`
    // spacer is a probe rather than styling, and a fixture's `use` is
    // Playwright's, not React's.
    files: ["e2e/**/*.ts"],
    rules: { "no-restricted-syntax": "off", "react-hooks/rules-of-hooks": "off" },
  },
  {
    ignores: [
      "vite.config.ts",
      "vitest.setup.ts",
      "playwright-report",
      "test-results",
      "playwright-report-auth",
      "test-results-auth",
    ],
  },
];
