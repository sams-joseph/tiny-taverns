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
- **`e2e/stub/`** is the app's Vite config plus the stub API plugin. The plugin answers `METHOD /path` under `/stub` from a scenario map in `src/test/scenarios.ts`, chosen per request by the `x-e2e-scenario` header, so parallel workers never share a mutable "current scenario". The fixture modules import `vitest`, the render harness and `AuthProvider` for their `install*` helpers; those three are shimmed in the SSR load only, so the browser gets the real app. Every campaign and Shared World read is decorated with a pitch and a cover picture the plugin also serves, because an Overview drawn over a cover is the harder layout.
- **`e2e/support/app.ts`** is the `app` fixture: `open(screen)` sets the scenario, pastes a machine token and loads the screen from cold; `go(path)` navigates in the page as a click would, so the shell stays mounted; `settle()` waits for the header, no loading state, fonts, a DOM still for 300ms and every finite animation finished, so a measurement is of the page at rest.
- **`e2e/layout/`** holds the specs, one per concern. Each file's header says what it guards and why:
  - `screens.spec.ts`: every screen at every width — no failure notice, no sideways scroll, nothing drawn past the chrome's or a header's edge, no two header controls overlapping, the fixed row heights, at most one peach primary, the chrome on top after a scroll, no inner page scroller, and inside a campaign the two-row chrome and the campaign row's collapse and press.
  - `campaign.spec.ts`: every campaign screen's content starts at one y.
  - `hob.spec.ts`: the Hob panel walked across navigation, inline and as the overlay.
  - `global-nav.spec.ts`: the global row's panels, opened with a pointer and shut with Escape.
  - `hero.spec.ts`: the Overview heroes with a cover picture, while Hob draws one, and when the picture fails to load.

The widths are 1440, 1024, 760 and 390: wide; just above Hob's inline breakpoint (1020); below the header's wrap breakpoint (896) and the campaign row's `@3xl`; and a phone. The old shell audit also walked 1200 and 900; they were dropped because each sits in bands the four already cover: 1200 in 1440's for every rule, 900 in 1024's for the campaign row and 760's for the header's wrap and Hob's overlay.

## Adding a screen or a width

- **A screen:** add it to `src/test/screens.ts` (name, scenario, path), and any route it reads to the fixture maps `src/test/scenarios.ts` merges. `shell/primaries.test.tsx` and every spec here walk it from then on. `screens.ts` imports nothing but ids (`src/test/ids.ts`), because this suite loads it outside Vitest.
- **A width:** add it to `WIDTHS` in `e2e/support/app.ts`, saying which breakpoint band it adds.
- **A check:** put it in the spec for its concern as a `test.step` whose name is the rule, with a comment saying what it guards and why jsdom cannot.

## An authenticated suite

Everything here runs as a machine-token account against the stub. A suite that signs in through hosted sign-in (Clerk, with `@clerk/testing`) against a real server is a second project in `playwright.config.ts` with its own `testDir` (`e2e/auth/`), a setup project that signs in and saves `storageState`, and a second `webServer` entry for the API server and its database. The `credential` fixture option in `e2e/support/app.ts` is where a hosted-session value would go.
