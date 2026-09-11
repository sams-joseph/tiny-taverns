/* Scratch only — never committed. Serves the web test fixtures over HTTP so the
   real app can be screenshotted with no Postgres on this machine. */
import { createServer } from "node:http";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, history: dom.window.history });

const { fullCampaign } = await import("../src/campaign/campaign.fixtures");
const { fullChronicle } = await import("../src/chronicle/chronicle.fixtures");
const { fullParty } = await import("../src/party/party.fixtures");
const { twoTables } = await import("../src/characters/characters.fixtures");
const { fullRules } = await import("../src/rules/rules.fixtures");
const { liveFight } = await import("../src/run/run.fixtures");
type Answer = { status: number; body?: unknown; sse?: unknown };

const routes = new Map<string, Answer>();
for (const layer of [liveFight(), fullRules(), twoTables(), fullChronicle(), fullParty(), fullCampaign()] as Array<Map<string, Answer>>) {
  for (const [key, answer] of layer) routes.set(key, answer);
}
console.log(`${routes.size} routes`);
for (const k of routes.keys()) console.log("  " + k);

createServer((req, res) => {
  const origin = req.headers.origin ?? "*";
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-headers", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url ?? "/", "http://x");
  const key = `${req.method} ${url.pathname}`;
  const answer = routes.get(key);
  if (answer === undefined) {
    console.log("MISS", key);
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ _tag: "NotFound", resource: "campaign", id: "x" }));
    return;
  }
  if (answer.sse !== undefined) {
    res.writeHead(answer.status, { "content-type": "text/event-stream" });
    res.end(typeof answer.sse === "string" ? answer.sse : "");
    return;
  }
  const body = typeof answer.body === "function" ? (answer.body as () => unknown)() : answer.body;
  res.writeHead(answer.status, { "content-type": "application/json" });
  res.end(answer.status === 204 ? undefined : JSON.stringify(body));
}).listen(3000, "127.0.0.1", () => console.log("stub API on :3000"));
