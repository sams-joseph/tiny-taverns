import type {
  AssistantThreadId,
  AssistantTurnId,
  CampaignId,
  SharedWorldId,
  HobAccepted,
  HobEvent,
  HobThread,
  HobTurn as RecordedTurn,
} from "@taverns/api";
import { Effect, Fiber, Result, Stream } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useRef, useState } from "react";
import { useInvalidate } from "../api/atoms";
import { makeClient, runApiResult, type TavernsClient } from "../api/client";
import { reads, type ReadKey } from "../api/keys";
import { classifyFailure, type ApiFailure } from "../api/failure";
import { useCredential } from "../auth/credential";
import { artifactFrom, type HobArtifact, type HobContextChip, type HobTurn } from "./transcript";

/**
 * The one seam a real assistant attaches to — and one is attached.
 *
 * `HobPanel` renders the turns it is handed, `HobDock` decides where the panel
 * sits, and neither has an opinion about where an answer comes from. This file
 * is the whole of the client-side attachment: it asks whether a model is
 * configured, resumes the conversation, streams an answer, and accepts what Hob
 * offers.
 *
 * ### The conversation lives on the server
 *
 * A thread and its turns are rows, so this holds a **thread id**, not a
 * transcript: opening the panel reads the newest thread back, and asking sends
 * one question. A reload no longer loses the evening — which was the gap — and
 * a client can no longer rewrite what it was told.
 *
 * The panel resumes the *newest* thread and offers no picker over the rest.
 * That is a drawn-surface limit rather than a data one: `hob.threads` returns
 * them all, newest first, and the designers have not drawn a list. *New thread*
 * starts one, which is now exactly what it says.
 *
 * ### A card is an offer, and Save is the only thing that writes
 *
 * An artifact turn is a proposal Hob made, saved on its turn and nothing else.
 * `save` calls `POST …/accept`, which materialises a real note, beat,
 * encounter, character or campaign with `origin: "assistant"` — that is the captain's
 * *generate with approval* decision, and this is the only button in the app
 * that reaches it.
 *
 * `discard` and `retry` stay undefined, so the card disables them. Discarding
 * would be a second write with a column of its own (an unaccepted proposal is
 * simply a line of transcript, and harmless), and *Try again* is a re-ask whose
 * wording is the designers' to choose. A disabled control is this surface's
 * shipped way of saying "not given", and it is honest where a handler that
 * silently did nothing would not be.
 *
 * ### Scope is explicit
 *
 * Campaign Hob, Shared World Hob and the account's own Hob have different
 * server toolkits and accept targets. The caller supplies exactly one scope,
 * and this seam selects one API group for the whole conversation
 * (`callsFor`). `account` is every screen outside a campaign or Shared World:
 * `/me/hob`, a thread of the reader's own, which drafts a character or a
 * campaign. No scope at all is a player's campaign, where the panel's verbs
 * are not theirs: no composer, and no request.
 */
export type HobScope =
  | { readonly type: "campaign"; readonly id: CampaignId }
  | { readonly type: "sharedWorld"; readonly id: SharedWorldId }
  | { readonly type: "account" };

interface ConversationStatus {
  readonly available: boolean;
  readonly model: string | null;
  readonly label: string;
  readonly type: HobScope["type"];
}

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
  /** Turn ids of proposals already accepted into their scoped record. */
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
  /** Undefined when no Hob scope is in view or no model is configured. */
  readonly send: ((text: string) => void) | undefined;
  /** Why `send` is undefined, said in the panel where the composer would be. */
  readonly unavailable: string | undefined;
  /** Accepts a proposal into the scoped record. The only write on this surface. */
  readonly save: ((artifact: HobArtifact) => void) | undefined;
  /** Opens what a kept card made, when it made something with a screen of its own. */
  readonly open: ((artifact: HobArtifact) => void) | undefined;
  /** The cards `open` can open: those kept while this conversation was on screen. */
  readonly openableArtifactIds: ReadonlyArray<string>;
  readonly discard: ((artifact: HobArtifact) => void) | undefined;
  readonly retry: ((artifact: HobArtifact) => void) | undefined;
  readonly reset: (() => void) | undefined;
}

