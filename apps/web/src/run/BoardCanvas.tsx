import type { PictureRect, PictureSize } from "@taverns/api";
import { Button, Icon } from "@taverns/ui";
import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type CanvasView,
  ZOOM_STEP,
  fitView,
  keepInView,
  openingView,
  wheelZoomFactor,
  zoomAbout,
  zoomLimits,
} from "./canvas";

/**
 * The fight's board as a canvas: it fills the stage behind the runner's
 * panels, and the DM pans it and zooms it (`canvas.ts` is the arithmetic).
 *
 * - **Pan**: drag anywhere but a token, or scroll (a wheel, a trackpad's two
 *   fingers). A drag that moved is a pan and its click is swallowed, so letting
 *   go over a square never moves the selected token there; a press that did
 *   not move is still the click that places it (`RunTokens.tsx`).
 * - **Zoom**: ⌘/Ctrl and the wheel, a trackpad pinch (which the browser sends
 *   as exactly that), two fingers on a touch screen, or the dock's −, + and
 *   *Fit*. The wheel and the fingers zoom about the point under them.
 *
 * The canvas clips rather than hides its overflow: `overflow: hidden` is still
 * a scroller to the browser, and focusing a token past its edge (the arrow
 * keys walk one) would scroll it and slide the board out from under the view.
 *
 * The board is drawn at its plane's own size and scaled by one CSS transform,
 * so `RunTokens`' percentages and its click-to-square arithmetic hold at every
 * zoom (`getBoundingClientRect` answers the transformed box).
 *
 * Until the DM pans or zooms, the view follows the canvas as it resizes
 * (`openingView`, in the part no panel covers); after that it is theirs, and
 * *Fit* hands the whole board back.
 */

/** A pointer that moved less than this is a press, not a drag. */
const DRAG_PX = 4;

export interface CanvasControls {
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly fit: () => void;
}

