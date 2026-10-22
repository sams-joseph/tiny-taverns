/**
 * The editor's tools, their keys and what each says it does. One list, so the
 * rail, the key map and the hint agree.
 */
export type ToolId =
  | "select"
  | "floor"
  | "wall"
  | "room"
  | "door"
  | "prop"
  | "light"
  | "region"
  | "erase"
  | "party";

export interface ToolSpec {
  readonly id: ToolId;
  /** The key that picks it, lower case. */
  readonly key: string;
  readonly label: string;
  /** What the hint line says while it is in hand. Keys in `[brackets]` draw as keys. */
  readonly hint: string;
  /** Starts a new group on the rail. */
  readonly group?: true;
}

export const TOOLS: ReadonlyArray<ToolSpec> = [
  {
    id: "select",
    key: "v",
    label: "Select and move",
    hint: "Click to select, drag to move. [Q] rotates, [Del] deletes. Right-drag or [Space]-drag pans; the wheel zooms; [F] fits.",
  },
  {
    id: "floor",
    key: "b",
    label: "Floor",
    hint: "Drag to paint. [Shift]-drag fills a rectangle. [[] and []] change the brush.",
  },
  {
    id: "wall",
    key: "w",
    label: "Wall",
    hint: "Click corner to corner; walls snap to the grid. [Shift] snaps to half squares. [Esc] or right-click finishes.",
  },
  {
    id: "room",
    key: "r",
    label: "Room",
    hint: "Drag a rectangle: floor in the chosen material, walls all round. Then add doors.",
  },
  {
    id: "door",
    key: "d",
    label: "Door",
    hint: "Click a grid edge to cut a door into the wall there. Click a door to open or shut it; [Shift]-click makes it secret.",
  },
  {
    id: "prop",
    key: "p",
    label: "Prop",
    hint: "Click to place. [Q] rotates. Each prop carries its 5e flags; select it to change them.",
  },
  {
    id: "light",
    key: "l",
    label: "Light",
    hint: "Click to place, at a square's centre ([Shift] for anywhere). Radii are the 5e bright and dim feet.",
  },
  {
    id: "region",
    key: "a",
    label: "Region",
    hint: "Drag to paint the chosen region over squares. [Shift]-drag takes squares out of it.",
  },
  {
    id: "erase",
    key: "e",
    label: "Erase",
    group: true,
    hint: "Click or drag over walls, doors, props and lights to delete them; over bare floor to clear it.",
  },
  {
    id: "party",
    key: "t",
    label: "View as the party",
    group: true,
    hint: "Place up to four viewers and drag them. What they see together is lit, what they have seen stays dim, the rest is unknown. Hover a square for its cover.",
  },
];

export const toolSpec = (id: ToolId): ToolSpec => TOOLS.find((tool) => tool.id === id) ?? TOOLS[0]!;

/** How many viewers "view as" places. */
export const VIEWERS_MAX = 4;

/** The brush's sizes: 1 is one square, 4 is a 7×7. */
export const BRUSH_MIN = 1;
export const BRUSH_MAX = 4;
