import { CampaignMember, PartySeat, type CharacterSheet } from "@taverns/api";
import { emptyCharacterSheet } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { hpBand, hpFraction, passiveOf, passivePerceptionOf, savesOf } from "../characters/sheet";
import {
  bestInParty,
  feetOf,
  hpAfter,
  partySummary,
  passivesOf,
  pressed,
  seatCard,
  summaryLine,
  type PartySummary,
} from "./cards";
import { brannocSeat, ilse, pellSeat, sorrelSeat } from "./party.fixtures";

/**
 * The Party screen's derivations, on their own.
 *
 * The seats are the party fixtures' wire JSON decoded through the contract, so
 * a field renamed upstream fails here rather than drawing `undefined`.
 */

const seat = Schema.decodeUnknownSync(PartySeat);
const member = Schema.decodeUnknownSync(CampaignMember);

type RawSeat = typeof brannocSeat;

/** Brannoc's seat with the character's fields replaced — the wire shape, re-decoded. */
const brannocWith = (
  character: Record<string, unknown>,
  seatFields: Record<string, unknown> = {},
) =>
  seat({
    seat: { ...brannocSeat.seat, ...seatFields },
    character: { ...brannocSeat.character, ...character },
  } satisfies Record<keyof RawSeat, unknown>);

const sheet = (fields: Partial<CharacterSheet>): CharacterSheet => ({
  ...emptyCharacterSheet,
  ...fields,
});

/** A written sheet: every figure a card and the table can draw. */
const written = sheet({
  abilities: [
    { label: "STR", score: "16", modifier: "+3", save: "+5" },
    { label: "DEX", score: "10", modifier: "+0", save: "+0" },
    { label: "CON", score: "14", modifier: "+2", save: "+2" },
    { label: "INT", score: "8", modifier: "-1", save: "-1" },
    { label: "WIS", score: "12", modifier: "+1", save: "+3" },
    { label: "CHA", score: "16", modifier: "+3", save: "+5" },
  ],
  identity: { subclass: "Oath of Devotion", speed: "30 ft.", proficiency: "+2" },
  skills: [
    { name: "Insight", proficient: true },
    { name: "Perception", bonus: "+3" },
  ],
  spellcasting: { ability: "CHA", save: "13" },
});

describe("a seat's card", () => {
  it("draws every figure the character answers, in the drawn order", () => {
    const card = seatCard(
      brannocWith({ level: 5, sheet: written, tempHp: 4, conditions: ["Blessed"] }),
    );
    expect(card).toEqual({
      kind: "character",
      seatId: brannocSeat.seat.id,
      name: "Brannoc",
      lineage: "Half-orc Paladin 5 · Oath of Devotion",
      player: "Ilse",
      hp: "44 / 52",
      fraction: 44 / 52,
      band: "well",
      tempHp: 4,
      stats: [
        { key: "ac", label: "AC", value: "18" },
        { key: "speed", label: "Speed", value: "30" },
        { key: "spellDc", label: "Spell DC", value: "13" },
        { key: "passive", label: "Passive", value: "13" },
      ],
      conditions: ["Blessed"],
    });
  });

  it("omits a tile the character cannot answer rather than drawing a dash", () => {
    // Brannoc's fixture sheet is empty: no speed, no casting, no WIS cell.
    const card = seatCard(seat(brannocSeat));
    expect(card.kind === "character" && card.stats).toEqual([
      { key: "ac", label: "AC", value: "18" },
    ]);
    const bare = seatCard(brannocWith({ ac: null }));
    expect(bare.kind === "character" && bare.stats).toEqual([]);
  });

  it("counts a null current as the max for the bar, and says only the max", () => {
    const card = seatCard(brannocWith({ hpCurrent: null }));
    expect(card).toMatchObject({ hp: "52", fraction: 1, band: "well" });
    const unwritten = seatCard(brannocWith({ hpCurrent: null, hpMax: null }));
    expect(unwritten).toMatchObject({ hp: undefined, fraction: undefined, band: undefined });
  });

  it("gives a deleted character's seat its snapshot name and no numbers", () => {
    const card = seatCard(seat({ ...brannocSeat, character: null }));
    expect(card).toEqual({
      kind: "deleted",
      seatId: brannocSeat.seat.id,
      name: brannocSeat.seat.displayName,
      player: undefined,
    });
  });

  it("names the player by the seat, then the character, then the account", () => {
    const account = member(ilse);
    expect(seatCard(brannocWith({}, { playerDisplayName: "Ilse V." }), account).player).toBe(
      "Ilse V.",
    );
    expect(seatCard(brannocWith({}), account).player).toBe("Ilse");
    expect(seatCard(brannocWith({ playerName: null }), account).player).toBe("Ilse Vantar");
    expect(seatCard(brannocWith({ playerName: " " })).player).toBeUndefined();
  });

  it("builds the lineage from what is written, and nothing from nothing", () => {
    const lineageOf = (character: Record<string, unknown>) => {
      const card = seatCard(brannocWith(character));
      return card.kind === "character" ? card.lineage : "deleted";
    };
    expect(lineageOf({})).toBe("Half-orc Paladin 3");
    expect(lineageOf({ level: null })).toBe("Half-orc Paladin");
    expect(lineageOf({ race: null, className: null })).toBe("Level 3");
    expect(lineageOf({ race: null, className: null, level: null })).toBeUndefined();
    expect(
      lineageOf({
        race: null,
        className: null,
        level: null,
        sheet: sheet({ identity: { subclass: "Thief" } }),
      }),
    ).toBe("Thief");
  });
});

