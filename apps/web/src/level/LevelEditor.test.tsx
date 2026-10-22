import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LevelDocument } from "./document";
import { smallLevel } from "./level.fixtures";
import { LevelEditor } from "./LevelEditor";

// The renderer is three.js over WebGL, which jsdom has none of: the canvas is
// a fake that records what it was handed, behind the same dynamic import.
const drawn = vi.hoisted(() => ({
  levels: [] as Array<unknown>,
  options: [] as Array<{ viewAs: boolean }>,
  disposed: 0,
  webgl: true,
}));

vi.mock("../run/fx3d/support", () => ({ canDrawWebGL: () => drawn.webgl }));

vi.mock("./renderer", () => ({
  LevelRenderer: class {
    renderer = { domElement: document.createElement("canvas") };
    setLevel(level: unknown) {
      drawn.levels.push(level);
    }
    setOptions(options: { viewAs: boolean }) {
      drawn.options.push(options);
    }
    setVision() {}
    setOverlay() {}
    setHover() {}
    setView() {}
    resize() {}
    start() {}
    floorThumbnails() {
      return [];
    }
    dispose() {
      drawn.disposed += 1;
    }
  },
}));

// jsdom has no 2D canvas either; say so quietly, as a browser without one would.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  drawn.levels = [];
  drawn.options = [];
  drawn.disposed = 0;
  drawn.webgl = true;
});

const renderEditor = (level: LevelDocument = smallLevel()) => {
  const onSave = vi.fn((doc: LevelDocument) => Promise.resolve({ version: doc.version + 1 }));
  const view = render(<LevelEditor level={level} onSave={onSave} />);
  return { ...view, onSave };
};

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

describe("the level editor", () => {
  it("draws the level through the renderer and frees it on unmount", async () => {
    const { unmount } = renderEditor();
    await settle();
    expect(drawn.levels.at(-1)).toMatchObject({ id: "level-small" });
    unmount();
    expect(drawn.disposed).toBe(1);
  });

  it("says so where the browser cannot draw a level, and keeps its panels", () => {
    drawn.webgl = false;
    renderEditor();
    expect(screen.getByText(/needs WebGL 2/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Tools" })).toBeInTheDocument();
  });

  it("picks a tool from the rail or its key", async () => {
    renderEditor();
    const tools = screen.getByRole("navigation", { name: "Tools" });
    const select = within(tools).getByRole("button", { name: "Select and move" });
    expect(select).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(tools).getByRole("button", { name: "Wall" }));
    expect(within(tools).getByRole("button", { name: "Wall" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.keyDown(window, { key: "p" });
    expect(within(tools).getByRole("button", { name: "Prop" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("region", { name: "Props" })).toBeInTheDocument();
  });

  it("leaves the keys alone while the name is being typed", async () => {
    renderEditor();
    const name = screen.getByLabelText("Level name");
    await userEvent.clear(name);
    await userEvent.type(name, "Wet Cellar{Enter}");
    expect(
      within(screen.getByRole("navigation", { name: "Tools" })).getByRole("button", {
        name: "Select and move",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(name).toHaveValue("Wet Cellar");
  });

  it("switches the party's view on with T, and the renderer draws it", async () => {
    renderEditor();
    await settle();
    fireEvent.keyDown(window, { key: "t" });
    await settle();
    expect(drawn.options.at(-1)).toMatchObject({ viewAs: true });
    expect(screen.getByRole("region", { name: "The party" })).toBeInTheDocument();
  });

  it("undoes the ambient light and saves on Ctrl+S", async () => {
    const { onSave } = renderEditor();
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Dim" }));
    expect(screen.getByRole("radio", { name: "Dim" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toMatchObject({ ambient: "dim", version: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    await userEvent.click(undo);
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  });
});
