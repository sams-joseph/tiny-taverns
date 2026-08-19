import type { LiveEvent, SessionEvent } from "@taverns/api";
import { Duration, Effect, Fiber, Result, Stream } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeClient } from "../api/client";
import { classifyFailure } from "../api/failure";
import { useCredential } from "../auth/credential";
import type { RunPath } from "./load";

/**
 * The live stream, consumed the way its author designed it to be consumed.
 *
 * ### The stream is a doorbell here too
 *
 * The server publishes `{sessionId}` and re-reads the log from SQL; this hook
 * receives a `SessionEvent` and re-reads the *run and its combatants* from the
 * API. It deliberately does not apply the event's `payload` to local state —
 * `SessionEvent.payload` is "the human-legible remainder", explicitly not a
 * contract anything branches on, and a screen that reconstructed hit points
 * from it would be a second implementation of the clamp in
 * `Combatants.damage`. Re-reading keeps one answer to every question, and the
 * re-read is two requests.
 *
 * ### Reconnect is the ordinary path, not a special one
 *
 * `cursor` is the highest `seq` this screen has seen, kept in a ref so it
 * survives every reconnect and can be read synchronously at the moment a new
 * connection is opened. Every attempt asks for `?since=<cursor>`, so:
 *
 *   - a first connection replays this run's log from the beginning,
 *   - a reconnect after a dropped wifi replays only what was missed,
 *   - a duplicate reconnect replays nothing, because the cursor has moved.
 *
 * There is no separate catch-up request and no "am I resuming?" branch. That is
 * the property the backend's author built the cursor for, and it is why the
 * screen can afford to reconnect eagerly rather than carefully.
 *
 * `?since=` and not `Last-Event-ID`: the derived client issues a plain `fetch`,
 * and a plain `fetch` does not resend that header. The server honours both.
 *
 * ### Three ways a connection ends, all handled the same
 *
 * **It errors.** The transport failed or the server answered badly. Retried.
 *
 * **It closes cleanly.** The server was restarted, or a proxy hung up. `fetch`
 * reports that as a stream that simply ends, which is indistinguishable from
 * "nothing more to say" — so a stream that ends is treated as a disconnect and
 * retried, because a live fight's stream is never finished.
 *
 * **It goes silent.** The worst one, and the reason `Stream.timeout` is here: a
 * laptop that sleeps or a wifi that drops leaves a TCP connection that is
 * "open" indefinitely from both ends with nothing ever arriving. The server
 * emits a heartbeat every `LIVE_HEARTBEAT_SECONDS` (default 20) precisely so a
 * client can tell that apart from a quiet fight; `SILENCE_MS` is over two of
 * those, so a healthy connection never trips it and a dead one is noticed in
 * well under a minute rather than when the DM notices.
 *
 * On top of that, `online` and a tab becoming visible force an immediate
 * reconnect. A redundant reconnect costs one request that returns no rows —
 * the cursor makes it free — and that is what turns "the lid was shut for an
 * hour" into a page that is correct before the DM has finished sitting down.
 */

/** What the screen tells the DM about the connection. */
export type LiveStatus =
  /** Opening, or reopening. Nothing is known to be stale yet. */
  | "connecting"
  /** Connected. Events are arriving. */
  | "live"
  /** Not connected, waiting to try again. What the DM sees as "Reconnecting…". */
  | "reconnecting"
  /** Given up: the run is gone or was never visible. Retrying cannot fix it. */
  | "stopped";

/**
 * How long a connection may say nothing before it is presumed dead.
 *
 * Two heartbeats at the server's default of 20 seconds, plus room for a slow
 * one. A deployment that raises `LIVE_HEARTBEAT_SECONDS` above this would make
 * every healthy connection reconnect on a timer — noisy, and lossless, but the
 * pairing is worth knowing about.
 */
export const SILENCE_MS = 45_000;

/**
 * How long to wait before the next attempt, by consecutive fruitless ones.
 *
 * The first step is short on purpose: a connection that was healthy and then
 * dropped is almost always a blip, and a DM mid-fight should not watch a
 * spinner for a second to find that out. `strikes` only grows for attempts that
 * produced *nothing at all*, so a connection that lived an hour and then failed
 * starts again from the top of this list rather than from wherever the last
 * outage left the backoff.
 */
const BACKOFF_MS = [250, 1_000, 2_000, 5_000, 10_000, 20_000, 30_000] as const;

export interface LiveConnection {
  readonly status: LiveStatus;
  /** The highest `seq` seen. Rendered nowhere; useful in a test and in a log. */
  readonly cursor: number;
  /** Reopen now, from the current cursor. Bound to the "Try again" button. */
  readonly reconnect: () => void;
}

