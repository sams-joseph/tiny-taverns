import { type BattleMap, battleMapPlane, boardRect, gridLines } from "@taverns/api";
import { Badge, cn } from "@taverns/ui";
import { useState } from "react";
import { apiUrl } from "../api/client";

/**
 * An encounter's board: the picture Hob drew of the place with the grid laid
 * over it, or the grid alone.
 *
 * ### One plane, in the original's pixels
 *
 * The grid is an SVG whose `viewBox` is the plane the board is measured on —
 * the original picture's size, or the board itself when there is no picture
 * (`battleMapPlane`). The picture and the SVG fill the same box, and that box
 * takes the plane's aspect ratio, so the browser does the one scaling there is
 * and a square at `offset + k · cellPx` lands on the picture wherever the
 * variant drawn is `card` or `full` (both are scaled, never cropped). The
 * strokes do not scale: a line is a line at any width.
 *
 * No pan, no zoom and no scroller of its own: the board is the content
 * column's width and the page grows to hold it.
 *
 * ### Four states, all the board
 *
 * - **A picture** — drawn under the grid.
 * - **Hob is drawing** — the grid on the sunken surface, saying so, while the
 *   page re-reads (`hob/drawingPolling.ts`).
 * - **No picture** — the grid on the sunken surface. Nothing on the wire says
 *   *why* there is none (no setting line, images off, the budget, a refusal,
 *   a failed draw), so the page says only that there is none.
 * - **A picture that will not load** — an expired signature, a lost file —
 *   falls back to the grid alone, the same collapse `HobCover` makes.
 */
export function BattleMapBoard({ map }: { readonly map: BattleMap }) {
  const image = map.image;
  const src = image === null ? undefined : apiUrl(image.fullUrl);
  const [brokenSrc, setBrokenSrc] = useState<string>();
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const showable = src !== undefined && brokenSrc !== src;
  const plane = battleMapPlane(map, image);
  const lines = gridLines(map);
  const board = boardRect(map);

  return (
    <div
      data-slot="battle-map"
      className="relative w-full overflow-hidden rounded-card border border-hairline bg-surface-sunken"
      style={{ aspectRatio: `${String(plane.width)} / ${String(plane.height)}` }}
    >
      {showable && image !== null && (
        <img
          key={src}
          src={src}
          // Both sizes, so a browser picks by the width it actually draws; the
          // widths are the battle map kind's variants (`images/kinds.ts`).
          srcSet={`${apiUrl(image.cardUrl)} 768w, ${apiUrl(image.fullUrl)} 1536w`}
          sizes="auto, 100vw"
          alt={map.setting ?? "The place, as Hob drew it"}
          decoding="async"
          onLoad={() => setLoadedSrc(src)}
          onError={() => setBrokenSrc(src)}
          className={cn(
            "absolute inset-0 size-full opacity-0 transition-opacity duration-(--dur-slow) ease-out",
            loadedSrc === src && "opacity-100",
          )}
        />
      )}
      {map.grid === "square" && (
        <svg
          data-slot="battle-map-grid"
          aria-hidden
          viewBox={`0 0 ${String(plane.width)} ${String(plane.height)}`}
          preserveAspectRatio="none"
          className={cn(
            "absolute inset-0 size-full",
            showable ? "stroke-on-dark/50" : "stroke-strong",
          )}
        >
          {lines.xs.map((x) => (
            <line
              key={`x${String(x)}`}
              data-line="column"
              x1={x}
              x2={x}
              y1={board.y}
              y2={board.y + board.height}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {lines.ys.map((y) => (
            <line
              key={`y${String(y)}`}
              data-line="row"
              x1={board.x}
              x2={board.x + board.width}
              y1={y}
              y2={y}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}
      {map.imagePending && (
        <Badge variant="outline" role="status" className="absolute bottom-3 left-3">
          Hob is drawing…
        </Badge>
      )}
    </div>
  );
}

/** "24 × 16 squares · 5 ft each · 120 × 80 ft" — the board's size in the DM's units. */
export const describeBoard = (map: BattleMap): string =>
  [
    `${String(map.columns)} × ${String(map.rows)} squares`,
    `${String(map.feetPerCell)} ft each`,
    `${String(map.columns * map.feetPerCell)} × ${String(map.rows * map.feetPerCell)} ft`,
    ...(map.grid === "none" ? ["grid lines hidden"] : []),
  ].join(" · ");
