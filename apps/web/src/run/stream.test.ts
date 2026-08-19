import { RegistryProvider, useAtomValue } from "@effect/atom-react";
import type { SessionEvent } from "@taverns/api";
import { renderHook, waitFor } from "@testing-library/react";
import { Effect, Stream } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeClient } from "../api/client";
import { campaignId, installRunServer, runId, sessionEvent, sessionId } from "./run.fixtures";
import { useLiveStream } from "./stream";

/**
 * The reconnect contract, from the client's side.
 *
 * The backend's author wrote the cursor down as a contract *because* a DM's
 * laptop sleeps and their wifi drops, so the client half is worth pinning at
 * the same level: what `?since=` carries after a drop is the difference between
 * a fight that catches up and one that quietly loses five minutes.
 *
 * These are logic, not layout, so jsdom is the right place for them — unlike
 * the two properties that had to be driven in Chromium (see `AGENTS.md`).
 *
 * The last test in this file is a different kind: it is the measurement that
 * says why this hook is still a hook while the rows it re-reads are an atom.
 */

const server = installRunServer();

/**
 * Every hook this file mounts, so `afterEach` can take them all down.
 *
 * A fiber interrupted at the end of a test does not necessarily die before the
 * next one starts, and one that woke up in between would open a connection the
 * next test would count. Unmounting here and asserting on the *last* cursor
 * rather than the whole array is what makes these deterministic under load —
 * they were not, once, under `turbo --force`.
 */
const mounted: Array<{ unmount: () => void }> = [];

const render = (options: { silenceMs?: number } = {}) => {
  const seen: Array<SessionEvent> = [];
  let reconnects = 0;
  const hook = renderHook(() =>
    useLiveStream({
      campaignId,
      sessionId,
      runId,
      enabled: true,
      onEvent: (event) => seen.push(event),
      onReconnected: () => (reconnects += 1),
      ...options,
    }),
  );
  mounted.push(hook);
  return { hook, seen, reconnects: () => reconnects };
};

/** What the newest connection asked to resume from. */
const resumedFrom = () => server.cursors.at(-1);

beforeEach(() => server.reset());
afterEach(() => {
  for (const hook of mounted.splice(0)) hook.unmount();
  server.drop();
});

describe("the live stream", () => {
  it("opens from the beginning and reports itself live", async () => {
    const { hook } = render();

    await waitFor(() => expect(server.cursors).toEqual([0]));
    await waitFor(() => expect(hook.result.current.status).toBe("live"));
  });

  it("resumes from the last seq it saw, not from the beginning", async () => {
    const { hook, seen } = render();
    await waitFor(() => expect(server.cursors).toHaveLength(1));

    server.emit(sessionEvent(4, "combatant-damaged"));
    server.emit(sessionEvent(7, "turn-advanced"));
    await waitFor(() => expect(seen).toHaveLength(2));
    await waitFor(() => expect(hook.result.current.cursor).toBe(7));

    // The connection drops the way a proxy hangs up: the body simply ends.
    server.drop();

    // Exclusive, so 8 onwards. This is the whole reconnect story: catching up
    // is the ordinary path with a cursor, not a second code path.
    await waitFor(() => expect(resumedFrom()).toBe(7), { timeout: 5000 });
    expect(server.cursors[0]).toBe(0);
    // The cursor is recorded when the *request* goes out; "live" is set when
    // the response comes back. Asserting it in the same tick is a race.
    await waitFor(() => expect(hook.result.current.status).toBe("live"), { timeout: 5000 });
  });

  it("does not let a heartbeat move the cursor", async () => {
    const { seen } = render();
    await waitFor(() => expect(server.cursors).toHaveLength(1));

    server.emit(sessionEvent(3, "run-started"));
    await waitFor(() => expect(seen).toHaveLength(1));
    // A heartbeat carries no `id` precisely so a quiet minute cannot overwrite
    // the client's place in the log. Its `seq` is informational.
    server.beat(9999);
    server.drop();

    await waitFor(() => expect(resumedFrom()).toBe(3), { timeout: 5000 });
    expect(seen).toHaveLength(1);
  });

  it("gives up on a connection that has gone silent, and opens another", async () => {
    // The worst kind of drop: nothing errors and nothing arrives, because the
    // socket is open to a machine that has gone to sleep. The server's
    // heartbeat is what makes silence detectable at all.
    const { seen } = render({ silenceMs: 120 });
    await waitFor(() => expect(server.cursors).toHaveLength(1));

    server.emit(sessionEvent(5, "combatant-added"));
    await waitFor(() => expect(seen).toHaveLength(1));

    await waitFor(() => expect(resumedFrom()).toBe(5), { timeout: 5000 });
  });

  it("re-reads the rows on a reconnect, but not on the first connection", async () => {
    const { reconnects } = render({ silenceMs: 120 });
    await waitFor(() => expect(server.cursors).toHaveLength(1));
    // Nothing to catch up on yet — the screen has just loaded.
    expect(reconnects()).toBe(0);

    await waitFor(() => expect(server.cursors.length).toBeGreaterThan(1), { timeout: 5000 });
    // Resuming the log is lossless; the *rows* are read over a separate
    // request, so coming back has to re-read them too.
    await waitFor(() => expect(reconnects()).toBeGreaterThan(0));
  });

  it("stops rather than hammering a run it cannot see", async () => {
    server.denyStream = true;
    const { hook } = render();

    await waitFor(() => expect(hook.result.current.status).toBe("stopped"), { timeout: 5000 });
    // Gone, or never visible — the server answers the same for both on
    // purpose, and no number of retries changes either.
    const attempts = server.cursors.length;
    await new Promise((resume) => setTimeout(resume, 400));
    expect(server.cursors).toHaveLength(attempts);
  });

  it("replays nothing on a duplicate reconnect, because the cursor has moved", async () => {
    const { hook, seen } = render();
    await waitFor(() => expect(server.cursors).toEqual([0]));

    server.emit(sessionEvent(6, "combatant-damaged"));
    await waitFor(() => expect(seen).toHaveLength(1));

    // Two reconnects with nothing in between. The second is redundant, and the
    // cursor is what makes it free: it asks from the same place and the server
    // has nothing past it to send. That is why this screen can afford to
    // reconnect eagerly — on `online`, on a tab becoming visible — rather than
    // carefully.
    hook.result.current.reconnect();
    await waitFor(() => expect(server.cursors).toHaveLength(2), { timeout: 5000 });
    hook.result.current.reconnect();
    await waitFor(() => expect(server.cursors).toHaveLength(3), { timeout: 5000 });

    expect(server.cursors).toEqual([0, 6, 6]);
    expect(seen).toHaveLength(1);
  });

  it("reopens on demand, from where it left off", async () => {
    const { hook, seen } = render();
    await waitFor(() => expect(server.cursors).toHaveLength(1));
    server.emit(sessionEvent(12, "run-updated"));
    await waitFor(() => expect(seen).toHaveLength(1));

    // What the "Reconnecting…" button in the top bar does.
    hook.result.current.reconnect();

    await waitFor(() => expect(resumedFrom()).toBe(12), { timeout: 5000 });
  });
});

