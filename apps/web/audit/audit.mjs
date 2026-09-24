#!/usr/bin/env node
// The shell layout audit: the numbers jsdom cannot compute, measured in a real
// Chromium against the Vitest fixture maps. See `README.md` beside this file.
//
//   pnpm -F web shell-audit                        every screen at every width
//   pnpm -F web shell-audit --widths=1440,760      some widths
//   pnpm -F web shell-audit --only=overview,notes --json=/tmp/audit.json

// The measuring functions below are serialised and run inside the page.
/* global document, window, localStorage, getComputedStyle, MutationObserver, PopStateEvent */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value = "true"] = arg.slice(2).split("=");
      return [key, value];
    }),
);
const widths = (args.widths ?? "1440,1200,1024,900,760").split(",").map(Number);
const height = Number(args.height ?? 900);
const only = args.only?.split(",");

/** A port nobody holds right now, so the audit never lands on somebody's 5173. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

// ---------------------------------------------------------------------------
// The stub API: the fixture maps over HTTP, on the Vite server's own origin.

/**
 * The fixture modules import `vitest`, the render harness and the auth
 * provider for their `install*` and `render*` helpers, which the audit never
 * calls and which would build a router at import. Shimmed for the SSR load
 * only — nothing but `src/test/screens.ts` is loaded that way — so the browser
 * bundle is the real app.
 */
const shims = {
  "\0audit:vitest": "export const vi = new Proxy({}, { get: () => () => undefined });",
  "\0audit:renderRoute": `export const TEST_MACHINE_TOKEN = "a-test-token";
export const renderAt = () => { throw new Error("renderAt is not available to the audit"); };`,
  "\0audit:auth": "export const HostedSessionScope = ({ children }) => children;",
};

