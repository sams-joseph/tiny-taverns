import {
  AutoScroller,
  Cursor,
  PointerActivationConstraints,
  PointerSensor,
  PreventSelection,
  type DragDropManagerInput,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/dom";
import type { Encounter, EncounterId, EncounterPlacement } from "@taverns/api";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { dropPlacement, type RowSpan } from "./encounterList";

/**
 * How a press on a grip becomes a drag. A mouse drags once it has moved a
 * few pixels, so a click still opens the handle's menu; a finger holds first
 * (the library's long press), so a tap still opens it too. No keyboard
 * sensor: Enter and Space on a grip open its menu, which is the keyboard's
 * and the screen reader's way to move.
 */
const SENSORS = [
  PointerSensor.configure({
    activationConstraints: (event, source) => {
      if (event.pointerType === "mouse")
        return [new PointerActivationConstraints.Distance({ value: 5 })];
      const standard = PointerSensor.defaults.activationConstraints;
      return typeof standard === "function" ? standard(event, source) : standard;
    },
  }),
];

/**
 * The library's plugins, less the two that fight the design system. Its
 * `Feedback` lifts the dragged node into the browser's top layer as a
 * popover, injects `z-index: calc(infinity)` and animates the drop on a 250ms
 * of its own; the list draws the carried row, the drop line and the settle
 * itself, on the layering scale and the motion tokens. Its `Accessibility` describes
 * a keyboard drag this list does not offer; the page's own live region says
 * where a row went.
 */
const PLUGINS = [AutoScroller, Cursor, PreventSelection];

/** What the list's `DragDropProvider` is given. */
type Provider = Pick<DragDropManagerInput, "sensors" | "plugins"> & {
  readonly onDragStart: (event: DragStartEvent) => void;
  readonly onDragMove: (event: DragMoveEvent) => void;
  readonly onDragEnd: (event: DragEndEvent) => void;
};

/** The row picked up, where the pointer is, and where the row would land. */
interface Grab {
  readonly id: EncounterId;
  y: number;
  over?: EncounterPlacement | undefined;
}

/**
 * The row being dragged, and where it would land: the drop line's distance
 * down the list, when the drop would move it.
 */
interface Dragging {
  readonly id: EncounterId;
  readonly line: number | undefined;
}

/**
 * Where on the screen a drop line for `placement` goes: the middle of the gap
 * between its anchor and the row drawn beside it on that side, or the
 * anchor's own edge at an end of the list.
 */
const lineAt = (
  spans: ReadonlyArray<RowSpan>,
  encounterId: EncounterId,
  placement: EncounterPlacement,
): number | undefined => {
  const others = spans.filter((span) => span.id !== encounterId);
  const before = "before" in placement;
  const at = others.findIndex((span) => span.id === (before ? placement.before : placement.after));
  const anchor = others[at];
  if (anchor === undefined) return undefined;
  const beside = others[before ? at - 1 : at + 1];
  if (before) return beside === undefined ? anchor.top : (beside.bottom + anchor.top) / 2;
  return beside === undefined ? anchor.bottom : (anchor.bottom + beside.top) / 2;
};

/**
 * A row dropped: where it was on the screen, then how far that is from its new
 * place in the list, then on its way there.
 */
interface Settling {
  readonly id: EncounterId;
  readonly releasedTop: number;
  readonly from?: number;
  readonly running?: true;
}

/**
 * Pointer dragging for *Not yet played*, among `rows` as drawn: the grip is
 * the only thing that picks a row up, so a press anywhere else on it still
 * selects and a finger on the page still scrolls it. A drop becomes the same
 * `before` / `after` a menu move sends (`dropPlacement`) and goes to `onDrop`,
 * which is the menu's own move path.
 *
 * The row picked up waits in its place, dimmed as a disabled control is, and
 * a line in the focus ring's colour marks the gap it would land in, drawn over
 * nothing: a row carried under the pointer would cover the very gap the
 * pointer names. Dropped, the row slides from its old place to its new one on
 * `transition-settle` — the motion tokens, which reduced motion zeroes —
 * lifted on the `lifted` rung (under the sticky chrome) over the rows it
 * passes.
 */
export const useEncounterDrag = ({
  rows,
  onDrop,
}: {
  readonly rows: ReadonlyArray<Encounter>;
  readonly onDrop: (encounterId: EncounterId, placement: EncounterPlacement) => void;
}) => {
  const elements = useRef(new Map<EncounterId, HTMLElement>());
  /** What the drop line is placed in: *Not yet played*'s section. */
  const list = useRef<HTMLElement>(null);
  const grab = useRef<Grab | undefined>(undefined);
  /** The row whose press last became a drag, so its click opens no menu. */
  const dragged = useRef<EncounterId | undefined>(undefined);
  const [dragging, setDragging] = useState<Dragging | undefined>();
  const [settling, setSettling] = useState<Settling | undefined>();

  /** Registers the list item a row is drawn in. */
  const register = useCallback((id: EncounterId, node: HTMLElement | null) => {
    if (node === null) elements.current.delete(id);
    else elements.current.set(id, node);
  }, []);

  const follow = () => {
    const at = grab.current;
    if (at === undefined) return;
    const spans = rows.flatMap((row) => {
      const box = elements.current.get(row.id)?.getBoundingClientRect();
      return box === undefined ? [] : [{ id: row.id, top: box.top, bottom: box.bottom }];
    });
    at.over = dropPlacement(spans, at.id, at.y);
    const line = at.over === undefined ? undefined : lineAt(spans, at.id, at.over);
    const top = list.current?.getBoundingClientRect().top;
    setDragging({
      id: at.id,
      line: line === undefined || top === undefined ? undefined : line - top,
    });
  };

  // The window scrolling under a still pointer (the auto-scroller, a wheel)
  // moves the list and not the pointer: find the gap under it again.
  const draggingId = dragging?.id;
  useEffect(() => {
    if (draggingId === undefined) return;
    const onScroll = () => follow();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  });

  // The settle is a FLIP: measure the row in its new place, draw it back where
  // it was let go, make the browser compute that, then let it go to rest.
  useLayoutEffect(() => {
    if (settling === undefined) return;
    const element = elements.current.get(settling.id);
    if (element === undefined) {
      setSettling(undefined);
      return;
    }
    if (settling.from === undefined) {
      const from = settling.releasedTop - element.getBoundingClientRect().top;
      setSettling(Math.abs(from) < 0.5 ? undefined : { ...settling, from });
    } else if (settling.running === undefined) {
      void element.getBoundingClientRect();
      setSettling({ ...settling, running: true });
    } else if ((element.getAnimations?.() ?? []).length === 0) {
      // No transition to wait for: reduced motion made it instant.
      setSettling(undefined);
    }
  }, [settling]);

  const provider: Provider = {
    sensors: SENSORS,
    plugins: PLUGINS,
    onDragStart: (event: DragStartEvent) => {
      const id = event.operation.source?.id as EncounterId | undefined;
      if (id === undefined) return;
      grab.current = { id, y: event.operation.position.current.y };
      dragged.current = id;
      setSettling(undefined);
      follow();
    },
    onDragMove: (event: DragMoveEvent) => {
      if (grab.current === undefined) return;
      // The event goes out before the operation's position moves: `to` is
      // where the pointer is now, `current` where it was.
      grab.current.y = (event.to ?? event.operation.position.current).y;
      follow();
    },
    onDragEnd: (event: DragEndEvent) => {
      const at = grab.current;
      grab.current = undefined;
      setDragging(undefined);
      if (at === undefined) return;
      const releasedTop = elements.current.get(at.id)?.getBoundingClientRect().top;
      if (releasedTop !== undefined) setSettling({ id: at.id, releasedTop });
      if (!event.canceled && at.over !== undefined) onDrop(at.id, at.over);
    },
  };

  return {
    provider,
    register,
    /** Whether this press on a row's grip was a drag, not a click. */
    wasDragged: (id: EncounterId) => dragged.current === id,
    /** A new press on a grip: whatever it becomes, it is not the last drag. */
    pressed: () => {
      dragged.current = undefined;
    },
    /** The row picked up, waiting in its place until it is dropped. */
    carried: (id: EncounterId) => dragging?.id === id,
    /** Drawn back where it was let go, then on its way to its place. */
    settling: (id: EncounterId): "from" | "running" | undefined =>
      settling?.id !== id || settling.from === undefined
        ? undefined
        : settling.running === true
          ? "running"
          : "from",
    onSettled: (id: EncounterId) => {
      if (settling?.id === id && settling.running === true) setSettling(undefined);
    },
    /**
     * How far a dropped row is drawn from its new place, for its
     * `--row-shift`: from its old place, then nothing.
     */
    shift: (id: EncounterId): number | undefined => {
      if (settling?.id !== id || settling.from === undefined) return undefined;
      return settling.running === true ? 0 : settling.from;
    },
    /** The element the drop line is placed in, which it is drawn after. */
    list,
    /** How far down `list` the drop line is drawn, while a drop would move a row. */
    line: dragging?.line,
  };
};
