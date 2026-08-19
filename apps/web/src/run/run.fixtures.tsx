import { HostedSessionScope } from "../auth/AuthProvider";
import { renderAt } from "../test/renderRoute";
import { EncounterRunId, SessionId } from "@taverns/api";
import { Schema } from "effect";
import { vi } from "vitest";
import { type HostedSession } from "../auth/hostedSession";
import {
  brannoc,
  campaign,
  campaignId,
  goblin,
  goblinBoss,
  hag,
  liveRun,
  page,
  runId as runIdRaw,
  session,
  sessionId as sessionIdRaw,
  type Answer,
  type Call,
} from "../campaign/campaign.fixtures";

/**
 * The runner's test wire: the campaign fixtures, plus a `fetch` stub that can
 * hold a stream open.
 *
 * The bodies are the JSON the server sends, reused from
 * `campaign/campaign.fixtures.tsx` so a field renamed upstream is one edit and
 * not two. What is new here is the **live** half: this stub answers
 * `…/events?since=N` with a real `ReadableStream` a test can push rows into,
 * close, and reopen — which is the only way to exercise a reconnect at all, and
 * the whole reason the runner needs a stub of its own rather than the campaign
 * view's JSON-only one.
 */

export {
  brannoc,
  campaign,
  campaignId,
  goblin,
  goblinBoss,
  hag,
  liveRun,
  session,
} from "../campaign/campaign.fixtures";

export const sessionId = Schema.decodeSync(SessionId)(sessionIdRaw);
export const runId = Schema.decodeSync(EncounterRunId)(runIdRaw);

const base = `/campaigns/${campaignId}`;
const runBase = `${base}/sessions/${sessionIdRaw}/runs/${runIdRaw}`;

/** A session pointing at the live fight, unlike the prep fixture's idle one. */
export const runningSession = { ...session, activeEncounterRunId: runIdRaw };

const stamps = { createdAt: "2026-08-04T19:00:00.000Z", updatedAt: "2026-08-04T19:00:00.000Z" };

/** One log row, as the stream sends it. */
export const sessionEvent = (
  seq: number,
  kind: string,
  combatantId: string | null = null,
): Record<string, unknown> => ({
  id: `2b1f2a1e-0000-4000-8000-${String(900000000000 + seq)}`.slice(0, 36),
  sessionId: sessionIdRaw,
  seq,
  kind,
  encounterRunId: runIdRaw,
  combatantId,
  payload: {},
  visibility: "dm",
  origin: "authored",
  assistantTurnId: null,
  ...stamps,
});

/** Everything a fight on the table answers, before a test re-aims it. */
export const liveFight = (): Map<string, Answer> =>
  new Map<string, Answer>([
    [`GET ${base}`, { status: 200, body: campaign }],
    [`GET ${base}/sessions/${sessionIdRaw}`, { status: 200, body: runningSession }],
    [`GET ${base}/creatures`, { status: 200, body: page([goblin, hag]) }],
    [`GET ${runBase}`, { status: 200, body: liveRun }],
    [`GET ${runBase}/combatants`, { status: 200, body: [brannoc, goblinBoss] }],
    // Damage is a delta, so the answer a test wants back depends on the test.
    // The default takes five off the goblin, matching the prototype's button.
    [
      `POST ${runBase}/combatants/${goblinBoss.id}/damage`,
      { status: 200, body: { ...goblinBoss, hpCurrent: goblinBoss.hpCurrent - 5 } },
    ],
    [
      `POST ${runBase}/next-turn`,
      { status: 200, body: { ...liveRun, activeCombatantId: goblinBoss.id } },
    ],
    [`PATCH ${runBase}`, { status: 200, body: { ...liveRun, visibility: "shared" } }],
    [`POST ${runBase}/combatants`, { status: 200, body: goblinBoss }],
    [`PATCH ${runBase}/combatants/${goblinBoss.id}`, { status: 200, body: goblinBoss }],
    [`DELETE ${runBase}/combatants/${goblinBoss.id}`, { status: 204, body: null }],
    [`POST ${runBase}/end`, { status: 200, body: { ...liveRun, endedAt: stamps.updatedAt } }],
  ]);

export interface RunStubServer {
  routes: Map<string, Answer>;
  readonly calls: Array<Call>;
  /** Every `?since=` the page has opened a stream with, oldest first. */
  readonly cursors: Array<number>;
  /** How many streams are open right now. */
  open: () => number;
  /** Push one log row down every open stream, SSE-encoded. */
  readonly emit: (row: Record<string, unknown>) => void;
  /** A heartbeat: no `id`, so it must not move the client's cursor. */
  readonly beat: (seq: number) => void;
  /** Several rows in **one** network chunk, the way a reconnect replays a log. */
  readonly burst: (rows: ReadonlyArray<Record<string, unknown>>) => void;
  /** Close every open stream, the way a dropped connection does. */
  readonly drop: () => void;
  /** Every request rejects, the way an unreachable API does. */
  transportDown: boolean;
  /** The stream answers 404, the way a run this credential cannot see does. */
  denyStream: boolean;
  /**
   * Hold every answer whose `"METHOD /path"` contains `match`, until released.
   *
   * The one thing an optimistic layer cannot be characterised without: every
   * rule in `run/state.ts` is about the window *between* a write leaving and
   * its answer landing, and a stub that answers in the same tick has no such
   * window. The returned function releases what is waiting — all of it, or the
   * first `n` — and releasing everything also stops holding whatever comes
   * next.
   *
   * The answer is read from `routes` at **release** time, so a test can re-aim
   * a route while its request is in flight; that is how "the server applied the
   * hit and a re-read landed first" is expressible at all.
   */
  readonly hold: (match: string) => (n?: number) => void;
  readonly reset: () => void;
}