function stubApi() {
  let scenario;
  let routes = new Map();
  let unanswered = [];
  return {
    name: "audit-stub-api",
    // Ahead of Vite's own resolver, which would otherwise answer first.
    enforce: "pre",
    resolveId(id, importer, options) {
      if (!options?.ssr) return undefined;
      if (id === "vitest") return "\0audit:vitest";
      if (id.endsWith("/test/renderRoute")) return "\0audit:renderRoute";
      if (id.endsWith("/auth/AuthProvider")) return "\0audit:auth";
      return undefined;
    },
    load: (id) => shims[id],
    configureServer(server) {
      server.middlewares.use("/stub", async (req, res) => {
        const url = new URL(req.url, "http://stub");
        const send = (status, body, type = "application/json") => {
          res.statusCode = status;
          if (status === 204) return res.end();
          res.setHeader("content-type", type);
          // `null` is a body: `GET …/history/summary` answers it on purpose.
          res.end(type === "application/json" ? JSON.stringify(body ?? null) : body);
        };
        if (url.pathname === "/__audit/scenario") {
          const { scenarios } = await server.ssrLoadModule("/src/test/screens.ts");
          scenario = url.searchParams.get("name");
          routes = scenarios[scenario]();
          unanswered = [];
          return send(200, { scenario, routes: routes.size });
        }
        if (url.pathname === "/__audit/unanswered") {
          const answer = [...new Set(unanswered)];
          unanswered = [];
          return send(200, answer);
        }
        const key = `${req.method} ${url.pathname}`;
        const answer = routes.get(key);
        if (answer === undefined) {
          unanswered.push(key);
          return send(404, { _tag: "NotFound", resource: "audit", id: url.pathname });
        }
        if (answer.sse !== undefined) return send(answer.status, answer.sse, "text/event-stream");
        return send(answer.status, typeof answer.body === "function" ? answer.body() : answer.body);
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Chromium over the DevTools protocol, with Node's own WebSocket.

const chromiumPath = () => {
  const candidates = [
    process.env.CHROMIUM,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const found = candidates.find((path) => path !== undefined && existsSync(path));
  if (found === undefined) throw new Error("No Chromium found; set CHROMIUM=/path/to/chrome");
  return found;
};

/** Launch with a port of Chromium's choosing and read it back off stderr. */
const launchChromium = (profile) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      chromiumPath(),
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.once("error", reject);
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (match !== null) resolve({ child, browserWs: match[1] });
    });
    child.once("exit", (code) => reject(new Error(`Chromium exited ${code}: ${stderr}`)));
  });

class Cdp {
  #ws;
  #next = 1;
  #pending = new Map();
  static async connect(url) {
    const cdp = new Cdp();
    cdp.#ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      cdp.#ws.addEventListener("open", resolve, { once: true });
      cdp.#ws.addEventListener("error", reject, { once: true });
    });
    cdp.#ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const pending = cdp.#pending.get(message.id);
      if (pending === undefined) return;
      cdp.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    return cdp;
  }
  send(method, params = {}) {
    const id = this.#next++;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
  }
  /** Evaluate a function in the page and return its JSON value. */
  async run(fn, ...fnArgs) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", {
      expression: `(${fn})(...${JSON.stringify(fnArgs)})`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? "eval failed");
    return result.value;
  }
  close() {
    this.#ws.close();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// What is measured. Each function runs inside the page.

/**
 * Wait until the screen's header is up — the bar above a campaign, the heading
 * at the top of the content inside one — and the DOM has been still for 300ms.
 */
function settled() {
  return new Promise((resolve) => {
    const started = performance.now();
    let last = performance.now();
    const observer = new MutationObserver(() => (last = performance.now()));
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    const tick = () => {
      const now = performance.now();
      const ready =
        document.querySelector('[data-slot="page-header"], [data-slot="page-heading"]') !== null &&
        document.querySelector('[data-slot="loading"]') === null;
      if ((ready && now - last > 300) || now - started > 8000) {
        observer.disconnect();
        resolve(ready);
      } else setTimeout(tick, 50);
    };
    tick();
  });
}

function measure() {
  const round = (n) => Math.round(n * 10) / 10;
  const box = (el) => {
    if (el === null || el === undefined) return null;
    const r = el.getBoundingClientRect();
    return {
      x: round(r.x),
      y: round(r.y),
      w: round(r.width),
      h: round(r.height),
      right: round(r.right),
    };
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const doc = document.documentElement;
  const viewport = doc.clientWidth;
  const sections = document.querySelector('nav[aria-label="Sections"]');
  const globalRow = sections?.parentElement ?? null;
  const campaignNav = document.querySelector('nav[aria-label="This campaign"]');
  const campaignRow = campaignNav?.parentElement ?? null;
  const header = document.querySelector('[data-slot="page-header"]');
  const bar = header?.firstElementChild ?? null;
  const tabs = header?.children[1] ?? null;
  // Inside a campaign there is no bar: the same header is the top of `main`.
  const heading = document.querySelector('main [data-slot="page-heading"]');
  const headingTabs = heading?.children[1] ?? null;
  const stack = document.querySelector(".sticky.top-0");
  const main = document.querySelector("main");
  // `main`'s content edge: its box less the page gutter.
  const contentRight =
    main === null
      ? viewport
      : main.getBoundingClientRect().right - parseFloat(getComputedStyle(main).paddingRight);

  // Anything in the chrome drawn past the viewport's right edge: clipped by an
  // ancestor's overflow, so `scrollWidth` alone never sees it.
  const pastEdge = stack
    ? [...stack.querySelectorAll("a, button, h1, [data-slot=badge]")]
        .filter(visible)
        .filter((el) => el.getBoundingClientRect().right > viewport + 0.5)
        .map(
          (el) =>
            `${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30)} @${round(el.getBoundingClientRect().right)}`,
        )
    : [];
  // The same question of the in-content heading, against the content's edge:
  // the frame clips sideways, so a tab strip running past it is invisible to
  // `scrollWidth` too.
  const headingPastEdge = heading
    ? [...heading.querySelectorAll("a, button, input, h1")]
        .filter(visible)
        .filter((el) => el.getBoundingClientRect().right > contentRight + 0.5)
        .map(
          (el) =>
            `${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30)} @${round(el.getBoundingClientRect().right)}`,
        )
    : [];
  // Header controls drawn on top of one another: a flex row whose children
  // cannot shrink any further overflows into its neighbour, and neither the
  // viewport edge nor `scrollWidth` sees that.
  const barControls = [header, heading]
    .filter((el) => el !== null)
    .flatMap((el) => [...el.querySelectorAll("a, button, input, h1")])
    .filter(visible)
    .filter((el) => !el.parentElement.closest("a, button"))
    // A switch's native input is a clipped 1px box behind its thumb.
    .filter((el) => el.getBoundingClientRect().width > 2);
  const label = (el) =>
    (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30);
  const barOverlaps = [];
  for (const [i, a] of barControls.entries())
    for (const b of barControls.slice(i + 1)) {
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (x > 0.5 && y > 0.5) barOverlaps.push(`${label(a)} × ${label(b)}`);
    }
  const rowOverflow = (el) => (el === null ? null : el.scrollWidth > el.clientWidth);
  const primaries = [...document.querySelectorAll('[data-slot="button"]')]
    .filter(visible)
    .filter((el) => el.classList.contains("bg-accent"))
    .map(
      (el) =>
        `${el.textContent.trim()} (${
          el.closest('[data-slot="page-header"]')
            ? "bar"
            : campaignRow?.contains(el)
              ? "row"
              : el.closest('[data-slot="page-heading"]')
                ? "heading"
                : "body"
        })`,
    );
  // The row's tabs and, when some have collapsed, its *More* trigger.
  const campaignItems = campaignNav
    ? [...campaignNav.querySelectorAll("a, button")].filter(visible)
    : [];
  // The way home: the lead group's first control. It must survive every
  // collapse whole, never squeezed under the tabs.
  const home = campaignNav?.previousElementSibling?.querySelector("a") ?? null;
  const act = campaignRow
    ? ([...campaignRow.querySelectorAll('[data-slot="button"]')].filter(visible).at(-1) ?? null)
    : null;

  return {
    title: document.querySelector("h1")?.textContent?.trim() ?? null,
    failure:
      document.querySelector('[data-slot="failure-notice"]')?.textContent?.trim().slice(0, 80) ??
      null,
    viewport,
    scrollWidth: doc.scrollWidth,
    globalRow: box(globalRow),
    globalControls: globalRow
      ? [...globalRow.querySelectorAll("a, button")]
          .filter(visible)
          .map((el) => round(el.getBoundingClientRect().height))
      : [],
    campaignRow: box(campaignRow),
    campaignLead: box(campaignNav?.previousElementSibling ?? null),
    campaignLeadItems: campaignNav
      ? [...(campaignNav.previousElementSibling?.children ?? [])]
          .filter(visible)
          .map((el) => el.getAttribute("aria-label") ?? el.textContent.trim())
      : [],
    campaignFirstTab: box(campaignItems[0] ?? null),
    campaignLastItem: box(campaignItems.at(-1) ?? null),
    campaignTabs: campaignItems.map(
      (el) => el.textContent.trim() || el.getAttribute("aria-label") || "",
    ),
    campaignHome: box(home),
    // The lead group may shrink only by truncating the name inside it; if its
    // own contents spill, the chip or the badge is being drawn under the tabs.
    campaignLeadSpills: campaignNav?.previousElementSibling
      ? campaignNav.previousElementSibling.scrollWidth >
        campaignNav.previousElementSibling.clientWidth
      : null,
    campaignAct: act === null ? null : { ...box(act), label: act.textContent.trim() },
    bar: box(bar),
    barActions: box(header?.querySelector('[data-slot="page-header-actions"]') ?? null),
    tabs: box(tabs),
    heading: box(heading?.firstElementChild ?? null),
    headingTitle: box(heading?.querySelector("h1") ?? null),
    headingTabs: box(headingTabs),
    stackHeight: box(stack)?.h ?? null,
    stackZ: stack ? getComputedStyle(stack).zIndex : null,
    mainTop: box(main)?.y ?? null,
    overflow: {
      globalRow: rowOverflow(globalRow),
      campaignRow: rowOverflow(campaignRow),
      bar: rowOverflow(bar),
      headingTabs: rowOverflow(headingTabs),
    },
    pastEdge,
    headingPastEdge,
    barOverlaps,
    primaries,
  };
}

/** Scroll the document and ask what is under the bar: the chrome must win. */
function stickyCheck() {
  const stack = document.querySelector(".sticky.top-0");
  if (stack === null) return null;
  const scroller = document.scrollingElement;
  if (scroller.scrollHeight <= scroller.clientHeight + 40) return { scrolls: false };
  window.scrollTo(0, 400);
  const top = stack.getBoundingClientRect().top;
  const probe = document.elementFromPoint(
    document.documentElement.clientWidth / 2,
    stack.getBoundingClientRect().bottom - 5,
  );
  // A screen's own `sticky` must pin below the chrome, not under it.
  const chromeBottom = Math.round(stack.getBoundingClientRect().bottom);
  const underChrome = [...document.querySelectorAll("main *")]
    .filter((el) => getComputedStyle(el).position === "sticky")
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.height > 0 && r.top < chromeBottom - 1 && r.bottom > 0)
    .map((r) => Math.round(r.top));
  window.scrollTo(0, 0);
  return {
    scrolls: true,
    stackTopAfterScroll: Math.round(top),
    chromeOnTop: stack.contains(probe),
    underChrome,
  };
}

/**
 * Every element in `main` that scrolls on its own, outside a dialog: the page
 * is the window's to scroll (`docs/internals/web-screens.md`). A sideways strip
 * (the sheet's pill rail) is not a page scroller and is left out.
 */
function innerScrollers() {
  return [...document.querySelectorAll("main *")]
    .filter((el) => el.closest("[role=dialog]") === null)
    .filter((el) => {
      const overflow = getComputedStyle(el).overflowY;
      return (
        (overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight + 1
      );
    })
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 4).join(".")}`);
}

function hobState() {
  const panel = document.querySelector('section[aria-label="Hob"]');
  const button = [...document.querySelectorAll("button[aria-pressed]")].find((el) =>
    el.textContent.includes("Ask Hob"),
  );
  const header = document.querySelector("header");
  const stack = document.querySelector(".sticky.top-0");
  const doc = document.documentElement;
  // The inline form is the sidebar's container; the overlaid one is the sheet,
  // which only it marks `data-mobile`.
  const inline = panel !== null && panel.closest("[data-mobile=true]") === null;
  const dock = inline ? panel.closest("[data-slot=sidebar-container]") : null;
  const box = (el) =>
    el === null
      ? null
      : (({ x, y, width, height, right }) => ({
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(width),
          h: Math.round(height),
          right: Math.round(right),
        }))(el.getBoundingClientRect());
  // Beside a docked panel the rows are narrower than the window; nothing in
  // them may be drawn past the column they have.
  const chromePastEdge =
    stack === null
      ? []
      : [...stack.querySelectorAll("a, button, [data-slot=badge]")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
          })
          .filter(
            (el) => el.getBoundingClientRect().right > stack.getBoundingClientRect().right + 0.5,
          )
          .map((el) =>
            (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30),
          );
  let overlayCoversBar = null;
  let panelZ = null;
  if (panel !== null) {
    const r = panel.getBoundingClientRect();
    let el = panel;
    while (el !== null && getComputedStyle(el).position === "static") el = el.parentElement;
    panelZ = el === null ? null : getComputedStyle(el).zIndex;
    if (stack !== null && !inline) {
      const bar = stack.getBoundingClientRect();
      const probe = document.elementFromPoint(r.x + r.width / 2, bar.top + 10);
      overlayCoversBar = probe !== null && !stack.contains(probe);
    }
  }
  // Inline, the panel must stay pinned full height while the document scrolls
  // under the chrome beside it. Most screens on the walk are shorter than the
  // viewport at 1440, so a spacer in `main` makes every step scroll; an inline
  // style rather than a class, because a class no source file names is never
  // emitted (CLAUDE.md, "Silent Tailwind").
  let afterScroll = null;
  const main = document.querySelector("main");
  if (dock !== null && main !== null) {
    const spacer = document.createElement("div");
    spacer.style.height = "2000px";
    main.append(spacer);
    window.scrollTo(0, 400);
    afterScroll = {
      scrollY: Math.round(window.scrollY),
      dockTop: Math.round(dock.getBoundingClientRect().top),
      dockH: Math.round(dock.getBoundingClientRect().height),
      stackTop: stack === null ? null : Math.round(stack.getBoundingClientRect().top),
    };
    window.scrollTo(0, 0);
    spacer.remove();
  }
  return {
    pressed: button?.getAttribute("aria-pressed") ?? null,
    inline,
    viewport: { w: doc.clientWidth, h: doc.clientHeight },
    scrollWidth: doc.scrollWidth,
    panel:
      panel === null
        ? null
        : (({ x, width }) => ({ x: Math.round(x), w: Math.round(width) }))(
            panel.getBoundingClientRect(),
          ),
    dock: box(dock),
    stack: box(stack),
    main: box(document.querySelector("main")),
    afterScroll,
    panelZ,
    overlayCoversBar,
    chromePastEdge,
    samePanel: panel?.__auditMark === true,
    sameHeader: header?.__auditMark === true,
  };
}

function markShell() {
  for (const el of [
    document.querySelector('section[aria-label="Hob"]'),
    document.querySelector("header"),
  ])
    if (el !== null) el.__auditMark = true;
}

function pressAskHob() {
  const button = [...document.querySelectorAll("button[aria-pressed]")].find((el) =>
    el.textContent.includes("Ask Hob"),
  );
  button?.click();
  return button !== undefined;
}

// ---------------------------------------------------------------------------

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
// Process env beats `.env.local`, so a developer's own API URL or Clerk key
// cannot redirect the audit.
process.env.VITE_API_URL = `${origin}/stub`;
process.env.VITE_CLERK_PUBLISHABLE_KEY = "";

const vite = await createServer({
  root: webDir,
  configFile: join(webDir, "vite.config.ts"),
  logLevel: "warn",
  server: { port, strictPort: true, host: "127.0.0.1", hmr: false },
  plugins: [stubApi()],
  // Otherwise Node's own loader imports the real `vitest`, past the shim.
  ssr: { noExternal: ["vitest"] },
});
await vite.listen();

const profile = join(webDir, "node_modules/.cache/shell-audit-profile");
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });
const { child: chromium, browserWs } = await launchChromium(profile);
console.error(`audit: vite on ${origin}; chromium pid ${chromium.pid}`);

const results = [];
const hob = [];
let cdp;
try {
  const debugPort = new URL(browserWs).port;
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  cdp = await Cdp.connect(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  const { screens } = await vite.ssrLoadModule("/src/test/screens.ts");
  const walk = screens.filter((screen) => only === undefined || only.includes(screen.name));

  const load = async (scenario, path) => {
    await fetch(`${origin}/stub/__audit/scenario?name=${scenario}`);
    await cdp.send("Page.navigate", { url: `${origin}${path}` });
    await sleep(300);
    await cdp.run(() => localStorage.setItem("taverns.token", "audit-token"));
    await cdp.send("Page.reload", { ignoreCache: false });
    await sleep(300);
    await cdp.run(settled);
  };
  const go = async (path) => {
    // In-page, as a click would: the router's browser history re-reads the
    // address bar on `popstate`, so the shell stays mounted across the step.
    await cdp.run((to) => {
      window.history.pushState(null, "", to);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, path);
    await sleep(100);
    return cdp.run(settled);
  };

  for (const width of widths) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    let scenario;
    for (const screen of walk) {
      if (screen.scenario !== scenario) {
        scenario = screen.scenario;
        await load(scenario, screen.path);
      }
      await cdp.run(() => window.scrollTo(0, 0));
      await fetch(`${origin}/stub/__audit/unanswered`); // drop the previous screen's
      const ready = await go(screen.path);
      const metrics = await cdp.run(measure);
      const sticky = await cdp.run(stickyCheck);
      const scrollers = await cdp.run(innerScrollers);
      const unanswered = await (await fetch(`${origin}/stub/__audit/unanswered`)).json();
      results.push({
        width,
        screen: screen.name,
        scenario,
        ready,
        ...metrics,
        sticky,
        scrollers,
        unanswered,
      });
    }

    // The Hob panel across navigation: open it on the Overview, walk through
    // two campaign screens, the runner and out of the campaign, and ask whether
    // it is the same node, still open, and where it sits: a full-height column
    // beside the shell inline, under the bar as an overlay.
    if (only === undefined || only.includes("hob")) {
      const steps = ["overview", "notes", "party", "run", "spells", "overview"].map((name) =>
        screens.find((s) => s.name === name),
      );
      await load("creator", steps[0].path);
      await cdp.run(pressAskHob);
      await sleep(400);
      await cdp.run(markShell);
      for (const [index, step] of steps.entries()) {
        if (index > 0) await go(step.path);
        hob.push({ width, step: `${index}:${step.name}`, ...(await cdp.run(hobState)) });
      }
    }
  }
} finally {
  cdp?.close();
  chromium.kill();
  await new Promise((resolve) =>
    chromium.exitCode !== null ? resolve() : chromium.once("exit", resolve),
  );
  await vite.close();
  rmSync(profile, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Report: one table per width, then everything that disagrees with the rules.

const px = (b, key) => (b === null ? "-" : String(b[key]));
for (const width of widths) {
  console.log(`\n## ${width}px`);
  console.log(
    [
      "screen",
      "global",
      "camp",
      "bar",
      "tabs",
      "stack",
      "mainTop",
      "h1.y",
      "head",
      "tab1.x",
      "last.right",
      "act",
      "row.right",
      "actions.right",
      "ctrls",
      "scrollW",
      "z",
      "primaries",
    ].join("\t"),
  );
  for (const r of results.filter((result) => result.width === width)) {
    console.log(
      [
        r.screen,
        px(r.globalRow, "h"),
        px(r.campaignRow, "h"),
        px(r.bar, "h"),
        px(r.tabs ?? r.headingTabs, "h"),
        r.stackHeight,
        r.mainTop,
        px(r.headingTitle, "y"),
        px(r.heading, "h"),
        px(r.campaignFirstTab, "x"),
        px(r.campaignLastItem, "right"),
        r.campaignAct === null ? "-" : `${r.campaignAct.x}+${r.campaignAct.w}`,
        px(r.campaignRow, "right"),
        px(r.barActions, "right"),
        [...new Set(r.globalControls)].join("/"),
        r.scrollWidth,
        r.stackZ,
        r.primaries.length,
      ].join("\t"),
    );
  }
}

