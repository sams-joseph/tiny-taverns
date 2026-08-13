# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Layout, commands, and how to run each app are documented in `README.md` — start there.
- **Formatting is root-only Prettier — `pnpm format` / `pnpm format:check` — and is not a turbo
  task.** No package has a `format` script, so the root `format:check` is the only thing that
  checks anything and CI has to name it as its own step. It did not, and six files had drifted
  by the time anyone looked. `.prettierignore` holds the two read-only trees out
  (`packages/design-system`, `.repos/`), so a formatting pass never reaches either.
- **Formatting is root-only Prettier — `pnpm format` / `pnpm format:check` — and is not a turbo
  task.** No package has a `format` script, so the root `format:check` is the only thing that
  checks anything and CI has to name it as its own step. It did not, and six files had drifted
  by the time anyone looked. `.prettierignore` holds the two read-only trees out
  (`packages/design-system`, `.repos/`), so a formatting pass never reaches either.
- **Vite/Vitest versions must stay aligned.** Vitest 2 pulls Vite 5 while `@vitejs/plugin-react`
  uses Vite 6; mixing them produces duplicate-`vite` type errors. The workspace pins Vitest 3 +
  Vite 6 together across `apps/web` and `packages/ui`. Keep them in lockstep when bumping.
- **`@taverns/tsconfig` exposes each base via an `exports` map** (not just `files`). This is what
  lets esbuild (Vite/Vitest) resolve the nested `extends` chain without warnings — don't drop it.
- `packages/ui` ships TypeScript source (`exports` → `./src/index.ts`); Vite transpiles it directly
  as a workspace package. Its `build` only emits `.d.ts`.
- **`apps/server` runs Effect v4 beta, pinned to exact versions** (`effect` and
  `@effect/platform-node` at `4.0.0-beta.102`). Betas are not semver-stable, so do not
  loosen these to caret ranges. Both packages share one version number in v4 and must be
  bumped together.
- **`pnpm-workspace.yaml` declines the `msgpackr-extract` native build.** `effect` v4 pulls
  `msgpackr` transitively; without an explicit `allowBuilds` entry `pnpm install` exits 1 on
  the ignored build script. Nothing here uses msgpack, so it stays `false`.
- **`.repos/` is vendored reference source, committed on purpose** (not gitignored) — see
  README. `.repos/effect` is the Effect repo pinned at tag `effect@4.0.0-beta.102`, matching
  the installed version. v4's published docs are thin; that tree is the authoritative
  reference. Start with `.repos/effect/MIGRATION.md` and `.repos/effect/migration/*.md`, then
  the module source and `packages/platform-node/test/NodeHttpServer.test.ts` for working
  end-to-end examples.

## The design system: what is canonical, and how it reaches Tailwind

`packages/design-system` is the designers' delivered Tiny Taverns system, copied in whole.
**`packages/design-system/tokens/*.css` is the single source of truth for every design
value in the product** — no hex, radius, duration or measurement is restated anywhere else,
and `packages/ui/src/styles.css` bridges those tokens into Tailwind's theme layer by
`var()` reference only. `PORT-NOTES.md` in that package records exactly what was brought
across, what was left out, and the one-line `rsync` that does the copy.

**Nothing we author lives inside that package.** Every file in it is byte-identical to the
delivery except `styles.css` (relative `@import` paths) and `SKILL.md` (a filename case fix
and a pointer) — so `diff -r` against a new delivery names those two and nothing else, and
anything more is a real designer change. The two measurements the delivery states only in
prose, `--fs-label-l` and `--scrim-blur`, therefore live in
**`packages/ui/src/local-tokens.css`**, the same rule that keeps the layering scale in
`packages/ui/src/styles.css` §3. `adherence.test.ts` fails if either name reappears in a
delivered token file (delete it from ours — the delivery answers it now) or stops being
referenced by the bridge.

That rule was bought, not chosen: for as long as those two sat in the delivered token
files, the second delivery's diff reported `typography.css` and `elevation.css` as changed
when the designers had changed neither, and the whole update was scoped around a visual
change that did not exist.

`.claude/skills/tiny-taverns-design` symlinks to that package, so the delivered `SKILL.md`
is installed as a Claude Code skill without a second copy of the tokens.

The guidance material is worth reading before touching anything visual:
`packages/design-system/readme.md` (the design rules), `guidelines/*.html` (20 specimen
cards), and one `.prompt.md` + `.d.ts` + `.jsx` per component. **The `.jsx` files are the
visual specification, not shippable code** — prototype-grade inline styles and hand-rolled
`useState` hover. The real components live in `packages/ui`. Nothing can import the
prototypes by accident: they are outside the package's `exports` map, and ESLint forbids it.

Four things about the bridge that are not derivable from reading it:

- **The system is dark only, by design.** "A DM runs it at a lit table." There is no light
  theme, no `.dark` class and no toggle; the tokens resolve dark at `:root`. `dark:` is
  meaningless here and `packages/ui/src/adherence.test.ts` fails if one appears.
- **The theme _replaces_ Tailwind's scales rather than extending them.** A namespace reset
  (`--color-*: initial` and friends) deletes the built-in palettes and scales outright, so
  `bg-zinc-900` is not a class that exists. That is what guarantees no default slate/zinc
  survives — verified: the built CSS contains zero `oklch` values.
- **Token files are imported one by one, with `layer(base)`.** Not through the design
  system's own `styles.css` entry. `@import "…" layer(base)` inlines a file into an `@layer`
  block, and an `@import` nested inside a layer block is invalid CSS — the token files get
  dropped **silently, with the build still green**. `layer(base)` itself is required so the
  delivered `tokens/base.css` element rules beat preflight but still lose to utilities. The
  two import lists are kept in step by a test.
- **`tailwind-merge` must be told the theme's names** (`packages/ui/src/lib/tw-theme.ts`).
  With a replaced theme it cannot tell `text-label` (a size) from `text-on-accent` (a
  colour), lumps them in one group and silently drops one — which rendered primary buttons
  with slate body text until it was configured. A test parses `@theme inline` and fails if
  the name lists drift.

### The second delivery: what actually changed, and what it did not

Measured file by file when the delivery was swapped in, so the screen work that follows
does not re-derive it. **Not one token changed** — `tokens/*.css` is byte-identical across
both deliveries, all eight files. Nor did any `guidelines/*.html` specimen, any
`components/**` prompt, `.d.ts` or `.jsx`, `assets/`, `fonts/`, or
`_adherence.oxlintrc.json`. Proof, not inference: rebuilding `apps/web` across the swap
emits a stylesheet identical to the previous one apart from a single extra `:root`
selector — the file our two local tokens moved into. Verified in Chromium against the new
`guidelines/` pages: all 39 typography and elevation tokens resolve to the same values in
the running gallery as on the designers' own specimen pages, and the rendered ramp is
exactly the tokenised one (display-xl 48 / l 34 / m 26 / s 20, title 18, body 16, label 13,
`shadow-1` = `0 1px 2px rgba(0,0,0,.4)`, control radius 6, card 12, badge 4).

**So the delivery is a screen change, not a system change.** Four files and five additions:

- **`ui_kits/dm-screen/AppShell.jsx` — the 260px left rail is gone, replaced by a 56px top
  bar** (mark + wordmark, three nav items, then campaign, session badge and _Ask Hob_
  pushed right), with a per-screen `TopBar` below it. The active nav item uses `Tabs`' own
  2px accent underline, so navigation reads the same at both levels. **The shipped shell
  now matches** — see "The shell" below. `--rail-w` is still `260px` in `tokens/spacing.css`
  and `--spacing-rail` is still bridged, but nothing uses `w-rail` any more.
- **`ChatPanel.jsx`, `ChatParts.jsx`, `ChatLayouts.jsx`, `chat-data.js`, `chat-prep.html`**
  — the Hob assistant surface. `chat-prep.html` is the record of the three layouts that
  were considered; **Option A (a 400px persistent right panel) is the one that ships**, and
  `ui_kits/dm-screen/README.md` is where its behaviour, its parts and its open questions
  are written down. Read that before building it. **It is built** — `apps/web/src/hob/`; see
  "Hob: the chat surface is built, and nothing is behind it" below.
- **`CHAT_INLINE_MIN` fell from 1180 to 1020**, and the two changes are one change: the
  panel goes inline above that width and becomes a scrimmed overlay below it, and dropping
  the rail handed 260px back to the content.
- `readme.md` and `ui_kits/dm-screen/README.md` restate the above in prose. The readme's
  "light cool mist" two-mode line survives unchanged, and the kit's own JSX still does not
  follow it — **the system is dark only; that has not moved.**

### The third delivery: the Chronicle, and nothing else

**The export overwrote the folder the _first_ delivery came from**, so the path is no evidence
of which delivery is on disk. Check the content instead: this one carries delivery two's chat
files byte-identically _and_ the new Chronicle. Taking a stale export from that path would
regress merged work, and nothing about the folder name would say so.

Measured the same way as the second. **Not one token changed — all eight `tokens/*.css` are
byte-identical, and so is every file under `components/`**, plus `guidelines/`, `assets/`,
`fonts/` and `_adherence.oxlintrc.json`. No theme-bridge work was needed or done; if a future
delivery seems to need some, that is a finding worth reporting rather than a routine step. Test
counts were identical across the swap (353 in 33 files).

**It is one screen, added.** Four files:

- **`ui_kits/dm-screen/AppShell.jsx` gains exactly one line** — a fourth nav item,
  `{ id: "chronicle", icon: "scroll-text", label: "Chronicle" }`. Nothing else in the shell
  moved; the 56px top bar and its underline recipe are the second delivery's and are unchanged.
- **`Chronicle.jsx` and `chronicle-data.js` are new.** A vertical timeline of session recaps —
  each an expandable card over a dot-and-rule spine — with a sticky "Threads still open" aside
  at `--aside-w`, a search box, and a **_Read aloud_ toggle that drops the DM-only half of the
  page rather than restyling it** (the aside, the still-open/at-the-table facets, the status
  badge and the whole action row all go; the summary switches to serif at `--fs-body-l`).
- `index.html` wires both in and extends its `@dsCard` subtitle.

Three things to know before building it, none of which the delivery says out loud:

- **It is the only kit screen with no prose documentation.** The chat panel got a whole
  `ui_kits/dm-screen/README.md` section in delivery two; the Chronicle got none, and
  `readme.md` does not mention it either. The `.jsx` and the fixture data are the entire
  specification — read them, do not look for a README that answers the open questions.
- **`chronicle-data.js` is `window.TT_CHRONICLE`, a separate global from `data.js`'s
  `TT_DATA`**, and `Chronicle` reads both (`TT_DATA.campaign.session` names the _Recap
  session N_ button). Sessions 9–11 only: the screen's own footer says 1–8 "are in the old
  notebook", so an importer is drawn as a sentence, not built.
- **Provenance is the whole point of the screen, and the schema already carries it.** A recap
  is `status: "draft" | "edited"` — a draft wears a `magic` badge reading "Hob's draft" and
  offers _Redraft / Edit / Keep it_; an edited one reads "Drafted by Hob, edited by you · N
  words" and offers only _Edit_. That is `origin` + `assistant_turn_id` on a content table (see
  the actor and visibility contract), not a new mechanism — and "nothing is saved to the
  chronicle until you keep it" is the draft's own copy, so an unkept draft is not a row.

**`packages/ui`'s icon table grew by nine and that is the only change outside the vendored
tree** — `chevrons-up`, `coins`, `flag`, `help-circle`, `map-pin`, `megaphone`, `refresh-cw`,
`scale`, `trending-up`. The table's own rule is that it grows when a delivery names a glyph, so
it tracks deliveries rather than waiting for the screen. **Scan for both spellings**:
`Chronicle.jsx` passes half of them through a local `Facet icon=` prop, so a grep for
`name="…"` alone undercounts by four. `help-circle` is keyed as the delivery spells it and
bound to Lucide's current `CircleHelp` export.

### The fourth delivery: the player side, and a role switch nothing implements

Measured the same way as the second and third, and the same result: **not one token changed —
all eight `tokens/*.css` are byte-identical**, and so is every file under `components/`,
`guidelines/`, `assets/`, `fonts/` and `_adherence.oxlintrc.json`. No theme-bridge work was
needed or done. Test counts were identical across the swap (52 files, 647 tests). The whole
delivery is `ui_kits/dm-screen`: **seven new files and three changed**, nothing else.

- **`AppShell.jsx` gains a role switch**, and it is the change with the widest blast radius.
  `NAV` is now `{ dm, player }`; the DM nav gains a fifth item (**Party**, `users`) and the
  player nav is three (`Characters`, `At the table`, `Chronicle`). A pill toggle sits in the
  top bar left of _Ask Hob_, and in player mode an initials avatar appears beside it.
  `AppShell` takes `role = "dm"` and an optional `setRole`; **the switch renders only when
  `setRole` is passed**, so the DM-only shell is the default and is unchanged.
- **`Party.jsx` is the DM's seat screen** — the roster, the join link, and a "Needs you" aside.
- **`MyCharacters.jsx`, `CharacterSheet.jsx`, `CharacterCreate.jsx`, `PlayerTable.jsx`** are the
  player's four screens, on `PlayerParts.jsx`'s primitives (`SheetSection`, `AbilityBlock`,
  `StatPill`, `HpTrack`, `DeathSaves`, `Portrait`, `Seat`, `KeyVal`, `sign`). **`Party.jsx`
  imports `SheetSection` and `Seat` from there too**, so the DM screen depends on the player
  parts file — it is shared primitives, not a player-only module.
- `player-data.js` is `window.TT_PLAYER`, a **fourth** global beside `TT_DATA`, `TT_CHRONICLE`
  and `TT_CHAT`. `index.html` and `README.md` wire and describe it.

**The role switch is shipped, as a _mode_** — see "The role switch" under the shell. The delivery
draws it with a `setRole` callback; what shipped carries the mode in the URL instead, so
`navFor`/`sectionOf` gained their second axis by reading the route rather than by taking a role
argument, and the pill is two links. The delivery's player nav is three items and the shipped one
is _Tables_ plus the gallery, for the rule that keeps _Run_ out of the DM's row: a screen earns
its item when it exists.

**Three places where the delivery contradicts something already shipped and reasoned about.**
Read the relevant section before building against the fixture, because in each case the fixture
is the newer drawing and the written rule is the older decision:

- **The join link is drawn as multi-use and reusable** — `invite: { uses: 2, max: 6 }`, a "Link
  accepts new players" switch, "Share the link to fill it". **The shipped invitation is
  single-use by decision**, one invitation → one membership, with the reasoning in "The
  invitation: a credential, and the four rules that bound it". These cannot both be true.
- **A "seat" is drawn as a first-class row that exists before a player** — an _open_ seat with
  nobody in it, an "Add seat" button, a seat count in the subtitle, and the four statuses
  `playing` / `no-character` / `invited` / `open`. **There is no seat table**; membership is a
  `campaign_member` row, which cannot exist before an account. The delivery's own README argues
  the split ("a seat can be invited, accepted-but-empty, playing, or open") and it is a
  coherent model — it is simply not the one in the schema. **Settled since: membership is the
  model and there is no seat**, with the three derivable statuses and the read each comes from
  written down under "Membership is the model, and there is no seat". **It is drawn** — see "The
  party screen: the roster, and the seat vocabulary derived" — so read both before changing it.
- **"I approve characters before they play" is a switch with nothing behind it**, and the
  delivery's own "Open questions" says so: there is no approval queue screen and no column.

Two smaller things the follow-on work will need:

- **The drawn character sheet is far richer than the `character` table** — skills, spell slots,
  features, inventory, currency, death saves, level-ups, a journal. **Its server half is built,
  and it cost no migration**: every one of those is an optional key on `body`, and the rule that
  decided so is unchanged. See "What the character sheet reads, and where each part of it lives",
  which is also where the drawn things the data cannot supply are listed.
- **`PlayerTable.jsx` is the player projection of a fight**, which the server has never built —
  its own header comment states the contract (no monster hit points, no initiative editing, only
  what the DM shares plus your own turn). That is the projection the `DmActor` gate exists to
  make possible; see "The actor and visibility contract".

**`packages/ui`'s icon table grew by sixteen and that is again the only change outside the
vendored tree** — `arrow-big-up-dash`, `backpack`, `copy`, `corner-down-right`, `crown`,
`hand-helping`, `hexagon`, `image-plus`, `link`, `mail`, `package`, `shield-half`, `unlink`,
`user`, `user-plus`, `user-round-x`. **This delivery spells icon names a third way**: bare tuple
elements (`["Dodge", "shield-half"]`, `["dm", "crown", "DM"]`), which neither `name="…"` nor
`icon: "…"` finds. The sweep that works is to intersect every kebab string literal in the kit
against `lucide-react`'s own export list and read the survivors in context — which is also the
only way to reject the false positives, since `grid`, `baseline`, `pointer`, `text` and `table`
are all real Lucide glyph names and none of them is an icon here.

## Overlay layering: one scale, and where a new overlay goes on it

**Every z-index in this product comes from the scale in `packages/ui/src/styles.css` §3.**
Reach for a rung — `z-chrome`, `z-scrim`, `z-dialog`, `z-popup`, `z-toast`, `z-tooltip` —
never a number. `packages/ui/src/layering.test.ts` fails on a `z-50`, a `z-[9999]` or a
`z-(--anything)` in any component file or in `apps/web/src`, and compiles the real
stylesheet to assert the order the browser will compute.

The scale is the **one block in the theme bridge that is not a `var()` into
`packages/design-system`**, and that is deliberate, not an oversight to correct: the
delivered system tokenises colour, type, space, radius, elevation and motion and says
nothing about stacking, because it ships no portalling components. Its "elevation" is
`--shadow-1..3` — a different question from which of two fixed boxes wins. The design
system is read-only; the scale belongs to the components that portal, which live in
`packages/ui`. Do not "fix" this by adding tokens upstream.

Lowest to highest, with the reason each rung is where it is:

| rung      | value | why here                                                                                                                   |
| --------- | ----- | -------------------------------------------------------------------------------------------------------------------------- |
| `chrome`  | 10    | sticky page furniture — the app header, and the Hob panel while it is inline. Not an overlay; must lose to the scrim.      |
| `scrim`   | 100   | the modal backdrop.                                                                                                        |
| `dialog`  | 110   | the surface the scrim dims — above **its own backdrop**, by number.                                                        |
| `popup`   | 200   | select / menu / popover. Anchored to a control that is often _inside_ a dialog, so it is more nested and must be above it. |
| `toast`   | 300   | an interruption the DM must not miss.                                                                                      |
| `tooltip` | 400   | labels a control on any layer below, and never takes a pointer.                                                            |

Gaps of 100 so a rung can be inserted without renumbering. Two of the orderings were
bugs, and both were invisible to the test suite:

- **A select opened at 40, under a dialog at 50.** The backdrop is `fixed inset-0`, so it
  did not merely hide the popup — it ate the click. Measured in Chromium against the
  shipped `NoteDialog`: the popup rendered, `elementFromPoint` at its centre returned the
  dialog body, and clicking an option left the value unchanged. That is the captain's
  "the select dropdown form inputs do not open".
- **Toast and dialog were both 50, which left document order to decide — and it always
  decided against the toast.** The toast viewport mounts with the `Toaster` near the app
  root, so it is _always_ earlier in the body than a dialog's portal. Measured 6/6 behind
  the backdrop, not intermittently.

**Equal layers are the bug, not a tie.** Anything that must sit above something else gets
a strictly greater rung, including a dialog over its own scrim — which worked only
because `DialogOverlay` is rendered before `DialogPrimitive.Popup`.

**`toast-stack`'s `z-index` is local and is not a rung.** The viewport is a stacking
context, so `calc(var(--z-index-toast) - var(--toast-index))` only has to descend and the
base it counts down from is inert. It is written off the token anyway so no layer number
appears twice; the test insists on it.

Two things about verifying this class of change, both learned the hard way:

- **jsdom computes no stacking, so no component test can see any of it** — the same blind
  spot `motion.test.ts` exists for. Drive a real browser and assert with
  `document.elementFromPoint`, then _click an option and check the value changed_: a popup
  that renders is not a popup that works.
- **Headless Chromium reports `(hover: none)`, and Base UI's tooltip only opens on hover
  when the device can hover** — so a tooltip driven headlessly never opens and nothing says
  why. Launch with
  `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4`,
  or drive the tooltip `open` prop directly.

## Motion: `translate` and `transform` are separate properties now

**In Tailwind v4 `-translate-x-1/2` does not compile into `transform`.** It compiles into the
independent `translate` property (`--tw-translate-x: -50%; translate: var(--tw-translate-x)
var(--tw-translate-y)`), and `translate` _composes_ with `transform` — the individual property
is applied first, then `transform` on top. In v3 it compiled into `transform`, so an animated
`transform` replaced it.

Everything animated in `packages/ui` depends on knowing which. The dialog shipped with
keyframes carrying `translate(-50%, -50%)` and a comment explaining that the animation
replaces the centring utility. Under v4 both applied: the popup sat a full 50% of its own
width and height off-centre for the whole 200ms (measured 230px across, 82px up on a 460×328
dialog) and teleported into place on the frame the animation ended. It read as "no transition,
then a jerk" — and nothing caught it, because at rest the two states are identical.

Two rules follow, both enforced by `packages/ui/src/motion.test.ts`:

- **Keyframes carry the motion delta only, never layout the utilities already own,** and they
  end on `transform: none`. That makes "no snap at the end" structural rather than a
  coincidence of matching percentages.
- **Never mix `translate-*`/`scale-*` utilities with a hand-written `transform` on the same
  element** — and never `transition-[transform]` a change made by a `translate-*` utility.
  The toast did the latter and its 10px slide simply never animated; only the fade did.

`motion.test.ts` compiles the real `styles.css` through Tailwind's Node API and asserts on the
emitted CSS. That is the only place this class of bug is visible: jsdom computes no animations
and no layout, so the component tests cannot see it and never will. If a future Tailwind emits
`transform` for those utilities again, the first test in that file is what tells you.

**The bridge's motion names are self-referential on purpose.** `--ease-out: var(--ease-out)` in
`@theme inline` looks broken and is not: the Tailwind theme lands in `@layer theme`, the design
system's real `:root` lands in `@layer base`, and base outranks theme. (Same shape for
`--font-*` and `--shadow-*`.) It is load-bearing that the tokens keep their `layer(base)`
import — drop it and every one of these becomes a genuine cycle, invalid at computed-value
time, which takes the whole `animation` shorthand down and kills the animation with nothing in
the console. `motion.test.ts` asserts a real `cubic-bezier` survives.

**`prefers-reduced-motion` zeroes every `--dur-*` token upstream** in
`packages/design-system/tokens/motion.css`, so anything timed from a token flattens correctly
and anything timed from a literal does not. Before diagnosing "the animations don't run",
check `matchMedia("(prefers-reduced-motion: reduce)")` — instantaneous is the correct
behaviour there, not a bug.

## shadcn on Base UI, not Radix

`packages/ui/components.json` sets `"style": "base-nova"`. In shadcn 4.x the _base_ is
chosen through that style/preset name (`shadcn init --base base|radix|aria`, presets
`nova`, `vega`, `maia`, …), not a separate registry URL. The package is **`@base-ui/react`**
— `@base-ui-components/react` is the old name and is deprecated upstream. No `@radix-ui/*`
package is in the tree, and `adherence.test.ts` asserts that against the lockfile.

`shadcn add <name>` emits `@/` imports; rewrite them to relative ones. `packages/ui` is
consumed as source by another app's Vite, which resolves `@` to _its own_ `src`. A registry
component also emits an `IconPlaceholder` for whichever icon set you have not chosen — swap it
for `Icon` from this package, whose table is the one place a glyph is named.