describe("a speed's figure", () => {
  it("takes the feet from a single walking speed, and nothing from anything else", () => {
    expect(feetOf("30 ft.")).toBe(30);
    expect(feetOf(" 25ft ")).toBe(25);
    expect(feetOf("35 feet")).toBe(35);
    expect(feetOf("30 ft., fly 60 ft.")).toBeUndefined();
    expect(feetOf("fast")).toBeUndefined();
    expect(feetOf(undefined)).toBeUndefined();
  });

  it("draws a speed with no single figure as written", () => {
    const card = seatCard(
      brannocWith({ sheet: sheet({ identity: { speed: "30 ft., fly 60 ft." } }) }),
    );
    expect(card.kind === "character" ? card.stats : []).toContainEqual({
      key: "speed",
      label: "Speed",
      value: "30 ft., fly 60 ft.",
    });
  });
});

describe("the party's summary", () => {
  it("counts characters, sums hit points with null as max, and names the low and the down", () => {
    const summary = partySummary([
      seat(brannocSeat), // 44 / 52
      seat(sorrelSeat), // null / 52: counts as 52
      brannocWith({ name: "Wren", hpCurrent: 10, hpMax: 40 }), // a quarter: low
      brannocWith({ name: "Tamsin", hpCurrent: 0, hpMax: 33 }), // down
      brannocWith({ name: "Odo", hpCurrent: null, hpMax: null }), // no max: not summed
      seat({ ...pellSeat, character: null }), // deleted: not a character
    ]);
    expect(summary).toEqual({
      characters: 5,
      level: "Lvl 1–3",
      hp: { current: 44 + 52 + 10 + 0, max: 52 + 52 + 40 + 33 },
      low: ["Wren"],
      down: ["Tamsin"],
    });
  });

  it("has no hit points to sum when no seat has a max", () => {
    expect(partySummary([brannocWith({ hpMax: null })]).hp).toBeUndefined();
    expect(partySummary([])).toEqual({
      characters: 0,
      level: undefined,
      hp: undefined,
      low: [],
      down: [],
    });
  });

  it("names exactly the characters whose bar is in the low and down bands", () => {
    // Every current from 0 to max on a 33-point character: the header's words
    // and the bar's band cannot disagree anywhere along the track.
    for (let current = 0; current <= 33; current += 1) {
      const band = hpBand(hpFraction(current, 33) ?? 1);
      const summary = partySummary([brannocWith({ hpCurrent: current, hpMax: 33 })]);
      expect(summary.down.length === 1).toBe(band === "down");
      expect(summary.low.length === 1).toBe(band === "low");
    }
  });
});

describe("the header's line", () => {
  const summary = (fields: Partial<PartySummary>): PartySummary => ({
    characters: 4,
    level: "Lvl 5",
    hp: { current: 125, max: 159 },
    low: [],
    down: [],
    ...fields,
  });

  it("says how many, what level, the hit points, and that nobody is hurting", () => {
    expect(summaryLine(summary({}))).toBe(
      "4 characters · Lvl 5 · 125 / 159 hp · Everyone's on their feet",
    );
    expect(summaryLine(summary({ characters: 1 }))).toMatch(/^1 character · /);
  });

  it("names the down before the low, in the bar's own words", () => {
    expect(summaryLine(summary({ low: ["Tamsin"] }))).toBe(
      "4 characters · Lvl 5 · 125 / 159 hp · Tamsin is low",
    );
    expect(summaryLine(summary({ low: ["Wren", "Odo"], down: ["Tamsin"] }))).toBe(
      "4 characters · Lvl 5 · 125 / 159 hp · Tamsin is down, Wren and Odo are low",
    );
    expect(summaryLine(summary({ low: ["Wren", "Odo", "Brannoc"] }))).toMatch(
      /Wren, Odo and Brannoc are low$/,
    );
  });

  it("leaves out what the party cannot answer, and has no line for no characters", () => {
    // No max anywhere: no sum, and nothing read off a bar that is not drawn.
    expect(summaryLine(summary({ level: undefined, hp: undefined }))).toBe("4 characters");
    expect(summaryLine(partySummary([]))).toBeUndefined();
  });
});

