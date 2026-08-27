import type { CampaignMembership, CharacterOption, OptionKind } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { abilityDrafts, abilitySummary, assignScores } from "./abilities";
import {
  backgroundNote,
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

/**
 * One row of a campaign's rules vocabulary.
 *
 * `as unknown as` rather than a real `CharacterOption`, for the reason `table`
 * above is one: the decoded union carries the ownership pair, the provenance
 * tail and two timestamps, and `seededDraft` reads the name, the kind and the
 * document. Building the rest would be nine fields of noise around the three
 * that decide the answer.
 */
const option = (kind: OptionKind, name: string, body: Record<string, unknown>): CharacterOption =>
  ({ id: `option-${name}`, kind, name, body }) as unknown as CharacterOption;

/**
 * What a table offers, as the picker was built from it.
 *
 * The bundled entries these tests name, **plus a homebrew class, a homebrew
 * species and a homebrew background** — because the whole point of the
 * vocabulary being a read is that the seed cannot tell one from the other, and
 * a fixture holding only bundled rows would never show that. The background is
 * the sharpest case of it: every bundled one grants nothing at all, so a
 * fixture without a homebrew one could not tell a working grant from a missing
 * one.
 */
const VOCABULARY: ReadonlyArray<CharacterOption> = [
  option("class", "Druid", { hitDie: 8, unarmouredAc: ["DEX"] }),
  option("class", "Barbarian", { hitDie: 12, unarmouredAc: ["DEX", "CON"] }),
  option("class", "Monk", { hitDie: 8, unarmouredAc: ["DEX", "WIS"] }),
  option("class", "Wizard", { hitDie: 6, unarmouredAc: ["DEX"] }),
  /** *Bloodsworn, d10, unarmoured AC DEX + CON* — this table's own. */
  option("class", "Bloodsworn", { hitDie: 10, unarmouredAc: ["DEX", "CON"] }),
  option("species", "Elf", { hpPerLevel: 0 }),
  option("species", "Dwarf", { hpPerLevel: 1 }),
  option("species", "Marshfolk", { hpPerLevel: 2 }),
  /** All sixteen bundled backgrounds are this shape: a name and no grant. */
  option("background", "Soldier", { abilityIncreases: [] }),
  /** *+2 CON, +1 WIS* — this table's own, and where a grant actually comes from. */
  option("background", "Salt-runner", {
    abilityIncreases: [
      { ability: "CON", amount: 2 },
      { ability: "WIS", amount: 1 },
    ],
  }),
];

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
    expect(payloadFrom(draftWith({}), VOCABULARY)).toEqual({ name: "Sorrel", level: 1 });
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
        VOCABULARY,
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
    expect(payloadFrom(draftWith({ notes: "   " }), VOCABULARY).sheet).toBeUndefined();
    expect(payloadFrom(draftWith({ notes: "Raised by the road." }), VOCABULARY).sheet).toEqual({
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
      VOCABULARY,
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
    const picked = seededDraft(
      draftWith({ className: "Druid", species: "Elf" }),
      untouched,
      VOCABULARY,
    );
    // d8, and no ability scores on this form — so the die and a bare 10.
    expect(picked.hpMax).toBe("8");
    expect(picked.ac).toBe("10");
  });

  it("re-seeds when the pick changes, so a druid's hit points do not survive a barbarian", () => {
    const druid = seededDraft(
      draftWith({ className: "Druid", species: "Elf" }),
      untouched,
      VOCABULARY,
    );
    const barbarian = seededDraft({ ...druid, className: "Barbarian" }, untouched, VOCABULARY);
    expect(barbarian.hpMax).toBe("12");
    // Dwarven Toughness, the one species trait that reaches any of the three.
    expect(seededDraft({ ...barbarian, species: "Dwarf" }, untouched, VOCABULARY).hpMax).toBe("13");
  });

  it("never writes over a number the player typed", () => {
    // The whole reason the screen remembers which boxes were touched. Without
    // it, picking a class after typing a hit point total silently discards it —
    // which renders as a perfectly ordinary form.
    const typed = draftWith({ className: "Druid", species: "Elf", ac: "17", hpMax: "34" });
    const seeded = seededDraft(typed, new Set<SeededField>(["ac", "hpMax"]), VOCABULARY);
    expect(seeded.ac).toBe("17");
    expect(seeded.hpMax).toBe("34");
    // And one at a time: the AC is the player's and the hit points are still
    // the class's.
    expect(seededDraft(typed, new Set<SeededField>(["ac"]), VOCABULARY)).toMatchObject({
      ac: "17",
      hpMax: "8",
    });
  });

  it("leaves the hit points alone until a class is picked", () => {
    // There is no hit die to read, so there is no number to write. The armour
    // class still seeds, because 10 is true of everybody.
    const speciesOnly = seededDraft(draftWith({ species: "Dwarf" }), untouched, VOCABULARY);
    expect(speciesOnly.hpMax).toBe("");
    expect(speciesOnly.ac).toBe("10");
  });

  it("cannot tell this table's own class from a bundled one", () => {
    // **The acceptance arithmetic of the homebrew slice.** A d10 class whose
    // unarmoured defence adds constitution seeds exactly as a bundled one
    // does, because nothing in `seedFor` asks where an entry came from — the
    // *only* thing that changed on this screen is where the list comes from.
    const picked = seededDraft(
      draftWith({ className: "Bloodsworn", species: "Marshfolk" }),
      untouched,
      VOCABULARY,
    );
    // d10 + CON 0, plus Marshfolk's two per level at level 1.
    expect(picked.hpMax).toBe("12");
    expect(picked.ac).toBe("10");
    // And the label the picker wrote is what the payload sends, which is the
    // whole of the link between a character and the option it was made from.
    expect(payloadFrom(picked, VOCABULARY).className).toBe("Bloodsworn");
    expect(payloadFrom(picked, VOCABULARY).species).toBe("Marshfolk");
  });

  it("seeds nothing at all for a label this table has no option for", () => {
    // Reachable from a URL, from a stale form, and from a class that was
    // removed between the picker being drawn and the pick being made. There is
    // no hit die to read and **no fuzzy matching to fall back on** — a prefix
    // rule would read "Circle of the Moon Druid" as a druid, which is a guess
    // written into a number somebody reads out at the table, and it is a worse
    // guess under homebrew because a campaign may genuinely have a "Moon Druid"
    // that is a different class.
    const unknown = seededDraft(
      draftWith({ className: "Circle of the Moon Druid", species: "Half-orc" }),
      untouched,
      VOCABULARY,
    );
    expect(unknown.hpMax).toBe("");
    expect(unknown.ac).toBe("10");
    // The label is kept verbatim and sent verbatim. Nothing rewrites it.
    expect(payloadFrom(unknown, VOCABULARY).className).toBe("Circle of the Moon Druid");
  });

  it("matches a label case-insensitively and exactly, and no other way", () => {
    expect(seededDraft(draftWith({ className: "druid" }), untouched, VOCABULARY).hpMax).toBe("8");
    expect(seededDraft(draftWith({ className: "  DRUID " }), untouched, VOCABULARY).hpMax).toBe(
      "8",
    );
    expect(seededDraft(draftWith({ className: "Blood" }), untouched, VOCABULARY).hpMax).toBe("");
  });

  it("seeds nothing when the table's vocabulary has not arrived yet", () => {
    // The read is in flight, so the picker is empty and there is nothing to
    // have picked. An empty list is the honest state rather than a fallback: a
    // hard-coded twelve here would offer classes this table may not have.
    expect(seededDraft(draftWith({ className: "Druid" }), untouched, []).hpMax).toBe("");
  });

  it("sends the vocabulary's own labels, which is what makes them readable back", () => {
    // No key column and no migration: the link from a row to the vocabulary is
    // the label, so what the picker writes has to be the label exactly.
    const payload = payloadFrom(
      seededDraft(draftWith({ className: "Monk" }), untouched, VOCABULARY),
      VOCABULARY,
    );
    expect(payload.className).toBe("Monk");
    expect(payload.hpMax).toBe(8);
    expect(payload.level).toBe(1);
  });
});

