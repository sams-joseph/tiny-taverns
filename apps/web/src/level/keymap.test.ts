import { describe, expect, it } from "vitest";
import { keyAction, typingInto } from "./keymap";
import { TOOLS } from "./tools";

const press = (
  key: string,
  mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }> = {},
) =>
  keyAction({
    key,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
  });

describe("the editor's keys", () => {
  it("picks each tool by its letter, in either case", () => {
    for (const tool of TOOLS) {
      expect(press(tool.key)).toEqual({ type: "tool", tool: tool.id });
      expect(press(tool.key.toUpperCase(), { shift: true })).toEqual({
        type: "tool",
        tool: tool.id,
      });
    }
  });

  it("gives every tool its own key, clear of the editor's other keys", () => {
    const keys = TOOLS.map((tool) => tool.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of ["q", "g", "f", "[", "]"]) expect(keys).not.toContain(key);
  });

  it("undoes, redoes and saves with Ctrl or Cmd", () => {
    expect(press("z", { ctrl: true })).toEqual({ type: "undo" });
    expect(press("Z", { ctrl: true, shift: true })).toEqual({ type: "redo" });
    expect(press("y", { meta: true })).toEqual({ type: "redo" });
    expect(press("s", { ctrl: true })).toEqual({ type: "save" });
    expect(press("w", { ctrl: true })).toBeNull();
  });

  it("maps the rest as the prototype does", () => {
    expect(press("Escape")).toEqual({ type: "escape" });
    expect(press("Delete")).toEqual({ type: "delete" });
    expect(press("Backspace")).toEqual({ type: "delete" });
    expect(press("q")).toEqual({ type: "rotate" });
    expect(press("[")).toEqual({ type: "brushDown" });
    expect(press("]")).toEqual({ type: "brushUp" });
    expect(press("g")).toEqual({ type: "toggleGrid" });
    expect(press("f")).toEqual({ type: "fit" });
    expect(press(" ")).toBeNull();
    expect(press("w", { alt: true })).toBeNull();
  });

  it("leaves a field being typed in alone, but not a checkbox", () => {
    const text = document.createElement("input");
    const box = document.createElement("input");
    box.type = "checkbox";
    expect(typingInto(text)).toBe(true);
    expect(typingInto(box)).toBe(false);
    expect(typingInto(document.createElement("textarea"))).toBe(true);
    expect(typingInto(document.createElement("button"))).toBe(false);
  });
});
