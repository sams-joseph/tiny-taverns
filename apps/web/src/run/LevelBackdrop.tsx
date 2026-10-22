import { type LevelLayout } from "@taverns/api";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { levelMarks } from "../level/overlay";
import type { LevelRenderer } from "../level/renderer";
import { dmReader } from "../level/scene";
import type { LevelView } from "../level/view";
import type { CanvasView } from "./canvas";

type Stage = typeof import("../level/renderer");

/**
 * The level under a fight's board, drawn by the editor's own renderer
 * (`level/renderer.ts`) in its play mode: no tool's marks, the DM's reader
 * (every secret door known, DM-only props drawn), and the DM's marks on top
 * (`levelMarks`: secret doors, locked doors, low walls, DM-only props,
 * regions). Lit by the fight's own ambient and lights, so a snuffed torch goes
 * dark when the doorbell's re-read lands.
 *
 * It fills the board canvas behind the transformed board (`BoardCanvas`'s
 * `backdrop`) and follows its view, so it draws its own pixels at every zoom
 * instead of a scaled bitmap. A square of the board's plane is `cellPx`
 * pixels (`BOARD_CELL_PX`, every board's), so square
 * `(c, r)` lands where the tokens, the fog, the areas and the effects put it.
 * Takes no pointer: the canvas pans over it and the doors' switches sit on the
 * board (`LevelSwitches.tsx`).
 */
export function LevelBackdrop({
  layout,
  cellPx,
  view,
  grid,
  onFailed,
}: {
  readonly layout: LevelLayout;
  readonly cellPx: number;
  readonly view: CanvasView;
  readonly grid: boolean;
  /** Three could not load, or the browser dropped the WebGL context. */
  readonly onFailed: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<LevelRenderer | null>(null);
  const size = useRef({ width: 1, height: 1 });
  const [ready, setReady] = useState(false);
  const latest = useRef({ layout, cellPx, view, grid });
  latest.current = { layout, cellPx, view, grid };
  const failed = useRef(onFailed);
  failed.current = onFailed;

  /** The canvas's view in the renderer's terms: the level point at its centre, pixels a square. */
  const levelView = (at: CanvasView, px: number): LevelView => {
    const zoom = px * at.zoom;
    return {
      zoom,
      cx: (size.current.width / 2 - at.x) / zoom,
      cy: (size.current.height / 2 - at.y) / zoom,
    };
  };

  useLayoutEffect(() => {
    const at = host.current;
    if (at === null) return;
    let alive = true;
    let observer: ResizeObserver | undefined;
    let lost: ((event: Event) => void) | undefined;
    import("../level/renderer")
      .then((stage: Stage) => {
        if (!alive) return;
        const r = new stage.LevelRenderer(at);
        renderer.current = r;
        lost = (event: Event) => {
          event.preventDefault();
          failed.current();
        };
        r.renderer.domElement.addEventListener("webglcontextlost", lost);
        const fit = (width: number, height: number) => {
          size.current = { width, height };
          r.resize(width, height);
          r.setView(levelView(latest.current.view, latest.current.cellPx));
        };
        const box = at.getBoundingClientRect();
        fit(box.width, box.height);
        observer = new ResizeObserver(([entry]) => {
          if (entry !== undefined) fit(entry.contentRect.width, entry.contentRect.height);
        });
        observer.observe(at);
        r.start();
        setReady(true);
      })
      .catch(() => {
        if (alive) failed.current();
      });
    return () => {
      alive = false;
      observer?.disconnect();
      const r = renderer.current;
      if (r !== null && lost !== undefined) {
        r.renderer.domElement.removeEventListener("webglcontextlost", lost);
      }
      r?.dispose();
      renderer.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one renderer per mount; the rest is fed below.

  // The level, as the doorbell's re-reads hand it over.
  useEffect(() => {
    const r = renderer.current;
    if (r === null) return;
    r.setLevel(layout, dmReader(layout));
    r.setVision(null);
    r.setOverlay(levelMarks(layout, { lights: false }));
  }, [ready, layout]);

  useEffect(() => {
    renderer.current?.setOptions({ lit: true, grid, viewAs: false });
  }, [ready, grid]);

  useEffect(() => {
    renderer.current?.setView(levelView(view, cellPx));
  }, [ready, view, cellPx]); // eslint-disable-line react-hooks/exhaustive-deps -- `levelView` reads refs only.

  return (
    <div
      ref={host}
      data-slot="level-backdrop"
      aria-hidden
      className="pointer-events-none absolute inset-0"
    />
  );
}
