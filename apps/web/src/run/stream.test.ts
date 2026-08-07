import type { SessionEvent } from "@taverns/api";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
