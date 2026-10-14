import type { CombatantId, NpcTurnMoment } from "@taverns/api";

/**
 * **Hob's autopilot, as a state machine**: what the DM's runner does on its
 * own while a fight's autopilot is on and this tab drives it
 * (`EncounterRun.hobAutopilotDriver`). Pure: `hob/autopilot.ts` carries out
 * what each state asks for (`work`) and feeds back what came of it.
 *
 * When the marker lands on a monster: its spent recharges are rolled (the
 * DM's browser dice, as the *Resources* button rolls them), Hob is asked for
 * the turn, the offer is kept, and what came of it shows on the card for a
 * short countdown the DM can stop, undo or skip. Then each legendary creature
 * the rule picks (`legendaryDue`) takes one legendary action the same way,
 * and the marker moves on with the creature the loop saw up, so a second
 * writer cannot make it skip a turn. A party member's turn is the table's: the
 * loop waits, and when the DM presses *Next turn* the legendary actions come
 * first.
 *
 * It hands the fight back (`paused`) on anything a person should look at: a
 * keep that leaves saves pending waits for them and then goes on by itself;
 * every other pause (Hob offering nothing, a `Conflict`, Hob off, the DM's
 * own hand mid-turn, the live connection dropping, *Undo*, *Stop*) holds the
 * turn until the DM presses *Resume*. A pause over one creature's turn lifts
 * when the marker moves on by hand; *Stop*, a dropped connection and Hob off
 * hold until *Resume*. Reactions are never the loop's: their triggers are not
 * in the data.
 */

/** A monster's facts the loop decides by, read from `npcTurnOptions` and its row. */
export interface PilotCreature {
  /** Whether it has a turn to take now (`npcMomentRefusal` of `turn`). */
  readonly canTakeTurn: boolean;
  /** Whether it has a legendary action to take now. */
  readonly canActLegendary: boolean;
  /** Legendary actions left this round. */
  readonly legendaryLeft: number;
  /** The recharge abilities waiting on their roll. */
  readonly recharging: ReadonlyArray<string>;
}

/** One row of the order. */
export interface PilotRow {
  readonly id: CombatantId;
  readonly name: string;
  readonly kind: "pc" | "npc";
  /** A monster at zero: *Next turn* passes over it. */
  readonly out: boolean;
}

/** The fight as the loop reads it. */
export interface PilotFight {
  readonly round: number;
  readonly activeId: CombatantId | null;
  /** A fight on the table and taking turns. */
  readonly takingTurns: boolean;
  /** Initiative order, as the runner shows it. */
  readonly order: ReadonlyArray<PilotRow>;
  /** Each monster's facts; a party member has none. */
  readonly creatures: ReadonlyMap<CombatantId, PilotCreature>;
}

/** One thing a creature does under the loop. */
export interface PilotAct {
  readonly combatantId: CombatantId;
  readonly moment: Extract<NpcTurnMoment, "turn" | "legendary">;
}

/** Why the loop handed the fight back. */
export type PauseReason =
  | { readonly kind: "stopped" }
  | { readonly kind: "hob"; readonly sentence: string }
  | { readonly kind: "conflict"; readonly sentence: string }
  | { readonly kind: "unavailable"; readonly sentence: string }
  | { readonly kind: "hand" }
  | { readonly kind: "stream" }
  | { readonly kind: "undone" };

/** Which turn a state is about: the round and who is up. */
export type TurnKey = string;

export const turnKeyOf = (fight: PilotFight): TurnKey | undefined =>
  fight.takingTurns && fight.activeId !== null
    ? `${String(fight.round)}:${fight.activeId}`
    : undefined;

/**
 * Where a turn's legendary stage stands: `undefined` while the creature up is
 * still taking its own turn, then the legendary creatures still to act.
 */
type Queue = ReadonlyArray<CombatantId> | undefined;

/** A state that does something. */
export type Working =
  | { readonly phase: "recharging"; readonly turn: TurnKey; readonly act: PilotAct }
  | {
      readonly phase: "asking";
      readonly turn: TurnKey;
      readonly act: PilotAct;
      readonly queue: Queue;
    }
  | {
      readonly phase: "keeping";
      readonly turn: TurnKey;
      readonly act: PilotAct;
      readonly queue: Queue;
      readonly turnId: string;
    }
  | {
      readonly phase: "saves";
      readonly turn: TurnKey;
      readonly act: PilotAct;
      readonly queue: Queue;
      readonly turnId: string;
    }
  | {
      readonly phase: "counting";
      readonly turn: TurnKey;
      /** Who just acted, for the card to show. */
      readonly act: PilotAct;
      readonly queue: Queue;
      /** Why there was nothing to keep, when there was not. */
      readonly note: string | undefined;
    }
  | { readonly phase: "advancing"; readonly turn: TurnKey; readonly from: CombatantId };

