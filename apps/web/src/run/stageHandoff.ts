import type { PlaneSize } from "@taverns/api";
import type { LevelRenderer } from "../level/renderer";
import type { CanvasView } from "./canvas";

/**
 * The stage, handed from one screen to the next over the same dungeon.
 *
 * A level visit's stage and the fight that borrows it are two routes
 * (`visits/VisitScreen.tsx`, `run/RunScreen.tsx`), as a seated player's visit
 * and fight are two boards (`play/PlayerBoard.tsx`), so going from one to the
 * other unmounts one canvas and mounts the next. Built afresh, that is a new
 * WebGL context and every wall, prop and light of the level again, a blank
 * stage while it happens, and the camera back where it opens. Instead the
 * stage going away parks its renderer and its view here under a key that
 * names the dungeon (`stageKey`), and the next one with the same key takes
 * them up before it first paints: the canvas never leaves the screen's
 * pixels for long enough to be seen, and the renderer only redraws what the
 * new answer changed (`LevelRenderer.setLevel` compares content).
 *
 * One slot, since one stage is on the screen at a time. What nobody takes up
 * within `HELD_MS` is disposed, as it would have been on unmount.
 */

/** Long enough for the next route to mount, short enough that a parked GPU context is soon given back. */
const HELD_MS = 5_000;

interface Parked {
  readonly key: string;
  renderer: LevelRenderer | null;
  view: { readonly plane: PlaneSize; readonly at: CanvasView } | null;
  timer: ReturnType<typeof setTimeout>;
}

let parked: Parked | undefined;

/** The key both sides of a hand-off name the same dungeon by. */
export const stageKey = {
  /** The DM's stage over a level visit, and the fight that borrows it. */
  visit: (visitId: string): string => `visit:${visitId}`,
  /** A seated player's table, whose visit and fight are one dungeon in turn. */
  table: (campaignId: string): string => `table:${campaignId}`,
} as const;

/** The slot for `key`, its time held starting again from now. */
const slot = (key: string): Parked => {
  if (parked?.key === key) {
    clearTimeout(parked.timer);
    parked.timer = setTimeout(drop, HELD_MS);
    return parked;
  }
  drop();
  const fresh: Parked = { key, renderer: null, view: null, timer: setTimeout(drop, HELD_MS) };
  parked = fresh;
  return fresh;
};

/**
 * Dispose of whatever is parked: nobody took it up, or another dungeon took
 * the slot. Exported for the test setup, which empties the slot between tests.
 */
export const drop = () => {
  const was = parked;
  parked = undefined;
  if (was === undefined) return;
  clearTimeout(was.timer);
  was.renderer?.dispose();
};

/** Park a renderer going off the screen, stopped and detached, for the next stage over `key`. */
export const parkRenderer = (key: string, renderer: LevelRenderer): void => {
  renderer.park();
  const at = slot(key);
  if (at.renderer !== null && at.renderer !== renderer) at.renderer.dispose();
  at.renderer = renderer;
};

/** Take up the renderer parked under `key`, if there is one; it is the caller's from here. */
export const claimRenderer = (key: string): LevelRenderer | undefined => {
  if (parked?.key !== key || parked.renderer === null) return undefined;
  const renderer = parked.renderer;
  parked.renderer = null;
  return renderer;
};

/** Park the camera's view going off the screen, for the next canvas over the same plane. */
export const parkView = (key: string, plane: PlaneSize, at: CanvasView): void => {
  slot(key).view = { plane, at };
};

/** Take up the view parked under `key`, if it was over a plane of this size. */
export const claimView = (key: string, plane: PlaneSize): CanvasView | undefined => {
  const view = parked?.key === key ? parked.view : null;
  if (view === null || view.plane.width !== plane.width || view.plane.height !== plane.height)
    return undefined;
  parked!.view = null;
  return view.at;
};