export interface LiveStreamOptions extends RunPath {
  /** Off while the initial load is in flight, and once the fight has ended. */
  readonly enabled: boolean;
  /**
   * Called for every log row, in `seq` order. Must be stable enough not to
   * matter — it is held in a ref, so its identity never reopens the stream.
   */
  readonly onEvent: (event: SessionEvent) => void;
  /**
   * Called when a connection is re-established, and *not* on the first one.
   *
   * This closes a hole that only shows up in a browser. Resuming from the
   * cursor is lossless for events the server has, but the screen's rows are
   * read over a *separate* request — so a client that received an event and
   * then failed to re-read it (wifi gone: the open stream still delivers, a new
   * `fetch` cannot leave) reconnects to a stream with nothing new to replay and
   * stays quietly behind the server. Measured in Chromium. Re-reading whenever
   * the connection comes back makes "connect, catch up, tail" true of the rows
   * as well as of the log, which is the property the cursor was designed to
   * give and the reason it can be relied on.
   */
  readonly onReconnected?: () => void;
  /** Overridable so a test can prove the silence timeout in milliseconds. */
  readonly silenceMs?: number;
}

export function useLiveStream({
  campaignId,
  sessionId,
  runId,
  enabled,
  onEvent,
  onReconnected,
  silenceMs = SILENCE_MS,
}: LiveStreamOptions): LiveConnection {
  const fetchCredential = useCredential();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [cursor, setCursor] = useState(0);
  const [generation, setGeneration] = useState(0);

  /**
   * The cursor, twice: once as state for rendering and once as a ref for the
   * fiber. The ref is the one that matters — it is read at the instant a
   * connection is opened, and React state is a frame behind by design.
   */
  const cursorRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onReconnectedRef = useRef(onReconnected);
  onReconnectedRef.current = onReconnected;
  const credentialRef = useRef(fetchCredential);
  credentialRef.current = fetchCredential;
  /** Survives the effect being torn down, which is what makes "re-" mean re-. */
  const everConnected = useRef(false);

  const reconnect = useCallback(() => setGeneration((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;

    /** Reset per attempt: an attempt that heard nothing is a failed one. */
    let heard = false;
    let strikes = 0;

    const receive = (event: LiveEvent) => {
      heard = true;
      // A heartbeat carries no `id` and is not a log row: it exists to prove
      // the connection is alive, and consuming it is the whole point.
      if (event.event === "heartbeat") return;

      const row = event.data;
      if (row.seq > cursorRef.current) {
        cursorRef.current = row.seq;
        setCursor(row.seq);
      }
      onEventRef.current(row);
    };

    const attempt = Effect.gen(function* () {
      // Fetched per attempt, never held: a hosted session token lives 60
      // seconds and a fight lasts hours, so the token that opened the first
      // connection is expired long before the third one. Same rule as
      // `useApiResource`; `auth/credential.ts` says why.
      const token = yield* Effect.promise(() => credentialRef.current());
      const client = yield* makeClient(token);
      const stream = yield* client.live.events({
        params: { campaignId, sessionId, runId },
        query: { since: cursorRef.current },
        // The endpoint declares the header for a browser's native
        // `EventSource`, which cannot rewrite its query string on the automatic
        // reconnect but does resend this. We are not that client — a plain
        // `fetch` never resends it — so the cursor travels in `?since=` and
        // this stays absent rather than duplicating it.
        headers: {},
      });

      // The response has arrived and it was a 200: the endpoint authorises
      // before it returns a stream at all, so reaching here means connected.
      setStatus("live");
      if (everConnected.current) onReconnectedRef.current?.();
      everConnected.current = true;

      yield* Stream.runForEach(Stream.timeout(stream, Duration.millis(silenceMs)), (event) =>
        Effect.sync(() => receive(event)),
      );
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      // A defect here would kill the loop and leave the screen silently
      // stale, which is the one outcome worse than reconnecting too often.
      Effect.catchDefect((defect) => Effect.fail(defect)),
    );

    const loop = Effect.gen(function* () {
      for (;;) {
        heard = false;
        setStatus("connecting");

        // `result` and not `exit`: an interrupt must unwind this loop rather
        // than be caught and retried, and that is exactly the difference.
        const outcome = yield* Effect.result(attempt);

        if (Result.isFailure(outcome) && classifyFailure(outcome.failure).kind === "missing") {
          // The run is gone, or was never visible to this credential. The
          // server answers the same for both on purpose, and neither is
          // something another attempt can change.
          setStatus("stopped");
          return;
        }

        strikes = heard ? 0 : strikes + 1;
        setStatus("reconnecting");
        yield* Effect.sleep(
          Duration.millis(BACKOFF_MS[Math.min(strikes, BACKOFF_MS.length - 1)] ?? 0),
        );
      }
    });

    const fiber = Effect.runFork(loop);

    // Both mean "the machine may have been away": reopen now rather than wait
    // out a backoff or a silence timeout. Bumping the generation tears this
    // effect down and builds it again, which is the same code path as a first
    // connection — there is no second one to get wrong.
    const wake = () => {
      if (document.visibilityState === "visible") reconnect();
    };
    globalThis.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", wake);

    return () => {
      globalThis.removeEventListener("online", reconnect);
      document.removeEventListener("visibilitychange", wake);
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [campaignId, sessionId, runId, enabled, silenceMs, generation, reconnect]);

  return { status, cursor, reconnect };
}
