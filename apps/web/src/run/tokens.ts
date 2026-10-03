import {
  type BoardSquare,
  type Combatant,
  type CombatantId,
  type DiagonalRule,
  type PictureRect,
  feetBetween,
} from "@taverns/api";

/**
 * What the DM's board works out about its tokens, pure: the label on each, how
 * far a move went, and how far a creature can go.
 *
 * Everything here is about squares on the fight's own board
 * (`EncounterRunBoard`) and the feet each one is; where a square falls on the
 * picture, and how far apart two are, is the board's one geometry
 * (`BattleMap.ts`). The runner counts a diagonal by the campaign's
 * `diagonalRule`, as the server counts a move.
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
 * The board's line about the DM's last move: `"Goblin Boss moved 30 ft"`, and
 * `", past their 30 ft speed"` when it went further than that — said, not
 * refused, because the DM moves a miniature wherever the table agrees it went.
 */
export const moveLine = ({
  name,
  from,
  to,
  feetPerCell,
  diagonals,
  speed,
}: {
  readonly name: string;
  readonly from: BoardSquare | null;
  readonly to: BoardSquare | null;
  readonly feetPerCell: number;
  readonly diagonals: DiagonalRule;
  readonly speed: number | undefined;
}): string => {
  if (to === null) return `${name} is off the board`;
  if (from === null) return `${name} is on the board`;
  const feet = feetBetween(from, to, { feetPerCell, diagonals });
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

/**
 * How a token is drawn, from its row: the drawing's rules (`Encounter
 * Runner.dc.html`, `renderVals`), in one place for the DM's board.
 *
 * - **out**: a creature that is finished — a monster at zero hit points, or a
 *   party member with three failed death saves. It fades, as its row does. A
 *   party member at zero who is still making saves is not out: they are dying,
 *   still in the fight, and drawn as anyone else.
 * - **struck**: a creature that is out has its name struck through, monster
 *   and dead PC alike.
 * - **hidden**: the token is off the players' board — its row is held back
 *   (`visibility: "dm"`), or it is a monster while the DM hides them all — so
 *   the DM's board draws its ring dashed.
 */
export interface TokenState {
  readonly out: boolean;
  readonly struck: boolean;
  readonly hidden: boolean;
  /** Hit points over maximum, 0–1. */
  readonly health: number;
}

export const tokenState = (
  combatant: Combatant,
  { hp, hostileTokensHidden }: { readonly hp: number; readonly hostileTokensHidden: boolean },
): TokenState => {
  const monster = combatant.kind !== "pc";
  const out = monster ? hp === 0 : (combatant.deathSaves?.failures ?? 0) >= 3;
  return {
    out,
    struck: out,
    hidden: combatant.visibility === "dm" || (monster && hostileTokensHidden),
    health: combatant.hpMax > 0 ? Math.max(0, Math.min(1, hp / combatant.hpMax)) : 0,
  };
};

/**
 * Which tokens wear their name under them: the one whose turn it is and the
 * one selected (the drawing's default), every token, or none. A token being
 * dragged always does. The DM's own preference on this browser
 * (`useTokenNames`), not the fight's.
 */
export const TOKEN_NAMES = ["active", "all", "none"] as const;
export type TokenNames = (typeof TOKEN_NAMES)[number];

export const nameShown = (
  names: TokenNames,
  token: { readonly active: boolean; readonly selected: boolean; readonly dragging: boolean },
): boolean =>
  token.dragging || names === "all" || (names === "active" && (token.active || token.selected));
