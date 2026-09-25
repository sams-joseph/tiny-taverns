# The web Playwright suite

jsdom computes no layout, so the numbers that say the shell lines up (row heights, where the first campaign tab starts, whether anything spills past the right edge, what is on top after a scroll) come from a real browser. This suite measures them in Chromium over the same fixture maps the Vitest suite uses. It needs no Postgres, no API server, no Clerk, and makes no model or image calls.

```bash
pnpm -F web exec playwright install chromium   # once, and after a Playwright upgrade
pnpm -F web e2e                                # every spec, every width
pnpm -F web e2e hob                            # one file (a regex on its path)
pnpm -F web e2e -g "760px party"               # one title: "<width>px <screen>"
```

## Debugging

- `pnpm -F web e2e --ui` opens Playwright's UI mode: pick a test, watch it run, and step through each action with the DOM snapshot beside it.
- A failing test keeps its trace (`trace: "retain-on-failure"`). `pnpm -F web exec playwright show-trace test-results/<test>/trace.zip` replays it; `pnpm -F web exec playwright show-report` opens the HTML report, which links every trace. CI uploads both as the `playwright-report` artifact when the job fails.
- `pnpm -F web e2e --headed --debug -g "…"` runs one test in a visible browser under the inspector.
- Checks are `expect.soft` inside named `test.step`s, so one run reports every rule a screen breaks, each under the step that says which rule it is.
- A request the scenario could not answer is attached to its test as an `unanswered` annotation (in the report). It is a gap in the fixtures, not the layout, and matters only when the screen then drew a failure notice, which every screen test asserts it did not.

## What it runs

