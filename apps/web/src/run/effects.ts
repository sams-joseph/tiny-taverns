import { DateTime } from "effect";
import type {
  AttackDelivery,
  BoardArea,
  BoardSquare,
  CombatantId,
  DamageType,
  PlayerLiveAct,
  Roll,
  RollOutcome,
} from "@taverns/api";

/**
 * What the board plays when a fight changes under it, worked out from two
 * readings of the same tokens: the one drawn last and the one drawn now.
 *
 * An effect is never a row and never a payload. The board re-reads the fight
 * on every doorbell, as it always has, and this compares what it drew before
 * with what it draws after, so the DM's own write, a player's move and a kept
 * Hob turn all play the same way, from the state tables and nothing else. The
 * first reading is a baseline and plays nothing; a token that appears or
 * leaves the board plays nothing either.
 *
 * Pure, so a test can pin which changes play what.
 */

/** One token as the effects read it. */
export interface EffectToken {
  readonly id: CombatantId;
  readonly square: BoardSquare;
  /** Hit points over maximum, 0–1, when this reader may know them. */
  readonly health: number | undefined;
  /** Its hit points, when this reader may know the number and not only the bar. */
  readonly hp: number | undefined;
}

export type BoardEffect =
  | {
      readonly kind: "hurt" | "heal";
      readonly id: CombatantId;
      readonly at: BoardSquare;
      /** The hit points it moved by, when this reader may know them. */
      readonly amount: number | undefined;
    }
  | {
      readonly kind: "moved";
      readonly id: CombatantId;
      readonly from: BoardSquare;
      readonly to: BoardSquare;
    };

const same = (a: BoardSquare, b: BoardSquare): boolean => a.column === b.column && a.row === b.row;

/** The effects a change from `before` to `after` plays, in `after`'s order. */
export const effectsBetween = (
  before: ReadonlyArray<EffectToken>,
  after: ReadonlyArray<EffectToken>,
): ReadonlyArray<BoardEffect> => {
  const was = new Map(before.map((token) => [token.id, token]));
  return after.flatMap((token): ReadonlyArray<BoardEffect> => {
    const prior = was.get(token.id);
    if (prior === undefined) return [];
    const effects: Array<BoardEffect> = [];
    if (!same(prior.square, token.square)) {
      effects.push({ kind: "moved", id: token.id, from: prior.square, to: token.square });
    }
    const delta =
      prior.hp !== undefined && token.hp !== undefined
        ? token.hp - prior.hp
        : prior.health !== undefined && token.health !== undefined
          ? token.health - prior.health
          : 0;
    if (delta !== 0) {
      effects.push({
        kind: delta < 0 ? "hurt" : "heal",
        id: token.id,
        at: token.square,
        amount:
          prior.hp !== undefined && token.hp !== undefined
            ? Math.abs(token.hp - prior.hp)
            : undefined,
      });
    }
    return effects;
  });
};

/**
 * An attack the board draws from the attacker to the target: an attack roll
 * that names both and says how it was delivered (`Roll.delivery`). One that
 * cannot say is drawn as nothing, and its hit as the burst above.
 */
export interface Strike {
  readonly kind: "strike";
  /** Its request, which this tab's roll on its way and the server's copy share. */
  readonly key: string;
  readonly from: CombatantId;
  readonly to: CombatantId;
  readonly delivery: AttackDelivery;
  readonly damageType: DamageType | null;
  readonly outcome: RollOutcome | null;
}

/** The strikes among a night's rolls, oldest first; a kept Hob turn the DM undid draws none. */
export const strikesOf = (
  rolls: ReadonlyArray<
    Pick<
      Roll,
      | "kind"
      | "combatantId"
      | "targetCombatantId"
      | "delivery"
      | "damageType"
      | "outcome"
      | "requestId"
    > & { readonly at: number; readonly undone: boolean }
  >,
): ReadonlyArray<Strike> =>
  rolls
    .flatMap((roll): ReadonlyArray<Strike & { readonly at: number }> =>
      roll.kind === "attack" &&
      !roll.undone &&
      roll.combatantId !== null &&
      roll.targetCombatantId !== null &&
      roll.delivery !== null
        ? [
            {
              kind: "strike",
              key: roll.requestId ?? `at:${String(roll.at)}`,
              from: roll.combatantId,
              to: roll.targetCombatantId,
              delivery: roll.delivery,
              damageType: roll.damageType,
              outcome: roll.outcome,
              at: roll.at,
            },
          ]
        : [],
    )
    .sort((a, b) => a.at - b.at)
    .map(({ at: _at, ...strike }) => strike);

/**
 * An area the board draws filling its squares: a damage roll that kept where
 * its area went (`Roll.area`), from the creature that loosed it when the
 * reader may know which.
 */
export interface Blast {
  readonly kind: "blast";
  readonly key: string;
  readonly from: CombatantId | null;
  readonly area: BoardArea;
  readonly damageType: DamageType | null;
}

/** What the board draws from a night's rolls: its attacks and its areas, oldest first. */
export type Act = Strike | Blast;

/** The areas among a night's rolls, oldest first; a kept Hob turn the DM undid draws none. */
export const blastsOf = (
  rolls: ReadonlyArray<
    Pick<Roll, "combatantId" | "area" | "damageType" | "requestId"> & {
      readonly at: number;
      readonly undone: boolean;
    }
  >,
): ReadonlyArray<Blast> =>
  rolls
    .flatMap((roll): ReadonlyArray<Blast & { readonly at: number }> =>
      roll.area === null || roll.undone
        ? []
        : [
            {
              kind: "blast",
              key: roll.requestId ?? `at:${String(roll.at)}`,
              from: roll.combatantId,
              area: roll.area,
              damageType: roll.damageType,
              at: roll.at,
            },
          ],
    )
    .sort((a, b) => a.at - b.at)
    .map(({ at: _at, ...blast }) => blast);

/** Both, in the order they happened. */
export const actsOf = (rolls: Parameters<typeof strikesOf>[0] & Parameters<typeof blastsOf>[0]) => {
  const at = new Map(rolls.map((roll) => [roll.requestId ?? `at:${String(roll.at)}`, roll.at]));
  return [...strikesOf(rolls), ...blastsOf(rolls)].sort(
    (a, b) => (at.get(a.key) ?? 0) - (at.get(b.key) ?? 0),
  );
};

/** The server's rolls, as `actsOf` reads them: when each was made, and whether its turn was undone. */
export const actsOfRolls = (rolls: ReadonlyArray<Roll>): ReadonlyArray<Act> =>
  actsOf(
    rolls.map((roll) => ({
      ...roll,
      at: DateTime.toEpochMillis(roll.createdAt),
      undone: roll.undoneAt !== null,
    })),
  );

/** A player's table's acts (`PlayerLiveAct`, already narrowed to them), as the board plays them. */
export const actsOfTable = (acts: ReadonlyArray<PlayerLiveAct>): ReadonlyArray<Act> =>
  acts.map(({ id, ...act }) => ({ ...act, key: id }));
