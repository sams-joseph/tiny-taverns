import type { CampaignMembership } from "@taverns/api";
import { describe, expect, it } from "vitest";
import {
  emptyDraft,
  payloadFrom,
  problemsIn,
  refused,
  tablesForNewCharacter,
  type CharacterDraft,
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
    expect(payloadFrom(draftWith({}))).toEqual({ name: "Sorrel" });
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