/**
 * The seed, once the manual form has ability scores to read.
 *
 * **This is the gap the slice closed, pinned as arithmetic.** Hob assigns the
 * standard array to the ranking it chose and resolves `seedFor` against it; the
 * manual form passed `abilities: []` and resolved the same function against six
 * absent cells. Both were right and they disagreed by two hit points and three
 * of armour class on a Dwarf Barbarian, which is exactly the kind of wrong that
 * renders as an ordinary form.
 *
 * The arithmetic itself is `packages/api/src/Ruleset.test.ts`'s; what is here is
 * that this caller hands the scores over, that a draft with none still gets the
 * old honest answer, and that the seed is still only ever *applied* — never
 * recomputed.
 */
describe("what the ability scores fill in", () => {
  const untouched: ReadonlySet<SeededField> = new Set();

  /** The six cells as the shared editor holds them, given scores in draw order. */
  const scored = (...scores: ReadonlyArray<number>) => assignScores(abilityDrafts([]), scores);

  it("seeds a Dwarf Barbarian the same as Hob's draft of one does", () => {
    // The captain's own example. Hob ranks a barbarian CON-first, so the 15 is
    // constitution and the 14 dexterity: 12 (d12) + 2 (CON 15) + 1 (Dwarven
    // Toughness) = 15 hit points, and 10 + 2 (DEX 14) + 2 (CON 15) = 14 armour
    // class — Unarmoured Defense, the reason `unarmouredAc` is a list.
    const hand = seededDraft(
      draftWith({
        className: "Barbarian",
        species: "Dwarf",
        // STR 13, DEX 14, CON 15, INT 8, WIS 12, CHA 10.
        abilities: scored(13, 14, 15, 8, 12, 10),
      }),
      untouched,
      VOCABULARY,
    );
    expect(hand.hpMax).toBe("15");
    expect(hand.ac).toBe("14");

    // And the same character with the standard array left in draw order is a
    // *different* set of scores, which is why the array is a press rather than
    // a default on this form: 15 in strength buys nothing here.
    const drawOrder = seededDraft(
      draftWith({
        className: "Barbarian",
        species: "Dwarf",
        abilities: scored(15, 14, 13, 12, 10, 8),
      }),
      untouched,
      VOCABULARY,
    );
    expect(drawOrder.hpMax).toBe("14");
  });

  it("still seeds from a bare baseline when nobody has typed a score", () => {
    // Not required, by the captain's boundary: a player who wants to get in now
    // and fix it later gets the answer the form has always given them, and the
    // copy beside the boxes says so.
    const none = seededDraft(
      draftWith({ className: "Barbarian", species: "Dwarf" }),
      untouched,
      VOCABULARY,
    );
    expect(none.hpMax).toBe("13");
    expect(none.ac).toBe("10");
    expect(abilitySummary(emptyDraft.abilities)).toBeUndefined();
  });

  it("reads a partly filled set, because a cell with no score is not a cell", () => {
    // `abilitiesFrom` drops a blank row on both sides of this — the seed and the
    // payload — so four of six is a real thing to fill in and the two cannot
    // disagree about what the fifth means.
    const conOnly = abilityDrafts([]).map((cell) =>
      cell.label === "CON" ? { ...cell, score: "16" } : cell,
    );
    const some = seededDraft(
      draftWith({ className: "Wizard", abilities: conOnly }),
      untouched,
      VOCABULARY,
    );
    // d6 plus a +3 constitution, and a dexterity nobody typed is still +0.
    expect(some.hpMax).toBe("9");
    expect(some.ac).toBe("10");
    expect(abilitySummary(conOnly)).toBe("CON 16");
  });

  it("re-seeds when a score changes, and still never writes over a typed number", () => {
    const druid = seededDraft(
      draftWith({ className: "Druid", species: "Elf" }),
      untouched,
      VOCABULARY,
    );
    expect(druid.hpMax).toBe("8");
    // The scores arrive after the class, which is the ordinary order on the
    // form: the boxes have to follow, or they hold the answer for a character
    // whose abilities were all 10.
    const withScores = seededDraft(
      { ...druid, abilities: scored(8, 14, 15, 12, 15, 10) },
      untouched,
      VOCABULARY,
    );
    expect(withScores.hpMax).toBe("10");
    expect(withScores.ac).toBe("12");
    // And a box the player typed in is still theirs, whatever the scores do.
    expect(
      seededDraft(
        { ...druid, abilities: scored(8, 14, 15, 12, 15, 10) },
        new Set<SeededField>(["ac"]),
        VOCABULARY,
      ).ac,
    ).toBe(druid.ac);
  });

  it("sends the six cells as part of one document, with the modifier beside each", () => {
    const payload = payloadFrom(
      seededDraft(
        draftWith({
          className: "Barbarian",
          species: "Dwarf",
          abilities: scored(13, 14, 15, 8, 12, 10),
        }),
        untouched,
        VOCABULARY,
      ),
      VOCABULARY,
    );
    expect(payload.hpMax).toBe(15);
    expect(payload.ac).toBe(14);
    // Written in the same object literal as the score, so the one thing the
    // document cannot survive — the two disagreeing — is not expressible.
    expect(payload.sheet?.abilities).toEqual([
      { label: "STR", score: "13", modifier: "+1" },
      { label: "DEX", score: "14", modifier: "+2" },
      { label: "CON", score: "15", modifier: "+2" },
      { label: "INT", score: "8", modifier: "-1" },
      { label: "WIS", score: "12", modifier: "+1" },
      { label: "CHA", score: "10", modifier: "+0" },
    ]);
    // The scores are enough on their own to send a document; the backstory is
    // no longer the only key this form writes.
    expect(payload.sheet?.notes).toBe("");
  });

  it("sends no document at all when neither a backstory nor a score was typed", () => {
    // Unchanged, and it is what keeps a brand new character's `body` the same
    // shape as one the DM typed.
    expect(payloadFrom(draftWith({}), VOCABULARY).sheet).toBeUndefined();
  });

  it("refuses a score the editor would not have handed back", () => {
    // A backstop rather than the sentence a player normally reads —
    // `AbilityScoresDialog` checks first. It is here because `Ability.score` is
    // a `NonEmptyString` and the contract has no range check to fall back on.
    const wild = draftWith({ abilities: scored(400, 10, 10, 10, 10, 10) });
    expect(problemsIn(wild).abilities).toBe("An ability score is a whole number, 1 to 30.");
    expect(refused(problemsIn(wild))).toBe(true);
  });
});

