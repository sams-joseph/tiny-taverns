import { Combatant } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { brannoc, goblinBoss } from "../campaign/campaign.fixtures";
import { labelsInOrder, leadingFeet, moveLine, nameShown, tokenLabels, tokenState } from "./tokens";

const decode = Schema.decodeUnknownSync(Combatant);
const row = (id: string, displayName: string, createdAt: string) =>
  decode({ ...goblinBoss, id: `2b1f2a1e-0000-4000-8000-${id}`, displayName, createdAt });

describe("a token's label", () => {
  it("is the name's initials, numbered in the order added when a name repeats", () => {
    const labels = tokenLabels([
      decode(brannoc),
      row("000000000c03", "Goblin archer", "2026-08-04T19:00:02.000Z"),
      row("000000000c01", "Goblin archer", "2026-08-04T19:00:01.000Z"),
      row("000000000c02", "Worg 2", "2026-08-04T19:00:00.000Z"),
    ]);
    const of = (id: string) =>
      labels.get(decode({ ...goblinBoss, id: `2b1f2a1e-0000-4000-8000-${id}` }).id);
    expect(labels.get(decode(brannoc).id)).toBe("B");
    // The later-added archer stands first in the order and is still the second.
    expect(of("000000000c03")).toBe("GA2");
    expect(of("000000000c01")).toBe("GA1");
    expect(of("000000000c02")).toBe("W2");
  });

  it("numbers in the order it is given, for a board with no creation times", () => {
    const [first, second, alone] = [0, 1, 2].map(
      (n) => decode({ ...goblinBoss, id: `2b1f2a1e-0000-4000-8000-00000000c0${String(n)}0` }).id,
    );
    const labels = labelsInOrder([
      { id: second!, displayName: "Goblin archer" },
      { id: alone!, displayName: "Marsh Hag" },
      { id: first!, displayName: "Goblin archer" },
    ]);
    expect([labels.get(second!), labels.get(first!), labels.get(alone!)]).toEqual([
      "GA1",
      "GA2",
      "MH",
    ]);
  });
});

describe("a speed", () => {
  it("is the number it starts with, or none", () => {
    expect(leadingFeet("30 ft., climb 30 ft.")).toBe(30);
    expect(leadingFeet(" 25 ft.")).toBe(25);
    expect(leadingFeet("varies")).toBeUndefined();
    expect(leadingFeet("")).toBeUndefined();
    expect(leadingFeet(undefined)).toBeUndefined();
  });
});

describe("the move line", () => {
  const line = (
    to: { column: number; row: number },
    speed?: number,
    diagonals: "five" | "alternating" = "five",
  ) =>
    moveLine({ name: "Wren", from: { column: 0, row: 0 }, to, feetPerCell: 5, diagonals, speed });

  it("counts a diagonal as one square, and says when it went past the speed", () => {
    expect(line({ column: 3, row: 6 }, 30)).toBe("Wren moved 30 ft");
    expect(line({ column: 7, row: 1 }, 30)).toBe("Wren moved 35 ft, past their 30 ft speed");
    expect(line({ column: 7, row: 1 })).toBe("Wren moved 35 ft");
  });

  it("counts every second diagonal twice under the alternating rule", () => {
    // The drawing's screen 29: a 4 × 4 diagonal is 30 ft, not 20.
    expect(line({ column: 4, row: 4 }, 30, "alternating")).toBe("Wren moved 30 ft");
    expect(line({ column: 4, row: 4 }, 25, "alternating")).toBe(
      "Wren moved 30 ft, past their 25 ft speed",
    );
  });
});

describe("a token's look", () => {
  const boss = decode(goblinBoss);
  const pc = decode(brannoc);
  const look = (combatant: Combatant, hp: number, hostileTokensHidden = false) =>
    tokenState(combatant, { hp, hostileTokensHidden });

  it("puts a monster at zero out of the fight, struck through", () => {
    expect(look(boss, 0)).toMatchObject({ out: true, struck: true, health: 0 });
    expect(look(boss, boss.hpMax)).toMatchObject({ out: false, struck: false, health: 1 });
  });

  it("leaves a dying party member in the fight, and fades a dead one without striking them", () => {
    const dying = decode({ ...brannoc, deathSaves: { successes: 1, failures: 2 } });
    expect(look(dying, 0)).toMatchObject({ out: false, struck: false });
    const dead = decode({ ...brannoc, deathSaves: { successes: 0, failures: 3 } });
    expect(look(dead, 0)).toMatchObject({ out: true, struck: false });
  });

  it("is hidden when its row is held back, or it is a monster while the DM hides them", () => {
    expect(look(decode({ ...goblinBoss, visibility: "dm" }), 5).hidden).toBe(true);
    expect(look(decode({ ...goblinBoss, visibility: "shared" }), 5).hidden).toBe(false);
    expect(look(decode({ ...goblinBoss, visibility: "shared" }), 5, true).hidden).toBe(true);
    // Hiding the monsters leaves the party on the players' board.
    expect(look(decode({ ...brannoc, visibility: "shared" }), 5, true).hidden).toBe(false);
  });

  it("reads its health as a share of its maximum, clamped", () => {
    expect(look(pc, Math.floor(pc.hpMax / 2)).health).toBeCloseTo(
      Math.floor(pc.hpMax / 2) / pc.hpMax,
    );
    expect(look(decode({ ...brannoc, hpMax: 0, hpCurrent: 0 }), 0).health).toBe(0);
  });
});

describe("a token's name", () => {
  const token = (active: boolean, selected: boolean, dragging = false) => ({
    active,
    selected,
    dragging,
  });

  it("shows on the active and selected tokens by default", () => {
    expect(nameShown("active", token(true, false))).toBe(true);
    expect(nameShown("active", token(false, true))).toBe(true);
    expect(nameShown("active", token(false, false))).toBe(false);
  });

  it("shows on every token, or on none, by the DM's choice, and always while dragged", () => {
    expect(nameShown("all", token(false, false))).toBe(true);
    expect(nameShown("none", token(true, true))).toBe(false);
    expect(nameShown("none", token(false, false, true))).toBe(true);
  });
});
