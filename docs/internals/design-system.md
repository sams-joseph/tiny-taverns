# Design system

How the designers' delivered system reaches the product: the read-only `packages/design-system` package, the Tailwind theme bridge in `packages/ui`, the rules that keep a palette change to a token-file edit, the layering and motion scales, and the shadcn-on-Base-UI port. Read this before touching anything visual, before adopting a new delivery, and before driving a real browser against the app.

## The package is read-only, with one exception

`packages/design-system` is the designers' delivery copied whole. **`tokens/*.css` is the single source of truth for every design value**: no hex, radius, duration or measurement is restated anywhere else, and `packages/ui/src/styles.css` bridges those tokens into Tailwind by `var()` reference only. `adherence.test.ts` fails on a literal value in the bridge.

Nothing we author lives inside the package. A `diff -r` against a fresh delivery may name exactly these files:

- `styles.css`: `@import` paths made `./`-relative (bare paths resolve as package specifiers in Vite).
- `SKILL.md`: a filename case fix and a pointer. `.claude/skills/tiny-taverns-design` symlinks to the package, so the delivered skill installs without a second copy of the tokens.
- `assets/icon/mark-on-dark-256.png`, `favicon-32.png`, `apple-touch-icon-180.png`: the maintainer's own artwork, which no delivery contains. There is no `local-tokens.css` equivalent for a PNG imported by package path, so these override in place.

**The icon exception has a live hazard.** `PORT-NOTES.md` records the copy as one `rsync -a --delete` command and `assets/` is inside it with no exclusion, so a delivery silently restores the old flat mark over the first two and deletes the 180. All three are imported (`apps/web/src/main.tsx` takes the favicon and touch icon; the shell, Hob and marketing take the mark), so the deletion breaks the build. That is loud, not a guard: re-copy the three after every update and confirm `git status` names them. `assets/README.md` says which files are whose and holds the flatten command for the touch icon (iOS ignores alpha, so it is composited onto `--slate-950`).

The `.jsx` files under `components/` and `ui_kits/` are the visual specification, not code; the real components live in `packages/ui`. They sit outside the package's `exports` map and `packages/eslint-config/design-system.js` forbids importing them. They also cannot be rendered from this repo (they need the excluded `_ds_bundle.js`), so compare against the `.jsx` source and `guidelines/` specimens, not a running kit page.

## Values the delivery states only in prose

`packages/ui/src/local-tokens.css` holds the measurements the delivery specifies in a sentence but never tokenises: `--fs-label-l`, `--scrim-blur`, `--site-header-blur` and `--panel-chat-w` (the 400px Hob panel, bridged as `--spacing-chat-panel`). They live here rather than in the delivered token files because the first port did that, and the next delivery's diff then reported `typography.css` and `elevation.css` as changed when the designers had changed neither. `adherence.test.ts` checks each name both ways: absent from the delivered tokens (a delivery that finally tokenises it fails the test and says to delete the local copy) and referenced by the bridge (a dead one cannot linger).

## The Tailwind bridge

Four things about `packages/ui/src/styles.css` that are not derivable from reading it:

- **Dark only, by design.** The tokens resolve dark at `:root`; there is no light theme and no toggle. `dark:` is meaningless here and `adherence.test.ts` fails if one appears in a component.
- **The theme replaces Tailwind's scales.** A namespace reset (`--color-*: initial` and friends) deletes the built-in palettes outright, so `bg-zinc-900` is not a class that exists.
- **Token files are imported one by one with `layer(base)`**, never through the design system's own `styles.css` entry. `@import "…" layer(base)` inlines a file into an `@layer` block, and an `@import` nested inside a layer block is invalid CSS: the token files are dropped silently with the build still green. `layer(base)` is also what lets the delivered `tokens/base.css` element rules beat preflight and still lose to utilities. A test keeps the import list in step with the package's entry point.
- **`tailwind-merge` must be told the theme's names** (`packages/ui/src/lib/tw-theme.ts`). With a replaced theme it cannot tell `text-label` (a size) from `text-on-accent` (a colour) and silently drops one; that rendered primary buttons in body colour until configured. `tw-theme.test.ts` parses the `@theme inline` block and fails if the lists drift. The merge config knows only the `measure` container, so a component must set no `max-w-*` default: it would survive beside a consumer's and source order would decide.

## Reach for the semantic token, not the ramp step

A ramp step (`peach-300`) names a colour; a semantic alias (`accent`, `accent-ink`, `accent-soft`) names a job. A component that means "the accent" must say so, because that is what makes a palette swap a token-file edit instead of a sweep: the Mocha delivery retired `--verdigris-*` outright and cost class edits only where components had reached for the ramp. The one legitimate ramp-step site is `apps/web/src/gallery/Foundations.tsx`, where the swatch genuinely is that colour.

