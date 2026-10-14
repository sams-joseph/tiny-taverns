import type {
  AssistantThreadId,
  AssistantTurnId,
  CampaignId,
  CombatantId,
  EncounterRunId,
  HobEvent,
  HobPendingSave,
  HobPendingSaveId,
  HobProposal,
  NpcTurnMoment,
  NpcTurnOutcome,
  SessionId,
} from "@taverns/api";
import { Effect, Fiber, Result, Stream } from "effect";
import { FetchHttpClient } from "effect/http";
import { useCallback, useEffect, useRef, useState } from "react";
import { useInvalidate } from "../api/atoms";
import { makeClient, runApiResult } from "../api/client";
import { type ApiFailure, classifyFailure } from "../api/failure";
import { reads } from "../api/keys";
import { useCredential } from "../auth/credential";
import { discardFailureFor, sentenceFor } from "./conversation";

/** A monster's turn as Hob offered it. */
export type NpcTurnProposal = Extract<HobProposal, { readonly target: "npcTurn" }>;

/** The offer on the card, with the ids a discard names. */
export interface FightOffer {
  readonly threadId: AssistantThreadId;
  readonly turnId: AssistantTurnId;
  readonly proposal: NpcTurnProposal;
}

/** A turn kept for this creature: what came of it, and whether it can still be undone. */
export interface FightKept {
  readonly outcome: NpcTurnOutcome;
  /** It is the run's latest kept turn not undone: the only one *Undo* takes back. */
  readonly latest: boolean;
  readonly undone: boolean;
}

/** What came of an ask: the offer, or why there was none. */
export type FightAsked =
  | { readonly kind: "offered"; readonly offer: FightOffer }
  | {
      readonly kind: "none";
      readonly sentence: string;
      /** The failure, when the ask itself failed rather than ending with no offer. */
      readonly failure: ApiFailure | undefined;
    };

/** What came of a keep. */
export type FightKeep =
  | {
      readonly kind: "kept";
      readonly outcome: NpcTurnOutcome;
      /** How many of its saves wait on the DM. */
      readonly pending: number;
    }
  | { readonly kind: "failed"; readonly failure: ApiFailure };

export interface FightTurn {
  /** The creature this is about, if any. */
  readonly combatantId: CombatantId | undefined;
  /** Whether a model is behind Hob; `undefined` until the campaign's status is read. */
  readonly available: boolean | undefined;
  /** A turn is being chosen. */
  readonly asking: boolean;
  /** What Hob is doing while it chooses. */
  readonly activity: string | undefined;
  /** The open offer for this creature, if there is one. */
  readonly offer: FightOffer | undefined;
  /** Why the last ask or discard came to nothing, in a sentence. */
  readonly note: string | undefined;
  /** This creature's newest kept turn this round, if it has one. */
  readonly kept: FightKept | undefined;
  /** The saves that turn left to the DM, in every state. */
  readonly saves: ReadonlyArray<HobPendingSave>;
  /** A keep, an undo or a save is being written. */
  readonly writing: boolean;
  readonly ask: (moment: NpcTurnMoment, instruction?: string) => Promise<FightAsked>;
  readonly discard: () => void;
  /** Discard the offer, then ask again for the same moment. */
  readonly retry: (instruction?: string) => void;
  /** Carry the offer (or `offer`) out: the server rolls its dice and writes it. */
  readonly keep: (offer?: FightOffer) => Promise<FightKeep>;
  /** Take the kept turn back; true once the server has. */
  readonly undo: () => Promise<boolean>;
  /** A pending save, from the total the DM entered. */
  readonly resolve: (saveId: HobPendingSaveId, total: number) => void;
  /** Put the kept turn's result away. */
  readonly dismiss: () => void;
}

/**
 * Whether a model is behind Hob for this campaign: `undefined` until the
 * status is read. The card draws nothing without one, and the runner offers
 * no autopilot.
 */
export const useHobAvailable = (campaignId: CampaignId): boolean | undefined => {
  const fetchCredential = useCredential();
  const credentialRef = useRef(fetchCredential);
  credentialRef.current = fetchCredential;
  const [available, setAvailable] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void (async () => {
      const token = await credentialRef.current();
      const status = await runApiResult(
        (client) => client.hob.status({ params: { campaignId } }),
        token,
      );
      if (live) setAvailable(Result.isSuccess(status) && status.success.available);
    })();
    return () => {
      live = false;
    };
  }, [campaignId]);
  return available;
};

/** What a failed keep, undo or save says. A `Conflict` is the server's own sentence. */
const writeFailureFor = (failure: ApiFailure): string =>
  failure.kind === "conflict"
    ? failure.message
    : sentenceFor(failure).replace(/^Hob could not answer: /, "Nothing changed: ");

