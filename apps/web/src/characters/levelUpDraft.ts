import type {
  AssistantThreadId,
  AssistantTurnId,
  CharacterId,
  HobEvent,
  HobProposal,
} from "@taverns/api";
import { Effect, Fiber, Result, Stream } from "effect";
import { FetchHttpClient } from "effect/http";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeClient, runApiResult } from "../api/client";
import { classifyFailure } from "../api/failure";
import { useCredential } from "../auth/credential";
import { draftFailureFor } from "./draft";

/**
 * **Hob, choosing a character's next level** — the client half of the sheet's
 * level-up composer (`/me/hob/ask` with `intent: "levelUp"` and the
 * character's id).
 *
 * The server reads the character's next-level offer before the model is
 * called (another account's character is a 404 there, and the model never
 * runs) and gives Hob a toolkit built from it: `readLevelUpOffer` and
 * `proposeLevelUp`, whose every name is one the offer lists. Hob's level-ups
 * take the fixed hit points and set no score but an Ability Score
 * Improvement's points; a roll, or any choice of the owner's own, is the
 * wizard's.
 *
 * **Nothing here writes.** The proposal is what the server stored on the
 * turn; *Keep it* is the accept (`POST /me/hob/…/accept`), which takes no
 * content and applies the level through the wizard's own write with the
 * version the offer was read at, stamped `assistant`. Same order as
 * `draft.ts`, for the same reason: an accept that took the choices from the
 * client would let any client record its own picks as Hob's.
 *
 * It holds the latest proposal and the last thing Hob said, not a transcript
 * — the conversation is whole on the server, in the account's own threads,
 * and the docked panel reads it back there. A redraft continues the same
 * thread so Hob can see what it offered.
 */

/** A level-up proposal, narrowed out of the union the wire carries. */
export type LevelUpProposal = Extract<HobProposal, { readonly target: "levelUp" }>;

/** What the composer asks when the owner leaves the box empty. */
export const CHOOSE_FOR_ME = "Choose my next level for me.";

export interface LevelUpDraft {
  /** Whether a model is configured, once asked; `undefined` while that read is in flight. */
  readonly available: boolean | undefined;
  /** A proposal is on its way. */
  readonly asking: boolean;
  /** What Hob is doing while it is doing it — *"Reading the next level…"*. */
  readonly activity: string | undefined;
  /**
   * What to tell the owner when the last ask came back without a proposal:
   * Hob's own words when it wrote some, or why the request failed. A small
   * model often answers in prose without calling the tool, and that has to be
   * said, not left looking like a hang.
   */
  readonly note: string | undefined;
  /** The newest proposal for this character, or undefined before one is offered. */
  readonly proposal: LevelUpProposal | undefined;
  /** The thread and turn the proposal is saved on — what a keep or a discard names. */
  readonly offered:
    | { readonly threadId: AssistantThreadId; readonly turnId: AssistantTurnId }
    | undefined;
  readonly ask: (text: string) => void;
  /** The proposal was discarded on the server: it is no longer an offer. */
  readonly forget: () => void;
}

/** What a tool step reads as, for the two this toolkit has. */
const ACTIVITY: Record<string, string> = {
  readLevelUpOffer: "Reading the next level",
  proposeLevelUp: "Choosing",
};

/**
 * Attach the composer to the server.
 *
 * @param characterId The character whose next level Hob chooses. The server
 *   binds Hob's tools to it from the request, so it is the whole of what the
 *   client says about scope.
 */
export function useLevelUpDraft(characterId: CharacterId): LevelUpDraft {
  const fetchCredential = useCredential();
  const credentialRef = useRef(fetchCredential);
  credentialRef.current = fetchCredential;

  const [available, setAvailable] = useState<boolean | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const [activity, setActivity] = useState<string | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>(undefined);
  const [proposal, setProposal] = useState<LevelUpProposal | undefined>(undefined);
  const [offered, setOffered] = useState<LevelUpDraft["offered"]>(undefined);

  /**
   * The thread the composer continues — a ref, not state, because `began`
   * writes it mid-answer and the proposal that follows must be filed with it.
   */
  const thread = useRef<AssistantThreadId | undefined>(undefined);
  const answering = useRef<Fiber.Fiber<unknown, unknown> | undefined>(undefined);

  /** One status read when the composer opens: nothing is asked of a server with no model. */
  useEffect(() => {
    let live = true;
    void (async () => {
      const token = await credentialRef.current();
      const result = await runApiResult((client) => client.meHob.status(), token);
      if (!live) return;
      setAvailable(Result.isSuccess(result) ? result.success.available : false);
    })();
    return () => {
      live = false;
    };
  }, []);

  /** A half-written answer is abandoned, not left running, when this unmounts. */
  useEffect(
    () => () => {
      const fiber = answering.current;
      if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber));
    },
    [],
  );

  const ask = useCallback(
    (asked: string) => {
      if (asking) return;
      const text = asked.trim() === "" ? CHOOSE_FOR_ME : asked.trim();
      setAsking(true);
      setActivity(undefined);
      setNote(undefined);
      let wasOffered = false;
      let said = "";

      const receive = (event: HobEvent) => {
        switch (event.event) {
          case "began":
            thread.current = event.data.threadId;
            return;
          case "delta":
            setActivity(undefined);
            said += event.data.text;
            return;
          case "tool":
            if (event.data.phase === "called") {
              setActivity(`${ACTIVITY[event.data.name] ?? "Reading the record"}…`);
            }
            return;
          case "proposal": {
            const made = event.data.proposal;
            const threadId = thread.current;
            // Only this character's next level is this composer's to draw.
            if (
              made.target === "levelUp" &&
              made.characterId === characterId &&
              threadId !== undefined
            ) {
              wasOffered = true;
              setProposal(made);
              setOffered({ threadId, turnId: event.data.turnId });
            }
            return;
          }
          case "failed":
            said = said === "" ? event.data.message : said;
            return;
          default:
            return;
        }
      };

      const answer = Effect.gen(function* () {
        // Fetched per ask and never held: a hosted session token lives 60 seconds.
        const token = yield* Effect.promise(() => credentialRef.current());
        const client = yield* makeClient(token);
        const continuing = thread.current;
        // `threadId` is omitted, not sent as `undefined`, on the first ask: the
        // derived client encodes an absent optional as `null`, which the
        // server's `Schema.optional` refuses.
        const stream = yield* client.meHob.ask({
          payload:
            continuing === undefined
              ? { text, intent: "levelUp", characterId }
              : { threadId: continuing, text, intent: "levelUp", characterId },
        });
        yield* Stream.runForEach(stream, (event) => Effect.sync(() => receive(event)));
      }).pipe(
        Effect.provide(FetchHttpClient.layer),
        // `result`, not `exit`: an interrupt (unmounting) unwinds quietly.
        Effect.result,
        Effect.map((outcome) => {
          setAsking(false);
          setActivity(undefined);
          answering.current = undefined;
          if (Result.isFailure(outcome)) {
            setNote(draftFailureFor(classifyFailure(outcome.failure)));
          } else if (!wasOffered) {
            setNote(
              said.trim() === ""
                ? "Hob did not offer a level this time. Ask again, or choose it yourself with Level up."
                : said.trim(),
            );
          }
        }),
      );

      answering.current = Effect.runFork(answer);
    },
    [asking, characterId],
  );

  const forget = useCallback(() => {
    setProposal(undefined);
    setOffered(undefined);
  }, []);

  return { available, asking, activity, note, proposal, offered, ask, forget };
}
