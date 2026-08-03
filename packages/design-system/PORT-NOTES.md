# Port notes — what came across from the delivery, and what did not

The designers' delivery lives read-only outside this repo. This package is the copy that
travels with the code. **`tokens/*.css` is the single source of truth for every design
value in the product** — no hex, radius, duration or measurement is restated anywhere
else. `packages/ui/src/styles.css` bridges these tokens into Tailwind's theme layer by
`var()` reference only.

## Brought across verbatim

| Path | Why |
| --- | --- |
| `tokens/` | The durable asset. Canonical values. |
| `styles.css` | The token entry point. Only change: `./`-relative `@import` paths (see below). |
| `fonts/` | Alegreya variable TTFs, wired up by `tokens/fonts.css`. |
| `assets/` | App icon exports + `assets/README.md`. |
| `guidelines/` | The 20 specimen cards — the visual reference the ported components were checked against. |
| `components/` | `.prompt.md` (intent + measurements), `.d.ts` (API contract), `.jsx` (visual spec), `*.card.html` (state sheets). |
| `ui_kits/` | The designers' reference compositions for the DM screen and marketing site. Reference for later screen work. |
| `readme.md`, `SKILL.md` | Guidance material. |
| `_adherence.oxlintrc.json` | The designers' lint rules, kept as the record of intent. Ported to ESLint in `packages/eslint-config/design-system.js`. |

The only edits made to delivered files:

- `styles.css` — `@import url("tokens/…")` → `@import url("./tokens/…")`. Bare paths
  resolve as package specifiers in Vite/Tailwind and would fail. No values changed.
- `SKILL.md` — `README.md` → `readme.md` (the delivered file is lowercase, and this
  filesystem is case-sensitive), plus a pointer to the ported components.

## Deliberately left out

| Path | Why |
| --- | --- |
| `_ds_bundle.js` (101 KB) | Compiled bundle of the prototypes for the designers' authoring tool. The repo ships real components; this would be a second, drifting copy. |
| `_ds_manifest.json` (29 KB) | Authoring-tool metadata. Nothing here reads it. |
| `thumbnail.html`, `.thumbnail` | Tile art for the designers' gallery. |
| `brand/app-icon-*.html` | Icon explorations. The chosen icon is exported in `assets/icon/`; the explorations are process, not product. |
| `templates/` | `.dc.html` + `ds-base.js` + `support.js` are bound to the authoring tool's `<x-import>` / `_ds/<folder>` mechanism, which does not exist here. `ui_kits/` covers the same two products in plain JSX and was kept instead. |

## The prototypes are a specification, not shippable code

`components/**/*.jsx` are prototype-grade — inline style objects and hand-rolled
`useState` hover/press. They are the visual target for `packages/ui`, which implements
the same designs as genuine shadcn components on Base UI primitives, with state handled
in CSS. They are not exported from this package's `exports` map, so nothing can import
them by accident.
