import { Combatant, Roll, SessionEvent } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { DmEntry } from "./dice";
import { brannoc, goblinBoss, sessionEvent } from "./run.fixtures";
import { DOCK_KEPT, dockLines } from "./rollsLog";

const combatants = [brannoc, goblinBoss].map((row) => Schema.decodeUnknownSync(Combatant)(row));

/** A log line at a minute past seven, with the payload the server stamps on its kind. */
const event = (
  seq: number,
  kind: string,
  combatantId: string | null,
  payload: unknown,
  minute = seq,
): SessionEvent =>
  Schema.decodeUnknownSync(SessionEvent)({
    ...sessionEvent(seq, kind, combatantId),
    payload,
    createdAt: `2026-08-04T19:${String(minute).padStart(2, "0")}:00.000Z`,
  });

const lines = (events: ReadonlyArray<SessionEvent>) =>
  dockLines({ dm: [], tray: [], events, combatants, noun: "fight" }).map(
    ({ label, detail, total, tone }) => ({ label, detail, total, tone }),
  );

describe("the dock's lines from the night's log", () => {
  it("prints a hit with the hit points before and after it", () => {
    expect(
      lines([
        event(1, "combatant-damaged", goblinBoss.id, {
          amount: 12,
          hpBefore: 21,
          hpCurrent: 9,
          hpMax: 21,
        }),
      ]),
    ).toEqual([
      { label: "Goblin Boss takes damage", detail: "21 → 9 hp", total: "−12", tone: "danger" },
    ]);
  });

  it("falls back to the sentence for a hit of nothing", () => {
    expect(
      lines([
        event(1, "combatant-damaged", goblinBoss.id, {
          amount: 0,
          hpBefore: 21,
          hpCurrent: 21,
          hpMax: 21,
        }),
      ]),
    ).toEqual([{ label: "Goblin Boss took a hit", detail: "", total: undefined, tone: "muted" }]);
  });

  it("prints a heal, and a critical hit as one", () => {
    expect(
      lines([
        event(2, "combatant-damaged", brannoc.id, {
          amount: -5,
          hpBefore: 0,
          hpCurrent: 5,
          hpMax: 52,
          conditionsRemoved: ["Unconscious"],
        }),
        event(1, "combatant-damaged", brannoc.id, {
          amount: 9,
          hpBefore: 9,
          hpCurrent: 0,
          hpMax: 52,
          critical: true,
          conditionsAdded: ["Unconscious"],
          deathSaves: { successes: 0, failures: 0 },
        }),
      ]),
    ).toEqual([
      {
        label: "Brannoc · Conditions",
        detail: "Unconscious removed",
        total: undefined,
        tone: "magic",
      },
      { label: "Brannoc is healed", detail: "0 → 5 hp", total: "+5", tone: "success" },
      {
        label: "Brannoc · Conditions",
        detail: "Unconscious added",
        total: undefined,
        tone: "magic",
      },
      {
        label: "Brannoc takes damage",
        detail: "9 → 0 hp · critical",
        total: "−9",
        tone: "danger",
      },
    ]);
  });

  it("names the concentration save a hit set up, newest", () => {
    expect(
      lines([
        event(1, "combatant-damaged", brannoc.id, {
          amount: 12,
          hpBefore: 31,
          hpCurrent: 19,
          hpMax: 52,
          concentrationDc: 10,
        }),
      ]).map((line) => [line.label, line.total]),
    ).toEqual([
      ["Brannoc · Concentration check", "DC 10"],
      ["Brannoc takes damage", "−12"],
    ]);
  });

  it("prints a line logged before the hit points before were stamped", () => {
    expect(
      lines([
        event(1, "combatant-damaged", goblinBoss.id, { amount: 3, hpCurrent: 18, hpMax: 21 }),
      ])[0],
    ).toMatchObject({ detail: "18/21 hp", total: "−3" });
  });

  it("prints death saves rolled, set by the DM, and marked by the player", () => {
    expect(
      lines([
        event(4, "death-save", brannoc.id, { successes: 0, failures: 0, by: "player" }),
        event(3, "death-save", brannoc.id, {
          face: 20,
          successes: 0,
          failures: 0,
          hpCurrent: 1,
          conditionsRemoved: ["Unconscious"],
        }),
        event(2, "death-save", brannoc.id, { face: 1, successes: 1, failures: 3, hpCurrent: 0 }),
        event(1, "death-save", brannoc.id, { successes: 1, failures: 1, hpCurrent: 0 }),
      ]),
    ).toEqual([
      {
        label: "Brannoc · Death saves",
        detail: "0 successes · 0 failures · marked on their sheet",
        total: undefined,
        tone: "muted",
      },
      {
        label: "Brannoc · Conditions",
        detail: "Unconscious removed",
        total: undefined,
        tone: "magic",
      },
      {
        label: "Brannoc · Death save",
        detail: "1d20 = 20 · back up with 1 hp",
        total: "20",
        tone: "success",
      },
      {
        label: "Brannoc · Death save",
        detail: "1d20 = 1 · two failures · 1 success · 3 failures",
        total: "1",
        tone: "danger",
      },
      {
        label: "Brannoc · Death saves",
        detail: "1 success · 1 failure",
        total: undefined,
        tone: "muted",
      },
    ]);
  });

  it("prints the conditions a hit point edit moved, and a plain edit as its sentence", () => {
    expect(
      lines([
        event(2, "combatant-updated", goblinBoss.id, { conditions: ["Prone"] }),
        event(1, "combatant-updated", goblinBoss.id, {
          hpCurrent: 0,
          conditionsRemoved: ["Concentrating"],
        }),
      ]).map((line) => [line.label, line.detail]),
    ).toEqual([
      ["Goblin Boss changed", ""],
      ["Goblin Boss · Conditions", "Concentrating removed"],
    ]);
  });

  it("says every other kind as the log's sentence, and leaves out the tray's doorbell", () => {
    expect(
      lines([
        event(3, "roll-made", null, {}),
        event(2, "turn-advanced", goblinBoss.id, {}),
        // A line that does not decode is its sentence too.
        event(1, "combatant-damaged", goblinBoss.id, { amount: "lots" }),
      ]).map((line) => line.label),
    ).toEqual(["Goblin Boss is up", "Goblin Boss took a hit"]);
  });
});