**The failure is silent.** Tailwind emits no rule for a utility whose theme name does not exist, so `text-verdigris-300` fails nothing; the element inherits body colour. Adopting a palette delivery therefore includes a grep for the retired ramp name across everything but the vendored tree, and it must come back empty. Related: Tailwind only emits utilities it scans in source, so a class injected at runtime to probe the theme in a browser measures nothing. Probe with a class the codebase already uses.

**The settled contrast state.** Every contrast finding collapses into two pairs, both in the read-only `tokens/colors.css`: `--text-muted` on `--surface-raised` computes to 4.45:1 and is accepted; the `--text-faint` tier (2.6 to 3.8:1) predates the palette and is an open question for the designers, not a defect. Disabled controls render at `opacity: 0.5` and are exempt under WCAG 1.4.3. Fix none of these by editing the package, and treat a sweep that measures the same numbers as measuring the agreed answer.

**The debt.** `slate-*` and `crimson-*` steps are still reached for directly in roughly thirty non-test files under `apps/web/src` and `packages/ui/src/components` (`button.tsx`, `tooltip.tsx`, `switch.tsx`, `InitiativeList.tsx`, `states.tsx` among them). Each renders correctly today, and swapping a step for a semantic token moves the rendered colour, so it is a restyle. It is the first place to look when the next palette delivery lands.

## Overlay layering: one scale

Every z-index comes from §3 of `packages/ui/src/styles.css`. Reach for a rung, never a number:

| rung      | value | why here                                                               |
| --------- | ----- | ---------------------------------------------------------------------- |
| `chrome`  | 10    | sticky page furniture and the inline Hob panel; must lose to the scrim |
| `scrim`   | 100   | the modal backdrop                                                     |
| `dialog`  | 110   | above its own backdrop by number, not by document order                |
| `popup`   | 200   | select/menu/popover, often anchored inside a dialog, so more nested    |
| `toast`   | 300   | an interruption that must not be lost behind a modal                   |
| `tooltip` | 400   | labels a control on any layer and never takes a pointer                |

Gaps of 100 so a rung can be inserted without renumbering. **Equal layers are the bug, not a tie**: a select at 40 under a dialog at 50 had its clicks eaten by the `fixed inset-0` backdrop, and toast and dialog both at 50 left document order to decide, always against the toast.

The scale is the one block in the bridge that is not a `var()` into the delivery, deliberately: the delivered system tokenises elevation as shadow and says nothing about stacking because it ships no portalling components. Do not add tokens upstream. `toast-stack`'s `z-index` is `calc(var(--z-index-toast) - var(--toast-index))`, local to its own stacking context and written off the token so no layer number appears twice.

`packages/ui/src/layering.test.ts` fails on `z-50`, `z-[9999]` or `z-(--x)` in any component file or in `apps/web/src`, compiles the real stylesheet and asserts the order the browser will compute. Two verification traps: jsdom computes no stacking, so drive a real browser, assert with `document.elementFromPoint`, then click an option and check the value changed. And headless Chromium reports `(hover: none)`, so Base UI tooltips never open; launch with `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4` or drive the `open` prop.

## Motion

In Tailwind v4 `-translate-x-1/2` compiles to the independent `translate` property, which composes with `transform` rather than being replaced by an animated one. The dialog shipped with centring inside its keyframes; both applied, and the popup sat half its own size off-centre for the whole animation before snapping into place. Two rules follow, enforced by `packages/ui/src/motion.test.ts`, which compiles the real `styles.css` through Tailwind's Node API because jsdom computes no animation:

- Keyframes carry the motion delta only, never layout the utilities already own, and end on `transform: none`.
- Never mix `translate-*`/`scale-*` utilities with a hand-written `transform` on one element, and never `transition-[transform]` a change made by a `translate-*` utility (the toast did, and its slide never animated).

The bridge's motion names are self-referential on purpose: `--ease-out: var(--ease-out)` works because the Tailwind theme lands in `@layer theme`, the design system's `:root` lands in `@layer base`, and base outranks theme (same shape for `--font-*` and `--shadow-*`). It is load-bearing that the tokens keep their `layer(base)` import; drop it and every one becomes a genuine cycle that kills the `animation` shorthand with nothing in the console. `motion.test.ts` asserts a real `cubic-bezier` survives.

