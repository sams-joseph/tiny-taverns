import { type BoardSquare, areaSquares, areaToward, battleMapPlane, cellRect } from "@taverns/api";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DrawnBoard } from "../BoardTools";
import type { BoardStage } from "../fx/stage";
import type { Playing } from "../useBoardEffects";
import type { FxEngine } from "./engine";
import type { GridOnPlane } from "./projection";

type Stage3d = typeof import("./stage3d");

/** The board's grid on its plane, as the effects' camera needs it. */
const gridOf = (board: DrawnBoard): GridOnPlane => {
  const plane = battleMapPlane(board, board.image);
  const first = cellRect(board, { column: 0, row: 0 });
  return {
    planeWidth: plane.width,
    planeHeight: plane.height,
    originX: first.x,
    originY: first.y,
    cell: first.width,
  };
};

/**
 * The three.js stage over the board (`engine.ts`), mounted into the effects
 * layer: every attack and area, and the rings off a healed token, play here
 * the moment they arrive, each once. The numbers stay the DOM's
 * (`fx/Number.tsx`), waiting on the same stage for their blow to land.
 *
 * three.js itself loads with the first board that mounts (`stage3d.ts`);
 * what arrives before it has loaded plays once it has. `onFail` hands the
 * board back to the SVG effects if the engine cannot start (no WebGL, a
 * failed load, or a lost context).
 */
export function Fx3D({
  board,
  playing,
  stage,
  ended,
  onFail,
}: {
  readonly board: DrawnBoard;
  readonly playing: ReadonlyArray<Playing>;
  readonly stage: BoardStage;
  readonly ended: (key: number) => void;
  readonly onFail: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<FxEngine | null>(null);
  const started = useRef(new Set<number>());
  const grid = gridOf(board);
  const gridKey = JSON.stringify(grid);
  const boardRef = useRef(board);
  boardRef.current = board;

  const lib = useRef<Stage3d | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const at = host.current;
    if (at === null) return;
    let alive = true;
    let canvas: HTMLCanvasElement | undefined;
    const lost = (event: Event) => {
      event.preventDefault();
      onFail();
    };
    import("./stage3d")
      .then((loaded) => {
        if (!alive) return;
        lib.current = loaded;
        engine.current = new loaded.FxEngine({ host: at, grid: gridOf(boardRef.current), stage });
        canvas = engine.current.renderer.domElement;
        canvas.addEventListener("webglcontextlost", lost);
        setReady(true);
      })
      .catch(() => {
        if (alive) onFail();
      });
    return () => {
      alive = false;
      canvas?.removeEventListener("webglcontextlost", lost);
      engine.current?.dispose();
      engine.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one engine for the board's life.

  useEffect(() => {
    engine.current?.setGrid(grid);
  }, [gridKey]); // eslint-disable-line react-hooks/exhaustive-deps -- the grid, by value.

  useEffect(() => {
    const fx = engine.current;
    const play = lib.current;
    if (fx === null || play === null) return;
    fx.beats = fx.readBeats();
    for (const effect of playing) {
      if (started.current.has(effect.key)) continue;
      if (effect.kind === "strike") {
        started.current.add(effect.key);
        play.playStrike(fx, effect, () => ended(effect.key));
      } else if (effect.kind === "blast") {
        started.current.add(effect.key);
        const squares: ReadonlyArray<BoardSquare> = areaSquares(board, {
          shape: effect.area.shape,
          feet: effect.area.feet,
          feetPerCell: board.feetPerCell,
          origin: effect.area.origin,
          toward: areaToward(effect.area),
        });
        play.playBlast(fx, effect, squares, board.feetPerCell, () => ended(effect.key));
      } else if (effect.kind === "heal") {
        // The number is the DOM's and ends the effect; the rings only add to it.
        started.current.add(effect.key);
        play.playHeal(fx, effect.at, () => undefined);
      }
    }
  }, [playing, ready]); // eslint-disable-line react-hooks/exhaustive-deps -- each effect starts once, as it arrives (or as the stage loads).

  return (
    <div
      ref={host}
      data-slot="board-fx3d-host"
      aria-hidden
      className="pointer-events-none absolute inset-0"
    />
  );
}