export type Loop =
  /** Waiting: a party member is up, or the fight is not taking turns. `turn` is the marker already seen. */
  | { readonly phase: "idle"; readonly turn: TurnKey | undefined }
  | Working
  | {
      readonly phase: "paused";
      readonly turn: TurnKey | undefined;
      readonly reason: PauseReason;
      /** What *Resume* goes back to. */
      readonly back: Loop;
    };

export const START: Loop = { phase: "idle", turn: undefined };

export type PilotEvent =
  /** The fight as it now stands. */
  | { readonly kind: "fight"; readonly fight: PilotFight }
  | { readonly kind: "recharged"; readonly fight: PilotFight }
  | { readonly kind: "offered"; readonly turnId: string }
  /** The ask came to nothing: refused, failed, or words with no offer. */
  | { readonly kind: "noOffer"; readonly sentence: string; readonly unavailable: boolean }
  | { readonly kind: "kept"; readonly pendingSaves: number }
  | { readonly kind: "keepFailed"; readonly sentence: string; readonly conflict: boolean }
  | { readonly kind: "savesSettled" }
  /** The countdown ran out, or the DM pressed *Next now*. */
  | { readonly kind: "countdownDone"; readonly fight: PilotFight }
  /** The DM pressed *Next turn* at a party member's turn. */
  | { readonly kind: "endTurn"; readonly fight: PilotFight }
  | { readonly kind: "advanced" }
  | { readonly kind: "advanceFailed"; readonly sentence: string }
  | { readonly kind: "stop" }
  | { readonly kind: "resume"; readonly fight: PilotFight }
  | { readonly kind: "undone" }
  | { readonly kind: "hand" }
  | { readonly kind: "streamLost" }
  | { readonly kind: "hobUnavailable"; readonly sentence: string };

/** Whether the loop is in the middle of something. */
export const isWorking = (loop: Loop): loop is Working =>
  loop.phase !== "idle" && loop.phase !== "paused";

/**
 * **Which legendary creatures act at the end of `endedId`'s turn**: one
 * legendary action each, for every other creature on its feet with one to
 * take, when the turn that ended was a party member's (the creature answers
 * the table), or when it has as many actions left as turn ends remain before
 * its own turn (`freshTurn` gives them back then, so one unspent is wasted).
 * The order's order, so the creature acting soonest after this goes first.
 */
export const legendaryDue = (fight: PilotFight, endedId: CombatantId): CombatantId[] => {
  const { order } = fight;
  const at = order.findIndex((row) => row.id === endedId);
  const ended = order[at];
  if (ended === undefined) return [];
  const due: CombatantId[] = [];
  // The turn ends left before each creature's own: this one, and one more for
  // every creature still standing between here and it.
  let ends = 1;
  for (let step = 1; step < order.length; step++) {
    const row = order[(at + step) % order.length];
    if (row === undefined || row.out) continue;
    const creature = fight.creatures.get(row.id);
    if (
      creature !== undefined &&
      creature.canActLegendary &&
      creature.legendaryLeft > 0 &&
      (ended.kind === "pc" || creature.legendaryLeft >= ends)
    ) {
      due.push(row.id);
    }
    ends += 1;
  }
  return due;
};

const nameOf = (fight: PilotFight, id: CombatantId): string =>
  fight.order.find((row) => row.id === id)?.name ?? "It";

/** A new creature up: its recharges, then its turn, or a countdown if it can do nothing. */
const startTurn = (fight: PilotFight, turn: TurnKey): Loop => {
  const id = fight.activeId;
  const row = fight.order.find((candidate) => candidate.id === id);
  const creature = id === null ? undefined : fight.creatures.get(id);
  if (id === null || row === undefined || row.kind === "pc" || creature === undefined) {
    return { phase: "idle", turn };
  }
  const act: PilotAct = { combatantId: id, moment: "turn" };
  if (creature.recharging.length > 0) return { phase: "recharging", turn, act };
  return afterRecharge(fight, turn, act);
};

