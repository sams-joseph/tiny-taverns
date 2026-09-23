import { describe, expect, it } from "vitest";
import { HOUSE_PORTRAIT_STYLE } from "./HouseStyle.js";
import { npcImageHasSubject, npcImagePromptFor } from "./NpcImage.js";

const style = { style: HOUSE_PORTRAIT_STYLE };

describe("npcImagePromptFor", () => {
  it("asks for a bust of the role, from the public summary, in the portrait framing", () => {
    const prompt = npcImagePromptFor(
      {
        role: "the ferryman at the crossing",
        persona: {
          identity: {
            pronouns: "she/her",
            summary: "A weathered river guide with a lantern and a patient stare",
          },
        },
      },
      style,
    );
    expect(prompt).toBe(
      "Head-and-shoulders portrait of a character in a fantasy adventure: the ferryman at the " +
        "crossing. A weathered river guide with a lantern and a patient stare. Pronouns: she/her. " +
        HOUSE_PORTRAIT_STYLE,
    );
  });

  it("draws from the summary alone when there is no role", () => {
    const prompt = npcImagePromptFor(
      { role: "", persona: { identity: { summary: "An old priest." } } },
      style,
    );
    expect(prompt).toBe(
      "Head-and-shoulders portrait of a character in a fantasy adventure. An old priest. " +
        HOUSE_PORTRAIT_STYLE,
    );
  });

  it("reads nothing but the role and the identity: not the voice, the intent or the boundaries", () => {
    const prompt = npcImagePromptFor(
      {
        role: "Innkeeper",
        persona: {
          voice: { manner: "VOICE-MANNER", phrases: ["VOICE-PHRASE"] },
          intent: { wants: "INTENT-WANTS", fears: "INTENT-FEARS" },
          boundaries: { refuses: ["BOUNDARY-REFUSES"] },
        },
      },
      style,
    );
    expect(prompt).not.toMatch(/VOICE|INTENT|BOUNDARY/);
  });

  it("never reads private material, even when a wider object carries it", () => {
    const npc = {
      name: "Mara Vell",
      role: "Innkeeper",
      persona: {},
      privateMaterial: { secrets: "SECRET-PATRON", instructions: "PLAY-INSTRUCTIONS" },
    };
    const prompt = npcImagePromptFor(npc, style);
    expect(prompt).not.toContain("SECRET");
    expect(prompt).not.toContain("INSTRUCTIONS");
    expect(prompt).not.toContain("Mara");
  });

  it("strips quotes and runs of space, and bounds each label", () => {
    const prompt = npcImagePromptFor(
      {
        role: `  "The   harbour\nmaster"  `,
        persona: { identity: { summary: "y".repeat(3000), pronouns: "z".repeat(80) } },
      },
      style,
    );
    expect(prompt).toContain(": The harbour master.");
    expect(prompt).not.toContain('"');
    expect(prompt).not.toContain("y".repeat(601));
    expect(prompt).not.toContain("z".repeat(41));
  });
});

describe("npcImageHasSubject", () => {
  it("draws an NPC with a role or a summary, and skips one that is only a name", () => {
    expect(npcImageHasSubject({ role: "Innkeeper", persona: {} })).toBe(true);
    expect(npcImageHasSubject({ role: "", persona: { identity: { summary: "Old." } } })).toBe(true);
    expect(npcImageHasSubject({ role: "  ", persona: {} })).toBe(false);
    expect(npcImageHasSubject({ role: "", persona: { identity: { pronouns: "he/him" } } })).toBe(
      false,
    );
    expect(
      npcImageHasSubject({ role: "", persona: { voice: { manner: "Gruff and quiet." } } }),
    ).toBe(false);
  });
});
