import { TOOLS, type ToolId } from "./tools";

/** What a key press asks the editor to do. */
export type KeyAction =
  | { readonly type: "tool"; readonly tool: ToolId }
  | {
      readonly type:
        | "undo"
        | "redo"
        | "save"
        | "escape"
        | "delete"
        | "rotate"
        | "brushDown"
        | "brushUp"
        | "toggleGrid"
        | "fit";
    };

/** The parts of a `KeyboardEvent` the map reads. */
export interface KeyPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/**
 * The editor's keys, as the prototype has them: a tool's letter picks it,
 * Ctrl+Z undoes and Ctrl+Shift+Z (or Ctrl+Y) redoes, Ctrl+S saves now, Escape
 * ends a wall chain and clears the selection, Delete deletes it, Q rotates,
 * `[` and `]` size the brush, G toggles the grid and F fits the level.
 *
 * Space (held, to pan) is not here: it is a state, not an action, and the
 * canvas tracks it.
 */
export const keyAction = (press: KeyPress): KeyAction | null => {
  const key = press.key.toLowerCase();
  const command = press.ctrlKey || press.metaKey;
  if (command) {
    if (key === "z") return { type: press.shiftKey ? "redo" : "undo" };
    if (key === "y") return { type: "redo" };
    if (key === "s") return { type: "save" };
    return null;
  }
  if (press.altKey) return null;
  switch (key) {
    case "escape":
      return { type: "escape" };
    case "delete":
    case "backspace":
      return { type: "delete" };
    case "q":
      return { type: "rotate" };
    case "[":
      return { type: "brushDown" };
    case "]":
      return { type: "brushUp" };
    case "g":
      return { type: "toggleGrid" };
    case "f":
      return { type: "fit" };
  }
  const tool = TOOLS.find((spec) => spec.key === key);
  return tool === undefined ? null : { type: "tool", tool: tool.id };
};

/** Whether a key press belongs to a field the person is typing in, which the editor's keys leave alone. */
export const typingInto = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return type !== "checkbox" && type !== "radio" && type !== "button";
};
