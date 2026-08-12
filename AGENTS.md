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
| `chrome`  | 10    | sticky page furniture (the app header). Not an overlay; must lose to the scrim.                                            |
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
consumed as source by another app's Vite, which resolves `@` to _its own_ `src`.

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
- **Ownership is not scope.** `Actor.campaignId` is the reach of the credential: `null` for an
  account-wide DM token, a campaign id for a credential minted for one table. `campaignInScope`
  in `visibility.ts` applies it, and both `campaignReadable` and `campaignWritable` compose it,
  so it is not keyed on the role. Every read reaches it — `rowReadable` and
  `ensureCampaignReadable` embed `campaignReadable` in an `exists` subquery rather than
  restating account ownership. **Do not write a new predicate that filters on `account_id`
  directly**: account ownership alone would let a credential scoped to one table read every
  `shared` campaign the same DM owns, which is a cross-table leak between two tables run by the
  same person. That is exactly the defect the scope closed, and it was invisible for as long as
  it was because no test minted a scoped actor.
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
  `assistant_turn_id`.** `apps/server/test/schema.test.ts` fails if one does not — the opt-out
  list is in that file, so skipping it takes a visible edit. Provenance is inert until the
  assistant ships; it is there because retrofitting it onto a table that already mixes
  authored and generated rows means guessing which is which.
- **`creature` is the one table whose rows may belong to no campaign** — the global `system`
  corpus — and it therefore has a predicate of its own, `corpusRowReadable`. Read the bestiary
  section below before writing anything that looks like it; the obvious spelling leaks.

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

The campaign view is the first screen built on the API, the runner is the second and the
bestiary is the third. Five things are settled by them; follow them rather than re-deriving
them.

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
  route and throws the reader back to the campaign list mid-scroll.
- **`Button` rendering an `<a>` needs `nativeButton={false}`.** Base UI warns and applies
  button-only semantics otherwise. That is how a route rendered as a button stays a real link.
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
- **The nav is the screens that exist, and it is a function of the route** — which is why it is
  shorter than the kit's. The kit draws four as of the third delivery (Campaign, Run, Bestiary,
  Chronicle); a screen earns its item when it is built, and _Run_ never does, because a fight is
  reached from the campaign that owns it and a top-level link could not know which. **_Bestiary_
  is there, but only once a campaign is**, because `creatures.list` hangs off one; `navFor(route)`
  adds it when the route names a campaign and omits it on the campaign list. `sectionOf` lights
  **Campaigns** for the campaign list, a campaign _and_ a run, and gives the bestiary its own
  underline — the underline says which part of the app you are in.
- **The campaign name is the only elastic thing in the bar, so it is the thing that truncates.**
  The right-hand group is `min-w-0`, not `shrink-0`. Without that the bar overflowed its own
  width at 760px and clipped _Ask Hob_ — invisible to every test, because the shell's
  `overflow-hidden` keeps the document from scrolling.

