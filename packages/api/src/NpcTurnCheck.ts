import { Schema } from "effect";
import { type BoardSquare, feetBetween } from "./Board.js";
import type { Combatant } from "./Combatant.js";
import type { CombatantId } from "./Ids.js";
import { runLevelLayout, tableSight } from "./LevelFight.js";
import { pathCost } from "./LevelGeometry.js";
import {
  type NpcAim,
  type NpcPlacement,
  type NpcSlot,
  type NpcSpend,
  type NpcTarget,
  type NpcTurnFight,
  type NpcTurnOption,
  type NpcTurnOptions,
  npcTurnOptions,
} from "./NpcTurnOptions.js";
import { walkingFeet } from "./Speed.js";

/**
 * **A monster's turn, checked step by step** against {@link npcTurnOptions}:
 * the one legality rule, asked again before every step on the fight as the
 * steps before it would leave it. A move changes who is in reach and how far
 * is left to walk; an action spends the action; a recharge, a use, a slot or a
 * legendary action spends what it spends. Nothing here decides what is legal
 * that the options did not already say.
 *
 * Pure, and shared: Hob's `proposeNpcTurn` checks a draft with it, and the
 * accept that carries a turn out checks the stored one with it again.
 *
 * Dash is the one rule the options do not model (they give speed less feet
 * moved), so the walk here grants a Dash's extra speed to the moves after it.
 * How a carried-out turn records that is the accept's business.
 *
 * On a level a move is a walk: the square must be one the options say it can
 * reach (`reachableOnLevel`), and it costs what `pathCost` says, difficult
 * terrain at double. A move through a wall, or past its speed, is refused
 * whole rather than trimmed: the chooser is told why and picks again, and
 * the creature never ends somewhere nobody chose.
 */

/**
 * When the creature acts. `turn` is its own turn: moves, its action and its
 * bonus action. `legendary` is one legendary action, between other creatures'
 * turns. `reaction` is one reaction, to a trigger the options cannot see, so
 * whoever asks says what it was.
 */
export const NpcTurnMoment = Schema.Literals(["turn", "legendary", "reaction"]);
export type NpcTurnMoment = typeof NpcTurnMoment.Type;

/** Which slots a moment's steps may take. */
export const NPC_MOMENT_SLOTS: Record<NpcTurnMoment, ReadonlyArray<NpcSlot>> = {
  turn: ["action", "bonus"],
  legendary: ["legendary"],
  reaction: ["reaction"],
};

const MOMENT_WORDS: Record<NpcTurnMoment, string> = {
  turn: "its own turn",
  legendary: "a legendary action",
  reaction: "a reaction",
};

const SLOT_WORDS: Record<NpcSlot, string> = {
  action: "an action",
  bonus: "a bonus action",
  reaction: "a reaction",
  legendary: "a legendary action",
};

/**
 * One step as a proposal names it: `move` to a square, or an option by its id
 * with its aim.
 */
export interface NpcTurnStep {
  readonly option: string;
  /** Who it is aimed at; a multiattack takes one for every strike, or one for them all. */
  readonly targets?: ReadonlyArray<CombatantId>;
  /** A move's destination; where an area goes (a placement's `toward` from itself, its `origin` at a point). */
  readonly square?: BoardSquare;
}

/** A step once checked: what it is, by the option's own id and name, and where it lands. */
export type NpcTurnResolvedStep =
  | { readonly kind: "move"; readonly to: BoardSquare; readonly feet: number }
  | {
      readonly kind: "option";
      readonly optionId: string;
      readonly name: string;
      readonly slot: NpcSlot;
      readonly targets: ReadonlyArray<CombatantId>;
      /**
       * How far each aimed target stood when the step was taken, after the
       * moves before it: a long-range one is attacked at disadvantage. Absent
       * for a target nothing measured (no board, or an area's catch).
       */
      readonly bands?: Readonly<Record<CombatantId, NpcTarget["band"]>>;
      /**
       * On a level, each aimed target's cover and whether it could see the
       * creature, after the moves before it: cover adds to its AC, and an
       * attacker it cannot see attacks at advantage.
       */
      readonly aims?: Readonly<Record<CombatantId, NpcAim>>;
      readonly placement?: {
        readonly origin: BoardSquare;
        readonly toward: BoardSquare;
        readonly catches: ReadonlyArray<CombatantId>;
        /** On a level, whom it catches with cover from its origin (`NpcPlacement.covers`). */
        readonly covers?: NpcPlacement["covers"];
      };
      /** A multiattack's strikes, one per swing, each at its target. */
      readonly strikes?: ReadonlyArray<{
        readonly optionId: string;
        readonly name: string;
        readonly target: CombatantId;
        readonly band?: NpcTarget["band"];
        readonly aim?: NpcAim;
      }>;
    };

