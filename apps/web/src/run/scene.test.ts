import { EncounterRunScene } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { loggedCheck, sceneOf } from "./run.fixtures";
import {
  exhaustionOf,
  lastDc,
  leadingDice,
  saveModifier,
  sceneNoun,
  sceneUpLine,
  skillModifier,
  withExhaustion,
} from "./scene";

const decode = Schema.decodeUnknownSync(EncounterRunScene);

const sheet = {
  notes: "",
  traits: [],
  abilities: [
    { label: "STR", score: "18", modifier: "+4", save: "+7" },
    { label: "CON", score: "13", modifier: "+1" },
    { label: "CHA", score: "8", modifier: "-1" },
  ],
  skills: [
    { name: "Athletics", ability: "STR", bonus: "+7" },
    { name: "Intimidation", ability: "STR" },
  ],
};

describe("a character's modifiers, off their sheet", () => {
  it("takes a skill's written bonus", () => {
    expect(skillModifier(sheet, "Athletics")).toBe(7);
    expect(skillModifier(sheet, " athletics ")).toBe(7);
  });

  it("falls back to the ability the skill keys off — the row's, then the standard list's", () => {
    // Keyed off Strength on this sheet, whatever the list says.
    expect(skillModifier(sheet, "Intimidation")).toBe(4);
    expect(skillModifier(sheet, "Persuasion")).toBe(-1);
    expect(skillModifier(sheet, "Strength")).toBe(4);
  });

  it("is absent when the sheet does not say", () => {
    expect(skillModifier(sheet, "Survival")).toBeUndefined();
    expect(skillModifier(sheet, "Thieves' tools")).toBeUndefined();
  });

  it("takes a save as written, else the ability's modifier", () => {
    expect(saveModifier(sheet, "STR")).toBe(7);
    expect(saveModifier(sheet, "CON")).toBe(1);
    expect(saveModifier(sheet, "WIS")).toBeUndefined();
  });
});

describe("a hazard's length and cost", () => {
  it("rolls the dice a duration opens with, and nothing else", () => {
    expect(leadingDice("1d4 hours")).toBe("1d4");
    expect(leadingDice("2d6+1 rounds")).toBe("2d6+1");
    expect(leadingDice("until dawn")).toBeUndefined();
    expect(leadingDice(undefined)).toBeUndefined();
  });

  it("reads exhaustion off the conditions, and writes it back in its place", () => {
    expect(exhaustionOf(["Poisoned"])).toBe(0);
    expect(exhaustionOf(["Poisoned", "Exhaustion 2"])).toBe(2);
    expect(withExhaustion(["Poisoned"], 1)).toEqual(["Poisoned", "Exhaustion 1"]);
    expect(withExhaustion(["Exhaustion 2", "Prone"], 3)).toEqual(["Exhaustion 3", "Prone"]);
    expect(withExhaustion(["Exhaustion 1", "Prone"], 0)).toEqual(["Prone"]);
  });
});

describe("the scene's line under its name", () => {
  it("words a conversation by the DM's note, with no DC", () => {
    const scene = decode(sceneOf("social"));
    expect(sceneUpLine("social", scene)).toBe("Attitude: hostile · 1 check");
    expect(sceneUpLine("social", { ...scene, attitude: null, checks: [] })).toBe(
      "No attitude noted",
    );
  });

  it("counts a skill challenge, and says when it is settled", () => {
    const scene = decode(sceneOf("challenge"));
    expect(sceneUpLine("challenge", scene)).toBe("1 of 3 successes · 0 of 2 failures");
    const lost = decode({
      ...sceneOf("challenge"),
      checks: [
        loggedCheck({ skill: "Nature", outcome: "failure" }),
        loggedCheck({ skill: "Nature", outcome: "failure" }),
      ],
    });
    expect(sceneUpLine("challenge", lost)).toBe("Challenge lost · 2 checks");
  });

  it("counts a hazard's stages, not hours", () => {
    const scene = decode(sceneOf("hazard"));
    expect(sceneUpLine("hazard", scene)).toBe("Stage 1 of 2 · CON save DC 13");
    expect(sceneUpLine("hazard", { ...scene, stage: null, stages: null })).toBe(
      "CON save DC 13 · not begun",
    );
  });

  it("starts a conversation's next DC from the last one set", () => {
    const scene = decode(sceneOf("social"));
    expect(lastDc(scene.checks)).toBe(15);
    expect(lastDc([])).toBeUndefined();
  });
});

describe("a scene's name in a sentence", () => {
  it("is the player's neutral name without its article", () => {
    expect(sceneNoun("combat")).toBe("fight");
    expect(sceneNoun("social")).toBe("conversation");
    expect(sceneNoun("challenge")).toBe("skill challenge");
    expect(sceneNoun("hazard")).toBe("hazard");
  });
});
