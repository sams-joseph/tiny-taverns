import {
  cover,
  LIGHT_PRESETS,
  propFootprint,
  sightSegments,
  type LayoutProp,
  type LevelCover,
  type LevelLayout,
  type LevelLightTone,
  type LevelRegionKind,
  type SightSegment,
} from "@taverns/api";
import { lengthOf, type LevelDocument, type Point, type Segment } from "./document";
import { brushSquares, propPlacement, rectSquares, lightSpot } from "./edits";
import { clampToBoard, nearestEdge, pick, snapVertex, type Hit, type Viewer } from "./picking";
import { partyReader } from "./scene";
import type { EditorState } from "./store";

/**
 * The marks the editor draws over the lit level: what is selected, what the
 * pointer would do, the DM's view of secret doors, low walls, lights and
 * regions, and the party's viewers. Pure: `renderer.ts` turns each mark into
 * a mesh, batching marks of one colour.
 */

/** A semantic colour from the design system, read by the renderer at draw time. */
export type MarkColour = "accent" | "danger" | "success" | "magic" | "info" | "muted";

export type Mark =
  | {
      readonly type: "strip";
      readonly segments: ReadonlyArray<Segment>;
      readonly width: number;
      readonly colour: MarkColour;
      readonly opacity: number;
    }
  | {
      readonly type: "ring";
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly width: number;
      readonly colour: MarkColour;
      readonly opacity: number;
    }
  | {
      readonly type: "squares";
      readonly squares: ReadonlyArray<number>;
      readonly columns: number;
      readonly colour: MarkColour;
      readonly opacity: number;
    }
  | {
      readonly type: "light";
      readonly x: number;
      readonly y: number;
      readonly tone: LevelLightTone;
    }
  | { readonly type: "viewer"; readonly viewer: Viewer; readonly index: number }
  | { readonly type: "ghost"; readonly prop: LayoutProp };

/** A region kind's colour on the editor's overlay. */
export const REGION_COLOUR: Readonly<Record<LevelRegionKind, MarkColour>> = {
  difficult: "info",
  magicalDarkness: "magic",
  heavyObscurement: "muted",
  hazard: "accent",
  trap: "danger",
};

/** Break a segment into dashes `dash` squares long with gaps as long. */
export const dashed = (s: Segment, dash = 0.18): Array<Segment> => {
  const length = lengthOf(s);
  const out: Array<Segment> = [];
  for (let t = 0; t < length; t += dash * 2) {
    const a = t / length;
    const b = Math.min(length, t + dash) / length;
    out.push({
      x1: s.x1 + (s.x2 - s.x1) * a,
      y1: s.y1 + (s.y2 - s.y1) * a,
      x2: s.x1 + (s.x2 - s.x1) * b,
      y2: s.y1 + (s.y2 - s.y1) * b,
    });
  }
  return out;
};

const box = (x: number, y: number, w: number, h: number): Array<Segment> => [
  { x1: x, y1: y, x2: x + w, y2: y },
  { x1: x + w, y1: y, x2: x + w, y2: y + h },
  { x1: x + w, y1: y + h, x2: x, y2: y + h },
  { x1: x, y1: y + h, x2: x, y2: y },
];

/** The edges round a set of squares, where a square meets one not in the set. */
export const outline = (squares: ReadonlyArray<number>, columns: number): Array<Segment> => {
  const set = new Set(squares);
  const out: Array<Segment> = [];
  for (const at of squares) {
    const column = at % columns;
    const row = Math.floor(at / columns);
    const has = (c: number, r: number) => c >= 0 && c < columns && set.has(r * columns + c);
    if (!has(column, row - 1)) out.push({ x1: column, y1: row, x2: column + 1, y2: row });
    if (!has(column, row + 1)) out.push({ x1: column, y1: row + 1, x2: column + 1, y2: row + 1 });
    if (!has(column - 1, row)) out.push({ x1: column, y1: row, x2: column, y2: row + 1 });
    if (!has(column + 1, row)) out.push({ x1: column + 1, y1: row, x2: column + 1, y2: row + 1 });
  }
  return out;
};

/** Width of a wall drawn as a preview, in squares (the wall's own stone). */
const WALL_WIDTH = 0.32;

/**
 * The DM's marks on a level, which the party never sees: regions (secret ones
 * outlined), secret doors, low walls, locked doors, DM-only props, and, when
 * `lights` is asked for, each light's spot. The editor draws them under its
 * selection; the run board's play mode draws them without the lights, whose
 * switches are its own (`run/LevelBoard.tsx`).
 */