**The seam for the Hob chat panel is two props and nothing else** — `onAskHob?: () => void` (the
bar's button; with none passed it still renders, because it is the bar the designers drew) and
`panel?: ReactNode`, the last child of the row under the top nav. **That row _is_ `HobRegion`**,
class for class: `relative flex min-h-0 flex-1 overflow-hidden`. The shell and `hob/HobDock.tsx`
were built concurrently and arrived at the same element, so **`Hob` is passed bare and must never
be wrapped in a `HobRegion` here** — a second region inside this one is a second positioned
ancestor, and the overlay would size to it rather than to the content. `HobRegion` stays right
where there is no shell, which is what the gallery's specimens use. Keep the two class lists in
step; `overflow-hidden` is what stops an overlaid panel painting outside the row, and `min-h-0`
is what lets a panel that scrolls inside itself be shorter than its own content.

**The shell holds no chat state, no ⌘K handler and no breakpoint** — `useHobPanel` owns all three,
including `HOB_INLINE_MIN`. A screen composes it:
`const hob = useHobPanel({ initialOpen: false })`, then `onAskHob={hob.toggle}` and
`panel={<Hob hob={hob} />}`. **`initialOpen: false` is deliberate and is the shell's call to
make** (the hook's own doc says so): nothing answers yet, and a 400px panel that opens itself to
say so is worse than a button that opens it when asked. Mounted on the three product screens; the
gallery is left to its specimen, which owns a `useHobPanel` of its own — two on one page would
both answer the same ⌘K.

Measured in Chromium either side of the threshold, per screen: inline at 1440/1021/**1020** (the
query is `min-width: 1020px`) is `position: static` in flow, and the _content column_ shrinks by
the panel's 400px; at 1019/900 the panel is `absolute` at `z-dialog` and the scrim `absolute` at
`z-scrim` — different rungs, never one — with the scrim's box exactly the row's (`0, 56, vw×844`),
so it starts below the nav and `elementFromPoint` still returns the _Ask Hob_ button. That is the
property worth re-checking if either class list moves: **the overlay covers the content, not the
app.** `document.scrollWidth` stays equal to the viewport in every case.

`NavContext` is exported from the same file for the bar's right-hand pair, and takes an `href` for
the screen that is _inside_ a campaign — from a fight, the campaign's name is the way back to
prep, which is what the rail's footer used to be.

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
also why `read` requires `CurrentActor` at the type level from day one — the tool inherits the
actor rather than getting a path around it.

`Recap.ts` is the only place that imports another repository's row mapper: `toBeat`, `toNote`,
`toPrepItem`, `toSession`, `toCombatant`, `toEncounterRun` and the `BEATS`/`PREP` nested-table
constants are exported for it, so there is still exactly one mapper per table. (`BEATS` has a
second consumer now — `Search.ts` builds its containment from it — which is the same rule
holding rather than an exception to it.)

### Campaign search: the one path over this corpus, and what is deliberately not in it

`apps/server/src/repo/Search.ts` is **the only place in the product where a `tsvector` is
queried**, and `GET /campaigns/:campaignId/search` is its only HTTP surface. The assistant's
eventual `searchCampaign` tool is a `Tool.make` wrapper around `Search.search` — it writes no
SQL, declares no predicate and gets no privilege of its own. **Anything that needs a read this
repository does not expose is a new method here, never a query somewhere else**: two search paths
over one corpus would be permanent, and the second one is where the visibility seam gets
re-derived slightly wrong.

**What is indexed, and by what:**

| arm        | index                                              | read predicate                                        |
| ---------- | -------------------------------------------------- | ----------------------------------------------------- |
| `note`     | `0009` — `title` at weight A, `body` at B          | `rowReadable`                                         |
| `beat`     | `0009` — `body` at weight **B**, not the default D | the `beat → session` chain via `containedRowReadable` |
| `creature` | `0004` — name A, size/type B, `jsonb` body C       | `corpusRowReadable`                                   |

Beat body is weighted **B on purpose**: it is the same kind of thing as a note's body, and the
unweighted default would rank every beat at a quarter of an equally good note for no defensible
reason. One weighting scheme across all three arms is what makes `ts_rank` comparable enough to
order the whole union with one `ORDER BY` rather than concatenating three lists.

**`session_event` is deliberately NOT indexed, and this is a settled captain decision that
reversed the captain's own earlier line.** Do not add a fourth arm without reopening it. The
evidence: the log's text content is numbers (`jsonb_to_tsvector` over real payloads yields
`'12':3 '40':5 '82':1`); the only prose in any payload is `run-started.encounterName` and
`combatant-added.displayName`, both already real columns on `encounter_run` and `combatant`; and
indexing it would make `payload` load-bearing, which `SessionEvent.ts` states it is not. Combat
stays reachable by name, by recap, and by reading `GET …/log?since=`. Per-table columns mean a
fourth arm is about eight lines if a query shape ever appears that those three cannot serve.

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

## Hob: the chat surface is built, and nothing is behind it

`apps/web/src/hob/` is the designers' Option A —
`packages/design-system/ui_kits/dm-screen/ChatPanel.jsx` and `ChatParts.jsx`, built from the
shipped components. **The retrieval and model work is unstarted, and the module is written so
that stays visible rather than papered over.**

- **`conversation.ts` is the whole seam, and the only file that changes when something
  answers.** It exports `HobConversation` and one implementation, `useHobConversation`, which
  returns no turns and an **undefined `send`**. `HobPanel` reads that absence directly: no
  composer, and a plain line saying nothing is behind the panel. Every other handler
  (`save`, `discard`, `retry`) is optional the same way, and the card disables what it was not
  given. There is deliberately **no endpoint, no client method and no wire schema** — an
  assistant endpoint is an `HttpApiEndpoint` in `packages/api` like everything else, and a
  contract guessed from a panel would be the wrong one.
- **`transcript.ts` is the useful half of the handover.** `HobArtifact` is a discriminated
  union over the five card bodies the designers actually drew (encounter, read-aloud, npc,
  checklist, rules), so it states exactly what an answer has to return. The delivery's
  `KIND_META` names eight kinds; the four with no drawn body are absent on purpose. Provenance
  is already waiting on the schema side — `assistant_turn_id` and `origin` on every content
  table — so _Save to session_ is an ordinary authored write, not a new privilege.
- **`hob.fixtures.ts` is the delivered data, and the sample thread must not reach a screen.**
  The gallery's `#hob` section is the one place it renders. A panel that appears to hold a
  conversation the DM never had is the failure this area is most able to cause.
- **The mount is three names**: `useHobPanel()` (open state, `inline`, ⌘K/Esc), `HobRegion`
  (the `relative flex` row the overlay positions against — an overlay without one covers the
  page instead of the content), and `<Hob hob={…} />` as that region's last child. The gallery's
  "The mount, and the opener" specimen _is_ that composition, so it fails if the seam rots.
  **The shell owns the Ask Hob button**; nothing in `hob/` draws one.

**Inline above 1020px, overlay below** — `HOB_INLINE_MIN`, from the second delivery's
`CHAT_INLINE_MIN`, which fell from 1180 when the 260px rail became a 56px top bar. Measured in
Chromium against the running app: 1020 → inline, panel `static`, 400px wide, no scrim; 1019 →
`position: absolute`, `z-index: 110` over a scrim at `100`, and `elementFromPoint` over the
content returns the scrim. That last check is the point — it is the property the select-under-a-
dialog bug violated, and rendering above is not the same as _taking the click_. The panel takes
`z-dialog` and the scrim `z-scrim`; two rungs, never one.

Three things that cost time here:

- **A flex column that scrolls shrinks its children by default.** The thread is
  `flex flex-col overflow-auto`, and without `shrink-0` every artifact card collapsed to a
  sliver as soon as the thread was taller than the panel. Invisible to jsdom, obvious in a
  browser.
- **Do not auto-scroll an empty thread to the bottom.** The starter grid is taller than a short
  panel, so "scroll to the newest turn" opened on the last starter with the question scrolled
  off — the first thing a DM sees, already scrolled past.
- **`w-100` is the panel's 400px**, a Tailwind spacing step and not a token: the delivery does
  not tokenise it either, and `--aside-w` is the 340px inspector, a different measurement.

**Driving a browser here: never assume a debug port.** `--remote-debugging-port=9333` was
already bound by another agent's headless Chromium, and `/json/list` cheerfully returned _their_
page — a probe that reported a shell nobody in this worktree had written. Launch with
`--remote-debugging-port=0` and read the real port off the process's own
`DevTools listening on ws://127.0.0.1:<port>/` stderr line.

## The assistant: a trap to remember before it ships

Nothing here uses `@effect/ai-anthropic` today — the captain's decision is to target locally
hosted models first, through `@effect/ai-openai-compat`. Record it now because it fails
silently, and the day someone points this at hosted Claude is the day it costs an afternoon:

**At `4.0.0-beta.102`, `getModelCapabilities` recognises no model id past `claude-opus-4-8`**
(`.repos/effect/packages/ai/anthropic/src/AnthropicLanguageModel.ts:2972-3021`). The model
parameter is typed `(string & {}) | Model`, so `claude-opus-5` compiles and does not error. It
silently caps `max_tokens` at **4096** and routes structured output through a prompt-based JSON
tool instead of native structured outputs. Nothing warns; the first symptom is an answer cut off
mid-sentence.

Mitigation, regardless of provider: always pass `config: { max_tokens: … }` explicitly, and pin
a test on it. Related, also verified at this version: `@effect/ai-anthropic` ships **no**
embedding module (Anthropic has no embeddings API); `@effect/ai-openai` and
`@effect/ai-openai-compat` have `OpenAiEmbeddingModel`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
