import { Schema } from "effect";

/**
 * The shapes an area of effect takes: a template pinned on a fight's board
 * (`BattleMap.BoardArea`) and a stat block's breath or burst
 * (`Creature.ActionArea`), which `BattleMap.areaSquares` draws alike.
 *
 * Its own module because `Creature` cannot import `BattleMap` (which reaches
 * `Creature` back through `Combatant` and `Character`).
 */
export const AreaShape = Schema.Literals(["sphere", "cone", "line", "cube"]);
export type AreaShape = typeof AreaShape.Type;
