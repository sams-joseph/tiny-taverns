import { Button, Icon } from "@taverns/ui";
import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import {
  type CropView,
  MAX_ZOOM,
  type PictureSize,
  cropOf,
  panBy,
  placementOf,
  zoomTo,
} from "./crop";

/** How far one arrow key moves the picture, as a fraction of the frame. */
const KEY_STEP = 0.05;
/** How far one zoom button or key goes. */
const ZOOM_STEP = 0.25;

/**
 * A frame of the kind's aspect over the chosen picture: drag (or the arrow
 * keys) to move it, the slider (or `+` and `-`) to zoom. The frame shows
 * exactly the crop that will be sent, because both come from `cropOf` over
 * the same view; the picture is placed in percentages, so nothing is measured
 * but a drag's distance against the frame it happens in.
 */
export function Cropper({
  label,
  src,
  picture,
  aspect,
  view,
  onChange,
}: {
  readonly label: string;
  readonly src: string;
  readonly picture: PictureSize;
  readonly aspect: number;
  readonly view: CropView;
  readonly onChange: (view: CropView) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const last = useRef<{ readonly x: number; readonly y: number }>(undefined);
  const placement = placementOf(cropOf(picture, aspect, view));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    last.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const from = last.current;
    const bounds = frame.current?.getBoundingClientRect();
    if (from === undefined || bounds === undefined || bounds.width === 0) return;
    last.current = { x: event.clientX, y: event.clientY };
    onChange(
      panBy(
        picture,
        aspect,
        view,
        (event.clientX - from.x) / bounds.width,
        (event.clientY - from.y) / bounds.height,
      ),
    );
  };
  const endDrag = () => {
    last.current = undefined;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      onChange(panBy(picture, aspect, view, move[0], move[1]));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      onChange(zoomTo(picture, aspect, view, view.zoom + ZOOM_STEP));
    } else if (event.key === "-") {
      event.preventDefault();
      onChange(zoomTo(picture, aspect, view, view.zoom - ZOOM_STEP));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-heading">{label}</p>
      <div
        ref={frame}
        role="group"
        tabIndex={0}
        aria-label={`${label}: drag or use the arrow keys to move the picture, plus and minus to zoom`}
        data-slot="cropper-frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        style={{ "--crop-aspect": String(aspect) } as CSSProperties}
        className="relative aspect-(--crop-aspect) w-full cursor-grab touch-none overflow-hidden rounded-control border border-hairline bg-surface-sunken outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <img
          src={src}
          alt=""
          draggable={false}
          style={
            {
              "--crop-width": placement.width,
              "--crop-height": placement.height,
              "--crop-left": placement.left,
              "--crop-top": placement.top,
            } as CSSProperties
          }
          className="pointer-events-none absolute top-(--crop-top) left-(--crop-left) h-(--crop-height) w-(--crop-width) max-w-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-control-sm"
          aria-label={`Zoom ${label.toLowerCase()} out`}
          disabled={view.zoom <= 1}
          onClick={() => onChange(zoomTo(picture, aspect, view, view.zoom - ZOOM_STEP))}
        >
          <Icon name="minus" size={14} />
        </Button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={view.zoom}
          aria-label={`Zoom ${label.toLowerCase()}`}
          onChange={(event) =>
            onChange(zoomTo(picture, aspect, view, Number(event.currentTarget.value)))
          }
          className="min-w-0 flex-1 accent-accent"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-control-sm"
          aria-label={`Zoom ${label.toLowerCase()} in`}
          disabled={view.zoom >= MAX_ZOOM}
          onClick={() => onChange(zoomTo(picture, aspect, view, view.zoom + ZOOM_STEP))}
        >
          <Icon name="plus" size={14} />
        </Button>
      </div>
    </div>
  );
}
