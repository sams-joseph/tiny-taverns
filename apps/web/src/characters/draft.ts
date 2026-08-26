import type {
  AssistantThreadId,
  AssistantTurnId,
  CampaignId,
  Character,
  HobEvent,
  HobProposal,
} from "@taverns/api";
import { Effect, Fiber, Result, Stream } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeClient, runApiResult } from "../api/client";
import { classifyFailure, type ApiFailure } from "../api/failure";
import { useCredential } from "../auth/credential";

/**
 * **Hob, for a player making a character** — the second surface in the product
 * that talks to the assistant, and the only one a non-DM can reach.
 *
 * The captain reversed *players do not talk to Hob* on 2026-08-26, and this
 * file is the client half of what that bought. It is deliberately **not**
 * `hob/conversation.ts` with a flag: that file drives the docked chat panel and
 * is about a transcript, a thread picker, an artifact card and a *Save to
 * session*. This one is about one draft at a time.
 *
 * ### What it holds, and what it does not
 *
 * The latest **draft** and the latest thing Hob **said**, and nothing before
 * them. The drawn step 2 (`ui_kits/dm-screen/CharacterCreate.jsx`) is a sheet
 * with an aside and a redraft composer — not a conversation — so a transcript
 * here would be a second surface nobody drew. The conversation is still whole
 * on the server; this is what the screen renders of it.
 *
 * ### The thread id lives in a ref
 *
 * Same rule and same reason as the chat panel's: `began` writes it mid-answer
 * and the next question reads it at the instant it fires, so a re-render in
 * between would split one drafting session into two and Hob would lose sight of
 * what it had already offered. The redraft loop is the whole point of the
 * surface, so this one is load-bearing rather than tidy.
 *
 * ### Accept, and the order that makes it safe
 *
 * **Hob proposes → the player accepts as-is → the row exists → every correction
 * is an ordinary player write.** `POST …/accept` takes no content at all: the
 * character is materialised from the proposal the *server* stored on the turn,
 * which is what makes `origin: "assistant"` worth recording (`repo/Proposals.ts`
 * is explicit that *if accept took the content instead, any client could post
 * its own prose and have it recorded as the assistant's*). So there is no
 * edit-the-draft-then-accept path here, and there must not be one: corrections
 * happen on the shipped sheet, against a row that exists.
 *
 * ### It must never dead-end
 *
 * **Measured, not hypothetical**: with all tools offered, the captain's own
 * configured 4B model chose the propose tool one time in five. So a finished
 * answer with no draft is an ordinary outcome, not an error — `draft` stays
 * undefined, `said` holds whatever Hob wrote, and the screen is one press from
 * the form `create.ts` already builds. Every state here is designed around that
 * being common.
 */

/** The four the delivery ships (`player-data.js`'s `TT_PLAYER.starters`). */
export const STARTERS: ReadonlyArray<string> = [
  "A dwarf who quit the guard after a bad order",
  "Someone raised by the road, not by people",
  "A cleric whose god has stopped answering",
  "The party's least dangerous member, on purpose",
];

/**
 * The quick corrections the drawing offers beside the redraft composer.
 *
 * Fixed client-side text, unlike `HobArtifact.chips` — which is deliberately
 * empty in the chat panel because a *refinement* chip there is copy the
 * assistant is supposed to author. These are not that: they are the four
 * changes a player asks for whatever was drafted, they are the drawing's own
 * verbatim (`CharacterCreate.jsx`'s redraft aside — *"Make her older"* is
 * degendered and nothing else), and each is sent as an ordinary question rather
 * than as a parameter.
 */
export const REDRAFTS: ReadonlyArray<string> = [
  "More Dexterity",
  "Make them older",
  "Darker backstory",
  "No spellcasting",
];

/** A character draft, narrowed out of the union the wire carries. */
export type CharacterProposal = Extract<HobProposal, { target: "character" }>;

export interface CharacterDraft {
  /**
   * Whether a model is configured, once asked. `undefined` while the status
   * read is in flight or before it is made.
   */
  readonly available: boolean | undefined;
  /** Why Hob cannot draft, said where the composer would be. */
  readonly unavailable: string | undefined;
  /**
   * The last completed answer produced no draft.
   *
   * **The state this surface most has to get right**, and it is two different
   * moments: the first question, where there is nothing on screen at all, and a
   * redraft, where the *old* card is still there and would otherwise sit
   * unchanged with no explanation. A player who asked for a ranger and got
   * prose has to be told the druid in front of them is still the druid.
   */
  readonly offeredNothing: boolean;
  /** A draft is coming and there is nothing to read yet. */
  readonly thinking: boolean;
  /** *"Searching the record…"* — the tool step, in words. */
  readonly activity: string | undefined;
  /** Hob's own line about the draft. Often one sentence; sometimes all there is. */
  readonly said: string;
  /** The latest draft, or undefined because none has been offered yet. */
  readonly draft: CharacterProposal | undefined;
  /** The turn the draft is saved on — what an accept names. */
  readonly turnId: AssistantTurnId | undefined;
  /** Whether a question has been asked at all, which is what step 2 branches on. */
  readonly asked: boolean;
  readonly ask: (text: string) => void;
  /** Keeps the draft. Resolves the created character, or a sentence about why not. */
  readonly keep: () => Promise<Result.Result<Character, string>>;
  readonly keeping: boolean;
}

