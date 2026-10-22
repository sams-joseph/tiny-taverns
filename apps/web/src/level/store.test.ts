import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LevelDocument } from "./document";
import { smallLevel } from "./level.fixtures";
import { describeHover } from "./overlay";
import { EditorStore, LevelSaveConflict, SAVE_DELAY_MS } from "./store";

const make = (level: LevelDocument = smallLevel()) => {
  const saves: Array<LevelDocument> = [];
  const store = new EditorStore(level, (doc) => {
    saves.push(doc);
    return Promise.resolve({ version: doc.version + 1 });
  });
  return { store, saves };
};

const click = (store: EditorStore, x: number, y: number, shift = false) => {
  store.pointerDown({ x, y }, shift);
  store.pointerUp({ x, y }, shift);
};

const drag = (
  store: EditorStore,
  path: ReadonlyArray<readonly [number, number]>,
  shift = false,
) => {
  const [first, ...rest] = path;
  store.pointerDown({ x: first![0], y: first![1] }, shift);
  for (const [x, y] of rest) store.pointerMove({ x, y }, shift);
  const last = path[path.length - 1]!;
  store.pointerUp({ x: last[0], y: last[1] }, shift);
};

describe("the wall tool", () => {
  it("chains walls corner to corner and stops on Escape", () => {
    const { store } = make({ ...smallLevel(), walls: [] });
    store.setTool("wall");
    click(store, 1.1, 1.2);
    click(store, 4.9, 0.8);
    click(store, 5.2, 4.1);
    expect(store.doc.walls.map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2])).toEqual([
      [1, 1, 5, 1],
      [5, 1, 5, 4],
    ]);
    expect(store.getState().wallChain).toEqual({ x: 5, y: 4 });
    store.key({ type: "escape" });
    expect(store.getState().wallChain).toBeNull();
    // Each wall is its own step.
    store.undo();
    expect(store.doc.walls).toHaveLength(1);
  });

  it("snaps to half squares with Shift, and a right-click ends the chain", () => {
    const { store } = make({ ...smallLevel(), walls: [] });
    store.setTool("wall");
    click(store, 1.4, 1.4, true);
    click(store, 3.3, 1.4, true);
    expect(store.doc.walls[0]).toMatchObject({ x1: 1.5, y1: 1.5, x2: 3.5, y2: 1.5 });
    store.endChain();
    expect(store.getState().wallChain).toBeNull();
  });

  it("says how long the wall being drawn is", () => {
    const { store } = make();
    store.setTool("wall");
    click(store, 1, 1);
    store.pointerMove({ x: 4, y: 1 }, false);
    expect(describeHover(store.getState(), store.getPointer()).hint).toMatch(/15 ft/);
  });
});

describe("the room tool", () => {
  it("drags a room between two vertices as one step", () => {
    const { store } = make({ ...smallLevel(), walls: [], floor: smallLevel().floor.map(() => 0) });
    store.setTool("room");
    store.choose({ material: 6 });
    drag(store, [
      [8.1, 1.9],
      [9, 4],
      [10.9, 5.2],
    ]);
    expect(store.doc.walls).toHaveLength(4);
    expect(store.doc.floor.filter((m) => m === 6)).toHaveLength(3 * 3);
    store.undo();
    expect(store.doc.walls).toHaveLength(0);
  });
});

