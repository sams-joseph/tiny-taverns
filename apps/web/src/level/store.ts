import type {
  LayoutRegion,
  LevelAmbient,
  LevelPropKind,
  LevelRegionKind,
  LightPreset,
} from "@taverns/api";
import type { LevelDocument, Point } from "./document";
import {
  addLight,
  addProp,
  addRoom,
  addWall,
  brushSquares,
  cutDoor,
  lightSpot,
  moveProp,
  newLight,
  newProp,
  newRegion,
  paintFloor,
  paintRegion,
  propPlacement,
  rectSquares,
  removePart,
  rotateProp,
  setAmbient,
  setName,
  toggleDoor,
  toggleSecret,
  unpaintRegions,
  updateLight,
  type PartRef,
} from "./edits";
import {
  begin,
  canRedo,
  canUndo,
  commit,
  historyOf,
  mapAll,
  push,
  redo,
  undo,
  update,
  type History,
} from "./history";
import type { KeyAction } from "./keymap";
import type { Pointer } from "./overlay";
import { clampToBoard, nearestEdge, pick, snapVertex, type Hit, type Viewer } from "./picking";
import { describeVision, partyReader, type VisionPart } from "./scene";
import { BRUSH_MAX, BRUSH_MIN, VIEWERS_MAX, type ToolId } from "./tools";

/**
 * The editor's state and every way it changes: the working copy of the level
 * under an undo stack, the tool in hand and its settings, the selection, a
 * drag in progress, the party's scratch viewers, and saving.
 *
 * A plain object with listeners rather than React state, so a pointer move
 * reaches the canvas without re-rendering the editor's panels, and a test can
 * drive the whole editor without a DOM. React reads it through
 * `useSyncExternalStore` (`useEditor.ts`).
 */

/** A drag in progress. */
export type Gesture =
  | { readonly type: "paint" }
  | { readonly type: "rect"; readonly from: Point }
  | { readonly type: "erase" }
  | { readonly type: "room"; readonly from: Point }
  | { readonly type: "region"; readonly region: LayoutRegion; readonly remove: boolean }
  | {
      readonly type: "move";
      readonly target: Hit;
      /** Where the pointer took hold, relative to the thing's own position. */
      readonly dx: number;
      readonly dy: number;
    };

/**
 * Where the working copy stands against the server. `conflict`: a save was
 * refused because the level was saved elsewhere since it was read; the
 * editor stops saving on its own until the owner of the editor chooses
 * (`loadSaved`, `keepMine`).
 */
export type SaveStatus = "saved" | "dirty" | "saving" | "failed" | "conflict";

export interface EditorState {
  readonly history: History<LevelDocument>;
  /** Bumped by every change to the working copy, undo and redo included. */
  readonly revision: number;
  readonly tool: ToolId;
  /** A `LEVEL_MATERIALS` index; 0 (void) clears. */
  readonly material: number;
  readonly prop: LevelPropKind;
  readonly rotation: number;
  readonly light: LightPreset;
  readonly doorKind: "door" | "secretDoor";
  readonly brush: number;
  readonly regionKind: LevelRegionKind;
  readonly regionSecret: boolean;
  readonly selection: Hit | null;
  /** The last corner of the wall being drawn. */
  readonly wallChain: Point | null;
  readonly gesture: Gesture | null;
  /** The "view as" preview's viewers: editor scratch, never saved. */
  readonly viewers: ReadonlyArray<Viewer>;
  /** Bumped by "forget explored", which clears the party's memory. */
  readonly memoryEpoch: number;
  /** Draw the lighting (off shows the level as built, flat). */
  readonly lit: boolean;
  readonly grid: boolean;
  /** Bumped by F, which the canvas answers by fitting the level. */
  readonly fitRequest: number;
  readonly save: { readonly status: SaveStatus; readonly error: string | null };
}

/** How long after the last edit the level saves itself. */
export const SAVE_DELAY_MS = 1200;

/**
 * What the editor hands its owner to save; the owner answers with the version
 * the server kept, or rejects: with a `LevelSaveConflict` when the server
 * refused a stale version, with anything else when the save did not land.
 */
export type SaveLevel = (next: LevelDocument) => Promise<{ readonly version: number }>;

/** Read the level as the server holds it now, for the editor's way out of a conflict. */
export type LoadLevel = () => Promise<LevelDocument>;