export function BoardCanvas({
  plane,
  cellPx,
  freeArea,
  controlsRef,
  children,
}: {
  readonly plane: PictureSize;
  /** One square, in the plane's pixels: the zoom's bounds are a square's drawn size. */
  readonly cellPx: number;
  /** The part of the canvas no panel covers, in its own pixels, to open and fit the board into. */
  readonly freeArea: (canvas: DOMRect) => PictureRect;
  /** The dock's −, + and *Fit*, which live outside the canvas. */
  readonly controlsRef: RefObject<CanvasControls | null>;
  /** The board, drawn at the plane's size. */
  readonly children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  /** The free area as the canvas was last measured: what the view opens into. */
  const [opening, setOpening] = useState<PictureRect>();
  const [chosen, setChosen] = useState<CanvasView>();
  const limits = zoomLimits(cellPx);
  const free = useRef(freeArea);
  free.current = freeArea;

  /** The free area now, or the whole canvas when the panels leave none. */
  const area = useCallback((): PictureRect | undefined => {
    const canvas = viewport.current?.getBoundingClientRect();
    if (canvas === undefined || canvas.width === 0 || canvas.height === 0) return undefined;
    const clear = free.current(canvas);
    return clear.width > 0 && clear.height > 0
      ? clear
      : { x: 0, y: 0, width: canvas.width, height: canvas.height };
  }, []);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const measure = () => setOpening(area());
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [area]);

  const view: CanvasView =
    chosen ??
    (opening === undefined ? { x: 0, y: 0, zoom: 1 } : openingView(plane, opening, cellPx));
  // The latest view, for the handlers below, which are bound once.
  const current = useRef(view);
  current.current = view;

  const settle = useCallback(
    (next: CanvasView) => {
      const canvas = viewport.current?.getBoundingClientRect();
      setChosen(
        canvas === undefined || canvas.width === 0 ? next : keepInView(next, plane, canvas, cellPx),
      );
    },
    [plane, cellPx],
  );

  const zoomBy = useCallback(
    (factor: number, at?: { x: number; y: number }) => {
      const canvas = viewport.current?.getBoundingClientRect();
      const centre = at ?? { x: (canvas?.width ?? 0) / 2, y: (canvas?.height ?? 0) / 2 };
      settle(zoomAbout(current.current, current.current.zoom * factor, centre, limits));
    },
    [settle, limits],
  );

  useEffect(() => {
    controlsRef.current = {
      zoomIn: () => zoomBy(ZOOM_STEP),
      zoomOut: () => zoomBy(1 / ZOOM_STEP),
      fit: () => {
        const fitted = area();
        if (fitted !== undefined) setChosen(fitView(plane, fitted, limits));
      },
    };
    return () => {
      controlsRef.current = null;
    };
  }, [controlsRef, zoomBy, area, plane, limits]);

  // The wheel, bound by hand: React's own listener is passive, and the page
  // must not scroll or zoom under the board.
  useEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      const box = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        zoomBy(wheelZoomFactor(event.deltaY * unit), {
          x: event.clientX - box.left,
          y: event.clientY - box.top,
        });
        return;
      }
      const from = current.current;
      settle({ ...from, x: from.x - event.deltaX * unit, y: from.y - event.deltaY * unit });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomBy, settle]);

  // Pointers: one drags the board, two pinch it.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    { moved: boolean; from: { x: number; y: number }; view: CanvasView } | undefined
  >(undefined);
  const swallowClick = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // A token is pressed, not dragged, until the board learns to drag tokens.
    if (event.button !== 0 || (event.target as Element).closest("button") !== null) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current = {
      moved: false,
      from: { x: event.clientX, y: event.clientY },
      view: current.current,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointers.current.get(event.pointerId);
    const started = gesture.current;
    if (pointer === undefined || started === undefined) return;
    const before = [...pointers.current.values()];
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2 && before.length >= 2) {
      const [a0, b0] = before as [{ x: number; y: number }, { x: number; y: number }];
      const [a1, b1] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const box = event.currentTarget.getBoundingClientRect();
      const span = (p: { x: number; y: number }, q: { x: number; y: number }) =>
        Math.hypot(p.x - q.x, p.y - q.y);
      const mid0 = { x: (a0.x + b0.x) / 2 - box.left, y: (a0.y + b0.y) / 2 - box.top };
      const mid1 = { x: (a1.x + b1.x) / 2 - box.left, y: (a1.y + b1.y) / 2 - box.top };
      const from = current.current;
      const zoomed = zoomAbout(
        from,
        from.zoom * (span(a1, b1) / Math.max(1, span(a0, b0))),
        mid0,
        limits,
      );
      settle({ ...zoomed, x: zoomed.x + mid1.x - mid0.x, y: zoomed.y + mid1.y - mid0.y });
      started.moved = true;
      return;
    }

    const dx = event.clientX - started.from.x;
    const dy = event.clientY - started.from.y;
    if (!started.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    if (!started.moved) {
      started.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    settle({ ...started.view, x: started.view.x + dx, y: started.view.y + dy });
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    if (gesture.current?.moved === true) swallowClick.current = true;
    if (pointers.current.size === 0) gesture.current = undefined;
    else {
      // A pinch down to one finger carries on as a drag from where it is.
      const [rest] = [...pointers.current.values()];
      if (rest !== undefined) gesture.current = { moved: true, from: rest, view: current.current };
    }
  };

  return (
    <div
      ref={viewport}
      data-slot="board-canvas"
      className="absolute inset-0 cursor-grab touch-none overflow-clip select-none active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={(event) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      <div
        data-slot="board-canvas-content"
        className="absolute top-0 left-0 w-(--board-w) origin-top-left [transform:translate(var(--pan-x),var(--pan-y))_scale(var(--zoom))]"
        style={
          {
            "--board-w": `${String(plane.width)}px`,
            "--pan-x": `${String(view.x)}px`,
            "--pan-y": `${String(view.y)}px`,
            "--zoom": String(view.zoom),
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

/** The dock's three canvas buttons. */
export function CanvasZoom({ controls }: { readonly controls: RefObject<CanvasControls | null> }) {
  return (
    <div role="group" aria-label="Zoom" className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        aria-label="Zoom out"
        onClick={() => controls.current?.zoomOut()}
      >
        <Icon name="minus" size={13} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Zoom in"
        onClick={() => controls.current?.zoomIn()}
      >
        <Icon name="plus" size={13} />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => controls.current?.fit()}>
        Fit
      </Button>
    </div>
  );
}
