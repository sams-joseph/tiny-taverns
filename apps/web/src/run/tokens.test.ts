import { Combatant } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { brannoc, goblinBoss } from "../campaign/campaign.fixtures";
import { leadingFeet, moveLine, reachRect, tokenLabels } from "./tokens";

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

describe("the reach", () => {
  const board = {
    columns: 24,
    rows: 16,
    feetPerCell: 5,
    alignment: { cellPx: 10, offsetXPx: 0, offsetYPx: 0 },
  };

  it("is the squares the speed walks, cut at the board's edge", () => {
    expect(reachRect(board, { column: 2, row: 8 }, 30)).toEqual({
      x: 0,
      y: 20,
      width: 90,
      height: 130,
    });
  });

  it("is nothing when the speed is not a whole square", () => {
    expect(reachRect(board, { column: 2, row: 8 }, 4)).toBeUndefined();
  });
});

describe("the move line", () => {
  it("counts a diagonal as one square, and says when it went past the speed", () => {
    const line = (to: { column: number; row: number }, speed?: number) =>
      moveLine({ name: "Wren", from: { column: 0, row: 0 }, to, feetPerCell: 5, speed });
    expect(line({ column: 3, row: 6 }, 30)).toBe("Wren moved 30 ft");
    expect(line({ column: 7, row: 1 }, 30)).toBe("Wren moved 35 ft, past their 30 ft speed");
    expect(line({ column: 7, row: 1 })).toBe("Wren moved 35 ft");
  });
});
