import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { canDrawWebGL } from "../run/fx3d/support";
import { typingInto } from "./keymap";
import { describeHover, describeOverlay } from "./overlay";
import type { LevelRenderer } from "./renderer";
import { dmReader, partyReader } from "./scene";
import type { EditorStore } from "./store";
import { fitView, panBy, toWorld, wheelFactor, zoomAt, type LevelView } from "./view";

/** The margin a fitted level leaves for the editor's floating panels, in CSS pixels. */
const FIT_INSET = 80;
/** A pointer that moved less than this many pixels is a click, not a drag. */
const DRAG_SLOP = 3;

type Stage = typeof import("./renderer");

interface Pan {
  readonly id: number;
  readonly sx: number;
  readonly sy: number;
  readonly from: LevelView;
  readonly button: number;
  moved: boolean;
}

/**
 * The level, drawn by `LevelRenderer` and driven by the pointer: right or
 * middle drag (or Space held) pans, the wheel or a pinch zooms, and every
 * other press goes to the editor's store in level squares.
 *
 * three.js loads with the first canvas that mounts (`renderer.ts` is imported
 * here dynamically), and a browser without WebGL 2 is told so instead; the
 * test environment is one, so the editor's panels render there with no
 * renderer at all.
 */
export function LevelCanvas({
  store,
  onThumbnails,
}: {
  readonly store: EditorStore;
  /** Each floor material painted by the floor shader, for the tray. */
  readonly onThumbnails?: (urls: ReadonlyArray<string>) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<LevelRenderer | null>(null);
  const view = useRef<LevelView>({ cx: 0, cy: 0, zoom: 32 });
  const size = useRef({ width: 1, height: 1 });
  const pan = useRef<Pan | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const space = useRef(false);
  const fitted = useRef(-1);
  const [drawable] = useState(canDrawWebGL);
  const [failed, setFailed] = useState(false);

  const setView = (next: LevelView) => {
    view.current = next;
    renderer.current?.setView(next);
  };

  const fit = () => setView(fitView(store.doc, size.current, FIT_INSET));

  // The renderer: made once, fed from the store a frame at a time.
  useLayoutEffect(() => {
    const at = host.current;
    if (at === null || !drawable) return;
    let alive = true;
    let frame: number | undefined;
    let unsubscribe: Array<() => void> = [];
    let lost: ((event: Event) => void) | undefined;
    let observer: ResizeObserver | undefined;
    let stateDirty = true;
    let hoverDirty = true;

    const sync = () => {
      frame = undefined;
      const r = renderer.current;
      if (r === null) return;
      const state = store.getState();
      if (stateDirty) {
        stateDirty = false;
        const doc = state.history.present;
        const party = state.tool === "party";
        r.setLevel(doc, party ? partyReader : dmReader(doc));
        r.setOptions({ lit: state.lit, grid: state.grid, viewAs: party });
        r.setVision(store.vision());
        r.setOverlay(describeOverlay(state));
        if (state.fitRequest !== fitted.current) {
          fitted.current = state.fitRequest;
          fit();
        }
      }
      if (hoverDirty) {
        hoverDirty = false;
        r.setHover(describeHover(state, store.getPointer()).marks);
      }
    };
    const schedule = () => {
      frame ??= requestAnimationFrame(sync);
    };

    import("./renderer")
      .then((stage: Stage) => {
        if (!alive) return;
        const r = new stage.LevelRenderer(at);
        renderer.current = r;
        lost = (event: Event) => {
          event.preventDefault();
          setFailed(true);
        };
        r.renderer.domElement.addEventListener("webglcontextlost", lost);
        const box = at.getBoundingClientRect();
        size.current = { width: box.width, height: box.height };
        r.resize(box.width, box.height);
        r.setView(view.current);
        observer = new ResizeObserver(([entry]) => {
          if (entry === undefined) return;
          size.current = { width: entry.contentRect.width, height: entry.contentRect.height };
          r.resize(entry.contentRect.width, entry.contentRect.height);
        });
        observer.observe(at);
        unsubscribe = [
          store.subscribe(() => {
            stateDirty = true;
            hoverDirty = true;
            schedule();
          }),
          store.subscribeHover(() => {
            hoverDirty = true;
            schedule();
          }),
        ];
        sync();
        r.start();
        onThumbnails?.(r.floorThumbnails());
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (frame !== undefined) cancelAnimationFrame(frame);
      for (const off of unsubscribe) off();
      observer?.disconnect();
      const r = renderer.current;
      if (r !== null && lost !== undefined) {
        r.renderer.domElement.removeEventListener("webglcontextlost", lost);
      }
      r?.dispose();
      renderer.current = null;
    };
  }, [store, drawable]); // eslint-disable-line react-hooks/exhaustive-deps -- one renderer per store; `onThumbnails` is read once.

  // Space held pans.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key !== " " || typingInto(event.target)) return;
      space.current = true;
      event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === " ") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // The wheel, bound by hand: React's listener is passive, and the page must not scroll or zoom.
  useEffect(() => {
    const at = host.current;
    if (at === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = at.getBoundingClientRect();
      setView(
        zoomAt(
          view.current,
          size.current,
          event.clientX - box.left,
          event.clientY - box.top,
          wheelFactor(event.deltaY, event.ctrlKey),
        ),
      );
    };
    at.addEventListener("wheel", onWheel, { passive: false });
    return () => at.removeEventListener("wheel", onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- `setView` reads refs only.

  const local = (event: ReactPointerEvent) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { sx: event.clientX - box.left, sy: event.clientY - box.top };
  };
  const world = (event: ReactPointerEvent) => {
    const { sx, sy } = local(event);
    return toWorld(view.current, size.current, sx, sy);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pinch.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current.size >= 2) {
      // A second finger: the first one's press becomes a pinch, not an edit.
      store.pointerUp(world(event), false);
      pan.current = null;
      return;
    }
    if (event.button === 1 || event.button === 2 || space.current) {
      pan.current = {
        id: event.pointerId,
        sx: event.clientX,
        sy: event.clientY,
        from: view.current,
        button: event.button,
        moved: false,
      };
      event.currentTarget.dataset["panning"] = "";
      return;
    }
    if (event.button !== 0) return;
    store.pointerDown(world(event), event.shiftKey);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const before = pinch.current.get(event.pointerId);
    if (before !== undefined && pinch.current.size >= 2) {
      const others = [...pinch.current.entries()].filter(([id]) => id !== event.pointerId);
      const other = others[0]?.[1];
      pinch.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (other === undefined) return;
      const d0 = Math.hypot(before.x - other.x, before.y - other.y);
      const d1 = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      const box = event.currentTarget.getBoundingClientRect();
      const mx = (event.clientX + other.x) / 2 - box.left;
      const my = (event.clientY + other.y) / 2 - box.top;
      let next = zoomAt(view.current, size.current, mx, my, d0 > 0 ? d1 / d0 : 1);
      next = panBy(next, (event.clientX - before.x) / 2, (event.clientY - before.y) / 2);
      setView(next);
      return;
    }
    if (before !== undefined)
      pinch.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const p = pan.current;
    if (p !== null && p.id === event.pointerId) {
      const dx = event.clientX - p.sx;
      const dy = event.clientY - p.sy;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_SLOP) p.moved = true;
      setView(panBy(p.from, dx, dy));
      return;
    }
    store.pointerMove(world(event), event.shiftKey);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const wasPinching = pinch.current.size >= 2;
    pinch.current.delete(event.pointerId);
    if (wasPinching) return;
    const p = pan.current;
    if (p !== null && p.id === event.pointerId) {
      pan.current = null;
      delete event.currentTarget.dataset["panning"];
      if (!p.moved && p.button === 2) store.endChain();
      return;
    }
    if (event.type === "pointercancel") {
      store.pointerUp(world(event), false);
      return;
    }
    store.pointerUp(world(event), event.shiftKey);
  };

  if (!drawable || failed) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-surface-sunken p-panel text-center">
        <p className="max-w-md text-body-s text-muted-foreground">
          {failed
            ? "The level stopped drawing (the browser dropped its WebGL context). Reload the page to carry on; your changes are saved."
            : "This browser cannot draw levels: the editor needs WebGL 2."}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={host}
      data-slot="level-stage"
      aria-label="The level"
      role="application"
      className="absolute inset-0 cursor-crosshair touch-none bg-surface-sunken data-panning:cursor-grabbing"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        if (pan.current === null && store.getState().gesture === null) store.pointerLeave();
      }}
    />
  );
}