export const levelMarks = (
  doc: Pick<LevelLayout, "columns" | "walls" | "props" | "lights" | "regions">,
  { lights }: { readonly lights: boolean },
): Array<Mark> => {
  const marks: Array<Mark> = [];
  {
    for (const region of doc.regions) {
      marks.push({
        type: "squares",
        squares: region.squares,
        columns: doc.columns,
        colour: REGION_COLOUR[region.kind],
        opacity: region.secret ? 0.14 : 0.24,
      });
      if (region.secret) {
        marks.push({
          type: "strip",
          segments: outline(region.squares, doc.columns).flatMap((s) => dashed(s, 0.12)),
          width: 0.05,
          colour: "magic",
          opacity: 0.85,
        });
      }
    }
    const secret = doc.walls.filter((w) => w.kind === "secretDoor");
    if (secret.length > 0) {
      marks.push({
        type: "strip",
        segments: secret.flatMap((w) => dashed(w)),
        width: 0.1,
        colour: "magic",
        opacity: 0.95,
      });
    }
    const low = doc.walls.filter((w) => w.low);
    if (low.length > 0) {
      marks.push({
        type: "strip",
        segments: low.flatMap((w) => dashed(w, 0.1)),
        width: 0.06,
        colour: "info",
        opacity: 0.9,
      });
    }
    const locked = doc.walls.filter((w) => w.kind !== "wall" && w.doorState === "locked");
    for (const w of locked) {
      marks.push({
        type: "ring",
        x: (w.x1 + w.x2) / 2,
        y: (w.y1 + w.y2) / 2,
        radius: 0.12,
        width: 0.05,
        colour: "danger",
        opacity: 0.9,
      });
    }
    const dmOnly = doc.props.filter((p) => p.dmOnly);
    if (dmOnly.length > 0) {
      marks.push({
        type: "strip",
        segments: dmOnly.flatMap((p) => {
          const f = propFootprint(p);
          return box(f.column + 0.06, f.row + 0.06, f.width - 0.12, f.height - 0.12).flatMap((s) =>
            dashed(s, 0.1),
          );
        }),
        width: 0.04,
        colour: "magic",
        opacity: 0.7,
      });
    }
    if (lights) {
      for (const light of doc.lights) {
        marks.push({ type: "light", x: light.x, y: light.y, tone: light.tone });
      }
    }
  }
  return marks;
};

/** The marks that hold until the level or the selection changes. */
export const describeOverlay = (state: EditorState): ReadonlyArray<Mark> => {
  const doc = state.history.present;
  const marks: Array<Mark> = [];
  const viewing = state.tool === "party";
  if (!viewing) {
    marks.push(...levelMarks(doc, { lights: true }), ...selectionMarks(state));
  }
  if (viewing) {
    state.viewers.forEach((viewer, index) => {
      marks.push({ type: "viewer", viewer, index });
      const selected = state.selection?.type === "viewer" && state.selection.id === viewer.id;
      if (selected && viewer.darkvision > 0) {
        marks.push({
          type: "ring",
          x: viewer.column + 0.5,
          y: viewer.row + 0.5,
          radius: viewer.darkvision / doc.feetPerCell,
          width: 0.04,
          colour: "info",
          opacity: 0.35,
        });
      }
      if (selected) {
        marks.push({
          type: "ring",
          x: viewer.column + 0.5,
          y: viewer.row + 0.5,
          radius: 0.5,
          width: 0.06,
          colour: "accent",
          opacity: 1,
        });
      }
    });
  }
  return marks;
};

const selectionMarks = (state: EditorState): Array<Mark> => {
  const doc = state.history.present;
  const sel = state.selection;
  if (sel === null) return [];
  switch (sel.type) {
    case "prop": {
      const prop = doc.props.find((p) => p.id === sel.id);
      if (prop === undefined) return [];
      const f = propFootprint(prop);
      return [
        {
          type: "strip",
          segments: box(f.column, f.row, f.width, f.height).flatMap((s) => dashed(s)),
          width: 0.06,
          colour: "accent",
          opacity: 1,
        },
      ];
    }
    case "light": {
      const light = doc.lights.find((l) => l.id === sel.id);
      if (light === undefined) return [];
      return lightRings(light.x, light.y, light.bright, light.dim, doc.feetPerCell, 0.9);
    }
    case "wall": {
      const wall = doc.walls.find((w) => w.id === sel.id);
      if (wall === undefined) return [];
      return [{ type: "strip", segments: [wall], width: 0.14, colour: "accent", opacity: 0.8 }];
    }
    case "region": {
      const region = doc.regions.find((r) => r.id === sel.id);
      if (region === undefined) return [];
      return [
        {
          type: "strip",
          segments: outline(region.squares, doc.columns),
          width: 0.06,
          colour: "accent",
          opacity: 1,
        },
      ];
    }
    case "viewer":
      return [];
  }
};

