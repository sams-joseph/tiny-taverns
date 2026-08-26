import type { CampaignMembership } from "@taverns/api";
import { describe, expect, it } from "vitest";
import {
  emptyDraft,
  payloadFrom,
  problemsIn,
  refused,
  seededDraft,
  tablesForNewCharacter,
  type CharacterDraft,
  type SeededField,
} from "./create";

/**
 * The two decisions the create form makes that are not rendering.
 *
 * Both are here for the reason `chronicle/fight.ts` and `characters/live.ts`
 * have their own files and their own tests: **each has a branch that renders
 * perfectly plausible output when it is wrong.** A picker offering a table you
 * run looks exactly like a picker; a payload sending `""` where it means
 * *absent* looks exactly like a save, right up to the 400 nobody can read.
 */

/**
 * A membership with the two fields this function reads.
 *
 * `as unknown as` rather than a real `CampaignMembership`: the decoded class
 * carries the whole campaign row and nothing here touches any of it, so building
 * one would be nine fields of noise around the two that decide the answer.
 */
const table = (id: string, name: string, role: "dm" | "player"): CampaignMembership =>
  ({
    campaign: { id, name },
    role,
    joinedAt: "2026-07-02T10:00:00.000Z",
  }) as unknown as CampaignMembership;

const draftWith = (part: Partial<CharacterDraft>): CharacterDraft => ({
  ...emptyDraft,
  name: "Sorrel",
  ...part,
});

describe("which tables a character of your own may go into", () => {
  it("is the ones you play at, and not the ones you run", () => {
    // `ensureCampaignReadable` would let a DM through at their own table and the
    // server documents that as harmless — this is the *mode* talking, not the
    // endpoint. A table you run has no player screen to be on, and the way to
    // write a character there is `campaign/CharacterDialog.tsx`.
    const tables = tablesForNewCharacter([
      table("a", "The Salt Road", "player"),
      table("b", "A table I run", "dm"),
      table("c", "The Hag's Bargain", "player"),
    ]);
    expect(tables.map((row) => row.campaign.name)).toEqual(["The Salt Road", "The Hag's Bargain"]);
  });

  it("is empty for an account that only runs games, which is not the same as no tables", () => {
    // The case a `memberships.length` check gets wrong, and the reason the
    // roster's empty state has three branches rather than two.
    expect(tablesForNewCharacter([table("b", "A table I run", "dm")])).toEqual([]);
    expect(tablesForNewCharacter([])).toEqual([]);
  });
});

describe("what the player is told before anything is sent", () => {
  it("insists on a name and nothing else", () => {
    expect(problemsIn(emptyDraft).name).toBe("Give them a name.");
    // Every other field is optional on the payload, so a character who is only
    // a name is a legal one — which is what makes this form usable in the
    // thirty seconds before a session starts.
    expect(refused(problemsIn(draftWith({})))).toBe(false);
    expect(problemsIn(draftWith({ name: "   " })).name).toBe("Give them a name.");
  });

  it("says what a number is before the schema says it in schema", () => {
    // The contract catches all of these on its own and never sends them — but
    // `Expected a value between 0 and 40 at ["ac"]` is a sentence for whoever
    // wrote the schema.
    expect(problemsIn(draftWith({ level: "0" })).level).toBe("Between 1 and 100.");
    expect(problemsIn(draftWith({ level: "101" })).level).toBe("Between 1 and 100.");
    expect(problemsIn(draftWith({ level: "two" })).level).toBe("A level is a whole number.");
    expect(problemsIn(draftWith({ ac: "41" })).ac).toBe("Between 0 and 40.");
    expect(problemsIn(draftWith({ hpMax: "-1" })).hpMax).toBe("Between 0 and 10,000.");
    // Blank is "I have not filled this in", and is never a problem.
    expect(refused(problemsIn(draftWith({ level: "", ac: "", hpMax: "" })))).toBe(false);
  });

  it("refuses a link that is not one, because the link is rendered as an href", () => {
    expect(problemsIn(draftWith({ sheetUrl: "javascript:alert(1)" })).sheetUrl).toBe(
      "A link starting http:// or https://.",
    );
    expect(refused(problemsIn(draftWith({ sheetUrl: "https://example.com/s" })))).toBe(false);
  });
});