/**
 * **Hob choosing a monster's turn**, for the runner's card — this directory's
 * second seam beside `conversation.ts`, over the `hobFight` group.
 *
 * It streams one turn for one creature at one moment and keeps the offer that
 * arrives. *Discard* is the ordinary `hob.discard` on the fight's own thread,
 * and *Try again* is that discard and a re-ask, which Hob answers having read
 * the discarded offer. *Keep* (`hobFight.keep`) has the server carry the
 * offer out with its own dice; the card then shows what came of it, the saves
 * it left to the DM (`resolveSave`) and *Undo* while it is the run's latest
 * kept turn. Each of those writes re-reads the fight (`onChanged`) and names
 * the reads it moved: the night's rolls, the party's hit points and the
 * player's table.
 *
 * On mount it reads the fight's thread back (`hobFight.thread`, then
 * `hob.turns`), so an offer still open for this creature in this round survives
 * a reload, and so does its newest kept turn this round (`hobFight.kept`).
 * One whose moment no longer applies, or from an earlier round, is left on
 * the record and not drawn.
 *
 * Hob's autopilot (`hob/autopilot.ts`) drives the same hook the card draws,
 * so what it asks, keeps and leaves to the DM is on the card as it happens:
 * that is why `ask`, `keep` and `undo` answer what came of them. With no
 * creature (`combatantId` absent) it reads and asks nothing.
 */
