import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
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
} from "./history";

describe("the undo stack", () => {
  it("undoes and redoes one edit at a time", () => {
    let h = historyOf("a");
    h = push(h, "b");
    h = push(h, "c");
    h = undo(h);
    expect(h.present).toBe("b");
    h = undo(h);
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe("b");
    expect(canRedo(h)).toBe(true);
  });

  it("drops what could be redone when a new edit is made", () => {
    let h = push(push(historyOf("a"), "b"), "c");
    h = push(undo(h), "d");
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe("b");
  });

  it("records nothing for an edit that changed nothing", () => {
    const h = historyOf("a");
    expect(push(h, "a")).toBe(h);
  });

  it("records a drag as one step, or none when it changed nothing", () => {
    let h = begin(historyOf("a"));
    h = update(h, "b");
    h = update(h, "c");
    expect(canUndo(h)).toBe(false);
    h = commit(h);
    expect(h.past).toEqual(["a"]);
    expect(undo(h).present).toBe("a");
    const idle = commit(begin(historyOf("a")));
    expect(idle.past).toEqual([]);
    expect(idle.pending).toBeNull();
  });

  it("keeps at most the limit of steps", () => {
    let h = historyOf(0);
    for (let k = 1; k <= HISTORY_LIMIT + 10; k++) h = push(h, k);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(10);
  });

  it("changes every recorded document without a step", () => {
    const h = mapAll(push(historyOf({ v: 1 }), { v: 1 }), (doc) => ({ ...doc, v: 2 }));
    expect(h.past.map((d) => d.v)).toEqual([2]);
    expect(h.present.v).toBe(2);
  });
});