`prefers-reduced-motion` zeroes every `--dur-*` token upstream in `tokens/motion.css`, so anything timed from a token flattens and anything timed from a literal does not. The one exception is `skeleton`'s `animate-pulse`, which has no start and no end; `styles.css` §7 stops it by hand, the only reduced-motion rule the product writes. Before diagnosing "the animations don't run", check `matchMedia("(prefers-reduced-motion: reduce)")`.

## shadcn on Base UI, not Radix

`packages/ui/components.json` sets `"style": "base-nova"`; in shadcn 4.x the base is chosen through the style name. The package is `@base-ui/react` (`@base-ui-components/react` is the deprecated old name). No `@radix-ui/*` package is in the tree, and `adherence.test.ts` asserts that against the lockfile as well as the sources. That rules out shadcn's `command` (it is `cmdk`, which is Radix); the filter input is built on a `combobox` port instead.

`shadcn add <name>` emits `@/` imports; rewrite them to relative ones, because `packages/ui` is consumed as source by another app's Vite, which resolves `@` to its own `src`. It also emits an `IconPlaceholder`; swap it for `Icon`, whose table in `components/ui/icon.tsx` is the one place a glyph is named. The ported set is the list in `adherence.test.ts`, which fails if a file appears in `components/ui` without being named there.

Two Base UI deltas: `Checkbox` takes a separate `indeterminate` prop rather than `checked="indeterminate"`, and jsdom ships no `PointerEvent`, which Base UI constructs on click, hence `packages/ui/test/pointer-event-polyfill.ts`, exported to `apps/web` as `./testing/pointer-event-polyfill`.

**`sheet` and `sidebar`** are the two ports to read before touching the Hob panel. `sheet` is a dialog underneath (backdrop `z-scrim`, popup `z-dialog`) and carries one prop upstream lacks: `container`. Given one, it portals into that element and switches backdrop and popup from `fixed` to `absolute`, so the overlaid panel covers the content region and leaves the app's own bar lit; doing only one half would be incoherent, which is why it is not two props. The vendored `sidebar.tsx` diverges from upstream in eight places numbered in its doc comment, so a future `sidebar.json` can be diffed against it. The two easy to get wrong: an outside-press dismissal races an opener that lives outside the sheet (the press closes it, the click reopens it, the button looks dead), so the overlaid form is `modal={false}` with `disablePointerDismissal` and its own backdrop `onClick`; and a collapsed off-canvas sidebar stays mounted, so it is marked `inert` or a keyboard walks into a panel nobody can see.

## Icons and fonts

The icon table grows when a delivery names a glyph, so it tracks deliveries rather than screens. Deliveries spell icon names three ways (`name="…"`, `icon: "…"`, and bare tuple elements like `["dm", "crown", "DM"]`), and a screen-id list (`{ id: "home", label: "Overview" }`) looks exactly like an icon list. The only sweep that works is to intersect every kebab-case string literal in the kit against `lucide-react`'s export list and read the survivors in context, rejecting CSS-value false positives (`grid`, `baseline`, `pointer`, `table`) and screen ids (`home`, `sheet`, `vault`).

Alegreya ships as variable TTFs in the package, wired by `tokens/fonts.css`. Instrument Sans and JetBrains Mono load non-blocking from Google Fonts via the `<link>` in `apps/web/index.html`; every `--font-*` token carries a real system fallback, so an offline page degrades legibly. Self-hosting them is a `.woff2` upload plus `@font-face` rules in `tokens/fonts.css`.

## Adopting a delivery

- Check content, not the folder name: exports reuse and overwrite paths, and a stale export copied over a good tree is a silent regression. `diff -rq` before copying.
- Run the `rsync` from `PORT-NOTES.md`, re-apply the two edits and the three icon files, and confirm `git status` names any deletion (`--delete` removes a file the delivery replaced).
- Expect `tokens/*.css` byte-identical. A token change is a palette change and needs work on our side of the bridge: a new ramp step is unreachable until added to both `styles.css` and `tw-theme.ts`, and the retired-ramp grep must come back empty. A bundled single-HTML export has no files to diff; normalise its inline `<style>` to a declaration set and compare against the concatenated token files.
- What a drawing asks for that the data cannot supply is reported, not invented: absent rather than stubbed, whether it is a field, a control or a section.

## Driving a browser

- `Page.navigate` to a URL differing only in the fragment does not reload the document, so React state survives; navigate elsewhere first, then to the target.
- Never assume a debug port. Launch with `--remote-debugging-port=0` and read the port off the process's `DevTools listening on ws://…` stderr line; a shared port answers with another agent's page.
- Assert on computed values from the running app (`getComputedStyle`, `getBoundingClientRect`) against the token the kit names; a screenshot missed the overflow a measurement caught.
