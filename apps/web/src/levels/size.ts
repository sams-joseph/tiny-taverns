import { LEVEL_SIZES, type LevelSize } from "@taverns/api";

/** The size choices a new level is offered, in the order the picker lists them. */
export const SIZE_CHOICES: ReadonlyArray<{ readonly size: LevelSize; readonly label: string }> = [
  { size: "small", label: "Small" },
  { size: "medium", label: "Medium" },
  { size: "large", label: "Large" },
];

/** A board's size as a person reads it: squares across by down, and feet. */
export const sizeLine = (level: {
  readonly columns: number;
  readonly rows: number;
  readonly feetPerCell: number;
}): string =>
  `${String(level.columns)} × ${String(level.rows)} squares · ${String(
    level.columns * level.feetPerCell,
  )} × ${String(level.rows * level.feetPerCell)} ft`;

/** A choice's label with its squares, as the picker shows it. */
export const choiceLabel = (size: LevelSize): string => {
  const { columns, rows } = LEVEL_SIZES[size];
  const label = SIZE_CHOICES.find((choice) => choice.size === size)?.label ?? size;
  return `${label}, ${String(columns)} × ${String(rows)}`;
};

/** How many of each part a level holds, in one line; `Empty` when it holds none. */
export const partsLine = (counts: {
  readonly walls: number;
  readonly props: number;
  readonly lights: number;
  readonly regions: number;
}): string => {
  const parts = [
    [counts.walls, "wall", "walls"],
    [counts.props, "prop", "props"],
    [counts.lights, "light", "lights"],
    [counts.regions, "region", "regions"],
  ] as const;
  const named = parts
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${String(count)} ${count === 1 ? one : many}`);
  return named.length === 0 ? "Empty" : named.join(" · ");
};