const lightRings = (
  x: number,
  y: number,
  bright: number,
  dim: number,
  feetPerCell: number,
  opacity: number,
): Array<Mark> => [
  {
    type: "ring",
    x,
    y,
    radius: Math.max(0.05, bright / feetPerCell),
    width: 0.05,
    colour: "accent",
    opacity,
  },
  {
    type: "ring",
    x,
    y,
    radius: (bright + dim) / feetPerCell,
    width: 0.04,
    colour: "accent",
    opacity: opacity * 0.5,
  },
];

/** Where the pointer is, and whether Shift is held. */
export interface Pointer {
  readonly point: Point;
  readonly shift: boolean;
}

export interface HoverDescription {
  readonly marks: ReadonlyArray<Mark>;
  /** What the hint line says instead of the tool's own hint, or `null`. */
  readonly hint: string | null;
}

const NO_HOVER: HoverDescription = { marks: [], hint: null };

const COVER_WORDS: Readonly<Record<LevelCover, string>> = {
  none: "no cover",
  half: "half cover (+2 AC)",
  threeQuarters: "three-quarters cover (+5 AC)",
  total: "total cover (can't be targeted)",
};

const COVER_COLOUR: Readonly<Record<LevelCover, MarkColour>> = {
  none: "success",
  half: "accent",
  threeQuarters: "accent",
  total: "danger",
};

/** Segments the party's cover is read against, cached by document. */
const partySegments = new WeakMap<LevelDocument, ReadonlyArray<SightSegment>>();
const segmentsFor = (doc: LevelDocument) => {
  let known = partySegments.get(doc);
  if (known === undefined) {
    known = sightSegments(doc, { revealed: partyReader.revealed });
    partySegments.set(doc, known);
  }
  return known;
};

/**
 * The cover a square has from the party: from the selected viewer, else the
 * nearest one, by `cover()` over what blocks the party's sight.
 */
export const coverFromParty = (
  state: EditorState,
  square: { readonly column: number; readonly row: number },
): { readonly viewer: Viewer; readonly cover: LevelCover } | null => {
  const doc = state.history.present;
  if (state.viewers.length === 0) return null;
  const chosen =
    state.selection?.type === "viewer"
      ? state.viewers.find((v) => v.id === state.selection?.id)
      : undefined;
  const viewer =
    chosen ??
    [...state.viewers].sort(
      (a, b) =>
        Math.hypot(a.column - square.column, a.row - square.row) -
        Math.hypot(b.column - square.column, b.row - square.row),
    )[0]!;
  if (viewer.column === square.column && viewer.row === square.row) return null;
  return {
    viewer,
    cover: cover(
      { column: viewer.column, row: viewer.row },
      square,
      segmentsFor(doc),
      doc.props.filter((p) => !p.dmOnly),
    ),
  };
};

const hoverHighlight = (doc: LevelDocument, hit: Hit, colour: MarkColour): Array<Mark> => {
  if (hit.type === "prop") {
    const prop = doc.props.find((p) => p.id === hit.id);
    if (prop === undefined) return [];
    const f = propFootprint(prop);
    return [
      {
        type: "squares",
        squares: Array.from({ length: f.width * f.height }, (_, k) => {
          const c = f.column + (k % f.width);
          const r = f.row + Math.floor(k / f.width);
          return r * doc.columns + c;
        }),
        columns: doc.columns,
        colour,
        opacity: 0.18,
      },
    ];
  }
  if (hit.type === "wall") {
    const wall = doc.walls.find((w) => w.id === hit.id);
    return wall === undefined
      ? []
      : [{ type: "strip", segments: [wall], width: 0.16, colour, opacity: 0.6 }];
  }
  if (hit.type === "light") {
    const light = doc.lights.find((l) => l.id === hit.id);
    return light === undefined
      ? []
      : [
          {
            type: "ring",
            x: light.x,
            y: light.y,
            radius: 0.34,
            width: 0.06,
            colour,
            opacity: 0.9,
          },
        ];
  }
  if (hit.type === "region") {
    const region = doc.regions.find((r) => r.id === hit.id);
    return region === undefined
      ? []
      : [
          {
            type: "strip",
            segments: outline(region.squares, doc.columns),
            width: 0.05,
            colour,
            opacity: 0.7,
          },
        ];
  }
  return [];
};

const brushMarks = (doc: LevelDocument, point: Point, brush: number): Array<Mark> => {
  const squares = brushSquares(doc, point, brush);
  return [
    { type: "squares", squares, columns: doc.columns, colour: "accent", opacity: 0.18 },
    {
      type: "strip",
      segments: outline(squares, doc.columns),
      width: 0.05,
      colour: "accent",
      opacity: 0.9,
    },
  ];
};