const afterRecharge = (fight: PilotFight, turn: TurnKey, act: PilotAct): Loop =>
  fight.creatures.get(act.combatantId)?.canTakeTurn === true
    ? { phase: "asking", turn, act, queue: undefined }
    : {
        phase: "counting",
        turn,
        act,
        queue: undefined,
        note: `${nameOf(fight, act.combatantId)} can do nothing this turn.`,
      };

/** The legendary stage, one creature at a time, and then the next turn. */
const nextLegendary = (
  fight: PilotFight,
  turn: TurnKey,
  queue: ReadonlyArray<CombatantId>,
): Loop => {
  const [first, ...rest] = queue.filter((id) => fight.creatures.get(id)?.canActLegendary === true);
  if (first !== undefined) {
    return {
      phase: "asking",
      turn,
      act: { combatantId: first, moment: "legendary" },
      queue: rest,
    };
  }
  return fight.activeId === null
    ? { phase: "idle", turn }
    : { phase: "advancing", turn, from: fight.activeId };
};

/** Hand the fight back, remembering what *Resume* goes back to. */
const pause = (loop: Loop, reason: PauseReason): Loop => {
  if (loop.phase === "paused") return { ...loop, reason };
  // A recharge in flight finishes on its own; what follows it is the ask.
  const back: Loop =
    loop.phase === "recharging" ? { ...loop, phase: "asking", queue: undefined } : loop;
  return { phase: "paused", turn: loop.turn, reason, back };
};

/** Whether a pause lasts past the turn it happened in. */
const holds = (reason: PauseReason): boolean =>
  reason.kind === "stopped" || reason.kind === "stream" || reason.kind === "unavailable";

/** The answer a working state was waiting for, landing while the loop is paused. */
const settleBack = (back: Loop, event: PilotEvent): Loop => {
  if (back.phase === "keeping" && event.kind === "kept") {
    return event.pendingSaves > 0
      ? { ...back, phase: "saves" }
      : { phase: "counting", turn: back.turn, act: back.act, queue: back.queue, note: undefined };
  }
  if (back.phase === "keeping" && event.kind === "keepFailed") {
    return { phase: "asking", turn: back.turn, act: back.act, queue: back.queue };
  }
  // Offered after *Stop*: the offer stays on the card, and *Resume* keeps it.
  if (back.phase === "asking" && event.kind === "offered") {
    return { ...back, phase: "keeping", turnId: event.turnId };
  }
  if (back.phase === "saves" && event.kind === "savesSettled") {
    return {
      phase: "counting",
      turn: back.turn,
      act: back.act,
      queue: back.queue,
      note: undefined,
    };
  }
  return back;
};

