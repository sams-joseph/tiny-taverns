# taverns

A production-grade **boilerplate monorepo** for a web application, wired end-to-end and
ready to build on. It pairs a **Vite + React SPA** front end with an **Effect.ts** HTTP
backend, sharing config and a component library across a pnpm + Turborepo workspace.

## Stack

| Concern         | Choice                                                                                 |
| --------------- | -------------------------------------------------------------------------------------- |
| Package manager | [pnpm](https://pnpm.io) workspaces                                                     |
| Task runner     | [Turborepo](https://turborepo.dev)                                                     |
| Frontend        | [Vite](https://vite.dev) + [React](https://react.dev) 19 SPA (TypeScript, client-only) |
| Backend         | [Effect](https://effect.website) + `@effect/platform` HTTP server                      |
| Language        | TypeScript (`strict`, ESM everywhere)                                                  |
| Lint / format   | ESLint (flat config) + Prettier                                                        |
| Tests           | [Vitest](https://vitest.dev) (+ React Testing Library)                                 |

## Layout

```
taverns/
  apps/
    web/                 Vite + React SPA (consumes @taverns/ui)
    server/              Effect.ts HTTP service (GET /health)
  packages/
    ui/                  @taverns/ui — shared React component library (Button)
    tsconfig/            @taverns/tsconfig — shared tsconfig bases
    eslint-config/       @taverns/eslint-config — shared flat ESLint config
  turbo.json             build / lint / typecheck / test / dev pipelines
  pnpm-workspace.yaml
```

Internal packages use the `@taverns/*` scope. `apps/web` really consumes `@taverns/ui`
(the `Button` is rendered in `App.tsx` and exercised in its test) plus the shared
`@taverns/tsconfig` and `@taverns/eslint-config` packages, so the wiring is proven, not
decorative.

## Prerequisites

- **Node** >= 20 (developed on Node 26)
- **pnpm** (version is pinned via the root `package.json` `packageManager` field; run
  `corepack enable` to have the right version selected automatically)

## Getting started

```bash
pnpm install
```

## Workspace commands

Run from the repo root; Turborepo fans each task out across the workspace (respecting
build order) and caches results.

| Command             | What it does                            |
| ------------------- | --------------------------------------- |
| `pnpm dev`          | Run every app's dev server (persistent) |
| `pnpm build`        | Build all apps and packages             |
| `pnpm lint`         | ESLint across the workspace             |
| `pnpm typecheck`    | `tsc --noEmit` across the workspace     |
| `pnpm test`         | Vitest across the workspace             |
| `pnpm format`       | Format the repo with Prettier           |
| `pnpm format:check` | Verify formatting (used in CI)          |

Each maps to `turbo run <task>`; you can also target one package, e.g.
`pnpm turbo run test --filter web`.

## Running the apps

**Web (Vite SPA)** — starts on <http://localhost:5173>:

```bash
pnpm --filter web dev
```

**Server (Effect.ts)** — starts on <http://localhost:3000> (override with `PORT`):

```bash
pnpm --filter server dev
# then:
curl http://localhost:3000/health
# {"status":"ok","uptime":...}
```

The server is structured idiomatically with Effect: `Health` is a `Context.Tag` service
with a `HealthLive` layer, routes are `HttpRouter` handlers that depend on that service,
and `main.ts` assembles the layers and serves them via `@effect/platform-node`.

## Testing

Vitest runs in every workspace project. Each has at least one real, passing test:

- `apps/web` — a React Testing Library test of `App` (clicks the shared `Button`).
- `apps/server` — an Effect-based test of the `Health` service and the `/health` handler.
- `packages/ui` — a component test of `Button`.

No Playwright E2E is included: for boilerplate the value did not justify the extra CI
weight. Add it later under `apps/web` if an end-to-end smoke test becomes useful.

## Continuous integration

`.github/workflows/ci.yml` installs pnpm + Node, runs `pnpm install --frozen-lockfile`,
then `pnpm turbo run lint typecheck test build`. The repo is local-only for now (no
remote configured); the workflow is ready for when one is added.