/**
 * The third picker, and the one that changes a number the player typed.
 *
 * **This is the whole of what the background slice added to this form.** A
 * class and a species fill in the two boxes below the row; a background raises
 * the *ability scores*, so the two boxes move and the document that gets sent
 * is not the one the editor holds. The arithmetic is
 * `packages/api/src/Ruleset.test.ts`'s; what is pinned here is this form's own
 * half — that the raised cells are what the payload carries, that the boxes it
 * holds are still what the player typed, and that changing the pick twice does
 * not apply anything twice.
 */
describe("what a background pick does", () => {
  const untouched: ReadonlySet<SeededField> = new Set();
  const scored = (...scores: ReadonlyArray<number>) => assignScores(abilityDrafts([]), scores);

  /** A druid with the standard array in draw order, so CON is the 13. */
  const aDruid = (background: string) =>
    draftWith({
      className: "Druid",
      species: "Elf",
      background,
      abilities: scored(15, 14, 13, 12, 10, 8),
    });

  it("re-seeds the two boxes, because the grant reaches them through the scores", () => {
    // Salt-runner is `+2 CON, +1 WIS`, so CON 13 becomes 15 and the d8 seeds
    // from `+2` rather than `+1`. Nothing else on the form moved.
    const plain = seededDraft(aDruid("Soldier"), untouched, VOCABULARY);
    const raised = seededDraft(aDruid("Salt-runner"), untouched, VOCABULARY);
    expect(plain.hpMax).toBe("9");
    expect(raised.hpMax).toBe("10");
    // Dexterity is untouched by this one, so the armour class is not.
    expect(raised.ac).toBe(plain.ac);
  });

  it("sends the raised cells, so the sheet and the two numbers agree", () => {
    // **The property the whole shape exists for.** If the payload carried
    // `abilitiesFrom(draft.abilities)` the sheet would say CON 13 while the hit
    // points beside it had been worked out from 15 — arithmetically right on
    // both sides and wrong together, which is the hardest kind to notice.
    const payload = payloadFrom(
      seededDraft(aDruid("Salt-runner"), untouched, VOCABULARY),
      VOCABULARY,
    );
    expect(payload.hpMax).toBe(10);
    expect(payload.sheet?.abilities).toContainEqual({
      label: "CON",
      score: "15",
      modifier: "+2",
    });
    expect(payload.sheet?.abilities).toContainEqual({
      label: "WIS",
      score: "11",
      modifier: "+0",
    });
    // And the label itself goes in the document rather than in a column: nothing
    // filters or sorts on a background, and it is not one of the three
    // `descriptor` is built from.
    expect(payload.sheet?.identity).toEqual({ background: "Salt-runner" });
  });

  it("never applies a grant twice, because the boxes hold what the player typed", () => {
    // The recompute trap this design refuses. Picking a background writes
    // nothing back into `draft.abilities`, so changing the pick is a fresh
    // answer rather than an un-apply followed by an apply — and picking the
    // same one again is the same answer.
    const once = seededDraft(aDruid("Salt-runner"), untouched, VOCABULARY);
    const again = seededDraft({ ...once, background: "Salt-runner" }, untouched, VOCABULARY);
    expect(again).toEqual(once);
    // Back to a bundled one, and the numbers go back with it.
    const back = seededDraft({ ...once, background: "Soldier" }, untouched, VOCABULARY);
    expect(back.hpMax).toBe("9");
    expect(back.abilities).toEqual(once.abilities);
  });

  it("changes nothing for a bundled background, which is all sixteen of them", () => {
    // The ordinary path rather than the empty one: the bundle ships names and
    // no grants, so on a table whose DM has written none this picker is a label
    // and the two boxes below it do not move.
    const none = seededDraft(aDruid(""), untouched, VOCABULARY);
    const bundled = seededDraft(aDruid("Soldier"), untouched, VOCABULARY);
    expect(bundled.hpMax).toBe(none.hpMax);
    expect(bundled.ac).toBe(none.ac);
    expect(payloadFrom(bundled, VOCABULARY).sheet?.abilities).toEqual(
      payloadFrom(none, VOCABULARY).sheet?.abilities,
    );
  });

  it("seeds nothing at all for a label this table has no background for", () => {
    // The same refusal the other two pickers make, and reachable the same three
    // ways. No fuzzy matching, so a free-text background typed on an older
    // sheet resolves to nothing and moves nothing.
    const unknown = seededDraft(aDruid("Herbalist's apprentice"), untouched, VOCABULARY);
    expect(unknown.hpMax).toBe("9");
    // The label is still kept verbatim and sent verbatim.
    expect(payloadFrom(unknown, VOCABULARY).sheet?.identity?.background).toBe(
      "Herbalist's apprentice",
    );
  });

  it("sends a document for a background alone, and none when nothing was said", () => {
    // A background is the third key this form writes into `sheet`, so it is
    // enough on its own — and an untouched form still sends no document at all,
    // which is what keeps a new character's `body` the column default.
    expect(payloadFrom(draftWith({ background: "Soldier" }), VOCABULARY).sheet?.identity).toEqual({
      background: "Soldier",
    });
    expect(payloadFrom(draftWith({}), VOCABULARY).sheet).toBeUndefined();
  });
});