describe("the door tool", () => {
  it("cuts a door where it clicks, and opens it, and makes it secret with Shift", () => {
    const { store } = make();
    store.setTool("door");
    click(store, 2.5, 1.05);
    const door = store.doc.walls.find((w) => w.kind === "door" && w.y1 === 1);
    expect(door).toMatchObject({ x1: 2, x2: 3, doorState: "closed" });
    expect(
      store.doc.walls.filter((w) => w.kind === "wall" && w.y1 === 1 && w.y2 === 1),
    ).toHaveLength(2);
    click(store, 2.5, 1.02);
    expect(store.doc.walls.find((w) => w.id === door!.id)!.doorState).toBe("open");
    click(store, 2.5, 1.02, true);
    expect(store.doc.walls.find((w) => w.id === door!.id)!.kind).toBe("secretDoor");
  });

  it("ignores a click off the board, as the party tool does", () => {
    const { store } = make();
    const before = store.doc;
    store.setTool("door");
    click(store, -0.4, 2.5);
    click(store, before.columns + 0.3, 1.5);
    store.setTool("light");
    click(store, 2.5, -0.6);
    click(store, 2.5, before.rows + 0.2);
    expect(store.doc).toBe(before);
    expect(store.canUndo).toBe(false);
  });

  it("cuts a secret door when the tray says so", () => {
    const { store } = make();
    store.setTool("door");
    store.choose({ doorKind: "secretDoor" });
    click(store, 0.95, 2.5);
    expect(store.doc.walls.find((w) => w.kind === "secretDoor" && w.x1 === 1)).toMatchObject({
      y1: 2,
      y2: 3,
    });
  });
});

describe("painting", () => {
  it("paints a stroke of floor as one step", () => {
    const { store } = make();
    store.setTool("floor");
    store.choose({ material: 3 });
    drag(store, [
      [1.5, 8.5],
      [2.5, 8.5],
      [3.5, 8.5],
    ]);
    expect(store.doc.floor.filter((m) => m === 3)).toHaveLength(3);
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(store.doc.floor.filter((m) => m === 3)).toHaveLength(0);
  });

  it("fills a rectangle with Shift, and sizes the brush with the bracket keys", () => {
    const { store } = make();
    store.setTool("floor");
    store.choose({ material: 4 });
    drag(
      store,
      [
        [8.2, 6.2],
        [10.8, 7.9],
      ],
      true,
    );
    expect(store.doc.floor.filter((m) => m === 4)).toHaveLength(3 * 2);
    store.key({ type: "brushUp" });
    store.key({ type: "brushUp" });
    expect(store.getState().brush).toBe(3);
    for (let k = 0; k < 6; k++) store.key({ type: "brushUp" });
    expect(store.getState().brush).toBe(4);
  });

  it("paints a region, then keeps painting the same one, and Shift takes squares out", () => {
    const { store } = make({ ...smallLevel(), regions: [] });
    store.setTool("region");
    store.choose({ regionKind: "trap", regionSecret: true });
    drag(store, [
      [2.5, 2.5],
      [3.5, 2.5],
    ]);
    expect(store.doc.regions).toHaveLength(1);
    expect(store.doc.regions[0]).toMatchObject({ kind: "trap", secret: true, squares: [26, 27] });
    expect(store.getState().selection).toEqual({ type: "region", id: store.doc.regions[0]!.id });
    click(store, 4.5, 2.5);
    expect(store.doc.regions).toHaveLength(1);
    expect(store.doc.regions[0]!.squares).toEqual([26, 27, 28]);
    click(store, 2.5, 2.5, true);
    expect(store.doc.regions[0]!.squares).toEqual([27, 28]);
  });
});

describe("the erase tool", () => {
  it("erases what it drags over as one step, and bare floor to void", () => {
    const { store } = make();
    store.setTool("erase");
    drag(store, [
      [2.5, 2.5],
      [2.5, 5.5],
      [3.5, 5.5],
    ]);
    expect(store.doc.props.map((p) => p.id)).not.toContain("crate");
    expect(store.doc.lights.map((l) => l.id)).not.toContain("torch");
    expect(store.doc.floor[5 * 12 + 3]).toBe(0);
    store.undo();
    expect(store.doc).toEqual(smallLevel());
  });
});