- **`playwright.config.ts`** picks a free port when it starts (never 5173, never somebody else's server) and starts `vite --config e2e/stub/vite.config.ts` on it as its `webServer`, which Playwright stops when the run ends. `VITE_API_URL` points at `/stub` on the same origin and `VITE_CLERK_PUBLISHABLE_KEY` is empty, set in the server's environment so a developer's `.env.local` cannot redirect them. It keeps its own optimizer cache, so it can run beside a `pnpm dev` in the same checkout.
- **`e2e/stub/`** is the app's Vite config plus the stub API plugin. The plugin answers `METHOD /path` under `/stub` from a scenario map in `src/test/scenarios.ts`, chosen per request by the `x-e2e-scenario` header, so parallel workers never share a mutable "current scenario". The fixture modules import `vitest`, the render harness and `AuthProvider` for their `install*` helpers; those three are shimmed in the SSR load only. The browser gets the real app with one substitution: `main.tsx`'s `AuthProvider` is `e2e/stub/StubAuthProvider.tsx`, a signed-in session with no Clerk behind it (so Clerk's own chrome is absent, as in the Vitest suite). Every campaign and Shared World read is decorated with a pitch and a cover picture the plugin also serves, because an Overview drawn over a cover is the harder layout.
- **`e2e/support/app.ts`** is the `app` fixture: `open(screen)` sets the scenario and loads the screen from cold; `go(path)` navigates in the page as a click would, so the shell stays mounted; `settle()` waits for the header, no loading state, fonts, a DOM still for 300ms and every finite animation finished, so a measurement is of the page at rest.
- **`e2e/layout/`** holds the specs, one per concern. Each file's header says what it guards and why:
  - `screens.spec.ts`: every screen at every width — no failure notice, no sideways scroll, nothing drawn past the chrome's or a header's edge, no two header controls overlapping, the fixed row heights, at most one peach primary, the chrome on top after a scroll, no inner page scroller, and inside a campaign the two-row chrome and the campaign row's collapse and press.
  - `campaign.spec.ts`: every campaign screen's content starts at one y.
  - `encounters.spec.ts`: the Encounters list beside its preview, and the preview brought into view when the two are stacked.
  - `encounter-builder.spec.ts`: the encounter builder's rail beside the form or stacked under the roster, its difficulty card pinned under the chrome beside the form, roster lines readable on a phone, and the stepper's press landing on it.
  - `party.spec.ts`: the Party tab's card columns, each card's rows level with its neighbours', − and + pressing above the card's link without opening it, and _Passives and saves_ fitting with no scroller of its own.
  - `hob.spec.ts`: the Hob panel walked across navigation, inline and as the overlay.
  - `global-nav.spec.ts`: the global row's panels, opened with a pointer and shut with Escape.
  - `hero.spec.ts`: the Overview heroes with a cover picture, while Hob draws one, and when the picture fails to load.

The widths are 1440, 1024, 760 and 390: wide; just above Hob's inline breakpoint (1020); below the header's wrap breakpoint (896) and the campaign row's `@3xl`; and a phone. The old shell audit also walked 1200 and 900; they were dropped because each sits in bands the four already cover: 1200 in 1440's for every rule, 900 in 1024's for the campaign row and 760's for the header's wrap and Hob's overlay.

## Adding a screen or a width

- **A screen:** add it to `src/test/screens.ts` (name, scenario, path), and any route it reads to the fixture maps `src/test/scenarios.ts` merges. `shell/primaries.test.tsx` and every spec here walk it from then on. `screens.ts` imports nothing but ids (`src/test/ids.ts`), because this suite loads it outside Vitest.
- **A width:** add it to `WIDTHS` in `e2e/support/app.ts`, saying which breakpoint band it adds.
- **A check:** put it in the spec for its concern as a `test.step` whose name is the rule, with a comment saying what it guards and why jsdom cannot.

## The authenticated suite

Everything above runs signed in by the stand-in session against the stub. `e2e/auth/` signs in through Clerk's development instance with [`@clerk/testing`](https://clerk.com/docs/testing/playwright) against the real API server and a database of its own, and asserts through the real UI: signing in provisions an account, a DM's invitation brings a player (in a second browser context) into the Party, and signing out returns to the homepage.

```bash
pnpm db:up                                  # or E2E_AUTH_DATABASE_URL=<a Postgres it may create databases on>
set -a; . <your keys file>; set +a          # CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY, kept outside the repo
pnpm -F web e2e:auth
```

- **Its own config**, `playwright.auth.config.ts`, rather than a second project here: Playwright starts every `webServer` and runs global setup whichever project is selected, and the layout suite must keep needing neither Postgres nor keys. With either key unset every test skips and says why; CI does the same for a fork's pull request, which gets no repository secrets.
- **`global-setup.ts` owns the stack**, because the server's database and verification key must exist before it boots and Playwright starts `webServer` entries before global setup. It refuses anything but `pk_test_`/`sk_test_` keys, runs `clerkSetup()` (a testing token that lets an automated browser past bot protection), checks read-only that the two test users exist, fetches the instance's JWT public key from its public JWKS and converts it to the PEM `CLERK_JWT_KEY` takes, then `support/stack.ts` creates `taverns_e2e_auth_<random>` on `E2E_AUTH_DATABASE_URL` (default: the compose database on 5433), starts the API server and Vite on free ports, and returns the teardown that stops those two process ids and drops the database. The secret key is stripped from both children's environment: the server verifies offline and never holds one, and the browser only ever gets the publishable key.
- **The users are the instance's two `+clerk_test` users** (`support/clerk.ts`), made by hand in the dashboard. The suite never creates, changes or deletes a Clerk user. `signIn` uses the email-code strategy, which such an address passes with `424242` and no mail. Every test signs in afresh: a signed-out session is ended at Clerk, so a shared `storageState` would die with the sign-out test. One worker, since the tests share the users and the database.
- **Accounts are named "Someone"** on this instance, whose session token carries no `name` claim (`DEFAULT_ACCOUNT_NAME`, `docs/internals/server.md`). `accountName` reads the claim, so the assertions follow if the dashboard ever adds one.
- **Nothing it writes carries a key.** No traces (a trace records every request, and each Frontend API request carries the testing token in its query string); a failure keeps a screenshot, the page snapshot and `test-results-auth/stack/{server,vite}.log`, which CI uploads as `playwright-report-auth`.
