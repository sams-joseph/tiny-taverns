import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { SheetBody } from "./Character.js";
import type { SpellId } from "./Ids.js";
import { Spell, emptySpellBody } from "./Spell.js";
import {
  type CharacterSpellRules,
  sheetWithSpellSelection,
  spellKnownFor,
  spellSelectionProblems,
} from "./Spellbook.js";

/**
 * The picker's save over a sheet that holds spells a level-up learned past
 * the class list (`SpellKnown.learnedBy`): the list cannot show them, so the
 * save cannot have meant to drop them.
 */

const uuidOf = (seed: string): string => {
  const hex = [...seed].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16);
  return `${hex.padStart(8, "0")}-0000-4000-8000-000000000000`;
};

const spellNamed = (name: string, level: number): Spell =>
  Schema.decodeUnknownSync(Spell)({
    id: uuidOf(name),
    campaignId: null,
    accountId: null,
    derivedFrom: null,
    name,
    level,
    schoolIndex: "evocation",
    schoolName: "Evocation",
    ritual: false,
    concentration: false,
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    classIndexes: ["bard"],
    classNames: ["Bard"],
    subclassIndexes: [],
    subclassNames: [],
    spell: emptySpellBody,
    visibility: "shared",
    origin: "system",
    assistantTurnId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

const SHATTER = spellNamed("Shatter", 2);
const HEROISM = spellNamed("Heroism", 1);
const FIREBALL = spellNamed("Fireball", 3);

const BOOK: CharacterSpellRules = {
  className: "Bard",
  level: 10,
  highestSlotLevel: 5,
  mode: "known",
  limits: { spellsKnown: 14 },
  spells: [
    { spell: SHATTER, list: "class" },
    { spell: HEROISM, list: "class" },
  ],
};

const SHEET: SheetBody = {
  abilities: [],
  traits: [],
  actions: [
    {
      id: `spell:${FIREBALL.id}`,
      name: "Fireball",
      source: "spell",
      spellId: FIREBALL.id as SpellId,
      derived: true,
    },
    {
      id: `spell:${SHATTER.id}`,
      name: "Shatter",
      source: "spell",
      spellId: SHATTER.id as SpellId,
      derived: true,
    },
  ],
  spellcasting: {
    known: [
      { name: "Fireball", level: 3, spellId: FIREBALL.id as SpellId, learnedBy: "magicalSecrets" },
      { name: "Shatter", level: 2, spellId: SHATTER.id as SpellId, learnedBy: "magicalSecrets" },
    ],
  },
};

describe("sheetWithSpellSelection", () => {
  it("keeps a spell learned past the list, and its line, through a picker save", () => {
    const saved = sheetWithSpellSelection(SHEET, BOOK, [
      spellKnownFor({ spell: HEROISM, list: "class" }),
    ]);
    // Fireball is not on the bard list the picker drew: it stays. Shatter is,
    // and the save left it out, so it goes like any other unpicked spell.
    expect(saved.spellcasting?.known?.map((spell) => spell.name)).toEqual(["Heroism", "Fireball"]);
    expect(saved.actions?.map((action) => action.name).sort()).toEqual(["Fireball", "Heroism"]);
  });

  it("keeps the mark on a spell learned past the list that the picker also lists", () => {
    const saved = sheetWithSpellSelection(SHEET, BOOK, [
      spellKnownFor({ spell: SHATTER, list: "class" }),
    ]);
    expect(saved.spellcasting?.known).toContainEqual(
      expect.objectContaining({ name: "Shatter", learnedBy: "magicalSecrets" }),
    );
  });
});

describe("spellSelectionProblems", () => {
  it("counts Magical Secrets off the list against a bard's spells known", () => {
    const classSpells = Array.from({ length: 13 }, (_, index) =>
      spellNamed(`Bard Spell ${String(index + 1)}`, 1),
    );
    const book: CharacterSpellRules = {
      ...BOOK,
      spells: classSpells.map((spell) => ({ spell, list: "class" as const })),
    };
    const secrets = [
      { name: "Fireball", level: 3, spellId: FIREBALL.id as SpellId, learnedBy: "magicalSecrets" },
      {
        name: "Counterspell",
        level: 3,
        spellId: uuidOf("Counterspell") as SpellId,
        learnedBy: "magicalSecrets",
      },
    ] as const;
    const known = (count: number) => [
      ...classSpells.slice(0, count).map((spell) => spellKnownFor({ spell, list: "class" })),
      ...secrets,
    ];
    expect(spellSelectionProblems(book, known(12))).toEqual([]);
    expect(spellSelectionProblems(book, known(13))).toEqual([
      "Choose at most 14 leveled spells known.",
    ]);
  });
});