describe("the payload", () => {
  it("omits what was left blank rather than sending a null or an empty string", () => {
    // Every optional on `CharacterOwnCreate` is optional-by-omission — there is
    // no `Schema.NullOr` on any of them, unlike the update — and `species` and
    // `className` are `NonEmptyString`, so `""` is refused by the contract
    // locally and the form fails on a field left deliberately blank.
    //
    // `level` is the one thing an untouched draft still carries: the captain's
    // third decision is that a character starts at 1, so an empty form is a
    // level-1 character rather than one whose level nobody has said.
    expect(payloadFrom(draftWith({}))).toEqual({ name: "Sorrel", level: 1 });
  });

  it("trims, and carries every field that was filled in", () => {
    expect(
      payloadFrom(
        draftWith({
          name: "  Sorrel Ash  ",
          playerName: " Ilse ",
          level: "3",
          species: " Wood elf ",
          className: " Druid ",
          ac: "14",
          hpMax: "22",
          sheetUrl: " https://example.com/sorrel ",
        }),
      ),
    ).toEqual({
      name: "Sorrel Ash",
      playerName: "Ilse",
      level: 3,
      species: "Wood elf",
      className: "Druid",
      ac: 14,
      hpMax: 22,
      sheetUrl: "https://example.com/sorrel",
    });
  });

  it("sends no document at all when nothing was typed into one", () => {
    // So a brand new character's `body` is the column default, which is the
    // same shape a DM-typed one has. A `{ notes: "" }` would be a document
    // written to say nothing.
    expect(payloadFrom(draftWith({ notes: "   " })).sheet).toBeUndefined();
    expect(payloadFrom(draftWith({ notes: "Raised by the road." })).sheet).toEqual({
      notes: "Raised by the road.",
      abilities: [],
      traits: [],
    });
  });

  it("has no field for a live column, a visibility or an account", () => {
    // Not a filter this function applies — `CharacterOwnCreate` has no field for
    // any of them, so a control for one would not compile and the encoder would
    // drop it anyway. Asserted at runtime as well, because the whole slice's
    // disclosure property rests on the row coming out at its column defaults.
    const payload = payloadFrom(
      draftWith({ name: "Sorrel", level: "1", ac: "14", hpMax: "9" }),
    ) as Record<string, unknown>;
    for (const key of ["hpCurrent", "tempHp", "conditions", "visibility", "accountId"]) {
      expect(payload).not.toHaveProperty(key);
    }
  });
});

/**
 * The seed, on the manual path.
 *
 * `packages/api/src/Ruleset.test.ts` pins the arithmetic. What is pinned here is
 * the half that is this form's own and is wrong *silently*: which boxes a pick
 * is allowed to write, and which it must leave alone for ever.
 */
describe("what a class and species pick fills in", () => {
  const untouched: ReadonlySet<SeededField> = new Set();

  it("starts every character at level 1, before anything is picked", () => {
    // A constant rather than part of the seed: a level is chosen in 5e, not
    // calculated, so it does not wait on a class.
    expect(emptyDraft.level).toBe("1");
    expect(emptyDraft.species).toBe("");
    expect(emptyDraft.className).toBe("");
  });

  it("fills in the hit die and the unarmoured base once a class is picked", () => {
    const picked = seededDraft(draftWith({ className: "Druid", species: "Elf" }), untouched);
    // d8, and no ability scores on this form — so the die and a bare 10.
    expect(picked.hpMax).toBe("8");
    expect(picked.ac).toBe("10");
  });

  it("re-seeds when the pick changes, so a druid's hit points do not survive a barbarian", () => {
    const druid = seededDraft(draftWith({ className: "Druid", species: "Elf" }), untouched);
    const barbarian = seededDraft({ ...druid, className: "Barbarian" }, untouched);
    expect(barbarian.hpMax).toBe("12");
    // Dwarven Toughness, the one species trait that reaches any of the three.
    expect(seededDraft({ ...barbarian, species: "Dwarf" }, untouched).hpMax).toBe("13");
  });

  it("never writes over a number the player typed", () => {
    // The whole reason the screen remembers which boxes were touched. Without
    // it, picking a class after typing a hit point total silently discards it —
    // which renders as a perfectly ordinary form.
    const typed = draftWith({ className: "Druid", species: "Elf", ac: "17", hpMax: "34" });
    const seeded = seededDraft(typed, new Set<SeededField>(["ac", "hpMax"]));
    expect(seeded.ac).toBe("17");
    expect(seeded.hpMax).toBe("34");
    // And one at a time: the AC is the player's and the hit points are still
    // the class's.
    expect(seededDraft(typed, new Set<SeededField>(["ac"]))).toMatchObject({
      ac: "17",
      hpMax: "8",
    });
  });

  it("leaves the hit points alone until a class is picked", () => {
    // There is no hit die to read, so there is no number to write. The armour
    // class still seeds, because 10 is true of everybody.
    const speciesOnly = seededDraft(draftWith({ species: "Dwarf" }), untouched);
    expect(speciesOnly.hpMax).toBe("");
    expect(speciesOnly.ac).toBe("10");
  });

  it("sends the vocabulary's own labels, which is what makes them readable back", () => {
    // No key column and no migration: the link from a row to the vocabulary is
    // the label, so what the picker writes has to be the label exactly.
    const payload = payloadFrom(seededDraft(draftWith({ className: "Monk" }), untouched));
    expect(payload.className).toBe("Monk");
    expect(payload.hpMax).toBe(8);
    expect(payload.level).toBe(1);
  });
});
