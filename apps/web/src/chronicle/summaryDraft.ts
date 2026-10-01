import type { AssistantThreadId, CampaignId, HobEvent, Session } from "@taverns/api";
import { Effect, Fiber, Result, Stream } from "effect";
import { FetchHttpClient } from "effect/http";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeClient } from "../api/client";
import { classifyFailure } from "../api/failure";
import { useCredential } from "../auth/credential";
import { draftFailureFor } from "../characters/draft";
import type { HeldDraft } from "./entry";

/**
 * **Hob, drafting one night's summary for the Chronicle composer.**
 *
 * The captain's call (Chronicle Q1 c): Hob drafts and the DM keeps, as the
 * Shared World's Story So Far is kept. The composer asks with `intent:
 * "nightSummary"` and the night's id, so the server binds that night before the
 * model is called and gives Hob the creator's toolkit; Hob offers the draft
 * with `proposeNightSummary`, and this hands its words to the composer's box.
 *
 * **Nothing here writes.** The draft sits in the box for the DM to edit; the
 * composer's *Add to chronicle* is the accept (`POST …/accept`, which
 * materialises the proposal the server stored, stamped `assistant` with the
 * turn), followed by the DM's own `PATCH` for what they changed. Same order as
 * `characters/draft.ts`, and for the same reason: an accept that took prose
 * would let any client record its own words as Hob's.
 *
 * It holds one draft and the last thing Hob said, not a transcript — the
 * conversation is whole on the server, in the campaign's own threads, and the
 * docked panel reads it back there. A redraft continues the same thread so Hob
 * can see what it offered. Whether a model is behind Hob at all is the
 * Chronicle's own read (`loadChronicleSpine`); the composer asks only when it is.
 */

export interface SummaryDraft {
  /** A draft is on its way. */
  readonly asking: boolean;
  /** What Hob is doing while it is doing it — *"Reading back a night…"*. */
  readonly activity: string | undefined;
  /**
   * What to tell the DM when the last ask came back without a draft: Hob's own
   * words when it wrote some, or why the request failed. A small model often
   * answers in prose without calling the tool, and that has to be said, not
   * left looking like a hang.
   */
  readonly note: string | undefined;
  /** The newest draft for this night, or undefined before one is offered. */
  readonly draft: HeldDraft | undefined;
  readonly ask: () => void;
}

/** What a tool step reads as, for the few this ask reaches for. */
const ACTIVITY: Record<string, string> = {
  listSessions: "Looking through the sessions",
  sessionRecap: "Reading back the night",
  sessionLog: "Reading the log",
  searchCampaign: "Searching the record",
  proposeNightSummary: "Writing the summary",
};

export function useSummaryDraft(campaignId: CampaignId, session: Session): SummaryDraft {
  const fetchCredential = useCredential();
  const credentialRef = useRef(fetchCredential);
  credentialRef.current = fetchCredential;

  const [asking, setAsking] = useState(false);
  const [activity, setActivity] = useState<string | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<HeldDraft | undefined>(undefined);

  /**
   * The thread the drafting belongs to — a ref, not state, because `began`
   * writes it mid-answer and the proposal that follows must be filed with it.
   */
  const thread = useRef<AssistantThreadId | undefined>(undefined);
  const answering = useRef<Fiber.Fiber<unknown, unknown> | undefined>(undefined);

  /** A half-written draft is abandoned, not left running, when this unmounts. */
  useEffect(
    () => () => {
      const fiber = answering.current;
      if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber));
    },
    [],
  );

  const ask = useCallback(() => {
    if (asking) return;
    setAsking(true);
    setActivity(undefined);
    setNote(undefined);
    let offered = false;
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
          const proposal = event.data.proposal;
          const threadId = thread.current;
          // The composer can only use a summary of *this* night. Anything else
          // — another night, another kind — stays in the thread for the panel.
          if (
            proposal.target === "nightSummary" &&
            proposal.sessionId === session.id &&
            threadId !== undefined
          ) {
            offered = true;
            setDraft({ threadId, turnId: event.data.turnId, text: proposal.text });
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
      const text = `Draft a summary of session ${String(session.number)} for the Chronicle.`;
      const continuing = thread.current;
      const stream = yield* client.hob.ask({
        params: { campaignId },
        // `threadId` is omitted, not sent as `undefined`, on the first ask: the
        // derived client encodes an absent optional as `null`, which the
        // server's `Schema.optional` refuses.
        payload:
          continuing === undefined
            ? { text, intent: "nightSummary", sessionId: session.id }
            : { threadId: continuing, text, intent: "nightSummary", sessionId: session.id },
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
        } else if (!offered) {
          setNote(
            said.trim() === ""
              ? "Hob did not offer a draft this time. Try again, or write it yourself."
              : said.trim(),
          );
        }
      }),
    );

    answering.current = Effect.runFork(answer);
  }, [asking, campaignId, session.id, session.number]);

  return {
    asking,
    activity,
    note,
    draft,
    ask,
  };
}
