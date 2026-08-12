import type { CampaignId, HobEvent, HobMessage, HobStatus } from "@taverns/api";
import { Effect, Fiber, Result, Stream } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeClient } from "../api/client";
import { type ApiFailure, classifyFailure, runApiResult } from "../api/resource";
import { useCredential } from "../auth/credential";
import type { HobArtifact, HobContextChip, HobTurn } from "./transcript";

/**
 * The one seam a real assistant attaches to — and one is attached.
 *
 * `HobPanel` renders the turns it is handed, `HobDock` decides where the panel
 * sits, and neither has an opinion about where an answer comes from. This file
 * is the whole of the client-side attachment: it asks whether a model is
 * configured, streams an answer, and appends it to the thread a piece at a
 * time.
 *
 * ### Three things it deliberately does not do
 *
 * **It holds no conversation on the server.** The thread is React state and it
 * travels in the payload of every question, because nothing about an answer is
 * saved: there is no `assistant_turn` row, and the captain's decision is that
 * nothing enters the campaign without an explicit accept. An unkept answer is
 * not a row, exactly as an unkept Chronicle draft is not one.
 *
 * **It produces no artifacts.** `HobArtifact` describes the five card bodies
 * the designers drew and nothing generates one yet — that is the *propose and
 * accept* half of the assistant, and the `save` / `discard` / `retry` handlers
 * stay undefined until it exists. The card disables what it was not given, so
 * the absence renders as an absence.
 *
 * **It refuses to pretend outside a campaign.** Hob's tools all hang off one —
 * the same reason `navFor` shows *Bestiary* only inside a campaign — so on the
 * campaign list `send` is undefined and the panel says nothing is behind it.
 * That is the honest state, not a degraded one.
 */
export interface HobConversation {
  /** Newest last. Empty renders the starter grid. */
  readonly turns: ReadonlyArray<HobTurn>;
  /**
   * An answer is on its way and there is nothing to read yet.
   *
   * Not simply "a request is in flight": once the words start arriving, the
   * text growing *is* the progress, and a spinner-shaped line under it says
   * less than the sentence above it does. It goes back to true whenever Hob
   * pauses to call a tool, which is a real gap with nothing on screen.
   */
  readonly thinking: boolean;
  /**
   * What Hob is doing, while it is doing it — *"Searching the record…"*.
   *
   * On the wire because it is the honest account of where an answer came from,
   * and because a local model spends its first seconds deciding to search: with
   * nothing here, a grounded question looks like a hang.
   */
  readonly activity: string | undefined;
  readonly savedArtifactIds: ReadonlyArray<string>;
  /**
   * The *"Knows"* strip, and every chip in it is true or absent.
   *
   * The delivered fixture names three — the campaign and session, the party,
   * the fight on the table — and only the first is something Hob is actually
   * bound to. The others would each be a second read for a decoration, which is
   * the one thing this surface refuses; they come back when something makes
   * them true. Empty renders no strip at all rather than an empty one.
   */
  readonly context: ReadonlyArray<HobContextChip>;
  /** Undefined when no campaign is in view or no model is configured. */
  readonly send: ((text: string) => void) | undefined;
  /** Why `send` is undefined, said in the panel where the composer would be. */
  readonly unavailable: string | undefined;
  readonly save: ((artifact: HobArtifact) => void) | undefined;
  readonly discard: ((artifact: HobArtifact) => void) | undefined;
  readonly retry: ((artifact: HobArtifact) => void) | undefined;
  readonly reset: (() => void) | undefined;
}

/** What a tool step reads as in the panel. Named here, once. */
const ACTIVITY: Record<string, string> = {
  searchCampaign: "Searching the record",
  listSessions: "Looking through the sessions",
  sessionRecap: "Reading back a night",
  getCreature: "Reading a stat block",
  sessionLog: "Reading the log",
};

const activityFor = (name: string, detail: string): string => {
  const doing = ACTIVITY[name] ?? `Calling ${name}`;
  return detail === "" ? `${doing}…` : `${doing} — ${detail}…`;
};

/**
 * What to say when the request itself failed.
 *
 * Plain UI text in Hob's row rather than in the persona's: the kit's rule is
 * that the aside is the only decorative writing and a control never speaks in
 * character, so a failure is a sentence about the product and belongs in the
 * reply channel. It is a turn rather than a banner so it stays where the
 * question it failed is, which is what a DM scrolling back needs.
 */
const sentenceFor = (failure: ApiFailure): string => {
  switch (failure.kind) {
    case "unavailable":
      return failure.message;
    case "unauthorized":
      return "Hob could not answer: this browser has no credential the server accepts.";
    case "missing":
      return "Hob could not answer: this campaign is not reachable with this credential.";
    case "unreachable":
      return "Hob could not answer: the server did not respond.";
    default:
      return `Hob could not answer: ${failure.kind === "conflict" ? failure.message : failure.detail}`;
  }
};

/**
 * Attach the panel to the server.
 *
 * @param campaignId The campaign in view, or `undefined` on a screen that has
 *   none. Hob's tools are bound to it server-side, so this is also the whole of
 *   what the client says about scope — there is no campaign in a payload and
 *   none in a tool parameter.
 * @param open Whether the panel is showing. **Nothing is requested until it
 *   is**: the panel is closed on every screen by default, so asking whether a
 *   model is configured at mount would put a request on every page load for a
 *   surface nobody opened. Re-asking on each open is the deliberate other half
 *   — a server restarted with a model configured is then one panel toggle away
 *   from working, rather than a page reload.
 */
