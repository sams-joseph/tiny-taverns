import { HostedSessionScope } from "../auth/AuthProvider";
import { renderAt } from "../test/renderRoute";
import { EncounterRunId, HobDirectResourceUpdateId, SessionId } from "@taverns/api";
import { Schema } from "effect";
import { vi } from "vitest";
import {
  brannoc,
  campaign,
  campaignId,
  cazril,
  character,
  characterSeat,
  goblin,
  goblinBoss,
  bargainId,
  liveRun,
  npcId,
  page,
  readAloud,
  runId as runIdRaw,
  session,
  sessionId as sessionIdRaw,
  stormId,
  wellId,
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
  cazril,
  goblin,
  goblinBoss,
  hag,
  liveRun,
  npcId,
  playerCazril,
  session,
} from "../campaign/campaign.fixtures";
import { TEST_SESSION } from "../test/session";
import { fullPartySeats, sorrelCharacter } from "../party/party.fixtures";

export const sessionId = Schema.decodeSync(SessionId)(sessionIdRaw);
export const runId = Schema.decodeSync(EncounterRunId)(runIdRaw);
export const directUpdateId = Schema.decodeSync(HobDirectResourceUpdateId)(
  "2b1f2a1e-0000-4000-8000-000000000f81",
);

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

export const directUpdate = {
  id: directUpdateId,
  sessionId: sessionIdRaw,
  encounterRunId: runIdRaw,
  combatantId: brannoc.id,
  characterId: brannoc.characterId,
  characterName: "Brannoc",
  resourceId: "lay-on-hands",
  resourceName: "Lay on Hands",
  resourceMax: 15,
  amount: 1,
  beforeUsed: 2,
  afterUsed: 3,
  assistantTurnId: "2b1f2a1e-0000-4000-8000-000000000f91",
  undoneAt: null,
  createdAt: "2026-08-04T19:05:00.000Z",
};

/**
 * The fight's own board, as `runs.board` answers the DM: the encounter's map
 * as it stood when the fight began, with no picture.
 */
export const runBoard = {
  mapId: "2b1f2a1e-0000-4000-8000-000000000611",
  setting: "A boardwalk over black water",
  grid: "square",
  columns: 24,
  rows: 16,
  feetPerCell: 5,
  alignment: { cellPx: 64, offsetXPx: 0, offsetYPx: 0 },
  image: null,
  imagePending: false,
};

/**
 * Brannoc standing on the board, where the fixture fight has him: the sixth
 * square across and the fifth down. The Goblin Boss is not on it yet, so the
 * tray has someone in it.
 */
export const brannocPlaced = { ...brannoc, position: { column: 5, row: 4 } };

/**
 * The party as the runner reads it, for a character's speed: Brannoc's sheet
 * says 25 ft, which is under the Goblin Boss's 30 and so tells the two apart.
 */
export const runParty = [
  {
    seat: characterSeat,
    character: { ...character, sheet: { ...character.sheet, identity: { speed: "25 ft." } } },
  },
];

/** Everything a fight on the table answers, before a test re-aims it. */
export const liveFight = (): Map<string, Answer> =>
  new Map<string, Answer>([
    [`GET ${base}`, { status: 200, body: campaign }],
    [`GET ${base}/sessions/${sessionIdRaw}`, { status: 200, body: runningSession }],
    // The frame resolves each combatant's creature by id — the instancing
    // decision of 2026-09-02 took campaign instances off the corpus list, so
    // only the by-id read reaches what a fight's rows point at.
    [`GET ${base}/creatures/${goblin.id}`, { status: 200, body: goblin }],
    [`GET ${runBase}`, { status: 200, body: liveRun }],
    [`GET ${runBase}/combatants`, { status: 200, body: [brannocPlaced, goblinBoss] }],
    [`GET ${base}/party`, { status: 200, body: runParty }],
    [`GET ${base}/sessions/${sessionIdRaw}/rolls`, { status: 200, body: [] }],
    [`GET ${base}/npcs`, { status: 200, body: [cazril] }],
    [`GET ${base}/npcs/-/sessions/${sessionIdRaw}`, { status: 200, body: [] }],
    [`GET ${base}/npcs/-/sessions/${sessionIdRaw}/monitor`, { status: 200, body: [] }],
    [`GET ${base}/npcs/${npcId}/proposals`, { status: 200, body: [] }],
    [
      `GET ${base}/table/sessions/${sessionIdRaw}/events`,
      {
        status: 200,
        sse: 'event: tick\ndata: {"cursor":"0"}\n\n',
      },
    ],
    [`GET ${runBase}/hob-direct-updates`, { status: 200, body: [] }],
    [`GET ${runBase}/board`, { status: 200, body: runBoard }],
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
    // A move answers with the row where it now stands; a test re-aims these
    // at the square it clicks.
    [
      `POST ${runBase}/combatants/${goblinBoss.id}/move`,
      { status: 200, body: { ...goblinBoss, position: { column: 8, row: 6 } } },
    ],
    [
      `POST ${runBase}/combatants/${brannoc.id}/move`,
      { status: 200, body: { ...brannocPlaced, position: { column: 6, row: 4 } } },
    ],
    [`POST ${runBase}/end`, { status: 200, body: { ...liveRun, endedAt: stamps.updatedAt } }],
  ]);