describe("the dock's one list", () => {
  const roll = Schema.decodeUnknownSync(Roll)({
    id: "2b1f2a1e-0000-4000-8000-00000000aa01",
    campaignId: brannoc.id,
    sessionId: sessionEvent(1, "roll-made").sessionId,
    encounterRunId: null,
    accountId: "2b1f2a1e-0000-4000-8000-0000000000a2",
    accountName: "Mara Voss",
    characterId: null,
    characterName: "Brannoc Duskharrow",
    label: "Halberd",
    notation: "1d20+7",
    dice: [20],
    kept: [20],
    modifier: 7,
    total: 27,
    mode: "normal",
    critical: "hit",
    requestId: null,
    visibility: "shared",
    origin: "authored",
    assistantTurnId: null,
    createdAt: "2026-08-04T19:02:30.000Z",
    updatedAt: "2026-08-04T19:02:30.000Z",
  });
  const dm = (id: number, minute: number): DmEntry => ({
    id,
    at: Date.parse(`2026-08-04T19:${String(minute).padStart(2, "0")}:00.000Z`),
    label: `d20 #${String(id)}`,
    detail: "1d20 [4]",
    total: "4",
    tone: "accent",
  });

  it("merges the DM's dice, the players' tray and the log, newest first", () => {
    const merged = dockLines({
      dm: [dm(1, 4)],
      tray: [roll],
      events: [event(1, "turn-advanced", brannoc.id, {})],
      combatants,
      noun: "fight",
    });
    expect(merged.map((line) => [line.label, line.detail, line.total, line.tone])).toEqual([
      ["d20 #1", "1d20 [4]", "4", "accent"],
      ["Halberd", "Mara Voss · Brannoc Duskharrow · 1d20+7 [20]", "27", "success"],
      ["Brannoc is up", "", undefined, "muted"],
    ]);
  });

  it("keeps forty", () => {
    const many = Array.from({ length: 50 }, (_, index) => dm(index + 1, index % 60));
    expect(dockLines({ dm: many, tray: [], events: [], combatants, noun: "fight" })).toHaveLength(
      DOCK_KEPT,
    );
  });
});
