# Server: Effect v4, the wire contract, and its edges

This page covers `apps/server` and `packages/api` as a runtime: the Effect v4 idioms, module resolution, listener ordering, how the wire contract reaches its consumers, and the traps in pagination, authentication and environment loading. It is for anyone touching `app.ts`, `main.ts`, `Authorization.ts`, an `HttpApi` group or a package script. Database, migration and test-suite constraints (the eight-worker cap, the 60s budgets, the per-file database) are in [Data model](data-model.md); Hob's provider configuration is in [Hob](hob.md); the web side of the credential seam is in [Web data](web-data.md).

## Workspace pins that are constraints

- **Formatting is root-only Prettier** (`pnpm format` / `pnpm format:check`), not a turbo task. No package has a `format` script, so CI must name `format:check` as its own step. `.prettierignore` keeps `packages/design-system` and `.repos/` out of every pass.
- **`effect`, `@effect/platform-node` and `@effect/sql-pg` are pinned exactly at `4.0.0-beta.102`.** Betas are not semver-stable; do not loosen to caret ranges, and bump them together.
- **`.repos/effect` is committed on purpose** at that tag; v4's published docs are thin. Start with `.repos/effect/MIGRATION.md` and `migration/*.md`.
- **`pnpm-workspace.yaml` sets `msgpackr-extract: false` under `allowBuilds`.** `effect` v4 pulls `msgpackr` transitively; without the entry `pnpm install` exits 1 on the ignored build script.
- **Vite and Vitest stay aligned** (Vitest 3 with Vite 6 in `apps/web` and `packages/ui`); Vitest 2 pulls Vite 5 and the mix produces duplicate-`vite` type errors.
- **`@taverns/tsconfig` exposes each base through an `exports` map**, which is what lets esbuild resolve the nested `extends` chain without warnings. `packages/ui` ships TypeScript source (`exports` → `./src/index.ts`); `packages/api` is the one package that builds to `dist` (below).

## Effect v3 → v4

`@effect/platform` has no v4; its HTTP surface moved into core `effect` under `effect/unstable/*`, which may break in minor releases until it graduates to `effect/*`.

| v3                                        | v4                                                          |
| ----------------------------------------- | ----------------------------------------------------------- |
| `@effect/platform` (HTTP)                 | `effect/unstable/http` (package removed entirely)           |
| `Context.Tag(id)<Self, Shape>()`          | `Context.Service<Self, Shape>()(id)` (note the arg order)   |
| `Layer.succeed(Tag, Tag.of({...}))`       | `Layer.succeed(this, {...})` in a `static` on the class     |
| naming: `FooLive` / `Foo.Default`         | naming: `Foo.layer`                                         |
| `HttpRouter.empty.pipe(HttpRouter.get())` | `HttpRouter.add(method, path, handler)` → a `Layer`         |
| `HttpServer.serve(HttpMiddleware.logger)` | `HttpRouter.serve(routeLayer)`                              |
| `HttpServer.withLogAddress`               | built into `HttpRouter.serve` (`disableListenLog` opts out) |

Three shape changes that are easy to get wrong:

- **The router is a service, not a value.** Routes are `Layer`s that register against an `HttpRouter` service during construction, so they compose with `Layer.merge`, not a builder chain.
- **Route requirements travel as type-level markers.** `HttpRouter.add` puts a handler's requirements into `R` as `Request<"Requires", X>` (errors as `Request<"Error", E>`), and only `HttpRouter.serve` unwraps them. So `Layer.provide(...)` for handler and middleware services goes _outside_ `serve`; providing them to the route layer typechecks and fails at the call site. `app.ts`'s `applicationOver` is the worked example.
- **Use the curried layer constructors.** `Layer.succeed(Tag, value)` infers through `Types.NoInfer` and widens `{ status: "ok" }` to `string`. `Layer.succeed(this)({ … })` and `Layer.effect(this)(…)` keep the literal; every service in `apps/server/src` is written that way.

