import type { LocationId, LocationImages, LocationKind, LocationPin } from "@taverns/api";
import { Badge, Button, EmptyState, Icon, Loading } from "@taverns/ui";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { locationKindLabel } from "./kind";

/** What every read of a place carries that the map draws. */
export interface MapPlace {
  readonly id: LocationId;
  readonly name: string;
  readonly kind: LocationKind;
  readonly pin: LocationPin | null;
  readonly image: LocationImages | null;
  readonly imagePending: boolean;
}

/** The most a map is magnified before zooming further opens the place under the pointer. */
const MAX_SCALE = 4;
/** How far one wheel notch magnifies. */
const WHEEL_STEP = 1.15;
/** How close to a pin, as a fraction of the map, zooming past the most opens it. */
const NEAR_PIN = 0.08;
/** How far a press may travel and still be a click rather than a drag, in pixels. */
const CLICK_SLOP = 4;

interface View {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

const WHOLE: View = { scale: 1, x: 0, y: 0 };

/** Keep the magnified picture covering its frame, so it cannot be dragged off. */
const clampView = (view: View, width: number, height: number): View => {
  const scale = Math.min(MAX_SCALE, Math.max(1, view.scale));
  return {
    scale,
    x: Math.min(0, Math.max(width - width * scale, view.x)),
    y: Math.min(0, Math.max(height - height * scale, view.y)),
  };
};

/** A point on the picture, as fractions of it, from a pointer's place on screen. */
const fractionAt = (layer: HTMLElement, clientX: number, clientY: number): LocationPin => {
  const box = layer.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (clientX - box.left) / box.width)),
    y: Math.min(1, Math.max(0, (clientY - box.top) / box.height)),
  };
};

/** Whether this element's transitions take any time at all; reduced motion zeroes them. */
const animates = (element: HTMLElement): boolean =>
  getComputedStyle(element)
    .transitionDuration.split(",")
    .some((duration) => Number.parseFloat(duration) > 0);

/**
 * A place's picture with the places inside it pinned on it — the map one
 * zooms through. Scrolling or pinching magnifies it around the pointer and a
 * drag pans it; zooming past the most with the pointer on a pin, or pressing a
 * pin, glides into that pin and opens the map inside it (`onEnter`); zooming
 * out past the whole picture opens the map around it (`onUp`).
 *
 * With `editing`, a pin is dragged to move it, and a place waiting to be put
 * on the map (`editing.placing`) is put where the map is next pressed. Every
 * move is a fraction of the whole picture, which is never cropped.
 */
