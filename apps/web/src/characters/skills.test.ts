import { describe, expect, it } from "vitest";
import { skillDrafts, skillsFrom, STANDARD_SKILLS } from "./skills";

/**
 * The skills editor's pure half. The failure it exists to catch is the quiet
 * one: a save that writes all eighteen rows fills the panel with a list of what
 * a character is *not* good at, and a save that writes only the proficient ones
 * silently loses the bonus somebody typed against a skill they are not
 * proficient in — which the shipped reader already draws.
 */

describe("the rows the dialog opens with", () => {
  it("draws the list even on a sheet with no skills", () => {
    const drafts = skillDrafts([]);
    expect(drafts).toHaveLength(STANDARD_SKILLS.length);
    expect(drafts.every((draft) => !draft.proficient && draft.bonus === "")).toBe(true);
  });

  it("keys each one off the ability the list names", () => {
    expect(skillDrafts([]).find((draft) => draft.name === "Athletics")?.ability).toBe("STR");
    expect(skillDrafts([]).find((draft) => draft.name === "Stealth")?.ability).toBe("DEX");
  });

  it("seeds from the document", () => {
    const drafts = skillDrafts([
      { name: "Athletics", ability: "STR", bonus: "+7", proficient: true },
    ]);
    expect(drafts.find((draft) => draft.name === "Athletics")).toMatchObject({
      bonus: "+7",
      proficient: true,
    });
  });

  /**
   * The list is a default for a row nobody has written, never a correction to
   * one somebody has — a table running Intimidation off Strength typed that.
   */
  it("keeps the document's keyed ability over the list's", () => {
    const drafts = skillDrafts([{ name: "Intimidation", ability: "STR" }]);
    expect(drafts.find((draft) => draft.name === "Intimidation")?.ability).toBe("STR");
  });

  it("keeps a skill that is not on the list", () => {
    const drafts = skillDrafts([{ name: "Piloting", ability: "DEX", proficient: true }]);
    expect(drafts).toHaveLength(STANDARD_SKILLS.length + 1);
    expect(drafts[drafts.length - 1]).toMatchObject({ name: "Piloting", extra: true });
  });
});

describe("what goes on the wire", () => {
  it("writes nothing at all for a sheet nobody has marked", () => {
    expect(skillsFrom(skillDrafts([]))).toEqual([]);
  });

  it("writes a proficient skill with its keyed ability", () => {
    const drafts = skillDrafts([]).map((draft) =>
      draft.name === "Perception" ? { ...draft, proficient: true } : draft,
    );
    expect(skillsFrom(drafts)).toEqual([{ name: "Perception", ability: "WIS", proficient: true }]);
  });

  /** Not an edge case: it is how a sheet records the number you add anyway. */
  it("keeps a bonus written against a skill nobody is proficient in", () => {
    const drafts = skillDrafts([]).map((draft) =>
      draft.name === "Arcana" ? { ...draft, bonus: "-1" } : draft,
    );
    expect(skillsFrom(drafts)).toEqual([{ name: "Arcana", ability: "INT", bonus: "-1" }]);
  });

  it("drops a mark that has been taken off again", () => {
    const drafts = skillDrafts([{ name: "Athletics", ability: "STR", proficient: true }]).map(
      (draft) => (draft.name === "Athletics" ? { ...draft, proficient: false } : draft),
    );
    expect(skillsFrom(drafts)).toEqual([]);
  });

  it("omits the mark rather than writing it false", () => {
    const drafts = skillDrafts([]).map((draft) =>
      draft.name === "Medicine" ? { ...draft, bonus: "+2" } : draft,
    );
    expect(skillsFrom(drafts)[0]).not.toHaveProperty("proficient");
  });
});