describe("selecting", () => {
  it("drags a prop to a new square as one step", () => {
    const { store } = make();
    drag(store, [
      [2.4, 2.4],
      [3.4, 3.4],
      [4.4, 5.4],
    ]);
    expect(store.getState().selection).toEqual({ type: "prop", id: "crate" });
    expect(store.doc.props.find((p) => p.id === "crate")).toMatchObject({ x: 4, y: 5 });
    store.undo();
    expect(store.doc.props.find((p) => p.id === "crate")).toMatchObject({ x: 2, y: 2 });
  });

  it("makes no step for a click that moves nothing", () => {
    const { store } = make();
    click(store, 2.4, 2.4);
    expect(store.canUndo).toBe(false);
  });

  it("rotates and deletes the selection from the keys", () => {
    const { store } = make();
    click(store, 2.4, 2.4);
    store.key({ type: "rotate" });
    expect(store.doc.props.find((p) => p.id === "crate")!.rotation).toBe(1);
    store.key({ type: "delete" });
    expect(store.doc.props.find((p) => p.id === "crate")).toBeUndefined();
    expect(store.getState().selection).toBeNull();
  });

  it("places a light at a square's centre and selects it", () => {
    const { store } = make();
    store.setTool("light");
    store.choose({ light: "candle" });
    click(store, 9.2, 8.7);
    const light = store.doc.lights[store.doc.lights.length - 1]!;
    expect(light).toMatchObject({
      x: 9.5,
      y: 8.5,
      bright: 5,
      dim: 5,
      tone: "fire",
      flicker: true,
      lit: true,
    });
    expect(store.getState().selection).toEqual({ type: "light", id: light.id });
  });

  it("turns the prop in hand with Q and places it so", () => {
    const { store } = make();
    store.setTool("prop");
    store.choose({ prop: "table" });
    store.key({ type: "rotate" });
    click(store, 10.5, 6);
    expect(store.doc.props[store.doc.props.length - 1]).toMatchObject({
      kind: "table",
      rotation: 1,
      x: 10,
      y: 5,
    });
  });
});

describe("viewing as the party", () => {
  it("places up to four viewers, drags them, and never saves them", () => {
    const { store } = make();
    store.setTool("party");
    for (const [x, y] of [
      [2.5, 5.5],
      [3.5, 5.5],
      [4.5, 5.5],
      [5.5, 5.5],
      [6.5, 5.5],
    ] as const) {
      click(store, x, y);
    }
    expect(store.getState().viewers.map((v) => v.name)).toEqual(["Ash", "Bryn", "Cael", "Dov"]);
    drag(store, [
      [2.5, 5.5],
      [3.5, 3.5],
    ]);
    expect(store.getState().viewers[0]).toMatchObject({ column: 3, row: 3 });
    expect(store.canUndo).toBe(false);
    store.key({ type: "delete" });
    expect(store.getState().viewers.map((v) => v.name)).toEqual(["Bryn", "Cael", "Dov"]);
    expect("viewers" in store.doc).toBe(false);
  });

  it("sees, remembers what it saw, and forgets on request", () => {
    const { store } = make();
    expect(store.vision()).toBeNull();
    store.setTool("party");
    click(store, 2.5, 5.5);
    const first = store.vision()!;
    expect(first.part.sees).toContain(5 * 12 + 2);
    store.updateViewer(store.getState().viewers[0]!.id, { column: 9, row: 3 });
    const second = store.vision()!;
    expect(second.seen[5 * 12 + 2]).toBe(1);
    store.forgetExplored();
    expect(store.vision()!.seen[5 * 12 + 2]).toBe(0);
  });

  it("reads a hovered square's cover from the nearest viewer", () => {
    const { store } = make();
    store.setTool("party");
    click(store, 2.5, 5.5);
    store.pointerMove({ x: 3.5, y: 5.5 }, false);
    expect(describeHover(store.getState(), store.getPointer()).hint).toBe(
      "Ash → this square: no cover",
    );
    store.pointerMove({ x: 9.5, y: 3.5 }, false);
    expect(describeHover(store.getState(), store.getPointer()).hint).toMatch(
      /^Ash → this square: total cover/,
    );
  });
});