/** What a tool step reads as in the panel. Named here, once. */
const ACTIVITY: Record<string, string> = {
  searchCampaign: "Searching the record",
  listSessions: "Looking through the sessions",
  listCreatures: "Reading the bestiary",
  sessionRecap: "Reading back a night",
  getCreature: "Reading a stat block",
  sessionLog: "Reading the log",
  proposeEncounter: "Building an encounter",
  proposeNote: "Writing a note",
  proposeBeat: "Writing down what happened",
  searchSharedWorldHistory: "Searching the Shared World Chronicle",
  readSharedWorldSummary: "Reading the Shared World summary",
  readStorySoFarSources: "Reading the Story So Far sources",
  listSharedWorldCampaigns: "Looking across the campaigns",
  listPlayedNights: "Looking through the played nights",
  nightStory: "Reading back a played night",
  proposeSharedWorldEntry: "Writing a Chronicle entry",
  proposeCampaign: "Drafting a campaign",
  proposeCharacter: "Drafting a character",
  listStartingSpells: "Reading the starting spells",
  listOptions: "Reading the core rules",
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
      return "Hob could not answer: this context is not reachable with this credential.";
    case "unreachable":
      return "Hob could not answer: the server did not respond.";
    case "rate-limited":
      return failure.message;
    default:
      return `Hob could not answer: ${failure.kind === "conflict" ? failure.message : failure.detail}`;
  }
};

/** And when the accept failed. A `Conflict` here is the server's own sentence. */
const saveFailureFor = (failure: ApiFailure): string =>
  failure.kind === "conflict"
    ? `Nothing was saved: ${failure.message}.`
    : `Nothing was saved: ${sentenceFor(failure).replace(/^Hob could not answer: /, "")}`;

/**
 * A saved conversation, as the rows the panel draws.
 *
 * A turn becomes up to two: the words, and the card. Both are skippable — a
 * turn Hob answered with a proposal and no prose has no bubble, and most turns
 * have no card — which is why this is a `flatMap` and not a `map`.
 */
const shownAs = (recorded: ReadonlyArray<RecordedTurn>): ReadonlyArray<HobTurn> =>
  recorded.flatMap((turn) => {
    const said: ReadonlyArray<HobTurn> =
      turn.text === "" ? [] : [{ id: turn.id, who: turn.who, text: turn.text }];
    return turn.proposal === null
      ? said
      : [
          ...said,
          {
            id: `${turn.id}:card`,
            who: "artifact" as const,
            artifact: artifactFrom(turn.id, turn.proposal),
          },
        ];
  });

/** What the panel says it knows, read off whichever status the scope answers. */
interface Opened {
  readonly status: ConversationStatus;
  readonly threads: ReadonlyArray<HobThread>;
}

/**
 * The five calls of one scope's API group, chosen once.
 *
 * Three groups with the same shape (`hob`, `sharedWorldHob`, `meHob`), so the
 * hook below is written once over this rather than branching at every call.
 * `keeps` is what an accept in this scope changed, by the kind of row it made:
 * the keys a screen behind the panel reads that row through.
 */
interface ScopeCalls {
  readonly opened: (client: TavernsClient) => Effect.Effect<Opened, unknown, never>;
  readonly turns: (
    client: TavernsClient,
    threadId: AssistantThreadId,
  ) => Effect.Effect<ReadonlyArray<RecordedTurn>, unknown>;
  readonly ask: (
    client: TavernsClient,
    payload: { readonly threadId?: AssistantThreadId; readonly text: string },
  ) => Effect.Effect<Stream.Stream<HobEvent, unknown>, unknown>;
  readonly accept: (
    client: TavernsClient,
    threadId: AssistantThreadId,
    turnId: AssistantTurnId,
  ) => Effect.Effect<HobAccepted, unknown>;
  readonly keeps: (accepted: HobAccepted) => ReadonlyArray<ReadKey>;
}

