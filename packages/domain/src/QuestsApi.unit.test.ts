import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { CreateQuestPayload, Quest, QuestIdFromString } from "./QuestsApi.js";

const decodeSync = Schema.decodeUnknownSync;

describe("QuestsApi", () => {
  it("decodes QuestId from UUID", () => {
    const value = decodeSync(QuestIdFromString)(
      "4f1b1c53-8c3a-4c51-8d9a-7f4d1f0b2c33",
    );

    expect(value).toBeDefined();
  });

  it("rejects invalid QuestId", () => {
    expect(() => decodeSync(QuestIdFromString)("bad-id")).toThrow();
  });

  it("decodes CreateQuestPayload", () => {
    const payload = decodeSync(CreateQuestPayload)({
      name: "Test Quest",
      description: "A test quest.",
      campaignId: "2b2360b8-fb60-4b8f-9f9c-7f0d9a12d8f6",
      rewards: {
        experience: 120,
        currency: 50,
      },
    });

    expect(payload.rewards.currency).toBe(50);
  });

  it("decodes Quest", () => {
    const quest = decodeSync(Quest)({
      id: "4f1b1c53-8c3a-4c51-8d9a-7f4d1f0b2c33",
      name: "Test Quest",
      description: "A test quest.",
      campaignId: "2b2360b8-fb60-4b8f-9f9c-7f0d9a12d8f6",
      parentQuestId: null,
      rewards: {
        experience: 120,
        currency: 50,
      },
    });

    expect(quest.name).toBe("Test Quest");
  });
});
