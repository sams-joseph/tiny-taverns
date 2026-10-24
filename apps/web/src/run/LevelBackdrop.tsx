import { type LevelLayout } from "@taverns/api";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { levelMarks, partyMarks } from "../level/overlay";
import type { LevelRenderer } from "../level/renderer";
import { dmReader, type Reader } from "../level/scene";
import type { LevelView } from "../level/view";
import type { CanvasView } from "./canvas";
import { claimRenderer, parkRenderer } from "./stageHandoff";

type Stage = typeof import("../level/renderer");

/** What the party sees of the level, as a seated player's table is told it (`PlayerLiveLevel`). */
export interface PartySight {
  /** Squares in sight now. */
  readonly sees: ReadonlyArray<number>;
  /** Squares explored, `sees` among them. */
  readonly seen: ReadonlyArray<number>;
}

/** The party's sight as the renderer takes it: no viewers' fans, the squares it was told. */
const sightOf = (layout: LevelLayout, sight: PartySight) => {
  const seen = new Uint8Array(layout.columns * layout.rows);
  for (const square of sight.seen) if (square < seen.length) seen[square] = 1;
  return { part: { viewers: [], sees: sight.sees }, seen };
};

/**
 * The level under a fight's board, drawn by the editor's own renderer
 * (`level/renderer.ts`) in its play mode: no tool's marks, the DM's reader
 * (every secret door known, DM-only props drawn), and the DM's marks on top
 * (`levelMarks`: secret doors, locked doors, low walls, DM-only props,
 * regions). Lit by the fight's own ambient and lights, so a snuffed torch goes
 * dark when the doorbell's re-read lands.
 *
 * **On a seated player's table** (`party`), the same renderer in the party's
 * view: the level is only what the table was sent (`playerLevelLayout`), read
 * as the party knows it (every secret door it was sent is found, no DM-only
 * prop), what the party sees now in full, what it has explored dimmed and
 * grey, the rest hatched; and only the regions it was sent marked
 * (`partyMarks`), nothing of the DM's.
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
  party,
  vision,
  handoff,
  onFailed,
}: {
  readonly layout: LevelLayout;
  readonly cellPx: number;
  readonly view: CanvasView;
  readonly grid: boolean;
  /** The party's sight, on a seated player's table; absent on the DM's board. */
  readonly party?: PartySight | undefined;
  /**
   * On the DM's board, what the party sees, drawn as the party's view of the
   * DM's whole level: a level visit's *Party's view* (`visits/VisitBoard.tsx`).
   * Absent, the DM's board is lit as the DM sees it.
   */
  readonly vision?: PartySight | undefined;
  /**
   * The dungeon this stage draws, for the next stage over it (`stageHandoff.ts`):
   * the renderer is parked under it when this one goes, and one parked under it
   * is taken up when this one comes, rather than built again. Absent, it is
   * this mount's alone and disposed with it.
   */
  readonly handoff?: string | undefined;
  /** Three could not load, or the browser dropped the WebGL context. */
  readonly onFailed: () => void;
}) {
  // One reader per walls array, so a re-read that leaves the walls alone
  // rebuilds nothing that reads them.
  const walls = layout.walls;
  const partyReader = useMemo<Reader>(
    () => ({
      revealed: new Set(walls.filter((w) => w.kind === "secretDoor").map((w) => w.id)),
      party: true,
    }),
    [walls],
  );
  const viewing = party !== undefined;
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
    const take = (r: LevelRenderer) => {
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
    };
    // Taken up before the first paint, so the dungeon never leaves the screen.
    const parked = handoff === undefined ? undefined : claimRenderer(handoff);
    if (parked !== undefined) {
      parked.attach(at);
      take(parked);
    } else {
      import("../level/renderer")
        .then((stage: Stage) => {
          if (alive) take(new stage.LevelRenderer(at));
        })
        .catch(() => {
          if (alive) failed.current();
        });
    }
    return () => {
      alive = false;
      observer?.disconnect();
      const r = renderer.current;
      if (r !== null && lost !== undefined) {
        r.renderer.domElement.removeEventListener("webglcontextlost", lost);
      }
      if (r !== null && handoff !== undefined) parkRenderer(handoff, r);
      else r?.dispose();
      renderer.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one renderer per mount; the rest is fed below.

  // The level, as the doorbell's re-reads hand it over.
  useEffect(() => {
    const r = renderer.current;
    if (r === null) return;
    if (party === undefined) {
      r.setLevel(layout, dmReader(layout));
      r.setVision(vision === undefined ? null : sightOf(layout, vision));
      r.setOverlay(levelMarks(layout, { lights: false }));
      return;
    }
    r.setLevel(layout, partyReader);
    r.setVision(sightOf(layout, party));
    r.setOverlay(partyMarks(layout));
  }, [ready, layout, party, vision, partyReader]);

  const viewAs = viewing || vision !== undefined;
  useEffect(() => {
    renderer.current?.setOptions({ lit: true, grid, viewAs });
  }, [ready, grid, viewAs]);

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
