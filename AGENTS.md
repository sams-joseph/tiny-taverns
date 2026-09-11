# Tiny Taverns

Tiny Taverns is a table tool for 5e (2014 SRD) play. A creator preps a campaign, runs the night live, and keeps the record; players hold their own characters and see what the table shares; Hob, the assistant, answers only from that record and proposes things a person then accepts. Campaigns can connect to a Shared World whose Chronicle outlives any one table.

The workspace is pnpm + Turborepo: an Effect v4 HTTP server over Postgres, a Vite + React SPA, one `HttpApi` contract package the client is derived from, and a delivered design system bridged into Tailwind. `README.md` has the layout, commands and setup; start there.

## What we never compromise on

### 1. Visibility lives in SQL, and denial is `NotFound`

Every read carries the actor as a type-level requirement and filters in `apps/server/src/repo/visibility.ts`. A handler that post-filters is the leak pattern. Saying "it exists but is not yours" is itself a disclosure. When a player's view of something differs from the creator's, it is a distinct schema on a distinct path, never a field filter over the wide type. Player-visible narrowing is computed in SQL and the wide columns are not selected.

### 2. Nothing enters the record unless a person put it there

The product retains detail rather than summarising at write time. Hob proposes; only an accept writes, through the same statements an authored row uses, stamped `origin = 'assistant'` with the turn it came from. No create payload carries `origin`. Live state is written straight through to Postgres in one transaction; there is no in-memory copy and no cache.

### 3. The design system is delivered, read-only, and the tokens are the only source of truth

`packages/design-system` is copied from the designers byte for byte with named exceptions. No hex, radius, duration or measurement is restated anywhere; components reach for the semantic token, not the ramp step. Dark only. Every z-index comes from one scale.

### 4. Absent beats stubbed

Do not render a field the API does not have, invent a control the wire cannot carry, or backfill a column with a guess. When a drawing or a plan asks for something the data cannot supply, report it and leave it out.

## How we work

Measure, do not reason: this project has repeatedly been wrong about a symptom until somebody looked at the wire, the request body or the rendered pixel. jsdom computes no layout, no stacking and no motion, so a real browser is the only place those are visible. Check the same commit twice under different load before believing a flaky test is yours.

When a decision changes, rewrite what it superseded; do not append a second account beside it. Gate first, project later: a boundary that waits for the screen behind it is not a boundary.

## Glossary

Use these words when you talk to us. The full list, with file links, is `docs/internals/glossary.md`.

- **maintainer** means the person building this. Older records call them "the captain".
- **creator** means the account that made a campaign and is its sole DM. **player** means any other member. Neither is a role column; both are facts about a pair.
- **campaign** is a table. Every campaign has a hidden **backing context**; a **Shared World** is the explicit kind several campaigns connect to. Public words are `SharedWorld*`, `worldId`; persistence keeps `group_*`.
- **seat** is a character's membership of a party (`campaign_character`). A **character** is account-owned and top-level.
- **bundle** is the imported system corpus, owned by nobody. **Library** is an account's originals. An **instance** is the one campaign copy the product mints, inside a roster add.
- **night** is a session; **fight** is an `encounter_run`; the **doorbell** is the contentless fan-out clients re-read on.
- **Hob** is the assistant; a **proposal** is something it offered that is not yet a row; a **toolkit** is what one kind of caller's model is shown.

## The ways to hurt yourself

1. **Writing to the read-only trees.** `packages/design-system` and `.repos/` are vendored. A delivery's `rsync --delete` restores whatever you changed and deletes the three icon files that are ours, which breaks the build. Local design values go in `packages/ui/src/local-tokens.css`.
2. **Trusting a green build over the database.** Server tests fail loudly without `pnpm db:up`; never make them skip. Migrations are forward-only, and a migration numbered below the highest applied is skipped silently. `pnpm -F server db:reset:fresh -- --force` is the product's one destructive command; the server never runs DDL beyond the ledger.
3. **A stale `packages/api/dist`.** It is the one package that builds to `dist`, and a stale one hands consumers `undefined` for every newer export. The symptom is a `TypeError` inside `SchemaAST` or a cascade of `TS2307`s in innocent files. The package scripts open with a turbo build of their own dependencies; do not remove that clause.
4. **Silent Tailwind.** A utility whose theme name does not exist emits no rule, fails nothing, and the element inherits body colour. A class that appears in no source file is never emitted, so a probe class injected at runtime measures nothing.
5. **Killing by pattern.** This machine runs other agents' servers and browsers. Kill only PIDs you captured at spawn. Launch Chromium with `--remote-debugging-port=0` and read the port off its stderr; a fixed port may be somebody else's.

## Hit every surface

The commonest defect here is a change that works on the path you tested and is missing everywhere else. Before calling work done, say which of these applied:

- **Contract.** Anything on the wire is declared in `packages/api`. The server implements it and the web client is derived from it; change the schema and both follow. Array-valued query params go through `queryArray`.
- **Projections.** Creator and player. If you widened what a creator reads, ask what the player path answers now.
- **Composers.** A character can be made by the form and by Hob; both call `sheetGrantsFor` and `seedFor` so they cannot disagree. A new grant goes in the shared function, not in one caller.
- **Toolkits.** Creator, player drafting, Shared World, NPC. A tool added to one is a decision about the other three.
- **Reads and writes.** A read atom names the keys it answers; a write names the keys it changed, including what moved that it never sent (a computed count on another card).
- **Reverse states.** Archive needs restore; share needs unshare; connect needs disconnect. One-way doors are bugs.
- **Docs.** If the change makes `docs/internals/` inaccurate, rewrite the affected text.

## Running and verifying

- `pnpm db:up`, then `pnpm dev`. Imports run in the order `README.md` gives; a fresh database needs them all. The server logs one line per optional subsystem at boot (hosted sign-in, Hob) saying ON or OFF; believe the line, not the env file.
- A machine token from `pnpm -F server token:issue` pasted into the gallery's Server panel is the credential a build without Clerk has. Hosted sign-in and Hob are opt-in; unset is a supported mode for both and the suite runs with both off.
- Smallest proof that the change works: `vitest run <file>` in the package you touched, plus `typecheck` for that package. CI runs `turbo run lint typecheck test build` and `pnpm format:check` (root Prettier is not a turbo task).
- The server suite needs Postgres, is capped at eight workers, and each file owns a database. Both suites carry a 60s test budget because they are load-sensitive; a timeout under load is not the same failure as a pool refusal.
- Backend behaviour changes ship with a focused test. Boundary changes get a test that drives the refused path with a real actor minted the shipped way (`test/support/actors.ts`), not raw SQL.
- Ask before driving a browser or computer use. When you do, assert on computed values (`getComputedStyle`, `elementFromPoint`, then click and check the value changed), not screenshots.

## Documentation

Most code changes need no documentation change. Agents can read the code.

- `docs/internals/` holds architectural decisions and their reasons, constraints that span packages, and traps that are hard to discover from the source. Before adding a paragraph, ask what a maintainer would get wrong without it. If reading the relevant file answers the question, leave it out.
- Do not narrate what a screen draws, enumerate fields or endpoints, keep measurement logs, or append dated entries. Types, tests and code record the implementation. A decision that changed is rewritten in place; a superseded section is deleted, not annotated.
- Keep a local explanation in a code comment next to the code. Use an internal page only when the reasoning crosses a boundary or needs context the code cannot carry.
- This file is for what almost every session needs. It is not a diary and it does not grow with each feature.

## Plans and work artifacts

Do not commit implementation plans, research notes or agent scratch files; keep them outside the worktree. Decision records for larger pieces of work live in the maintainer's `firstmate` data directory and are pointed at from the internal page they informed. A merged PR is the implementation record.

## Pull requests

Never open one unless asked. Titles are short and imperative, matching the history (`Add Shared World Story So Far`). The body says the problem, then the fix, then what was verified and how. One concern per PR.

## How it works

The web client sends requests through a client derived from `TavernsApi`. `Authorization` resolves one actor per request from either a machine token or a hosted session token. Handlers call repository methods that require `CurrentActor` and filter in SQL. Live play writes through to Postgres and rings a contentless doorbell; clients re-read through the ordinary API. Hob is a tool loop over those same repository methods with a proposal column between it and the record. Full vocabulary: `docs/internals/glossary.md`.

## Where code lives

- `apps/server`: Effect v4 server. `repo/` is every read and write, `repo/visibility.ts` the seam, `assistant/` Hob and the NPC agent, `live/` the doorbell, `migrations/` the forward-only ledger, `bin/` the import commands. Read `.repos/effect/MIGRATION.md` before writing Effect code; v4's published docs are thin and the vendored tree is the reference.
- `apps/web`: Vite + React. `api/` is the atom client and the key vocabulary, `shell/` the two nav rows, one directory per screen family, `test/` the route harness.
- `packages/api`: the wire contract and the small pure helpers both sides share (`SheetGrants`, `Ruleset`, `Gear`, `Page`, `Query`). Builds to `dist`.
- `packages/ui`: shadcn components on Base UI, the Tailwind bridge, the layering scale, the local tokens, and the adherence tests.
- `packages/design-system`: the delivery. Read-only. Also installed as the `tiny-taverns-design` skill.
- `.repos/`: vendored read-only references pinned to the installed versions.
- `docs/internals/`: the pages this file points at: `visibility`, `shared-worlds`, `data-model`, `characters`, `corpora`, `live-session`, `hob`, `server`, `web-data`, `web-screens`, `design-system`.

## Taste

- One implementation of a rule. Two composers, two screens or two predicates that must agree share a file, not a habit.
- Structural over remembered: a constraint the schema refuses, a grep a test performs, a type that does not compile. A rule that has to be remembered gets a test that remembers it.
- Provenance is a pointer, never an access path. Nothing is read through `derived_from`, `continued_from` or `equipmentId` to grant reach.
- Optional keys are omitted, not sent as `undefined`; a required argument beats a default nobody names.
- If a rule here fights the task, say so and get a decision before breaking it.