/** The three kinds of scene a run can be besides a fight. */
export type SceneMode = "social" | "challenge" | "hazard";

/** A second party member, seeded from Sorrel — whose sheet has all six saves. */
export const sorrel = {
  ...brannoc,
  id: "2b1f2a1e-0000-4000-8000-000000000d03",
  characterId: sorrelCharacter.id,
  displayName: "Sorrel",
  subtitle: "Wood elf ranger",
  playerName: "Kofi",
  hpCurrent: 27,
  hpMax: 27,
  ac: 15,
  conditions: [],
};

/** The other side of a conversation: an NPC row with no stat block to fetch. */
export const greenHag = {
  ...goblinBoss,
  id: "2b1f2a1e-0000-4000-8000-000000000d04",
  creatureId: null,
  displayName: "Green Hag",
  subtitle: "Medium fey",
  conditions: [],
};

/** A read-aloud attached to the hag's bargain, so the conversation has one to show. */
export const bargainReadAloud = {
  ...readAloud,
  id: "2b1f2a1e-0000-4000-8000-000000000a71",
  title: "The hut",
  body: "The hut stands on legs of driftwood. A kettle is already whistling, and there are exactly four cups set out.",
  attachedTo: { kind: "encounter", id: bargainId },
};

/** One logged line, as the scene answers it. */
export const loggedCheck = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: "2b1f2a1e-0000-4000-8000-000000000e01",
  runId: runIdRaw,
  combatantId: brannoc.id,
  displayName: "Brannoc",
  skill: null,
  save: null,
  total: null,
  dc: null,
  outcome: "success",
  stage: null,
  createdAt: "2026-08-04T19:10:00.000Z",
  ...over,
});

/** The run, played as a scene rather than a fight: nobody is up. */
export const sceneRun = (mode: SceneMode): Record<string, unknown> => ({
  ...liveRun,
  mode,
  activeCombatantId: null,
  ...(mode === "social"
    ? { encounterId: bargainId, encounterName: "The hag's bargain" }
    : mode === "challenge"
      ? { encounterId: wellId, encounterName: "The dry well" }
      : { encounterId: stormId, encounterName: "Salt-flat sandstorm" }),
});

