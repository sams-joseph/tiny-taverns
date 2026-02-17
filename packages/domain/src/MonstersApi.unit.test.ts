import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import {
  CreateMonsterPayload,
  Monster,
  MonsterIdFromString,
} from "./MonstersApi.js";

const decodeSync = Schema.decodeUnknownSync;

describe("MonstersApi", () => {
  it("decodes MonsterId from UUID", () => {
    const value = decodeSync(MonsterIdFromString)(
      "0c1b6e3b-8f78-4d87-9a22-b31d9e116d62",
    );

    expect(value).toBeDefined();
  });

  it("rejects invalid MonsterId", () => {
    expect(() => decodeSync(MonsterIdFromString)("bad-id")).toThrow();
  });

  it("decodes CreateMonsterPayload", () => {
    const payload = decodeSync(CreateMonsterPayload)({
      name: "Test Monster",
      size: "medium",
      kind: "beast",
      subtype: "test",
      alignment: "neutral",
      ac: 12,
      hpAvg: 8,
      hpFormula: "1d8",
      str: 10,
      dex: 12,
      con: 10,
      int: 6,
      wis: 10,
      cha: 8,
      cr: 0.25,
      xp: 50,
      proficiencyBonus: 2,
      passivePerception: 10,
      languages: "none",
      senses: "darkvision 60 ft.",
      source: "test-source",
    });

    expect(payload.name).toBe("Test Monster");
  });

  it("rejects invalid monster kind", () => {
    expect(() =>
      decodeSync(CreateMonsterPayload)({
        name: "Test Monster",
        size: "medium",
        kind: "unknown" as "beast",
        subtype: "test",
        alignment: "neutral",
        ac: 12,
        hpAvg: 8,
        hpFormula: "1d8",
        str: 10,
        dex: 12,
        con: 10,
        int: 6,
        wis: 10,
        cha: 8,
        cr: 0.25,
        xp: 50,
        proficiencyBonus: 2,
        passivePerception: 10,
        languages: "none",
        senses: "darkvision 60 ft.",
        source: "test-source",
      }),
    ).toThrow();
  });

  it("decodes Monster", () => {
    const monster = decodeSync(Monster)({
      id: "0c1b6e3b-8f78-4d87-9a22-b31d9e116d62",
      name: "Test Monster",
      size: "medium",
      kind: "beast",
      subtype: null,
      alignment: "neutral",
      ac: 12,
      hpAvg: 8,
      hpFormula: "1d8",
      str: 10,
      dex: 12,
      con: 10,
      int: 6,
      wis: 10,
      cha: 8,
      cr: 0.25,
      xp: 50,
      proficiencyBonus: 2,
      passivePerception: 10,
      languages: "none",
      senses: "darkvision 60 ft.",
      source: "test-source",
    });

    expect(monster.kind).toBe("beast");
  });
});
