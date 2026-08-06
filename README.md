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
    web/                 Vite + React SPA (consumes @taverns/ui and @taverns/api)
    server/              Effect.ts HTTP API over Postgres
      src/migrations/    forward-only numbered migrations
  packages/
    api/                 @taverns/api — the wire contract: schemas, errors, HttpApi.
                         The server implements it; the web client is derived from it.
    design-system/       @taverns/design-system — the delivered Tiny Taverns system.
                         tokens/ is the SINGLE SOURCE OF TRUTH for every design value.
    ui/                  @taverns/ui — the 14 shadcn components, on Base UI
    tsconfig/            @taverns/tsconfig — shared tsconfig bases
    eslint-config/       @taverns/eslint-config — shared flat ESLint config
  .repos/
    effect/              vendored upstream Effect source (read-only reference)
  compose.yaml           the local development database
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
- **Docker**, for the development database

## Getting started

```bash
pnpm install
pnpm db:up                      # Postgres on 127.0.0.1:5433, via compose.yaml
pnpm -F server token:issue Jo   # prints a DM bearer token, once
pnpm -F server bestiary:import  # loads the bundled bestiary (optional, idempotent)
pnpm dev                        # API on :3000, web on :5173
```

That is the whole setup, and it needs no Clerk account. Paste the token into the Server
panel's **Machine token** box to reach the authenticated endpoints.

### Optional: hosted sign-in

Sign-in through Clerk is opt-in — with neither variable set the app and the whole test
suite behave exactly as above, and a JWT-shaped credential is simply unknown.

```bash
# apps/web/.env.local — gitignored; see apps/web/.env.example
VITE_CLERK_PUBLISHABLE_KEY=pk_test_…      # Dashboard → API keys → Publishable key

# apps/server/.env.local — gitignored; see apps/server/.env.example
CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----…"  # Dashboard → API keys → JWT public key (PEM)
CLERK_TELEMETRY_DISABLED=1                   # the SDK phones home on dev instances otherwise
```

Both files are per-package, and neither is a Vite thing on the server side:
`apps/server/.env.local` is read by Node itself, through `--env-file-if-exists` in the
server's `dev`/`start` scripts. A `.env.local` at the repo root is read by nothing.

The server prints one line at boot saying whether hosted sign-in is **ON** or **OFF**. If
you set the key and it still says OFF, the file is in the wrong place or the variable is
misspelled — check that before suspecting the key.

Neither value is a secret: one identifies the frontend, the other only _verifies_ tokens.
**`CLERK_SECRET_KEY` is deliberately not used anywhere in this repo** — don't add it.

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
| `pnpm db:up`        | Start the development database          |
| `pnpm db:down`      | Stop it, keeping the data               |
| `pnpm db:reset`     | Stop it and throw the data away         |

Each maps to `turbo run <task>`; you can also target one package, e.g.
`pnpm turbo run test --filter web`.

## Running the apps

**Web (Vite SPA)** — starts on <http://localhost:5173>:

```bash
pnpm --filter web dev
```

**Server (Effect.ts)** — starts on <http://localhost:3000> (override with `PORT`). It runs
pending migrations on boot, so `pnpm db:up` has to have happened first:

```bash
pnpm --filter server dev
# then:
curl http://localhost:3000/health
# {"status":"ok","uptime":...}

TOKEN=...   # from `pnpm -F server token:issue`
curl -X POST http://localhost:3000/campaigns \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"The Reed Marches","playerCount":4}'
```

The API surface is `campaign`, `session`, `character`, `note`, `encounter`, `prep` and
`creature` CRUD, declared once in `packages/api` as an `HttpApi` and implemented in
`apps/server/src/handlers.ts`. Every
campaign-scoped group sits behind a bearer-token `Authorization` middleware that resolves
the request's actor; every repository read carries that actor as a type-level requirement
and filters in SQL. `AGENTS.md` records the contract each new endpoint has to follow.

The `Server` section of the web gallery calls the live API through the client derived from
that same declaration — paste a token there to see it list your campaigns.

**The bestiary is two corpora in one list.** A campaign's own creatures live under it;
`system` creatures are global, immutable and shared by every campaign, and the only thing
that writes them is `pnpm -F server bestiary:import` — a shell command rather than an
endpoint, because global content has no campaign to scope it to. A DM who wants to change
a system creature derives a copy instead:

```bash
curl -X POST "http://localhost:3000/campaigns/$CAMPAIGN/creatures/$CREATURE/derive" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Grask, Boss of the Reeds"}'
```