/** A save refused because the level was saved elsewhere since it was read: the server's `Conflict`. */
export class LevelSaveConflict extends Error {
  override readonly name = "LevelSaveConflict";
}

const VIEWER_NAMES = ["Ash", "Bryn", "Cael", "Dov"] as const;
/** A new viewer's darkvision, alternating none and 60 ft, as the prototype's party did. */
const VIEWER_DARKVISION = [0, 60, 0, 60] as const;

type Listener = () => void;

/** Whether a point lies on one of the level's squares: the tools that place something ignore a click past the edge. */
const onBoard = (doc: Pick<LevelDocument, "columns" | "rows">, p: Point): boolean => {
  const column = Math.floor(p.x);
  const row = Math.floor(p.y);
  return column >= 0 && row >= 0 && column < doc.columns && row < doc.rows;
};

export class EditorStore {
  private state: EditorState;
  private readonly listeners = new Set<Listener>();
  private readonly hoverListeners = new Set<Listener>();
  private pointer: Pointer | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private inFlight = false;
  private againAfter = false;
  private savedRevision = 0;
  private visionCache: {
    doc: LevelDocument;
    viewers: ReadonlyArray<Viewer>;
    part: VisionPart;
  } | null = null;
  private memory: { epoch: number; size: number; seen: Uint8Array } | null = null;
  private viewerCount = 0;

  constructor(
    level: LevelDocument,
    private readonly onSave: SaveLevel,
    private readonly onLoad?: LoadLevel,
  ) {
    this.state = {
      history: historyOf(level),
      revision: 0,
      tool: "select",
      material: 1,
      prop: "crate",
      rotation: 0,
      light: "torch",
      doorKind: "door",
      brush: 1,
      regionKind: "difficult",
      regionSecret: false,
      selection: null,
      wallChain: null,
      gesture: null,
      viewers: [],
      memoryEpoch: 0,
      lit: true,
      grid: true,
      fitRequest: 0,
      save: { status: "saved", error: null },
    };
  }