/** The loop after `event`. */
export const step = (loop: Loop, event: PilotEvent): Loop => {
  switch (event.kind) {
    case "stop":
      return pause(loop, { kind: "stopped" });
    case "streamLost":
      return pause(loop, { kind: "stream" });
    case "hobUnavailable":
      return pause(loop, { kind: "unavailable", sentence: event.sentence });
    case "hand":
      // A party member's turn is the DM's to play by hand.
      return isWorking(loop) ? pause(loop, { kind: "hand" }) : loop;
    case "undone":
      // The act is back to untaken, so *Resume* asks for it again.
      return loop.phase === "idle" ? loop : pause(reask(loop), { kind: "undone" });
    default:
      break;
  }

  if (loop.phase === "paused") {
    switch (event.kind) {
      case "resume": {
        const key = turnKeyOf(event.fight);
        // The marker moved while it was paused: start from whoever is up now.
        if (key !== loop.turn || loop.back.phase === "idle" || loop.back.phase === "paused") {
          return step(START, { kind: "fight", fight: event.fight });
        }
        return loop.back;
      }
      case "fight": {
        const key = turnKeyOf(event.fight);
        if (holds(loop.reason) || key === loop.turn) return loop;
        return step(START, event);
      }
      default:
        return { ...loop, back: settleBack(loop.back, event) };
    }
  }

  switch (loop.phase) {
    case "idle": {
      if (event.kind === "fight") {
        const key = turnKeyOf(event.fight);
        if (key === undefined) return { phase: "idle", turn: undefined };
        return key === loop.turn ? loop : startTurn(event.fight, key);
      }
      if (event.kind === "endTurn" && loop.turn !== undefined && event.fight.activeId !== null) {
        if (turnKeyOf(event.fight) !== loop.turn) return loop;
        return nextLegendary(
          event.fight,
          loop.turn,
          legendaryDue(event.fight, event.fight.activeId),
        );
      }
      return loop;
    }
    case "recharging":
      if (event.kind === "recharged") return afterRecharge(event.fight, loop.turn, loop.act);
      return movedOn(loop, event);
    case "asking":
      if (event.kind === "offered") return { ...loop, phase: "keeping", turnId: event.turnId };
      if (event.kind === "noOffer") {
        return pause(
          loop,
          event.unavailable
            ? { kind: "unavailable", sentence: event.sentence }
            : { kind: "hob", sentence: event.sentence },
        );
      }
      return movedOn(loop, event);
    case "keeping":
      if (event.kind === "kept") return settleBack(loop, event);
      if (event.kind === "keepFailed") {
        return pause(
          { phase: "asking", turn: loop.turn, act: loop.act, queue: loop.queue },
          event.conflict
            ? { kind: "conflict", sentence: event.sentence }
            : { kind: "hob", sentence: event.sentence },
        );
      }
      return movedOn(loop, event);
    case "saves":
      if (event.kind === "savesSettled") return settleBack(loop, event);
      return movedOn(loop, event);
    case "counting":
      if (event.kind === "countdownDone" || event.kind === "endTurn") {
        if (turnKeyOf(event.fight) !== loop.turn) return pause(loop, { kind: "hand" });
        const queue =
          loop.queue ??
          (event.fight.activeId === null ? [] : legendaryDue(event.fight, event.fight.activeId));
        return nextLegendary(event.fight, loop.turn, queue);
      }
      return movedOn(loop, event);
    case "advancing":
      if (event.kind === "advanced") return { phase: "idle", turn: loop.turn };
      if (event.kind === "advanceFailed") {
        return pause(loop, { kind: "conflict", sentence: event.sentence });
      }
      if (event.kind === "fight" && turnKeyOf(event.fight) !== loop.turn) {
        return step({ phase: "idle", turn: loop.turn }, event);
      }
      return loop;
  }
};

/** The same act asked for again, from wherever the loop stood over it. */
const reask = (loop: Loop): Loop => {
  if (loop.phase === "paused") return { ...loop, back: reask(loop.back) };
  if (loop.phase === "keeping" || loop.phase === "saves" || loop.phase === "counting") {
    return { phase: "asking", turn: loop.turn, act: loop.act, queue: loop.queue };
  }
  return loop;
};

/** The marker moved while the loop was working on a turn: somebody else's hand. */
const movedOn = (loop: Working, event: PilotEvent): Loop =>
  event.kind === "fight" && turnKeyOf(event.fight) !== loop.turn
    ? pause(loop, { kind: "hand" })
    : loop;

/** Who the card should be following: whoever the loop is acting for. */
export const actingOf = (loop: Loop): CombatantId | undefined => {
  const at = loop.phase === "paused" ? loop.back : loop;
  return isWorking(at) && at.phase !== "advancing" ? at.act.combatantId : undefined;
};

/** The DM's one line for where the loop stands. */
export const statusOf = (loop: Loop, nameOf: (id: CombatantId) => string): string => {
  switch (loop.phase) {
    case "idle":
      return "Autopilot is on: it takes the next monster's turn.";
    case "recharging":
      return `Rolling ${nameOf(loop.act.combatantId)}'s recharge…`;
    case "asking":
      return loop.act.moment === "turn"
        ? `Hob is choosing ${nameOf(loop.act.combatantId)}'s turn…`
        : `Hob is choosing a legendary action for ${nameOf(loop.act.combatantId)}…`;
    case "keeping":
      return `Keeping ${nameOf(loop.act.combatantId)}'s turn…`;
    case "saves":
      return "Waiting on the saves: enter each total on the card.";
    case "counting":
      return loop.note ?? "Moving on in a moment.";
    case "advancing":
      return "Moving on…";
    case "paused":
      return `Autopilot is paused: ${pauseSentence(loop.reason)}`;
  }
};

const pauseSentence = (reason: PauseReason): string => {
  switch (reason.kind) {
    case "stopped":
      return "you stopped it.";
    case "hob":
    case "conflict":
    case "unavailable":
      return reason.sentence;
    case "hand":
      return "the fight changed by hand.";
    case "stream":
      return "the live connection dropped.";
    case "undone":
      return "the turn was undone.";
  }
};
