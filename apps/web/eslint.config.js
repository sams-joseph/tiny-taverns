import designSystem from "@taverns/eslint-config/design-system";
import react from "@taverns/eslint-config/react";

export default [
  ...react,
  ...designSystem,
  {
    // The Playwright suite runs in Node and measures pixels: a `2000px`
    // spacer is a probe rather than styling, and a fixture's `use` is
    // Playwright's, not React's.
    files: ["e2e/**/*.ts"],
    rules: { "no-restricted-syntax": "off", "react-hooks/rules-of-hooks": "off" },
  },
  { ignores: ["vite.config.ts", "vitest.setup.ts", "playwright-report", "test-results"] },
];