const findings = [];
const distinct = (values) => [...new Set(values.filter((v) => v !== null && v !== undefined))];
for (const width of widths) {
  const rows = results.filter((r) => r.width === width);
  const inCampaign = rows.filter((r) => r.campaignRow !== null);
  const expect = (label, values, want) => {
    const got = distinct(values);
    if (got.length > 1 || (want !== undefined && got.length === 1 && got[0] !== want))
      findings.push(
        `${width}: ${label} is ${got.join(" / ")}${want === undefined ? "" : ` (want ${want})`}`,
      );
  };
  expect(
    "global row height",
    rows.map((r) => r.globalRow?.h),
    44,
  );
  expect(
    "campaign row height",
    inCampaign.map((r) => r.campaignRow.h),
    46,
  );
  // The bar's height is fixed only from `PageHeader`'s wrap breakpoint (the
  // `@4xl/app` container, 896px) up; below it the actions take their own
  // wrapping row and the height follows the screen.
  const fixedBar = (r) => r.bar === null || r.bar.w >= 896;
  expect(
    "bar height",
    rows.filter(fixedBar).map((r) => r.bar?.h),
    76,
  );
  expect(
    "tab strip height",
    rows.flatMap((r) => [r.tabs?.h, r.headingTabs?.h]),
    40,
  );
  // Inside a campaign there is no per-screen bar (the captain's decision of
  // 2026-09-23): the chrome is the two nav rows and the header's hairline
  // (44 + 46 + 1) on every tab at every width, and the screen's header is the
  // top of its content.
  for (const r of inCampaign)
    if (r.bar !== null) findings.push(`${width}: ${r.screen}: a per-screen bar inside a campaign`);
  expect(
    "campaign chrome height",
    inCampaign.map((r) => r.stackHeight),
    91,
  );
  expect(
    "global control height",
    rows.flatMap((r) => r.globalControls),
    26,
  );
  // The tabs follow the lead group, whatever the name's length: the first tab
  // starts `ml-2` (8px) after the group's right edge.
  for (const r of inCampaign)
    if (r.campaignLead !== null && r.campaignFirstTab !== null) {
      const gap = Math.round((r.campaignFirstTab.x - r.campaignLead.right) * 10) / 10;
      if (gap !== 8)
        findings.push(
          `${width}: ${r.screen}: first campaign tab is ${gap}px after the lead (want 8)`,
        );
    }
  expect(
    "sticky stack z-index",
    rows.map((r) => r.stackZ),
    "10",
  );
  // One content top edge for every campaign screen, so sibling tabs line up:
  // the same `main` top, the same title y, and — from `PageHeader`'s wrap
  // breakpoint up, where its row does not wrap — the same header height, so
  // whatever follows the header starts at one y too.
  expect(
    "campaign content top",
    inCampaign.map((r) => r.mainTop),
  );
  expect(
    "campaign title y",
    inCampaign.map((r) => r.headingTitle?.y),
  );
  expect(
    "campaign header height",
    inCampaign.filter((r) => r.viewport >= 896).map((r) => r.heading?.h),
    48,
  );
  // The way home survives every collapse whole: the chevron is at least its
  // own 16px and the first tab starts after it.
  for (const r of inCampaign)
    if (
      r.campaignHome === null ||
      r.campaignHome.w < 16 ||
      (r.campaignFirstTab !== null && r.campaignHome.right > r.campaignFirstTab.x)
    )
      findings.push(
        `${width}: ${r.screen}: the way home is squeezed (${JSON.stringify(r.campaignHome)})`,
      );
  for (const r of inCampaign)
    if (r.campaignLeadSpills)
      findings.push(`${width}: ${r.screen}: the campaign row's lead spills out of its box`);
  // The campaign's press is on the row after its last item, never over it.
  for (const r of inCampaign)
    if (
      r.campaignAct !== null &&
      r.campaignLastItem !== null &&
      r.campaignAct.x < r.campaignLastItem.right
    )
      findings.push(
        `${width}: ${r.screen}: the campaign's press at ${r.campaignAct.x} overlaps the tabs ending at ${r.campaignLastItem.right}`,
      );
  for (const r of rows) {
    const at = `${width}: ${r.screen}`;
    if (!r.ready) findings.push(`${at}: never settled (no bar, or still loading)`);
    if (r.failure !== null) findings.push(`${at}: failure notice "${r.failure}"`);
    if (r.scrollWidth !== r.viewport)
      findings.push(`${at}: scrollWidth ${r.scrollWidth} != viewport ${r.viewport}`);
    if (r.pastEdge.length > 0)
      findings.push(`${at}: chrome past the right edge: ${r.pastEdge.join(", ")}`);
    if (r.headingPastEdge.length > 0)
      findings.push(`${at}: header past the content's edge: ${r.headingPastEdge.join(", ")}`);
    for (const [row, over] of Object.entries(r.overflow))
      if (over) findings.push(`${at}: ${row} overflows its box`);
    if (
      r.campaignLastItem !== null &&
      r.campaignRow !== null &&
      r.campaignLastItem.right > r.campaignRow.right
    )
      findings.push(
        `${at}: campaign row's last item ends at ${r.campaignLastItem.right}, row at ${r.campaignRow.right}`,
      );
    if (r.barOverlaps.length > 0)
      findings.push(`${at}: header controls overlap: ${r.barOverlaps.join(", ")}`);
    if (
      r.campaignRow !== null &&
      r.campaignAct === null &&
      r.scenario === "creator" &&
      // The fight the press would go back to, and an encounter's page, whose
      // own *Run* is the press aimed at that encounter.
      !["run", "encounter"].includes(r.screen)
    )
      findings.push(`${at}: no campaign press on the row`);
    if (r.primaries.length > 1)
      findings.push(`${at}: ${r.primaries.length} primaries (${r.primaries.join(", ")})`);
    if (r.sticky?.scrolls && (r.sticky.stackTopAfterScroll !== 0 || !r.sticky.chromeOnTop))
      findings.push(`${at}: sticky chrome ${JSON.stringify(r.sticky)}`);
    if (r.sticky?.underChrome?.length > 0)
      findings.push(`${at}: sticky under the chrome at y ${r.sticky.underChrome.join(", ")}`);
    if (r.scrollers.length > 0)
      findings.push(`${at}: inner page scroller ${r.scrollers.join(", ")}`);
  }
  for (const h of hob.filter((step) => step.width === width)) {
    if (h.pressed !== "true" || h.panel === null || !h.samePanel || !h.sameHeader)
      findings.push(`${width}: hob at ${h.step}: ${JSON.stringify(h)}`);
    if (h.overlayCoversBar) findings.push(`${width}: hob at ${h.step}: the panel covers the bar`);
    if (h.scrollWidth !== h.viewport.w)
      findings.push(`${width}: hob at ${h.step}: scrollWidth ${h.scrollWidth} != ${h.viewport.w}`);
    if (h.chromePastEdge.length > 0)
      findings.push(
        `${width}: hob at ${h.step}: chrome past the column's edge: ${h.chromePastEdge.join(", ")}`,
      );
    if (!h.inline) continue;
    // Inline, the panel is a full-height column beside the whole shell: top 0,
    // the viewport's height, flush with the right edge, and the chrome and
    // `main` end where it begins.
    const at = `${width}: hob at ${h.step}`;
    if (h.dock === null) findings.push(`${at}: inline but no sidebar container`);
    else {
      if (h.dock.y !== 0 || h.dock.h !== h.viewport.h)
        findings.push(`${at}: panel at y ${h.dock.y}, h ${h.dock.h} (want 0, ${h.viewport.h})`);
      if (h.dock.right !== h.viewport.w)
        findings.push(`${at}: panel's right edge ${h.dock.right} != ${h.viewport.w}`);
      if (h.stack?.right !== h.dock.x)
        findings.push(`${at}: chrome ends at ${h.stack?.right}, panel starts at ${h.dock.x}`);
      if (h.main !== null && h.main.right > h.dock.x)
        findings.push(`${at}: main ends at ${h.main.right}, past the panel at ${h.dock.x}`);
    }
    if (
      h.afterScroll !== null &&
      (h.afterScroll.scrollY !== 400 ||
        h.afterScroll.dockTop !== 0 ||
        h.afterScroll.dockH !== h.viewport.h ||
        h.afterScroll.stackTop !== 0)
    )
      findings.push(`${at}: after scrolling ${JSON.stringify(h.afterScroll)}`);
  }
}