The ported set is the list in `adherence.test.ts`, which fails if a file appears in
`components/ui` without being named there. The four newest — `separator`, `sheet`, `skeleton`,
`sidebar` — came in together as `sidebar`'s registry dependencies; see "The panel is shadcn's
`sidebar`" below for what each is for and where the vendored copies diverge.

Two Base UI deltas worth knowing: `Checkbox` takes a separate `indeterminate` prop rather
than `checked="indeterminate"`, and jsdom ships no `PointerEvent`, which Base UI's controls
construct on click — hence `packages/ui/test/pointer-event-polyfill.ts`, shared with
`apps/web` through the package's `exports` map.

**Fonts: Instrument Sans and JetBrains Mono are not self-hosted.** Alegreya ships as real
variable TTFs in the design system and is wired up by `tokens/fonts.css`; the other two load
non-blocking from Google Fonts via the `<link>` in `apps/web/index.html`, which is the
designers' documented approach. Every `--font-*` token carries a real system fallback, so an
offline page degrades legibly — but a tool used at a table with poor connectivity may want
those two local later. Uploading `.woff2` files and adding `@font-face` rules to
`tokens/fonts.css` is all that would be needed.

## Effect v3 → v4: the API mapping this repo needed

Not derivable from the code. The headline change is **package consolidation**:
`@effect/platform` has no v4 at all — its HTTP surface moved into core `effect` under the
`effect/unstable/*` subpaths. `@effect/platform-node` does have a v4. Modules under
`unstable/` may break in minor releases; they graduate to top-level `effect/*` as they settle.

| v3                                        | v4                                                          |
| ----------------------------------------- | ----------------------------------------------------------- |
| `@effect/platform` (HTTP)                 | `effect/unstable/http` (package removed entirely)           |
| `Context.Tag(id)<Self, Shape>()`          | `Context.Service<Self, Shape>()(id)` — note arg order       |
| `Layer.succeed(Tag, Tag.of({...}))`       | `Layer.succeed(this, {...})` in a `static` on the class     |
| naming: `FooLive` / `Foo.Default`         | naming: `Foo.layer` (v4 convention)                         |
| `HttpRouter.empty.pipe(HttpRouter.get())` | `HttpRouter.add(method, path, handler)` → a `Layer`         |
| `HttpServer.serve(HttpMiddleware.logger)` | `HttpRouter.serve(routeLayer)`                              |
| `HttpServer.withLogAddress`               | built into `HttpRouter.serve` (`disableListenLog` opts out) |

Unchanged across the bump: `Layer.launch`, `NodeRuntime.runMain`, `NodeHttpServer.layer`,
`HttpServerResponse.json` (still returns an `Effect`), and `HttpServerResponse.status`.

Two v4 shape changes that are easy to get wrong:

- **The router is a service, not a value.** In v3 a router was an immutable value piped
  through combinators. In v4 routes are `Layer`s that register themselves against an
  `HttpRouter` service during layer construction, so they compose with `Layer.merge`
  rather than a builder chain.
- **Route dependencies travel as type-level markers.** `HttpRouter.add` puts a handler's
  requirements into the layer's `R` as `Request<"Requires", Health>` (and its errors as
  `Request<"Error", E>`), not as plain `R`. `HttpRouter.serve` unwraps the markers back
  into real requirements, which is why `Layer.provide(Health.layer)` goes _outside_
  `serve`, not inside the route.

Literal types need help: `Layer.succeed(Tag, value)` infers through `Types.NoInfer`, so a
service returning `{ status: "ok" }` widens `status` to `string`. Both `Layer.succeed` and
`Layer.effect` are dual, and the **curried** form — `Layer.succeed(this)({ … })` — does not
go through `NoInfer`, so it keeps the literal without an annotation. Prefer it; every service
in `apps/server/src` uses it.

## Module resolution: `Bundler` for the bundled app, `NodeNext` for the executed one

The tsconfig presets are split along **who resolves the specifiers at runtime**, and getting
this wrong emits code that typechecks and then fails to load:

| preset               | resolution | used by                      | why                                           |
| -------------------- | ---------- | ---------------------------- | --------------------------------------------- |
| `vite.json`          | `Bundler`  | `apps/web`                   | Vite really does bundle and resolve           |
| `react-library.json` | `Bundler`  | `packages/ui`                | emits `.d.ts` only; source is bundled by Vite |
| `node.json`          | `NodeNext` | `apps/server` (both configs) | `tsc` emit is executed by plain `node`        |

`Bundler` lets relative imports omit their file extension. `tsc` never rewrites relative
specifiers on emit, so under `Bundler` a plain `tsc` build emits `./Health` verbatim and
Node's ESM resolver rejects it — the exact `ERR_MODULE_NOT_FOUND` that `apps/server` shipped
with. `node.json` overrides the `Bundler` inherited from `base.json` with `NodeNext`, which
makes the compiler _enforce_ what Node requires. Hence the `.js` extensions on relative
imports in `apps/server/src` and `test`: on a `.ts` source file that is correct and
intentional under NodeNext — it names the emitted file. Add a new relative import there and
`typecheck` will tell you.

**The server's build output must be smoke-tested under real `node`.** Nothing routine catches
a bad emit: `dev` runs under `tsx` and `test` under Vitest, both of which tolerate
extensionless specifiers, while `build` and `typecheck` only emit or check and never execute.
`apps/server/test/start.smoke.test.ts` closes that gap — it runs `tsc -p tsconfig.build.json`,
spawns `dist/main.js` under `process.execPath`, and asserts `GET /health`. Keep it executing
the real build output under real `node`; rewriting it to import `src` through Vitest silently
restores the blind spot. **The `tsc` call stays inside the test**, which is what makes it
impossible to pass against a stale or absent `dist/` — hand the compile to the build pipeline
and the guarantee degrades into a claim about whatever happened to be on disk. It is not the
slow part either: 1.5–1.8s under full `turbo --force` load, the same as it takes alone.

**The listener must be built _after_ the application, and `main.ts` is where that is
arranged.** `NodeHttpServer.layer` calls `server.listen` while it is being _constructed_
(`NodeHttpServer.make`), and `Layer` builds a layer's dependencies before the layer itself
(`provideWith` in `Layer.ts` builds `that`, then `self`). So the direction of the
`Layer.provide` edge between the listener and the app _is_ the order the socket binds in —
this is a composition constraint, not a runtime detail, and it is the same class of ordering
trap as "middleware implementations go outside `HttpRouter.serve`".

The natural-looking composition gets it backwards. `application.pipe(Layer.provide(listener))`
with a bare listener binds the socket first and opens the connection pool and runs the
migrations after, because the application layer is the one that does those. Everything that
connects in between is accepted by the kernel and then **never answered** — not answered late,
never at all, because no `request` handler is attached yet. Measured: accepted at 273ms, first
answered at 307ms, and a request written on a connection opened at 273ms was still unanswered
30s later while the server logged "Listening" and served fresh connections 200. That is a real
deployment fault, not a test artifact: an orchestrator's readiness probe is exactly the client
that connects to a server which has just come up.

The fix is one edge: `main.ts` names `services` as a dependency _of the listener_
(`listener = …NodeHttpServer.layer(…).pipe(Layer.provide(services))`). `services` must be the
exported layer object from `app.ts`, not a fresh `servicesOver(Database.layer)` — `Layer`
memoises by layer identity within one build, which is what keeps this to one pool and one
migration run. Verified after the change: ~250 `ECONNREFUSED` in the ~290ms before `listen`,
the first accepted connection answered every time (5/5), accept→serve down from 30–58ms to
6–8ms with no I/O left in it, and — the crisp check — a server pointed at an unreachable
database now never binds the port at all, where before it bound, accepted, and then died.

The residual gap is `HttpRouter.serve` building its router between `listen` and the handler
attaching; it is pure in-memory work. Effect v4 cannot close it entirely, because
`HttpServer.serve` needs the `HttpServer` service to exist before it can attach anything, and
constructing that service is what listens.