export const useFightTurn = ({
  campaignId,
  sessionId,
  runId,
  combatantId,
  round,
  moments,
  onChanged,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly runId: EncounterRunId;
  readonly combatantId: CombatantId | undefined;
  readonly round: number;
  /** The moments this creature has now; an offer for another is not drawn. */
  readonly moments: ReadonlyArray<NpcTurnMoment>;
  /** The fight moved: re-read it. */
  readonly onChanged: () => void;
}): FightTurn => {
  const fetchCredential = useCredential();
  const credentialRef = useRef(fetchCredential);
  credentialRef.current = fetchCredential;
  const available = useHobAvailable(campaignId);
  const [asking, setAsking] = useState(false);
  const [activity, setActivity] = useState<string | undefined>(undefined);
  const [offer, setOffer] = useState<FightOffer | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>(undefined);
  const [kept, setKept] = useState<FightKept | undefined>(undefined);
  const [saves, setSaves] = useState<ReadonlyArray<HobPendingSave>>([]);
  const [writing, setWriting] = useState(false);
  const invalidate = useInvalidate();
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;
  const answering = useRef<Fiber.Fiber<unknown, unknown> | undefined>(undefined);
  const lastMoment = useRef<NpcTurnMoment | undefined>(undefined);
  const momentsKey = moments.join(",");

  // Which creature the hook is about now: an answer for another is not drawn.
  const current = useRef(combatantId);
  current.current = combatantId;
  const askingRef = useRef(false);
  const writingRef = useRef(false);

  // The offer this creature still has open, read back off the fight's thread.
  useEffect(() => {
    let live = true;
    setOffer(undefined);
    setNote(undefined);
    if (combatantId === undefined) return;
    void (async () => {
      const token = await credentialRef.current();
      const result = await runApiResult(
        (client) =>
          Effect.flatMap(
            client.hobFight.thread({ params: { campaignId, sessionId, runId } }),
            (thread) =>
              Effect.map(
                client.hob.turns({ params: { campaignId, threadId: thread.id } }),
                (turns) => ({ thread, turns }),
              ),
          ),
        token,
      );
      // No thread yet is the ordinary case: Hob has not been asked in this fight.
      if (!live || Result.isFailure(result)) return;
      const open = momentsKey.split(",");
      const newest = [...result.success.turns]
        .reverse()
        .find(
          (turn) =>
            turn.proposal?.target === "npcTurn" &&
            turn.acceptedAt === null &&
            turn.discardedAt === null &&
            turn.proposal.combatantId === combatantId &&
            turn.proposal.round === round &&
            open.includes(turn.proposal.moment),
        );
      if (newest?.proposal?.target === "npcTurn") {
        setOffer({
          threadId: result.success.thread.id,
          turnId: newest.id,
          proposal: newest.proposal,
        });
      }
    })();
    return () => {
      live = false;
    };
  }, [campaignId, sessionId, runId, combatantId, round, momentsKey]);

  /** The saves a kept turn left, read again. */
  const readSaves = useCallback(
    async (turnId: AssistantTurnId) => {
      const token = await credentialRef.current();
      const result = await runApiResult(
        (client) => client.hobFight.saves({ params: { campaignId, sessionId, runId } }),
        token,
      );
      if (Result.isFailure(result)) return [];
      const mine = result.success.filter((save) => save.turnId === turnId);
      setSaves(mine);
      return mine;
    },
    [campaignId, sessionId, runId],
  );

  // This creature's newest kept turn this round, read back.
  useEffect(() => {
    let live = true;
    setKept(undefined);
    setSaves([]);
    if (combatantId === undefined) return;
    void (async () => {
      const token = await credentialRef.current();
      const result = await runApiResult(
        (client) => client.hobFight.kept({ params: { campaignId, sessionId, runId } }),
        token,
      );
      if (!live || Result.isFailure(result)) return;
      const latest = result.success.find((turn) => turn.undoneAt === null);
      const mine = result.success.find(
        (turn) =>
          turn.undoneAt === null &&
          turn.outcome.combatantId === combatantId &&
          turn.outcome.round === round,
      );
      if (mine === undefined) return;
      setKept({
        outcome: mine.outcome,
        latest: latest?.outcome.turnId === mine.outcome.turnId,
        undone: false,
      });
      await readSaves(mine.outcome.turnId);
    })();
    return () => {
      live = false;
    };
  }, [campaignId, sessionId, runId, combatantId, round, readSaves]);

  /** After a write that moved the fight: the runner's own re-read, and every read it touched. */
  const moved = useCallback(() => {
    invalidate([reads.rolls(sessionId), reads.party(campaignId), reads.playerTable(campaignId)]);
    changedRef.current();
  }, [invalidate, sessionId, campaignId]);

  // A creature changed under the card takes its question with it.
  useEffect(
    () => () => {
      if (answering.current !== undefined) Effect.runFork(Fiber.interrupt(answering.current));
      answering.current = undefined;
      askingRef.current = false;
      setAsking(false);
      setActivity(undefined);
    },
    [combatantId],
  );

  const ask = useCallback(
    (moment: NpcTurnMoment, instruction?: string): Promise<FightAsked> => {
      const forId = combatantId;
      if (askingRef.current || forId === undefined) {
        return Promise.resolve({
          kind: "none",
          sentence: "Hob is already choosing.",
          failure: undefined,
        });
      }
      askingRef.current = true;
      lastMoment.current = moment;
      setAsking(true);
      setOffer(undefined);
      setNote(undefined);
      setActivity("Hob is choosing…");
      let threadId: AssistantThreadId | undefined;
      let words = "";
      let offered: FightOffer | undefined;
      let failed: string | undefined;
      const receive = (event: HobEvent) => {
        switch (event.event) {
          case "began":
            threadId = event.data.threadId;
            return;
          case "delta":
            words += event.data.text;
            return;
          case "proposal":
            if (event.data.proposal.target === "npcTurn" && threadId !== undefined) {
              offered = {
                threadId,
                turnId: event.data.turnId,
                proposal: event.data.proposal,
              };
              setOffer(offered);
            }
            return;
          case "failed":
            failed = event.data.message;
            setNote(event.data.message);
            return;
          default:
            return;
        }
      };
      const steer = instruction?.trim() ?? "";
      return new Promise<FightAsked>((resolve) => {
        const answer = Effect.gen(function* () {
          const token = yield* Effect.promise(() => credentialRef.current());
          const client = yield* makeClient(token);
          const stream = yield* client.hobFight.turn({
            params: { campaignId, sessionId, runId, combatantId: forId },
            // Omitted rather than sent empty: the schema refuses a blank steer.
            payload: steer === "" ? { moment } : { moment, instruction: steer },
          });
          yield* Stream.runForEach(stream, (event) => Effect.sync(() => receive(event)));
        }).pipe(
          Effect.provide(FetchHttpClient.layer),
          Effect.result,
          Effect.map((outcome) => {
            askingRef.current = false;
            setAsking(false);
            setActivity(undefined);
            answering.current = undefined;
            if (Result.isFailure(outcome)) {
              const failure = classifyFailure(outcome.failure);
              const sentence = sentenceFor(failure);
              setNote(sentence);
              resolve({ kind: "none", sentence, failure });
              return;
            }
            if (offered !== undefined) {
              resolve({ kind: "offered", offer: offered });
              return;
            }
            // Words with no offer are the model talking past the tool; the
            // failure event, when there is one, already said so.
            const said = failed ?? (words.trim() === "" ? undefined : words.trim());
            if (said !== undefined && failed === undefined) setNote((now) => now ?? said);
            resolve({
              kind: "none",
              sentence: said ?? "Hob offered nothing.",
              failure: undefined,
            });
          }),
          Effect.onInterrupt(() =>
            Effect.sync(() =>
              resolve({ kind: "none", sentence: "The question was put away.", failure: undefined }),
            ),
          ),
        );
        answering.current = Effect.runFork(answer);
      });
    },
    [campaignId, sessionId, runId, combatantId],
  );

  const discardOffer = useCallback(async (): Promise<boolean> => {
    if (offer === undefined) return false;
    const token = await credentialRef.current();
    const result = await runApiResult(
      (client) =>
        client.hob.discard({
          params: { campaignId, threadId: offer.threadId, turnId: offer.turnId },
          payload: {},
        }),
      token,
    );
    if (Result.isFailure(result)) {
      setNote(discardFailureFor(result.failure));
      return false;
    }
    setOffer(undefined);
    return true;
  }, [offer, campaignId]);

  const discard = useCallback(() => void discardOffer(), [discardOffer]);

  const retry = useCallback(
    (instruction?: string) => {
      const moment = offer?.proposal.moment ?? lastMoment.current;
      if (moment === undefined) return;
      void discardOffer().then((discarded) => {
        if (discarded) void ask(moment, instruction);
      });
    },
    [offer, discardOffer, ask],
  );

  const keep = useCallback(
    async (given?: FightOffer): Promise<FightKeep> => {
      const keeping = given ?? offer;
      const forId = combatantId;
      if (keeping === undefined || writingRef.current) {
        return {
          kind: "failed",
          failure: { kind: "conflict", message: "there is nothing to keep" },
        };
      }
      writingRef.current = true;
      setWriting(true);
      setNote(undefined);
      const token = await credentialRef.current();
      const result = await runApiResult(
        (client) =>
          client.hobFight.keep({
            params: { campaignId, sessionId, runId, turnId: keeping.turnId },
            payload: {},
          }),
        token,
      );
      if (Result.isFailure(result)) {
        writingRef.current = false;
        setWriting(false);
        if (current.current === forId) setNote(writeFailureFor(result.failure));
        return { kind: "failed", failure: result.failure };
      }
      moved();
      if (current.current !== forId) {
        writingRef.current = false;
        setWriting(false);
        return { kind: "kept", outcome: result.success, pending: 0 };
      }
      setOffer(undefined);
      setKept({ outcome: result.success, latest: true, undone: false });
      const left = await readSaves(result.success.turnId);
      writingRef.current = false;
      setWriting(false);
      return {
        kind: "kept",
        outcome: result.success,
        pending: left.filter((save) => save.state === "pending").length,
      };
    },
    [offer, combatantId, campaignId, sessionId, runId, moved, readSaves],
  );

  const undo = useCallback(async (): Promise<boolean> => {
    if (kept === undefined || writingRef.current) return false;
    writingRef.current = true;
    setWriting(true);
    setNote(undefined);
    const token = await credentialRef.current();
    const result = await runApiResult(
      (client) =>
        client.hobFight.undo({
          params: { campaignId, sessionId, runId, turnId: kept.outcome.turnId },
          payload: {},
        }),
      token,
    );
    writingRef.current = false;
    setWriting(false);
    if (Result.isFailure(result)) {
      setNote(writeFailureFor(result.failure));
      return false;
    }
    setKept({ ...kept, latest: false, undone: true });
    moved();
    await readSaves(kept.outcome.turnId);
    return true;
  }, [kept, campaignId, sessionId, runId, moved, readSaves]);

  const resolve = useCallback(
    (saveId: HobPendingSaveId, total: number) => {
      if (writingRef.current) return;
      writingRef.current = true;
      setWriting(true);
      setNote(undefined);
      void (async () => {
        const token = await credentialRef.current();
        const result = await runApiResult(
          (client) =>
            client.hobFight.resolveSave({
              params: { campaignId, sessionId, runId, saveId },
              payload: { total },
            }),
          token,
        );
        writingRef.current = false;
        setWriting(false);
        if (Result.isFailure(result)) {
          setNote(writeFailureFor(result.failure));
          return;
        }
        const resolved = result.success;
        setSaves((current) =>
          current.map((save) => (save.id === resolved.save.id ? resolved.save : save)),
        );
        if (resolved.judged) {
          setNote(
            `${resolved.save.optionName} says "${resolved.save.onSuccess}" on a success: ` +
              `${resolved.save.targetName} took it in full. Adjust it by hand if that is wrong.`,
          );
        }
        moved();
      })();
    },
    [campaignId, sessionId, runId, moved],
  );

  const dismiss = useCallback(() => {
    setKept(undefined);
    setSaves([]);
    setNote(undefined);
  }, []);

  return {
    combatantId,
    available,
    asking,
    activity,
    offer,
    note,
    kept,
    saves,
    writing,
    ask,
    discard,
    retry,
    keep,
    undo,
    resolve,
    dismiss,
  };
};
