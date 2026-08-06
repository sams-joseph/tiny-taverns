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

The campaign view is the first screen built on the API, and the bestiary and the runner come
next. Five things are settled by it; follow them rather than re-deriving them.

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
- **Do not render a field the API does not have.** The encounter card shows no creature count
  and no "on the table now", because `Encounter.ts` says both arrive with later steps; a
  stubbed `0` is a worse lie than an absent line. Where a fixture field has no column, find
  the honest equivalent already on the wire — the card shows how many notes hang off the
  encounter instead.
- **Layout that depends on a column's width uses a container query, not a breakpoint.** The
  encounter grid is `@container` + `@lg`/`@3xl`, which is where `auto-fill minmax(250px,1fr)`
  actually turns over (two cards need 516px, three need 782px) — and it reacts to the aside
  docking beside it, which a viewport breakpoint cannot see. It also keeps the raw px literal
  out, which ESLint forbids in TS.

Three smaller facts that cost time:

- **Routing is the hash, and only `#/…` is a route** (`routes.ts`). The gallery's section links
  are plain `#foundations` anchors, and without that rule every one of them reads as an unknown
  route and throws the reader back to the campaign list mid-scroll.
- **`Button` rendering an `<a>` needs `nativeButton={false}`.** Base UI warns and applies
  button-only semantics otherwise. That is how the rail's nav rows stay real links.
- **jsdom here has no `localStorage` at all** — not `window.localStorage`, and not the bare
  global, since Node 26's own is inert without `--localstorage-file`. Anything reading it must
  tolerate `undefined` (`storage()` in `auth/credential.ts` does); a test that needs it installs
  one, as `campaign/CampaignScreen.test.tsx` does.

**`SignInSurface` checks `publishableKey()` as well as the context's `configured`.** It hangs in
the shared `TopBar`, so every screen renders it, and the two conditions are the same question
`AuthProvider` asks before mounting `ClerkProvider`: the vendor's chrome may only mount where
the vendor's provider did. Without the second check any screen's test is liable to be the one
that discovers Clerk is missing above it.

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

**Fixtures for the campaign view live in `campaign/campaign.fixtures.tsx`, shared by the read
tests and the write tests.** They are the JSON the server sends, not the decoded classes, so a
field the contract renames fails the test rather than rendering `undefined` — which is why a
fixture may not be a `Partial<>` of anything, and why a field added upstream is one edit here
rather than one per test file. `installStubServer()` must be called once per file at module
scope, for the `Context.Reference` reason `api/client.test.ts` records.

**Prep-item authoring needs a session to hang off, and creating one is not built.** The
checklist belongs to `session`, so with `campaign.currentSessionId` null the card says so and
offers no Add row. Session creation is the live-session step's surface, not this one.

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