describe("what the form says a background will do", () => {
  const scored = (...scores: ReadonlyArray<number>) => assignScores(abilityDrafts([]), scores);

  it("names the grant and where it lands, because the player did not type it", () => {
    expect(
      backgroundNote(
        draftWith({ background: "Salt-runner", abilities: scored(15, 14, 13, 12, 10, 8) }),
        VOCABULARY,
      ),
    ).toBe(
      "Salt-runner adds +2 CON, +1 WIS, on top of the scores above — that is what their sheet will say.",
    );
  });

  it("points at the scores when there are none, because then it moves nothing", () => {
    // **The state a player is actually in most often**, and the one that would
    // otherwise be a lie: `seedFor` raises a cell that exists and refuses to
    // invent one that does not, so a background picked before any scores are
    // set changes no number at all.
    expect(backgroundNote(draftWith({ background: "Salt-runner" }), VOCABULARY)).toBe(
      "Salt-runner adds +2 CON, +1 WIS. Set the ability scores above and those go on top of them.",
    );
  });

  it("says so when only some of the abilities it names have a score", () => {
    const conOnly = abilityDrafts([]).map((cell) =>
      cell.label === "CON" ? { ...cell, score: "13" } : cell,
    );
    expect(
      backgroundNote(draftWith({ background: "Salt-runner", abilities: conOnly }), VOCABULARY),
    ).toBe(
      "Salt-runner adds +2 CON, +1 WIS, on top of the scores above. An ability with no score set does not move.",
    );
  });

  it("says nothing at all for a background that grants nothing", () => {
    // Which is every bundled one, so this is the common case. A line reading
    // *adds nothing* would be a placeholder saying that nothing happened.
    expect(backgroundNote(draftWith({ background: "Soldier" }), VOCABULARY)).toBeUndefined();
    expect(backgroundNote(draftWith({ background: "" }), VOCABULARY)).toBeUndefined();
    expect(
      backgroundNote(draftWith({ background: "Nobody wrote this" }), VOCABULARY),
    ).toBeUndefined();
  });
});
