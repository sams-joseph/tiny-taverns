import type {
  CampaignId,
  CombatantId,
  EncounterRunId,
  HobAutopilotDriverId,
  NpcTurnMoment,
  SessionId,
} from "@taverns/api";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  actingOf,
  type Loop,
  type PilotEvent,
  type PilotFight,
  START,
  statusOf,
  step,
} from "../run/autopilotLoop";
import type { LiveStatus } from "../run/stream";
import { type FightOffer, type FightTurn, useFightTurn } from "./fightTurn";

/** How long a kept turn stays on the card before the loop moves on. */
export const AUTOPILOT_PAUSE_MS = 5_000;

const DRIVER_KEY = "taverns.hob-autopilot.driver";

/**
 * This tab's autopilot driver id (`EncounterRun.hobAutopilotDriver`), minted
 * once and kept in `sessionStorage`, so a reload goes on driving and another
 * tab, or another device, does not. A browser's *Duplicate tab* copies
 * `sessionStorage`, and with it the id; the `nextTurn` guard is what keeps two
 * such tabs from skipping a turn.
 */
export const autopilotDriverId = (): HobAutopilotDriverId => {
  const kept = window.sessionStorage.getItem(DRIVER_KEY);
  if (kept !== null) return kept as HobAutopilotDriverId;
  const minted = crypto.randomUUID() as HobAutopilotDriverId;
  window.sessionStorage.setItem(DRIVER_KEY, minted);
  return minted;
};

export interface Autopilot {
  readonly loop: Loop;
  /** The DM's one line for where it stands. */
  readonly status: string;
  /** Whole seconds left on the countdown, while there is one. */
  readonly countdown: number | undefined;
  /** The hook the card draws while the loop acts for a creature: what it asks, keeps and leaves. */
  readonly turn: FightTurn;
  readonly stop: () => void;
  readonly resume: () => void;
  /** Skip the rest of the countdown. */
  readonly nextNow: () => void;
  /**
   * The DM's *Next turn* while autopilot drives: at a party member's turn the
   * legendary actions come first. False when it is not the loop's to take, and
   * the runner advances as it always does.
   */
  readonly endTurn: () => boolean;
  /** *Undo* on the card: the kept act taken back, and the loop paused. */
  readonly undo: () => Promise<boolean>;
}

/**
 * **Hob's autopilot, carried out** (`run/autopilotLoop.ts` is what it decides):
 * while `driving`, it feeds the machine the fight as it stands and does what
 * each state asks for through the endpoints a press uses. The recharge is the
 * runner's own dice (`rollRecharge`), the ask and the keep are the card's
 * `useFightTurn`, held here so the card draws the same instance, and the
 * advance is `nextTurn` naming who the loop saw up (`advance`).
 *
 * `busyByHand` is the runner's own writes in flight: one mid-turn is the DM's
 * hand, which pauses the loop. A dropped connection pauses it too, and so
 * does Hob turning out to be off.
 */
