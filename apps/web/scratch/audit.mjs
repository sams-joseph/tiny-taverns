// Scratch only. Drives the running app with Playwright, screenshots each screen
// and measures the chrome geometry + remount behaviour. Output: JSON on stdout.
import { chromium } from "/home/jsams/.local/share/mise/installs/npm-playwright/latest/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const OUT = "/home/jsams/projects/tiny-taverns/.lavish/shots";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:5173/#";
const ids = {
  campaign: process.env.CAMPAIGN, world: process.env.WORLD, character: process.env.CHARACTER,
  session: process.env.SESSION, run: process.env.RUN, npc: process.env.NPC,
};
const screens = [
  ["campaigns", "/campaigns"],
  ["overview", `/campaigns/${ids.campaign}`],
  ["encounters", `/campaigns/${ids.campaign}/encounters`],
  ["notes", `/campaigns/${ids.campaign}/notes`],
  ["party", `/campaigns/${ids.campaign}/party`],
  ["cast", `/campaigns/${ids.campaign}/cast`],
  ["npc", `/campaigns/${ids.campaign}/cast/${ids.npc}`],
  ["chronicle", `/campaigns/${ids.campaign}/chronicle`],
  ["run", `/campaigns/${ids.campaign}/sessions/${ids.session}/runs/${ids.run}`],
  ["characters", "/characters"],
  ["sheet", `/characters/${ids.character}`],
  ["library", "/library"],
  ["library-rules", "/library/rules"],
  ["worlds", "/worlds"],
  ["world", `/worlds/${ids.world}`],
];

const measure = () => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
  const header = document.querySelector("body > div > header, #root header");
  const rows = header ? [...header.children] : [];
  const globalNav = document.querySelector('nav[aria-label="Sections"]');
  const campNav = document.querySelector('nav[aria-label="This campaign"]');
  const topBar = document.querySelector("main")?.previousElementSibling;
  const h1 = document.querySelector("h1");
  const main = document.querySelector("main");
  const firstCard = main?.querySelector("[data-slot=card], .rounded-card, section, article, h2");
  const askHob = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Ask Hob"));
  return {
    scrollWidth: document.documentElement.scrollWidth, innerWidth: innerWidth,
    headerRows: rows.map((row) => ({ h: r(row).h, pl: cs(row, "paddingLeft"), firstChildX: r(row.firstElementChild)?.x })),
    globalNav: { box: r(globalNav), firstItemX: r(globalNav?.firstElementChild)?.x, itemH: r(globalNav?.firstElementChild)?.h },
    campNav: campNav ? { box: r(campNav), firstItemX: r(campNav.firstElementChild)?.x, itemH: r(campNav.firstElementChild)?.h } : null,
    topBar: topBar ? { box: r(topBar), pl: cs(topBar.firstElementChild, "paddingLeft"), py: cs(topBar.firstElementChild, "paddingTop"), sticky: cs(topBar, "position"), tabsRow: topBar.children.length > 1 ? r(topBar.children[1]) : null } : null,
    h1: h1 ? { x: r(h1).x, size: cs(h1, "fontSize"), lh: cs(h1, "lineHeight"), text: h1.textContent } : null,
    main: main ? { pl: cs(main, "paddingLeft"), pt: cs(main, "paddingTop"), box: r(main), display: cs(main, "display") } : null,
    firstContentX: r(firstCard)?.x,
    askHob: askHob ? r(askHob) : null,
    campHomeLinkX: r(document.querySelector('a[title="Campaign home"]'))?.x,
    campNameHidden: (() => { const s = document.querySelector('a[title="Campaign home"] span'); return s ? cs(s, "display") : null; })(),
  };
};

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const page = await ctx.newPage();
await page.goto(`${BASE}/campaigns`);
await page.evaluate(() => localStorage.setItem("taverns.token", "scratch-token"));
const out = { screens: {}, widths: {}, remount: {} };
for (const [name, path] of screens) {
  await page.goto(`${BASE}/gallery`); await page.waitForTimeout(150);
  await page.goto(`${BASE}${path}`);
  await page.waitForTimeout(name === "chronicle" ? 2500 : 1600);
  await page.screenshot({ path: `${OUT}/${name}-1440.png` });
  out.screens[name] = await page.evaluate(measure);
}
// Hob open on overview
await page.goto(`${BASE}/campaigns/${ids.campaign}`); await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Ask Hob/ }).click(); await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/overview-hob-1440.png` });
out.screens["overview-hob"] = await page.evaluate(measure);

// Narrow widths on the overview and encounters
for (const w of [1200, 1024, 900, 760]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(`${BASE}/gallery`); await page.waitForTimeout(150);
  await page.goto(`${BASE}/campaigns/${ids.campaign}/encounters`); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/encounters-${w}.png` });
  out.widths[w] = await page.evaluate(measure);
}
await page.setViewportSize({ width: 1440, height: 900 });

// Remount test: does the shell survive an in-app navigation? Mark nodes, click a
// campaign-row link, see whether the same nodes are still connected.
await page.goto(`${BASE}/gallery`); await page.waitForTimeout(150);
await page.goto(`${BASE}/campaigns/${ids.campaign}`); await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Ask Hob/ }).click(); await page.waitForTimeout(500);
await page.evaluate(() => {
  const header = document.querySelector("#root header");
  header.__mark = "shell"; window.__header = header;
  window.__globalNav = document.querySelector('nav[aria-label="Sections"]');
  window.__panel = document.querySelector('[data-slot="sidebar"], [data-sidebar="sidebar"]');
  window.__paints = 0; const obs = new MutationObserver((m) => { window.__paints += m.length; }); obs.observe(document.getElementById("root"), { childList: true, subtree: true });
  window.__hobOpenBefore = !!document.querySelector('textarea, [data-slot="sidebar"][data-state="expanded"]');
});
await page.getByRole("link", { name: "Notes" }).click(); await page.waitForTimeout(1200);
out.remount.overviewToNotes = await page.evaluate(() => ({
  headerSurvived: window.__header.isConnected, globalNavSurvived: window.__globalNav.isConnected,
  panelSurvived: window.__panel ? window.__panel.isConnected : "no panel node found",
  hobStillOpen: !!document.querySelector('[data-slot="sidebar"][data-state="expanded"], [data-sidebar="sidebar"][data-state="expanded"]'),
  sidebarState: document.querySelector('[data-slot="sidebar"], [data-sidebar="sidebar"]')?.getAttribute("data-state"),
  mutations: window.__paints,
}));
await page.evaluate(() => { window.__header = document.querySelector("#root header"); });
await page.getByRole("link", { name: "Library" }).click(); await page.waitForTimeout(1200);
out.remount.notesToLibrary = await page.evaluate(() => ({ headerSurvived: window.__header.isConnected }));
console.log(JSON.stringify(out, null, 1));
await browser.close();
