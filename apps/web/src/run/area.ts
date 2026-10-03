import {
  AREA_FEET,
  type AreaShape,
  type BattleMapBoard,
  type BoardArea,
  type BoardSquare,
  type Combatant,
  areaSquares,
  areaToward,
} from "@taverns/api";

/**
 * The board's Area tool as arithmetic a test can pin: the shapes and their
 * sizes, the template the pointer would pin, the squares it covers and who
 * stands in them. Which squares a template covers is the board's one geometry
 * (`areaSquares`, `packages/api`), the same the server checks a pin against.
 */

/** The dock's shapes, in its order, each with the size it starts at. */
export const AREA_SHAPES: ReadonlyArray<{
  readonly shape: AreaShape;
  readonly label: string;
  readonly feet: number;
}> = [
  { shape: "sphere", label: "Sphere", feet: 20 },
  { shape: "cone", label: "Cone", feet: 15 },
  { shape: "line", label: "Line", feet: 30 },
  { shape: "cube", label: "Cube", feet: 15 },
];

/** The size a shape starts at, which switching to it resets to. */
export const startingFeet = (shape: AreaShape): number =>
  AREA_SHAPES.find((entry) => entry.shape === shape)?.feet ?? AREA_FEET.minimum;

/** − or + on the size: five feet a press, held between the smallest and the largest. */
export const stepFeet = (feet: number, by: 1 | -1): number =>
  Math.min(AREA_FEET.maximum, Math.max(AREA_FEET.minimum, feet + by * 5));

const same = (a: BoardSquare, b: BoardSquare): boolean => a.column === b.column && a.row === b.row;

/**
 * The template the tool would pin with the pointer on `at`. A sphere or a cube
 * is centred there. A cone or a line starts at `from`, the square of the
 * creature it comes from, and points at `at`: none without a creature on the
 * board to start from, or with the pointer on that creature's own square.
 */
export const areaAt = ({
  shape,
  feet,
  at,
  from,
}: {
  readonly shape: AreaShape;
  readonly feet: number;
  readonly at: BoardSquare;
  readonly from: BoardSquare | null;
}): BoardArea | undefined => {
  if (shape === "sphere" || shape === "cube") return { shape, feet, origin: at };
  if (from === null || same(from, at)) return undefined;
  return { shape, feet, origin: from, toward: at };
};

/** The squares a template covers on this board. */
export const squaresOf = (
  board: Pick<BattleMapBoard, "columns" | "rows"> & { readonly feetPerCell: number },
  area: BoardArea,
): ReadonlyArray<BoardSquare> =>
  areaSquares(board, {
    shape: area.shape,
    feet: area.feet,
    feetPerCell: board.feetPerCell,
    origin: area.origin,
    toward: areaToward(area),
  });

/**
 * Who a pinned template catches: every row standing on a square it covers, in
 * the order given (the fight's, initiative), but a creature already at zero hit
 * points, which is out of the fight. A party member at zero is still somebody a
 * fireball reaches.
 */
export const caughtBy = <Row extends Pick<Combatant, "kind" | "position">>(
  squares: ReadonlyArray<BoardSquare>,
  combatants: ReadonlyArray<Row>,
  hpOf: (combatant: Row) => number,
): ReadonlyArray<Row> =>
  combatants.filter((combatant) => {
    const at = combatant.position;
    if (at === null || (combatant.kind === "npc" && hpOf(combatant) === 0)) return false;
    return squares.some((square) => same(square, at));
  });

/** The pinned banner's words: `"3 caught: Brannoc, Goblin Boss, Goblin 2"`. */
export const caughtLine = (caught: ReadonlyArray<Pick<Combatant, "displayName">>): string =>
  caught.length === 0
    ? "Nobody caught in the area"
    : `${String(caught.length)} caught: ${caught.map((row) => row.displayName).join(", ")}`;

/** A template named as a table says it: `"20 ft sphere"`. */
export const areaName = (area: Pick<BoardArea, "shape" | "feet">): string =>
  `${String(area.feet)} ft ${area.shape}`;

/** Whether two templates are the same pin, so re-pinning one writes nothing. */
export const sameArea = (a: BoardArea | null, b: BoardArea | null): boolean => {
  if (a === null || b === null) return a === b;
  return (
    a.shape === b.shape &&
    a.feet === b.feet &&
    same(a.origin, b.origin) &&
    same(areaToward(a), areaToward(b))
  );
};