export function PlaceMap({
  place,
  inside,
  onEnter,
  onUp,
  upLabel,
  editing,
  party,
}: {
  readonly place: MapPlace;
  /** The places directly inside this one that the reader may see. */
  readonly inside: ReadonlyArray<MapPlace>;
  readonly onEnter?: (child: MapPlace) => void;
  readonly onUp?: () => void;
  /** The parent's name, for the button that zooms out to it. */
  readonly upLabel?: string;
  /**
   * Where the party is, seen from this map: here, on this place itself, or in
   * the place one of its pins stands for (the party may be deeper inside it).
   */
  readonly party?: { readonly here: true } | { readonly in: LocationId } | undefined;
  readonly editing?: {
    readonly onPin: (child: MapPlace, pin: LocationPin) => void;
    /** A place to put on the map at the next press, chosen from outside it. */
    readonly placing: MapPlace | undefined;
    readonly onPlaced: () => void;
  };
}) {
  const frame = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(WHOLE);
  const [gliding, setGliding] = useState(false);
  /** A pin being dragged: where it is now, before the move is written. */
  const [dragged, setDragged] = useState<{ id: LocationId; pin: LocationPin }>();
  const press = useRef<{
    readonly x: number;
    readonly y: number;
    readonly view: View;
    readonly pin?: MapPlace;
    moved: boolean;
  }>(undefined);

  // A new map opens whole.
  useEffect(() => {
    setView(WHOLE);
    setGliding(false);
  }, [place.id]);

  const size = () => {
    const box = frame.current?.getBoundingClientRect();
    return { width: box?.width ?? 0, height: box?.height ?? 0 };
  };

  /** Glide toward a pin, then open the map inside it. */
  const enter = useCallback(
    (child: MapPlace) => {
      if (onEnter === undefined) return;
      const { width, height } = size();
      if (child.pin === null || layer.current === null || width === 0) {
        onEnter(child);
        return;
      }
      const scale = MAX_SCALE;
      setGliding(true);
      setView(
        clampView(
          {
            scale,
            x: width / 2 - child.pin.x * width * scale,
            y: height / 2 - child.pin.y * height * scale,
          },
          width,
          height,
        ),
      );
      const element = layer.current;
      if (!animates(element)) {
        onEnter(child);
        return;
      }
      element.addEventListener("transitionend", () => onEnter(child), { once: true });
    },
    [onEnter],
  );

  const zoomBy = (factor: number, at?: { x: number; y: number }) => {
    const { width, height } = size();
    const origin = at ?? { x: width / 2, y: height / 2 };
    setGliding(false);
    setView((current) => {
      const scale = Math.min(MAX_SCALE, Math.max(1, current.scale * factor));
      const ratio = scale / current.scale;
      return clampView(
        {
          scale,
          x: origin.x - (origin.x - current.x) * ratio,
          y: origin.y - (origin.y - current.y) * ratio,
        },
        width,
        height,
      );
    });
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (frame.current === null || layer.current === null) return;
    const box = frame.current.getBoundingClientRect();
    const at = { x: event.clientX - box.left, y: event.clientY - box.top };
    if (event.deltaY < 0) {
      if (view.scale >= MAX_SCALE) {
        const point = fractionAt(layer.current, event.clientX, event.clientY);
        const near = inside
          .filter((child) => child.pin !== null)
          .map((child) => ({
            child,
            distance: Math.hypot(child.pin!.x - point.x, child.pin!.y - point.y),
          }))
          .filter((candidate) => candidate.distance <= NEAR_PIN)
          .sort((a, b) => a.distance - b.distance)[0];
        if (near !== undefined) enter(near.child);
        return;
      }
      zoomBy(WHEEL_STEP, at);
    } else {
      if (view.scale <= 1 && onUp !== undefined) {
        onUp();
        return;
      }
      zoomBy(1 / WHEEL_STEP, at);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>, pin?: MapPlace) => {
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    press.current = {
      x: event.clientX,
      y: event.clientY,
      view,
      ...(pin === undefined ? {} : { pin }),
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pressed = press.current;
    if (pressed === undefined || layer.current === null) return;
    const dx = event.clientX - pressed.x;
    const dy = event.clientY - pressed.y;
    if (!pressed.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    pressed.moved = true;
    if (pressed.pin !== undefined && editing !== undefined) {
      setDragged({
        id: pressed.pin.id,
        pin: fractionAt(layer.current, event.clientX, event.clientY),
      });
      return;
    }
    const { width, height } = size();
    setGliding(false);
    setView(
      clampView({ ...pressed.view, x: pressed.view.x + dx, y: pressed.view.y + dy }, width, height),
    );
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pressed = press.current;
    press.current = undefined;
    if (pressed === undefined || layer.current === null) return;
    if (pressed.pin !== undefined) {
      if (pressed.moved && editing !== undefined && dragged !== undefined) {
        editing.onPin(pressed.pin, dragged.pin);
      } else if (!pressed.moved) {
        enter(pressed.pin);
      }
      return;
    }
    if (!pressed.moved && editing?.placing !== undefined) {
      editing.onPin(editing.placing, fractionAt(layer.current, event.clientX, event.clientY));
      editing.onPlaced();
    }
  };

  // The written pin replaces the dragged one once the read has it.
  useEffect(() => {
    if (dragged === undefined) return;
    const written = inside.find((child) => child.id === dragged.id)?.pin;
    if (written !== null && written?.x === dragged.pin.x && written?.y === dragged.pin.y) {
      setDragged(undefined);
    }
  }, [dragged, inside]);

  const partyHere = party !== undefined && "here" in party;
  const partyIn = party !== undefined && "in" in party ? party.in : undefined;
  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {partyHere && (
        <Badge variant="secondary">
          <Icon name="users" size={12} />
          The party is here
        </Badge>
      )}
      {onUp !== undefined && (
        <Button variant="outline" size="sm" onClick={onUp}>
          <Icon name="arrow-up" size={14} />
          {upLabel === undefined ? "Out" : `Out to ${upLabel}`}
        </Button>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Zoom in"
          disabled={place.image === null || view.scale >= MAX_SCALE}
          onClick={() => zoomBy(WHEEL_STEP * WHEEL_STEP)}
        >
          <Icon name="plus" size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Zoom out"
          disabled={place.image === null || view.scale <= 1}
          onClick={() => zoomBy(1 / (WHEEL_STEP * WHEEL_STEP))}
        >
          <Icon name="minus" size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Show the whole map"
          disabled={place.image === null || view === WHOLE}
          onClick={() => setView(WHOLE)}
        >
          <Icon name="locate-fixed" size={14} />
        </Button>
      </div>
    </div>
  );

  if (place.image === null) {
    return (
      <div className="flex flex-col gap-3">
        {toolbar}
        {place.imagePending ? (
          <Loading label="Hob is drawing it…" />
        ) : (
          <EmptyState icon="map" title="No picture yet">
            The places inside it are listed below until it has one.
          </EmptyState>
        )}
      </div>
    );
  }

  const placing = editing?.placing;
  return (
    <div className="flex flex-col gap-3">
      {toolbar}
      <div
        ref={frame}
        role="application"
        aria-label={`Map of ${place.name}`}
        data-slot="place-map"
        data-placing={placing === undefined ? undefined : ""}
        className="relative aspect-(--map-aspect) w-full touch-none overflow-hidden rounded-card border border-hairline bg-surface-sunken select-none data-placing:cursor-crosshair"
        style={
          {
            "--map-aspect": `${String(place.image.width)} / ${String(place.image.height)}`,
          } as CSSProperties
        }
        onWheel={onWheel}
        onPointerDown={(event) => onPointerDown(event)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          ref={layer}
          data-gliding={gliding ? "" : undefined}
          className="absolute inset-0 origin-top-left [transform:translate(var(--pan-x),var(--pan-y))_scale(var(--zoom))] data-gliding:transition-zoom"
          style={
            {
              "--pan-x": `${String(view.x)}px`,
              "--pan-y": `${String(view.y)}px`,
              "--zoom": String(view.scale),
            } as CSSProperties
          }
        >
          <img
            src={place.image.fullUrl}
            alt={`The ${locationKindLabel(place.kind).toLowerCase()} ${place.name}`}
            draggable={false}
            className="pointer-events-none size-full"
          />
          {inside.map((child) => {
            const pin = dragged?.id === child.id ? dragged.pin : child.pin;
            if (pin === null) return null;
            return (
              <div
                key={child.id}
                role="button"
                tabIndex={0}
                aria-label={
                  editing === undefined
                    ? `Open ${child.name}`
                    : `${child.name}: drag to move, press to open`
                }
                data-slot="place-pin"
                data-party={child.id === partyIn ? "" : undefined}
                className="absolute top-(--pin-y) left-(--pin-x) flex origin-bottom [transform:translate(-50%,-100%)_scale(var(--unzoom))] flex-col items-center gap-0.5 outline-none focus-visible:ring-focus"
                style={
                  {
                    "--pin-x": `${String(pin.x * 100)}%`,
                    "--pin-y": `${String(pin.y * 100)}%`,
                    "--unzoom": String(1 / view.scale),
                  } as CSSProperties
                }
                onPointerDown={(event) => onPointerDown(event, child)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    enter(child);
                  }
                }}
              >
                <span className="rounded-pill border border-strong bg-surface-raised px-2 py-0.5 text-caption leading-none font-semibold whitespace-nowrap text-heading">
                  {child.name}
                </span>
                {child.id === partyIn && (
                  <span className="flex items-center gap-1 rounded-pill bg-accent px-2 py-0.5 text-caption leading-none font-semibold text-accent-foreground">
                    <Icon name="users" size={11} />
                    Party
                  </span>
                )}
                <Icon name="map-pin" size={22} className="text-accent" />
              </div>
            );
          })}
        </div>
      </div>
      {placing !== undefined && (
        <p className="text-caption leading-body text-muted-foreground">
          Press the map where {placing.name} stands.
        </p>
      )}
    </div>
  );
}