## Module resolution: who resolves the specifier at runtime

`vite.json` and `react-library.json` use `Bundler` (Vite bundles `apps/web`; `packages/ui` emits only `.d.ts`). `node.json` overrides the inherited `Bundler` with `NodeNext`, because `apps/server`'s `tsc` emit is executed by plain `node`.

`tsc` never rewrites relative specifiers, so under `Bundler` an extensionless `./Health` is emitted verbatim and Node rejects it with `ERR_MODULE_NOT_FOUND`. `NodeNext` makes the compiler enforce what Node requires: the `.js` extensions on relative imports in `apps/server/src` and `test` are correct on `.ts` files, because they name the emitted file.

**The build output must be smoke-tested under real `node`.** `dev` runs under `tsx` and `test` under Vitest, both tolerant of extensionless specifiers; `build` and `typecheck` never execute anything. `apps/server/test/start.smoke.test.ts` runs `tsc -p tsconfig.build.json` _inside the test_, spawns `dist/main.js` under `process.execPath` and asserts `GET /health`. Keep the `tsc` call in the test; handed to the pipeline, the guarantee becomes a claim about whatever `dist/` was on disk. The file carries its own 180s budget for the reason its doc block gives.

## The listener binds after the application

`NodeHttpServer.layer` calls `server.listen` while it is being constructed, and `Layer` builds dependencies before the layer itself, so the direction of the `Layer.provide` edge between listener and application _is_ the order the socket binds in.

The natural composition, `application.pipe(Layer.provide(listener))` with a bare listener, binds first and opens the pool and runs migrations after. Every connection accepted in between is never answered, because no `request` handler is attached yet. A readiness probe is exactly that client.

`main.ts` therefore names `services` as a dependency of the listener: `NodeHttpServer.layer(...).pipe(Layer.provide(services))`. `services` must be the exported layer object from `app.ts`, not a fresh `servicesOver(Database.layer)`: `Layer` memoises by identity within one build, which keeps this to one pool and one migration run. An early client now gets a retryable `ECONNREFUSED`, and a server pointed at an unreachable database never binds the port.

The residual gap, `HttpRouter.serve` building its router between `listen` and the handler attaching, is in-memory work v4 cannot move earlier. `start.smoke.test.ts` pins the ordering with a raw-socket test, which `fetch` cannot express; its `ATTEMPT_TIMEOUT_MS` retry stays because a bounded per-attempt timeout is correct client behaviour.

## `@taverns/api`: the wire contract and the dist coupling

`packages/api` holds every schema, error, the `Authorization` middleware declaration and `TavernsApi`. The server implements it and `apps/web` derives its client (`apps/web/src/api/client.ts`), so there is no codegen and no second description of the wire to drift.

It is the one workspace package whose `exports` map names `dist/`, because plain `node` cannot load `.ts` out of `node_modules`. `turbo.json`'s `dependsOn: ["^build"]` applies to `turbo run`, not to `pnpm -F server test`, which runs against whatever `dist` is on disk. **Both failure modes blame innocent code:** an absent `dist` at least says `Failed to resolve entry for package "@taverns/api"`; a **stale** one hands back `undefined` for every export added since, so the server suite fails to collect with `TypeError: Cannot read properties of undefined (reading 'ast')` inside `SchemaAST`, pointing at whichever `Schema.Struct` named the missing export, and `typecheck` reports one `TS2307` followed by dozens of consequent errors in untouched files.

So `build`, `typecheck` and `test` in `apps/server/package.json` and `apps/web/package.json` open with `turbo run build --filter=<package>^... &&`. `^...` selects the package's own declared dependencies, the same statement `turbo.json` makes, and a cache hit restores the correct `dist` over a stale one. `lint` and `dev` are deliberately out (`dev` is the one task `turbo.json` declares no `^build` for), so `pnpm -F server dev` on a fresh clone still needs a build first.

