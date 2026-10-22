import type { LevelLayout } from "@taverns/api";
import { useEffect, useRef } from "react";
import { readPalette } from "./palette";
import { drawLevelThumbnail } from "./thumbnail";

/** Canvas pixels a square: enough for a card's width at the largest size. */
const PX = 8;

/**
 * A level as a still, top-down picture (`thumbnail.ts`), sized to its board
 * and scaled to the width it is given. Drawn once per level; nothing here
 * moves or listens.
 */
export function LevelPreview({
  level,
  label,
}: {
  readonly level: LevelLayout;
  readonly label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (element !== null) drawLevelThumbnail(element, level, readPalette(element), PX);
  }, [level]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      width={level.columns * PX}
      height={level.rows * PX}
      className="block h-auto w-full rounded-sm border border-hairline bg-surface-sunken"
    />
  );
}