### Hosted sign-in (optional)

The server accepts a second kind of bearer credential: a session token from a hosted
identity provider, currently Clerk. **It is off unless you configure it**, and everything
above — `pnpm -F server dev`, `token:issue`, the whole test suite — works with it off. You
do not need a Clerk account to develop on this repository, and the tests never need one
ever (they sign tokens with a keypair they generate in-process).

To turn it on, set one variable in **`apps/server/.env.local`** — copy
`apps/server/.env.example`, which documents every variable the server reads:

```bash
# apps/server/.env.local (gitignored)
CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----…"   # Dashboard → API keys → Show JWT public key → PEM
CLERK_TELEMETRY_DISABLED=1                    # the SDK phones home on dev instances otherwise
```

Node reads that file directly — `--env-file-if-exists=.env.local`, in the server's `dev`,
`start`, `migrate` and `token:issue` scripts. Three things follow:

- **The path is exactly `apps/server/.env.local`.** It is not a Vite convention here; the
  root of the repo and `apps/web/.env.local` are both read by something else, or nothing.
- **A real environment variable still wins**, so `PORT=4000 pnpm -F server dev` overrides
  the file and a deployment needs no file at all.
- **`pnpm -F server test` deliberately loads no env file.** The suite has to say the same
  thing on your machine, on a colleague's and in CI, so it never picks up your key.

The server logs one line at boot — `Hosted sign-in is ON` or `Hosted sign-in is OFF` — so
a key set in the wrong file or under a mistyped name shows up immediately rather than as a
mysterious failed sign-in later. It never logs the key, or any part of it.

`CLERK_JWT_KEY` is a **public** key and not a secret: verification is the only thing it can
do. **`CLERK_SECRET_KEY` is not used by this server and must not be added to it** — tokens
are verified offline, so an attacker holding the whole environment still cannot mint a
session for anybody. Keeping it that way is a deliberate security property, not an
oversight.

Two consequences worth knowing before you configure it:

- The key is validated at boot. A PEM Clerk cannot use fails the server loudly with an
  explanatory message, rather than rejecting every sign-in as a bad signature later.
- `ALLOWED_ORIGINS` feeds both the CORS allowlist and the token's `azp` audience check, so
  a token minted for a front end that is not on that list is rejected. Setting
  `ALLOWED_ORIGINS` for a deployment therefore has to include the origin the browser app is
  actually served from.

Accounts are provisioned just-in-time: the first authenticated request from a person the
server has not seen creates their account. Signing in this way always creates a _new_
account — existing machine-token accounts are never linked to it, and their campaigns stay
reachable only with their token.

The server is structured idiomatically with **Effect v4** (currently in beta, pinned to
exact versions). In v4 there is no `@effect/platform` package — the HTTP layer lives in core
`effect` under `effect/unstable/http`. `AGENTS.md` records the full v3 → v4 mapping, and
`.repos/effect` vendors the matching upstream source as the authoritative reference.

## Testing

Vitest runs in every workspace project. Each has at least one real, passing test:

- `apps/web` — React Testing Library tests that drive the gallery (tabs, dialog, toast,
  toggles), plus tests of the derived API client as the browser bundles it.
- `apps/server` — migrations from empty to current, the visibility seam, a schema-adherence
  guard, the whole API through the derived client against a real in-process server, and a
  production-start smoke test that runs the real build output under plain `node`. Both
  credential kinds are covered, including hosted sign-in — offline, against a keypair the
  test generates, so the suite needs no vendor account and no network.
- `packages/api` — guards on the wire contract itself: every campaign-scoped endpoint is
  behind `Authorization`, every content schema carries visibility and provenance.
- `packages/ui` — component tests, design-system adherence checks, and a guard that keeps
  the `tailwind-merge` config in step with the theme.

**The server's database tests need `pnpm db:up`.** They run against a real Postgres — the
schema is Postgres dialect and a stand-in would not exercise it — and each test file creates
its own throwaway database. If the database is not running they fail with a message saying
so, rather than skipping: a silently-skipped database test is a green build that proves
nothing.

No Playwright E2E is included: for boilerplate the value did not justify the extra CI
weight. Add it later under `apps/web` if an end-to-end smoke test becomes useful.

## Continuous integration

`.github/workflows/ci.yml` installs pnpm + Node, runs `pnpm install --frozen-lockfile`,
then `pnpm turbo run lint typecheck test build`. The repo is local-only for now (no
remote configured); the workflow is ready for when one is added.