export type NpcTurnCheck =
  | { readonly ok: true; readonly steps: ReadonlyArray<NpcTurnResolvedStep> }
  | {
      readonly ok: false;
      /** The step refused, from 0; `undefined` when the moment itself does not apply. */
      readonly step: number | undefined;
      /** Why, in words the chooser can act on. */
      readonly reason: string;
    };

/**
 * Whether `moment` is one this creature has now, or why not. A turn is its
 * own; a legendary action needs one offered; a reaction needs its reaction
 * unspent and something to spend it on. On a level, a creature that sees none
 * of its foes has not found the party: it takes no turn and no legendary
 * action until it does. A reaction is still asked for, since whoever asks
 * says what triggered it.
 */
export const npcMomentRefusal = (
  options: NpcTurnOptions,
  moment: NpcTurnMoment,
): string | undefined => {
  const whole = options.omitted.find((omission) => omission.id === "*");
  if (whole !== undefined) return `it can do nothing now: ${whole.reason}`;
  if (moment !== "reaction" && options.sight?.seesFoe === false) {
    return "it sees none of its foes yet";
  }
  if (moment === "turn") return options.up ? undefined : "it is not its turn";
  if (options.options.some((option) => option.slot === moment)) return undefined;
  if (moment === "legendary") {
    return options.omitted.some((omission) => omission.reason === "its own turn")
      ? "a legendary action is taken at the end of another creature's turn, not its own"
      : "it has no legendary action it can take now";
  }
  return "it has no reaction it can take now";
};

/** The slot an option id's section is taken in, by `npcTurnOptions`' own id shapes. */
const slotOfId = (id: string): NpcSlot | undefined =>
  /^(actions|traits|standard)\//.test(id)
    ? "action"
    : id.startsWith("bonusActions/")
      ? "bonus"
      : /^(reactions|opportunity)\//.test(id)
        ? "reaction"
        : undefined;

const square = (at: BoardSquare): string => `(${String(at.column)},${String(at.row)})`;
const sameSquare = (a: BoardSquare, b: BoardSquare): boolean =>
  a.column === b.column && a.row === b.row;

/** The row after a step has spent what it spends. */
const spend = (row: Combatant, slot: NpcSlot, spends: NpcSpend): Combatant => ({
  ...row,
  actionUsed: row.actionUsed || slot === "action",
  bonusUsed: row.bonusUsed || slot === "bonus",
  reactionUsed: row.reactionUsed || slot === "reaction",
  legendarySpent: row.legendarySpent + (spends.legendary ?? 0),
  rechargeSpent:
    spends.recharge === undefined || row.rechargeSpent.includes(spends.recharge)
      ? row.rechargeSpent
      : [...row.rechargeSpent, spends.recharge],
  usesSpent:
    spends.uses === undefined
      ? row.usesSpent
      : { ...row.usesSpent, [spends.uses]: (row.usesSpent[spends.uses] ?? 0) + 1 },
  slotsSpent:
    spends.slot === undefined
      ? row.slotsSpent
      : { ...row.slotsSpent, [spends.slot]: (row.slotsSpent[spends.slot] ?? 0) + 1 },
});

