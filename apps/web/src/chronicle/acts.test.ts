import { CampaignAct, Session } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { actStartingAt, groupByAct, rangeOf } from "./acts";
import { campaignId, saltRoad, session11 } from "./chronicle.fixtures";

/**
 * Which act a night falls in, as arithmetic over what the reader was answered.
 * Decoded from wire JSON, as the screens receive them.
 */
const nightAt = (number: number): Session =>
  Schema.decodeUnknownSync(Session)({
    ...session11,
    id: `2b1f2a1e-0000-4000-8000-${String(number).padStart(12, "0")}`,
    number,
  });
const actAt = (number: number, title: string): CampaignAct =>
  Schema.decodeUnknownSync(CampaignAct)({
    ...saltRoad,
    id: `2b1f2a1e-0000-4000-8000-${String(number).padStart(8, "0")}aaaa`,
    campaignId,
    title,
    firstSessionNumber: number,
  });

/** Newest first, as `sessions.list` answers. */
const nights = (...numbers: ReadonlyArray<number>) => numbers.map(nightAt);
const shape = (groups: ReturnType<typeof groupByAct>) =>
  groups.map((group) => [group.act?.title, group.sessions.map((session) => session.number)]);

describe("groupByAct", () => {
  it("is one headless group when there are no acts", () => {
    expect(shape(groupByAct(nights(3, 2, 1), []))).toEqual([[undefined, [3, 2, 1]]]);
  });

  it("puts each night in the act with the highest start at or below it, newest first", () => {
    const acts = [actAt(1, "Act I"), actAt(7, "Act II")];
    expect(shape(groupByAct(nights(12, 8, 7, 6, 1), acts))).toEqual([
      ["Act II", [12, 8, 7]],
      ["Act I", [6, 1]],
    ]);
  });

  it("leaves the nights older than every act without one, and does not mind the acts' order", () => {
    const acts = [actAt(9, "Act III"), actAt(4, "Act II")];
    expect(shape(groupByAct(nights(10, 9, 5, 4, 3, 2), acts))).toEqual([
      ["Act III", [10, 9]],
      ["Act II", [5, 4]],
      [undefined, [3, 2]],
    ]);
  });

  it("draws no act that holds none of the reader's nights", () => {
    // A player's list skips the kept-back nights 5–9, so the act starting at 5
    // holds none of theirs.
    const acts = [actAt(1, "Act I"), actAt(5, "Act II"), actAt(10, "Act III")];
    expect(shape(groupByAct(nights(12, 4, 1), acts))).toEqual([
      ["Act III", [12]],
      ["Act I", [4, 1]],
    ]);
    expect(shape(groupByAct(nights(4, 1), acts))).toEqual([["Act I", [4, 1]]]);
  });
});

describe("rangeOf", () => {
  it("spans the lowest and highest night it holds", () => {
    expect(rangeOf(nights(12, 8, 7))).toBe("Sessions 7–12");
    expect(rangeOf(nights(7))).toBe("Session 7");
  });
});

describe("actStartingAt", () => {
  it("finds the act a night starts, and only that one", () => {
    const acts = [actAt(1, "Act I"), actAt(7, "Act II")];
    expect(actStartingAt(nightAt(7), acts)?.title).toBe("Act II");
    expect(actStartingAt(nightAt(8), acts)).toBeUndefined();
  });
});