/** Each scene part-way through, as `runs.scene` answers the DM. */
export const sceneOf = (mode: SceneMode): Record<string, unknown> =>
  mode === "social"
    ? {
        runId: runIdRaw,
        beats: [
          {
            text: "She wants the warm crate and offers news of a lost brother in exchange.",
            done: true,
          },
          { text: "If insulted, she vanishes and the wisps lead the party into mud.", done: false },
        ],
        challenge: null,
        attitude: "hostile",
        stage: null,
        stages: null,
        checks: [loggedCheck({ skill: "Persuasion", total: 12, dc: 15, outcome: "failure" })],
      }
    : mode === "challenge"
      ? {
          runId: runIdRaw,
          beats: [
            { text: "Each failure costs one day's water for the caravan.", done: false },
            { text: "Two failures: the caravan master pushes on through the night.", done: false },
          ],
          challenge: {
            kind: "challenge",
            dc: 14,
            successes: 3,
            failures: 2,
            skills: ["Athletics", "Survival", "Investigation", "Nature"],
            onSuccess: "They find the buried cache and a safe route across the flats.",
          },
          attitude: null,
          stage: null,
          stages: null,
          checks: [
            loggedCheck({
              combatantId: sorrel.id,
              displayName: "Sorrel",
              skill: "Survival",
              total: 15,
              dc: 14,
            }),
          ],
        }
      : {
          runId: runIdRaw,
          beats: [{ text: "Visibility drops to 10 ft; the caravan can split.", done: false }],
          challenge: {
            kind: "hazard",
            save: { ability: "CON", dc: 13 },
            onFail: "1 level of exhaustion",
            duration: "1d4 hours",
            skills: ["Survival", "Animal Handling"],
          },
          attitude: null,
          stage: 1,
          stages: 2,
          checks: [loggedCheck({ save: "CON", total: 17, dc: 13, stage: 1 })],
        };

/**
 * Everything a scene on the table answers: the fight's routes, with the run
 * played as this kind, the party (with their sheets, for *Roll for them*), a
 * read-aloud, and the scene and its writes.
 */
export const liveScene = (mode: SceneMode): Map<string, Answer> => {
  const routes = liveFight();
  const run = sceneRun(mode);
  const scene = sceneOf(mode);
  routes.set(`GET ${runBase}`, { status: 200, body: run });
  routes.set(`GET ${runBase}/combatants`, {
    status: 200,
    body: mode === "social" ? [brannoc, sorrel, greenHag] : [brannoc, sorrel],
  });
  routes.set(`GET ${base}/sessions/${sessionIdRaw}/runs`, { status: 200, body: [run] });
  routes.set(`GET ${base}/party`, { status: 200, body: fullPartySeats });
  routes.set(`GET ${base}/notes`, { status: 200, body: page([readAloud, bargainReadAloud]) });
  routes.set(`GET ${runBase}/scene`, { status: 200, body: scene });
  routes.set(`PATCH ${runBase}/scene`, { status: 200, body: scene });
  routes.set(`POST ${runBase}/checks`, { status: 200, body: loggedCheck({}) });
  routes.set(`DELETE ${runBase}/checks/2b1f2a1e-0000-4000-8000-000000000e01`, {
    status: 204,
    body: null,
  });
  routes.set(`POST ${runBase}/escalate`, { status: 200, body: { ...run, mode: "combat" } });
  routes.set(`POST ${runBase}/end`, {
    status: 200,
    body: { ...run, endedAt: stamps.updatedAt },
  });
  return routes;
};

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

    if (pathname.includes("/table/sessions/") && pathname.endsWith("/events")) {
      const found = server.routes.get(`${method} ${pathname}`) ?? {
        status: 404,
        body: { _tag: "NotFound", resource: "session", id: sessionIdRaw },
      };
      return Promise.resolve(
        new Response(found.sse ?? (found.status === 204 ? null : JSON.stringify(found.body)), {
          status: found.status,
          headers: {
            "content-type": found.sse === undefined ? "application/json" : "text/event-stream",
          },
        }),
      );
    }

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
      const body = typeof found.body === "function" ? found.body() : found.body;
      return new Response(found.status === 204 ? null : JSON.stringify(body), {
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

/**
 * Annotated `void`: Testing Library's `RenderResult` names a type inside
 * `@testing-library/dom`, which pnpm's isolated layout puts out of reach of an
 * exported signature — the same TS2742 the server hits with `@clerk/shared`.
 */
export const renderRunner = async (): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/sessions/${sessionId}/runs/${runId}`, (screen) => (
    <HostedSessionScope session={TEST_SESSION}>{screen}</HostedSessionScope>
  ));
};

/** The JSON body of the first call matching a method and a path fragment. */
export const bodyOf = (server: RunStubServer, method: string, fragment: string): unknown => {
  const call = server.calls.find(
    (entry) => entry.method === method && entry.pathname.includes(fragment),
  );
  return call === undefined || call.body === "" ? undefined : JSON.parse(call.body);
};
