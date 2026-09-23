import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { APPEARANCE_MAX, CharacterSheet, emptyCharacterSheet } from "./Character.js";
import {
  HOUSE_PORTRAIT_STYLE,
  PORTRAIT_PROMPT_MAX,
  type PortraitSubject,
  portraitHasSubject,
  portraitPromptFor,
} from "./Portrait.js";

const style = { style: HOUSE_PORTRAIT_STYLE };

const subject = (
  over: Partial<Omit<PortraitSubject, "sheet">> & { readonly sheet?: Partial<CharacterSheet> } = {},
): PortraitSubject & { readonly name: string } => ({
  name: "Brannoc Ironvein",
  race: "Dwarf",
  subrace: "Hill Dwarf",
  className: "Paladin",
  ...over,
  sheet: { ...emptyCharacterSheet, ...over.sheet },
});

describe("portraitPromptFor", () => {
  it("names the subrace in place of the race, then the class and subclass", () => {
    const prompt = portraitPromptFor(
      subject({ sheet: { identity: { subclass: "Oath of Devotion" } } }),
      style,
    );
    expect(
      prompt.startsWith("Head-and-shoulders portrait of a Hill Dwarf Paladin, Oath of Devotion."),
    ).toBe(true);
    expect(prompt.endsWith(HOUSE_PORTRAIT_STYLE)).toBe(true);
  });

  it("drops whatever part is missing", () => {
    expect(portraitPromptFor(subject({ subrace: null }), style)).toContain("of a Dwarf Paladin.");
    expect(portraitPromptFor(subject({ subrace: null, race: null }), style)).toContain(
      "of a Paladin.",
    );
    expect(
      portraitPromptFor(subject({ subrace: null, race: "Elf", className: null }), style),
    ).toContain("of an Elf.");
    expect(
      portraitPromptFor(subject({ subrace: null, race: null, className: null }), style),
    ).toContain("of an adventurer.");
  });

  it("carries the appearance verbatim and leaves the background out beside it", () => {
    const prompt = portraitPromptFor(
      subject({
        sheet: {
          identity: { background: "Acolyte" },
          story: { appearance: "Grey-bearded, broad, a burn scar across one hand" },
        },
      }),
      style,
    );
    expect(prompt).toContain("Grey-bearded, broad, a burn scar across one hand.");
    expect(prompt).not.toContain("acolyte");
  });

  it("uses the background as a hint only when there is no appearance", () => {
    const prompt = portraitPromptFor(
      subject({ sheet: { identity: { background: "Acolyte" } } }),
      style,
    );
    expect(prompt).toContain("Something of an acolyte about them.");
  });

  it("names at most two carried lines: equipped gear first, then the weapons they attack with", () => {
    const prompt = portraitPromptFor(
      subject({
        sheet: {
          inventory: [
            { name: "Backpack" },
            { name: "Chain Mail", equipped: true },
            { name: "Shield", equipped: true },
            { name: "Warhammer", equipped: true },
          ],
          actions: [{ id: "a", name: "Longsword", cost: "action", source: "weapon" }],
        },
      }),
      style,
    );
    expect(prompt).toContain("Equipped with chain mail and shield.");
    expect(prompt).not.toMatch(/warhammer|longsword|backpack/i);
  });

  it("falls back to weapon actions when nothing is ticked equipped, once each", () => {
    const prompt = portraitPromptFor(
      subject({
        sheet: {
          inventory: [{ name: "Longsword" }],
          actions: [
            { id: "a", name: "Longsword", cost: "action", source: "weapon" },
            { id: "b", name: "longsword", cost: "action", source: "weapon" },
            { id: "c", name: "Sacred Flame", cost: "action", source: "spell" },
          ],
        },
      }),
      style,
    );
    expect(prompt).toContain("Equipped with longsword.");
    expect(prompt).not.toMatch(/sacred flame/i);
  });

  it("never carries the name, the backstory, the story lines or the ability scores", () => {
    const character = subject({
      sheet: {
        notes: "Fed something in the cellar",
        abilities: [{ label: "STR", score: "16", modifier: "+3" }],
        story: { bond: "My forge", ideal: "Craft", flaw: "Pride", personality: "Gruff" },
      },
    });
    const prompt = portraitPromptFor(character, style);
    for (const leak of [
      character.name,
      "Brannoc",
      "cellar",
      "forge",
      "Craft",
      "Pride",
      "Gruff",
      "STR",
      "16",
    ]) {
      expect(prompt).not.toContain(leak);
    }
  });

  it("stays within its bound however long the labels are", () => {
    const long = "x".repeat(2_000);
    const prompt = portraitPromptFor(
      {
        race: long,
        subrace: long,
        className: long,
        sheet: {
          ...emptyCharacterSheet,
          identity: { subclass: long, background: long },
          story: { appearance: long },
          inventory: [
            { name: `a${long}`, equipped: true },
            { name: `b${long}`, equipped: true },
          ],
        },
      },
      style,
    );
    expect(prompt.length).toBeLessThanOrEqual(PORTRAIT_PROMPT_MAX);
    expect(prompt.endsWith(HOUSE_PORTRAIT_STYLE)).toBe(true);
  });
});

describe("portraitHasSubject", () => {
  it("is false only when race, class, appearance and background are all empty", () => {
    const none = { race: null, subrace: null, className: " ", sheet: emptyCharacterSheet };
    expect(portraitHasSubject(none)).toBe(false);
    expect(portraitHasSubject({ ...none, race: "Elf" })).toBe(true);
    expect(portraitHasSubject({ ...none, className: "Wizard" })).toBe(true);
    expect(
      portraitHasSubject({
        ...none,
        sheet: { ...emptyCharacterSheet, story: { appearance: "Tall" } },
      }),
    ).toBe(true);
    expect(
      portraitHasSubject({
        ...none,
        sheet: { ...emptyCharacterSheet, identity: { background: "Sage" } },
      }),
    ).toBe(true);
  });
});

describe("sheet.story.appearance", () => {
  const decode = Schema.decodeUnknownSync(CharacterSheet);

  it("is optional, so a sheet written before it still decodes", () => {
    expect(decode({ notes: "", abilities: [], traits: [], story: { bond: "The forge" } })).toEqual({
      notes: "",
      abilities: [],
      traits: [],
      story: { bond: "The forge" },
    });
  });

  it("holds a line up to its bound and refuses one past it", () => {
    const at = "x".repeat(APPEARANCE_MAX);
    expect(decode({ ...emptyCharacterSheet, story: { appearance: at } }).story?.appearance).toBe(
      at,
    );
    expect(() => decode({ ...emptyCharacterSheet, story: { appearance: `${at}x` } })).toThrow();
  });
});
