import type { LevelLayout } from "@taverns/api";
import { cn } from "@taverns/ui";
import { useEffect, useRef } from "react";
import { readPalette } from "./palette";
import { drawLevelThumbnail } from "./thumbnail";

/** Canvas pixels a square: enough for a card's width at the largest size. */
const PX = 8;

/**
 * A level as a still, top-down picture (`thumbnail.ts`), sized to its board
 * and scaled to the width it is given. Drawn once per level; nothing here
 * moves or listens.
 *
 * `capped` holds the still to `max-h-96` and draws the picture inside that
 * box at its own proportions (`object-contain`), for a page where a level at
 * full width would fill the screen (the encounter's Battle map).
 */
export function LevelPreview({
  level,
  label,
  capped = false,
}: {
  readonly level: LevelLayout;
  readonly label: string;
  readonly capped?: boolean;
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
      className={cn(
        "block rounded-sm border border-hairline bg-surface-sunken",
        "h-auto w-full",
        capped && "max-h-96 object-contain",
      )}
    />
  );
}
