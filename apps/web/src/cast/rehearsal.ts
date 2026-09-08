import type {
  CampaignId,
  NpcEvent,
  NpcId,
  NpcRehearsalStatus,
  NpcThreadId,
  NpcTurn as RecordedTurn,
} from "@taverns/api";
import { Effect, Fiber, Result, Stream } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeClient, runApiResult } from "../api/client";
import { classifyFailure, type ApiFailure } from "../api/failure";
import { useCredential } from "../auth/credential";

/**
 * The creator's rehearsal with one NPC — `hob/conversation.ts`'s shape with
 * the parts an NPC does not have taken out: no tools, no activity line, no
 * proposals, no accept. It asks whether a model is behind the NPC, resumes the
 * newest thread, streams a reply, and holds the prompt metadata the inspector
 * shows.
 *
 * The transcript lives on the server, so this holds a **thread id** rather
 * than a transcript — in a ref, because `began` writes it mid-reply and a
 * re-render in between would split one rehearsal into two threads.
 */

export interface RehearsalTurn {
  readonly id: string;
  readonly who: "user" | "npc";
  readonly text: string;
}

export interface Rehearsal {
  /** Newest last. Empty renders the invitation to start. */
  readonly turns: ReadonlyArray<RehearsalTurn>;
  /** A reply is on its way and nothing has arrived yet. */
  readonly thinking: boolean;
  /** Undefined until the status read answers, and when no model is configured. */
  readonly send: ((text: string) => void) | undefined;
  /** Why `send` is undefined, in a sentence with the fix in it. */
  readonly unavailable: string | undefined;
  /** The template version and token estimate — the inspector's facts, never the prompt. */
  readonly status: NpcRehearsalStatus | undefined;
  /**
   * The prompt metadata of the *last reply*, from its `began` event: what the
   * model was actually shown for that line, as opposed to the persona's
   * standing size in `status`.
   */
  readonly lastPrompt:
    { readonly templateVersion: string; readonly estimatedTokens: number } | undefined;
  /** Forget the thread on screen; the next line starts a new one. */
  readonly reset: (() => void) | undefined;
}

const sentenceFor = (name: string, failure: ApiFailure): string => {
  switch (failure.kind) {
    case "unavailable":
      return failure.message;
    case "unauthorized":
      return `${name} could not answer: this browser has no credential the server accepts.`;
    case "missing":
      return `${name} could not answer: this NPC is not reachable with this credential.`;
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

export function useNpcRehearsal(campaignId: CampaignId, npcId: NpcId, name: string): Rehearsal {
  const fetchCredential = useCredential();
  const [turns, setTurns] = useState<ReadonlyArray<RehearsalTurn>>([]);
  const [status, setStatus] = useState<NpcRehearsalStatus | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const [writing, setWriting] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<Rehearsal["lastPrompt"]>(undefined);

  const nextId = useRef(0);
  const answering = useRef<Fiber.Fiber<unknown, unknown> | undefined>(undefined);
  const credentialRef = useRef(fetchCredential);
  credentialRef.current = fetchCredential;
  const thread = useRef<NpcThreadId | undefined>(undefined);

  // Two reads on mount: whether anything is behind the NPC, and the newest
  // thread's turns, so the rehearsal is still there after a reload.
  useEffect(() => {
    let live = true;
    void (async () => {
      const token = await credentialRef.current();
      const result = await runApiResult(
        (client) =>
          Effect.all(
            {
              status: client.npcs.rehearsal({ params: { campaignId, npcId } }),
              threads: client.npcs.threads({ params: { campaignId, npcId } }),
            },
            { concurrency: 2 },
          ).pipe(
            Effect.flatMap(({ status: current, threads }) => {
              const newest = threads[0];
              return newest === undefined
                ? Effect.succeed({ status: current, threadId: undefined, recorded: [] })
                : Effect.map(
                    client.npcs.turns({
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
            setLastPrompt({
              templateVersion: event.data.templateVersion,
              estimatedTokens: event.data.estimatedTokens,
            });
            return;
          case "delta":
            say(event.data.text);
            return;
          case "failed":
            // The product's sentence, in the NPC's row but not in its voice —
            // the panel draws a failure plainly. It is not saved server-side.
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
        const stream = yield* client.npcs.rehearse({
          params: { campaignId, npcId },
          // Omitted rather than `undefined` — see `hob/conversation.ts`.
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
    setLastPrompt(undefined);
  }, []);

  return {
    turns,
    thinking: asking && !writing,
    send: status?.available === true ? send : undefined,
    unavailable:
      status?.available === true
        ? undefined
        : status === undefined
          ? `Checking whether a model is behind ${name}…`
          : `No model is configured behind ${name}. Set HOB_API_URL and HOB_MODEL in apps/server/.env.local, then restart the server.`,
    status,
    lastPrompt,
    reset: turns.length > 0 ? reset : undefined,
  };
}
