import type { BoardDoorUpdate, LevelPartId, RunBoardLevel, RunLevelWall } from "@taverns/api";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
} from "@taverns/ui";

/**
 * The DM's hand on a fight's level, on the board over it: a switch on every
 * door and every light, where it stands. Pressing a door opens or closes it
 * (a locked one unlocks); its ⋯ locks or unlocks it and, for a secret door,
 * reveals it to the table or hides it again. Pressing a light lights or
 * snuffs it. Each press is the live write (`runs.updateDoor`,
 * `runs.updateLight`), and the board shows the server's answer, and every
 * other tab's after the doorbell's re-read.
 *
 * DOM over the board, not a pick in the renderer, so it is a button a
 * keyboard reaches and a test presses, and the board canvas's pan never
 * starts on it. Each switch is a fraction of a square in the board's own
 * units, so it scales with the board as the tokens do.
 */
export function LevelSwitches({
  level,
  columns,
  rows,
  disabled,
  onDoor,
  onLight,
}: {
  readonly level: RunBoardLevel;
  readonly columns: number;
  readonly rows: number;
  readonly disabled: boolean;
  readonly onDoor: (wallId: LevelPartId, update: Omit<BoardDoorUpdate, "requestId">) => void;
  readonly onLight: (lightId: LevelPartId, lit: boolean) => void;
}) {
  const doors = level.walls.filter((wall) => wall.kind !== "wall");
  return (
    <div data-slot="level-switches" className="pointer-events-none absolute inset-0">
      {doors.map((door) => (
        <DoorSwitch
          key={door.id}
          door={door}
          left={percent((door.x1 + door.x2) / 2 / columns)}
          top={percent((door.y1 + door.y2) / 2 / rows)}
          width={percent(DOOR_SQUARES / columns)}
          disabled={disabled}
          onDoor={onDoor}
        />
      ))}
      {level.lights.map((light) => {
        const label = light.lit ? "Snuff the light" : "Light the light";
        return (
          <Button
            key={light.id}
            variant="secondary"
            size="icon"
            data-light={light.id}
            aria-label={label}
            title={label}
            aria-pressed={light.lit}
            disabled={disabled}
            style={{
              left: percent(light.x / columns),
              top: percent(light.y / rows),
              width: percent(LIGHT_SQUARES / columns),
            }}
            className={cn(
              "pointer-events-auto absolute aspect-square h-auto min-h-0 min-w-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-strong p-0",
              light.lit ? "text-accent-ink" : "text-muted-foreground",
            )}
            onClick={() => onLight(light.id, !light.lit)}
          >
            <Icon name="flame" size={14} />
          </Button>
        );
      })}
    </div>
  );
}

/** How much of a square a door's and a light's switch spans: the board's own units. */
const DOOR_SQUARES = 0.5;
const LIGHT_SQUARES = 0.4;

/** A share of the board as a CSS percentage. */
const percent = (share: number) => `${String(share * 100)}%`;

const noun = (door: RunLevelWall) => (door.kind === "secretDoor" ? "the secret door" : "the door");

function DoorSwitch({
  door,
  left,
  top,
  width,
  disabled,
  onDoor,
}: {
  readonly door: RunLevelWall;
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly disabled: boolean;
  readonly onDoor: (wallId: LevelPartId, update: Omit<BoardDoorUpdate, "requestId">) => void;
}) {
  const state = door.doorState ?? "closed";
  const press =
    state === "open"
      ? { label: `Close ${noun(door)}`, doorState: "closed" as const }
      : state === "locked"
        ? { label: `Unlock ${noun(door)}`, doorState: "closed" as const }
        : { label: `Open ${noun(door)}`, doorState: "open" as const };
  const secret = door.kind === "secretDoor";
  const more = `More for ${noun(door)}`;
  return (
    <div
      data-wall={door.id}
      data-door-state={state}
      style={{ left, top, width }}
      className="group pointer-events-none absolute aspect-square -translate-x-1/2 -translate-y-1/2"
    >
      <Button
        variant="secondary"
        size="icon"
        aria-label={press.label}
        title={press.label}
        disabled={disabled}
        className={cn(
          "pointer-events-auto size-full min-h-0 min-w-0 rounded-full border p-0",
          secret ? "border-magic text-magic" : "border-strong",
          state === "locked" && "text-danger-ink",
        )}
        onClick={() => onDoor(door.id, { doorState: press.doorState })}
      >
        <Icon
          name={state === "locked" ? "lock" : state === "open" ? "door-open" : "brick-wall"}
          size={14}
        />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={more}
          title={more}
          disabled={disabled}
          render={
            <Button
              variant="secondary"
              size="icon"
              className="pointer-events-auto absolute -top-1/3 -right-1/3 size-1/2 min-h-0 min-w-0 rounded-full p-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
            />
          }
        >
          <Icon name="ellipsis" size={10} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => onDoor(door.id, { doorState: state === "locked" ? "closed" : "locked" })}
          >
            {state === "locked" ? `Unlock ${noun(door)}` : `Lock ${noun(door)}`}
          </DropdownMenuItem>
          {secret && (
            <DropdownMenuItem onClick={() => onDoor(door.id, { revealed: !door.revealed })}>
              {door.revealed ? "Hide it from the table" : "Reveal it to the table"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