`packages/api/src/dist.test.ts` sweeps the workspace for every consumer of `@taverns/api`, fails if one of those scripts drops the clause, and asserts the exports map names `dist` and nothing else. If that ever points at `src`, the coupling is gone and the guard should be reconsidered rather than kept.

## Five `HttpApi` traps

- **`HttpApiSecurity.bearer` answers no 401 of its own.** A missing or malformed header does not short-circuit: `HttpApiBuilder` hands the middleware `Redacted.make("")` and runs it anyway. The 401 for an absent credential is the explicit zero-length check at the top of `AuthorizationLive`'s `bearer` handler in `Authorization.ts`. Any middleware on a secured group must reject the empty credential itself; the tests pass either way, so nothing catches the omission.
- **Middleware and handler requirements are provided outside `HttpRouter.serve`** (the marker rule above).
- **`HttpApiEndpoint.delete`, not `.del`**: `del` is the internal name.
- **The derived client takes `params`, not `path`**, for path parameters.
- **`HttpClient` attaches `b3` and `traceparent` to every request**, so even a cross-origin `GET /health` is preflighted. `app.ts`'s CORS `allowedHeaders` lists both; without them the browser blocks the call after a successful preflight and the server log shows only the `OPTIONS`.

## `Context.Reference` memoises its default on first read

- **`FetchHttpClient.Fetch`** defaults to `() => globalThis.fetch`, so whichever `fetch` is installed when the first request runs serves every later one. A per-test `vi.stubGlobal("fetch", …)` keeps answering the first test's responses with no error. Install one stable dispatcher per file (`apps/web/src/api/client.test.ts`).
- **`ConfigProvider.ConfigProvider`** defaults to `fromEnv()`, which _copies_ `process.env` when constructed, so the first config read freezes the environment for the process. **Writing `process.env` in a test does nothing, silently.** Provide one explicitly and outermost, so it covers layer construction: `Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env }))`, as `apps/server/test/identity-disabled.test.ts` does.

## Pagination and array-valued query parameters

**A URL cannot tell a scalar from a one-element list.** `UrlParams.toRecord` folds a repeated key into `string | NonEmptyArray<string>`, so one occurrence arrives as a scalar and two as an array, and a bare `Schema.Array` in a `query:` position refuses the common case (`?environments=Cave` → `400 Expected array | undefined, got "Cave"`). The client is right to emit one occurrence for a one-element array, so the schema is the only place to reconcile them: `packages/api/src/Query.ts`'s `queryArray`, which **every array-valued query parameter goes through**; `Query.test.ts` sweeps every declared endpoint for a bare `Schema.Array`. Its encode side is the identity, so an empty array is an absent parameter.

**Keyset, not offset, and it is a `where` clause.** `packages/api/src/Page.ts` is the wire shape and `apps/server/src/repo/paging.ts` the SQL. The argument is not speed: the keyset is one more clause in the same `sql.and([...])` as the visibility predicate, so the database narrows before it counts; narrowing afterwards is the handler post-filter leak one step on. `apps/server/test/paging.test.ts` walks a mixed corpus as a player and asserts full pages.

The rules, all stated in `Page.ts`:

- A page is `{ items, nextCursor }`, `nextCursor` null on the last page, answered by fetching one row more than returned. **There is no total count.**
- The cursor decides the ordering: it carries the one it was minted for, parametrised on the list's own literal, so an unknown ordering is a 400 from the schema.
- Filters are the caller's to resend; a cursor is a position, not a saved query.
- **Every ordering ends in the row's id**, because no natural key is unique. A `timestamptz` ordering is truncated to milliseconds on both sides (`timeColumn`): the driver hands the column back as a `Date`, and a cursor compared against the full-precision column silently skips rows.

Paged: the corpus lists plus notes, encounters and beats (`createdPageOf`). Lists bounded by what they hang off (combatants, members, a checklist) and `search` (a ranking with a `limit`) are deliberately not.

## Authentication: two credential kinds, one seam

