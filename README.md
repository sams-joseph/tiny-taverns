# taverns

A production-grade **boilerplate monorepo** for a web application, wired end-to-end and
ready to build on. It pairs a **Vite + React SPA** front end with an **Effect.ts** HTTP
backend, sharing config and a component library across a pnpm + Turborepo workspace.

## Stack

| Concern         | Choice                                                                                  |
| --------------- | --------------------------------------------------------------------------------------- |
| Package manager | [pnpm](https://pnpm.io) workspaces                                                      |
| Task runner     | [Turborepo](https://turborepo.dev)                                                      |
| Frontend        | [Vite](https://vite.dev) + [React](https://react.dev) 19 SPA (TypeScript, client-only)  |
| Backend         | [Effect](https://effect.website) v4 (beta) HTTP server + `@effect/platform-node`        |
| Language        | TypeScript (`strict`, ESM everywhere)                                                   |
| Styling         | [Tailwind](https://tailwindcss.com) v4 (`@theme`) bridged onto the design-system tokens |
| Components      | [shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com) primitives         |
| Lint / format   | ESLint (flat config) + Prettier                                                         |
| Tests           | [Vitest](https://vitest.dev) (+ React Testing Library)                                  |

## Layout

```
taverns/
  apps/
    web/                 Vite + React SPA (consumes @taverns/ui)
    server/              Effect.ts HTTP service (GET /health)
  packages/
    design-system/       @taverns/design-system — the delivered Tiny Taverns system.
                         tokens/ is the SINGLE SOURCE OF TRUTH for every design value.
    ui/                  @taverns/ui — the 14 shadcn components, on Base UI
    tsconfig/            @taverns/tsconfig — shared tsconfig bases
    eslint-config/       @taverns/eslint-config — shared flat ESLint config
  .repos/
    effect/              vendored upstream Effect source (read-only reference)
  turbo.json             build / lint / typecheck / test / dev pipelines
  pnpm-workspace.yaml
```

### `.repos/` — vendored reference source

`.repos/` holds read-only upstream source vendored for reference. It is **committed on
purpose** (not gitignored) so the exact source matching our installed dependency travels
with the repo. Nothing in it is built, linted, formatted, or installed: the
`pnpm-workspace.yaml` globs are root-anchored (`apps/*`, `packages/*`) so they do not
match `.repos/effect/packages/*`, and `.repos` is listed in `.prettierignore` and in the
shared ESLint `ignores`.

`.repos/effect` is the [Effect](https://github.com/Effect-TS/effect) repo at tag
`effect@4.0.0-beta.102`, added as a squashed subtree so the v4 beta source is available
locally (v4's published docs are thin — the source and its tests are the authoritative
reference). It is pinned to a tag, not a branch, so it stays in lockstep with the
`effect` version `apps/server` installs. To move it to a newer tag:

```bash
git subtree pull --squash -P .repos/effect https://github.com/Effect-TS/effect effect@<version>
```

Internal packages use the `@taverns/*` scope. `apps/web` really consumes `@taverns/ui`
(the component gallery in `App.tsx` renders every primitive, and its test drives them) and
`@taverns/design-system` (tokens, the Alegreya font files and the brand icons all resolve
through normal Vite imports), plus the shared `@taverns/tsconfig` and
`@taverns/eslint-config` packages — so the wiring is proven, not decorative.

## The design system

`packages/design-system` holds the delivered **Tiny Taverns** system: tokens, fonts, brand
assets, the 20 `guidelines/` specimen cards, and one `.prompt.md` + `.d.ts` + `.jsx` spec
per component. It is also installed as a Claude Code skill — `.claude/skills/tiny-taverns-design`
is a symlink to it, so there is only ever one copy.

**`tokens/*.css` is the single source of truth.** No hex, radius, duration or measurement is
restated anywhere else; `packages/ui/src/styles.css` gives those tokens Tailwind names by
`var()` reference only. The system is **dark only** — there is no light theme to build, and
no toggle.

`packages/ui` ships the 14 components as real shadcn/ui components on **Base UI** primitives
(no `@radix-ui/*` anywhere in the tree), styled to the delivered specs. The delivered `.jsx`
files are the _visual specification_, not code to ship — see
`packages/design-system/PORT-NOTES.md`.

Two adherence rules from the designers are enforced in ESLint
(`packages/eslint-config/design-system.js`): no raw hex colours or `px` literals in component
code, and no importing component internals. `packages/ui/src/adherence.test.ts` extends the
same checks to the CSS and asserts the structural guarantees (dark-only, Base-UI-only).

### The gallery

`apps/web` renders a **component gallery**: every component, in every variant and size, on
the surfaces it is meant to sit on, with the colour ramps, type scale, radii and elevation
alongside. It is how you check a change against `packages/design-system/guidelines/`.

```bash
pnpm --filter web dev   # http://localhost:5173
```

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

The server is structured idiomatically with **Effect v4** (currently in beta, pinned to
exact versions): `Health` is a `Context.Service` class exposing a `Health.layer`, routes are
`HttpRouter.add` layers that register a handler depending on that service, and `main.ts`
assembles them with `HttpRouter.serve` and runs on `@effect/platform-node`.

In v4 there is no `@effect/platform` package — the HTTP layer lives in core `effect` under
`effect/unstable/http`. `AGENTS.md` records the full v3 → v4 mapping, and `.repos/effect`
vendors the matching upstream source as the authoritative reference.

## Testing

Vitest runs in every workspace project. Each has at least one real, passing test:

- `apps/web` — React Testing Library tests that drive the gallery (tabs, dialog, toast,
  toggles).
- `apps/server` — an Effect-based test of the `Health` service and the `/health` handler,
  plus a production-start smoke test that runs the real build output under plain `node`.
- `packages/ui` — component tests, design-system adherence checks, and a guard that keeps
  the `tailwind-merge` config in step with the theme.

No Playwright E2E is included: for boilerplate the value did not justify the extra CI
weight. Add it later under `apps/web` if an end-to-end smoke test becomes useful.

## Continuous integration

`.github/workflows/ci.yml` installs pnpm + Node, runs `pnpm install --frozen-lockfile`,
then `pnpm turbo run lint typecheck test build`. The repo is local-only for now (no
remote configured); the workflow is ready for when one is added.
