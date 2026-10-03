import { Combatant, Roll, SessionEvent } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { DmRoll } from "./dice";
import { brannoc, goblinBoss, sessionEvent } from "./run.fixtures";
import { DOCK_KEPT, dockLines } from "./rollsLog";

const combatants = [brannoc, goblinBoss].map((row) => Schema.decodeUnknownSync(Combatant)(row));
const goblinBossId = combatants[1]!.id;

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
    characterId: brannoc.characterId,
    characterName: "Brannoc Duskharrow",
    label: "Halberd",
    notation: "1d20+7",
    dice: [20],
    kept: [20],
    modifier: 7,
    total: 27,
    mode: "normal",
    critical: "hit",
    kind: "plain",
    combatantId: null,
    targetCombatantId: null,
    targetAc: null,
    outcome: null,
    requestId: null,
    visibility: "shared",
    origin: "authored",
    assistantTurnId: null,
    createdAt: "2026-08-04T19:02:30.000Z",
    updatedAt: "2026-08-04T19:02:30.000Z",
  });
  const at = (minute: number) =>
    Date.parse(`2026-08-04T19:${String(minute).padStart(2, "0")}:00.000Z`);
  const dm = (id: number, minute: number, over: Partial<DmRoll> = {}): DmRoll => ({
    label: `d20 #${String(id)}`,
    notation: "1d20",
    dice: [4],
    kept: [4],
    modifier: 0,
    total: 4,
    mode: "normal",
    critical: null,
    kind: "plain",
    targetCombatantId: null,
    targetAc: null,
    outcome: null,
    requestId: `roll-${String(id)}`,
    at: at(minute),
    ...over,
  });
  const dmOnly = (rolls: ReadonlyArray<DmRoll>) =>
    dockLines({ dm: rolls, tray: [], events: [], combatants, noun: "fight" }).map((line) => [
      line.label,
      line.detail,
      line.total,
      line.tone,
    ]);

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

  it("prints an attack's to-hit and the damage it threw as one line", () => {
    const swing = { label: "Brannoc · Longsword → Goblin Boss", targetCombatantId: goblinBossId };
    expect(
      dmOnly([
        dm(1, 5, {
          ...swing,
          kind: "damage",
          notation: "1d8+4",
          dice: [5],
          kept: [5],
          modifier: 4,
          total: 9,
          requestId: "swing:1",
        }),
        dm(2, 5, {
          ...swing,
          kind: "attack",
          notation: "1d20+7",
          dice: [19],
          kept: [19],
          modifier: 7,
          total: 26,
          targetAc: 17,
          outcome: "hit",
          requestId: "swing:0",
        }),
      ]),
    ).toEqual([
      ["Brannoc · Longsword → Goblin Boss", "d20 19 +7 = 26 vs AC 17 · 1d8+4 = 9", "Hit", "accent"],
    ]);
  });

  it("says a crit, a natural 1, a miss and a total with no AC to beat", () => {
    const swing = (id: number, d20: number, over: Partial<DmRoll>) =>
      dm(id, id, {
        label: `Swing ${String(id)}`,
        kind: "attack",
        notation: "1d20+3",
        dice: [d20],
        kept: [d20],
        modifier: 3,
        total: d20 + 3,
        targetCombatantId: goblinBossId,
        targetAc: 15,
        ...over,
      });
    expect(
      dmOnly([
        swing(4, 9, { targetAc: null }),
        swing(3, 5, { outcome: "miss" }),
        swing(2, 1, { outcome: "fumble", critical: "miss" }),
        swing(1, 20, { outcome: "crit", critical: "hit" }),
      ]),
    ).toEqual([
      ["Swing 4", "d20 9 +3 = 12 vs no AC", "12", "accent"],
      ["Swing 3", "d20 5 +3 = 8 vs AC 15", "Miss", "muted"],
      ["Swing 2", "d20 1 +3 = 4 vs AC 15", "Miss", "danger"],
      ["Swing 1", "d20 20 +3 = 23 vs AC 15", "Crit", "success"],
    ]);
  });

  it("prints an action rolled off its turn, damage alone, and a concentration save", () => {
    expect(
      dmOnly([
        dm(1, 7, {
          label: "Goblin Boss · Concentration save, DC 10",
          kind: "concentration",
          notation: "1d20+1",
          dice: [13],
          kept: [13],
          modifier: 1,
          total: 14,
          requestId: "save",
        }),
        dm(2, 6, {
          label: "Goblin Boss · Scimitar",
          kind: "damage",
          notation: "1d6+2",
          dice: [4],
          kept: [4],
          modifier: 2,
          total: 6,
          requestId: "scimitar",
        }),
        dm(3, 5, {
          label: "Goblin Boss · Bow",
          kind: "damage",
          notation: "1d6+2",
          dice: [1],
          kept: [1],
          modifier: 2,
          total: 3,
          requestId: "bow:1",
        }),
        dm(4, 5, {
          label: "Goblin Boss · Bow",
          kind: "attack",
          notation: "1d20+4",
          dice: [11],
          kept: [11],
          modifier: 4,
          total: 15,
          requestId: "bow:0",
        }),
      ]),
    ).toEqual([
      ["Goblin Boss · Concentration save, DC 10", "1d20+1 [13]", "14", "magic"],
      ["Goblin Boss · Scimitar", "1d6+2 = 6", "6", "accent"],
      ["Goblin Boss · Bow", "d20 11 +4 = 15 · 1d6+2 = 3", "15", "accent"],
    ]);
  });

  it("keeps forty", () => {
    const many = Array.from({ length: 50 }, (_, index) => dm(index + 1, index % 60));
    expect(dockLines({ dm: many, tray: [], events: [], combatants, noun: "fight" })).toHaveLength(
      DOCK_KEPT,
    );
  });
});
