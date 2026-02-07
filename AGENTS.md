# Agent Guide for tiny-taverns

# This file orients coding agents to project conventions and commands.

## Repository overview

- Monorepo managed by Turborepo and pnpm workspaces.
- Apps live in `apps/*` and packages in `packages/*`.
- TypeScript everywhere, ES modules, strict type checking.
- Backend uses Effect, @effect/platform, and @effect/sql.

## Tooling essentials

- Package manager: `pnpm@9` (see root `package.json`).
- Runtime: Node.js >= 18.
- Task runner: `turbo` (via `pnpm` or `npx turbo`).
- Formatting: Prettier (root script).
- Linting: ESLint with shared config in `packages/eslint-config`.

## Build commands

- Build all: `pnpm build`
- Build a single package/app: `pnpm --filter <package> build`
- Build via turbo filter: `pnpm turbo run build --filter <package>`
- API app build (no-op runner): `pnpm --filter @repo/api build`
- Domain build: `pnpm --filter @repo/domain build`
- Adapter Postgres build: `pnpm --filter @repo/adapter-postgres build`

## Dev commands

- Dev all (turbo persistent): `pnpm dev`
- Dev API: `pnpm --filter @repo/api dev`
- Dev Domain (tsc watch): `pnpm --filter @repo/domain dev`
- Dev Adapter Postgres: `pnpm --filter @repo/adapter-postgres dev`

## Lint and format

- Lint all: `pnpm lint`
- Lint a single package/app: `pnpm --filter <package> lint`
- Format: `pnpm format`

## Type checking

- Check types all: `pnpm check-types`
- Check types per package/app: `pnpm --filter <package> check-types`

## Test commands

- There is no configured test runner yet.
- `apps/api/package.json` has a placeholder `test` script that exits 1.

## Single test guidance

- If a test runner is added later, prefer:
  - `pnpm --filter <package> test -- <pattern>`
  - `pnpm --filter <package> test -- -t <test name>`
- For now, treat tests as unavailable and update this file when added.

## Database commands

- Run migrations: `pnpm db:migrate`
- Reset database: `pnpm db:reset`
- Docker Postgres: `docker compose up -d` (see `docker-compose.yaml`)

## Environment setup

- Base env sample: `.env.example`
- Root `.env` is expected for dev tasks.
- `DATABASE_URL` is required for Postgres client.

## TypeScript configuration

- Base config: `packages/typescript-config/base.json`.
- `module` and `moduleResolution`: `NodeNext`.
- `strict: true` and `noUncheckedIndexedAccess: true`.
- `isolatedModules: true` for TS/ESM correctness.

## ESLint configuration

- Shared config in `packages/eslint-config`.
- Uses `eslint-config-prettier` to avoid format conflicts.
- `eslint-plugin-turbo` warns on undeclared env vars.
- `eslint-plugin-only-warn` is enabled (lint failures are warnings).

## Code style guidelines

### Imports

- Use ESM `import`/`export` only.
- Prefer absolute package imports (e.g. `@repo/domain/...`).
- Use explicit `.js` extension when importing local files from TS (NodeNext).
- Keep imports grouped by origin:
  - External packages
  - Internal workspace packages
  - Relative local modules

### Formatting

- Prettier is the source of truth; do not hand-align.
- Keep line length reasonable; let Prettier wrap.
- Use trailing commas where Prettier inserts them.

### Types and schemas

- Prefer Effect Schema types (`Schema.Class`, `Schema.Struct`).
- Use branded identifiers for ids (`Schema.brand`).
- Define API payloads with explicit schemas.
- Avoid `any`; use `unknown` and decode with schemas.

### Naming conventions

- PascalCase for classes, schemas, and Effect services.
- camelCase for variables and functions.
- `*Api` for API definitions, `*Repository` for data access.
- Use `Default` static layer naming for Effect services.

### Effect usage

- Prefer `Effect.gen` for effectful flows.
- Use `Layer.provide` and `Layer.launch` to wire services.
- Keep repositories pure; use `SqlSchema` for queries.
- Use `Effect.orDie` at boundaries where failures are unrecoverable.

### Error handling

- Use tagged errors for domain errors (`Schema.TaggedError`).
- For HTTP endpoints, declare errors on endpoints explicitly.
- Avoid throwing; return typed errors via Effect.
- Log at the edge (e.g. server startup, CLI scripts).

### Database

- SQL lives in migrations or `SqlSchema` constructs.
- Use camelCase in code; Postgres client maps to snake_case.
- Keep migrations idempotent when possible (`IF NOT EXISTS`).

### API patterns

- Define routes via `HttpApiGroup` + `HttpApiEndpoint`.
- Group handlers in `apps/api/src/Api.ts` using `HttpApiBuilder.group`.
- Use `DomainApi` as the root API with grouped endpoints.

### File organization

- App server entry: `apps/api/src/server.ts`.
- Domain API and schema types: `packages/domain/src/*`.
- Adapter Postgres client and migrations: `packages/adapter-postgres/src/*`.

## Cursor/Copilot rules

- No Cursor rules found (.cursor/rules or .cursorrules absent).
- No Copilot rules found (.github/copilot-instructions.md absent).

## Agent workflow tips

- Prefer small, focused edits; avoid sweeping refactors.
- Update schema types in domain package when API changes.
- Keep SQL formatting readable; do not minify.
- Ensure `.env` is not committed; use `.env.example` for docs.

## When adding tests (future)

- Add a workspace-level test runner and update scripts.
- Add a single-test command in this file once known.
- Align test naming with package names for filters.
