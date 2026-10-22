import {
  type AttackSight,
  type BoardSquare,
  type CharacterSheet,
  type CreatureSenses,
  type EncounterRunBoard,
  type LevelLayout,
  NO_SENSES,
  type SightOptions,
  type StatBlock,
  attackSight,
  coverLine,
  darkvisionOf,
  runLevelLayout,
  runLevelSight,
  sensesOf,
  tableSight,
  type WalkEnds,
} from "@taverns/api";

/**
 * The runner's reading of a level's rules (`LevelRules.ts`, `packages/api`):
 * the same sight and cover Hob's options and a kept turn read, over the board
 * the screen already holds. Nothing here on a plain grid.
 */

/** What a combatant perceives with: its stat block's senses, or its sheet's darkvision. */
export const sensesOfSource = (source: {
  readonly statBlock?: StatBlock | undefined;
  readonly sheet?: CharacterSheet | undefined;
}): CreatureSenses =>
  source.statBlock !== undefined
    ? sensesOf(source.statBlock.senses).senses
    : source.sheet !== undefined
      ? { ...NO_SENSES, darkvision: darkvisionOf(source.sheet.traits) }
      : NO_SENSES;

/**
 * How `attacker` and `target` stand to each other on the fight's level, or
 * `undefined` on a plain grid, with no board, or with either off it.
 */
export const sightBetween = (
  board: EncounterRunBoard | null | undefined,
  attacker: { readonly position: BoardSquare | null; readonly senses: CreatureSenses },
  target: { readonly position: BoardSquare | null; readonly senses: CreatureSenses },
): AttackSight | undefined =>
  board == null || board.level === null || attacker.position === null || target.position === null
    ? undefined
    : attackSight(
        runLevelSight(board, board.level),
        { square: attacker.position, senses: attacker.senses },
        { square: target.position, senses: target.senses },
      );

/**
 * What the target card says of where the target stands against whoever is
 * up: its cover, and who cannot see whom. Each is what an attack between the
 * two rolls by (`resolveOn`), said before the DM swings.
 */
export const sightLines = (
  sight: AttackSight | undefined,
  attacker: string,
): ReadonlyArray<string> =>
  sight === undefined
    ? []
    : [
        ...(coverLine(sight.cover) === undefined
          ? []
          : [`${coverLine(sight.cover)!} from ${attacker}`]),
        ...(sight.attackerSees || sight.cover === "total"
          ? []
          : [`${attacker} cannot see it: attacks at disadvantage`]),
        ...(sight.targetSees ? [] : [`It cannot see ${attacker}: attacked at advantage`]),
      ];

/**
 * A level fight's board as a walk reads it: the layout, what the table knows
 * of its secret doors, and, for a party's walk (`playerWalk`), the dark edge
 * a walk may end on and never go on from.
 */
export interface LevelWalk {
  readonly layout: LevelLayout;
  readonly sight: SightOptions;
  readonly ends?: WalkEnds;
}

/** The DM's board's walk, or `undefined` on a plain grid. */
export const runLevelWalk = (board: EncounterRunBoard): LevelWalk | undefined =>
  board.level === null
    ? undefined
    : { layout: runLevelLayout(board, board.level), sight: tableSight(board.level) };