describe("saving", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves a moment after the last edit, carrying the version it was read at", async () => {
    const { store, saves } = make();
    store.setAmbient("dim");
    expect(store.getState().save.status).toBe("dirty");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    store.setAmbient("bright");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ ambient: "bright", version: 1 });
    expect(store.getState().save.status).toBe("saved");
    // The next save carries the version the server kept.
    store.setAmbient("dark");
    await store.saveNow();
    expect(saves[1]).toMatchObject({ ambient: "dark", version: 2 });
  });

  it("waits for a drag to end before saving", async () => {
    const { store, saves } = make();
    store.setTool("floor");
    store.pointerDown({ x: 1.5, y: 8.5 }, false);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 3);
    expect(saves).toHaveLength(0);
    store.pointerUp({ x: 1.5, y: 8.5 }, false);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(saves).toHaveLength(1);
  });

  it("says when a save is refused, and saves again on request", async () => {
    let refuse = true;
    const store = new EditorStore(smallLevel(), (doc) =>
      refuse
        ? Promise.reject(new Error("Someone else saved this level"))
        : Promise.resolve({ version: doc.version + 1 }),
    );
    store.setAmbient("dim");
    await store.saveNow();
    expect(store.getState().save).toEqual({
      status: "failed",
      error: "Someone else saved this level",
    });
    refuse = false;
    await store.saveNow();
    expect(store.getState().save.status).toBe("saved");
  });

  it("stops saving on a conflict until it loads the saved level or keeps its own", async () => {
    let refuse = true;
    const saves: Array<LevelDocument> = [];
    const theirs = { ...smallLevel(), name: "Theirs", version: 7 };
    const store = new EditorStore(
      smallLevel(),
      (doc) => {
        saves.push(doc);
        return refuse
          ? Promise.reject(new LevelSaveConflict("saved since you read it"))
          : Promise.resolve({ version: doc.version + 1 });
      },
      () => Promise.resolve(theirs),
    );
    store.setAmbient("dim");
    await store.saveNow();
    expect(store.getState().save).toEqual({
      status: "conflict",
      error: "saved since you read it",
    });
    // An edit in a conflict stays in it, and nothing saves on its own.
    store.setAmbient("bright");
    expect(store.getState().save.status).toBe("conflict");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    await store.saveNow();
    expect(saves).toHaveLength(1);
    expect(store.unsaved).toBe(true);

    refuse = false;
    await store.keepMine();
    expect(saves).toHaveLength(2);
    expect(saves[1]).toMatchObject({ ambient: "bright", version: 7 });
    expect(store.getState().save.status).toBe("saved");
    expect(store.unsaved).toBe(false);
  });

  it("loads the saved level over its own copy, with a fresh undo stack", async () => {
    const theirs = { ...smallLevel(), name: "Theirs", version: 7 };
    const store = new EditorStore(
      smallLevel(),
      () => Promise.reject(new LevelSaveConflict("")),
      () => Promise.resolve(theirs),
    );
    store.setAmbient("dim");
    await store.saveNow();
    expect(store.getState().save.status).toBe("conflict");
    await store.loadSaved();
    expect(store.doc).toBe(theirs);
    expect(store.canUndo).toBe(false);
    expect(store.getState().save.status).toBe("saved");
    expect(store.unsaved).toBe(false);
  });

  it("saves once more when an edit lands while a save is out", async () => {
    let finish: (value: { version: number }) => void = () => undefined;
    const saves: Array<LevelDocument> = [];
    const store = new EditorStore(smallLevel(), (doc) => {
      saves.push(doc);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    store.setAmbient("dim");
    const first = store.saveNow();
    store.setAmbient("bright");
    void store.saveNow();
    finish({ version: 2 });
    await first;
    expect(saves).toHaveLength(2);
    expect(saves[1]).toMatchObject({ ambient: "bright", version: 2 });
  });

  it("does not save an unchanged level, and flushes an unsaved one at once", async () => {
    const { store, saves } = make();
    await store.saveNow();
    expect(saves).toHaveLength(0);
    store.setAmbient("dim");
    store.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(saves).toHaveLength(1);
  });
});
