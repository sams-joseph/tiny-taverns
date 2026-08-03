# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Layout, commands, and how to run each app are documented in `README.md` — start there.
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
across, what was left out, and the two values added during the port (`--scrim-blur`,
`--fs-label-l` — both transcribed from prose the designers never tokenised).

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

Literal types need help: `Layer.succeed` infers through `Types.NoInfer`, so a service
returning `{ status: "ok" }` widens `status` to `string` unless the producing function is
annotated (see `Effect.sync((): HealthStatus => ...)` in `apps/server/src/Health.ts`).

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
restores the blind spot.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
