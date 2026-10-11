import type { CombatantId, PlayerLiveCombatant } from "@taverns/api";
import { labelsInOrder } from "../run/tokens";

/**
 * How a row of a player's order is drawn, on their strip and their board
 * alike, from what the table sent: the DM's rules (`run/tokens.ts`'
 * `tokenState`, `run/load.ts`' `outOfTheFight`) read through the player's
 * narrower row.
 *
 * - **out**: a creature the table calls *down*, or a party member with three
 *   failed death saves. A party member at zero who is still making saves is
 *   not out, as on the DM's board.
 * - **health**: hit points over maximum for the rows the player is told them
 *   for (their own, an ally's), and none for a creature, whose band is a word
 *   and not a fraction.
 */
export const tableRowState = (
  row: PlayerLiveCombatant,
): { readonly out: boolean; readonly health: number | undefined } =>
  row.kind === "npc"
    ? { out: row.hpBand === "down", health: undefined }
    : {
        out: row.deathSaves.failures >= 3,
        health: row.hpMax > 0 ? Math.max(0, Math.min(1, row.hpCurrent / row.hpMax)) : 0,
      };

/**
 * The initials a token and a chip wear, numbered in the player's own order,
 * since the table answers no creation time; they need not match the DM's.
 */
export const tableLabels = (
  order: ReadonlyArray<PlayerLiveCombatant>,
): ReadonlyMap<CombatantId, string> =>
  labelsInOrder(order.map((row) => ({ id: row.combatantId, displayName: row.displayName })));

/** What a player is told of a creature's hit points (`PlayerLiveHpBand`). */
export const BAND_WORDS = {
  unhurt: "Unhurt",
  hurt: "Hurt",
  bloodied: "Bloodied",
  down: "Down",
  unknown: "Unknown",
} as const;