export const useAutopilot = ({
  campaignId,
  sessionId,
  runId,
  driving,
  fight,
  connection,
  busyByHand,
  momentsFor,
  rollRecharge,
  advance,
  onChanged,
  nameOf,
  pauseMs = AUTOPILOT_PAUSE_MS,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly runId: EncounterRunId;
  /** Autopilot is on, and this tab is its driver. */
  readonly driving: boolean;
  readonly fight: PilotFight | undefined;
  readonly connection: LiveStatus;
  readonly busyByHand: boolean;
  readonly momentsFor: (id: CombatantId) => ReadonlyArray<NpcTurnMoment>;
  /** Roll the d6 for each spent recharge of `combatantId`, and write what came back. */
  readonly rollRecharge: (combatantId: CombatantId) => Promise<void>;
  /** `nextTurn` from `expected`; a sentence when it was refused. */
  readonly advance: (expected: CombatantId) => Promise<string | undefined>;
  readonly onChanged: () => void;
  readonly nameOf: (id: CombatantId) => string;
  readonly pauseMs?: number;
}): Autopilot => {
  const [machine, setMachine] = useState<{ readonly loop: Loop; readonly version: number }>({
    loop: START,
    version: 0,
  });
  const loop = machine.loop;
  const fightRef = useRef(fight);
  fightRef.current = fight;

  const dispatch = useCallback((event: PilotEvent) => {
    setMachine((now) => {
      const next = step(now.loop, event);
      return next === now.loop ? now : { loop: next, version: now.version + 1 };
    });
  }, []);

  // Off, or driven from elsewhere: start afresh next time.
  useEffect(() => {
    if (!driving) setMachine((now) => ({ loop: START, version: now.version + 1 }));
  }, [driving]);

  const acting = driving ? actingOf(loop) : undefined;
  const turn = useFightTurn({
    campaignId,
    sessionId,
    runId,
    combatantId: acting,
    round: fight?.round ?? 0,
    moments: acting === undefined ? NO_MOMENTS : momentsFor(acting),
    onChanged,
  });

  // The fight as it stands, every time it changes. Nothing starts before the
  // connection is live, so the loop never acts on a fight it cannot hear.
  useEffect(() => {
    if (driving && fight !== undefined && connection === "live") dispatch({ kind: "fight", fight });
  }, [driving, fight, connection, dispatch]);

  useEffect(() => {
    if (driving && (connection === "reconnecting" || connection === "stopped")) {
      dispatch({ kind: "streamLost" });
    }
  }, [driving, connection, dispatch]);

  useEffect(() => {
    if (driving && busyByHand) dispatch({ kind: "hand" });
  }, [driving, busyByHand, dispatch]);

  useEffect(() => {
    if (driving && turn.available === false) {
      dispatch({ kind: "hobUnavailable", sentence: "Hob is off on this server." });
    }
  }, [driving, turn.available, dispatch]);

  // What each state asks for, once per state entered.
  const offerRef = useRef<FightOffer | undefined>(undefined);
  const turnRef = useRef(turn);
  turnRef.current = turn;
  const [deadline, setDeadline] = useState<number | undefined>(undefined);
  useEffect(() => {
    // A countdown left from an earlier state must not end the next one at once.
    if (loop.phase !== "counting") setDeadline(undefined);
    if (!driving) return;
    const now = loop;
    switch (now.phase) {
      case "recharging":
        void rollRecharge(now.act.combatantId).then(() => {
          const latest = fightRef.current;
          if (latest !== undefined) dispatch({ kind: "recharged", fight: latest });
        });
        return;
      case "asking":
        void turnRef.current.ask(now.act.moment).then((asked) => {
          if (asked.kind === "offered") {
            offerRef.current = asked.offer;
            dispatch({ kind: "offered", turnId: asked.offer.turnId });
          } else {
            dispatch({
              kind: "noOffer",
              sentence: asked.sentence,
              unavailable: asked.failure?.kind === "unavailable",
            });
          }
        });
        return;
      case "keeping": {
        const held = turnRef.current.offer;
        const offer =
          offerRef.current?.turnId === now.turnId
            ? offerRef.current
            : held?.turnId === now.turnId
              ? held
              : undefined;
        if (offer === undefined) {
          dispatch({
            kind: "keepFailed",
            sentence: "The offer is no longer open. Ask Hob again.",
            conflict: false,
          });
          return;
        }
        void turnRef.current.keep(offer).then((kept) => {
          if (kept.kind === "kept") {
            dispatch({ kind: "kept", pendingSaves: kept.pending });
            return;
          }
          dispatch({
            kind: "keepFailed",
            sentence:
              kept.failure.kind === "conflict"
                ? `Nothing was kept: ${kept.failure.message}.`
                : "Nothing was kept: the server did not take it.",
            conflict: kept.failure.kind === "conflict",
          });
        });
        return;
      }
      case "counting":
        setDeadline(Date.now() + pauseMs);
        return;
      case "advancing":
        void advance(now.from).then((refused) =>
          dispatch(
            refused === undefined
              ? { kind: "advanced" }
              : { kind: "advanceFailed", sentence: refused },
          ),
        );
        return;
      default:
        return;
    }
    // Once per state: the version moves only when the loop does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.version, driving]);

  // A turn's saves wait on the DM: the loop goes on once none is pending.
  const savesFor = loop.phase === "saves" ? loop.turnId : undefined;
  useEffect(() => {
    if (savesFor === undefined) return;
    const mine = turn.saves.filter((save) => save.turnId === savesFor);
    if (!turn.writing && mine.every((save) => save.state !== "pending")) {
      dispatch({ kind: "savesSettled" });
    }
  }, [savesFor, turn.saves, turn.writing, dispatch]);

  // The countdown, drawn in whole seconds.
  const counting = loop.phase === "counting";
  const [left, setLeft] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!counting || deadline === undefined) {
      setLeft(undefined);
      return;
    }
    const tick = () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        setLeft(undefined);
        const latest = fightRef.current;
        if (latest !== undefined) dispatch({ kind: "countdownDone", fight: latest });
        return;
      }
      setLeft(Math.ceil(remaining / 1000));
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [counting, deadline, dispatch]);

  const stop = useCallback(() => dispatch({ kind: "stop" }), [dispatch]);
  const resume = useCallback(() => {
    const latest = fightRef.current;
    if (latest !== undefined) dispatch({ kind: "resume", fight: latest });
  }, [dispatch]);
  const nextNow = useCallback(() => {
    const latest = fightRef.current;
    if (latest !== undefined) dispatch({ kind: "countdownDone", fight: latest });
  }, [dispatch]);
  const endTurn = useCallback((): boolean => {
    const latest = fightRef.current;
    if (!driving || latest === undefined) return false;
    if (loop.phase !== "idle" && loop.phase !== "counting") return false;
    dispatch(
      loop.phase === "counting"
        ? { kind: "countdownDone", fight: latest }
        : { kind: "endTurn", fight: latest },
    );
    return true;
  }, [driving, loop.phase, dispatch]);
  const undo = useCallback(async () => {
    const undone = await turnRef.current.undo();
    if (undone) dispatch({ kind: "undone" });
    return undone;
  }, [dispatch]);

  return {
    loop,
    status: statusOf(loop, nameOf),
    countdown: counting ? left : undefined,
    turn,
    stop,
    resume,
    nextNow,
    endTurn,
    undo,
  };
};

const NO_MOMENTS: ReadonlyArray<NpcTurnMoment> = [];