/**
 * Why the doorbell is a hook and not an atom, measured rather than argued.
 *
 * `Atom.make` accepts a `Stream` and exposes it as an `AsyncResult`, so the
 * shape *looks* like the natural home for this file — and the rows this stream
 * causes to be re-read **are** an atom now (`run/load.ts`). The reason the
 * connection itself is not is one line of the library: a stream atom sets its
 * value to `Arr.lastNonEmpty` of each pulled chunk, so it is the *latest*
 * element rather than every element.
 *
 * That is not a theoretical difference here. Every event is a row in the log
 * panel, and a reconnect replays a run's log — several rows in one network
 * chunk is exactly what coming back from a dropped wifi looks like.
 */
describe("the doorbell as an atom's value", () => {
  const wrap = ({ children }: { children: ReactNode }) =>
    createElement(RegistryProvider, null, children);

  const eventsAtom = Atom.make(
    Stream.provide(
      Stream.unwrap(
        Effect.gen(function* () {
          const client = yield* makeClient();
          return yield* client.live.events({
            params: { campaignId, sessionId, runId },
            query: { since: 0 },
            headers: {},
          });
        }),
      ),
      FetchHttpClient.layer,
    ),
  );

  it("keeps only the last row of a chunk, where the hook delivers all of them", async () => {
    const rows = [
      sessionEvent(101, "combatant-damaged"),
      sessionEvent(102, "turn-advanced"),
      sessionEvent(103, "combatant-damaged"),
    ];

    const seen: Array<SessionEvent> = [];
    const hook = renderHook(() =>
      useLiveStream({
        campaignId,
        sessionId,
        runId,
        enabled: true,
        onEvent: (event) => seen.push(event),
      }),
    );
    mounted.push(hook);
    await waitFor(() => expect(server.cursors).toHaveLength(1));
    server.burst(rows);
    await waitFor(() => expect(seen).toHaveLength(3));
    expect(seen.map((event) => event.seq)).toEqual([101, 102, 103]);

    server.drop();
    server.reset();

    const values: Array<number> = [];
    const atom = renderHook(
      () => {
        const result = useAtomValue(eventsAtom);
        const event = AsyncResult.value(result);
        if (event._tag === "Some" && event.value.event === "session-event") {
          if (values.at(-1) !== event.value.data.seq) values.push(event.value.data.seq);
        }
        return result;
      },
      { wrapper: wrap },
    );
    mounted.push(atom);
    await waitFor(() => expect(server.cursors).toHaveLength(1));
    server.burst(rows);
    await new Promise((resume) => setTimeout(resume, 200));

    // Two rows gone, silently. The log panel would lose them and only the last
    // one would ring the bell — harmless for the re-read, which is idempotent,
    // and a hole in the one panel that tells the DM the stream is alive.
    expect(values).toEqual([103]);
  });
});