/** What a tool step reads as. The player toolkit has two tools. */
const ACTIVITY: Record<string, string> = {
  searchCampaign: "Reading what your DM has shared",
  proposeCharacter: "Writing the sheet",
};

const activityFor = (name: string, detail: string): string => {
  const doing = ACTIVITY[name] ?? `Calling ${name}`;
  return detail === "" ? `${doing}…` : `${doing} — ${detail}…`;
};

/**
 * What to say when the request itself failed.
 *
 * Plain product text, in the panel rather than in Hob's voice — the kit's rule
 * that a control never speaks in character, applied to a failure. `unavailable`
 * is the server's own sentence, which names the two environment variables.
 */
export const draftFailureFor = (failure: ApiFailure): string => {
  switch (failure.kind) {
    case "unavailable":
      return failure.message;
    case "unauthorized":
      return "Hob could not answer: this browser has no credential the server accepts.";
    case "missing":
      return "Hob could not answer: this table is not reachable with this credential.";
    case "unreachable":
      return "Hob could not answer: the server did not respond.";
    case "conflict":
      return failure.message;
    default:
      return `Hob could not answer: ${failure.detail}`;
  }
};

/**
 * Attach the drafting surface to the server.
 *
 * @param campaignId The table the character is being made for. Hob's tools are
 *   bound to it server-side from the request path, so this is the whole of what
 *   the client says about scope — there is no campaign in a payload and none in
 *   a tool parameter, which is the grounding property the DM's Hob has and this
 *   one keeps unchanged.
 * @param enabled Whether to ask at all. The screen passes `false` until it knows
 *   the reader is a player at this table, so a status request is not made on a
 *   screen that is about to draw a refusal.
 */
