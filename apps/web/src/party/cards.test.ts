import { CampaignMember, PartySeat, type CharacterSheet } from "@taverns/api";
import { emptyCharacterSheet } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { hpBand, hpFraction, passiveOf, passivePerceptionOf, savesOf } from "../characters/sheet";
import { bestInParty, partySummary, passivesOf, seatCard } from "./cards";
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
        { key: "speed", label: "Speed", value: "30 ft." },
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