A bearer token is either a machine token (`token:issue`, SHA-256 into `account.token_hash`) or a hosted session token (currently Clerk). They converge on one `Actor` in `Authorization.ts`, and nothing below that line knows there are two kinds. What an actor is belongs to [Visibility](visibility.md).

- **Classification is total.** A JWS compact serialization is exactly three dot-separated segments and a machine token is base64url, which contains no dot, so `credential.split(".").length === 3` cannot misfile one. Two `HttpApiSecurity.bearer` schemes would emit duplicate OpenAPI schemes and report the last one's error for every failure.
- **The vendor is confined to `ClerkIdentityProvider.ts`**, and `IdentityProvider` names no vendor: it verifies a credential into a local `VerifiedIdentity`; `Accounts` provisions, `Authorization` authorizes. `apps/server/test/seam.test.ts` fails on a `@clerk/*` import anywhere else. It is also the only shape that compiles: `@clerk/shared` is transitive under pnpm's isolated layout, so a vendor type in an exported signature is TS2742.
- **`CLERK_JWT_KEY` is optional and is a public key.** Unset means `IdentityProvider.disabled`: the server boots, the suite passes, a JWT-shaped credential is simply unknown (`identity-disabled.test.ts`). **`CLERK_SECRET_KEY` is deliberately absent**; tokens are verified offline with `verifyToken`, never `authenticateRequest`, which needs a publishable key and models a cookie handshake this API never has.

Four SDK traps:

- `@clerk/react` not `@clerk/clerk-react`, `@clerk/shared/types` not `@clerk/types`. The old names install cleanly and are deprecated.
- The PEM→JWK conversion is cached by `kid`, module-level, forever; on a hit the PEM you passed is ignored, and a token with no `kid` caches under `local-undefined`. `test/support/identity.ts` mints one `kid` per keypair.
- That conversion is string surgery on a 2048-bit RSA SPKI PEM; any other key yields a wrong JWK and every token fails as "invalid signature", which reads like an attack. The layer validates the key size at boot; keep that.
- Passing `authorizedParties` makes `azp` mandatory. It is fed from `ALLOWED_ORIGINS`, the same list CORS uses, so allowlist and audience cannot drift.

**Provisioning is just-in-time and there is no deletion path.** An unrecognised subject gets an account on first request (`insert … on conflict do nothing` plus a re-read, which settles two tabs racing); machine accounts are never linked to a Clerk sign-in. Nothing may wire an external event to `delete from account`: `campaign.account_id` cascades, so a replayed webhook would erase a creator's history. `DEFAULT_ACCOUNT_NAME` is `"Someone"`, because the first authenticated request is as often a player following an invitation as a creator.

## Env files: two apps, two loaders

`.env.local` is a Vite convention; `apps/web` reads it for free and `apps/server` is not a Vite app. Always name the package when writing about the file.

- The server loads it through Node's flag, `--env-file-if-exists=.env.local`, in `apps/server/package.json`'s `dev`, `start`, `migrate`, `token:issue` and import scripts. No `dotenv`, no loader in `src/`. Under `tsx` the flag goes **after** the subcommand; before it, Node tries to import a file called `watch`.
- The `if-exists` form is required: every variable is optional (`Config.ts` carries the defaults) and a fresh clone with no file must boot. Plain `--env-file` exits non-zero on a missing file.
- **The `test` script loads nothing**, and `apps/server/test/env-file.test.ts` fails if that changes. A suite that picks up a developer's real key says something different locally than in CI.
- A real environment variable beats the file (Node does not overwrite existing `process.env` entries). Double-quoted values keep newlines, which is how a PEM fits.
- **The boot line must stay.** `identityFromConfig` in `app.ts` logs `Hosted sign-in is ON` or `OFF` on every start, names the file to set when off, and never prints key material (not a prefix, not a length). `env-file.test.ts` asserts all three. `assistantFromConfig` follows the same pattern for Hob.
