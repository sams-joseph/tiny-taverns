import {
  type BattleMapBoard,
  type BoardSquare,
  type Combatant,
  type CombatantId,
  type PictureRect,
  cellRect,
} from "@taverns/api";

/**
 * What the DM's board works out about its tokens, pure: the label on each, how
 * far a move went, and how far a creature can go.
 *
 * Everything here is about squares on the fight's own board
 * (`EncounterRunBoard`) and the feet each one is; where a square falls on the
 * picture is `cellRect`'s, the board's one geometry (`BattleMap.ts`).
 */

/**
 * The initials a token wears — `"B"`, `"GB"` — with a number when the fight
 * holds more than one of that name (`"GA1"`, `"GA2"`), since two instances of
 * a creature carry the same name (`Combatant.ts`). A name that already ends in
 * a number keeps it (`"Worg 2"` is `"W2"`).
 *
 * The numbers follow the order the rows were added, not initiative, so a
 * reroll does not relabel the board.
 */
export const tokenLabels = (
  combatants: ReadonlyArray<Combatant>,
): ReadonlyMap<CombatantId, string> =>
  labelsInOrder(
    [...combatants].sort(
      (a, b) =>
        a.createdAt.epochMilliseconds - b.createdAt.epochMilliseconds || a.id.localeCompare(b.id),
    ),
  );

/**
 * `tokenLabels`' initials over rows already in the order their numbers should
 * follow. A player's board has no creation time to go by, only the order its
 * table answered (`play/PlayerBoard.tsx`).
 */
export const labelsInOrder = (
  rows: ReadonlyArray<{ readonly id: CombatantId; readonly displayName: string }>,
): ReadonlyMap<CombatantId, string> => {
  const byName = new Map<string, Array<CombatantId>>();
  for (const row of rows) {
    const same = byName.get(row.displayName) ?? [];
    same.push(row.id);
    byName.set(row.displayName, same);
  }
  const labels = new Map<CombatantId, string>();
  for (const [name, same] of byName) {
    const words = name.trim().split(/\s+/);
    const last = words.at(-1) ?? "";
    const numbered = words.length > 1 && /^\d+$/.test(last);
    const initials = (numbered ? words.slice(0, -1) : words)
      .map((word) => word.charAt(0).toUpperCase())
      .filter((initial) => initial !== "")
      .slice(0, 2)
      .join("");
    const base = `${initials === "" ? "?" : initials}${numbered ? last : ""}`;
    same.forEach((id, index) =>
      labels.set(id, same.length > 1 ? `${base}${String(index + 1)}` : base),
    );
  }
  return labels;
};

/**
 * The feet at the front of a speed as a sheet or a stat block writes it —
 * `"30 ft."`, `"30 ft., climb 30 ft."` — which is the walking speed. Anything
 * that does not start with a number (blank, `"varies"`) is no speed at all,
 * and the board draws no range rather than a guessed one.
 */
export const leadingFeet = (speed: string | undefined): number | undefined => {
  const match = /^\s*(\d+)/.exec(speed ?? "");
  return match === null ? undefined : Number(match[1]);
};

/**
 * Squares between two squares, a diagonal counting as one: the SRD's grid
 * rule, where every square moved into costs the square's feet.
 */
export const squaresBetween = (from: BoardSquare, to: BoardSquare): number =>
  Math.max(Math.abs(from.column - to.column), Math.abs(from.row - to.row));

/**
 * The squares a creature can reach this turn: `speed` feet out from where it
 * stands in every direction, cut at the board's edges, as one rectangle in
 * the picture's pixels. `undefined` when it cannot move a whole square.
 */
export const reachRect = (
  board: BattleMapBoard & { readonly feetPerCell: number },
  at: BoardSquare,
  speed: number,
): PictureRect | undefined => {
  const squares = Math.floor(speed / board.feetPerCell);
  if (squares < 1) return undefined;
  const first = cellRect(board, {
    column: Math.max(0, at.column - squares),
    row: Math.max(0, at.row - squares),
  });
  const last = cellRect(board, {
    column: Math.min(board.columns - 1, at.column + squares),
    row: Math.min(board.rows - 1, at.row + squares),
  });
  return {
    x: first.x,
    y: first.y,
    width: last.x + last.width - first.x,
    height: last.y + last.height - first.y,
  };
};

/**
 * The board's line about the DM's last move: `"Goblin Boss moved 30 ft"`, and
 * `", past their 30 ft speed"` when it went further than that — said, not
 * refused, because the DM moves a miniature wherever the table agrees it went.
 */
export const moveLine = ({
  name,
  from,
  to,
  feetPerCell,
  speed,
}: {
  readonly name: string;
  readonly from: BoardSquare | null;
  readonly to: BoardSquare | null;
  readonly feetPerCell: number;
  readonly speed: number | undefined;
}): string => {
  if (to === null) return `${name} is off the board`;
  if (from === null) return `${name} is on the board`;
  const feet = squaresBetween(from, to) * feetPerCell;
  const past = speed !== undefined && feet > speed ? `, past their ${String(speed)} ft speed` : "";
  return `${name} moved ${String(feet)} ft${past}`;
};

/** A rectangle in the picture's pixels as percentages of the plane it is drawn on. */
export const percentOf = (
  rect: PictureRect,
  plane: { readonly width: number; readonly height: number },
): { left: string; top: string; width: string; height: string } => ({
  left: `${String((rect.x / plane.width) * 100)}%`,
  top: `${String((rect.y / plane.height) * 100)}%`,
  width: `${String((rect.width / plane.width) * 100)}%`,
  height: `${String((rect.height / plane.height) * 100)}%`,
});