const callsFor = (scope: HobScope): ScopeCalls => {
  switch (scope.type) {
    case "campaign": {
      const campaignId = scope.id;
      return {
        opened: (client) =>
          Effect.map(
            Effect.all(
              {
                status: client.hob.status({ params: { campaignId } }),
                threads: client.hob.threads({ params: { campaignId } }),
              },
              { concurrency: 2 },
            ),
            ({ status, threads }) => ({
              status: {
                available: status.available,
                model: status.model,
                label: status.campaign,
                type: "campaign",
              },
              threads,
            }),
          ),
        turns: (client, threadId) => client.hob.turns({ params: { campaignId, threadId } }),
        ask: (client, payload) => client.hob.ask({ params: { campaignId }, payload }),
        accept: (client, threadId, turnId) =>
          client.hob.accept({ params: { campaignId, threadId, turnId }, payload: {} }),
        /**
         * Both named, because the artifact's kind is the model's and this write
         * does not branch on it. Over-naming costs a request nobody was going
         * to make; under-naming costs a card that quietly says the wrong number.
         *
         * **A beat is deliberately not named**, and the residue is small and
         * stated: a beat is assembled into a *recap*, whose key is the night's
         * session id — which this panel does not have, because the beat's
         * session is resolved server-side from `campaign.current_session_id`.
         * So a recap card left open on the Chronicle while a beat is accepted
         * stays as it was until it is reopened.
         */
        keeps: () => [reads.notes(campaignId), reads.encounters(campaignId)],
      };
    }
    case "sharedWorld": {
      const worldId = scope.id;
      return {
        opened: (client) =>
          Effect.map(
            Effect.all(
              {
                status: client.sharedWorldHob.status({ params: { worldId } }),
                threads: client.sharedWorldHob.threads({ params: { worldId } }),
              },
              { concurrency: 2 },
            ),
            ({ status, threads }) => ({
              status: {
                available: status.available,
                model: status.model,
                label: status.sharedWorld,
                type: "sharedWorld",
              },
              threads,
            }),
          ),
        turns: (client, threadId) => client.sharedWorldHob.turns({ params: { worldId, threadId } }),
        ask: (client, payload) => client.sharedWorldHob.ask({ params: { worldId }, payload }),
        accept: (client, threadId, turnId) =>
          client.sharedWorldHob.accept({ params: { worldId, threadId, turnId }, payload: {} }),
        keeps: () => [reads.sharedWorldHistory(worldId)],
      };
    }
    case "account":
      return {
        // The account's status names nothing it knows: outside a campaign
        // Hob knows the core rules, which are the same for everybody.
        opened: (client) =>
          Effect.map(
            Effect.all(
              { status: client.meHob.status(), threads: client.meHob.threads() },
              {
                concurrency: 2,
              },
            ),
            ({ status, threads }) => ({
              status: {
                available: status.available,
                model: status.model,
                label: "Core rules",
                type: "account",
              },
              threads,
            }),
          ),
        turns: (client, threadId) => client.meHob.turns({ params: { threadId } }),
        // No `intent`: this is the panel, which drafts a campaign or a
        // character. The create screen's composer names its own.
        ask: (client, payload) => client.meHob.ask({ payload }),
        accept: (client, threadId, turnId) =>
          client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
        // A kept campaign is a row on the Campaigns list, and a card in its
        // Shared World's directory when it named one; a kept character is a
        // card on the roster.
        keeps: (accepted) =>
          accepted.accepted === "campaign"
            ? [reads.myCampaigns, reads.sharedWorld(accepted.campaign.contextId)]
            : [reads.myCharacters],
      };
  }
};

/**
 * Attach the panel to the server.
 *
 * @param scope The campaign or explicit Shared World in view, or the account
 *   outside both. Hob's tools are bound to it server-side, so there is no scope
 *   id in a payload or tool parameter.
 * @param open Whether the panel is showing. **Nothing is requested until it
 *   is**: the panel is closed on every screen by default, so asking whether a
 *   model is configured at mount would put a request on every page load for a
 *   surface nobody opened. Re-asking on each open is the deliberate other half
 *   — a server restarted with a model configured is then one panel toggle away
 *   from working, rather than a page reload.
 * @param onKept What to do once a proposal is kept, with what it made. The
 *   panel does not know the router; the account's panel opens a kept campaign
 *   or character through this.
 */
