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
| `ui_kits/` | The designers' reference compositions for the DM screen and marketing site — now including the Hob chat panel, the Chronicle, and the fourth delivery's player side (seats, characters, sheet, table view) with the shell's role switch. Reference for later screen work. |
| `readme.md`, `SKILL.md` | Guidance material. |
| `_adherence.oxlintrc.json` | The designers' lint rules, kept as the record of intent. Ported to ESLint in `packages/eslint-config/design-system.js`. |

**Every other file here is byte-identical to the delivery.** Exactly two are edited, both
structural rather than visual, and both are re-applied by hand on each update:

- `styles.css` — `@import url("tokens/…")` → `@import url("./tokens/…")`. Bare paths
  resolve as package specifiers in Vite/Tailwind and would fail. No values changed. (The
  delivered comment on the `fonts.css` line says "documentation only — no @font-face";
  that file does carry two `@font-face` rules, so the comment is corrected here too.)
- `SKILL.md` — `README.md` → `readme.md` (the delivered file is lowercase, and this
  filesystem is case-sensitive), plus a pointer to the ported components.

**Nothing else we author may live in this package**, and that is a rule with a cost
attached rather than a preference. The first port put two values the delivery states only
in prose — `--fs-label-l`, `--scrim-blur` — inside `tokens/typography.css` and
`tokens/elevation.css`. When the next delivery arrived, a plain `diff` against it reported
those two files as changed, and the obvious reading — *the designers revised typography
and elevation* — was wrong: they had revised neither. Both now live in
`packages/ui/src/local-tokens.css`, which is the same rule that keeps the layering scale
in `packages/ui/src/styles.css` §3. `adherence.test.ts` fails if one of them reappears in
a delivered token file. A `diff -r` against the next delivery should therefore show
`styles.css`, `SKILL.md`, and nothing else. **It did on the third, the fourth and the
fifth** — the rule paid for itself the first time it was tested. The third and fourth were
kit files only, with no theme-bridge work; the fourth's check was 117 files byte-identical,
2 differing (these two), 2 workspace-only (`package.json`, this file).

**The fifth is the first delivery that changed the palette**, and it is the one that proves
the rule is worth its cost: `tokens/colors.css` was rewritten wholesale (Catppuccin Mocha),
`tokens/base.css` moved one `::selection` colour, and the other 22 changed files were the
same `verdigris` → `peach` substitution carried into the guidelines, the kits, `Toast.jsx`
and `assets/README.md`. Because nothing we author sits in here, the whole of that arrived
as a clean overwrite and the *only* judgement needed was on our side of the bridge. Its
check was the same two files differing and nothing else.

**The fifth delivery also reused the folder name in the other direction**: it landed at
`Tiny Taverns Design System (1)/` beside the stale folder the first four had each
overwritten, rather than overwriting it again. Neither path is evidence — check the
content and the mtime, as the paragraph above says.

**The delivery folder is reused, so its path proves nothing about which delivery is in
it.** The third export overwrote the folder the first arrived in. Diff the content before
copying and check that work you have already merged is still present — a stale export
copied over a good tree is a silent regression, and `diff -rq` names it in one command.

## Deliberately left out

| Path | Why |
| --- | --- |
| `_ds_bundle.js` (101 KB) | Compiled bundle of the prototypes for the designers' authoring tool. The repo ships real components; this would be a second, drifting copy. |
| `_ds_manifest.json` (29 KB) | Authoring-tool metadata. Nothing here reads it. |
| `thumbnail.html`, `.thumbnail` | Tile art for the designers' gallery. |
| `brand/app-icon-*.html` | Icon explorations. The chosen icon is exported in `assets/icon/`; the explorations are process, not product. |
| `templates/` | `.dc.html` + `ds-base.js` + `support.js` are bound to the authoring tool's `<x-import>` / `_ds/<folder>` mechanism, which does not exist here. `ui_kits/` covers the same two products in plain JSX and was kept instead. |

Re-apply these exclusions on every update — the delivery folder still ships all of them.
The copy is one command:

```sh
rsync -a --delete \
  --exclude=package.json --exclude=PORT-NOTES.md \
  --exclude=_ds_bundle.js --exclude=_ds_manifest.json \
  --exclude=/brand/ --exclude=/templates/ \
  --exclude=thumbnail.html --exclude=.thumbnail \
  "<delivery>/" packages/design-system/
```

then re-apply the two edits above and run `pnpm -F @taverns/ui test`.

## The prototypes are a specification, not shippable code

`components/**/*.jsx` are prototype-grade — inline style objects and hand-rolled
`useState` hover/press. They are the visual target for `packages/ui`, which implements
the same designs as genuine shadcn components on Base UI primitives, with state handled
in CSS. They are not exported from this package's `exports` map, so nothing can import
them by accident.