describe("a press of − or +", () => {
  const at = (hpCurrent: number | null, hpMax: number | null) => ({ hpCurrent, hpMax });

  it("lands where the server's clamp puts it", () => {
    expect(hpAfter(at(44, 52), 3)).toBe(41);
    expect(hpAfter(at(44, 52), -20)).toBe(52);
    expect(hpAfter(at(4, 52), 10)).toBe(0);
    // Nobody has said: counts down from the max.
    expect(hpAfter(at(null, 52), 2)).toBe(50);
    // No max: nothing to restore to but the column's bound, and zero below.
    expect(hpAfter(at(null, null), 1)).toBe(0);
    expect(hpAfter(at(5, null), -3)).toBe(8);
  });

  it("adds up into one delta that says what the screen shows", () => {
    const brannoc = at(44, 52);
    let owed = 0;
    owed = pressed(brannoc, owed, "damage");
    owed = pressed(brannoc, owed, "damage");
    owed = pressed(brannoc, owed, "heal");
    expect(owed).toBe(1);
    expect(hpAfter(brannoc, owed)).toBe(43);
  });

  it("ignores a press that would move nothing, so the next one counts", () => {
    const full = at(52, 52);
    const owed = pressed(full, 0, "heal");
    expect(owed).toBe(0);
    expect(pressed(full, owed, "damage")).toBe(1);
    expect(pressed(at(0, 52), 0, "damage")).toBe(0);
  });
});

describe("passives and saves", () => {
  it("makes Perception exactly as passivePerceptionOf does", () => {
    const sheets = [
      emptyCharacterSheet,
      written,
      ...[brannocSeat, sorrelSeat, pellSeat].map(
        (raw) => seat(raw).character?.sheet ?? emptyCharacterSheet,
      ),
      sheet({ abilities: [{ label: "WIS", score: "8", modifier: "-1" }] }),
      sheet({
        abilities: [{ label: "wis ", score: "14", modifier: "+2" }],
        skills: [{ name: " perception", proficient: true }],
        identity: { proficiency: "+3" },
      }),
      sheet({
        abilities: [{ label: "WIS", score: "14", modifier: "+2" }],
        skills: [{ name: "Perception", proficient: true }],
      }),
    ];
    for (const each of sheets) {
      expect(passivesOf(each).perception).toBe(passivePerceptionOf(each));
    }
    expect(sheets.map(passivePerceptionOf)).toEqual([
      undefined,
      13,
      undefined,
      undefined,
      undefined,
      9,
      15,
      undefined,
    ]);
  });

  it("keys Insight off WIS and Investigation off INT, proficiency included", () => {
    expect(passivesOf(written)).toEqual({ perception: 13, insight: 13, investigation: 9 });
    expect(passiveOf(written, "Arcana", "INT")).toBe(9);
    expect(passiveOf(written, "Arcana", "STR")).toBe(13);
  });

  it("takes the saves as written and has no row when none is written", () => {
    expect(savesOf(written)).toEqual({ STR: 5, DEX: 0, CON: 2, INT: -1, WIS: 3, CHA: 5 });
    expect(
      savesOf(
        sheet({
          abilities: [
            { label: "dex", score: "14", modifier: "+2", save: "+4" },
            { label: "WIS", score: "12", modifier: "+1" },
          ],
        }),
      ),
    ).toEqual({ DEX: 4 });
    // A modifier is not a save: a proficient save differs from it.
    expect(
      savesOf(sheet({ abilities: [{ label: "STR", score: "16", modifier: "+3" }] })),
    ).toBeUndefined();
    expect(savesOf(emptyCharacterSheet)).toBeUndefined();
  });

  it("highlights every tied best, and none in a column nobody answers", () => {
    expect([...bestInParty([13, 15, undefined, 15, 9])]).toEqual([1, 3]);
    expect([...bestInParty([-1, -3])]).toEqual([0]);
    expect(bestInParty([undefined, undefined]).size).toBe(0);
    expect(bestInParty([]).size).toBe(0);
  });
});