export function useHobConversation(
  scope: HobScope | undefined,
  open: boolean,
  onKept?: (accepted: HobAccepted) => void,
): HobConversation {
  /**
   * The scope as one string, which is what every effect below keys on: a new
   * object for the same scope on each render must not start a conversation
   * over, and a different scope must.
   */
  const scopeKey =
    scope === undefined ? undefined : scope.type === "account" ? "account" : scope.id;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const onKeptRef = useRef(onKept);
  onKeptRef.current = onKept;
  const fetchCredential = useCredential();
  const [turns, setTurns] = useState<ReadonlyArray<HobTurn>>([]);
  const [saved, setSaved] = useState<ReadonlyArray<string>>([]);
  /** What each kept card made, by turn id: what *Open it* opens. */
  const [kept, setKept] = useState<Readonly<Record<string, HobAccepted>>>({});
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
  const [status, setStatus] = useState<ConversationStatus | undefined>(undefined);

  /** Monotonic, so a turn's key is stable and no environment API is needed. */
  const nextId = useRef(0);
  const answering = useRef<Fiber.Fiber<unknown, unknown> | undefined>(undefined);
  const credentialRef = useRef(fetchCredential);
  credentialRef.current = fetchCredential;
  const invalidate = useInvalidate();
  /**
   * The conversation being continued.
   *
   * A ref rather than state because `send` reads it at the instant it fires and
   * the `began` event writes it mid-answer — a re-render in between would give
   * the second question a stale thread and split one evening into two.
   */
  const thread = useRef<AssistantThreadId | undefined>(undefined);

  // Two reads on open, and neither is optional. `status` is the only reason the
  // composer appears — the server answers `available: false` rather than
  // failing when no model is configured, so an unconfigured deployment is a
  // quiet panel and not a broken one. The thread is what makes the panel worth
  // reopening: the evening is still there.
  useEffect(() => {
    const current = scopeRef.current;
    if (current === undefined) {
      setStatus(undefined);
      return;
    }
    if (!open) return;
    const calls = callsFor(current);
    let live = true;
    void (async () => {
      const token = await credentialRef.current();
      const result = await runApiResult(
        (client) =>
          calls.opened(client).pipe(
            Effect.flatMap(({ status: known, threads }) => {
              const newest = threads[0];
              return newest === undefined
                ? Effect.succeed({ status: known, threadId: undefined, recorded: [] })
                : Effect.map(calls.turns(client, newest.id), (recorded) => ({
                    status: known,
                    threadId: newest.id as AssistantThreadId | undefined,
                    recorded,
                  }));
            }),
          ),
        token,
      );
      if (!live || Result.isFailure(result)) {
        // A failed read leaves the panel exactly as it was: `status` undefined
        // renders the *nothing is behind this* line, which is the honest thing
        // to say when the server did not answer.
        return;
      }
      setStatus(result.success.status);
      // Only adopt the saved thread when there is nothing on screen. A DM who
      // asked something while this was in flight is mid-conversation, and
      // replacing their turns with the ones the server had a moment ago would
      // lose the question they are watching.
      setTurns((current) => {
        if (current.length > 0) return current;
        thread.current = result.success.threadId;
        setSaved(
          result.success.recorded.filter((turn) => turn.acceptedAt !== null).map((turn) => turn.id),
        );
        return shownAs(result.success.recorded);
      });
    })();
    return () => {
      live = false;
    };
  }, [scopeKey, open]);

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
      const current = scopeRef.current;
      if (current === undefined || asking) return;
      const calls = callsFor(current);

      append({ id: `you-${nextId.current++}`, who: "user", text });
      setAsking(true);
      setWriting(false);
      setActivity(undefined);

      const receive = (event: HobEvent) => {
        switch (event.event) {
          case "began":
            // The thread this evening belongs to, learnt before a word of the
            // answer. The next question continues it.
            thread.current = event.data.threadId;
            return;
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
          case "proposal": {
            setActivity(undefined);
            append({
              id: `${event.data.turnId}:card`,
              who: "artifact",
              artifact: artifactFrom(event.data.turnId, event.data.proposal),
            });
            return;
          }
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
        const continuing = thread.current;
        const payload =
          // The key is *omitted* when there is no thread, not sent as
          // `undefined`: the derived client encodes an absent optional as
          // `null`, and `Schema.optional` refuses a null on the way back in —
          // a 400 on the first question of every conversation.
          continuing === undefined ? { text } : { threadId: continuing, text };
        const stream = yield* calls.ask(client, payload);
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
    [append, asking, say],
  );

  /**
   * Accept a proposal into the scoped record — the one write on this surface.
   *
   * It sends no content, only the ids: the row is materialised from the
   * proposal the *server* stored on that turn. That is what makes the
   * `origin: "assistant"` it records worth having, and it is why this takes an
   * artifact and reads nothing off it but its id.
   *
   * **The screen behind the panel catches up**: the panel does not know what is
   * behind it and does not have to, because it knows its scope, and an accepted
   * proposal is a row read through keys the scope names (`callsFor`'s `keeps`).
   * Whichever screen is drawing those reads itself again.
   */
  const save = useCallback(
    (artifact: HobArtifact) => {
      const threadId = thread.current;
      const current = scopeRef.current;
      if (current === undefined || threadId === undefined) return;
      const calls = callsFor(current);
      const turnId = artifact.id as AssistantTurnId;

      void (async () => {
        const token = await credentialRef.current();
        const result = await runApiResult(
          (client) => calls.accept(client, threadId, turnId),
          token,
        );
        if (Result.isSuccess(result)) {
          setSaved((done) => [...done, turnId]);
          setKept((made) => ({ ...made, [turnId]: result.success }));
          invalidate(calls.keeps(result.success));
          onKeptRef.current?.(result.success);
          return;
        }
        // In the thread, where the card is, for the reason `SaveFailure` sits
        // in a dialog's footer: a line somewhere else is a line nobody reads.
        append({
          id: `hob-${nextId.current++}`,
          who: "hob",
          text: saveFailureFor(result.failure),
        });
      })();
    },
    [append, invalidate],
  );

  /** Opens what a kept card made, again: the same thing a keep does first. */
  const openKept = useCallback(
    (artifact: HobArtifact) => {
      const made = kept[artifact.id];
      if (made !== undefined) onKeptRef.current?.(made);
    },
    [kept],
  );

  const reset = useCallback(() => {
    const fiber = answering.current;
    if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber));
    answering.current = undefined;
    // Forgetting the thread is the whole of *New thread*: the next question
    // starts one, and the old one stays on the server.
    thread.current = undefined;
    setTurns([]);
    setSaved([]);
    setKept({});
    setAsking(false);
    setWriting(false);
    setActivity(undefined);
  }, []);

  /**
   * A different scope is a different conversation.
   *
   * The panel outlives navigation, so the scope changes under a mounted hook:
   * the thread, the turns and anything still answering belong to the campaign
   * or world they were asked in. The read effect above adopts the new scope's
   * newest thread, and only onto an empty transcript, which this is what makes.
   */
  const shownFor = useRef(scopeKey);
  useEffect(() => {
    if (shownFor.current === scopeKey) return;
    shownFor.current = scopeKey;
    reset();
    setStatus(undefined);
  }, [scopeKey, reset]);

  return {
    turns,
    thinking: asking && !writing,
    activity,
    savedArtifactIds: saved,
    context:
      status === undefined
        ? []
        : [
            {
              icon: status.type === "sharedWorld" ? ("map" as const) : ("book-open" as const),
              label: status.label,
              live: true,
            },
            ...(status.model === null ? [] : [{ icon: "sparkles" as const, label: status.model }]),
          ],
    send: status?.available === true ? send : undefined,
    // Two reasons, both actionable, and the panel deserves the exact one.
    unavailable:
      status?.available === true
        ? undefined
        : scope === undefined
          ? "Hob works for this table's creator here. Leave the campaign to ask it about " +
            "your own characters and campaigns."
          : "No model is configured behind Hob. Set HOB_API_URL and HOB_MODEL in apps/server/.env.local, then restart the server.",
    save: scope === undefined ? undefined : save,
    open: scope?.type === "account" ? openKept : undefined,
    openableArtifactIds: Object.keys(kept),
    discard: undefined,
    retry: undefined,
    reset: turns.length > 0 ? reset : undefined,
  };
}
