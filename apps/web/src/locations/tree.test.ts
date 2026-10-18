import type { LocationId } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { placeTree, subtreeIds } from "./tree";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` as LocationId;
const place = (n: number, parent: number | null) => ({
  id: id(n),
  parentId: parent === null ? null : id(parent),
});

describe("placeTree", () => {
  it("nests each place under its parent, in the order the list came in", () => {
    const tree = placeTree([place(1, null), place(2, 1), place(3, 2), place(4, 1)]);
    expect(tree.map((node) => node.place.id)).toEqual([id(1)]);
    expect(tree[0]!.children.map((node) => node.place.id)).toEqual([id(2), id(4)]);
    expect(tree[0]!.children[0]!.children.map((node) => node.place.id)).toEqual([id(3)]);
  });

  it("stands a place whose parent is not in the list at the top", () => {
    expect(placeTree([place(2, 1), place(3, 2)]).map((node) => node.place.id)).toEqual([id(2)]);
  });
});

describe("subtreeIds", () => {
  it("answers the place and everything under it, and nothing beside it", () => {
    const places = [place(1, null), place(2, 1), place(3, 2), place(4, null)];
    expect([...subtreeIds(places, id(2))].sort()).toEqual([id(2), id(3)]);
  });
});
