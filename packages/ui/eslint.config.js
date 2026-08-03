import designSystem from "@taverns/eslint-config/design-system";
import react from "@taverns/eslint-config/react";

export default [
  ...react,
  ...designSystem,
  {
    files: ["src/components/ui/*.tsx"],
    rules: {
      // shadcn components export their `cva` variant maps and manager singletons
      // alongside the component (`buttonVariants`, `toast`, `useToastManager`).
      // That is the upstream shape, and this is a library — nothing here is a
      // Vite fast-refresh boundary, so the rule has nothing to protect.
      "react-refresh/only-export-components": "off",
    },
  },
  { ignores: ["vitest.config.ts", "vitest.setup.ts"] },
];
