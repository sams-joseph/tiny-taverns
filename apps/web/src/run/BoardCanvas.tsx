import type { PictureRect, PictureSize } from "@taverns/api";
import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type BoardFrame, BoardFrameContext } from "./boardFrame";
import {
  type BoardView,
  applyLinear,
  boundsUnder,
  cssMatrix,
  invertLinear,
  linearOf,
} from "./view";
import {
  type CanvasView,
  keepInView,
  openingView,
  wheelUnit,
  wheelZoomFactor,
  zoomAbout,
  zoomLimits,
} from "./canvas";

/**
 * The fight's board as a canvas: it fills the stage behind the runner's
 * panels, and the DM pans it and zooms it (`canvas.ts` is the arithmetic).
 *
 * - **Pan**: drag anywhere but a token. A drag that starts on a token moves the token (`RunTokens.tsx`)
 *   and never reaches the canvas. A drag that moved is a pan and its click is
 *   swallowed, so letting go over a square never puts a token waiting off the
 *   board there; a press that did not move is still the click that places it.
 * - **Zoom**: the wheel or a trackpad's two-finger scroll, a trackpad pinch
 *   (which the browser sends as a wheel with Ctrl held), two fingers on a touch
 *   screen, each about the point under it. The floating panels are the
 *   canvas's siblings, not its children, so a wheel over one scrolls it and
 *   never reaches the board.
 *
 * The canvas clips rather than hides its overflow: `overflow: hidden` is still
 * a scroller to the browser, and focusing a token past its edge (the arrow
 * keys walk one) would scroll it and slide the board out from under the view.
 *
 * The board is drawn at its plane's own size and placed by one CSS transform:
 * the view's tilt (`view.ts`, none looking straight down), then the pan and
 * zoom, which `canvas.ts` works out over the box the tilted plane fills. So
 * `RunTokens`' percentages hold at every zoom and either view, and a point on
 * the screen lands on the plane through the inverse of that one transform
 * (`BoardFrame`, which the layers inside ask through `usePlanePoint`).
 *
 * Until the DM pans or zooms, the view follows the canvas as it resizes, and
 * whoever is up when it is given one (`openingView`, in the part no panel
 * covers); after that it is theirs.
 */

/** A pointer that moved less than this is a press, not a drag. */
const DRAG_PX = 4;

/** One press of the camera's *Zoom in* or *Zoom out*. */
const ZOOM_STEP = 1.25;

/**
 * The camera, for the buttons that drive it (`CameraBar.tsx`) and whoever
 * follows the turn: the zoom against the opening view, and points of the
 * board's plane to centre or bring into the free area.
 */
export interface Camera {
  /** The zoom as a share of the view the canvas opened on. */
  readonly scale: number;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  /** Back to the opening view. */
  readonly fit: () => void;
  /** Centre a point of the plane in the free area. */
  readonly centre: (point: { readonly x: number; readonly y: number }) => void;
  /** Centre it only when it is outside the free area. */
  readonly reveal: (point: { readonly x: number; readonly y: number }) => void;
}