console.log(`\n## Hob across navigation`);
for (const h of hob)
  console.log(
    [
      h.width,
      h.step,
      h.inline ? "inline" : "overlay",
      `pressed=${h.pressed}`,
      `panel=${h.panel === null ? "-" : `${h.panel.x}+${h.panel.w}`}`,
      `dock=${h.dock === null ? "-" : `${h.dock.x},${h.dock.y} ${h.dock.w}x${h.dock.h}`}`,
      `chrome.right=${h.stack?.right ?? "-"}`,
      `at y ${h.afterScroll === null ? "-" : `${h.afterScroll.scrollY}: panel ${h.afterScroll.dockTop}+${h.afterScroll.dockH}, chrome ${h.afterScroll.stackTop}`}`,
      `scrollW=${h.scrollWidth}`,
      `z=${h.panelZ}`,
      `same panel=${h.samePanel}`,
      `same header=${h.sameHeader}`,
    ].join("\t"),
  );

// A request the scenario has no answer for is a gap in the fixtures, not in
// the layout; it matters only when the screen then drew a failure notice.
console.log(`\n## Unanswered requests`);
for (const r of results.filter(
  (result) => result.unanswered.length > 0 && result.width === widths[0],
))
  console.log(`${r.screen}\t${r.unanswered.join(", ")}`);

console.log(`\n## Findings (${findings.length})`);
for (const finding of findings) console.log(`- ${finding}`);

if (args.json !== undefined)
  writeFileSync(args.json, JSON.stringify({ results, hob, findings }, null, 2));