export const npcTurnCheck = (
  fight: NpcTurnFight,
  combatantId: CombatantId,
  moment: NpcTurnMoment,
  steps: ReadonlyArray<NpcTurnStep>,
  /** How the reasons name a creature: the chooser's own handle for it. */
  name: (id: CombatantId) => string,
): NpcTurnCheck => {
  const first = npcTurnOptions(fight, combatantId);
  const momentRefused = npcMomentRefusal(first, moment);
  if (momentRefused !== undefined) return { ok: false, step: undefined, reason: momentRefused };
  if (steps.length === 0) return { ok: false, step: undefined, reason: "the turn has no steps" };

  const self = fight.combatants.find((row) => row.id === combatantId)!;
  const statBlock = self.creatureId === null ? undefined : fight.statBlocks.get(self.creatureId);
  const speed = walkingFeet(statBlock?.speed) ?? 0;
  const measure =
    fight.board === undefined
      ? undefined
      : { feetPerCell: fight.board.feetPerCell, diagonals: fight.diagonals };

  let state = fight;
  let slotsTaken = 0;
  const resolved: Array<NpcTurnResolvedStep> = [];
  const refuse = (step: number, reason: string): NpcTurnCheck => ({ ok: false, step, reason });
  const replace = (row: Combatant) => {
    state = {
      ...state,
      combatants: state.combatants.map((other) => (other.id === row.id ? row : other)),
    };
  };
  const rowOf = () => state.combatants.find((row) => row.id === combatantId)!;
  const offeredIds = (options: NpcTurnOptions) =>
    options.options
      .filter((option) => NPC_MOMENT_SLOTS[moment].includes(option.slot))
      .map((option) => option.id);

  /** Whether `option` may be aimed at `target`: within its reach or range, when it is measured. */
  const aimRefusal = (option: NpcTurnOption, target: CombatantId): string | undefined => {
    if (target === combatantId) return undefined;
    const row = state.combatants.find((other) => other.id === target);
    if (row === undefined || (row.kind === "npc" && row.hpCurrent <= 0)) {
      return `${name(target)} is not in the fight`;
    }
    if (option.targets === undefined) return undefined;
    const measured = option.targets.find((entry) => entry.combatantId === target);
    if (measured === undefined) {
      const hidden = options.sight?.hidden.find((entry) => entry.combatantId === target);
      return hidden === undefined
        ? `${name(target)} is not on the board`
        : hidden.reason === "total cover"
          ? `${name(target)} has total cover from it and cannot be targeted`
          : `${name(target)} is out of its sight (walls, darkness or obscurement) and cannot be targeted`;
    }
    return measured.band === "out"
      ? `${name(target)} is ${String(measured.feet)} ft away, out of ${option.name}'s reach and range`
      : undefined;
  };
  const bandOf = (option: NpcTurnOption, target: CombatantId): NpcTarget["band"] | undefined =>
    option.targets?.find((entry) => entry.combatantId === target)?.band;
  const aimOf = (option: NpcTurnOption, target: CombatantId): NpcAim | undefined => {
    const entry = option.targets?.find((candidate) => candidate.combatantId === target);
    return entry?.cover === undefined
      ? undefined
      : {
          cover: entry.cover,
          ...(entry.unseenByTarget === undefined ? {} : { unseenByTarget: true as const }),
        };
  };

  let options = first;
  for (const [index, step] of steps.entries()) {
    options = index === 0 ? first : npcTurnOptions(state, combatantId);

    if (step.option === "move") {
      const to = step.square;
      if (to === undefined) return refuse(index, "a move needs the square it ends on");
      if (moment !== "turn") {
        return refuse(index, `it cannot move as ${MOMENT_WORDS[moment]}`);
      }
      if (options.movement === undefined) {
        const why = options.omitted.find((omission) => omission.id === "move")?.reason;
        return refuse(index, `it cannot move: ${why ?? "nothing is measured"}`);
      }
      const from = rowOf().position!;
      if (!options.movement.squares.some((square) => sameSquare(square, to))) {
        return refuse(
          index,
          `${square(to)} is not a square it can move to with ${String(options.movement.feetLeft)} ft left` +
            (fight.board?.level == null
              ? " (off the board, taken, or too far)"
              : " (off the board, taken, too far to walk, or walled off)"),
        );
      }
      const level = fight.board?.level ?? null;
      const feet =
        level === null
          ? feetBetween(from, to, measure!)
          : (pathCost(
              runLevelLayout(fight.board!, level),
              from,
              to,
              tableSight(level),
              fight.diagonals,
            ) ?? feetBetween(from, to, measure!));
      replace({ ...rowOf(), position: to, feetMoved: rowOf().feetMoved + feet });
      resolved.push({ kind: "move", to, feet });
      continue;
    }

    const option = options.options.find((candidate) => candidate.id === step.option);
    if (option === undefined) {
      const omitted = options.omitted.find((omission) => omission.id === step.option);
      if (omitted !== undefined) {
        return refuse(index, `${step.option} is not available now: ${omitted.reason}`);
      }
      // A spent slot is left out whole (`action used`), not option by option,
      // so the option's slot is read off its id's section.
      const slotSpent = (["action", "bonus", "reaction"] as const).find(
        (slot) =>
          slotOfId(step.option) === slot &&
          options.omitted.some((omission) => omission.id === slot),
      );
      if (slotSpent !== undefined) {
        return refuse(index, `${step.option} needs ${SLOT_WORDS[slotSpent]}, already spent`);
      }
      const ids = offeredIds(options);
      return refuse(
        index,
        `there is no option ${JSON.stringify(step.option)}; ` +
          (ids.length === 0
            ? "nothing else is offered now"
            : `the options offered now are ${ids.join(", ")}`),
      );
    }
    if (!NPC_MOMENT_SLOTS[moment].includes(option.slot)) {
      return refuse(
        index,
        `${option.id} is ${SLOT_WORDS[option.slot]}, which is not taken as ${MOMENT_WORDS[moment]}`,
      );
    }
    if (moment !== "turn" && slotsTaken > 0) {
      return refuse(index, `${MOMENT_WORDS[moment]} is one step`);
    }

    const targets = step.targets ?? [];
    let placement: Extract<NpcTurnResolvedStep, { kind: "option" }>["placement"];
    let strikes: Extract<NpcTurnResolvedStep, { kind: "option" }>["strikes"];
    let aimed: ReadonlyArray<CombatantId> = targets;
    const bands: Record<CombatantId, NpcTarget["band"]> = {};
    const aims: Record<CombatantId, NpcAim> = {};

    if (option.kind === "multiattack") {
      const swings = (option.strikes ?? []).flatMap((strike) =>
        Array.from({ length: strike.count }, () => strike.option),
      );
      if (targets.length !== 1 && targets.length !== swings.length) {
        return refuse(
          index,
          `${option.id} makes ${String(swings.length)} strikes: give one target for them all, ` +
            `or ${String(swings.length)} in order (${swings.map((swing) => swing.name).join(", ")})`,
        );
      }
      const list: Array<{
        optionId: string;
        name: string;
        target: CombatantId;
        band?: NpcTarget["band"];
      }> = [];
      for (const [swingIndex, swing] of swings.entries()) {
        const target = targets.length === 1 ? targets[0]! : targets[swingIndex]!;
        const refused = aimRefusal(swing, target);
        if (refused !== undefined) return refuse(index, `${swing.name}: ${refused}`);
        const band = bandOf(swing, target);
        const aim = aimOf(swing, target);
        list.push({
          optionId: swing.id,
          name: swing.name,
          target,
          ...(band === undefined ? {} : { band }),
          ...(aim === undefined ? {} : { aim }),
        });
      }
      strikes = list;
      aimed = [...new Set(list.map((strike) => strike.target))];
    } else if (option.area !== undefined) {
      if (targets.length > 0) {
        return refuse(
          index,
          `${option.id} is an area: give the square it goes at, not targets — it catches whoever stands there`,
        );
      }
      if (option.placements !== undefined) {
        if (option.placements.length === 0) {
          return refuse(index, `${option.id} catches nobody wherever it goes now`);
        }
        const fromSelf = option.area.origin === "self";
        const burst = fromSelf && option.area.shape !== "cone" && option.area.shape !== "line";
        const chosen = burst
          ? option.placements[0]
          : step.square === undefined
            ? undefined
            : option.placements.find((candidate) =>
                sameSquare(fromSelf ? candidate.toward : candidate.origin, step.square!),
              );
        if (chosen === undefined) {
          const where = option.placements.map((candidate) =>
            square(fromSelf ? candidate.toward : candidate.origin),
          );
          return refuse(
            index,
            `${option.id} must go at one of its placements: ${where.join(", ")}` +
              (fromSelf ? " (the square it points toward)" : " (the square it is centred on)"),
          );
        }
        placement = {
          origin: chosen.origin,
          toward: chosen.toward,
          catches: chosen.catches,
          ...(chosen.covers === undefined ? {} : { covers: chosen.covers }),
        };
        aimed = chosen.catches;
      }
    } else {
      if (option.kind === "attack" && targets.length !== 1) {
        return refuse(index, `${option.id} is one attack: give exactly one target`);
      }
      for (const target of targets) {
        const refused = aimRefusal(option, target);
        if (refused !== undefined) return refuse(index, refused);
        const band = bandOf(option, target);
        if (band !== undefined) bands[target] = band;
        const aim = aimOf(option, target);
        if (aim !== undefined) aims[target] = aim;
      }
    }

    let after = spend(rowOf(), option.slot, option.spends);
    for (const strike of option.strikes ?? []) {
      for (let count = 0; count < strike.count; count++) {
        after = spend(after, option.slot, strike.option.spends);
      }
    }
    // A Dash's extra movement: the options give speed less feet moved.
    if (option.id === "standard/Dash") after = { ...after, feetMoved: after.feetMoved - speed };
    replace(after);
    slotsTaken += 1;
    resolved.push({
      kind: "option",
      optionId: option.id,
      name: option.name,
      slot: option.slot,
      targets: aimed,
      ...(Object.keys(bands).length === 0 ? {} : { bands }),
      ...(Object.keys(aims).length === 0 ? {} : { aims }),
      ...(placement === undefined ? {} : { placement }),
      ...(strikes === undefined ? {} : { strikes }),
    });
  }
  return { ok: true, steps: resolved };
};
