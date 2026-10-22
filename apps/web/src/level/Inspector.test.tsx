import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Inspector } from "./Inspector";
import { smallLevel } from "./level.fixtures";
import { EditorStore } from "./store";
import { useEditorState } from "./useEditor";

function Harness({ store }: { readonly store: EditorStore }) {
  return <Inspector store={store} state={useEditorState(store)} />;
}

const setup = () => {
  const store = new EditorStore(smallLevel(), (doc) => Promise.resolve({ version: doc.version }));
  render(<Harness store={store} />);
  return store;
};

describe("the inspector", () => {
  it("draws nothing with nothing selected", () => {
    setup();
    expect(screen.queryByRole("complementary", { name: "Inspector" })).toBeNull();
  });

  it("shows a prop's flags as the kit's defaults until one is changed, and resets it", async () => {
    const store = setup();
    act(() => store.select({ type: "prop", id: "crate" }));
    const blocks = await screen.findByRole("checkbox", { name: "Blocks movement" });
    expect(blocks).toBeChecked();
    expect(screen.getAllByText("kit default")).toHaveLength(4);
    await userEvent.click(blocks);
    expect(store.doc.props.find((p) => p.id === "crate")!.blocksMovement).toBe(false);
    expect(screen.getByRole("checkbox", { name: "Blocks movement" })).not.toBeChecked();
    await userEvent.click(
      screen.getByRole("button", { name: "Reset blocks movement to the kit's default" }),
    );
    expect(store.doc.props.find((p) => p.id === "crate")!.blocksMovement).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Blocks movement" })).toBeChecked();
    // Changing it and changing it back is the kit's default again, not an override.
    await userEvent.click(screen.getByRole("checkbox", { name: "Blocks sight" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Blocks sight" }));
    expect(store.doc.props.find((p) => p.id === "crate")!.blocksSight).toBeNull();
  });

  it("marks a prop DM only, and says a brazier carries its light", async () => {
    const store = setup();
    act(() => store.select({ type: "prop", id: "brazier" }));
    expect(await screen.findByText(/Carries its own light: 10\/10 ft/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "DM only" }));
    expect(store.doc.props.find((p) => p.id === "brazier")!.dmOnly).toBe(true);
  });

  it("edits a light's radii and puts it out", async () => {
    const store = setup();
    act(() => store.select({ type: "light", id: "torch" }));
    const bright = await screen.findByLabelText("Bright");
    await userEvent.clear(bright);
    await userEvent.type(bright, "30{Enter}");
    expect(store.doc.lights[0]!.bright).toBe(30);
    await userEvent.click(screen.getByRole("checkbox", { name: "Lit" }));
    expect(store.doc.lights[0]!.lit).toBe(false);
  });

  it("makes a door secret and a wall low", async () => {
    const store = setup();
    act(() => store.select({ type: "wall", id: "door-east" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: /Secret/ }));
    expect(store.doc.walls.find((w) => w.id === "door-east")!.kind).toBe("secretDoor");
    act(() => store.select({ type: "wall", id: "w-north" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: /Low wall/ }));
    expect(store.doc.walls.find((w) => w.id === "w-north")!.low).toBe(true);
  });

  it("deletes a region", async () => {
    const store = setup();
    act(() => store.select({ type: "region", id: "rough" }));
    expect(await screen.findByText("2 squares (50 sq ft)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(store.doc.regions).toEqual([]);
    expect(screen.queryByRole("complementary", { name: "Inspector" })).toBeNull();
  });
});
