import type {
  CampaignId,
  NpcEvent,
  NpcId,
  NpcPlayerStatus,
  NpcThreadId,
  NpcTurn as RecordedTurn,
} from "@taverns/api";
import { Effect, Fiber, Result, Stream } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeClient, runApiResult } from "../api/client";
import { classifyFailure, type ApiFailure } from "../api/failure";
import { useCredential } from "../auth/credential";
import type { Rehearsal, RehearsalTurn } from "./rehearsal";

const sentenceFor = (name: string, failure: ApiFailure): string => {
  switch (failure.kind) {
    case "rate-limited":
      return failure.message;
    case "unavailable":
      return failure.message;
    case "unauthorized":
      return `${name} could not answer: this browser has no credential the server accepts.`;
    case "missing":
      return `${name} could not answer: this NPC is not available to you.`;
    case "unreachable":
      return `${name} could not answer: the server did not respond.`;
    default:
      return `${name} could not answer: ${failure.kind === "conflict" ? failure.message : failure.detail}`;
  }
};

const shownAs = (recorded: ReadonlyArray<RecordedTurn>): ReadonlyArray<RehearsalTurn> =>
  recorded.flatMap((turn) =>
    turn.text === "" ? [] : [{ id: turn.id, who: turn.who, text: turn.text }],
  );

/** Private player↔NPC chat: own thread only, no tools, no proposals, no memory writes. */
export function useNpcPlayerChat(campaignId: CampaignId, npcId: NpcId, name: string): Rehearsal {
  const fetchCredential = useCredential();
  const [turns, setTurns] = useState<ReadonlyArray<RehearsalTurn>>([]);
  const [status, setStatus] = useState<NpcPlayerStatus | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const [writing, setWriting] = useState(false);
  const nextId = useRef(0);
  const answering = useRef<Fiber.Fiber<unknown, unknown> | undefined>(undefined);
  const credentialRef = useRef(fetchCredential);
  credentialRef.current = fetchCredential;
  const thread = useRef<NpcThreadId | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void (async () => {
      const token = await credentialRef.current();
      const result = await runApiResult(
        (client) =>
          Effect.all(
            {
              status: client.npcs.playerStatus({ params: { campaignId, npcId } }),
              threads: client.npcs.playerThreads({ params: { campaignId, npcId } }),
            },
            { concurrency: 2 },
          ).pipe(
            Effect.flatMap(({ status: current, threads }) => {
              const newest = threads[0];
              return newest === undefined
                ? Effect.succeed({
                    status: current,
                    threadId: undefined as NpcThreadId | undefined,
                    recorded: [] as ReadonlyArray<RecordedTurn>,
                  })
                : Effect.map(
                    client.npcs.playerTurns({
                      params: { campaignId, npcId, threadId: newest.id },
                    }),
                    (recorded) => ({
                      status: current,
                      threadId: newest.id as NpcThreadId | undefined,
                      recorded,
                    }),
                  );
            }),
          ),
        token,
      );
      if (!live || Result.isFailure(result)) return;
      setStatus(result.success.status);
      setTurns((current) => {
        if (current.length > 0) return current;
        thread.current = result.success.threadId;
        return shownAs(result.success.recorded);
      });
    })();
    return () => {
      live = false;
    };
  }, [campaignId, npcId]);

  useEffect(
    () => () => {
      const fiber = answering.current;
      if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber));
    },
    [],
  );

  const append = useCallback(
    (turn: RehearsalTurn) => setTurns((current) => [...current, turn]),
    [],
  );

  const say = useCallback((text: string) => {
    setWriting(true);
    setTurns((current) => {
      const last = current.at(-1);
      return last?.who === "npc"
        ? [...current.slice(0, -1), { ...last, text: last.text + text }]
        : [...current, { id: `npc-${String(nextId.current++)}`, who: "npc" as const, text }];
    });
  }, []);

  const send = useCallback(
    (text: string) => {
      if (asking) return;
      append({ id: `you-${String(nextId.current++)}`, who: "user", text });
      setAsking(true);
      setWriting(false);

      const receive = (event: NpcEvent) => {
        switch (event.event) {
          case "began":
            thread.current = event.data.threadId;
            return;
          case "delta":
            say(event.data.text);
            return;
          case "failed":
            append({ id: `npc-${String(nextId.current++)}`, who: "npc", text: event.data.message });
            return;
          default:
            return;
        }
      };

      const answer = Effect.gen(function* () {
        const token = yield* Effect.promise(() => credentialRef.current());
        const client = yield* makeClient(token);
        const continuing = thread.current;
        const stream = yield* client.npcs.talk({
          params: { campaignId, npcId },
          payload: continuing === undefined ? { text } : { threadId: continuing, text },
        });
        yield* Stream.runForEach(stream, (event) => Effect.sync(() => receive(event)));
      }).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.result,
        Effect.map((outcome) => {
          setAsking(false);
          setWriting(false);
          answering.current = undefined;
          if (Result.isFailure(outcome)) {
            append({
              id: `npc-${String(nextId.current++)}`,
              who: "npc",
              text: sentenceFor(name, classifyFailure(outcome.failure)),
            });
          }
        }),
      );

      answering.current = Effect.runFork(answer);
    },
    [append, asking, campaignId, name, npcId, say],
  );

  const reset = useCallback(() => {
    const fiber = answering.current;
    if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber));
    answering.current = undefined;
    thread.current = undefined;
    setTurns([]);
    setAsking(false);
    setWriting(false);
  }, []);

  return {
    turns,
    thinking: asking && !writing,
    send: status?.available === true ? send : undefined,
    unavailable:
      status?.available === true
        ? undefined
        : status === undefined
          ? `Checking whether ${name} can answer…`
          : `No model is configured behind ${name}. Your DM can still share the NPC, but chat is unavailable until the server is configured.`,
    status: undefined,
    lastPrompt: undefined,
    reset: turns.length > 0 ? reset : undefined,
  };
}
