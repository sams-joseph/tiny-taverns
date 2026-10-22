import type { BoardSquare } from "./Board.js";
import { type CreatureSenses, type LevelSight, NO_SENSES, levelSight } from "./LevelGeometry.js";
import { type RunBoardLevel, runLevelLayout, tableSight } from "./LevelFight.js";
import type { LevelCover } from "./LevelKit.js";
import type { RollMode } from "./Roll.js";

/**
 * **The 5e rules a level makes possible**, read the same way by the DM's
 * runner, Hob's turn options and the server that carries a kept turn out:
 * cover's bonus to AC, a creature's senses off its stat block, and the
 * advantage or disadvantage of attacking what cannot be seen (PHB, "Unseen
 * Attackers and Targets"). On a plain grid none of it applies.
 */

/** What cover adds to a target's AC (PHB, "Cover"); `null` for total cover, which cannot be targeted. */
export const coverBonus = (cover: LevelCover): number | null =>
  cover === "half" ? 2 : cover === "threeQuarters" ? 5 : cover === "total" ? null : 0;

/** `Half cover: +2 AC`; `undefined` for none. */
export const coverLine = (cover: LevelCover): string | undefined =>
  cover === "half"
    ? "Half cover: +2 AC"
    : cover === "threeQuarters"
      ? "Three-quarters cover: +5 AC"
      : cover === "total"
        ? "Total cover: it cannot be targeted"
        : undefined;

/** The target's AC with its cover's bonus; a missing AC stays missing. */
export const coveredAc = (ac: number | null, cover: LevelCover): number | null => {
  const bonus = coverBonus(cover);
  return ac === null ? null : ac + (bonus ?? 0);
};

/**
 * One roll's mode from everything that grants advantage or disadvantage: any
 * of each together cancel to a normal roll (PHB, "Advantage and
 * Disadvantage"), however many of either.
 */
export const combineModes = (modes: ReadonlyArray<RollMode>): RollMode => {
  const advantage = modes.includes("advantage");
  const disadvantage = modes.includes("disadvantage");
  return advantage === disadvantage ? "normal" : advantage ? "advantage" : "disadvantage";
};

/** The senses a stat block lists that name a distance, and the ones it could not read. */
export interface ReadSenses {
  readonly senses: CreatureSenses;
  /** Each sight sense the stat block lists whose distance this could not read, as written. */
  readonly unread: ReadonlyArray<string>;
}

const SIGHT_SENSES = ["darkvision", "blindsight", "truesight"] as const;

/**
 * A creature's darkvision, blindsight and truesight in feet, from its stat
 * block's `senses` (`{ darkvision: "60 ft." }`, a number when typed by hand).
 * A sense whose distance cannot be read counts as none and is listed in
 * `unread`, so a caller can say so rather than guess. Tremorsense is not
 * sight and is left out.
 */
export const sensesOf = (
  senses: Readonly<Record<string, number | string>> | undefined,
): ReadSenses => {
  const out = { ...NO_SENSES };
  const unread: Array<string> = [];
  for (const [key, value] of Object.entries(senses ?? {})) {
    const sense = SIGHT_SENSES.find((name) => key.toLowerCase().includes(name));
    if (sense === undefined) continue;
    const feet =
      typeof value === "number"
        ? value
        : Number(/(\d+)\s*(?:-\s*)?(?:feet|foot|ft\b)/i.exec(value)?.[1] ?? Number.NaN);
    if (!Number.isFinite(feet) || feet < 0) {
      unread.push(`${key.replaceAll("_", " ")} ${String(value)}`);
      continue;
    }
    out[sense] = Math.max(out[sense], feet);
  }
  return { senses: out, unread };
};

/** How one attacker and one target stand to each other on a level. */
export interface AttackSight {
  readonly cover: LevelCover;
  /** The attacker sees the target; attacking one it cannot is at disadvantage. */
  readonly attackerSees: boolean;
  /** The target sees the attacker; one it cannot is attacked at advantage. */
  readonly targetSees: boolean;
}

/** The mode sight alone gives an attack: disadvantage at an unseen target, advantage from an unseen attacker. */
export const sightMode = (sight: Pick<AttackSight, "attackerSees" | "targetSees">): RollMode =>
  combineModes([
    sight.attackerSees ? "normal" : "disadvantage",
    sight.targetSees ? "normal" : "advantage",
  ]);

const sights = new WeakMap<RunBoardLevel, LevelSight>();

/**
 * The sight rules of a fight's level as the table knows its secret doors
 * (`tableSight`), worked out once per copy of the level: a fight's level is
 * immutable once read, so every turn option and check asked of it shares one.
 */
export const runLevelSight = (
  board: { readonly columns: number; readonly rows: number; readonly feetPerCell: number },
  level: RunBoardLevel,
): LevelSight => {
  const known = sights.get(level);
  if (known !== undefined) return known;
  const made = levelSight(runLevelLayout(board, level), tableSight(level));
  sights.set(level, made);
  return made;
};

/** {@link AttackSight} between two creatures on a fight's level. */
export const attackSight = (
  sight: LevelSight,
  attacker: { readonly square: BoardSquare; readonly senses: CreatureSenses },
  target: { readonly square: BoardSquare; readonly senses: CreatureSenses },
): AttackSight => ({
  cover: sight.cover(attacker.square, target.square),
  attackerSees: sight.sees(attacker, target.square),
  targetSees: sight.sees(target, attacker.square),
});
