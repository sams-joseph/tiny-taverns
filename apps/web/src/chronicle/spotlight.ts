import type { CampaignCharacterId, PartySeat, Session } from "@taverns/api";
import { joinNames } from "../party/cards";

/**
 * The Spotlight aside's arithmetic: how many nights each seat at the table has
 * been the night's spotlight, and who has had the fewest.
 *
 * **Over the seats at the table now** (`party.list`, the live seats), in the
 * roster's order, each counted over every night the DM can read. A night that
 * names a seat since retired counts for nobody here: the aside is for deciding
 * whose turn it is next time, and a retired seat has no next time. A night with
 * no spotlight counts for nobody either.
 *
 * **"Fewest" is said only when it separates someone.** When every seat has
 * the same count — none has been picked yet, or the table is perfectly even —
 * no bar is marked and there is no hint, rather than the drawing's every bar
 * lit and every name listed, which says nothing a DM could act on.
 */

export interface SpotlightRow {
  readonly seatId: CampaignCharacterId;
  readonly name: string;
  readonly count: number;
  /** The bar's length, as a share of the largest count (0 to 1). */
  readonly share: number;
  /** One of those with the fewest, when the counts are not all the same. */
  readonly fewest: boolean;
}

export interface SpotlightTally {
  readonly rows: ReadonlyArray<SpotlightRow>;
  /** Whether any night names a seat still at the table. */
  readonly any: boolean;
  /** The line under the bars, or `undefined` when nobody is behind. */
  readonly hint: string | undefined;
}

/**
 * What the table calls a seat — the name the Party's card leads with, and the
 * one a night's "Spotlight on" line and the composer's toggles carry.
 */
export const seatName = (row: PartySeat): string => row.character?.name ?? row.seat.displayName;

export const spotlightTally = (
  party: ReadonlyArray<PartySeat>,
  // Only the pointer, so the tally reads a night from `sessions.list` or from
  // anything else that carries one.
  nights: ReadonlyArray<Pick<Session, "spotlightSeatId">>,
): SpotlightTally => {
  const counts = new Map<CampaignCharacterId, number>();
  for (const night of nights) {
    if (night.spotlightSeatId === null) continue;
    counts.set(night.spotlightSeatId, (counts.get(night.spotlightSeatId) ?? 0) + 1);
  }

  const tallied = party.map((row) => ({
    seatId: row.seat.id,
    name: seatName(row),
    count: counts.get(row.seat.id) ?? 0,
  }));
  const max = Math.max(0, ...tallied.map((row) => row.count));
  const min = Math.min(...tallied.map((row) => row.count));
  const uneven = max > min;

  const rows = tallied.map((row) => ({
    ...row,
    share: max === 0 ? 0 : row.count / max,
    fewest: uneven && row.count === min,
  }));
  const behind = rows.filter((row) => row.fewest).map((row) => row.name);

  return {
    rows,
    any: max > 0,
    hint:
      behind.length === 0
        ? undefined
        : `${joinNames(behind)} ${behind.length === 1 ? "has" : "have"} had the fewest sessions in the spotlight. Worth giving them a beat next time.`,
  };
};
