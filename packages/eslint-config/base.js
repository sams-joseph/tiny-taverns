import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared flat ESLint config for all TypeScript packages in the workspace.
 * @type {import("eslint").Linter.Config[]}
 */
export default tseslint.config(
  // `.repos/**` holds vendored upstream source (see README); never lint it. Per-package
  // `eslint .` runs never reach it today, but this keeps it out if linting is ever run from root.
  { ignores: ["dist/**", "coverage/**", ".turbo/**", ".repos/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
