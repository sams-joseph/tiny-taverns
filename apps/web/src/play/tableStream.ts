import type { CampaignId, PlayerLiveEvent, SessionId } from "@taverns/api";
import { Duration, Effect, Fiber, Stream } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeClient } from "../api/client";
import { classifyFailure } from "../api/failure";
import { useCredential } from "../auth/credential";

export type PlayerTableStreamStatus = "connecting" | "live" | "reconnecting" | "stopped";

const BACKOFF_MS = [250, 1_000, 2_000, 5_000, 10_000, 20_000] as const;
const SILENCE_MS = 45_000;

export interface PlayerTableConnection {
  readonly status: PlayerTableStreamStatus;
  readonly cursor: number;
  readonly reconnect: () => void;
}

/**
 * Player live updates are a contentless doorbell. A tick carries only a cursor;
 * the screen re-reads `/table` and its own character log through narrow
 * endpoints and never branches on `session_event.payload`.
 */
export function usePlayerTableStream({
  campaignId,
  sessionId,
  enabled,
  onTick,
  onReconnected,
  silenceMs = SILENCE_MS,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId | undefined;
  readonly enabled: boolean;
  readonly onTick: () => void;
  readonly onReconnected?: () => void;
  readonly silenceMs?: number;
}): PlayerTableConnection {
  const fetchCredential = useCredential();
  const [status, setStatus] = useState<PlayerTableStreamStatus>("connecting");
  const [cursor, setCursor] = useState(0);
  const [generation, setGeneration] = useState(0);
  const cursorRef = useRef(0);
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const onReconnectedRef = useRef(onReconnected);
  onReconnectedRef.current = onReconnected;
  const credentialRef = useRef(fetchCredential);
  credentialRef.current = fetchCredential;
  const everConnected = useRef(false);
  const streamKeyRef = useRef<string | undefined>(undefined);
  const reconnect = useCallback(() => setGeneration((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || sessionId === undefined) return;
    const streamKey = `${campaignId}:${sessionId}`;
    if (streamKeyRef.current !== streamKey) {
      streamKeyRef.current = streamKey;
      cursorRef.current = 0;
      setCursor(0);
      everConnected.current = false;
    }
    let heard = false;
    let strikes = 0;

    const receive = (event: PlayerLiveEvent) => {
      heard = true;
      if (event.event === "heartbeat") return;
      const seq = Number(event.id);
      if (Number.isSafeInteger(seq) && seq > cursorRef.current) {
        cursorRef.current = seq;
        setCursor(seq);
      }
      onTickRef.current();
    };

    const attempt = Effect.gen(function* () {
      const token = yield* Effect.promise(() => credentialRef.current());
      const client = yield* makeClient(token);
      const stream = yield* client.table.events({
        params: { campaignId, sessionId },
        query: { since: cursorRef.current },
      });
      setStatus("live");
      if (everConnected.current) onReconnectedRef.current?.();
      everConnected.current = true;
      yield* Stream.runForEach(Stream.timeout(stream, Duration.millis(silenceMs)), (event) =>
        Effect.sync(() => receive(event)),
      );
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.catchDefect((defect) => Effect.fail(defect)),
    );

    const loop = Effect.gen(function* () {
      for (;;) {
        heard = false;
        const result = yield* Effect.result(attempt);
        if (result._tag === "Failure") {
          const failure = classifyFailure(result.failure);
          if (failure.kind === "missing" || failure.kind === "unauthorized") {
            setStatus("stopped");
            return;
          }
        }
        setStatus("reconnecting");
        strikes = heard ? 0 : Math.min(strikes + 1, BACKOFF_MS.length - 1);
        yield* Effect.sleep(Duration.millis(BACKOFF_MS[strikes]!));
      }
    });

    const fiber = Effect.runFork(loop);
    const reconnectNow = () => setGeneration((n) => n + 1);
    window.addEventListener("online", reconnectNow);
    document.addEventListener("visibilitychange", reconnectNow);
    return () => {
      window.removeEventListener("online", reconnectNow);
      document.removeEventListener("visibilitychange", reconnectNow);
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [campaignId, enabled, generation, sessionId, silenceMs]);

  return { status, cursor, reconnect };
}
