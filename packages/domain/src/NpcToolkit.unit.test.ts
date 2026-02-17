import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { LocationContext, npcToolkit } from "./NpcToolkit.js";

const decodeSync = Schema.decodeUnknownSync;

describe("NpcToolkit", () => {
  it("decodes LocationContext", () => {
    const context = decodeSync(LocationContext)({
      name: "The Taproom",
      description: "A warm tavern with roaring fires.",
      notableNpcs: ["Tessa"],
      rumors: ["A hidden cellar"],
      events: ["A bard arrives"],
    });

    expect(context.name).toBe("The Taproom");
  });

  it("rejects invalid LocationContext", () => {
    expect(() =>
      decodeSync(LocationContext)({
        name: "",
        description: "",
        notableNpcs: [],
        rumors: [],
        events: [],
      }),
    ).toThrow();
  });

  it("exposes npc toolkit tools", () => {
    const toolNames = Object.keys(npcToolkit.tools);

    expect(toolNames).toContain("GetNpcProfile");
    expect(toolNames).toContain("GetLocationContext");
  });
});
