import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import {
  CreateEncounterPayload,
  Encounter,
  EncounterIdFromString,
} from "./EncountersApi.js";

const decodeSync = Schema.decodeUnknownSync;

describe("EncountersApi", () => {
  it("decodes EncounterId from UUID", () => {
    const value = decodeSync(EncounterIdFromString)(
      "4f1b1c53-8c3a-4c51-8d9a-7f4d1f0b2c33",
    );

    expect(value).toBeDefined();
  });

  it("rejects invalid EncounterId", () => {
    expect(() => decodeSync(EncounterIdFromString)("bad-id")).toThrow();
  });

  it("decodes CreateEncounterPayload", () => {
    const payload = decodeSync(CreateEncounterPayload)({
      name: "Test Encounter",
      campaignId: "2b2360b8-fb60-4b8f-9f9c-7f0d9a12d8f6",
      phase: "combat",
    });

    expect(payload.phase).toBe("combat");
  });

  it("rejects invalid encounter phase", () => {
    expect(() =>
      decodeSync(CreateEncounterPayload)({
        name: "Test Encounter",
        campaignId: "2b2360b8-fb60-4b8f-9f9c-7f0d9a12d8f6",
        phase: "stealth" as "combat",
      }),
    ).toThrow();
  });

  it("decodes Encounter", () => {
    const encounter = decodeSync(Encounter)({
      id: "4f1b1c53-8c3a-4c51-8d9a-7f4d1f0b2c33",
      name: "Test Encounter",
      campaignId: "2b2360b8-fb60-4b8f-9f9c-7f0d9a12d8f6",
      phase: "exploration",
    });

    expect(encounter.name).toBe("Test Encounter");
  });
});