/** What the pointer would do where it is, redrawn as it moves. */
export const describeHover = (state: EditorState, pointer: Pointer | null): HoverDescription => {
  if (pointer === null) return NO_HOVER;
  const doc = state.history.present;
  const p = pointer.point;
  const marks: Array<Mark> = [];
  let hint: string | null = null;
  const gesture = state.gesture;
  switch (state.tool) {
    case "floor": {
      if (gesture?.type === "rect") {
        marks.push({
          type: "squares",
          squares: rectSquares(doc, gesture.from, p),
          columns: doc.columns,
          colour: "accent",
          opacity: 0.22,
        });
      } else {
        marks.push(...brushMarks(doc, p, state.brush));
      }
      break;
    }
    case "region": {
      if (gesture?.type === "rect") break;
      marks.push(...brushMarks(doc, p, state.brush));
      break;
    }
    case "erase": {
      const hit = gesture === null ? pick(doc, p, ["light", "door", "prop", "wall"]) : null;
      if (hit !== null) marks.push(...hoverHighlight(doc, hit, "danger"));
      else marks.push(...brushMarks(doc, p, 1));
      break;
    }
    case "wall": {
      const v = clampToBoard(doc, snapVertex(p, pointer.shift));
      marks.push({
        type: "ring",
        x: v.x,
        y: v.y,
        radius: 0.12,
        width: 0.05,
        colour: "accent",
        opacity: 1,
      });
      if (state.wallChain !== null) {
        const s = { x1: state.wallChain.x, y1: state.wallChain.y, x2: v.x, y2: v.y };
        marks.push({
          type: "strip",
          segments: [s],
          width: WALL_WIDTH,
          colour: "accent",
          opacity: 0.55,
        });
        const feet = Math.round(lengthOf(s) * doc.feetPerCell);
        hint = `Wall · ${String(feet)} ft · click to add the next corner, [Esc] or right-click to finish`;
      }
      break;
    }
    case "room": {
      if (gesture?.type === "room") {
        const a = gesture.from;
        const b = clampToBoard(doc, snapVertex(p, false));
        marks.push({
          type: "strip",
          segments: box(a.x, a.y, b.x - a.x, b.y - a.y),
          width: WALL_WIDTH,
          colour: "accent",
          opacity: 0.6,
        });
        hint = `Room · ${String(Math.abs(b.x - a.x) * doc.feetPerCell)} × ${String(Math.abs(b.y - a.y) * doc.feetPerCell)} ft`;
      } else {
        const v = clampToBoard(doc, snapVertex(p, false));
        marks.push({
          type: "ring",
          x: v.x,
          y: v.y,
          radius: 0.12,
          width: 0.05,
          colour: "accent",
          opacity: 1,
        });
      }
      break;
    }
    case "door": {
      const hit = pick(doc, p, ["door"]);
      const wall = hit === null ? undefined : doc.walls.find((w) => w.id === hit.id);
      marks.push({
        type: "strip",
        segments: [wall ?? nearestEdge(p)],
        width: 0.2,
        colour: state.doorKind === "secretDoor" ? "magic" : "accent",
        opacity: 0.7,
      });
      break;
    }
    case "prop": {
      const at = propPlacement(doc, state.prop, state.rotation, p);
      marks.push({
        type: "ghost",
        prop: {
          id: "ghost",
          kind: state.prop,
          x: at.x,
          y: at.y,
          rotation: state.rotation,
          blocksMovement: null,
          blocksSight: null,
          cover: null,
          difficult: null,
          dmOnly: false,
        },
      });
      break;
    }
    case "light": {
      const spot = lightSpot(p, pointer.shift);
      const preset = LIGHT_PRESETS[state.light];
      marks.push(...lightRings(spot.x, spot.y, preset.bright, preset.dim, doc.feetPerCell, 0.8));
      break;
    }
    case "select": {
      if (gesture === null) {
        const hit = pick(doc, p);
        if (hit !== null) marks.push(...hoverHighlight(doc, hit, "accent"));
      }
      break;
    }
    case "party": {
      const square = { column: Math.floor(p.x), row: Math.floor(p.y) };
      const onLevel =
        square.column >= 0 &&
        square.row >= 0 &&
        square.column < doc.columns &&
        square.row < doc.rows;
      const overViewer = pick(doc, p, ["viewer"], state.viewers) !== null;
      if (onLevel && !overViewer && gesture === null) {
        const read = coverFromParty(state, square);
        if (read !== null) {
          marks.push({
            type: "strip",
            segments: [
              {
                x1: read.viewer.column + 0.5,
                y1: read.viewer.row + 0.5,
                x2: square.column + 0.5,
                y2: square.row + 0.5,
              },
            ],
            width: 0.04,
            colour: COVER_COLOUR[read.cover],
            opacity: 0.9,
          });
          hint = `${read.viewer.name} → this square: ${COVER_WORDS[read.cover]}`;
        }
      }
      break;
    }
  }
  return { marks, hint };
};
