import type { PictureSize } from "@taverns/api";
import { createContext, type RefObject, useContext } from "react";
import type { BoardView } from "./view";

/**
 * What the canvas tells the board drawn inside it (`BoardCanvas.tsx`): how it
 * is looked at, and how a point on the screen lands on its content, which a
 * bounding box no longer answers once the board is tilted (a turned
 * rectangle's box is not the rectangle).
 *
 * Absent outside the canvas — the narrow grid's card and a player's map — where
 * the board is drawn flat and a layer's box is its own square.
 */
export interface BoardFrame {
  readonly view: BoardView;
  /** The canvas's content element, the one the view's transform is on, once mounted. */
  readonly root: () => HTMLElement | null;
  /** A point on the screen, in the content's own untransformed pixels. */
  readonly toContent: (clientX: number, clientY: number) => { x: number; y: number } | undefined;
}

export const BoardFrameContext = createContext<BoardFrame | undefined>(undefined);

/** How the board around this is looked at: straight down off the canvas. */
export const useBoardViewOf = (): BoardView => useContext(BoardFrameContext)?.view ?? "top";

/**
 * A point on the screen in a full-plane layer's own plane units (the
 * picture's pixels, `battleMapPlane`), or `undefined` while the layer has no
 * size. On the canvas it goes through the canvas's inverse transform and the
 * layer's offset inside the content; anywhere else the layer's box is enough.
 */
export function usePlanePoint(
  layer: RefObject<HTMLElement | null>,
  plane: PictureSize,
): (clientX: number, clientY: number) => { x: number; y: number } | undefined {
  const frame = useContext(BoardFrameContext);
  return (clientX, clientY) => {
    const element = layer.current;
    if (element === null) return undefined;
    const root = frame?.root() ?? null;
    if (frame !== undefined && root !== null && element.offsetWidth > 0) {
      const at = frame.toContent(clientX, clientY);
      const offset = offsetWithin(element, root);
      if (at !== undefined && offset !== undefined) {
        return {
          x: ((at.x - offset.x) / element.offsetWidth) * plane.width,
          y: ((at.y - offset.y) / element.offsetHeight) * plane.height,
        };
      }
    }
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return undefined;
    return {
      x: ((clientX - box.left) / box.width) * plane.width,
      y: ((clientY - box.top) / box.height) * plane.height,
    };
  };
}

/** Where `element`'s border box starts inside `root`'s, by layout offsets, which no transform moves. */
const offsetWithin = (
  element: HTMLElement,
  root: HTMLElement,
): { x: number; y: number } | undefined => {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node !== null && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (parent !== null) {
      x += parent.clientLeft;
      y += parent.clientTop;
    }
    node = parent;
  }
  return node === root ? { x, y } : undefined;
};