export function useCharacterDraft(campaignId: CampaignId, enabled: boolean): CharacterDraft {
  const fetchCredential = useCredential();
  const credentialRef = useRef(fetchCredential);
  credentialRef.current = fetchCredential;

  const [available, setAvailable] = useState<boolean | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const [writing, setWriting] = useState(false);
  const [activity, setActivity] = useState<string | undefined>(undefined);
  const [said, setSaid] = useState("");
  const [draft, setDraft] = useState<CharacterProposal | undefined>(undefined);
  const [turnId, setTurnId] = useState<AssistantTurnId | undefined>(undefined);
  const [asked, setAsked] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [offeredNothing, setOfferedNothing] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  /** Whether *this* answer has offered anything, read when it finishes. */
  const offered = useRef(false);

  /**
   * The conversation being continued.
   *
   * A ref, not state: `ask` reads it at the instant it fires and `began` writes
   * it mid-answer. See the file header — the redraft loop is what depends on it.
   */
  const thread = useRef<AssistantThreadId | undefined>(undefined);
  const answering = useRef<Fiber.Fiber<unknown, unknown> | undefined>(undefined);

  /**
   * One read, and only once the screen knows it is drawing a form at all.
   *
   * The panel's rule — *nothing is requested until it is opened* — applied to a
   * screen: a player who typed this URL at a table they do not play at gets a
   * refusal without a request, and everybody else pays one small `GET`.
   */
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void (async () => {
      const token = await credentialRef.current();
      const result = await runApiResult(
        (client) => client.hob.status({ params: { campaignId } }),
        token,
      );
      if (!live) return;
      // A failed status read is the honest *no*: the composer is not offered and
      // the form is one press away, which is where a player who cannot reach Hob
      // was going anyway. It is told apart from a configured-but-off server
      // because the two have different fixes and only one of them is the
      // reader's to act on.
      setUnreachable(Result.isFailure(result));
      setAvailable(Result.isSuccess(result) ? result.success.available : false);
    })();
    return () => {
      live = false;
    };
  }, [campaignId, enabled]);

  /** A half-written draft is abandoned, not left running, when this unmounts. */
  useEffect(
    () => () => {
      const fiber = answering.current;
      if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber));
    },
    [],
  );

  const ask = useCallback(
    (text: string) => {
      if (asking || text.trim() === "") return;
      setAsked(true);
      setAsking(true);
      setWriting(false);
      setActivity(undefined);
      setSaid("");
      setOfferedNothing(false);
      offered.current = false;

      const receive = (event: HobEvent) => {
        switch (event.event) {
          case "began":
            thread.current = event.data.threadId;
            return;
          case "delta":
            setActivity(undefined);
            setWriting(true);
            setSaid((current) => current + event.data.text);
            return;
          case "tool":
            if (event.data.phase === "called") {
              setWriting(false);
              setActivity(activityFor(event.data.name, event.data.detail));
            }
            return;
          case "proposal":
            setActivity(undefined);
            // The union is four wide on the wire and this surface can only ever
            // be offered one member of it — the player toolkit has one propose
            // tool. Narrowed rather than asserted, so a future member arriving
            // is an offer this screen ignores rather than a card it draws
            // wrongly.
            if (event.data.proposal.target === "character") {
              offered.current = true;
              setDraft(event.data.proposal);
              setTurnId(event.data.turnId);
            }
            return;
          case "failed":
            setActivity(undefined);
            setSaid((current) => (current === "" ? event.data.message : current));
            return;
          default:
            return;
        }
      };

      const answer = Effect.gen(function* () {
        // Fetched per question and never held, like every other call in this
        // app: a hosted session token lives 60 seconds and a player thinking
        // about a backstory takes longer than that.
        const token = yield* Effect.promise(() => credentialRef.current());
        const client = yield* makeClient(token);
        const continuing = thread.current;
        const stream = yield* client.hob.ask({
          params: { campaignId },
          // The key is *omitted* rather than sent as `undefined`: the derived
          // client encodes an absent optional as `null` and `Schema.optional`
          // refuses a null on the way back in, which is a 400 on the first
          // question of every conversation.
          payload: continuing === undefined ? { text } : { threadId: continuing, text },
        });
        yield* Stream.runForEach(stream, (event) => Effect.sync(() => receive(event)));
      }).pipe(
        Effect.provide(FetchHttpClient.layer),
        // `result` and not `exit`: an interrupt — which is what unmounting does
        // — must unwind rather than be reported as a failure.
        Effect.result,
        Effect.map((outcome) => {
          setAsking(false);
          setWriting(false);
          setActivity(undefined);
          answering.current = undefined;
          setOfferedNothing(!offered.current);
          if (Result.isFailure(outcome)) {
            setSaid(draftFailureFor(classifyFailure(outcome.failure)));
          }
        }),
      );

      answering.current = Effect.runFork(answer);
    },
    [asking, campaignId],
  );

  /**
   * Keep the draft — **the accept, and the only write on this surface.**
   *
   * It sends three ids and no content. What comes back is the whole `Character`,
   * which the screen takes straight to the shipped sheet: from that moment on
   * there is no draft and no second editor, only a row and `PATCH
   * /me/characters/:id`.
   */
  const keep = useCallback(async (): Promise<Result.Result<Character, string>> => {
    const threadId = thread.current;
    if (threadId === undefined || turnId === undefined) {
      return Result.fail("There is nothing to keep yet.");
    }
    setKeeping(true);
    const token = await credentialRef.current();
    const result = await runApiResult(
      (client) => client.hob.accept({ params: { campaignId, threadId, turnId }, payload: {} }),
      token,
    );
    setKeeping(false);
    // `runApiResult` has already named the failure — it answers an `ApiFailure`
    // rather than the raw error, unlike the streamed `ask` below, which runs the
    // client itself and has to classify. Classifying twice is silent: it lands
    // in the `unknown` arm and renders `[object Object]`.
    if (Result.isFailure(result)) return Result.fail(draftFailureFor(result.failure));
    // Four accept targets on the wire; this endpoint can only ever answer one
    // of them here, for the reason the proposal above can only ever be one.
    return result.success.accepted === "character"
      ? Result.succeed(result.success.character)
      : Result.fail("That was not a character.");
  }, [campaignId, turnId]);

  return {
    available,
    offeredNothing,
    unavailable:
      available !== false
        ? undefined
        : unreachable
          ? "Hob could not be reached, so there is no draft to have. Fill the sheet in " +
            "yourself — you can always add the rest later."
          : "No model is configured behind Hob on this server, so there is no draft to have. " +
            "Fill the sheet in yourself — you can always add the rest later.",
    thinking: asking && !writing,
    activity,
    said,
    draft,
    turnId,
    asked,
    ask,
    keep,
    keeping,
  };
}
