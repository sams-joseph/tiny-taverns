import { Button, Icon } from "@taverns/ui";
import type { Camera } from "./BoardCanvas";

/**
 * The canvas's camera, in the stage's bottom-left corner (`Encounter
 * Canvas.dc.html`): zoom out, the zoom against the view the canvas opened on
 * (a press on it fits the board again), zoom in, and centre on whoever is up.
 * The wheel, a pinch and a drag do the same; these are for a DM without a wheel.
 */
export function CameraBar({
  camera,
  onCentre,
}: {
  readonly camera: Camera;
  /** Absent while nobody is up, or whoever is has no square. */
  readonly onCentre: (() => void) | undefined;
}) {
  return (
    <div data-slot="run-camera" className="flex items-center gap-1">
      <Button
        variant="ghost"
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
        variant="ghost"
        size="icon"
        className="size-control-sm"
        aria-label="Zoom in"
        onClick={camera.zoomIn}
      >
        <Icon name="plus" size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-control-sm"
        aria-label="Centre on whoever is up"
        disabled={onCentre === undefined}
        onClick={onCentre}
      >
        <Icon name="locate-fixed" size={14} />
      </Button>
    </div>
  );
}