`apps/server/test/start.smoke.test.ts` guards the ordering with a raw-socket test ("answers the
first connection it accepts") — `fetch` cannot express it, because the property is about one
specific connection. **Its `ATTEMPT_TIMEOUT_MS` retry stays even though the server is fixed**: a
bounded per-attempt timeout on a fresh connection is correct client behaviour, and a test that
assumes a perfect server is a worse test. That workaround is also the history — the old ordering
made this file flaky at roughly 1 run in 5 under `turbo --force`, where database work widened the
window to seconds and one unlucky unbounded `fetch` hung until the 60s budget expired, producing
a 65s signature that got blamed on the 1.6s compile.

## The database, and the migration workflow

Postgres, via `@effect/sql-pg`. Not SQLite — the schema is Postgres dialect and the
dialects are not portable, so this is settled.

- **`pnpm db:up`** starts the development database (`compose.yaml`, Docker). `db:down`
  stops it; `db:reset` throws the data away and starts again. It binds **5433**, not 5432,
  because developer machines commonly already run a Postgres on the default port.
- `DATABASE_URL` overrides the committed dev default in `apps/server/src/Config.ts`.
  Nothing secret lives there — same throwaway credentials as `compose.yaml`, loopback only.
- **Migrations are forward-only.** `effect/unstable/sql/Migrator` has no down-migration
  concept; do not invent one. A mistake is corrected by a new migration.
- **A migration whose id is below the highest already applied is _skipped, silently_.**
  `Migrator.run` keeps only `currentId > latestMigrationId` (see
  `.repos/effect/packages/effect/src/unstable/sql/Migrator.ts`), so two people numbering in
  parallel can leave a gap that never fills: whichever lands second is never run on a database
  that already applied the higher number. Fresh databases are fine. If it happens, renumber the
  latecomer or `pnpm db:reset` — and do not assume a green boot means every file ran.
- Add `apps/server/src/migrations/NNNN_name.ts`, default-exporting an
  `Effect<unknown, unknown, SqlClient>`. They live under `src/` so `tsc` emits them to
  `dist/migrations/*.js`; `Database.migrationsDirectory` resolves from `import.meta.url`, so
  the same code finds `.ts` under `tsx`/Vitest and `.js` under plain `node`.
- One statement per `sql` call. The pg driver uses the extended protocol, which rejects
  multiple statements in one query.
- The server migrates on boot, so it refuses to start against a schema it does not know.
  `pnpm -F server migrate` runs them without holding a port.

**Database tests run against a real Postgres and fail loudly when it is missing** —
`apps/server/test/support/database.ts` creates a private database per test file and turns a
connection failure into a message saying `pnpm db:up`. Do not make them skip instead: this
repo has twice shipped a defect that a green build hid, and a silently-skipped database test
is that same pattern.

**A pool per file against `max_connections = 100` is the ceiling, and on a big machine
`pnpm -F server test` alone can hit it.** Vitest sizes its worker pool from the core count, each
worker holds a `PgClient` pool, and past roughly twenty concurrent files Postgres starts refusing
— which surfaces as the `pnpm db:up` message on files that have nothing wrong with them, several
at once and different ones each run. It is not a defect in whatever you just changed: check it
against a clean tree before believing it. `pnpm test` from the root does not show it (turbo runs
web and server together and each takes fewer workers), and `--maxWorkers=6` is the one-flag
answer when it does.

## The actor and visibility contract

Every future endpoint follows this. It is the one ordering constraint the architecture calls
non-negotiable, because it is free on day one and a retrofit later.

- **`CurrentActor` is a type-level requirement.** Repository methods return
  `Effect<A, E, CurrentActor>`, so an unscoped read does not compile. A handler obtains the
  actor only from the group's `.middleware(Authorization)`.
- **The visibility predicate lives in SQL, never in a handler** — see
  `apps/server/src/repo/visibility.ts`, which is the only place it is written.
  Post-filtering in a handler is the leak pattern: the DM-only text is already in memory and
  one forgotten `.filter` ships it.
- **Reads and writes use different predicates.** A player may read a `shared` note and must
  still not edit it, so `rowWritable` is not `rowReadable`.
- **`campaignInScope` is membership, not ownership, and it is the base case of every predicate
  in the product.** A `campaign_member` row `(campaign_id, account_id, role, revoked_at)`
  decides who reaches a campaign; `campaign.account_id` is the cascade parent and the answer to
  "whose account is this" and **is not a reach path**. `apps/server/test/membership.test.ts`
  greps `apps/server/src` and fails if `campaign.account_id` reappears in any predicate, if a
  third module names `campaign_member`, or if anything but `repo/Memberships.ts`'s `addOwner`
  writes one. Everything composes it: `campaignReadable` / `campaignWritable` call it,
  `rowReadable`, `corpusRowReadable` and `ownedRowReadable` embed `campaignReadable` in an
  `exists`, and the `contained*` / `nested*` / `ensure*` families recurse to those. There is no
  predicate in `visibility.ts` that does not reach it. See `0011_membership.ts`.
- **One reach has been added since, and one only**: `ownedRowReadable` — a player reads the
  `character` row whose `account_id` is theirs, whatever that row's own `visibility` says. It is
  a third disjunct of the innermost test, so every clause above it still applies. See "**`account_id`
  means something now**" under the party for what it grants and what it deliberately does not.
- **`Actor` carries no role, and cannot.** A person is the DM of one table and a player at
  another _at the same time, on the same credential_, so "may this actor see `dm` rows" is a
  question about a pair — this account, this campaign — and a pair is a row. `isDm` in
  `visibility.ts` is that question. `Actor` is `{ accountId, campaignId }` and nothing else.
- **Two membership writers exist, neither takes a role, and both spell it as a SQL literal.**
  `repo/Memberships.ts` is still the only module that writes the table: `addOwner` writes `'dm'`
  inside `Campaigns.create`'s transaction, `admitPlayer` writes `'player'` inside
  `Invites.redeem`'s. So "an invitation cannot become a DM membership" is a fact about which
  statements exist rather than a check somebody performs, and `membership.test.ts` greps for a
  third role literal, for an interpolated one, and for a writer that takes a `MemberRole`
  argument. `revokePlayerAt` is the third function there and its `where` names `role = 'player'`
  for the same reason — no bug upstream can turn "withdraw an invitation" into "unseat the DM".
  Co-DMs stay a settled _no_; when they arrive they must be their own act, not this path with a
  role argument. `apps/server/test/support/actors.ts`'s `aPlayerAt` **mints its player through a
  real invitation** now (it used to insert the row with raw SQL and said so at length), so every
  player in the suite — ten files, including the one that pins the DM gate — exercises the
  shipped path. `anAccount` and `scopedTo` are the other two; no test constructs an `Actor` by
  hand.
- **Membership and credential scope narrow independently, and both apply to every read.**
  `Actor.campaignId` is still the reach of the credential: `null` for an account-wide token, a
  campaign id for one minted for a single table. Membership says which campaigns the account
  touches at all; the scope clause narrows that further, and is deliberately not keyed on the
  role, so a scoped credential minted later for something other than a player cannot reach past
  its campaign either. Without it a credential minted for one table would reach every campaign
  the same account belongs to — a cross-table leak between two tables run by the same person,
  which is exactly the defect the scope closed and which was invisible for as long as it was
  because no test minted a scoped actor.
- **Write `isDm` so it takes the campaign explicitly.** Every campaign-scoped read has the id
  bound from the path, which makes the role test a constant for the whole query: measured on
  Postgres 18 against `combatants.list`, all five membership tests hoist to `InitPlan`s on
  `campaign_member_pkey` and are evaluated once, not per row, even though the
  `combatant → encounter_run → session → campaign` chain mentions them at four levels. A version
  that correlated to the row instead would lose the hoist and pay per row. The correlated form
  (`campaign.id`) is for the one read with no campaign in its path: the campaign list, where the
  role genuinely is per row — index scan → Memoize → PK probes, 0.23ms at 62 campaigns and 20k
  memberships, against 0.06ms for the ownership version. That is the only read that got slower.
- **The one thing membership genuinely weakened, and what buys it back.** A player's write
  refusal used to compile to the literal `false`; it is now a row. So
  `campaign_owner_is_dm_member` makes "a campaign whose owner is not its DM" _unrepresentable_ —
  the `0006_session_finished.ts` trick applied to a role: `campaign_member.is_dm` is
  `role = 'dm' and revoked_at is null`, the campaign's side is a constant `true`, and the key is
  `deferrable initially deferred` so a campaign and its owner row can be two statements.
  `Campaigns.create` therefore writes both in **one transaction**, and every hand-written
  campaign in the test suite has to as well. Demoting, revoking or deleting the owner's own
  membership is refused on the spot; a player member leaving is not.
- **A failed COMMIT is a defect, not a typed failure.** `sql.withTransaction` wraps the commit
  in `Effect.orDie` (`SqlClient.makeWithTransaction`), so a _deferred_ constraint —
  `campaign_owner_is_dm_member`, `campaign_assistant_turn_fkey`, `encounter_creature.creature_id`
  — arrives as a defect. `Effect.result` does not catch it and `Effect.exit` does; an immediate
  constraint still fails the statement inside the transaction and stays a typed `SqlError`. A
  test that asserts on a refusal has to know which.
- **Visibility is two levels — or three, for a table that hangs off another row.**
  `campaign.visibility` is the master toggle; a row's own `visibility` narrows within it, so a
  `shared` note inside an unshared campaign stays invisible. `prep_item` hangs off `session`, so
  it adds a level: `nestedRowReadable` in `visibility.ts` composes `rowReadable(parent)` rather
  than restating it, which is what carries the campaign-scope containment down. **A nested table
  gets no denormalised `campaign_id`** — a child whose copy disagreed with its parent's would be
  readable in a campaign it is not part of, and no `WHERE` clause would notice.
- **A parent id in a path is a client claim, not a fact.** `PrepItems` takes the campaign _and_
  the session and refuses if the session is not in that campaign. Trusting the session id alone
  would let a credential scoped to one table read another's checklist by naming its session id.
  `apps/server/test/prep-visibility.test.ts` pins both the honest and the smuggled path.
- **Denial is `NotFound`, not `Forbidden`.** Saying "it exists but is not yours" is itself a
  disclosure.
- **A new table gets `visibility` (default `'dm'`), `origin` (default `'authored'`) and
  `assistant_turn_id` — the last one a real foreign key into `assistant_turn`, deferrable.**
  `apps/server/test/schema.test.ts` fails if one does not, and `0010_assistant_conversation.ts`
  is the pattern to copy. The opt-out list is in that test file, so skipping it takes a visible
  edit. The columns went in at `0001` because retrofitting provenance onto a table that already
  mixes authored and generated rows means guessing which is which; only `repo/Proposals.ts`
  ever writes `origin = 'assistant'`.
- **`creature` is the one table whose rows may belong to no campaign** — the global `system`
  corpus — and it therefore has a predicate of its own, `corpusRowReadable`. Read the bestiary
  section below before writing anything that looks like it; the obvious spelling leaks.
- **When a table's player projection diverges from its DM projection, its DM repository takes a
  `DmActor` in the same change.** This is the one rule here that has to be remembered rather than
  compiled, and it is why `apps/server/src/repo/DmActor.ts` exists. A `DmActor` is a branded
  proof of the pair (this account is a `dm` member of this campaign, and this credential reaches
  it), minted only by `DmActors.of` — one read through `campaignWritableById` — and it **carries
  the campaign**, so the gated methods take it _in place of_ a campaign id and a proof for one
  table cannot be spent on another. Seventeen methods have it today: `Combatants` (5),
  `EncounterRuns` (7), `SessionEvents` (3, including the streaming `pollForRun`, which a grep
  for `CurrentActor>` cannot see), `Recap.read` and `Memberships.list` — the roster, whose
  player projection is _nothing_ rather than a narrower schema (see "Membership is the model,
  and there is no seat"). The other sixty actor-scoped methods do
  not, and should not: they return a `shared` row a player is entitled to see in full, so
  `GET …/notes` answering the ordinary `Note` discloses nothing. `Characters.assign` is the
  newest of them and is ungated for one more reason worth keeping: it is a **write**, and
  `rowWritable` already requires `isDm`, so a proof on top would be a second answer to a question
  the predicate underneath answers first. **The gate is a precondition on
  the seam, not a replacement for it** — every gated method still composes `visibility.ts`
  unchanged, so a bug in the gate degrades to today's behaviour rather than to an open door.
  `apps/server/test/dm-actor.test.ts` pins all of it, including seven `@ts-expect-error` lines
  that fail the _build_ if a campaign id, a plain `Actor` or a hand-built object ever becomes
  acceptable.
- **Gate first, project later — a boundary that waits for the screen behind it is not a
  boundary.** `Recap.read` was left ungated on the reasoning that the player Chronicle was a
  planned screen and gating it would settle that screen's shape by accident. That reasoning
  conflated two decisions, and only one of them was cheap: deferring the _projection_ costs
  nothing, leaving the _wide read reachable_ costs a disclosure the moment a player actor exists.
  Player accounts and invitations shipped, and the recap then handed a player of a `shared`
  campaign a monster's exact `hpCurrent`, `hpMax` and `ac` — measured against real Postgres, 41 of
  82 at armour class 17. The gate could have gone on the day the other three did, costing a 404
  for a screen nobody had built. See "The recap has a player projection" below.
  **`Memberships.list` is what the rule looks like followed**: it was gated in the change that
  declared `GET /campaigns/:c/members`, so there is no release in which it answered a player.

### The invitation: a credential, and the four rules that bound it

**A link is an invitation to join, not a way in.** Following one requires signing in or signing
up; its whole effect is to grant a `campaign_member` row to the account that accepts it. It is
explicitly **not** a bearer credential over campaign data, not a guest account with no identity,
and not a second credential kind with an actor shape of its own — the plan calls that last one
"a second way to be reachable, which is exactly where the next leak lives". So once accepted the
member is ordinary, and the whole feature needed **no new predicate, no new base case and no
change to `Authorization`**. If a change here starts to need one, that is the signal it has
drifted into the shape the plan rejected.

An invitation is still a credential, so it has a lifetime. The four rules, each chosen to fail
safe, and each a property of the schema or of a statement rather than a habit:

- **Single-use.** One invitation, one membership; `redeemed_at` is set in the transaction that
  writes the membership, under a `for update` on the invite row, so two clients racing on one
  link produce exactly one member. **Redeeming twice from the same account is the same success**
  — a double-tapped _Join_ is one person joining once, and answering "no such invitation" would
  read as somebody having stolen it.
- **Expiring, on a fixed server clock.** `expires_at` is `created_at + INVITE_TTL_DAYS` (14) and
  is never client-supplied, so an eternal invitation is not expressible. The liveness test and
  the `status` a DM reads are both computed by the **database** (`now() >= expires_at`, selected
  as `expired`), so a browser clock never decides.
- **Revocable before acceptance _and_ after it.** `POST …/invites/:id/revoke` withdraws it, and
  if it has already been taken it revokes the membership it granted **in the same transaction**.
  A revoke that left a spent invitation alone would do nothing at all, which is worse than no
  button, and it is the DM's only remedy for a link that reached the wrong person.
- **Forwarded is granted.** Whoever holds the token and signs in gets the membership; there is no
  second factor and pretending otherwise would make a capability feel safer than it is. What
  contains it is the other three rules plus `redeemed_by`: the DM's list names _who_ took each
  invitation, so the wrong person is visible and one press undoes them.

Five more things that are decisions rather than details:

- **Denial is one `NotFound`, everywhere.** Unknown, expired, withdrawn, spent by somebody else:
  the same answer, because telling the holder of a dead token which kind of dead it is discloses
  that it was ever alive. The preview previews **live invitations only** for the same reason.
- **`campaign_invite` has no `role` column**, and that is the co-DM decision applied to a schema:
  a column with one legal value is the role dropdown the decision forbids, one migration early.
  It also has no visibility/origin/`assistant_turn_id` tail — it is not campaign content, and
  the sharper consequence is that **Hob can never mint an invitation**, because provenance is the
  only way a row here can be the assistant's and there is nowhere to record one. Naming it in
  `schema.test.ts`'s `NOT_CONTENT` is the deliberate edit that list exists to demand.
- **`preview` is the only endpoint outside `health` with no `Authorization`, and the token is
  what scopes it.** It answers before its reader has an account, which is the entire point:
  §6.3's "make the invite page work before sign-in". It and `redeem` read two scalar columns of
  _the campaign the invitation names_ — never one a caller named — which is the one read of
  campaign content in `src` outside the visibility seam besides `bestiary/import.ts`, and it is
  confined to `repo/Invites.ts` for the same reason. `packages/api/src/Api.test.ts` fails if a
  third unauthenticated endpoint appears.
- **`redeem` takes a token and nothing else** — no account id (it is `CurrentActor`'s, so a
  caller cannot invite somebody else in) and no campaign id (it is the invitation's, so a caller
  cannot redeem a token _at_ a table of their choosing). Neither is an omission a handler makes;
  there is nowhere in the declaration to put one.
- **The ordinary outcome of joining is a campaign with nothing in it.** `campaignReadable` still
  requires `campaign.visibility = 'shared'` for a player member, so a DM who has not shared the
  table has a player who reads nothing — the master toggle working, not a gap. That is why
  `InviteRedeemed` carries `shared` and why the join page says so at the moment of joining;
  `GET /me/campaigns` composes the same predicate and is honestly empty until then.

`GET /me/campaigns` is the membership list — the same predicate `campaigns.list` composes, plus
the role, which is a fact about the pair and has nowhere on the campaign row to live. It is what
a player screen will branch on, and it is the read whose empty answer covers the two states an
account can now legitimately be in: invited nowhere, or invited to a table nobody has shared.

**`DEFAULT_ACCOUNT_NAME` is `"Someone"`, not `"DM"`.** Just-in-time provisioning runs on the
first authenticated request from anyone, which since the invite landed is as often a player
following a link as it is a DM starting a table; a default that asserts a role would be wrong for most accounts and rendered as a lie on the
one screen that shows a name — the invitation page, which says who is asking.

## The prep surface: what the fixtures forced

`packages/design-system/ui_kits/dm-screen/data.js` and `CampaignHome.jsx` are the specification —
the API exists to feed them. Five modelling decisions came out of reading them closely rather than
out of convention, and step 3 (bestiary) and step 4 (live session) should not re-derive them.

- **`encounter.difficulty` is the DMG encounter band, not a creature's CR.** The fixture names the
  field `cr` (`data.js:10-12`) and then fills it with `Easy` / `Medium` / `Deadly` and branches on
  those strings (`CampaignHome.jsx:13`). It is named for what it holds. **Capitalised**, unlike
  `visibility` or `kind`: this vocabulary is the DM's and is rendered verbatim on the card's badge,
  so lower-casing it would mean a display map existing only to undo the change. Nullable — a
  sketched encounter has not been rated yet.
- **Two fields on the encounter card are deliberately not columns**, and neither is an oversight.
  `count` ("6 creatures") is `sum(encounter_creature.count)` and arrives with the bestiary; a
  field that is structurally always `0` is worse than an absent one. `active` ("On the table now")
  is a pointer on the session — the live `encounter_run` — because exactly one encounter is live,
  and a boolean per encounter would let two rows both claim the table.
- **One `note` table with a `kind` and an optional attachment**, not a `read_aloud` column on
  three tables each with its own visibility rule to get wrong. The attachment is a **real foreign
  key** (`note.encounter_id`), not a polymorphic `(kind, id)` pair — a polymorphic column cannot
  be a foreign key, so there would be no integrity and no cleanup. On the wire it is
  `attachedTo: { kind: "encounter", id } | null`; adding `creature` in step 3 is a new member of a
  shape the client already branches on, not a second nullable id beside the first.
- **`note_encounter_fkey` is composite — `(encounter_id, campaign_id) → encounter (id,
campaign_id)` — and that is the point.** A plain `references encounter (id)` would let a note in
  campaign A attach to an encounter in campaign B: both belong to the same DM, so nothing rejects
  it, and the note then reads as part of a campaign it is not in. Postgres matches a composite key
  only when every column is non-null, so an unattached note is simply unconstrained — no partial
  index, no trigger. The `on delete set null (encounter_id)` column list is **Postgres 15+ and
  load-bearing**: a bare `set null` would null `campaign_id` too and hit its not-null. Detach
  rather than cascade, because the DM wrote that read-aloud — deleting an encounter should lose
  the encounter, not the prose.
- **`tags` is `text[]`, not a join table.** The vocabulary is genuinely open ("Marsh", "Night",
  "Boss") and the encounter grid is the first thing `CampaignHome` renders. A bare JS array
  interpolated into a `sql` template becomes **one bind parameter**, which `pg` serialises to a
  Postgres array literal — `sql.in(...)` is the thing that expands an array into an `(?, ?, ?)`
  list, so do not reach for it here.

Two report recommendations were **not** followed, both because the fixtures do not support them:
`encounter.notes` (a free-text column) is absent, since it would duplicate the attached-note
mechanism above; and `prep_item` carries no `campaign_id`, for the reason in the visibility
section.

## The bestiary: provenance, and the one table that is not campaign-scoped

`creature` is the first table whose rows can belong to _no_ campaign, and that one difference
is where every non-obvious decision in this area comes from. `encounter_creature` is the
roster that makes the prep surface's "6 creatures" true.

**A creature has a row form and a document form, and neither derives from the other.** The
fixtures hold both for the same creature — `data.js:23-33` is `ac: "17 (chain shirt, shield)"`,
`hp: "21 (6d6)"`, `cr: "1 (200 XP)"`, prose traits; `data.js:36` is `ac: 17, hp: 21, cr: "1"`.
Filterable values are columns (what `Bestiary.jsx:11-12` searches); the display half is one
`jsonb` document (`body`, on the wire `statBlock`) that nothing queries into except full text.
Normalising the document loses the parenthetical the DM reads, and nothing reconstructs it.
**CR is a string** — `"1/4"` (`data.js:38`) — with `cr_sort` beside it for ordering, derived
from `cr` on write so the two cannot disagree, overridable for a rating the parser does not
know. `cr_sort` is `double precision`, not the report's `numeric`: **`pg` hands `numeric` back
as a string** to protect precision this does not need, and every rating is an integer or one
of 1/8, 1/4, 1/2 — all exact in binary.

**`origin = 'system'` and `campaign_id is null` are the same statement** (`creature_system_is_global`).
That is what makes the shared corpus immutable _structurally_ rather than by a rule someone has
to remember: reads use `corpusRowReadable`, writes use the ordinary `rowWritable`, which
requires `campaign_id` to equal the campaign in the request path — and a null never equals a
uuid. **There is no `origin = 'system'` check anywhere in `apps/server/src`, and none is
needed.** Do not add one; add a test if you doubt it.

**`corpusRowReadable` is the leak-shaped one, so read its two rules before writing anything
like it.** (a) The campaign gate is _outside_ the union: a global row is reachable through a
campaign this actor can read and through nothing else. Written the natural way —
`campaign_id is null OR <the campaign-scoped test>` — a global row would come back for any
authenticated request naming any campaign id, including somebody else's, because `findById` is
reached by path and a path is a claim. (b) The row's own `visibility` still applies, so
"global" means shared between a DM's campaigns, not shared with their players — a stat block
is precisely what the product says a player must not have. `apps/server/test/bestiary.test.ts`
pins both, and pins that a `system` creature named through a stranger's campaign is a 404.

**Editing a system creature means deriving a copy** — `POST …/creatures/:id/derive`, which
copies a readable creature into the campaign, applies the patch in the same request, and sets
`derived_from`. The copy is `authored` whatever the original was (the DM wrote the changes),
and its **visibility is not copied**: it falls to the column default, because a new row fails
closed and inheriting `shared` would make that depend on what you happened to derive from.
Nothing is ever _read through_ `derived_from`, so it is a provenance pointer and not an access
path; it survives its ancestor's deletion as `null`.

**The shared corpus is provisioned by `pnpm -F server bestiary:import`, not by an endpoint.**
Global content has no campaign to scope it to, so there is no actor an endpoint could check it
against — an endpoint that could mint one would write rows every campaign can read.
`src/bestiary/import.ts` is therefore **the only code in `src/` that touches campaign content
without `CurrentActor` in its requirements**, and that exception is why it is confined to one
file and a bin script. It upserts on `creature_system_name_key` (partial unique index over
`lower(name)` where `campaign_id is null`), so re-running it updates in place and a DM's
reskins keep their ancestor. It never writes `visibility`, so a shared system creature is not
un-shared by an upgrade.

**`encounter_creature` hangs off `encounter` with no `campaign_id`,** like `prep_item` under
`session` and for the same reason. Two things about it are specific:

- **`creature_id` cannot be a composite foreign key.** The `(id, campaign_id)` trick that makes
  a cross-campaign `note.encounter_id` unrepresentable does not apply, because half the rows
  this may legally point at are global and have no campaign to name in such a key. The
  containment is enforced in `EncounterCreatures` against `corpusRowReadable` — the same
  predicate a creature read uses, so it is one rule applied twice rather than a second rule
  that could disagree.
- **The foreign key is `deferrable initially deferred`, and that was measured.** Deleting a
  creature that is on a roster must be refused (a 409 — losing it would silently change what an
  encounter contains), but the check also has to survive `delete from campaign`, which cascades
  into `creature` and into `encounter_creature` in one statement. `restrict` fires immediately
  and an _immediate_ `no action` fires before the roster rows are gone; both reject a campaign
  delete that should be fine. Deferring moves the check to the end of the transaction — which,
  under autocommit, is still the end of that one statement, so a lone `delete from creature` is
  still refused on the spot.

**`Encounter.creatureCount` is computed, not stored** — `sum(encounter_creature.count)` in a
correlated subquery, per read. A stored total is a second answer to a question the roster
already answers, and they part company the first time a roster row goes by a cascade. It counts
what _this actor_ can see, so the card and the list behind it always agree; that needs
`nestedRowReadableWithin`, which **deliberately omits the parent check** because the enclosing
query already selected the parent through `rowReadable`. It belongs in a subquery over the
parent table and nowhere else.

**Search is lexical, and two matchers rather than one.** `ILIKE` on the name reproduces the
prototype's `name.includes(q)` so "gob" works mid-type; a generated `tsvector` column over the
name, the size/type line and `jsonb_to_tsvector(body)` finds "nimble escape" by a trait that is
in no column. Use **`websearch_to_tsquery`**, never `to_tsquery` — the latter raises a syntax
error on a stray `&` and turns a search box into a 500 — and escape `%`/`_`/`\` before the
`ILIKE`. No embeddings: the corpus is hundreds of rows per campaign and DMs search for words
they wrote.

**Deliberately deferred: a read-aloud attached to a creature.** `data.js:33` hangs one off the
stat block, and it is _not_ in the document — read-aloud is a `note` with an attachment (see
`Note.NoteAttachment`), and putting it in `body` would be the `read_aloud` column on a third
table that the note model exists to avoid. The reason it is not built yet is worth knowing
before someone tries: `note.encounter_id` is guarded by a **composite** key naming the
campaign, and a `note.creature_id` cannot be, because the creature may be global. It needs the
repository-side check `encounter_creature` uses, and it changes `NoteAttachment` into a union.

Four report recommendations were adjusted, all on fixture evidence: the group is
`/campaigns/:campaignId/creatures` rather than a top-level `/creatures`, because the same
report settles that authored and imported creatures are campaign-scoped, and the path is also
the only thing gating the global rows; the column is `cr`, as the fixtures name it, not
`cr_display`; `environments` keeps the report's full word over the fixture's `env` shorthand,
matching the UI's own "Environment" label; and abilities are `{label, score, modifier}` structs
rather than the fixture's `["STR","10","+0"]` tuples, which are prototype shorthand and not a
contract. `type` and `size` are **open** strings while `difficulty` is a closed union — the
difference is that `CampaignHome.jsx:13` _branches_ on difficulty, and nothing branches on a
creature's type.

## The party: what earns a column on `character`, and what lives in the document

`0012_character_sheet.ts` made `character` the same shape as `creature`, and the rule it
applied is the one the bestiary already follows and the one every later step should:

> **A field earns a column when something in the product _reads_ it** — a screen filters or
> sorts on it, the seed copies it, a predicate uses it, search indexes it. Everything else the
> DM or the player wants to keep is display, and display lives in one `jsonb` document.

Taverns holding a character does not make it a character builder — that is a different product
and the first thing it owes anyone is errata. So:

- **Columns**: `name`, `player_name`, `level`, `species`, `class_name`, `ac`, `hp_max`,
  `sheet_url`, `account_id`, plus the usual visibility/provenance tail.
- **Document**: `body` (on the wire `sheet`) — `notes`, `abilities`, `traits`, plus the thirteen
  optional keys the drawn sheet added without a migration (see "What the character sheet reads,
  and where each part of it lives"). `Ability` and `Trait` are imported from `Creature.ts` rather
  than restated: an ability cell and a named block of prose are one question whether the row is a
  monster or a person, and `bestiary/StatBlock.tsx` already draws them — which is why the sheet
  extended those two rather than minting a `CharacterAbility` and an `Attack`.

**`level`, `species` and `class_name` are columns by the captain's decision, against the
report's own recommendation**, and the reason is that players edit their own characters and
levelling is what they will do — an increment as a number, four people editing prose and hoping
they agree as part of a string. It also makes the party sortable and gives Hob something to
reason about.

**Therefore `descriptor` is derived, and it is a Postgres generated column** —
`"Level 3 Half-orc Paladin"`, `nullif`/`btrim`/`coalesce` over the three. Four things follow,
and the first is the one to know before touching it:

- **Nothing stores a second copy and nothing can**: Postgres refuses an `INSERT` or `UPDATE`
  naming it, so this is a property of the schema rather than a rule to remember. Neither
  `CharacterCreate` nor `CharacterUpdate` has the field, and `CharacterDialog.tsx` deliberately
  does **not** compute a local preview of the line — that would be the second implementation
  the decision exists to prevent.
- `concat_ws` reads better and cannot be used: it is `stable`, not `immutable`, so a generation
  expression refuses it. And **a generated column may not reference another**, which is why
  `search` composes the three columns again rather than reusing `descriptor`.
- **Every reader kept working unchanged**, which is half of why it is done in SQL:
  `repo/EncounterRuns.ts` still seeds `combatant.subtitle` from `character.descriptor`, and
  `PartyList` still renders one column.
- The upgrade **does not parse the descriptors already there**. Splitting `"Half-orc paladin"`
  into a species and a class is guessing, and a guess written into a column the DM trusts is
  worse than an absence — so the old text is kept verbatim as the sheet's `notes` and the
  derived line is null until somebody fills the two boxes. `migrations.test.ts` pins that,
  column by column.

**`character` is the search index's fourth arm** (`repo/Search.ts`), `rowReadable` like `note`,
with the `creature` weighting exactly — name A, `player_name`/`species`/`class_name` B,
`jsonb_to_tsvector(body)` C — so `ts_rank` stays comparable across one union. `player_name` is
also an `ILIKE` matcher, because "who is Dara running" is asked mid-type. The snippet is
`ts_headline` over `body ->> 'notes'` falling back to the derived descriptor, the same
substitution the creature arm makes to its meta line.

#### `account_id` means something now: what ownership grants, and what it does not

It was a column named by no predicate. It is **the one pointer in the product that is read
through** — the character sheet and the player write both build on exactly this and nothing
wider, so the boundary is worth reading before extending it.

**A DM assigns; nobody else does.** `POST …/characters/:id/assign` with `{ accountId }`
(`Characters.assign`), and `null` unassigns. It is **its own endpoint and not a field on
`CharacterUpdate`**, which is the whole shape of it: the PATCH is where a player will one day edit
their own sheet, and the owner of a row is precisely the field that must not travel on a payload a
player can send. Kept apart, "a player cannot re-point their own character" is a fact about which
endpoints exist rather than a field check somebody has to remember. The named account must hold a
**live membership of this campaign** (`memberOfCampaign`, the only other caller of the fragment
`isMember` composes), so a DM can name the people at their table and nobody else. Two statements
in one transaction, in this order and for this reason: the write predicate first, so a non-DM is
refused with the ordinary `NotFound` naming the _character_ and learns nothing about the account
they named; the membership second, naming the **member**, because only somebody who may already
write the row reaches it and "they have not accepted their invitation yet" is the answer that
makes the endpoint useful.

**The read it grants is one disjunct, and its position is the whole argument.**
`ownedRowReadable` (`repo/visibility.ts`) is `rowReadable` with `account_id = <this actor>` added
**inside the same `or` the row's own `visibility` is tested in** — after
`withinReadableCampaign`, which both share so neither can restate it slightly differently. So
ownership relaxes the row-level toggle and nothing above it:

- **your own row and no one else's** — the column is compared to the actor's own account and to
  nothing a caller supplied, so no request shape asks for somebody else's character this way;
- **still a live member** — a revoked membership takes it back, measured through `Invites.revoke`;
- **still in credential scope** — a token minted for one table reaches nothing at another;
- **still under the master toggle** — `campaign.visibility = 'dm'` keeps a player out of their own
  character, which is the same answer `GET /me/campaigns` gives and is not a gap;
- **no write at all** — every write in `Characters` is `rowWritable`, untouched. Editing your own
  sheet is a settled decision with a predicate still to write, and `ownedRowWritable` deliberately
  does not exist.

Written the other way round — `rowReadable(…) or account_id = me` — a character would be readable
by its owner in a campaign they had been revoked from, through a credential minted for another
table, in a campaign the DM never shared. That is the `corpusRowReadable` lesson met a second
time: **the union is over the innermost test only.**

**Both readers of `character` compose it** — `Characters.list`/`findById` and `Search.ts`'s
character arm — because one table gets one read predicate or search becomes a second answer to
what an actor may have.

**What this fixed, measured either side.** A player who joined a shared campaign saw an empty
party and a 404 on their own character: `CharacterDialog` defaults a new row to `dm`
(fail-closed, correct) and owning a row granted nothing (also correct). Both halves were right and
the pair was the defect. The dialog's default **stays `dm`** — it now means _the rest of the table
cannot see it_, which is what it should always have meant. `character-ownership.test.ts` pins all
of the above and fails four ways if the disjunct is removed; `Characters.assign` is ungated by
`DmActor` on purpose (`dm-actor.test.ts` counts it), because `rowWritable` already requires `isDm`
and assignment has no player projection to diverge.

### Where a hit point lives, and what the doorbell covers

`0014_character_live.ts` made `character` a **live** table — `hp_current`, `temp_hp`,
`conditions` — so the live-versus-durable reasoning that governs `encounter_run` and
`combatant` governs the party now and did not before. The rule, settled and not to be
re-litigated:

> **A hit point belongs to the character. The combatant holds the fight's copy. One
> transaction writes both.**

- **`apps/server/src/repo/vitals.ts` is the only place either copy moves**, and every function
  in it runs inside the caller's `sql.withTransaction`. `Combatants.damage`/`update` write the
  character through; `Characters.damage` — the delta endpoint, `POST …/characters/:id/damage`
  — routes _through_ the live combatant when there is one, so there is **one clamp** and the
  two entry points cannot answer one hit differently.
- **A write-through that touches no row is a defect and dies.** That is what makes the
  invariant provable rather than hoped for: `character-live.test.ts` produces the impossible
  state with raw SQL and asserts that the fight's own update rolls back with it, leaving
  _neither_ row moved. Nothing else in the product can reach that state — `combatant.character_id`
  is written only by the seed, from characters read in the same campaign.
- **`hp_current` is null until somebody says**, which is neither zero nor full; every reader
  substitutes `hp_max`. `0014` deliberately does **not** backfill: `hp_current = hp_max` is a
  claim that the party walked in unhurt, and it is the same refusal `0012` made about parsing
  old descriptors. Starting a fight seeds `combatant.hp_current` from the character's _current_
  number, which is what stops a fight silently healing everyone at the top of it.
- **`hpCurrent` is on no update payload**, only on `CharacterCreate` (a row that does not exist
  is in no fight) and on the delta. One spelling of the write is what keeps the invariant to two
  statements instead of every caller. `temp_hp` has no copy on `combatant` at all, by design —
  a column the initiative row does not draw would be a second answer with no reader.
- **The doorbell is keyed on the session, and that is the decision.** A character write while
  `campaign.current_session_id` names a night appends `character-updated` and rings; a level-up
  typed between games appends nothing and rings nothing, and an open page stays stale until it
  refetches. There is no campaign-keyed fan-out and adding one is a real decision, not a fix.
- **One write, one line in the log.** `character-updated` is appended only by the character-side
  writes; `Combatants.damage` writes the character through and appends nothing extra, because it
  has already recorded the same change naming the same combatant. It carries the run id as well
  as the combatant id when the write reached a fight from outside — without it the event is
  invisible to `pollForRun`, which filters the live stream on the run.
- **The known way the two copies can part company** is a character in _two_ live fights, which
  the per-session unique index permits (a carried fight plus a fresh one). `liveCombatantOf`
  takes the most recently seeded and the other keeps its number. Rare, not corrupting, and
  written down here rather than locked against.
- `session_event_session_request_id_key` (`0014`) is the run-keyed idempotency index for the
  half of the space it excludes, so an out-of-combat delta's `requestId` has a backstop too.
  With no session open there is nothing to record a repeat against, and `CharacterDamage` says so.
- **`Characters` is not behind the `DmActor` gate**, and `dm-actor.test.ts` says why: a
  character is the row a player is _most_ entitled to see in full. What the live columns change
  is that a `shared` character now carries exact current hit points, so step 8's player
  projection has a real decision to make about somebody _else's_ character.

### Membership is the model, and there is no seat

**Settled, by the captain on 2026-08-12: seats are not a first-class thing.** The fourth
delivery's `Party.jsx` draws a chair per person with four statuses, an _"Add seat"_ button and
an _"N of M seats"_ subtitle. Three of the statuses are questions about rows that already
exist; the fourth is not representable, because **a `campaign_member` row cannot exist before
an account** — `account_id` is `not null` and a real foreign key. So there is no seat table,
there is no migration to add one, and the party screen must not reintroduce one. A seat row
would be a fourth answer that can disagree with membership, invitations _and_ characters at
once, and nothing would notice which was wrong.

What the drawn vocabulary becomes, and the read each half comes from — all three shipped, none
of them new:

| drawn          | derived from                                                                               |
| -------------- | ------------------------------------------------------------------------------------------ |
| `playing`      | a `CampaignMember` with `role: "player"` **and** a `Character` whose `accountId` is theirs |
| `no-character` | the same member with no such `Character`                                                   |
| `invited`      | a `CampaignInvite` whose `status` is `live`, from `invites.list` — not a member yet        |
| `open`         | nothing. It comes out of the drawing.                                                      |

The subtitle becomes what is true — _"2 players, 1 invitation outstanding"_ — from the same
three reads, and _"Invite a player"_ is the only affordance. Measured end to end against a
running server: the derivation above produced exactly that from three ordinary `GET`s.

**`GET /campaigns/:c/members` is the roster, and it is behind the `DmActor` gate** —
`Memberships` is the **fifth gated repository** and the second gated only in part. `list` takes
the proof, `mine` (`GET /me/campaigns`) does not, and the split is the standing rule rather
than a judgement:

- **The player projection of a member list is _nothing_.** It is other people's account names,
  who was invited and when somebody joined; a player at the table does not enumerate it. So
  unlike `Recap` there is no narrow method beside the gated one, and the gate is the whole
  answer. It went on **in the change that declared the endpoint**, which is "gate first,
  project later" applied on the day rather than after a disclosure.
- **`mine` needs no gate for the mirror-image reason**: the campaigns a credential already
  reaches are not a disclosure to the credential that reaches them.
- The read still composes `campaignWritableById` in its own `where`, under the proof — the gate
  is a precondition on the seam, not a substitute for it.

Three more things that are decisions:

- **`accountId` is on the wire because it is the join key**, and a character count is
  deliberately _not_ on it. `Character.accountId` already answers "has this member got one"
  from a list the party screen reads anyway; a count here would be a second answer, and one
  that is structurally `0` for every row until something populates that column. Absent beats
  stubbed — the rule the encounter card's `count` follows.
- **Live members only; a revoked membership is absent rather than flagged.** What a DM needs to
  know about a withdrawal is on the invitation that granted it (`CampaignInvite.status` reads
  `revoked` and names who took it), and revoking an accepted invitation drops the person from
  this list in the same transaction — verified against a real server.
- **Read-only, and that is structural.** A membership is written by exactly two statements and
  revoked by one, all of them acts on something else; a `POST` or `DELETE` here would be a
  third way to grant reach, which is what `repo/Memberships.ts` exists to prevent.

`apps/server/test/members.test.ts` pins the gate (a player of this campaign, a DM of another
table, a credential scoped elsewhere, and the campaign's own DM), the row's four fields, and
the derivation table above — including that no table in the schema is named for a seat.

### What the character sheet reads, and where each part of it lives

`ui_kits/dm-screen/CharacterSheet.jsx` (with `PlayerParts.jsx` and `player-data.js`) draws about
thirty fields against nine columns, and **not one of them earned a tenth. `0012` and `0014` are
still the last migrations `character` needed.** The whole of it is optional keys on the existing
`jsonb` document, so there is no backfill, `emptyCharacterSheet` still decodes, and a row written
before any of it reads exactly as it did. If a future sheet change seems to need a column, that
is a finding to report rather than a routine step.

Where a drawn field comes from — read this before building the screen, so nothing is looked for
twice:

| what the sheet draws                                                                           | where it comes from                                                              |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| name, player, AC, hp / hpMax / temp, conditions                                                | **columns** on `character`, live since `0014`                                    |
| `"Level 5 Half-orc Paladin"`                                                                   | `descriptor`, the generated column — not writable, and not restated anywhere     |
| `"Oath of the Open Road"`, background, alignment, speed, initiative, proficiency, hit dice, XP | `sheet.identity`                                                                 |
| abilities, with saving throws                                                                  | `sheet.abilities` — the bestiary's `Ability`, which grew `save` and `proficient` |
| skills, proficiencies & languages                                                              | `sheet.skills`, `sheet.proficiencies`                                            |
| attacks (Actions tab)                                                                          | `sheet.attacks` — `Trait`s, which grew `hit` and `note`                          |
| features & traits (Stats tab)                                                                  | `sheet.traits` — the same `Trait`, the key that was already there                |
| spellcasting, slots and known spells                                                           | `sheet.spellcasting`                                                             |
| inventory and coin                                                                             | `sheet.inventory`, `sheet.currency`                                              |
| backstory                                                                                      | `sheet.notes` — where `0012` put it; there is no second `backstory` key          |
| bond / ideal / flaw / personality                                                              | `sheet.story`                                                                    |
| death saves                                                                                    | `sheet.deathSaves`                                                               |
| level-ups, journal                                                                             | `sheet.levelUps`, `sheet.journal`                                                |

Four things about it that are decisions rather than details:

- **`Ability` and `Trait` are the bestiary's, extended, not a second pair.** A stat block's
  ability cell and a character sheet's are one question, and `bestiary/StatBlock.tsx` already
  draws both — so `save`/`proficient` went on `Ability` and `hit`/`note` on `Trait` rather than
  into a `CharacterAbility` and an `Attack`. Every addition is an optional key, so no creature
  renders differently.
- **The two genuinely _live_ values in the document are there by decision.** Death saves claim a
  DM-side reader (`CharacterSheet.jsx:126`) that **does not exist** — no delivery of
  `EncounterRunner.jsx` draws one — and spell slots have no second holder at all. A column whose
  only reader is the row that owns it is what the rule excludes. When a delivery draws death
  saves on the initiative row they become two `smallint`s and a `vitals.ts` write-through, which
  is the shape `0014` already established.
- **Whole-document writes race, and that is accepted rather than hidden.** `CharacterUpdate.sheet`
  is the entire document, so "I spent a first-level slot" is a read-modify-write that can lose a
  DM's concurrent condition edit. The fix is a patch grain or an `updatedAt` precondition, and it
  is not needed until two people edit one sheet at once.
- **Growing the document grew what campaign search indexes, silently and by design.** `0012` puts
  `jsonb_to_tsvector(body)` at weight C in `character.search`, so a player's backstory and journal
  are findable in their DM's campaign search the moment they are typed. Mostly the point; also
  means a player's journal is not private from their DM.

**What the drawing asks for that the data cannot supply** — report these, do not invent them:

- **A character with no campaign.** `MyCharacters.jsx` draws _"Not in a campaign yet"_ and a
  _Join a game_ button. `character.campaign_id` is `not null` and a campaign-less character would
  need a reach rule beside membership — the one thing the whole model contains. Bringing a
  character to a second table is a **copy**, shaped like `creatures/:id/derive`; it is not built.
- **The campaign's _name_ on a character.** `GET /me/characters` answers `Character`, whose
  `campaignId` is the join key; the name comes from `GET /me/campaigns`, which the player shell
  reads anyway. A name here would be a second answer to what a campaign is called.
- **Every affordance that writes.** Rolling dice "to your DM's dice tray", spending a slot,
  marking a death save, uploading a portrait, adding gear, editing the backstory: **a player
  cannot write anything.** `ownedRowWritable` deliberately does not exist and the player write
  path is its own step with its own decision. `hpCurrent` is not on any update payload in any
  case — it moves by delta, through `POST …/characters/:id/damage`, which is DM-only.
- **The live banner** (_"The Salt Road is playing right now · session 12 · round 3 · Brannoc is up
  next"_) has no read behind it. It is three campaign-scoped reads a player is partly refused, and
  the player projection of a fight is the step-8 decision.
- **Subclass is in `sheet.identity` and not in `descriptor`.** A fifth column on the generated
  expression would be a migration for a string only the header draws.

#### `GET /me/characters`: the one read on `character` that names no campaign

Every character this account plays, across every table it is at — `Characters.mine`,
`repo/Characters.ts`. Three things about it:

- **It is a _narrowing_, not a reach.** `repo/visibility.ts`'s `ownRowReadable` is
  `ownedRowReadable` **conjoined** with ownership, so it cannot be wider than the predicate
  `characters.list` already composes, however that predicate changes. That shape is the whole
  argument: `readable OR mine` would have answered a DM their whole table and looked right doing
  it. Nothing in `Characters.ts` compares `account_id` — the seam is the one place that is
  written.
- **It needs no campaign in the path, and `rowCampaign(sql, "character")` is how.** The campaign
  ref is the row's own `campaign_id` rather than a correlated outer `campaign.id`, so the
  predicate composes with **no join to `campaign`** and no inner alias shadowing an outer one. It
  satisfies `CampaignRef`'s rule trivially and therefore exactly.
- **It cannot fail.** An account that is a member of nothing gets `[]`, like `GET /me/campaigns`
  and for the same reason: there is no campaign in the path for a `NotFound` to be about.

Measured against a real server, one account with characters at two tables and none at a third:
both come back with their `campaignId`; a revoked membership takes one away while the row still
exists and still names the account; unsharing a campaign takes the other away though the DM
assigned it; a credential scoped to one table sees only that table's; and an unassigned character
is nobody's, including the DM's. `apps/server/test/my-characters.test.ts` pins all of it.

## `HttpApi`, and the client derived from it

`packages/api` holds the whole wire contract: schemas, errors, the `Authorization` middleware
declaration, and `TavernsApi`. The server implements it and `apps/web` derives its client from
it (`apps/web/src/api/client.ts`), so there is no codegen step and no second description of the
wire format to drift.

It is the one workspace package that builds to `dist/` rather than exporting source: `apps/server`
is executed by plain `node`, which cannot load `.ts` from `node_modules`.

Five things that cost time to find:

- **`HttpApiSecurity.bearer` answers no 401 of its own.** A missing or malformed `Authorization`
  header does not short-circuit: `securityDecode` hands the middleware `Redacted.make("")` and
  runs it anyway (`.repos/effect/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts`, the
  `case "Http"` branch). Today's 401 for an absent header comes from our own zero-length check
  in `Accounts.actorForToken`, not the framework. Any middleware added to a secured group must
  reject the empty credential explicitly — there is no guarantee to inherit, and the tests pass
  either way, so nothing catches the omission.
- **Middleware and handler requirements are provided outside `HttpRouter.serve`.** Handler
  requirements travel as `Request<"Requires", _>` markers that only `serve` unwraps; providing
  them to the route layer typechecks and then fails at the call site. See `apps/server/src/app.ts`.
- **`HttpApiEndpoint.delete`, not `.del`** — `del` is the internal name, exported as `delete`.
- **The derived client takes `params`, not `path`**, for path parameters.
- **`HttpClient` attaches `b3` and `traceparent` to every request.** That makes even a plain
  cross-origin `GET /health` preflighted, so the CORS `allowedHeaders` must list them. Leave
  them out and the browser blocks the call after a successful 204 preflight, with nothing in
  the server log but the `OPTIONS` — the request that mattered was never sent.

**`Context.Reference` memoises its default value on first read** (`Context.ts`,
`~effect/Context/defaultValue`). `FetchHttpClient.Fetch` defaults to `() => globalThis.fetch`,
so whichever `fetch` is installed when the first request runs is the one every later request
uses. A per-test `vi.stubGlobal("fetch", …)` therefore keeps serving the _first_ test's
responses, with no error to notice — install one stable dispatcher per file instead
(`apps/web/src/api/client.test.ts`).

**The same trap applies to configuration, and it is easier to walk into.**
`ConfigProvider.ConfigProvider` is a `Context.Reference` defaulting to `fromEnv()`, and
`fromEnv` _copies_ `process.env` into a trie when it is constructed (`ConfigProvider.ts`). So
the first config read in a process freezes the environment for the whole run. **Writing to
`process.env` in a test to exercise a config branch does nothing, silently** — the assertion
just fails, or worse, passes for the wrong reason. Provide a provider explicitly instead:
`Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env }))`,
placed _outermost_ so it also covers layer construction. See the environment tests in
`apps/server/test/identity-disabled.test.ts`.

## Authentication: two credential kinds, one seam

A bearer token is either a **machine token** (`token:issue`, SHA-256 → `account.token_hash`)
or a **session token from a hosted identity provider** (currently Clerk). They converge on one
`Actor` in `Authorization.ts`, and nothing below that line knows there is more than one kind —
no handler, repository or SQL predicate changed to add the second.

**The classification is total, not a heuristic.** A JWS compact serialization is exactly three
dot-separated segments; a machine token is `randomBytes(32).toString("base64url")` and the
base64url alphabet contains no dot. So `credential.split(".").length === 3` cannot misfile
one. Effect v4 _would_ let you declare two `HttpApiSecurity.bearer` schemes and tries them in
order, but that emits two identical schemes into the OpenAPI document and reports the **last**
scheme's error for every failure. One scheme, one chain.

**The vendor is confined to `ClerkIdentityProvider.ts` and the interface names no vendor.**
`IdentityProvider` verifies a credential and returns a local `VerifiedIdentity`
(`{ subject, name }`); provisioning belongs to `Accounts`, authorization to `Authorization`.
`apps/server/test/seam.test.ts` fails if a `@clerk/*` import appears anywhere else, and the
`disabled` layer plus the offline test double are two working non-vendor implementations of
the same interface. **This is not only taste: a vendor type reached by an exported signature
does not compile here.** `@clerk/shared` is a transitive dependency under pnpm's isolated
layout, so its types are not nameable from `apps/server` and TS2742 rejects the inferred
signature. Map claims to a local shape at the edge — it is the only shape that builds.

**`CLERK_JWT_KEY` is optional by design and must stay that way.** Unset means no hosted
sign-in: `pnpm -F server dev` runs, the whole suite passes, and a JWT-shaped credential is
simply unknown. That is what `IdentityProvider.disabled` is for, and
`apps/server/test/identity-disabled.test.ts` is what stops it rotting. The key is a **public**
key, not a secret. **`CLERK_SECRET_KEY` is deliberately absent from this server** — tokens are
verified offline with `verifyToken`, so the whole environment leaking still cannot mint a
session. Do not add it for convenience; use `verifyToken`, not `authenticateRequest`, which
needs a publishable key, throws without one, and models a cookie handshake this API never has.

Four things about the SDK that cost real time:

- **`@clerk/react`, not `@clerk/clerk-react`; `@clerk/shared/types`, not `@clerk/types`.** The
  old names install cleanly and are deprecated — same shape as the `@base-ui-components/react`
  rename above. `@clerk/clerk-sdk-node` is end-of-life.
- **The PEM→JWK conversion is cached by `kid`, module-level, and never expires**
  (`loadClerkJwkFromPem`). On a hit the PEM you passed is _ignored_, and a token with no `kid`
  caches under `local-undefined`. A test that swaps keys under one `kid` verifies against the
  first key forever, green. Hence one `kid` per keypair in `test/support/identity.ts`.
- **The conversion is string surgery on a 2048-bit RSA SPKI PEM** — it strips that key's fixed
  prefix and treats the rest as the modulus. Any other key silently yields a wrong JWK and
  every token then fails as "invalid signature", which reads exactly like an attack. The layer
  validates the key at boot for this reason; keep that.
- **Passing `authorizedParties` makes `azp` mandatory** (`assertAuthorizedPartiesClaim` rejects
  a missing `azp` whenever the list is non-empty). It is fed from `ALLOWED_ORIGINS`, the same
  list CORS uses, so the browser allowlist and the token audience cannot drift apart.

**Provisioning is just-in-time, and there is no deletion path.** An unrecognised subject gets
an account on its first authenticated request (`insert … on conflict do nothing` plus a
re-read, which settles two tabs racing). Existing machine accounts are never linked — a Clerk
sign-in creates a fresh account. And nothing may wire an external event to `delete from
account`: `campaign.account_id` is `on delete cascade`, so that would let a replayed webhook
destroy a DM's entire history. Deletion, if ever wanted, is a deliberate product endpoint
behind `Authorization`. These are written captain's decisions, not defaults.

## Env files: two apps, two entirely different loaders

**`.env.local` is a Vite convention, and `apps/server` is not a Vite app.** `apps/web` gets
its file for free; the server got nothing at all until it was given Node's own flag. A key
put in `apps/server/.env.local` was therefore read by no one, with no error — which is how
this got found. Never write an unqualified "`.env.local`" in a doc here; name the package.

- **The server loads its file through Node: `--env-file-if-exists=.env.local`**, in
  `apps/server/package.json`'s `dev`, `start`, `migrate` and `token:issue` scripts. No
  `dotenv` dependency and no loader in `src/` — do not add one. `tsx` passes the flag
  through to Node, but **only after the subcommand**: `tsx watch --env-file-if-exists=… src/main.ts`
  works and `tsx --env-file-if-exists=… watch …` makes Node try to import a file called
  `watch`. The path is relative to the package directory, which is where pnpm runs scripts.
- **The `if-exists` form is required, not tidy.** Every variable the file can carry is
  optional (`CLERK_JWT_KEY` above, and the rest have committed defaults in `Config.ts`), so
  a fresh clone with no file must boot. Plain `--env-file` exits non-zero on a missing file.
- **The test script deliberately loads nothing**, and `apps/server/test/env-file.test.ts`
  fails if that changes. A suite that picks up a developer's real key says something
  different on their machine than in CI — the same hazard already recorded for the web
  app's Vite env loading, where `vite.config.ts` has to pin `VITE_CLERK_PUBLISHABLE_KEY`
  empty for exactly this reason. Vitest does not read `.env.local` for `apps/server`
  (no Vite config, no `envDir`), so the property holds by omission; the test is what keeps
  someone from "helpfully" adding the flag for symmetry.
- **A real environment variable beats the file.** Node's parser does not overwrite what is
  already in `process.env`, so `PORT=4000 pnpm -F server dev` still wins and a deployment
  needs no file. Double-quoted values keep their newlines, which is how a PEM fits.
- **The boot line is half the fix, and must stay.** `identityFromConfig` in `app.ts` logs
  `Hosted sign-in is ON` or `OFF` on every start. Loading the file silently would have left
  the original complaint intact — a variable set, a restart, and nothing saying it was not
  seen. Both branches log, neither logs key material (not a prefix, not a length), and
  `env-file.test.ts` asserts all three.

## The sign-in surface in `apps/web`

**Clerk is opt-in here exactly as it is on the server, and that symmetry is the point.**
`VITE_CLERK_PUBLISHABLE_KEY` unset means no hosted sign-in: `pnpm -F web dev` runs, the
header shows no sign-in chrome, the hosted card in the Server panel is absent rather than
present and dead, and the machine-token path is untouched. `apps/web/src/auth/AuthProvider.tsx`
mounts `ClerkProvider` only when the key is present — Clerk's quickstart prints a hard
`throw new Error("Add your Clerk Publishable Key")` there, and that one line is the difference
between an opt-in dependency and a mandatory one. `apps/web/.env.example` documents the
variable; `.gitignore` already covers `.env.*`, so the real key lives only in an ignored
`apps/web/.env.local`. **Say which package's `.env.local`, always** — the two apps load
theirs by completely different mechanisms (see the env-file section above), and an
unqualified `.env.local` in a doc is what sent a key to a file the server never read.

**Package names, same trap as the server side.** `@clerk/react`, **not** `@clerk/clerk-react`;
types from `@clerk/shared/types`, **not** `@clerk/types`. Both old names are deprecated
upstream and both still install cleanly — the same shape as the `@base-ui-components/react`
rename. Verified at `@clerk/react@6.12.11`, whose React peer range `~19.2.3` the workspace's
19.2.8 already satisfies, so no React bump is needed.

**Core 3 removed `SignedIn`/`SignedOut`/`Protect`** in favour of one
`<Show when="signed-in" fallback={…}>`, which renders `null` while auth loads. And
**`getToken()` now _throws_ `ClerkOfflineError` offline** where it used to resolve `null`;
`AuthProvider` treats both as "no credential".

**`packages/api`'s client stays free of Clerk, and Clerk stays behind a local seam.**
`HostedSession` (`auth/hostedSession.ts`) is the whole vocabulary the app has for a hosted
sign-in — `configured`, `signedIn`, `fetchToken()` — mirroring the server's `IdentityProvider`.
`AuthProvider.tsx` and `SignInSurface.tsx` are the only files importing `@clerk/react`.
`makeClient(token?)` needed no change: a session token is a bearer token like any other.

**The token is fetched immediately before each call, never held in state.** Clerk's session
tokens live 60 seconds; one read at mount works until the first refresh and then 401s
silently, which for a page left open at a table is most of the session. The assertion that
fails if someone hoists the fetch out of the handler is in `ServerPanel.test.tsx`
("fetches a fresh session token for every call").

**`vite.config.ts` pins `VITE_CLERK_PUBLISHABLE_KEY` empty for the test run.** Vitest loads
`.env.local` like any other Vite build, so without that line the suite behaves differently on
a machine that has Clerk configured — `AuthProvider` would mount the real `ClerkProvider` and
reach for Clerk's script over the network, failing the tests that assert the unconfigured
path. Pinning it in committed code is what makes the suite say the same thing everywhere.

**The sign-in surface is deliberately unthemed, and that is a decision, not an omission.**
Clerk's prefabricated components carry Clerk's own styling against a dark-only product whose
Tailwind theme deletes the default palettes outright, so the first screen a user sees looks
visibly foreign. The captain accepted that cost explicitly as a "for now" because the
designers have not drawn a sign-in screen. The upgrade path is Clerk's `appearance` prop
pointed at the existing design tokens — a bounded styling job. Do not rebuild the flow from
`@taverns/ui` primitives on Clerk's headless hooks instead.

**Clerk's bot protection blocks headless sign-up.** A scripted browser hits a Cloudflare
Turnstile challenge in the sign-up modal, so the flow cannot be driven end to end without
either a real human or `@clerk/testing`'s Testing Tokens — and those need `CLERK_SECRET_KEY`,
which this design deliberately does not have. Budget for a human to click through it, or
expect to bypass it in the dashboard for a development instance.

## Screens in `apps/web`: the shape every new one should copy

The campaign view is the first screen built on the API, the runner is the second, the bestiary
the third and the Chronicle the fourth. Five things are settled by them; follow them rather than
re-deriving them. (The Chronicle keeps all five and adds one qualification to the first — see
its own section below: the recap of a night is loaded by the card that shows it, because one
`Effect` per screen would mean one recap per night just to draw a list.)

- **One `Effect` per screen, not one hook per endpoint.** `campaign/load.ts` composes six calls
  (two rounds, concurrent within a round, because the checklist hangs off
  `campaign.currentSessionId`) into one value, and `api/resource.ts`'s `useApiResource` turns
  that into exactly three states. Six independent hooks would give a screen sixty-four
  combinations of loading and failed to render. **The callback passed to `useApiResource` must
  be `useCallback`-stable** — its identity is what says "load again", so an inline closure
  loads forever.
- **`runApi` rejects; `runApiResult` does not.** A rejected promise throws away the _typed_
  error the contract declares and leaves every caller rendering `String(cause)`.
  `api/resource.ts` runs through `Effect.result` and narrows to four kinds a screen can say
  something useful about — `unauthorized`, `missing`, `unreachable`, `unknown` — matched on
  `_tag`, not on status codes. `ui/states.tsx` is the only place their copy lives. Note
  `unreachable` is `HttpClientError` with `reason._tag === "TransportError"`, plus a bare
  `TypeError` for the browsers that surface a raw `fetch` rejection.
- **The credential is resolved per call, by `auth/credential.ts`, and never held.** It prefers
  a hosted session token and falls back to the machine token in `localStorage` — the same key
  the Server panel writes, which is what makes that panel the credential source for a
  developer with no Clerk key. Both are read immediately before the request for the same
  reason the sign-in section already records. A screen must never assume an authenticated
  user exists: with no credential at all the load 401s and the notice says where to get one.
- **Do not render a field the API does not have.** A stubbed `0` is a worse lie than an absent
  line. Where a fixture field has no column, find the honest equivalent already on the wire, or
  the row that really answers it: the encounter card's "on the table now" is not a field on
  `Encounter` and never will be — it is the session's one unended `encounter_run`, which
  `campaign/load.ts` finds by listing the session's runs and taking the one with no `endedAt`
  (a third round of requests to follow `session.activeEncounterRunId` buys the same answer, and
  the partial unique index means they cannot disagree).
- **Layout that depends on a column's width uses a container query, not a breakpoint.** The
  encounter grid is `@container` + `@lg`/`@3xl`, which is where `auto-fill minmax(250px,1fr)`
  actually turns over (two cards need 516px, three need 782px) — and it reacts to the aside
  docking beside it, which a viewport breakpoint cannot see. It also keeps the raw px literal
  out, which ESLint forbids in TS. **`main` in the shell is itself a `@container`**, so this
  is the rule for a screen's outermost layout too and not only for a nested grid: there is no
  viewport breakpoint left in `apps/web/src`, and adding one would be measuring the window
  when the question is how wide the column is.

Three smaller facts that cost time:

- **Routing is the hash, and only `#/…` is a route** (`routes.ts`). The gallery's section links
  are plain `#foundations` anchors, and without that rule every one of them reads as an unknown
  route and throws the reader back to the campaign list mid-scroll. **`#/join/<token>` puts a
  secret in that hash on purpose**: a browser never sends a fragment to a server, so an
  invitation token stays out of access logs and out of the `Referer` of anything the join page
  links to, and `join/JoinScreen.tsx` carries it onward only in a `POST` body.
- **`Button` rendering an `<a>` needs `nativeButton={false}`.** Base UI warns and applies
  button-only semantics otherwise. That is how a route rendered as a button stays a real link —
  and note the accessible **role stays `button`**, so a test looks for a button and reads its
  `href`.
- **jsdom here has no `localStorage` at all** — not `window.localStorage`, and not the bare
  global, since Node 26's own is inert without `--localstorage-file`. Anything reading it must
  tolerate `undefined` (`storage()` in `auth/credential.ts` does); a test that needs it installs
  one, as `campaign/CampaignScreen.test.tsx` does.

**`SignInSurface` checks `publishableKey()` as well as the context's `configured`.** It hangs in
the shell's own top nav — it belongs to the app, not to a page — so every screen renders it, and
the two conditions are the same question `AuthProvider` asks before mounting `ClerkProvider`: the
vendor's chrome may only mount where the vendor's provider did. Without the second check any
screen's test is liable to be the one that discovers Clerk is missing above it.

### The shell: two bars, and the one seam in it

`apps/web/src/shell/AppShell.tsx` is `ui_kits/dm-screen/AppShell.jsx` in shipped components.
**The 260px rail is gone and the content has its width**, which is the whole point of the second
delivery's shell change rather than a side effect of it. Structure, outermost in:

- a **56px top nav** (`h-14` = `--s-11`) — mark, wordmark, the nav, then `context`, _Ask Hob_ and
  `SignInSurface` pushed right. Not sticky and not on the layering scale: it is a flex row
  _above_ the scrolling column, so it overlaps nothing and never has to win a stacking contest.
- the **per-screen `TopBar`**, sticky at `z-chrome` inside that column, at `--fs-display-s` (the
  delivery's size now that the wordmark has a row of its own).
- **`main`, a `@container`**, so screens size against their column.

Three things about it that are decisions, not details:

- **The nav wears `tabsTriggerVariants`, exported from `@taverns/ui` for exactly this.** The
  delivery asks for the same 2px accent underline at both levels; a second copy of the class list
  would be a second thing to change when the designers move it. Verified in Chromium: a nav link
  and a `TabsTrigger` compute the same four values (2px `rgb(23,121,140)`, `rgb(241,245,248)`,
  600, 13px). The items are real `<a href="#/…">` carrying `data-active` — the attribute Base
  UI's own tab sets, which is what makes the shared recipe work on a plain anchor. `-mb-px` in
  that recipe is what lands the underline _on_ the bar's hairline; the item needs `h-auto
self-stretch` to reach it.
- **The nav is the screens that exist, and it is a function of the route _and the mode_** — which
  is why it is shorter than the kit's. The kit draws four as of the third delivery (Campaign, Run,
  Bestiary, Chronicle); a screen earns its item when it is built, and _Run_ never does, because a
  fight is reached from the campaign that owns it and a top-level link could not know which.
  **_Bestiary_ is there, but only once a campaign is**, because `creatures.list` hangs off one;
  `navFor(route)` adds it when the route names a campaign and omits it on the campaign list.
  `sectionOf` lights **Campaigns** for the campaign list, a campaign _and_ a run, and gives the
  bestiary its own underline — the underline says which part of the app you are in. The mode is
  the second axis and is read off the route rather than passed beside it; see "The role switch"
  below.
- **The campaign name is the only elastic thing in the bar, so it is the thing that truncates.**
  The right-hand group is `min-w-0`, not `shrink-0`. Without that the bar overflowed its own
  width at 760px and clipped _Ask Hob_ — invisible to every test, because the shell's
  `overflow-hidden` keeps the document from scrolling.

**The seam for the Hob chat panel is two props and nothing else** — `onAskHob?: () => void` (the
bar's button; with none passed it still renders, because it is the bar the designers drew) and
`panel?: ReactNode`, the last child of the row under the top nav. **That row _is_ `HobRegion`** —
the component imported from `hob/HobDock.tsx`, not a second copy of its class list. It was a copy
(`relative flex min-h-0 flex-1 overflow-hidden`, kept in step by hand) for as long as the region
was only a positioned box; the sidebar rebuild made it also **publish its own element through a
context, which the overlaid panel is portalled into**, and a row restated here would be
`relative`, look right, and portal to `<body>` — where the scrim covers the whole app including
this bar. So the duplication is gone and could not have survived. **`Hob` is still passed bare and
must never be wrapped in a second `HobRegion`**: that would be a second positioned ancestor, and
the overlay would size to it rather than to the content. `HobRegion` used directly is right where
there is no shell, which is what the gallery's specimens do. `overflow-hidden` is what stops an
overlaid panel painting outside the row — and what clips the inline one while it slides
off-canvas — and `min-h-0` is what lets a panel that scrolls inside itself be shorter than its
own content.

**The shell holds no chat state, no ⌘K handler and no breakpoint** — `useHobPanel` owns all three,
including `HOB_INLINE_MIN`. A screen composes it:
`const hob = useHobPanel({ initialOpen: false })`, then `onAskHob={hob.toggle}` and
`panel={<Hob hob={hob} />}`. **`initialOpen: false` is deliberate and is the shell's call to
make** (the hook's own doc says so): a 400px panel that opens itself is worse than a button that
opens it when asked, and nothing is requested until it is opened. Mounted on the three product screens; the
gallery is left to its specimen, which owns a `useHobPanel` of its own — two on one page would
both answer the same ⌘K.

Measured in Chromium either side of the threshold, per screen: inline at 1440/1021/**1020** the
panel is `absolute` at `z-chrome` over a 400px gap element, so the _content column_ shrinks by
exactly 400 (1040 at 1440, 620 at 1020); at 1019/900 the panel is `absolute` at `z-dialog` and
the scrim `absolute` at `z-scrim` — different rungs, never one — with the scrim's box exactly the
row's (`0, 56, vw×844`), so it starts below the nav and `elementFromPoint` still returns the
_Ask Hob_ button. That is the property worth re-checking if either class list moves: **the overlay
covers the content, not the app.** `document.scrollWidth` stays equal to the viewport in every
case. (Inline was `position: static` before the sidebar; it is the gap that keeps the content
narrower now, and that is the number to assert — see the sidebar section below.)

`NavContext` is exported from the same file for the bar's right-hand pair, and takes an `href` for
the screen that is _inside_ a campaign — from a fight, the campaign's name is the way back to
prep, which is what the rail's footer used to be.

### The role switch: a mode, carried by the URL — and how navigation derives from it

**Captain's decision, 2026-08-12: the pill is a _mode_, not a filter.** Flipping it changes what
the app is — a DM's tool or a player's — not merely which campaigns a list shows. So the two sides
may diverge freely: a player's campaign screen owes nothing to the DM's and is **not that screen
with rows hidden**. Any player screen that follows should read this before inventing a second
scheme.

**It cost nothing at the data layer, and if a change here needs a server change that is the signal
something has been misunderstood.** One account being a DM at one table and a player at another was
already expressible and already answered: `GET /me/campaigns` returns `{campaign, role, joinedAt}`,
and the `DmActor` gate grants at one campaign and refuses at another. No migration, no `Actor`
change, no predicate. **Account-wide credentials are load-bearing for this** — `Actor.campaignId`
may narrow a credential to one table, and adopting that form for players would turn the switch into
a per-table sign-in.

**The mode lives in the route and nowhere else** (`modeOf` in `routes.ts`), which is the whole
design in one line:

| route                     | mode     | screen                                             |
| ------------------------- | -------- | -------------------------------------------------- |
| `#/campaigns`             | `dm`     | `CampaignsScreen`, filtered to `role === "dm"`     |
| `#/campaigns/:c` and down | `dm`     | the DM's screens, unchanged                        |
| `#/play`                  | `player` | the same `CampaignsScreen`, filtered to `"player"` |
| `#/play/campaigns/:c`     | `player` | `play/PlayerCampaignScreen`, a screen of its own   |

Held in React state beside the route it would be a second answer to "which app am I in", and a
reload, a bookmark or a shared link would land on a screen the pill says you are not looking at.
**So the pill is two `<a href>` and holds nothing** (`RoleSwitch` in `AppShell.tsx`), and
`navFor`/`sectionOf` read `modeOf(route)` rather than taking a role argument — one answer, so the
bar cannot light a section the URL is not in. It also settles what a global pill leaves open:
_Player_ at a table you DM has no meaning, and there is no such route to be in.

Six things that are decisions rather than layout:

- **The player nav is the screens that exist**, which today is _Tables_ and the gallery — the same
  rule that keeps _Run_ out of the DM's row. The delivery draws _Characters_, _At the table_ and
  _Chronicle_; each earns its item on the day its screen is built. **_Chronicle_ and _Bestiary_ are
  kept out on top of that**: `recap.read` is behind the `DmActor` gate and would answer a player a
  404, and a control that exists and then errors is worse than one that is absent.
- **_Ask Hob_ is absent in player mode, in the shell.** Asking is a write (`HobThreads.start` needs
  `campaignWritable`) and the captain settled that players do not talk to Hob, so the button would
  open a panel that can only apologise.
- **The pill belongs to the shell and takes no prop, and that is the fix for the bug where nobody
  could find it.** It was `AppShell`'s `roleSwitch`, defaulting to `false`, offered by the two
  campaign lists and by nothing else, and on the DM's list only once a `player` membership already
  existed. Both halves failed the same way. Measured in a real browser against an account that is a
  DM at one table and a player nowhere — **which is every account that predates the invitation** —
  the pill was absent on all eight DM screens _including the campaign list_, and present only at
  `#/play`, a URL you have to be told. It was also circular: you could not reach player mode until
  you were a player, and the control that takes you there was hidden until you were one. So it is
  drawn from `modeOf(route)` exactly as the nav is, on every screen, with **nothing to pass and
  nothing to opt into** — a control every screen must remember is one every new screen will forget.
  The single-role account gets the honest empty state rather than a hidden control: _Player_ lands
  on `#/play`, which says nobody has invited you yet and that a table appears once its DM shares it.
  That is what lets a DM handed a link to somebody else's table find it, which is the need
  underneath. **Inside a campaign the pill is there too**, and it lands on the _list_ on each side
  (`listFor`) rather than trying to carry the campaign across — role is a fact about a pair, so
  there is no player screen for the table you DM, and _"the tables I sit at"_ is a sentence that is
  true wherever it is read. The guard against a regression is the shape rather than a habit: with no
  prop there is nothing to forget, and `shell/AppShell.test.tsx` enumerates the `Route` union as a
  `Record<Route["screen"], Route>`, so a new screen does not compile until somebody has decided
  which mode it is in.
- **The bar's contents are wider than its box below about 1024px, and the wordmark and the ⌘K chip
  are what give way.** Adding the pill cost 143px + a gap, which pushed the intrinsic width of the
  DM campaign screen's bar from 904px to 1063px — enough to clip _Ask Hob_ on a 1024 laptop window.
  Both are decoration (the mark stays; the shortcut is `useHobPanel`'s and works either way), so
  they are `hidden … @5xl:inline` against a `@container` on the `header` itself — the container is
  the bar, because the question is whether _this row_ fits, which the window does not answer.
  Measured after: exact fit at 1440 and 1024 on every route, the pill clickable by
  `elementFromPoint` down to 760, and 930/900 at 900px — a hair over, as it was before (904/900),
  and the residual is the five-item DM nav rather than anything new.
- **The `Player` badge on a campaign row is gone with the mixed list.** Under a mode every row has
  the same role, so a badge on all of them would say nothing — the same rule that gave a DM's row no
  badge in the first place.
- **Two routes lead a player to a DM screen, and both are closed.** `CampaignsScreen` sends a
  `player` row to `#/play/campaigns/:c`, and `JoinScreen` does too — it used to point a brand new
  player at `#/campaigns/:c`, the first thing they ever pressed, which the gate answers 404. For the
  bookmark and the pasted link, **`CampaignScreen` reads the role in the round it was already making
  and `location.replace`s a player onto the screen that works.** That last one matters because
  landing there does _not_ fail loudly: every read its first round makes succeeds for a player,
  narrowed, so it would draw _New encounter_, _Ask Hob_ and the sharing control over a player's data
  and break only on the press.

Measured in Chromium against a real server and a real Postgres, with one account that is a DM at
_The Salt Road_ and a player at _The Hag's Bargain_: pressing _Player_ moved `#/campaigns` →
`#/play`, the nav went `Campaigns, Components` → `Tables, Components`, _Ask Hob_ disappeared, the
list swapped one campaign for the other, and the row's href was `#/play/campaigns/:c`. Typing the
DM URL for the table they only play at landed on the player screen instead. The same account's DM
screen kept every one of its controls. A second account — DM everywhere, player nowhere — got no
pill at all, and `#/play` typed by hand gave the honest empty state plus the pill back. Server-side,
the same credential got 404 from `runs.list`, `members.list` and `recap.read` at the table it plays
at, and 200 from `notes.list` and `characters.list` with only the shared rows.

## Authoring in `apps/web`: forms, mutations, and the traps in them

The campaign view writes as well as reads, and the runner comes next. These are settled;
follow them rather than inventing a second style. `api/mutation.ts`, `ui/form.tsx` and
`campaign/EncounterDialog.tsx` are the worked examples.

- **`useMutation` is the write side of `useApiResource`, and the two are shaped differently
  on purpose.** A read runs because its inputs changed, so its callback's identity is the
  trigger and must be `useCallback`-stable; a write runs because the DM clicked, so the Effect
  is handed over at `submit` time and no memoisation rule applies. Getting that backwards is
  how a form saves on every render. `submit` resolves a **`Result`**, not `A | undefined`: a
  `delete` succeeds with `void`, so "the row is gone" and "the call failed" would otherwise be
  the same value and a dialog would close on a failure it never noticed.
- **A form that writes two tables composes one `Effect`, exactly as `campaign/load.ts`
  composes six reads.** The encounter dialog creates the encounter and then its roster lines
  inside one `submit`; two submits in a row would give the form two busy flags and a
  half-saved encounter to explain. There is no transaction across requests, so a mid-way
  failure leaves the encounter saved and the roster short — that is the honest outcome, and
  rolling back with more requests would fail the same way one call later.
- **A structural write re-reads the screen; only a single boolean is optimistic.** The prep
  tick moves before the round trip and reverts on failure, because a checkbox that waits feels
  broken at a table. Everything that changes the _shape_ of a list waits and then calls the
  screen's `reload`, because a write here changes things the screen did not send —
  `Encounter.creatureCount` is computed per read, and a note's attachment moves a count on a
  different card.
- **Validate in the form as well as in the contract, and know why both.** The derived client
  encodes through the same schema the handler decodes with, so a bad payload **never reaches
  the network** — it fails locally with a `SchemaError`. That is the good outcome, but it
  means a validation failure is a _tag_ and not a status code (`classifyFailure` has an
  `invalid` case for it), and `Expected a value with a length of at least 1 at ["name"]` is a
  sentence for whoever wrote the schema. The form says "Give it a name."; the tag is the
  backstop.
- **A failed save renders in the `DialogFooter`, never at the end of the body.** The body
  scrolls, and a line appended below the fold is one the DM never sees — verified in a real
  browser, where it was invisible until it moved. `SaveFailure` truncates its detail to one
  line for the same reason: a transport failure's detail is a whole URL and grew the footer
  under the buttons.
- **`VisibilityField` is the only place a `dm`/`shared` control is written.** Off is `dm`, off
  is where a new row starts, and the payload says `visibility: "dm"` out loud so the form's
  default and the column default cannot drift. A child row whose visibility the DM is not
  being asked about — an `encounter_creature` line — **omits the field entirely** rather than
  guessing; that is the column default applying untouched. Same for a prep item.
- **`campaign/CampaignDialog.tsx` is the only thing in the product that sets
  `campaign.visibility`, and that column is the master toggle every one of those row-level
  switches narrows within.** Until it existed each of them was inert: a `shared` note inside a
  `dm` campaign is invisible, so nothing a DM shared reached anybody and no player-facing
  surface could render anything but a blank page. It is reached from the campaign screen's top
  bar, and **the button reads `Private` or `Shared` in words rather than being a gear** —
  fail-closed is only useful if the DM can read the current answer without opening anything,
  and an absent badge is not that. (There is no `settings` glyph: the icon table grows when a
  delivery names one, so it wears `lock` / `users`, which are already in it.)

Four things that cost real time, all found by driving it rather than by testing it:

- **`Select.Value` renders the _value_, not a label.** With neither an `items` prop nor
  children it falls through to serialising whatever the value is: a select keyed on `""`
  renders nothing at all, and one keyed on a uuid renders the uuid. Every `SelectValue` in
  this app therefore takes a function — `{(value) => …}`. jsdom cannot catch this, because
  Testing Library queries the trigger by its accessible name and never looks at what it draws.
- **Base UI's `Switch` puts its `id` on the hidden `<input>`, not on the visible
  `role="switch"` span** (`nativeButton` moves it, and is wrong here). Clicking the label still
  toggles it and Chromium resolves the accessible name through the association, so the
  `<Switch id>` + `<Label htmlFor>` pair is correct — but anything driving it must aim at the
  span, not the id.
- **`Select` is keyboard-driven in a headless browser.** A synthesised press-and-release on
  the trigger opens the popup and a click on an option does not land; ArrowDown to open, walk
  to the `[data-highlighted]` item, Enter. The scratch driver in this repo's task history used
  that, and it is the only route that worked.
- **`render()`'s return type is not nameable from an exported signature.** Testing Library's
  `RenderResult` reaches into `@testing-library/dom`, which pnpm's isolated layout hides — the
  same TS2742 the server hits with `@clerk/shared`. Annotate a shared `renderScreen` helper
  `: void`.

**Fixtures live in `campaign/campaign.fixtures.tsx`, shared by every screen's tests** — the
campaign view's reads and writes, and the runner's, which re-exports them through
`run/run.fixtures.tsx`. They are the JSON the server sends, not the decoded classes, so a field
the contract renames fails the test rather than rendering `undefined` — which is why a fixture
may not be a `Partial<>` of anything, and why a field added upstream is one edit here rather
than one per test file. `installStubServer()` (or the runner's `installRunServer()`, which can
also hold a stream open) must be called once per file at module scope, for the
`Context.Reference` reason `api/client.test.ts` records.

**The Party tab authors now, so the top bar's one create slot names all three tabs** — there is no
"nothing on Party" branch left. `campaign/CharacterDialog.tsx` is deliberately the `character` row
**as it stands today** (name, player, descriptor, AC, max HP, visibility): the table is due to gain
`level`, `species` and `class_name` as real columns, at which point `descriptor` stops being a free
line, and building for that shape early would mean either a column that does not exist or a display
string parsed back into fields — which is the thing that decision exists to prevent.

**A session is created by _Start session_, in `campaign/StartRunDialog.tsx`, and nowhere else.**
The prep checklist hangs off `session`, so with `campaign.currentSessionId` null it says so and
offers no Add row; the dialog is what fills that in. One `submit` makes three tables agree —
create the session (numbered one past the highest `sessions.list` returns), point
`campaign.currentSessionId` at it, start the run — and then stamps `session.startedAt` **best
effort**, with `Effect.ignore`. That last one is deliberate and was found by testing: stamping
first meant a fight the DM had pressed the button for could be lost to a timestamp that would
not save, and anything that would genuinely deny the stamp has already denied `runs.start` one
line above.

**Ending one is the mirror image and is _not_ written here**: it is `session/finish.ts`, shared
with the runner's own dialog, reached from the session card in this screen's aside. See
"Finishing a session: one write, two surfaces, and a fight that carries" below.

## The live session: what is durable, what is fan-out, and how a stream comes back

`packages/design-system/ui_kits/dm-screen/EncounterRunner.jsx` is the specification. Step 4 of
the backend built against it; the runner UI depends on the two contracts below, so read them
before changing either.

**Live state is written straight through to Postgres, transactionally. There is no in-memory
copy of a fight and no write-behind.** `EncounterRunner.jsx:164` promises the DM their
initiative order and hit points are saved, and the moment that promise matters is a crash
mid-combat. The write volume does not justify anything cleverer — a four-hour session is order
10³ writes. What is genuinely different about the live surface is the _read_ pattern, and that
is the stream. Do not add a cache; measure first.

**`character` is a live table too since `0014`**, which is the one thing here that is not about
a fight: the DM updates the party during play and the same doorbell carries it. Where a hit
point lives, what writes both copies, and what the doorbell does and does not cover are in
"Where a hit point lives, and what the doorbell covers" above, under the party.

**The fan-out carries no data — it is a doorbell.** `src/live/LiveEvents.ts` publishes
`{sessionId}` and nothing else; the SSE handler re-reads the log through the ordinary SQL
predicate every time it rings. That is not indirection for its own sake, it buys three things
at once: visibility stays in SQL rather than in an in-memory `filter` someone can forget (the
leak pattern `repo/visibility.ts` exists to prevent); a dropped notification is self-healing,
because the next one re-reads from the same cursor; and **reconnect is not a separate code
path** — catching up and tailing live are one query with one cursor, so the path a waking
laptop takes is the path every event already takes. The `PubSub` is `sliding`, so a frozen tab
costs latency rather than memory. §4.4's one-process-per-live-session constraint is this
module and only this module; Postgres `LISTEN`/`NOTIFY` lifts it with no schema change.

**The reconnect contract, which the runner UI must implement:**

- Every SSE event carries `session_event.seq` as its `id:` line. `HttpApiSchema.StreamSse` is
  given the codec in **`events` mode, not `data` mode** — `data` mode hard-codes the id to
  `undefined` and the name to `message` (`HttpApiBuilder.encodeSseStream`), throwing away both
  halves of this.
- Resume with `?since=<seq>`, exclusive. That is what the derived client uses, because
  `HttpApiClient` issues a plain `fetch` and a plain `fetch` does not resend `Last-Event-ID`.
- The `Last-Event-ID` **header** is honoured too, for a browser's native `EventSource`, which
  cannot rewrite its query string on the automatic reconnect but does send that header.
- **Heartbeats carry no `id`.** `Sse.encoder` omits the line for `undefined`, so a quiet
  connection does not overwrite the client's `Last-Event-ID`. The interval is
  `LIVE_HEARTBEAT_SECONDS` (default 20, under the 30–60s an idle connection survives through a
  proxy) — configurable mainly so the property costs a test one second instead of twenty.
- `GET …/log?since=` is the same query over a non-streaming transport, for a client that
  cannot hold a connection open.
- Authorization happens **before** a stream is returned, so a denial is a 404 with
  `content-type: application/json`, not a failure event inside a 200 nobody is listening for.

Modelling decisions that are settled, and that the report or the prototype states differently:

- **The turn marker is `encounter_run.active_combatant_id`, a pointer — not the report's
  `turn_index`.** The prototype holds an index (`:88`) and never adds a combatant (`:137`),
  removes one (`:107`) or rerolls initiative (`:138`). All three reorder the list, after which
  an index silently names a different creature while the screen still says whose turn it is.
- **There is no `player_view_enabled`.** `encounter_run.visibility` _is_ the `Share` switch
  (`:122`) and `combatant.visibility` is `Hide from players` (`:139`); the nested predicate
  already gates every combatant on its run, so a second boolean meaning "shared" beside a
  column called `visibility` would be one question with two answers. Both default to `dm`,
  unlike the prototype's switch, which starts on.
- **Hit points reaching zero does nothing but set the number.** No delete, no cascade, no
  invented `Downed` condition, no turn advance — `:107` says "Still in initiative — remove them
  when you're ready", and a condition the server adds is one the DM cannot clear.
- **A combatant snapshots every displayable field at seed time** (`display_name`, `subtitle`,
  `player_name`, `ac`, `hp_max`). `character_id`/`creature_id` are `on delete set null` and are
  read by nothing — provenance, not an access path. A name that came from a join goes blank
  mid-fight when someone tidies the bestiary in another tab. `encounter_run.encounter_name` is
  snapshotted for the same reason and is _not_ a duplicate of `encounter.name`: that column is
  what the template is called now, this is what the fight was called that night.
- **`session_event.seq` comes from one global sequence**, not `max(seq)+1` per session. A
  cursor only has to increase; it does not have to be contiguous, and nothing counts it. Gaps
  where another session wrote are invisible, and the race that `max+1` needs a lock to survive
  simply does not exist. It is `bigint`, so **`pg` hands it back as a string** — the mapper
  narrows it once.
- **Exactly one live fight per session is a partial unique index**
  (`encounter_run (session_id) where ended_at is null`), so it holds against `psql` and against
  two clients racing, not merely against the endpoint. `session.active_encounter_run_id` names
  which one; it is written only by starting and ending a run, has no payload field, and its
  foreign key is composite so a session cannot point at another session's fight. Ending frees
  the session, which is how "a fight interrupted and resumed" is a second row rather than an
  exception.
- **Idempotency is one partial unique index** on `(encounter_run_id, request_id)`. Damage and
  next-turn take a client-generated `requestId`; a repeat returns current state without
  applying. This is not offline-first design — it stops a double-tapped damage button taking
  ten hit points instead of five.

### A finished session is never the campaign's current session

§1.4 describes one transition — `ended` freezes `session.ended_at` **and clears
`campaign.current_session_id`** — and only the first half shipped. The campaign screen resolves
the night it is preparing from that pointer and `StartRunDialog` invents the next session only
when the pointer resolves to nothing, so a DM who finished a night was locked in it permanently.
The fix is in three places and each does something the others cannot:

- **`repo/Sessions.ts` performs the transition.** `releaseIfFinished` clears the pointer in the
  same transaction that stamps the end time. It is here rather than in the dialog because a
  client that forgets step two recreates the bug and a second client never sees it happen.
- **`repo/Campaigns.ts` refuses the other direction.** Pointing a campaign at a finished session
  is a `Conflict` (409) — the DM can see it, and the honest answer is that the night is over —
  while a session in someone else's campaign is `NotFound`, because "it exists but is not yours"
  is a disclosure. The `currentSessionId` in a payload is a client claim exactly as one in a path
  is.
- **`0006_session_finished.ts` makes it unrepresentable.** `campaign_current_session_id_fkey` is
  now composite: `session.is_open` is `ended_at is null`, the campaign's half is a constant `true`
  whenever it points anywhere, and `(id, true)` has no row to match once the session ends. Same
  trick as `note_encounter_fkey`, applied to a predicate rather than to a container, and both
  columns are `generated always as … stored` so there is no second copy to update wrongly. It
  also closes the window a check-then-write leaves open, since the key's own row lock arbitrates
  a session ending concurrently.

Three consequences worth knowing before touching it:

- **The key is `deferrable initially deferred`**, for the reason `encounter_creature.creature_id`
  is: ending and clearing are two statements and neither order is legal if the check fires at
  once. Under autocommit it still refuses a lone `update session set ended_at` on the spot.
- **`on delete set null` is gone and could not be kept** — Postgres refuses that action on a key
  containing a generated column. So `Sessions.remove` clears the pointer itself, and a detach
  that used to happen invisibly is now written down.
- **Ending a _fight_ is not finishing the _night_, and the two must not collapse.**
  `EndRunDialog` defaults to the smaller ending; only its switch stamps `session.endedAt`.
  `apps/server/test/session-lifecycle.test.ts` pins both, and pins the invariant against raw SQL
  as well as against the repositories.

### Finishing a session: one write, two surfaces, and a fight that carries

**The client half of the transition is `apps/web/src/session/finish.ts`, and every surface that
ends a night goes through it.** There are two now — `run/EndRunDialog.tsx`'s _"Finish session N
too"_ switch, and `campaign/FinishSessionDialog.tsx` behind the session card in the campaign
view's aside — and there was one for as long as the only way to end a night was to end a fight,
which is the wrong shape for the common evening: the fight finishes, the table keeps playing, and
the night ends an hour later over prep, notes and roleplay. A DM whose fight was already over, or
who never ran one, could not end the night at all. `apps/web/src/session/finish.test.tsx` drives
**both screens against one stub server** and compares the requests, which is the only way that
property is checked rather than claimed; a third surface should extend that file rather than
assert its own behaviour in isolation.

The write itself is one `PATCH … {endedAt}` and deliberately nothing else — clearing
`campaign.current_session_id` **and taking a live fight off the table** are the server's half of
the same transaction (below), so a client that "helpfully" also patched the campaign or called
`runs.end` would be writing a second answer to a settled question. `EndRunDialog`'s `runs.end` is
not that: it happens one line _earlier_ in the same `Effect` and is the DM choosing the smaller
ending, which is `resolved` rather than `carried`.

**`liveRunIn` is gone, and so is the tab-race re-read.** This file used to refuse a night with a
fight on the table, and check that refusal twice. Its own doc said the refusal was standing in for
a product question nobody had answered. It is answered — see below — so the client now only says
_which_ fight is being carried, because ending the evening over a live fight should not be a
surprise even though it is no longer refused.

**The containment trap this area walked into, and the shape of the fix.** `combatant` sits two
levels below the campaign (`combatant → encounter_run → session → campaign`), which is one more
than anything before it, so `repo/visibility.ts` grew a `Containment` chain that the predicate
walks recursively rather than a second hand-written predicate. **Checking "the session is
readable" and "the run is readable" as two separate questions is a hole**, and it shipped in a
first draft: both are satisfied by a run in a _different_ session of the same campaign, and the
pair says nothing about whether the parent in the path is the parent of the row. Use
`ensureNestedRowReadable`/`ensureNestedRowWritable`, which bind the foreign key.
`apps/server/test/live-session.test.ts` pins all ten reachable paths.

**`created_at` does not order rows inserted by one transaction.** Postgres `now()` is
transaction _start_ time, so every combatant a seed creates shares a timestamp and
`initiativeOrder`'s tiebreak falls through to `id` — the seeded list comes back with the party
interleaved among the monsters, fixed but arbitrary. Harmless (everything seeds at initiative 0,
so there is no correct order yet) but do not read `created_at asc` as "the order they were
added".

### A fight that carries across nights: a second run, and what it did to two constraints

**A night may be finished with a fight still on the table, and the fight continues into the next
one.** Captain's decision, reversing the placeholder refusal above. **The fight that carries is a
_second_ `encounter_run` row** — the predecessor keeps its night, gets `ended_at` and the new
`ended_reason = 'carried'`; the successor is created under the next session and points back
through `continued_from`. Not a reparented row: `0007_run_carryover.ts` carries the four reasons,
of which the deciding one is that the log is the assistant's memory and a moved row's own
`run-started` event stays filed under the night it no longer claims.

The pieces, and which is authoritative for what:

- **`repo/Sessions.ts`'s `carryLiveRun` is the transition**, beside `releaseIfFinished` and for the
  identical reason: ends the run as `carried`, clears `session.active_encounter_run_id`, appends
  `run-carried` — in the transaction that stamped `ended_at`. A client that forgets recreates the
  bug and a second client never sees it happen. **`Sessions` is therefore a live repository now**
  and takes `LiveEvents`; every composition of `Sessions.layer` provides it.
- **`repo/EncounterRuns.ts`'s `resume` is the pickup** — `POST …/sessions/:s/runs/resume`
  `{continuedFrom}`, shaped after `creatures/:id/derive`. It copies the round, the visibility, the
  provenance and every combatant. **Combatant ids are generated in TypeScript before the insert**,
  which is the only way the turn marker can carry: `encounter_run_active_combatant_fkey` is
  composite and refuses a marker naming another run's combatant, so an `insert … select` could not
  remap it.
- **Only a `carried` run may be resumed.** A `resolved` one is a `Conflict`, not a 404 — it is not
  missing, it is over, and reopening it would put "resolved" in one night's recap and "resumed" in
  the next's. Running that encounter again is `start`, and honestly a new fight.
- **`continued_from` cannot be a composite key**, unlike almost every other pointer here: both ends
  are `encounter_run`, and the only column they share is `session_id`, which would force
  predecessor and successor into the _same_ session. Containment is `EncounterRuns.resume`'s job,
  against `containedRowReadable` — the same shape as `encounter_creature.creature_id`.

**What it did to the two guarantees it reaches — neither weakened, and both are now pinned against
a run that outlives its session** (`apps/server/test/carryover.test.ts`):

- **`encounter_run_one_live_per_session` is untouched and still exactly right.** A carried run has
  `ended_at` set, so it leaves the index the moment it is carried; the night it came from holds no
  live run, and the successor is the next night's only one. Reparenting _would_ have needed this
  re-examined — moving a live run into a session that already has one raises a raw unique violation
  a repository would have to translate.
- **`campaign_current_session_id_fkey` (`0006`) is untouched and not reopened.** It constrains
  `campaign ↔ session`; carry-over is a `session ↔ encounter_run` question. A night finished
  mid-fight is still finished and still cannot be current — asserted through the repository _and_
  against raw SQL, because a night ending mid-fight is the case nobody could previously produce.
- The one genuinely new constraint is **`encounter_run_one_successor`**, so two nights cannot both
  claim to continue the same fight, plus `encounter_run_reason_needs_end` (a live run has no
  reason).

**The one thing that does not survive a resume is the order of combatants _tied_ on initiative.**
The copies get fresh ids and one shared `created_at`, so `initiativeOrder`'s tiebreak lands
somewhere else. The numbers carry exactly and the list reads the same down the initiative column;
only rows on equal initiative may swap. That is the same arbitrary-but-stable order a fresh seed
has (see `created_at` above), and `carryover.test.ts` says so rather than pretending otherwise.

### Beats: the DM's own line about what happened

`beat` is one line of prose filed against the night it happened on — no title, no attachment, no
reuse. It exists because every `session_event` kind is combat, so a record assembled from the
shipped sources reads as a hit-point transcript. **Captain's decision: its own small table under
`session`, not a kind of `note`** — `notes.list` has no filters (beats would fill the shipped Notes
tab), `NoteCreate.title` is non-empty, and `note` would end up with two container columns.
`0008_beats.ts` and `packages/api/src/Beat.ts` carry the full reasoning.

**The discipline that came with the decision: if a beat ever grows a title or an attachment, merge
it into `note` at that point, because by then it is one.**

Four things about it that are not derivable:

- **It is not a `session_event` kind, and the reason is decisive**: that table has no update or
  delete path by design, and a beat jotted in three seconds at a dark table will need correcting.
  Appending a retraction is a bad answer for the campaign's memory, and relaxing append-only is
  worse — a client past that `seq` would never see the edit.
- **Creating one appends `beat-added` and rings the doorbell; correcting one appends nothing.** The
  marker exists so a recap can order beats against combat from the log alone. **The prose is
  deliberately not in the payload**, which is what keeps `payload` non-contractual.
- **`beat_run_fkey` is composite** — `(encounter_run_id, session_id) → encounter_run (id,
session_id)` — so a beat on one night cannot attach to another night's fight, with
  `on delete set null (encounter_run_id)` for the same Postgres-15 reason as `note.encounter_id`.
  Everything else is `PrepItems` with one text column: no `campaign_id`, the existing `NestedTable`
  machinery, no new predicate.
- **The `tsvector` arrived in `0009`, not here.** `0008` deliberately shipped without one — an
  index nothing reads is worse than none — and the search section below is what it was waiting for.

**Deleting a session now throws away campaign history, not just a checklist** — `beat` cascades
from `session` like `prep_item` and `session_event`, which is the right cascade and worth a
confirmation on whatever client eventually calls `Sessions.remove`.

### The recap: what it draws from, and the shape the Chronicle screen will get

`packages/api/src/Recap.ts` is the contract and `apps/server/src/repo/Recap.ts` the one
implementation; `GET /campaigns/:c/sessions/:s/recap` is the only endpoint. **It is a view,
assembled per read, and nothing about it is stored** — no summary column, no model call in the
read path. That is the captain's standing constraint and it is the point of the feature: detail
is retained rather than summarised at write time, so the recap never becomes the only thing
anyone reads.

**Five sources, five existing predicates, no new SQL rule.** `SessionRecap` is:

| field      | source                                   | selection                                            |
| ---------- | ---------------------------------------- | ---------------------------------------------------- |
| `session`  | `session`                                | the night itself; an unreachable one is a `NotFound` |
| `fights`   | `encounter_run` + `combatant`            | every run of the night, oldest first, with its list  |
| `beats`    | `beat`                                   | all of them, oldest first, **verbatim**              |
| `prepDone` | `prep_item where done`                   | ticked only — an unticked line is the _next_ night's |
| `notes`    | `note` attached to an encounter that ran | the read-aloud that was actually read out            |

The three sources the captain's decision names are `notes`, combat and `beats`. **Beats are the
reason the recap is about the story**: every `session_event` kind is combat, so a recap without
them reads as a hit-point transcript and answers neither "who is the ferryman" nor "what did the
party decide about the crate".

Four things that are decisions rather than details:

- **A `RecapFight` is `run` plus two links, and restates nothing.** The round reached is
  `run.round`, and _"paused"_ vs _"the DM finished it"_ is `run.endedReason` — never a guess from
  `endedAt`. `continuedFrom` / `continuedInto` are `RecapRunLink`s carrying the **other** run's
  session number and round, which is what makes "paused at round 3, picked up on session 13" and
  "resumed from round 3 of session 12" expressible from either end. Neither is on the row that
  holds the pointer, which is why the link exists at all.
- **Following `continued_from` does not grant reach.** It stays provenance, not an access path:
  the run at the far end goes through `containedRowReadable` like any other, so a link into
  something the actor cannot see comes back `null` rather than leaking that there is something to
  say. `recap.test.ts` pins that with a player who can see the successor and not its predecessor.
- **There is no duration and no round count beside `run.round`.** `session.startedAt`/`endedAt`
  already answer the first; a third number that has to agree with two others is the second-answer
  shape this schema refuses everywhere else.
- **"Who was removed mid-fight" is deliberately absent**, though the plan sketched it. `combatant`
  rows are really deleted and `session_event.combatant_id` is `on delete set null`, so no shipped
  source still holds the name — reconstructing it would mean branching on `payload`, which is
  documented as non-contractual. `GET …/log` still shows that somebody left.

**Which notes count is settled and is structural, not a timestamp heuristic**: a note attached to
an encounter one of tonight's fights was started from. A read-aloud improvised from an unattached
note is missing, and if recaps read thin the answer is a second, _differently labelled_ set — not
widening this one into "every note touched between `startedAt` and `endedAt`", which is wrong
every time the DM preps at lunchtime.

**It is a server-side repository even though `AGENTS.md` says one `Effect` per screen**, and the
reason is sufficient: the recap has **two** consumers. The Chronicle screen is one, the
assistant's `sessionRecap` tool is the other, and it runs here. Composed client-side the assistant
would write a second version and the two would disagree about what happened last session. That is
also why it is actor-scoped at the type level from day one — the tool inherits the actor rather
than getting a path around it.

#### The recap has a player projection, and it is a second schema on a second path

**`GET …/recap` is the DM's and is behind the `DmActor` gate; `GET …/recap/player` answers
`PlayerSessionRecap` to any member.** `Recap.read` takes the proof, `Recap.readAsPlayer` takes an
ordinary actor, and both assemble from one set of queries so the two cannot disagree about what a
night contains — only about how much of a combatant each is allowed to say.

It exists because the wide one was a live disclosure: a player member of a `shared` campaign read
the recap and got a shared monster's exact hit points and armour class. **Measured, in shipped
code, twice** — 41 of 82 at armour class 17 before, `hpBand: "bloodied"` and no `ac` field after.

Four things about it that are decisions rather than details:

- **Distinct schemas on distinct paths, never a field filter over the DM's type.** The captain's
  decision of 2026-08-12, and the shape is as load-bearing as the rule: a leak has to be
  _written_ rather than caused by a forgotten flag. So do not add an `if (isPlayer)`, a
  strip-fields helper, or a nullable `ac` that handlers are trusted to blank — a schema that _can_
  carry the number is a schema that eventually will.
- **`PlayerCombatant` is a union discriminated on `kind`**, so a monster arm has no field for an
  exact total and a `pc` arm has no band. **A player character keeps exact hit points**: that is
  the one number the whole table says out loud, and banding it would break an agreement rather
  than protect anything the party does not already know. `hpBand` is `healthy | bloodied | down`.
- **The band is computed in SQL and the wide columns are never selected**
  (`apps/server/src/repo/playerCombatant.ts`, the only place the narrow projection is spelled).
  Selecting the row and banding it in TypeScript is the post-filtering pattern `visibility.ts`
  exists to prevent, one level down: the number would be in memory, one forgotten line from the
  wire.
- **Conditions come through whole, and not one at a time.** The vocabulary is an open `text[]`, so
  a per-condition rule would be a visibility judgement made outside the predicate. A condition the
  DM does not want shared belongs on a row the DM does not share.

**What is deliberately _not_ narrowed**: `run`, and the four non-combat sources. A run's name,
round and ending are what a player who was there lived through, and the beats, notes and ticked
prep are already the `shared` ones by row-level predicate. Narrowing either without a decision
would settle the player fight view's shape by accident — which is the mistake that left this
endpoint open in the first place.

The player Chronicle screen is **not** built and nothing in `apps/web` calls the new endpoint yet;
that is a separate task with its own design.

`Recap.ts` imports other repositories' row mappers: `toBeat`, `toNote`, `toPrepItem`,
`toSession`, `toCombatant`, `toEncounterRun` and the `BEATS`/`PREP` nested-table constants are
exported for it, so there is still exactly one mapper per table. That is the rule rather than an
exception to it, and it now has two more instances: `Search.ts` builds its containment from
`BEATS`, and `Memberships.mine` selects `campaign.*` beside the actor's own membership row and
maps it with `Campaigns.ts`'s exported `toCampaign`. **One mapper per table, imported where a
second read needs it** — a second `toCampaign` would be a second answer to what a campaign is on
the wire.

### Campaign search: the one path over this corpus, and what is deliberately not in it

`apps/server/src/repo/Search.ts` is **the only place in the product where a `tsvector` is
queried**, and `GET /campaigns/:campaignId/search` is its only HTTP surface. The assistant's
`searchCampaign` tool is a `Tool.make` wrapper around `Search.search` — it writes no
SQL, declares no predicate and gets no privilege of its own. **Anything that needs a read this
repository does not expose is a new method here, never a query somewhere else**: two search paths
over one corpus would be permanent, and the second one is where the visibility seam gets
re-derived slightly wrong.

**What is indexed, and by what:**

| arm         | index                                                   | read predicate                                        |
| ----------- | ------------------------------------------------------- | ----------------------------------------------------- |
| `note`      | `0009` — `title` at weight A, `body` at B               | `rowReadable`                                         |
| `beat`      | `0009` — `body` at weight **B**, not the default D      | the `beat → session` chain via `containedRowReadable` |
| `creature`  | `0004` — name A, size/type B, `jsonb` body C            | `corpusRowReadable`                                   |
| `character` | `0012` — name A, player/species/class B, `jsonb` body C | `rowReadable`                                         |

Beat body is weighted **B on purpose**: it is the same kind of thing as a note's body, and the
unweighted default would rank every beat at a quarter of an equally good note for no defensible
reason. One weighting scheme across all four arms is what makes `ts_rank` comparable enough to
order the whole union with one `ORDER BY` rather than concatenating four lists.

**`session_event` is deliberately NOT indexed, and this is a settled captain decision that
reversed the captain's own earlier line.** Do not add an arm over it without reopening it. The
evidence: the log's text content is numbers (`jsonb_to_tsvector` over real payloads yields
`'12':3 '40':5 '82':1`); the only prose in any payload is `run-started.encounterName` and
`combatant-added.displayName`, both already real columns on `encounter_run` and `combatant`; and
indexing it would make `payload` load-bearing, which `SessionEvent.ts` states it is not. Combat
stays reachable by name, by recap, and by reading `GET …/log?since=`. Per-table columns mean a
further arm is about eight lines if a query shape ever appears that these cannot serve — which
is the cost `character` actually paid in `0012`.

Five things that are decisions rather than details:

- **Per-table generated columns, never a denormalised `search_document` table.** The point is not
  tidiness: **a generated column cannot go stale.** Measured against a running server — a note
  edited in `psql`, behind every line of TypeScript, changed what the API returned on the next
  request with no reindex, no restart and no cache flush, and a `beat` row `INSERT`ed the same way
  was searchable immediately. A denormalised copy needs a trigger or repository discipline that
  will eventually be forgotten, plus a second copy of every row's visibility.
- **The campaign gate goes inside every arm of the union, never outside a bare `OR`.** That is the
  `corpusRowReadable` lesson applied to a union: one arm forgetting its `exists (select 1 from
campaign …)` returns rows for any authenticated request naming any campaign id. The arms compose
  the shipped predicates and restate none of them.
- **Campaign-scoped by path, and cross-campaign search is refused rather than unbuilt.** A
  top-level `/search` has nothing to hand `campaignInScope`, so a credential minted for one table
  would reach every other table the same DM runs — and in a search endpoint the extra rows read as
  a feature. `apps/server/test/search.test.ts` mints a scoped actor and proves both directions.
- **`SearchHit` is a union discriminated on `source`, not one record with nullable fields.**
  `sessionId` exists only on a beat hit and `title` only on the two things that have one — the
  same rule the screens follow: do not render a field the API does not have. A hit is a pointer
  plus a result line, not a copy of the row; provenance is absent until something writes it.
- **`source` is a scalar query param, not an array.** A one-element array does not survive the
  wire at `effect@4.0.0-beta.102` (see the bestiary section), and "only the beats" is exactly the
  one-element case.

Two smaller traps, both measured:

- **`ts_headline`'s `StartSel=`/`StopSel=` must be the _quoted_ empty string.** Written bare, the
  option parser swallows the next option and the snippet comes back reading
  `,StopSel=ferryman</b> is called Cazril`. Quoted, the excerpt is plain text — which is what the
  wire type promises, because a JSON string carrying HTML is a rendering contract nobody agreed
  to.
- **An `ILIKE`-only hit ranks 0, and that is correct rather than a bug.** "ferry" is not a lexeme
  of "ferryman", so full text cannot score it; the two matchers exist because neither subsumes the
  other, and ordering falls through to recency. `websearch_to_tsquery`, never `to_tsquery`, and
  `likeContains` in `repo/rows.ts` is the one escaper both this and the bestiary use.

## The runner: how a screen consumes the stream, and what it does when it comes back

`apps/web/src/run/` is the client half of the section above, and the next live surface should
copy its shape rather than re-derive it. `stream.ts` is the whole reconnect story; `state.ts`
is the optimistic one.

**The stream is a doorbell on the client too.** The server publishes `{sessionId}` and re-reads
the log from SQL; this screen receives a `SessionEvent` and re-reads the run and its combatants
through the ordinary API. It never applies the event's `payload` — that field is documented as
"the human-legible remainder … not a contract anything branches on", so reconstructing hit
points from it would be a second implementation of the clamp in `Combatants.damage`. What the
log panel renders comes from `kind` and the two id columns and nothing else.

**The cursor lives in a `useRef`, and every attempt opens with `?since=<cursor>`.** State is a
frame behind by design and the cursor is read at the instant a connection is opened. A first
connection replays this run's log from 0, a reconnect replays only what was missed, and a
redundant reconnect replays nothing — so the screen can afford to reconnect eagerly. Heartbeats
carry no `id` and must not move it (`stream.test.ts` pins that). `?since=` and not
`Last-Event-ID`: the derived client issues a plain `fetch`, which does not resend that header.

**Reconnecting has two halves, and resuming the log is only one of them.** The rows are read
over a _separate_ request, so a client that received an event and then failed to re-read it
comes back to a stream with nothing to replay and sits quietly behind the server. Measured in
Chromium with the network cut mid-fight: the open stream kept delivering the doorbell, a new
`fetch` could not leave, and the screen stayed stale. Two things fix it and both are load
bearing — `useLiveStream` calls `onReconnected` on every connection **after the first**, and a
failed re-read in `useRunState` retries itself with backoff.

**A connection that goes silent is the worst kind, and `Stream.timeout` is the only thing that
notices.** A sleeping laptop leaves a socket that is "open" at both ends with nothing arriving;
nothing errors, so the loop would wait forever. `SILENCE_MS` is 45s — over two of the server's
20s heartbeats — and it is paired with `LIVE_HEARTBEAT_SECONDS`: raise that above 45 and every
healthy connection reconnects on a timer. Verified by `SIGSTOP`ing the server (see the
measurement notes below): 43s to give up, then `SIGCONT` and back to live, resuming from the
cursor.

**The retry loop uses `Effect.result`, never `Effect.exit`.** `result` catches typed failures
only, so an interrupt — which is what React's cleanup does — unwinds the loop instead of being
caught and retried forever. Defects are turned into failures with `Effect.catchDefect` for the
same reason: a defect that killed the loop would leave the screen silently stale, which is
worse than reconnecting too often. Backoff is `[250ms … 30s]`, and `strikes` only grows for
attempts that heard **nothing at all**, so a connection that lived an hour and then dropped
starts again from the top.

**Hit points are optimistic; the turn marker is not.** Damage is the write that happens every
few seconds while four people watch. Whose turn it is gets read aloud, and a wrong guess means
saying the wrong name at the table — so it waits. The optimistic rule is three lines and is in
`state.ts`: a row with an outstanding write of ours renders `pending`, only our own last
response clears it (a stream refresh underneath changes nothing on screen until then), and a
failure clears it with nothing to replace it plus a toast. It is an absolute value and not a
delta on top of the server's row, because a delta double-counts for the moment between the
server applying the hit and our response landing. **What makes this sound rather than merely
quick is that the endpoint takes a delta**: a hit computed from a stale row still applies the
right amount.

**Every write uses its own answer, so the screen works with the stream down.** `nextTurn`, the
share switch and moving the marker return the run; damage returns the combatant. The doorbell
is what keeps a _second_ tab honest and what catches up after a drop — it is not how this tab
learns what it just did. Writes that change the shape of the list (add, remove, roll
initiative) re-read instead, the same rule the campaign screen follows.

Four smaller things, all of which cost time:

- **The route carries all three ids** (`#/campaigns/:c/sessions/:s/runs/:r`). That is what makes
  a mid-fight reload land back in the fight with no local state and nothing to look up. A
  half-typed run link falls back to the _campaign_, not to the list.
- **`AppShell` takes `fill`.** The prep screens scroll; the runner is one screenful with a list
  that scrolls inside a panel, which needs a bounded height all the way down.
- **The initiative order is the server's, unsorted.** It is also what `nextTurn` walks, so a
  second sort in the client could disagree with the marker. Everything seeds at initiative 0
  (see `created_at` above), so the roll button exists — d20 for the monsters only, because the
  app cannot roll for the people at the table and overwriting numbers they just called out
  would be worse than no button.
- **Hit points reaching zero renders; it never removes.** Greyed, struck through, in place.
  Removal is an explicit act inside the edit dialog, and nothing on the row offers it.

### Measuring this class of change

Same blind spot as the dialog motion and the layering scale: jsdom sees none of it. What
worked, driving Chromium over CDP:

- **`Network.emulateNetworkConditions {offline:true}` does not kill an established socket.** It
  blocks new requests, so the stream keeps delivering while re-reads fail — which is a real and
  useful case, but it is _not_ how to test the silence watchdog. For that, `SIGSTOP` the server:
  the connection stays open and the heartbeats stop, which is exactly a sleeping peer.
- **Chromium reports the CORS preflight as a second `Network.requestWillBeSent` for the same
  URL.** Two `/events?since=0` lines in a trace is one connection, not two. Count established
  sockets (`ss -tn state established '( sport = :3300 )'`) if you need the truth — it stays flat
  across reloads, which is how the fiber interrupt was confirmed to close the stream.
- Base UI's `Switch` puts its `id` on the hidden `<input>`; drive the `[role=switch]` span. Its
  `Select` needs the keyboard route. Both are already recorded above, and both bit again here.
- **The kit prototypes cannot be rendered from this repo, so do not plan a side-by-side against
  a running `ui_kits/dm-screen/index.html`.** They need `_ds_bundle.js` for `Badge` and `Icon`,
  and `PORT-NOTES.md` excludes it on purpose — it is a second, drifting copy of components this
  repo ships for real. Served over HTTP the page loads, React mounts, and every component throws
  on an undefined global. Compare against the `.jsx` source and the `guidelines/` specimens, and
  assert on **computed values from the running app** (`getComputedStyle`, `getBoundingClientRect`)
  against the token the kit names. That is what caught the 760px overflow a screenshot did not.

## The bestiary screen: how it consumes the creature contract

`apps/web/src/bestiary/` is `ui_kits/dm-screen/Bestiary.jsx` against the real API — search,
environment chips, the grid, the stat block and the empty state the designers drew. It is a
read-only browse screen: **there is no authoring, no importing and no derive**, and nothing on
it offers one, because a button that opens nothing is the same lie as a stubbed field. The
endpoints for all three exist (`creatures.create` / `update` / `derive`); the screens do not.

Five things it settled that the next screen over this contract should not re-derive:

- **The route hangs off a campaign — `#/campaigns/:c/bestiary` — and so does the nav item.**
  `creatures.list` is `/campaigns/:campaignId/creatures`, and that path is the _only_ thing
  gating the global `system` rows it returns beside the campaign's own, so a campaign-less
  bestiary has nothing to read through. `navFor(route)` in `shell/AppShell.tsx` therefore adds
  _Bestiary_ only when the route names a campaign; from the campaign list it is absent rather
  than disabled. `sectionOf` gives it its own underline, because it is a screen you go _to_ from
  a campaign rather than a view of one.
- **The search and the sort are query parameters; the environment chips are not.** The search
  has to be the server's, because `ILIKE` on the name is only half of it and the other half is
  full text over the stat block — measured against a running server, `"nimble escape"` returns
  the Goblin Boss _and_ the reskin derived from it, by a trait that is in no column. The sort
  goes with it because `cr` orders by `crSort`. The chips do not, and that is not a shortcut:
  **a one-element array does not survive the wire at `effect@4.0.0-beta.102`.** The derived
  client encodes `["Cave"]` as one `?environments=Cave`; the server's query decoder reads a
  single occurrence of a key as a scalar, and `Schema.Array` refuses it — `Expected array |
undefined, got "Cave"`, a 400. Verified by hand against the running server:
  `?environments=Cave` is 400 and `?environments=Cave&environments=River` is 200. Applying the
  any-of in the client loses nothing (every row carries its own `environments`, the two filters
  are conjunctive, the server's order is untouched) and costs no request — but the _contract_ is
  still wrong, and a fix belongs in `packages/api`/upstream, not in a second client workaround.
- **The card is the row half and the panel is the document half, and both are rendered.**
  `AC 17` / `21 hp` on the card are the integers that filter and sort; `"17 (chain shirt,
shield)"`, `"21 (6d6)"`, `"1 (200 XP)"` are what the stat block shows.
  `bestiary/StatBlock.tsx` prefers the document and falls back to the column when the document
  is empty, so a creature typed in a hurry still shows its numbers. It moved there out of
  `run/CombatantPanel.tsx`, which now imports it — one block, two screens, because it is one
  row.
- **Provenance is rendered, and rendered above the fold.** `provenance.ts` is the only place
  origin is turned into words. `system` → _Shared corpus_ plus a sentence saying it belongs to
  no campaign and is not theirs to edit; `authored` earns **no** card badge, because absence is
  what says "yours" and a badge on every row would say nothing. The dialog's badge sits in the
  header rather than at the end of the body, for the reason `SaveFailure` sits in the footer:
  that body scrolls, and a line under it is one a DM never reads.
- **Two empty states behind one drawn card.** `EmptyState` renders the designers' _"Nothing
  lives here"_ either way; the second sentence is _"Loosen a filter"_ when the DM narrowed
  something and names `pnpm -F server bestiary:import` when the campaign's whole reach is empty.
  Telling them apart needs the screen to remember whether an _unsearched_ answer was empty —
  which is exact, because the chips never reach the server. The chip vocabulary is accumulated
  across loads rather than recomputed, so a search cannot take the chips off the row.

The last good list stays on screen while the next one loads (`shown`), so a grid does not blank
to "Loading…" on every keystroke. Measured in Chromium against a real server and a real corpus:
3 × 448px columns at 1440 and 2 × 410px at 900 with no horizontal document scroll; the stat
block dialog at `z-dialog` 110 over a scrim at `z-scrim` 100, `elementFromPoint` inside it
returning the dialog; a pressed chip at `--accent-soft` on `--accent` with `--accent-ink` text.

## The Chronicle screen: the recap, the record, and the one number that lies

`apps/web/src/chronicle/` is `ui_kits/dm-screen/Chronicle.jsx` against the real API — a spine of
nights newest first, one card open at a time, a _Read aloud_ toggle, and a search box over the
whole record. Route `#/campaigns/:c/chronicle`, nav item `scroll-text`, added by `navFor` only
once the route names a campaign, exactly as _Bestiary_ is.

**The carried-fight round is the thing to get right, and it is invisible when wrong.** A fight
that crossed a night is two runs, and `RecapRunLink` carries the _other_ run's round at each end
— two `Int`s on one shape that mean different things, so swapping them compiles, renders and
reads plausibly:

| rendering                                            | round to use              | why                                                    |
| ---------------------------------------------------- | ------------------------- | ------------------------------------------------------ |
| "Paused at round N", on the night it paused          | **`run.round`** — its own | frozen when the night ended; a fact about _this_ night |
| "Session M picked it up, and it has reached round K" | `continuedInto.round`     | the successor _now_, wherever it has got to since      |
| "Resumed from round N of session M"                  | `continuedFrom.round`     | the predecessor's frozen round — the pause             |

`chronicle/fight.ts` is the only place any of it is worded, and `fight.test.ts` pins both
directions against a fixture where the two numbers **differ** (paused at 4, since reached 7) —
with the numbers equal, the assertion holds whichever the screen picked. Verified in Chromium
against a real carried fight: session 11's card reads _"Paused at round 4 when the night ended."_
and _"Session 12 picked it up, and it has reached round 7 there."_, session 12's reads _"Resumed
from round 4 of session 11."_ and _"On the table now, at round 7."_, and neither names the other's
number. `"has reached"`, not `"is at"`: the link carries no end time, so the successor may be over.
The state itself comes from `run.endedReason`, never guessed from `endedAt`.

Five more things this screen settled:

- **The spine loads; the recaps do not.** This is the one screen where "one `Effect`, six calls"
  would be wrong: a recap reaches five tables, and a twenty-night campaign would fire twenty of
  them to draw a list. `load.ts` loads the campaign, `sessions.list` and the current night's
  checklist; `RecapBody` is mounted only while its card is open and reads that one recap. Only one
  card opens at a time (the delivery's own behaviour), so it is one request, and a collapsed row
  costs none — pinned by a test. The stated cost: **a collapsed card cannot show a summary**,
  because a summary _is_ a recap and nothing stores one.
- **Everything the delivery draws that has no column is absent, not stubbed** — the summary, the
  quote, who you met, where you went, loot, XP, level-ups, the _Recap session N_ button and the
  _Redraft / Edit / Keep it_ row. The last two are the assistant's; `RecapBody`'s `Drafted` badge
  reads `origin` instead, so it will appear by itself the day something writes an `assistant` row.
  _"Threads still open"_ is the one substitution made rather than dropped: it is the **unticked
  half of the current night's checklist**, which `Recap.ts` already names as what the next night
  inherits, and the aside says which night it is reading so the claim stays checkable.
- **A search answer carries its own query** (`SearchAnswer.q`), and that is not decoration. The box
  is debounced, so `q` moves before the request that follows it lands; rendering a count beside the
  _current_ `q` says "0 results for quokka" about a search for `quokk` — measured, in those words,
  before the field existed. It is also the string the excerpt highlighting is computed against.
- **`source` is one scalar or absent**, and the control is single-choice for that reason alone —
  see `Search.ts` and the bestiary's environment chips, the same wire defect met from the other
  side. Confirmed at the network layer in Chromium: `?q=ferryman` with no `source`, then
  `?q=ferryman&source=beat`, one occurrence, 3 hits narrowing to 1. Do not widen it to an array.
- **The excerpt is plain text and is rendered as elements, never as markup.** `search.ts`'s
  `segments` splits the snippet against the query's terms — minus the operators
  `websearch_to_tsquery` reads (`-` excludes, `or` joins), because highlighting an excluded word
  misreports why the row matched — and the pieces are rendered as spans. A snippet containing
  `<b>` shows those characters. An **empty** snippet renders nothing at all: a creature's snippet
  is its stat block's meta line and a creature typed in a hurry has none (measured: `"Ferryman's
Shade"` came back with `snippet: ""`).

Two smaller things, both measured in Chromium at 1440×900 against a real four-night campaign:
the aside is **not** sticky though the delivery draws it so — the scroll container is the shell's
column and `TopBar` is already sticky at its top, so an aside pinned to the same edge parks its
heading underneath the bar, and the offset that would fix it is the bar's height, which is not a
token. And read-aloud mode **drops** the DM half rather than restyling it (no aside, no _At the
table_, no _Questions you answered_), leaving beats and read-aloud notes in Alegreya at 18px
(`--fs-body-l`) on a 671px measure.

## The invitation surfaces: the DM's link, and a stranger's first screen

Two screens, and between them they are the client half of the invitation contract above.

**`apps/web/src/join/JoinScreen.tsx` is the first screen a stranger sees of this product**, and
it is the only one that renders before anybody is signed in. It reads `invitePreview.read` with
no credential, names the campaign and the DM, says what taking the seat gets you, and only then
shows Clerk's card — which is §6.3's one concrete answer to the friction the account model adds.
Three things it settles:

- **Every dead link gets one sentence**, because the server gives one answer for all four kinds
  of dead. It is deliberately not `FailureNotice`'s `missing` copy, which is about a row.
- **A signed-out reader gets no button.** The campaign is still named — that is the point of
  previewing first — but there is nothing to press until there is an account to keep the seat
  under. Both credential kinds count: a hosted session, or the machine token the Server panel
  wrote, so a developer with no Clerk key can follow a link.
- **Joining an unshared campaign says so, at the moment of joining.** That is the ordinary
  outcome and the only moment anybody is looking; the alternative is a blank page and no
  explanation anywhere.

**`apps/web/src/campaign/InviteDialog.tsx` is the DM's half** — mint, list, revoke — hung off the
campaign screen's top bar beside the sharing control, because the two answer halves of one
question. The link is shown **once** and the dialog says so, since the server keeps a digest. Two
things measured in Chromium rather than reasoned about: the dialog is `z-dialog` 110 over a
`z-scrim` 100 with the link wrapping inside its 460px, and — the one that was wrong — the line
under each invitation asks **withdrawn before taken**, in the server's own precedence. Asked the
other way a revoked-after-accepted row reads _"Removing it takes their seat back"_ about a seat
that is already gone, which is the one sentence here that could make a DM think a revoke had not
worked.

**The campaign list reads `GET /me/campaigns`, not `GET /campaigns`.** Both compose the same
predicate, so the switch cannot change which campaigns appear; what it adds is the role, which is
now what the role switch splits the list on and what decides where a row's link goes — see "The
role switch" under the shell. It stopped earning a `Player` badge in the same change: under a mode
every row in a list has the same role, so a badge on all of them would say nothing.

### The party screen: the roster, and the seat vocabulary derived

`apps/web/src/party/` is `ui_kits/dm-screen/Party.jsx` against the real API, at
`#/campaigns/:c/party` with a `users` nav item `navFor` adds once the route names a campaign — the
third screen to hang off a campaign for the same reason the bestiary and the Chronicle do. It is
the third invitation surface and the first reader `GET /campaigns/:c/members` ever had.

**`roster.ts` is the whole of what it knows, it is pure, and it takes its clock as an argument.**
The derivation table it implements is the one under "Membership is the model, and there is no
seat" — three statuses from three lists, and no fourth. Four things about it are decisions:

- **One `Effect`, four calls, one round** (`load.ts`). Nothing here depends on another response,
  and three of the four reads only mean anything joined to the others, so four hooks would give
  the screen sixteen states to say one sentence about a roster.
- **The DM is a row**, badged `crown`/`DM` and carrying no character status, because the endpoint
  returns them and a roster that silently drops a person is one you cannot trust. It deliberately
  does **not** claim "You": today the single `dm` member must be the viewer, but that is an
  inference off two other rules, and "DM" stays true the day a co-DM exists.
- **Only `live` invitations become rows.** A `redeemed` one is already a member and would draw the
  same person twice; the full lifecycle is `InviteDialog`, reused whole rather than redrawn — the
  report's own instruction, and it is where the withdrawn-before-taken precedence lives once.
- **The lower median, not the mean**, for _"the party is mostly level 5"_ — so the sentence names
  a level somebody is actually at, and a two-character party gets no line at all.

**`AssignDialog.tsx` is the only client of `characters.assign`**, and it exists because without it
`playing` is a status nothing can ever reach. Both directions are in one dialog (give, and `null`
to take back), and it offers only characters nobody holds — taking somebody else's away is two
deliberate presses, not a side effect of a select.

Measured in Chromium against a real server, a real Postgres and three real accounts (one DM, two
players joined through real invitations): the roster drew the DM, a `playing` member with
_"Brannoc · Level 5 Half-orc Paladin"_, a `no-character` member and a live invitation as a person;
minting one added it to the roster and withdrawing one removed it and dropped _Needs you_ from 3
to 2; assigning through the real select flipped a row to `playing` and dropped _Needs you_ again;
the dialog sat at `z-dialog` 110 over `z-scrim` 100 at 460px with the click landing inside it; and
the `--aside-w` aside docked at 1440 and 1000 and stacked at 760 with no sideways scroll at any
width.

## Hob: the chat surface, and what it is now attached to

`apps/web/src/hob/` is the designers' Option A —
`packages/design-system/ui_kits/dm-screen/ChatPanel.jsx` and `ChatParts.jsx`, built from the
shipped components. **It answers now**; the server half is the section below, and this one is
still only the surface.

- **`conversation.ts` is the whole seam, and the only file in `apps/web` that talks to the
  assistant.** `useHobConversation(campaignId, open)` asks `hob.status` **and reads the newest
  thread back** the first time the panel is opened, streams `hob.ask`, appends the deltas to
  the reply already in flight, and accepts what Hob offers. Two absences are load-bearing and
  both render as absences: **no campaign in view** and **no model configured** each leave
  `send` undefined (`HobPanel` then shows the exact reason where the composer would be).
  `discard` and `retry` stay undefined and the card disables them — see the accept section
  below for why neither is faked.
- **`thinking` is not "a request is in flight".** It is _an answer is coming and there is
  nothing to read yet_ — so it goes false the moment words start arriving (the growing text is
  the progress) and true again whenever Hob pauses for a tool. `activity` is the tool step in
  words, and it is the only moment Hob's whole claim — that answers come out of the DM's own
  record — is visible on screen.
- **Nothing is requested until the panel is opened.** It is closed by default on every screen,
  so a status probe at mount would be a request per page load for a surface nobody opened.
  Re-asking on each open is the other half: a server restarted with a model configured is one
  toggle away from working rather than a page reload.
- **The _"Knows"_ strip draws only what the server vouched for**, which is why `HobStatus`
  carries the campaign's name at all. The delivered `HOB_CONTEXT` fixture names three chips —
  campaign and session, the party, the fight on the table — and exactly one of them is
  something Hob is bound to; the other two would each be a second read for a decoration. Given
  no chips, `HobPanel` draws no strip. This mattered the moment Hob started answering: a strip
  naming a campaign the DM is not in, on the one surface whose whole claim is that its answers
  are not invented, is the worst possible place for a stub.
- **`transcript.ts` maps the wire to the drawn cards, and `artifactFrom` is the only place it
  happens.** `HobArtifact` is a discriminated union over the bodies the designers drew plus two
  of ours (`note`, `beat`) that Hob can actually offer to save; the delivery's `KIND_META`
  names eight kinds and the four with no drawn body stay absent. **Three of the union are
  produced and the rest are gallery specimens** — nothing makes an `npc`, a `checklist` or a
  `rules` card, because there is no table for one to be saved into. `chips` is `[]` and
  `adjustedXp` absent for the same reason a screen never renders a stubbed field.
- **`hob.fixtures.ts` is the delivered data, and the sample thread must not reach a screen.**
  The gallery's `#hob` section is the one place it renders. A panel that appears to hold a
  conversation the DM never had is the failure this area is most able to cause.
- **The mount is three names**: `useHobPanel()` (open state, `inline`, ⌘K/Esc), `HobRegion`
  (the `relative flex` row the overlay positions against **and portals into** — an overlay
  without one covers the page instead of the content), and `<Hob hob={…} campaignId={…} />` as
  that region's last child. **`campaignId` is what makes it answer**, and the campaign list passes none on
  purpose: Hob's tools all hang off a campaign, the same rule that keeps _Bestiary_ out of the
  nav until the route names one. The gallery's
  "The mount, and the opener" specimen _is_ that composition, so it fails if the seam rots.
  **The shell owns the Ask Hob button**; nothing in `hob/` draws one.

**The conversation is the server's, and the panel resumes the newest thread.** Opening it reads
`hob.status` and `hob.threads` together and then that thread's turns; a question carries a
thread id and its own text, never a transcript. Three consequences worth knowing: the thread id
lives in a **ref**, because `began` writes it mid-answer and a re-render in between would split
one evening into two; a saved thread is adopted **only when nothing is on screen**, so a read
that lands late cannot replace a question the DM is watching; and _New thread_ now means what it
says — it forgets the id, and the next question starts one. There is no thread picker, which is
a drawn-surface limit and not a data one.

**Omit an optional key; do not send it as `undefined`.** `payload: { threadId: undefined, text }`
reaches the server as `threadId: null`, and `Schema.optional` refuses a null — a 400 on the first
question of every conversation. Build the object without the key instead. (Only bites when a
caller writes the key explicitly, which is exactly what a `const threadId = …` variable invites.)

**Inline above 1020px, overlay below** — `HOB_INLINE_MIN`, from the second delivery's
`CHAT_INLINE_MIN`, which fell from 1180 when the 260px rail became a 56px top bar. Re-measured
in Chromium after the panel became a sidebar (see the section below), at 1440 / 1021 / **1020** /
1019 / 900: above the threshold the panel is 400px with a gap element beside the content
reserving exactly that width, so the content column is 1040 at 1440 and 620 at 1020, and there
is no scrim; at 1019 and below the scrim's box is the region's exactly (`0, 56, vw × 844`) at
`z-index: 100` with the panel at `110`, and `elementFromPoint` over the content returns the
scrim while over _Ask Hob_ it still returns the button. That pair is the point — it is the
property the select-under-a-dialog bug violated, and rendering above is not the same as _taking
the click_; and the scrim starting at y=56 is what keeps the overlay over the **content** rather
than over the app. `document.scrollWidth` equals the viewport at every width.

Three things that cost time here:

- **A flex column that scrolls shrinks its children by default.** The thread is
  `flex flex-col overflow-auto`, and without `shrink-0` every artifact card collapsed to a
  sliver as soon as the thread was taller than the panel. Invisible to jsdom, obvious in a
  browser.
- **A fixed-size `<img>` in a flex row stretches, and `shrink-0` does not stop it.** Preflight's
  `img { height: auto }` outranks the presentational `height` attribute, so the cross size is
  `auto` and the row's default `align-items: stretch` grows the image — `shrink-0` is a main-axis
  rule and answers a different question. Hob's mark measured 28 × 159.5 beside a long reply until
  `HobAvatar` stated its height in CSS. An `Icon` cannot suffer it: that reset covers `img`, not
  `svg`. jsdom sees none of this, the same blind spot as the motion and layering scales.
- **Do not auto-scroll an empty thread to the bottom.** The starter grid is taller than a short
  panel, so "scroll to the newest turn" opened on the last starter with the question scrolled
  off — the first thing a DM sees, already scrolled past.
- **The panel's 400px is `--panel-chat-w`** in `packages/ui/src/local-tokens.css`, bridged as
  `--spacing-chat-panel`. It was `w-100` — a bare Tailwind step — until the sidebar needed the
  same measurement as a custom property in three places at once (the gap, the positioned
  container, the portalled sheet). The delivery states it in prose and never tokenised it, which
  is exactly what that file is for. `--aside-w` is the 340px inspector, a different measurement.

**Driving a browser here: never assume a debug port.** `--remote-debugging-port=9333` was
already bound by another agent's headless Chromium, and `/json/list` cheerfully returned _their_
page — a probe that reported a shell nobody in this worktree had written. Launch with
`--remote-debugging-port=0` and read the real port off the process's own
`DevTools listening on ws://127.0.0.1:<port>/` stderr line.

### The panel is shadcn's `sidebar`, and what that brought in with it

Captain's decision: the bespoke dock was replaced by the registry component. `shadcn add sidebar`
for this project's style is `https://ui.shadcn.com/r/styles/base-nova/sidebar.json`, and its
registry dependencies are `button`, `input`, `separator`, `sheet`, `skeleton`, `tooltip` and
`use-mobile` — **no Radix is named and none entered the tree**; `pnpm-lock.yaml` and
`node_modules` both grep clean, which `adherence.test.ts` also asserts against the lockfile.

**Four are new and each is a full port, tokenised like the rest:**
`packages/ui/src/components/ui/{separator,sheet,skeleton,sidebar}.tsx` and
`packages/ui/src/hooks/use-mobile.ts` (the first file under `hooks/`). `sheet` and `sidebar` are
the two worth reading before touching anything here; `separator` and `skeleton` are a hairline and
a placeholder. `skeleton` is the one component whose animation is **not** timed from a `--dur-*`
token — `animate-pulse` has no start and no end — so `styles.css` §7 stops it under
`prefers-reduced-motion` by hand, which is the only reduced-motion rule this product writes
itself.

**`sheet` is a dialog underneath, so it is on the layering scale**: backdrop `z-scrim`, popup
`z-dialog`, two rungs and never one. It also carries the one prop this whole change turns on —
**`container`**. Upstream's sheet is `fixed` and portals to `<body>`; given a container it portals
into that element _and_ switches the backdrop and the popup to `absolute`, because a portal into a
region with the geometry still measured from the viewport is incoherent. That is what makes the
overlaid panel cover the content column and leave the app's own top bar lit.

**The vendored `sidebar.tsx` diverges from upstream in eight places, each numbered in its own
doc comment** so a future `sidebar.json` can be diffed and the differences read off: it sizes to
its container rather than the window; it takes `z-chrome` instead of `z-10`/`z-20`; the mobile
breakpoint is a parameter and `isMobile` may be supplied outright; the `sidebar_state` cookie is
gone (nothing read it); the `⌘B` shortcut is opt-out; a _controlled_ sidebar has one open state
rather than a second uncontrolled one for the drawer; the overlaid form is `modal={false}` with
`disablePointerDismissal` and an explicit backdrop `onClick`; and `className` reaches both forms.
The two that are easy to get wrong: an outside-press dismissal **races the opener that lives
outside the sheet** (the press closes it, the trigger's click reopens it, and the button looks
dead), and a collapsed sidebar **stays mounted off-canvas**, so it is `inert` or a keyboard walks
into a panel nobody can see.

**How the panel now mounts.** `HobDock` is a `SidebarProvider` rendered `display: contents` —
so the gap element becomes a flex item of `HobRegion` and the positioned container measures
against the region — wrapping one `<Sidebar side="right" collapsible="offcanvas">` whose only
child is `HobPanel`. The provider is controlled from `useHobPanel` (`open`, `onOpenChange`,
`isMobile={!inline}`, `mobileBreakpoint={HOB_INLINE_MIN}`, `keyboardShortcut={null}` because ⌘K
is already the hook's) and is handed `container={region}` from `HobRegionContext`. `HobPanel`'s
three rows are `SidebarHeader` / `SidebarContent` / `SidebarFooter` with the delivery's padding,
hairlines and gaps overriding theirs — including `[scrollbar-width:auto]`, because
`SidebarContent` hides its scrollbar and a chat thread shows one. **`useHobPanel.inline` is now
`!useIsMobile(HOB_INLINE_MIN)`**, so there is one media query in the product rather than two
spellings of the same threshold; the query it asks for is `(max-width: 1019px)`.

Nothing else moved. Verified in Chromium against a real server, a real Postgres and a scripted
OpenAI-compatible endpoint: a question streamed back with the tool step visible in words
(_"Writing a note — Cazril, at the crossing…"_), the proposal card drew with _Save to session /
Discard / Try again_, accepting it flipped the card to _Saved · Open it_ and wrote a real
`note` row with `origin: assistant` and `assistant_turn_id` pointing at the turn that proposed
it, and a reload read the whole evening back. The two honest absences still render as absences —
no campaign in view, and no model configured.

## Hob answers: the toolkit, the loop, the conversation, and the accept path

`apps/server/src/assistant/` is the whole assistant — two files — plus `packages/api/src/Hob.ts`
for the wire, `repo/HobThreads.ts` and `repo/Proposals.ts` for the conversation and the accept,
and `apps/web/src/hob/conversation.ts` for the panel. Read `toolkit.ts` first: it is where the
architectural rule lives.

**Hob gets tools, not a context blob.** The prompt carries the saved thread and the campaign's
_name_, and nothing else from the campaign; every fact in an answer arrives through a tool call
that is one shipped repository method — `Search.search`, `Sessions.list`, `Recap.read`,
`Creatures.findById`, `SessionEvents.list`. Each returns `Effect<…, NotFound, CurrentActor>`, so
an unscoped read does not compile. A pre-assembled context blob would be a second data path with
its own filtering, and the day it disagrees with the predicate is the day the assistant leaks.

**Eight tools now: those five reads and three `propose*`.** A propose tool still writes nothing —
it stashes what Hob drafted in a `Ref` that becomes the turn's `proposal` column. There is no
write repository anywhere under `src/assistant/`, which is what makes "nothing enters the
campaign without an accept" a property of the wiring. `proposeEncounter` resolves each
`creatureId` through `Creatures.findById`, so a model that invented one gets a `NotFound` it can
read rather than a card the DM cannot accept — and the name, rating and hit points on the card
come out of the row rather than out of the model.

**The campaign is not a tool parameter.** No tool takes one; `handlersFor(repositories,
campaignId, actor, proposal)` closes over the path segment the request was routed on and over the actor
`Authorization` resolved. So a model that hallucinated another campaign's id has nowhere to put
it — the call is not _expressible_, never mind refused — and the ordinary predicate underneath is
the second lock rather than the only one. `hob.test.ts` asserts no `campaignid` appears in the
tool schemas sent to the provider, and drives the leak case that would look like a feature: two
campaigns of the same DM both containing "ferryman", asked from one. Confirmed live as well —
the other table's name appeared in **zero** of the bytes ever sent to a model.

**It writes no SQL, and `hob.test.ts` fails if it starts to.** The retrieval index belongs to the
session-history work and the assistant consumes it. A `sql` template or an `effect/unstable/sql`
import anywhere under `src/assistant/` fails the seam test (comments stripped first, so the rule
can be described in the files it governs). A read the repositories do not expose is a new
repository method, not a query here.

**Re-providing `CurrentActor` inside each handler is deliberate.** The stream is pulled _after_
the handler effect returns, so the request's context is no longer ambient by the time a tool
runs; naming the actor makes it a captured value rather than a hope. `Hob.ask` still requires
`CurrentActor` at the type level, exactly like a repository.

### `LanguageModel.streamText` is one round-trip, not an agent loop

The single most surprising thing about `effect/unstable/ai` at `4.0.0-beta.102`: `streamText`
resolves the tool calls a step asked for, emits their results, and **stops**. The results are
never sent back to the model. So a grounded answer needs at least two calls, and `round()` in
`Hob.ts` is what supplies them — `Chat.fromPrompt` carries the history (tool calls and results
alike) across rounds, capped at `MAX_ROUNDS = 4`. `Chat.streamText` is one round-trip too; it
only adds the bookkeeping. Without the loop every grounded question comes back empty, and
`hob.test.ts` pins the two requests.

`finish` is **never** emitted as `done` from inside a round — it is recorded in a `Ref` and `ask`
emits one `done` at the very end. Two reasons: a round that asked for a tool has not finished the
answer, and a `proposal` event must not land after a `done` a client trusts. An answer that
already said `failed` gets no `done` at all — exactly one of the two, ever — though a `proposal`
may still follow a `failed`, because a model that offered something and _then_ burned the round
budget really did offer it.

### The wire, and the panel

`GET /campaigns/:c/hob` → `HobStatus`; `POST /campaigns/:c/hob/ask` → `HttpApiSchema.StreamSse`
of `HobEvent` (`began` / `delta` / `tool` / `proposal` / `done` / `failed`). Authorization
happens **before** a stream exists, so a denial is a real 404 and an unconfigured server a real
503 — same ordering `live.events` depends on. **No `id` line and no heartbeats**: an answer is not
a resumable log, a dropped stream is re-asked rather than resumed, and a tool step is the traffic
that proves a slow connection is alive.

`began` carries the thread id and the id of the turn the answer will be saved as, **first, before
the model is called** — the client needs both before it needs a word, and a dropped connection
must not lose the thread the question was already saved to. It is why turn ids are minted in
TypeScript (`HobThreads`) rather than by the column default.

### The conversation, and how a proposal becomes a row

**Both halves are one piece of work, and `0010_assistant_conversation.ts` says why.** Every
content table has carried `origin` and `assistant_turn_id` since `0001` with a check tying them
together; the check was _unenforceable_ until there was a turn to point at, so a row could claim
`origin = 'assistant'` and name any uuid. `0010` adds `assistant_thread` / `assistant_turn` and
makes `assistant_turn_id` a real foreign key on all fourteen content tables.

- **A thread is campaign-scoped and a turn hangs off a thread**, so `repo/HobThreads.ts` writes
  **no predicate of its own** — `rowReadable`/`rowWritable` plus the existing `NestedTable`
  machinery, exactly as `prep_item` sits under `session`.
- **Asking is a write.** `HobThreads.start` needs `campaignWritable`, so a player gets the
  ordinary `NotFound` — Hob is the DM's sidekick and a conversation nobody could read back is
  not worth writing. `hob.test.ts` pins it, and pins the player's _tool reads_ separately.
- **A hob turn is `origin = 'assistant'` with `assistant_turn_id = id`** — the turn that produced
  this text is itself. `who` says who spoke; `origin` says where the content came from, and a hob
  turn claiming `authored` would be a lie in the one table whose whole purpose is provenance.
- **The turn's answer is written in a `Stream.ensuring` finalizer**, so a DM who closes the tab
  mid-answer keeps the half they read. Best effort — a turn that cannot be saved must not turn a
  delivered answer into a failure — and nothing at all is written when neither words nor a
  proposal arrived, which reads correctly on reload as a question that went unanswered. A
  `failed` sentence is deliberately **not** saved: it is the product apologising, not something
  Hob said.
- **The record is complete and the prompt is its recent end** (`RECENT_TURNS = 40`). Same
  distinction the recap makes between what is retained and what is read back.

### The accept path: the only writer of `origin = 'assistant'`

`POST /campaigns/:c/hob/threads/:threadId/turns/:turnId/accept`, implemented by
`repo/Proposals.ts`. **It takes no content payload**, and that is the whole reason the provenance
is worth having: the note, beat or encounter is materialised from the `proposal` column the
_server_ wrote when Hob proposed it. If accept took the prose, any client could post its own and
have it recorded as the assistant's.

- **A proposal is not a row.** `assistant_turn.proposal` is the offer, `accepted_at` is the human
  saying yes, and until it is set there is no note, no beat and no encounter anywhere. An
  abandoned proposal decays into a line of transcript. `hob-proposals.test.ts` measures that
  rather than asserting it — it counts the three tables either side of a proposal.
- **It writes through the ordinary `create` methods**, with one extra argument
  (`AssistantOrigin`, `repo/rows.ts`). No create payload has an `origin` field, so a client
  cannot claim assistant provenance; only `Proposals` constructs one. An accepted row is made by
  _literally the same statement_ an authored one is — which is what makes it indistinguishable in
  usefulness (search finds it, the recap includes it, `creatureCount` counts its roster) and
  completely distinguishable in origin.
- **One transaction, and the turn is locked first.** `for update` on the turn is the whole
  idempotency story — a double-tapped _Save to session_ is one row and one 409. A second accept
  is a `Conflict` ("it is already there"), a turn that proposed nothing is a `NotFound`.
- **Three targets, chosen because they are three tables**: `note`, `beat`, `encounter` (with its
  roster). A beat's session is resolved at accept time from `campaign.current_session_id` — the
  DM may have finished the night since — and no session is a `Conflict`, not a 404. Accepted rows
  take the column default for `visibility`, so a draft lands DM-only whatever it is about.
- **Discard is not built and is not faked.** An unaccepted proposal is harmless transcript;
  hiding it would need a `dismissed_at` and an endpoint. The card disables the button, which is
  this surface's shipped way of saying "not given".

**The foreign keys are `deferrable initially deferred`**, for the reason
`encounter_creature.creature_id` is: `delete from campaign` cascades into `note` and into
`assistant_turn` in one statement, and an immediate `no action` fires before the referencing rows
are gone. Under autocommit a lone `delete from assistant_turn` is still refused on the spot — an
accepted row pins the turn that produced it, and `schema.test.ts` proves it.

### Configuration: unset is a supported mode

Same shape as `CLERK_JWT_KEY`, and it must stay that way. `HOB_API_URL` + `HOB_MODEL` (both, or
Hob is off), optional `HOB_API_KEY` (`Redacted`; **the only secret on that page, and no key of
any kind may be committed**), `HOB_MAX_TOKENS` (default 4096 — see "Hob never calls a tool"
below, which is why it is not 1024). `assistantFromConfig` in `app.ts`
logs one line at every boot — `Hob is ON: model … at …` or `Hob is OFF: …` — naming the model and
endpoint and never the key, for the reason the identity boot line exists. Unset means
`Hob.unavailable`: the server boots, the whole suite passes, `status` answers
`available: false`, `ask` is a declared `HobUnavailable`, and the panel prints the fix. It still
404s a campaign it cannot read, so "the assistant is off" is not a cheaper way to probe which
campaigns exist.

**Always pass `max_tokens` explicitly, whatever the provider**, and `hob.test.ts` asserts it
reaches the wire. The habit is what makes this trap impossible: at `4.0.0-beta.102`
`@effect/ai-anthropic`'s `getModelCapabilities` recognises no model id past `claude-opus-4-8`
(`.repos/effect/packages/ai/anthropic/src/AnthropicLanguageModel.ts:2972-3021`), the model
parameter is typed `(string & {}) | Model` so `claude-opus-5` compiles and never errors, and the
fallback silently caps output at **4096** and routes structured output through a prompt-based
JSON tool. Nothing warns; the first symptom is an answer cut off mid-sentence. Also verified at
this version: `@effect/ai-anthropic` ships **no** embedding module; `@effect/ai-openai` and
`@effect/ai-openai-compat` have `OpenAiEmbeddingModel`. Retrieval here is lexical by decision —
no embeddings.

### "Hob never calls a tool": what it is not, and the two things it is

Reported twice, against a 1B and then against a tool-capable 8B, and the diagnosis was wrong
both times before anyone looked at the wire. **Look at the wire first — the request body is one
`HttpClient.tapRequest` away** (`test/support/model.ts` already records it), and it settles in
one step which of three links failed. Measured against a real Qwen3-8B through LM Studio:

- **The tools are in the request.** Eight `function` entries, `tool_choice: "auto"`, on every
  round including the second and third. The toolkit → provider → wire path has never been the
  bug, and `hob.test.ts` asserts it by name.
- **The model calls them.** Replaying that exact captured body with `curl` came back
  `finish_reason: "tool_calls"` and a well-formed `searchCampaign`.
- So the failures are downstream, and there were two, **both of which report as "no tool call"
  and neither of which said anything at all**:

**1. `Schema.optional` on a tool parameter is a bug, and it is invisible until a model obeys the
schema.** The provider rewrites parameters through OpenAI strict mode (`toCodecOpenAI`): every
property lands in `required` and an optional one gains a `null` member, because strict mode has
no way to spell "may be absent". The **decode** side then validates against the _untransformed_
schema, which refuses `null` — so the two halves of one round trip disagree, and an endpoint that
compiles the published schema into a grammar (llama.cpp does) leaves the model no other way to say
"no filter". One `"source": null` kills the whole answer with `Expected "note" | "beat" |
"creature" | undefined, got null`, one round in, with no tool step ever drawn. Use
`toolkit.ts`'s `optional` helper — `Schema.optionalKey(Schema.NullOr(…))`, which publishes the
identical JSON schema and accepts what it asks for — and `absent()` at the handler.
`Schema.optional` on a `Tool.make` parameter is the thing to grep for.

**2. `HOB_MAX_TOKENS` covers reasoning tokens, and 1024 was not enough for a thinking model.**
That is the captain's report. A capable local 8B in 2026 is a reasoning model: it deliberates
before it calls anything, out of the same budget. Reasoning parts are dropped on purpose
(`toHobEvent` — a chain of thought is not an answer), so a model that spends the budget thinking
reached the panel as `began` … `done`: **an answer that never happened, reported as a finished
one.** Measured: a trivial question cost 120 reasoning tokens before its tool call, and two of six
ordinary questions used the whole 1024 without reaching one. On an endpoint that leaves `<think>`
in `content` rather than splitting it into `reasoning_content` — `llama-server
--reasoning-format none`, and `auto` resolves to that for a template it does not recognise — the
same run reads as **nothing but text deltas and no tool call, ever**, which is the report
verbatim. Whether thinking is split out is the endpoint's setting and not ours:
`--reasoning-format deepseek` puts it in `reasoning_content` (LM Studio's server already does),
and `--reasoning-budget N` caps it at the source. Raising `HOB_MAX_TOKENS` fixes both spellings;
the endpoint flags only change what the DM sees while it happens.

Both silences are now sentences: `truncated` and `silence` in `Hob.ts` turn a `length` finish and
an empty answer into `failed` events naming the knob, and a `length` round ends the loop rather
than spending three more calls re-truncating. `hob.test.ts` pins all four cases, and
`test/support/model.ts`'s `reasoningChunks` is the wire shape a reasoning model actually produces
(both spellings). **A `done` that follows nothing is the shape to distrust here** — the panel has
no other way to tell "it answered briefly" from "it never started".

### Running it locally, with and without a model

Without: change nothing. `pnpm -F server dev` boots, logs `Hob is OFF`, and the panel says so.

With, using llama.cpp (no GPU needed; a 3B model on CPU answers in ~4s end to end):

```
llama-server --jinja -m <model>.gguf --port 8080     # --jinja is required for tool calling
# apps/server/.env.local
HOB_API_URL=http://127.0.0.1:8080/v1
HOB_MODEL=qwen2.5-3b-instruct
```

Ollama (`:11434/v1`) and LM Studio (`:1234/v1`) are the same shape. **The model must support tool
calling** — Hob answers only from tool results, so one that cannot call a tool has nothing to say.
**A reasoning model additionally needs room to reason** — see the section above; `HOB_MAX_TOKENS`
is the number, and the panel now says so when it runs out rather than pretending it finished.

Measured against a real local Qwen2.5-3B over a seeded campaign, asking a question only the
record could answer: `searchCampaign` called at 1.5s, answered at 1.5s, first token at 2.8s,
finished at 4.2s, and the reply quoted the invented proper noun out of the DM's own note. 5/5
runs called the tool. In the browser the panel went _"Hob is checking the ledger…"_ → _"Searching
the record — ferryman…"_ → text growing in place. A question the record does not answer came back
_"There seems to be no recorded beats related to the crossing"_ rather than an invention, which is
the prompt's one non-negotiable instruction working.

Re-measured over the same model when the conversation and the accept path landed: two questions in
one thread, a page reload, and the whole evening read back from `hob.threads` + `.../turns`; then
_"Search the bestiary for Bullywug, then propose an encounter…"_ → `searchCampaign` → an
`proposeEncounter` whose roster came back resolved (`Bullywug Croaker`, `CR 1/4`, `11 hp`) → _Save
to session_ → a real `encounter` row with `creatureCount: 6`, `origin: "assistant"` and the
turn id on both it and its `encounter_creature` line. Five proposals were made across the
session and only the accepted ones became rows; a second accept was a 409.

**A small local model is the weak link, and it is worth knowing which part is weak.** The plumbing
is deterministic and tested; what varies is judgement. A 3B model narrowed to `source: "note"`
unprompted and missed a beat; it also called `proposeEncounter` with an **invented** creature id
before searching (refused with a `NotFound` it then read and recovered from), and twice tried to
propose a second thing in one turn (refused with the `Conflict`). Both refusals are the guardrails
working rather than defects — but note the second one can burn the round budget, so an answer can
end `failed` with a good proposal already made and emitted. That is a model-tier question (the
captain's `model-tier.md` defers it), not an architecture one. A **1B** model is below the floor
entirely: llama-3.2-1B emitted `proposeEncounter:` as prose and never made a tool call at all.

**Do not reach for "the model is the limit" second, though — reach for it last.** That conclusion
was drawn from a 1B, was right about the 1B, and was then wrong about everything after it: the
same symptom on an 8B was two defects of ours (see "Hob never calls a tool" above). The evidence
that tells them apart is the captured request body, and it costs one `tapRequest`.

**"Hob suggested something and there was no card to accept it with" is that same model-tier
symptom, and the row says so — check it before touching `apps/web/src/hob/`.** Re-measured against
LM Studio serving llama-3.2-1b-instruct: the panel drew
_`proposeEncounter "The Marsh Encounter: Swamp Stompers": A Bullywug mob on the prowl.`_ as
ordinary reply text, and the turn it was saved as has `proposal IS NULL` — there was no proposal to
draw a card from. It is not the endpoint dropping the tool schema either: posted straight to
`/v1/chat/completions` with one tool and `tool_choice: "auto"`, that model answers `tool_calls: []`
and invents an answer instead. So the diagnosis is one query —
`select who, proposal is null, left(body,60) from assistant_turn order by created_at desc` — and a
null `proposal` on a turn that reads like an offer means the model never called the tool. The
proposal → card → accept path itself is verified end to end in a real browser against a live
endpoint, and `conversation.test.tsx` pins it from both directions (the streamed `proposal` and a
read-back turn): a card is drawn because the turn **carries a proposal**, never because of who
spoke, which is why one recorded turn can become two rows.

**With no capable model on the machine, script a real endpoint rather than stubbing `HttpClient`.**
The offline route below is for the suite; to watch a _browser_ draw the card you need something
listening, and a short Node server answering `POST /v1/chat/completions` with the `toolCallChunks`
/ `textChunks` shapes from `test/support/model.ts` is enough — round 1 a `searchCampaign` call,
round 2 a `propose*` call, round 3 prose. Everything downstream of the provider is then real.
Count the assistant tool-call messages already in the prompt to know which round you are in: the
loop sends the whole history back each time (`MAX_ROUNDS`, above).

**Testing it offline: stub `HttpClient`, not the model.** `apps/server/test/support/model.ts`
scripts an OpenAI-compatible endpoint by answering `POST /chat/completions` with canned
`text/event-stream` chunks, which exercises the real provider layer, the real toolkit, the real
handlers and real Postgres — everything except the model's judgement. It records every request
body, which is the only way to see **what the assistant was actually shown**; that is how the
cross-campaign assertion is a measurement rather than an argument.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
