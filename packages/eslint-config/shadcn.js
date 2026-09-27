import { plugin as shadcn } from "@shadcn/lint";

/**
 * `@shadcn/lint`: Tailwind class checks with messages written for an agent to act on.
 * It reads the theme a package's stylesheet builds (`packages/ui/src/styles.css`, which
 * `apps/web/src/index.css` imports), so a class is judged against our tokens, not
 * Tailwind's defaults.
 *
 * Off, deliberately:
 *   - `no-restyle`: our screens tune shared components at the call site (a Card's
 *     padding, an Icon's colour). Which classes each component should accept is a
 *     design policy nobody has written yet, and its class grammar reads our own
 *     theme names (`p-card`, `h-control-sm`, `z-chrome`) as misspellings.
 *   - `require-static-classes`: it only feeds `no-restyle`.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { shadcn },
    settings: {
      shadcn: {
        // The rules name the stylesheet they read; ours only imports the theme.
        note: "Our theme is bridged in packages/ui/src/styles.css from the read-only packages/design-system tokens; a value the delivery lacks goes in packages/ui/src/local-tokens.css. See docs/internals/design-system.md.",
      },
    },
    rules: {
      // Tailwind emits nothing for a name the theme lacks, so a typo fails silently.
      "shadcn/no-unknown-classes": "error",
      "shadcn/no-raw-colors": "error",
      "shadcn/no-arbitrary-values": [
        "error",
        {
          // Grid tracks, viewport caps and `calc()` over tokens are layout, not restated
          // design values. A `transition-[…]` list names properties, not a value.
          allow: ["layout", "transition-*"],
        },
      ],
      "shadcn/no-inline-styles": [
        "error",
        {
          // Geometry computed from data (a bar's fill, a mark's position) has no class.
          allow: ["width", "height", "left", "top", "flex-grow", "aspect-ratio"],
        },
      ],
    },
  },
];
