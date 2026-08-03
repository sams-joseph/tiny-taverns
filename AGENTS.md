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

Known pre-existing, unrelated to the v4 migration: `pnpm -F server start` (`node dist/main.js`)
fails with `ERR_MODULE_NOT_FOUND`. The shared tsconfig uses `moduleResolution: "Bundler"`, so
relative imports are emitted without `.js` extensions, which Node's ESM loader rejects. `dev`
(tsx) and `build` are unaffected.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