  // ---------------------------------------------------------------------------
  // Reading

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): EditorState => this.state;

  get doc(): LevelDocument {
    return this.state.history.present;
  }

  /** The pointer, for what it would do where it is; changes without a state change. */
  readonly subscribeHover = (listener: Listener): (() => void) => {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  };

  readonly getPointer = (): Pointer | null => this.pointer;

  get canUndo(): boolean {
    return canUndo(this.state.history);
  }

  get canRedo(): boolean {
    return canRedo(this.state.history);
  }

  /**
   * What the party sees now and has seen, while "view as" is on; computed when
   * asked (the canvas asks once a frame at most) and kept until the level or
   * the viewers change.
   */
  vision(): { readonly part: VisionPart; readonly seen: Uint8Array } | null {
    const { tool, viewers, memoryEpoch } = this.state;
    if (tool !== "party") return null;
    const doc = this.doc;
    let cache = this.visionCache;
    const fresh = cache === null || cache.doc !== doc || cache.viewers !== viewers;
    if (fresh) {
      cache = { doc, viewers, part: describeVision(doc, viewers, partyReader) };
      this.visionCache = cache;
    }
    const size = doc.columns * doc.rows;
    if (this.memory === null || this.memory.epoch !== memoryEpoch || this.memory.size !== size) {
      this.memory = { epoch: memoryEpoch, size, seen: new Uint8Array(size) };
    }
    for (const square of cache!.part.sees) this.memory.seen[square] = 1;
    return { part: cache!.part, seen: this.memory.seen };
  }

  // ---------------------------------------------------------------------------
  // Changing

  private set(next: Partial<EditorState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  /** Replace the working copy's history, counting a change and scheduling a save. */
  private setHistory(history: History<LevelDocument>, extra: Partial<EditorState> = {}) {
    const changed = history.present !== this.state.history.present;
    const revision = changed ? this.state.revision + 1 : this.state.revision;
    const status: SaveStatus = this.inFlight
      ? "saving"
      : this.state.save.status === "conflict"
        ? "conflict"
        : revision !== this.savedRevision
          ? "dirty"
          : "saved";
    this.set({
      history,
      revision,
      ...(changed ? { save: { status, error: null } } : {}),
      ...extra,
    });
    if (changed) this.scheduleSave();
  }

  /** One edit, one undo step. */
  readonly edit = (
    change: (doc: LevelDocument) => LevelDocument,
    extra: Partial<EditorState> = {},
  ) => {
    this.setHistory(push(this.state.history, change(this.doc)), extra);
  };

  readonly undo = () => {
    if (this.state.gesture !== null) return;
    this.setHistory(undo(this.state.history), { selection: null, wallChain: null });
  };

  readonly redo = () => {
    if (this.state.gesture !== null) return;
    this.setHistory(redo(this.state.history), { selection: null, wallChain: null });
  };

  readonly setTool = (tool: ToolId) => {
    if (tool === this.state.tool) return;
    this.finishGesture();
    const crossing = (tool === "party") !== (this.state.tool === "party");
    this.set({
      tool,
      wallChain: null,
      gesture: null,
      ...(crossing ? { selection: null } : {}),
    });
    this.hoverChanged();
  };

  readonly choose = (
    patch: Partial<
      Pick<
        EditorState,
        | "material"
        | "prop"
        | "rotation"
        | "light"
        | "doorKind"
        | "brush"
        | "regionKind"
        | "regionSecret"
        | "lit"
        | "grid"
      >
    >,
  ) => {
    const next = { ...patch };
    if (next.prop !== undefined && next.prop !== this.state.prop) next.rotation = 0;
    // A new region kind paints a new region, not more of the selected one.
    const unselect =
      (next.regionKind !== undefined || next.regionSecret !== undefined) &&
      this.state.selection?.type === "region";
    this.set({ ...next, ...(unselect ? { selection: null } : {}) });
    this.hoverChanged();
  };

  readonly select = (selection: Hit | null) => {
    this.set({ selection });
    this.hoverChanged();
  };

  readonly setAmbient = (ambient: LevelAmbient) => this.edit((doc) => setAmbient(doc, ambient));

  readonly rename = (name: string) => {
    const trimmed = name.trim();
    if (trimmed === "") return;
    this.edit((doc) => setName(doc, trimmed));
  };

  /** Delete a part, clearing the selection if it was the part. */
  readonly remove = (part: PartRef) => {
    const selected = this.state.selection;
    this.edit((doc) => removePart(doc, part), {
      ...(selected?.id === part.id ? { selection: null } : {}),
    });
  };

  // ---------------------------------------------------------------------------
  // The party's viewers

  readonly addViewer = (column: number, row: number): Viewer | null => {
    if (this.state.viewers.length >= VIEWERS_MAX) return null;
    const used = new Set(this.state.viewers.map((v) => v.name));
    const slot = VIEWER_NAMES.findIndex((name) => !used.has(name));
    const index = slot < 0 ? this.state.viewers.length : slot;
    this.viewerCount += 1;
    const viewer: Viewer = {
      id: `viewer-${String(this.viewerCount)}`,
      name: VIEWER_NAMES[index] ?? `Viewer ${String(index + 1)}`,
      column,
      row,
      darkvision: VIEWER_DARKVISION[index] ?? 0,
    };
    this.set({
      viewers: [...this.state.viewers, viewer],
      selection: { type: "viewer", id: viewer.id },
    });
    return viewer;
  };

  readonly updateViewer = (id: string, patch: Partial<Omit<Viewer, "id">>) => {
    let changed = false;
    const viewers = this.state.viewers.map((viewer) => {
      if (viewer.id !== id) return viewer;
      const next = { ...viewer, ...patch };
      if (
        next.column === viewer.column &&
        next.row === viewer.row &&
        next.darkvision === viewer.darkvision &&
        next.name === viewer.name
      ) {
        return viewer;
      }
      changed = true;
      return next;
    });
    if (changed) this.set({ viewers });
  };

  readonly removeViewer = (id: string) => {
    this.set({
      viewers: this.state.viewers.filter((viewer) => viewer.id !== id),
      ...(this.state.selection?.id === id ? { selection: null } : {}),
    });
  };

  readonly forgetExplored = () => this.set({ memoryEpoch: this.state.memoryEpoch + 1 });

  // ---------------------------------------------------------------------------
  // Keys

  readonly key = (action: KeyAction) => {
    const { state } = this;
    switch (action.type) {
      case "tool":
        this.setTool(action.tool);
        return;
      case "undo":
        this.undo();
        return;
      case "redo":
        this.redo();
        return;
      case "save":
        void this.saveNow();
        return;
      case "escape":
        this.finishGesture();
        this.set({ wallChain: null, selection: null, gesture: null });
        this.hoverChanged();
        return;
      case "delete": {
        const sel = state.selection;
        if (sel === null) return;
        if (sel.type === "viewer") this.removeViewer(sel.id);
        else this.remove(sel);
        return;
      }
      case "rotate": {
        if (state.tool === "prop") {
          this.set({ rotation: (state.rotation + 1) % 4 });
          this.hoverChanged();
          return;
        }
        const sel = state.selection;
        if (sel?.type === "prop") this.edit((doc) => rotateProp(doc, sel.id));
        return;
      }
      case "brushDown":
        this.choose({ brush: Math.max(BRUSH_MIN, state.brush - 1) });
        return;
      case "brushUp":
        this.choose({ brush: Math.min(BRUSH_MAX, state.brush + 1) });
        return;
      case "toggleGrid":
        this.choose({ grid: !state.grid });
        return;
      case "fit":
        this.set({ fitRequest: state.fitRequest + 1 });
        return;
    }
  };

  // ---------------------------------------------------------------------------
  // The pointer, in level squares. Panning is the canvas's own (`LevelCanvas.tsx`).

  private hoverChanged() {
    for (const listener of this.hoverListeners) listener();
  }

  readonly hover = (pointer: Pointer | null) => {
    this.pointer = pointer;
    this.hoverChanged();
  };

  /** Start a drag that is one undo step. */
  private startGesture(gesture: Gesture, extra: Partial<EditorState> = {}) {
    this.set({ history: begin(this.state.history), gesture, ...extra });
  }

  /** An edit inside the drag. */
  private during(change: (doc: LevelDocument) => LevelDocument) {
    this.setHistory(update(this.state.history, change(this.doc)));
  }

  private finishGesture() {
    if (this.state.history.pending === null) {
      if (this.state.gesture !== null) this.set({ gesture: null });
      return;
    }
    this.setHistory(commit(this.state.history), { gesture: null });
  }

  readonly pointerDown = (p: Point, shift: boolean) => {
    const { state } = this;
    const doc = this.doc;
    this.pointer = { point: p, shift };
    switch (state.tool) {
      case "select": {
        const hit = pick(doc, p);
        if (hit === null || hit.type === "wall" || hit.type === "region") {
          this.select(hit);
          return;
        }
        const at = this.positionOf(hit);
        if (at === null) return;
        this.startGesture(
          { type: "move", target: hit, dx: p.x - at.x, dy: p.y - at.y },
          { selection: hit },
        );
        return;
      }
      case "party": {
        const hit = pick(doc, p, ["viewer"], state.viewers);
        if (hit !== null) {
          const viewer = state.viewers.find((v) => v.id === hit.id)!;
          this.set({
            selection: hit,
            gesture: { type: "move", target: hit, dx: p.x - viewer.column, dy: p.y - viewer.row },
          });
          return;
        }
        if (!onBoard(doc, p)) return;
        if (this.addViewer(Math.floor(p.x), Math.floor(p.y)) === null) this.select(null);
        return;
      }
      case "floor": {
        if (shift) {
          this.startGesture({ type: "rect", from: p });
          return;
        }
        this.startGesture({ type: "paint" });
        this.during((d) => paintFloor(d, brushSquares(d, p, state.brush), state.material));
        return;
      }
      case "region": {
        const selected =
          state.selection?.type === "region"
            ? doc.regions.find((r) => r.id === state.selection?.id)
            : undefined;
        const region = selected ?? newRegion(state.regionKind, state.regionSecret);
        this.startGesture({ type: "region", region, remove: shift });
        this.paintRegionAt(p);
        return;
      }
      case "erase":
        this.startGesture({ type: "erase" });
        this.eraseAt(p);
        return;
      case "wall": {
        const v = clampToBoard(doc, snapVertex(p, shift));
        const chain = state.wallChain;
        if (chain === null) {
          this.set({ wallChain: v });
          return;
        }
        if (v.x === chain.x && v.y === chain.y) {
          this.set({ wallChain: null });
          return;
        }
        this.edit((d) => addWall(d, chain, v), { wallChain: v });
        return;
      }
      case "room":
        this.set({ gesture: { type: "room", from: clampToBoard(doc, snapVertex(p, false)) } });
        return;
      case "door": {
        // Off the board there is no wall to cut a door in, as no party stands there.
        if (!onBoard(doc, p)) return;
        const hit = pick(doc, p, ["door"]);
        if (hit !== null) {
          this.edit((d) => (shift ? toggleSecret(d, hit.id) : toggleDoor(d, hit.id)));
          return;
        }
        this.edit((d) => cutDoor(d, nearestEdge(p), state.doorKind));
        return;
      }
      case "prop": {
        const at = propPlacement(doc, state.prop, state.rotation, p);
        this.edit((d) => addProp(d, newProp(state.prop, at.x, at.y, state.rotation)));
        return;
      }
      case "light": {
        if (!onBoard(doc, p)) return;
        const light = newLight(state.light, lightSpot(p, shift));
        this.edit((d) => addLight(d, light), { selection: { type: "light", id: light.id } });
        return;
      }
    }
  };

  readonly pointerMove = (p: Point, shift: boolean) => {
    this.pointer = { point: p, shift };
    const gesture = this.state.gesture;
    if (gesture !== null) {
      switch (gesture.type) {
        case "paint": {
          const { material, brush } = this.state;
          this.during((d) => paintFloor(d, brushSquares(d, p, brush), material));
          break;
        }
        case "erase":
          this.eraseAt(p);
          break;
        case "region":
          this.paintRegionAt(p);
          break;
        case "move":
          this.moveTo(gesture, p, shift);
          break;
        case "rect":
        case "room":
          break;
      }
    }
    this.hoverChanged();
  };

  readonly pointerUp = (p: Point, shift: boolean) => {
    this.pointer = { point: p, shift };
    const { gesture, material } = this.state;
    if (gesture?.type === "rect") {
      this.during((d) => paintFloor(d, rectSquares(d, gesture.from, p), material));
    }
    if (gesture?.type === "room") {
      const to = clampToBoard(this.doc, snapVertex(p, false));
      this.set({ gesture: null });
      this.edit((d) => addRoom(d, gesture.from, to, material === 0 ? 1 : material));
      this.hoverChanged();
      return;
    }
    if (gesture?.type === "region" && !gesture.remove) {
      const painted = this.doc.regions.some((r) => r.id === gesture.region.id);
      this.finishGesture();
      if (painted) this.set({ selection: { type: "region", id: gesture.region.id } });
      this.hoverChanged();
      return;
    }
    if (gesture?.type === "move" && gesture.target.type === "viewer") {
      this.set({ gesture: null });
      this.hoverChanged();
      return;
    }
    this.finishGesture();
    this.hoverChanged();
  };

  /** A right-click that did not pan: ends the wall being drawn. */
  readonly endChain = () => {
    if (this.state.wallChain !== null) this.set({ wallChain: null });
    this.hoverChanged();
  };

  readonly pointerLeave = () => this.hover(null);

  private positionOf(hit: Hit): Point | null {
    const doc = this.doc;
    if (hit.type === "prop") {
      const prop = doc.props.find((p) => p.id === hit.id);
      return prop === undefined ? null : { x: prop.x, y: prop.y };
    }
    if (hit.type === "light") {
      const light = doc.lights.find((l) => l.id === hit.id);
      return light === undefined ? null : { x: light.x, y: light.y };
    }
    return null;
  }

  private moveTo(gesture: Extract<Gesture, { type: "move" }>, p: Point, free: boolean) {
    const target = gesture.target;
    const x = p.x - gesture.dx;
    const y = p.y - gesture.dy;
    if (target.type === "viewer") {
      const doc = this.doc;
      const column = Math.max(0, Math.min(doc.columns - 1, Math.round(x)));
      const row = Math.max(0, Math.min(doc.rows - 1, Math.round(y)));
      this.updateViewer(target.id, { column, row });
      return;
    }
    if (target.type === "prop") {
      this.during((d) => moveProp(d, target.id, x, y));
      return;
    }
    if (target.type === "light") {
      const spot = free ? { x, y } : { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
      this.during((d) => {
        const clamped = clampToBoard(d, spot);
        return updateLight(d, target.id, { x: clamped.x, y: clamped.y });
      });
    }
  }

  private eraseAt(p: Point) {
    const doc = this.doc;
    const hit = pick(doc, p, ["light", "prop", "door", "wall"]);
    if (hit === null || hit.type === "viewer" || hit.type === "region") {
      this.during((d) => paintFloor(d, brushSquares(d, p, 1), 0));
      return;
    }
    this.during((d) => removePart(d, hit));
    if (this.state.selection?.id === hit.id) this.set({ selection: null });
  }

  private paintRegionAt(p: Point) {
    const gesture = this.state.gesture;
    if (gesture?.type !== "region") return;
    const { brush } = this.state;
    if (gesture.remove) {
      this.during((d) => unpaintRegions(d, brushSquares(d, p, brush), gesture.region.kind));
      return;
    }
    this.during((d) => paintRegion(d, gesture.region, brushSquares(d, p, brush)));
  }

  // ---------------------------------------------------------------------------
  // Saving

  private scheduleSave() {
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    // In a conflict nothing saves on its own: the owner chooses first.
    if (this.state.save.status === "conflict") return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      // A drag saves once it ends.
      if (this.state.gesture !== null) {
        this.scheduleSave();
        return;
      }
      void this.saveNow();
    }, SAVE_DELAY_MS);
  }

  /**
   * Save the working copy now; while a save is out, save again once it lands.
   * In a conflict it waits for the owner's choice (`loadSaved`, `keepMine`).
   */
  readonly saveNow = async (): Promise<void> => {
    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    if (this.state.save.status === "conflict") return;
    if (this.inFlight) {
      this.againAfter = true;
      return;
    }
    const revision = this.state.revision;
    if (revision === this.savedRevision && this.state.save.status !== "failed") return;
    this.inFlight = true;
    this.set({ save: { status: "saving", error: null } });
    try {
      const saved = await this.onSave(this.doc);
      this.savedRevision = revision;
      const history = mapAll(this.state.history, (doc) =>
        doc.version === saved.version ? doc : { ...doc, version: saved.version },
      );
      this.state = { ...this.state, history };
    } catch (error) {
      this.inFlight = false;
      this.againAfter = false;
      this.set({
        save: {
          status: error instanceof LevelSaveConflict ? "conflict" : "failed",
          error: error instanceof Error && error.message !== "" ? error.message : null,
        },
      });
      return;
    }
    this.inFlight = false;
    const pending = this.state.revision !== this.savedRevision;
    this.set({ save: { status: pending ? "dirty" : "saved", error: null } });
    if (this.againAfter) {
      this.againAfter = false;
      void this.saveNow();
    }
  };

  /**
   * The way out of a conflict that drops this copy: read the level as the
   * server holds it and edit that, with a fresh undo stack. Unsaved edits
   * here are gone.
   */
  readonly loadSaved = async (): Promise<void> => {
    if (this.onLoad === undefined) return;
    const saved = await this.loadOrFail();
    if (saved === undefined) return;
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    const revision = this.state.revision + 1;
    this.savedRevision = revision;
    this.set({
      history: historyOf(saved),
      revision,
      selection: null,
      wallChain: null,
      gesture: null,
      save: { status: "saved", error: null },
    });
  };

  /**
   * The way out of a conflict that keeps this copy: read the version the
   * server holds now, then save this copy over it at that version. What was
   * saved elsewhere is replaced.
   */
  readonly keepMine = async (): Promise<void> => {
    if (this.onLoad === undefined) return;
    const saved = await this.loadOrFail();
    if (saved === undefined) return;
    const history = mapAll(this.state.history, (doc) =>
      doc.version === saved.version ? doc : { ...doc, version: saved.version },
    );
    // Not saved as of the server's version: the save below sends it.
    this.savedRevision = -1;
    this.state = { ...this.state, history };
    this.set({ save: { status: "dirty", error: null } });
    await this.saveNow();
  };

  /** The server's level for a way out of a conflict; on a failed read, the conflict stands. */
  private async loadOrFail(): Promise<LevelDocument | undefined> {
    try {
      return await this.onLoad!();
    } catch (error) {
      this.set({
        save: {
          status: "conflict",
          error: error instanceof Error && error.message !== "" ? error.message : null,
        },
      });
      return undefined;
    }
  }

  /** The working copy holds edits the server has not kept: what leaving the page would lose. */
  get unsaved(): boolean {
    return this.state.revision !== this.savedRevision || this.state.save.status === "conflict";
  }

  /**
   * The editor is going away: save what is unsaved now rather than after the
   * delay. The store stays usable, so a remount (React's development double
   * mount) carries on with it.
   */
  flush() {
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (this.state.revision !== this.savedRevision) void this.saveNow();
  }
}