const encoder = new TextEncoder();

/**
 * Installs the one `fetch` stub this file's tests get.
 *
 * **Once per test file, at module scope.** `FetchHttpClient.Fetch` is a
 * `Context.Reference` and `Context` memoises a reference's default the first
 * time it is read, so a per-test `vi.stubGlobal` would keep serving the first
 * test's answers with nothing to notice. See `api/client.test.ts`.
 */
export const installRunServer = (): RunStubServer => {
  let controllers: Array<ReadableStreamDefaultController<Uint8Array>> = [];
  /** Matches currently gated, each with the requests waiting behind it. */
  const gates = new Map<string, Array<() => void>>();

  const server: RunStubServer = {
    routes: liveFight(),
    calls: [],
    cursors: [],
    transportDown: false,
    denyStream: false,
    hold: (match) => {
      gates.set(match, []);
      return (n) => {
        const waiting = gates.get(match) ?? [];
        const released = n === undefined ? waiting.splice(0) : waiting.splice(0, n);
        if (n === undefined) gates.delete(match);
        for (const resume of released) resume();
      };
    },
    open: () => controllers.length,
    emit: (row) => {
      const frame = `id: ${String(row["seq"])}\nevent: session-event\ndata: ${JSON.stringify(row)}\n\n`;
      for (const controller of controllers) controller.enqueue(encoder.encode(frame));
    },
    beat: (seq) => {
      const frame = `event: heartbeat\ndata: ${JSON.stringify({ _tag: "Heartbeat", seq })}\n\n`;
      for (const controller of controllers) controller.enqueue(encoder.encode(frame));
    },
    burst: (rows) => {
      const frames = rows
        .map(
          (row) =>
            `id: ${String(row["seq"])}\nevent: session-event\ndata: ${JSON.stringify(row)}\n\n`,
        )
        .join("");
      for (const controller of controllers) controller.enqueue(encoder.encode(frames));
    },
    drop: () => {
      for (const controller of controllers) {
        try {
          controller.close();
        } catch {
          /* already closed by a test, or by the reset before it */
        }
      }
      controllers = [];
    },
    reset: () => {
      server.routes = liveFight();
      server.calls.length = 0;
      server.cursors.length = 0;
      server.transportDown = false;
      server.denyStream = false;
      for (const [, waiting] of gates) for (const resume of waiting.splice(0)) resume();
      gates.clear();
      for (const controller of controllers) {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
      controllers = [];
    },
  };

  vi.stubGlobal("fetch", (url: string | URL, init: RequestInit | undefined) => {
    if (server.transportDown) return Promise.reject(new TypeError("Failed to fetch"));

    const { pathname, search } = new URL(String(url));
    const method = init?.method ?? "GET";
    const headers = init?.headers as Record<string, string> | undefined;
    server.calls.push({
      method,
      pathname,
      search,
      authorization: headers?.["authorization"],
      body: init?.body === undefined ? "" : new TextDecoder().decode(init.body as Uint8Array),
    });

    if (pathname.endsWith("/events")) {
      server.cursors.push(Number(new URLSearchParams(search).get("since") ?? "0"));
      if (server.denyStream) {
        // Authorization happens before a stream is returned, so a denial is an
        // ordinary JSON 404 and not a failure event inside a 200.
        return Promise.resolve(
          new Response(
            JSON.stringify({ _tag: "NotFound", resource: "encounter_run", id: runIdRaw }),
            {
              status: 404,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      }
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controllers.push(controller);
        },
      });
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
      );
    }

    // Read at *answer* time rather than at request time, so a route re-aimed
    // while a held request is in flight answers with the new body.
    const answer = () => {
      const found = server.routes.get(`${method} ${pathname}`) ?? {
        status: 404,
        body: { _tag: "NotFound", resource: "encounter_run", id: runIdRaw },
      };
      return new Response(found.status === 204 ? null : JSON.stringify(found.body), {
        status: found.status,
        headers: { "content-type": "application/json" },
      });
    };

    const key = `${method} ${pathname}`;
    for (const [match, waiting] of gates) {
      if (key.includes(match)) {
        return new Promise<void>((resume) => waiting.push(resume)).then(answer);
      }
    }
    return Promise.resolve(answer());
  });

  return server;
};

const noSession: HostedSession = {
  configured: false,
  signedIn: false,
  loading: false,
  fetchToken: () => Promise.resolve(undefined),
};

/**
 * Annotated `void`: Testing Library's `RenderResult` names a type inside
 * `@testing-library/dom`, which pnpm's isolated layout puts out of reach of an
 * exported signature — the same TS2742 the server hits with `@clerk/shared`.
 */
export const renderRunner = async (): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/sessions/${sessionId}/runs/${runId}`, (screen) => (
    <HostedSessionScope session={noSession}>{screen}</HostedSessionScope>
  ));
};

/** The JSON body of the first call matching a method and a path fragment. */
export const bodyOf = (server: RunStubServer, method: string, fragment: string): unknown => {
  const call = server.calls.find(
    (entry) => entry.method === method && entry.pathname.includes(fragment),
  );
  return call === undefined || call.body === "" ? undefined : JSON.parse(call.body);
};