export function BoardCanvas({
  plane: { width, height },
  cellPx,
  freeArea,
  view: look = "top",
  focus,
  camera: cameraRef,
  controls,
  children,
}: {
  readonly plane: PictureSize;
  /** One square, in the plane's pixels: the zoom's bounds are a square's drawn size. */
  readonly cellPx: number;
  /** The part of the canvas no panel covers, in its own pixels, to open and fit the board into. */
  readonly freeArea: (canvas: DOMRect) => PictureRect;
  /** Straight down, or tilted (`view.ts`). */
  readonly view?: BoardView;
  /** What the view opens on until the DM moves it (`openingView`): whoever is up, in the plane's units. */
  readonly focus?: { readonly x: number; readonly y: number } | undefined;
  /** Where the camera is handed to whoever drives it from outside the canvas. */
  readonly camera?: RefObject<Camera | null>;
  /** The camera's own buttons, drawn beside the canvas rather than on it. */
  readonly controls?: (camera: Camera) => ReactNode;
  /** The board, drawn at the plane's size. */
  readonly children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  /** The free area as the canvas was last measured: what the view opens into. */
  const [opening, setOpening] = useState<PictureRect>();
  const [chosen, setChosen] = useState<CanvasView>();
  // The tilt and the box the tilted plane fills: the canvas's arithmetic works
  // over that box, as it worked over the flat plane.
  const tilt = linearOf(look);
  const flat = useMemo(() => boundsUnder(tilt, { width, height }), [tilt, width, height]);
  const plane = useMemo<PictureSize>(
    () => ({ width: flat.width, height: flat.height }),
    [flat.width, flat.height],
  );
  // A new view is a new board to open on.
  const [lookOpened, setLookOpened] = useState(look);
  if (lookOpened !== look) {
    setLookOpened(look);
    setChosen(undefined);
  }
  const limits = useMemo(() => zoomLimits(cellPx), [cellPx]);
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

  const focusOnFlat =
    focus === undefined
      ? undefined
      : (() => {
          const tilted = applyLinear(tilt, focus);
          return { x: tilted.x - flat.x, y: tilted.y - flat.y };
        })();
  const opened =
    opening === undefined
      ? { x: 0, y: 0, zoom: 1 }
      : openingView(plane, opening, cellPx, focusOnFlat);
  const view: CanvasView = chosen ?? opened;
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

  // The wheel, bound by hand: React's own listener is passive, and the page
  // must not scroll or zoom under the board. A scroll and a pinch both zoom,
  // and a sideways scroll (no `deltaY`) does nothing.
  useEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY === 0) return;
      const box = element.getBoundingClientRect();
      zoomBy(wheelZoomFactor(event.deltaY * wheelUnit(event)), {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Pointers: one drags the board, two pinch it.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    { moved: boolean; from: { x: number; y: number }; view: CanvasView } | undefined
  >(undefined);
  const swallowClick = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swallowClick.current = false;
    // A press on a token is the token's own drag, not a pan.
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
    // A cancelled gesture sends no click to swallow.
    if (gesture.current?.moved === true && event.type === "pointerup") swallowClick.current = true;
    if (pointers.current.size === 0) gesture.current = undefined;
    else {
      // A pinch down to one finger carries on as a drag from where it is.
      const [rest] = [...pointers.current.values()];
      if (rest !== undefined) gesture.current = { moved: true, from: rest, view: current.current };
    }
  };

  /** A point of the plane, on the canvas. */
  const onCanvas = (point: { readonly x: number; readonly y: number }, at: CanvasView) => {
    const tilted = applyLinear(tilt, point);
    return {
      x: (tilted.x - flat.x) * at.zoom + at.x,
      y: (tilted.y - flat.y) * at.zoom + at.y,
    };
  };
  const centreIn = (point: { readonly x: number; readonly y: number }) => {
    const clear = area();
    if (clear === undefined) return;
    const now = current.current;
    const at = onCanvas(point, now);
    settle({
      ...now,
      x: now.x + clear.x + clear.width / 2 - at.x,
      y: now.y + clear.y + clear.height / 2 - at.y,
    });
  };
  const camera: Camera = {
    scale: view.zoom / opened.zoom,
    zoomIn: () => zoomBy(ZOOM_STEP, centreOfFree()),
    zoomOut: () => zoomBy(1 / ZOOM_STEP, centreOfFree()),
    fit: () => setChosen(undefined),
    centre: centreIn,
    reveal: (point) => {
      const clear = area();
      if (clear === undefined) return;
      const at = onCanvas(point, current.current);
      const inside =
        at.x >= clear.x &&
        at.x <= clear.x + clear.width &&
        at.y >= clear.y &&
        at.y <= clear.y + clear.height;
      if (!inside) centreIn(point);
    },
  };
  function centreOfFree() {
    const clear = area();
    return clear === undefined
      ? undefined
      : { x: clear.x + clear.width / 2, y: clear.y + clear.height / 2 };
  }
  if (cameraRef !== undefined) cameraRef.current = camera;

  const untilt = invertLinear(tilt);
  const frame: BoardFrame = {
    view: look,
    root: () => content.current,
    toContent: (clientX, clientY) => {
      const box = viewport.current?.getBoundingClientRect();
      if (box === undefined) return undefined;
      const now = current.current;
      return applyLinear(untilt, {
        x: (clientX - box.left - now.x) / now.zoom + flat.x,
        y: (clientY - box.top - now.y) / now.zoom + flat.y,
      });
    },
  };

  return (
    <BoardFrameContext.Provider value={frame}>
      <div
        ref={viewport}
        data-slot="board-canvas"
        className="absolute inset-0 cursor-grab touch-none overflow-clip select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(event) => {
          // A click with no press behind it is the keyboard, never a drag's.
          if (!swallowClick.current || event.detail === 0) return;
          swallowClick.current = false;
          event.stopPropagation();
          event.preventDefault();
        }}
      >
        <div
          ref={content}
          data-slot="board-canvas-content"
          data-view={look}
          className="absolute top-0 left-0 w-(--board-w) origin-top-left [transform:translate(var(--pan-x),var(--pan-y))_scale(var(--zoom))_var(--tilt)]"
          style={
            {
              "--board-w": `${String(width)}px`,
              "--pan-x": `${String(view.x)}px`,
              "--pan-y": `${String(view.y)}px`,
              "--zoom": String(view.zoom),
              "--tilt": cssMatrix(tilt, -flat.x, -flat.y),
            } as CSSProperties
          }
        >
          {children}
        </div>
      </div>
      {controls?.(camera)}
    </BoardFrameContext.Provider>
  );
}
