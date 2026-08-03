/**
 * Design-system adherence rules.
 *
 * The designers shipped these as oxlint config (`_adherence.oxlintrc.json`, kept in
 * `packages/design-system/` for the record). This project uses ESLint, so the intent
 * is ported here. Three of the four original rule groups carry over verbatim —
 * `no-restricted-syntax` uses the same esquery selectors in both linters:
 *
 *   1. no raw hex colours     → use a token from tokens/colors.css
 *   2. no raw px literals     → use a token, or a Tailwind scale step
 *   3. no component internals → import from the package root
 *
 * The fourth group (per-component prop and variant whitelists, e.g. "<Badge> variant
 * must be one of …") is deliberately NOT ported: those rules exist to give a
 * JavaScript design system the checking a type system gives for free. Here the
 * components are TypeScript with `cva` variant unions, so `tsc` already rejects an
 * unknown prop or an invalid variant — with a better message and at the call site.
 *
 * @type {import("eslint").Linter.Config[]}
 */

const HEX =
  "Raw hex colour. Use a design-system colour token — see packages/design-system/tokens/colors.css, bridged to Tailwind in packages/ui/src/styles.css.";
const PX =
  "Raw px literal. Use a design-system token (h-control, p-card, rounded-card, …) or a Tailwind spacing step.";
const FONT =
  "Font family set by hand. Use --font-display / --font-serif / --font-sans / --font-mono, or the font-* utilities.";

/** Matches `#abc`, `#aabbcc`, `#aabbccdd` — the designers' original selector. */
const HEX_PATTERN = "/#[0-9a-fA-F]{3,8}\\b/";
/** Matches `12px` anywhere in a string, including inside a longer CSS value. */
const PX_PATTERN = "/\\b\\d+px\\b/";
const FONT_PATTERN = "/font-family\\s*:/i";

export default [
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${HEX_PATTERN}]`, message: HEX },
        { selector: `TemplateElement[value.raw=${HEX_PATTERN}]`, message: HEX },
        { selector: `Literal[value=${PX_PATTERN}]`, message: PX },
        { selector: `TemplateElement[value.raw=${PX_PATTERN}]`, message: PX },
        { selector: `Literal[value=${FONT_PATTERN}]`, message: FONT },
        { selector: `TemplateElement[value.raw=${FONT_PATTERN}]`, message: FONT },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@taverns/ui/src/*", "@taverns/ui/dist/*", "@taverns/ui/components/*"],
              message: "Import components from '@taverns/ui', not from package internals.",
            },
            {
              group: ["@taverns/design-system/components/*", "@taverns/design-system/ui_kits/*"],
              message:
                "Those are the designers' prototypes — the visual specification, not shippable code. Import the real component from '@taverns/ui'.",
            },
          ],
        },
      ],
    },
  },
];
