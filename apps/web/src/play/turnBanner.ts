import type { PlayerLiveFight } from "@taverns/api";
import { nextAfter } from "../run/load";

/**
 * The seated player's turn banner: *"Round 3 · Brannoc's turn · Up next Goblin
 * Boss"*, or *"Something moves"* when the DM's marker is on a row this player
 * may not see.
 *
 * Built only from what the table already sent. `upNext` says whose turn it is;
 * *up next* is the row after it in the player's own order (`nextAfter`, the
 * rule the DM's `upLine` uses), so it is the next creature this player can see
 * — a hidden one between the two is skipped exactly as it is in their list.
 *
 * On the hidden arm the banner names nobody and has no *up next*: the order
 * lacks the hidden row, so where it stands — and so who follows it — is not on
 * the wire, and the visible row after some guessed position would be a guess.
 *
 * Absent outside a fight's turns: while rolling initiative, in a scene with no
 * order, and when the DM has set no marker.
 */
export interface TurnBanner {
  readonly round: number;
  /** *"Brannoc Duskharrow's turn"*, or *"Something moves"*. */
  readonly title: string;
  /** The name of the next row this player can see; absent when there is none. */
  readonly upNext?: string;
}

export const turnBanner = (fight: PlayerLiveFight | null): TurnBanner | undefined => {
  if (fight === null || fight.mode !== "combat" || fight.phase !== "turns") return undefined;
  const up = fight.upNext;
  if (up === null) return undefined;
  if (up.kind === "hidden") return { round: fight.round, title: "Something moves" };
  const next = nextAfter(
    fight.order,
    fight.order.findIndex((row) => row.combatantId === up.combatantId),
  );
  return {
    round: fight.round,
    title: `${up.displayName}'s turn`,
    ...(next === undefined ? {} : { upNext: next.displayName }),
  };
};
