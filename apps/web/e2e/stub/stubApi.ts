import type { Plugin } from "vite";

/**
 * The stub API: the Vitest fixture maps (`src/test/scenarios.ts`) answered
 * over HTTP under `/stub`, on the Vite server's own origin.
 *
 * Each request names its scenario in a header the suite's `app` fixture sets
 * on the browser context (`e2e/support/app.ts`), so parallel workers on one
 * server never share a mutable "current scenario". A request the scenario has
 * no answer for is a 404 marked `x-e2e-unanswered`, which the fixture records
 * against the test that made it.
 */
export const SCENARIO_HEADER = "x-e2e-scenario";
export const UNANSWERED_HEADER = "x-e2e-unanswered";
/** The cover every campaign and Shared World is drawn with, under `/stub`. */
export const COVER_PATH = "/e2e-cover.svg";
export const COVER_PITCH = "Four strangers walk a salt caravan to the coast.";

/**
 * The fixture modules import `vitest`, the render harness and the auth
 * provider for their `install*` and `render*` helpers, which the stub never
 * calls and which would build a router at import. Shimmed for the SSR load
 * only — nothing but `src/test/scenarios.ts` is loaded that way — so the
 * browser bundle is the real app.
 */
const shims: Record<string, string> = {
  "\0e2e:vitest": "export const vi = new Proxy({}, { get: () => () => undefined });",
  "\0e2e:renderRoute": `export const TEST_MACHINE_TOKEN = "a-test-token";
export const renderAt = () => { throw new Error("renderAt is not available to the stub API"); };`,
  "\0e2e:auth": "export const HostedSessionScope = ({ children }) => children;",
};

interface Answer {
  readonly status: number;
  readonly body?: unknown;
  readonly sse?: string;
}

export function stubApi(): Plugin {
  const loaded = new Map<string, Map<string, Answer>>();
  return {
    name: "e2e-stub-api",
    // Ahead of Vite's own resolver, which would otherwise answer first.
    enforce: "pre",
    resolveId(id, _importer, options) {
      if (options?.ssr !== true) return undefined;
      if (id === "vitest") return "\0e2e:vitest";
      if (id.endsWith("/test/renderRoute")) return "\0e2e:renderRoute";
      if (id.endsWith("/auth/AuthProvider")) return "\0e2e:auth";
      return undefined;
    },
    load: (id) => shims[id],
    configureServer(server) {
      const routesFor = async (scenario: string) => {
        const cached = loaded.get(scenario);
        if (cached !== undefined) return cached;
        const { scenarios } = (await server.ssrLoadModule("/src/test/scenarios.ts")) as {
          scenarios: Record<string, (() => Map<string, Answer>) | undefined>;
        };
        const make = scenarios[scenario];
        if (make === undefined) throw new Error(`no scenario named "${scenario}"`);
        const routes = make();
        // Every Overview hero is drawn with a pitch and a cover, the harder
        // case: the name rises over the picture and the actions must not
        // (`e2e/layout/hero.spec.ts`, which takes each away in turn).
        for (const [key, answer] of routes)
          if (/^GET \/(campaigns|worlds)\/[^/]+$/.test(key) && answer.status === 200)
            routes.set(key, {
              ...answer,
              body: {
                ...(answer.body as object),
                description: COVER_PITCH,
                image: { cardUrl: COVER_PATH, fullUrl: COVER_PATH },
              },
            });
        loaded.set(scenario, routes);
        return routes;
      };

      server.middlewares.use("/stub", (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://stub");
        const scenario = req.headers[SCENARIO_HEADER];
        const send = (status: number, body: unknown, type = "application/json") => {
          res.statusCode = status;
          if (status === 204) return res.end();
          res.setHeader("content-type", type);
          // `null` is a body: `GET …/history/summary` answers it on purpose.
          res.end(type === "application/json" ? JSON.stringify(body ?? null) : String(body));
        };
        if (url.pathname === COVER_PATH) {
          return send(
            200,
            '<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="slategray"/></svg>',
            "image/svg+xml",
          );
        }
        if (typeof scenario !== "string") {
          return send(400, { _tag: "BadRequest", message: `no ${SCENARIO_HEADER} header` });
        }
        routesFor(scenario)
          .then((routes) => {
            const key = `${req.method} ${url.pathname}`;
            const answer = routes.get(key);
            if (answer === undefined) {
              res.setHeader(UNANSWERED_HEADER, key);
              return send(404, { _tag: "NotFound", resource: "e2e", id: url.pathname });
            }
            if (answer.sse !== undefined)
              return send(answer.status, answer.sse, "text/event-stream");
            return send(
              answer.status,
              typeof answer.body === "function" ? (answer.body as () => unknown)() : answer.body,
            );
          })
          .catch(next);
      });
    },
  };
}
