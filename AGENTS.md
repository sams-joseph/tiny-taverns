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

**The server accepts TCP before it can answer, and a request that lands in that window is
never answered at all.** `NodeHttpServer.layer` calls `server.listen` while it is being
constructed, and `main.ts` provides it _to_ the application layer — so the socket is
listening before the connection pool is open and the migrations have run. Measured on an idle
machine: accepts at 481ms, request handler attached at 534ms. A request written on a
connection opened inside that gap is not answered late, it is dropped forever (held one open
for 30s against a server already logging "Listening" and serving fresh connections 200).

That is what made the smoke test flaky at roughly 1 run in 5 under `turbo --force`: database
work widens the window from tens of milliseconds to seconds, `fetch` has no response timeout,
and one unlucky retry hung until the 60s test budget expired — the 65s signature that got
blamed on the compile. Any client polling this server during boot needs a **bounded per-attempt
timeout and a fresh connection per retry**, which is what `ATTEMPT_TIMEOUT_MS` in the smoke
test is for. Raising an outer timeout does not help; the hung attempt never returns.

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
- **Visibility is two levels.** `campaign.visibility` is the master toggle; a row's own
  `visibility` narrows within it. A `shared` note inside an unshared campaign stays invisible.
- **Denial is `NotFound`, not `Forbidden`.** Saying "it exists but is not yours" is itself a
  disclosure.
- **A new table gets `visibility` (default `'dm'`), `origin` (default `'authored'`) and
  `assistant_turn_id`.** `apps/server/test/schema.test.ts` fails if one does not — the opt-out
  list is in that file, so skipping it takes a visible edit. Provenance is inert until the
  assistant ships; it is there because retrofitting it onto a table that already mixes
  authored and generated rows means guessing which is which.

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
