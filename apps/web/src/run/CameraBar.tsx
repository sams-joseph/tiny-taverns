import { Button, Icon, Toggle } from "@taverns/ui";
import type { Camera } from "./BoardCanvas";
import type { BoardView } from "./view";

/**
 * The canvas's camera, in the stage's bottom-left corner (`Encounter
 * Canvas.dc.html`): zoom out, the zoom against the view the canvas opened on
 * (a press on it fits the board again), zoom in, centre on whoever is up, and
 * the view, tilted or straight down (`view.ts`). The wheel, a pinch and a drag
 * still do all of it but the tilt; these are for a DM without a wheel.
 */
export function CameraBar({
  camera,
  view,
  onView,
  onCentre,
}: {
  readonly camera: Camera;
  readonly view: BoardView;
  readonly onView: (view: BoardView) => void;
  /** Absent while nobody is up, or whoever is has no square. */
  readonly onCentre: (() => void) | undefined;
}) {
  return (
    <div data-slot="run-camera" className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="size-control-sm"
        aria-label="Zoom out"
        onClick={camera.zoomOut}
      >
        <Icon name="minus" size={14} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Zoom ${String(Math.round(camera.scale * 100))}%, fit the board`}
        className="w-12 px-0 font-mono text-mono text-muted-foreground"
        onClick={camera.fit}
      >
        {Math.round(camera.scale * 100)}%
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-control-sm"
        aria-label="Zoom in"
        onClick={camera.zoomIn}
      >
        <Icon name="plus" size={14} />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-control-sm"
        aria-label="Centre on whoever is up"
        disabled={onCentre === undefined}
        onClick={onCentre}
      >
        <Icon name="locate-fixed" size={14} />
      </Button>
      <Toggle
        size="sm"
        className="ml-auto"
        aria-label="Isometric"
        title={view === "iso" ? "Isometric view: press to look straight down" : "Tilt the board"}
        pressed={view === "iso"}
        onPressedChange={(tilted) => onView(tilted ? "iso" : "top")}
      >
        <Icon name="layers" size={14} />
      </Toggle>
    </div>
  );
}