export function useHobConversation(
  campaignId: CampaignId | undefined,
  open: boolean,
): HobConversation {
  const fetchCredential = useCredential();
  const [turns, setTurns] = useState<ReadonlyArray<HobTurn>>([]);
  const [asking, setAsking] = useState(false);
  /**
   * Whether words are currently arriving.
   *
   * The working line is for when *nothing is happening on screen*. Once the
   * reply has started, the text growing is the progress indicator, and a second
   * one under it is noise. A tool call puts this back to false, because that is
   * a real pause with nothing to read.
   */
  const [writing, setWriting] = useState(false);
  const [activity, setActivity] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<HobStatus | undefined>(undefined);

  /** Monotonic, so a turn's key is stable and no environment API is needed. */
  const nextId = useRef(0);
  const answering = useRef<Fiber.Fiber<unknown, unknown> | undefined>(undefined);
  const credentialRef = useRef(fetchCredential);
  credentialRef.current = fetchCredential;

  // The only reason the composer appears. The server answers
  // `available: false` rather than failing when no model is configured, so an
  // unconfigured deployment is a quiet panel and not a broken one.
  useEffect(() => {
    if (campaignId === undefined) {
      setStatus(undefined);
      return;
    }
    if (!open) return;
    let live = true;
    void (async () => {
      const token = await credentialRef.current();
      const result = await runApiResult(
        (client) => client.hob.status({ params: { campaignId } }),
        token,
      );
      if (live) setStatus(Result.isSuccess(result) ? result.success : undefined);
    })();
    return () => {
      live = false;
    };
  }, [campaignId, open]);

  /** A half-written answer is abandoned, not left running, when this unmounts. */
  useEffect(
    () => () => {
      const fiber = answering.current;
      if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber));
    },
    [],
  );

  const append = useCallback((turn: HobTurn) => setTurns((current) => [...current, turn]), []);

  const say = useCallback((text: string) => {
    setWriting(true);
    setTurns((current) => {
      const last = current.at(-1);
      // Deltas land on the reply already in flight; the first one starts it.
      return last?.who === "hob"
        ? [...current.slice(0, -1), { ...last, text: last.text + text }]
        : [...current, { id: `hob-${nextId.current++}`, who: "hob" as const, text }];
    });
  }, []);

  const send = useCallback(
    (text: string) => {
      if (campaignId === undefined || asking) return;

      const question: HobTurn = { id: `you-${nextId.current++}`, who: "user", text };
      const thread: ReadonlyArray<HobMessage> = [...turns, question].flatMap((turn) =>
        turn.who === "artifact" ? [] : [{ who: turn.who, text: turn.text }],
      );

      append(question);
      setAsking(true);
      setWriting(false);
      setActivity(undefined);

      const receive = (event: HobEvent) => {
        switch (event.event) {
          case "delta":
            setActivity(undefined);
            say(event.data.text);
            return;
          case "tool":
            // Only the outgoing half is worth a line: "answered" is immediately
            // followed by either the next tool or the first word of the reply.
            if (event.data.phase === "called") {
              setWriting(false);
              setActivity(activityFor(event.data.name, event.data.detail));
            }
            return;
          case "failed":
            setActivity(undefined);
            append({ id: `hob-${nextId.current++}`, who: "hob", text: event.data.message });
            return;
          default:
            return;
        }
      };

      const answer = Effect.gen(function* () {
        // Fetched per question and never held: a hosted session token lives 60
        // seconds and a panel stays open all evening. Same rule as every other
        // call in this app; `auth/credential.ts` says why.
        const token = yield* Effect.promise(() => credentialRef.current());
        const client = yield* makeClient(token);
        const stream = yield* client.hob.ask({
          params: { campaignId },
          payload: { messages: thread },
        });
        yield* Stream.runForEach(stream, (event) => Effect.sync(() => receive(event)));
      }).pipe(
        Effect.provide(FetchHttpClient.layer),
        // `result` and not `exit`: an interrupt — which is what unmounting does
        // — must unwind rather than be reported to the DM as a failure.
        Effect.result,
        Effect.map((outcome) => {
          setAsking(false);
          setWriting(false);
          setActivity(undefined);
          answering.current = undefined;
          if (Result.isFailure(outcome))
            append({
              id: `hob-${nextId.current++}`,
              who: "hob",
              text: sentenceFor(classifyFailure(outcome.failure)),
            });
        }),
      );

      answering.current = Effect.runFork(answer);
    },
    [append, asking, campaignId, say, turns],
  );

  const reset = useCallback(() => {
    const fiber = answering.current;
    if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber));
    answering.current = undefined;
    setTurns([]);
    setAsking(false);
    setWriting(false);
    setActivity(undefined);
  }, []);

  return {
    turns,
    thinking: asking && !writing,
    activity,
    savedArtifactIds: [],
    context:
      status === undefined
        ? []
        : [
            { icon: "book-open" as const, label: status.campaign, live: true },
            ...(status.model === null ? [] : [{ icon: "sparkles" as const, label: status.model }]),
          ],
    send: status?.available === true ? send : undefined,
    // Two reasons, both actionable, and the panel deserves the exact one.
    unavailable:
      status?.available === true
        ? undefined
        : campaignId === undefined
          ? "Hob reads one campaign's record, and there is no campaign in view. Open one and ask again."
          : "No model is configured behind Hob. Set HOB_API_URL and HOB_MODEL in apps/server/.env.local, then restart the server.",
    // The propose-and-accept half of the assistant is unbuilt, and these stay
    // undefined until it is. A handler that swallowed a *Save to session* would
    // be worse than a disabled button.
    save: undefined,
    discard: undefined,
    retry: undefined,
    reset: turns.length > 0 ? reset : undefined,
  };
}
