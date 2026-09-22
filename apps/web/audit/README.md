# Shell layout audit

jsdom computes no layout, so the numbers that say the shell lines up (row heights, where the first campaign tab starts, whether anything spills past the right edge, what is on top after a scroll) come from a real browser. This tool measures them in headless Chromium, over the same fixture maps the Vitest suite uses. It needs no Postgres, no API server and no Clerk.

```bash
pnpm -F web shell-audit                                   # 16 screens × 1440/1200/1024/900/760
pnpm -F web shell-audit --widths=1440,760 --only=party,hob
pnpm -F web shell-audit --json=/tmp/shell-audit.json      # every measurement, as data
```

`--only` takes screen names from `src/test/screens.ts`, plus `hob` for the panel walk. `--height` sets the viewport height (default 900). Set `CHROMIUM=/path/to/chrome` if Chromium is not at `/usr/bin/chromium`.

## What it runs

`audit.mjs` is one process that owns everything it starts:

- **A Vite dev server** on a free port it picks (never 5173), with the app's own `vite.config.ts` and one extra plugin. `VITE_API_URL` points at `/stub` on the same origin and `VITE_CLERK_PUBLISHABLE_KEY` is empty, set in the process environment so a developer's `.env.local` cannot redirect them.
- **The stub API** is that plugin's middleware. It answers `METHOD /path` from a scenario map in `src/test/screens.ts`, which merges the fixture maps (`fullCampaign`, `fullParty`, `fullRules`, `fullChronicle`, `liveFight`, `twoTables`). The fixture modules import `vitest`, the render harness and `AuthProvider` for their `install*` helpers. Those three are shimmed in the SSR load only, so the browser gets the real app. An unanswered request is logged per screen, not failed.
- **Chromium** is launched with `--remote-debugging-port=0` and a throwaway profile under `node_modules/.cache/`. It is driven over the DevTools protocol with Node's built-in `WebSocket`, so there is no Playwright dependency. The port is read off Chromium's own stderr. The child is killed by the PID the spawn returned, in a `finally`.

The screen list and the scenarios are shared with `src/shell/primaries.test.tsx`. Add a screen there and both the jsdom pin and the audit walk it.

## What it checks

Per screen, per width, after the DOM has been still for 300ms:

- the heights of the global row, the campaign row, the per-screen bar and the tab strip, and the sticky stack's total height and `z-index`;
- the first campaign tab's x, the last item's right edge and the row's right edge;
- the height of every control on the global row;
- `document.documentElement.scrollWidth` against `clientWidth`, and any chrome control drawn past the right edge (an ancestor's overflow clips it, and `scrollWidth` cannot see that);
- `scrollWidth > clientWidth` on each chrome row;
- after scrolling the document 400px, whether the stack is still at `top: 0` and `elementFromPoint` still lands in it;
- how many `Button`s paint the accent fill, and whether each is in the bar or the body.

Then, at each width, it opens Hob on the Overview and walks Notes, Party, the Library and back. At each step it records whether the panel and header are the same DOM nodes (marked on the first step), whether _Ask Hob_ is still pressed, the panel's box and `z-index`, and whether the panel covers the bar.

The report prints one table per width, then the Hob walk, then **Findings**: any value that differs across screens where the rule says it should not, or breaks a rule. A clean run is `Findings (0)` apart from the known primary-budget defects listed in `src/shell/primaries.test.tsx`.

The measured numbers are recorded once, in `docs/internals/web-screens.md`.
