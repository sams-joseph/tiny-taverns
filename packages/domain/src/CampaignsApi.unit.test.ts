import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import {
  Campaign,
  CampaignIdFromString,
  CreateCampaignPayload,
} from "./CampaignsApi.js";

const decodeSync = Schema.decodeUnknownSync;

describe("CampaignsApi", () => {
  it("decodes CampaignId from UUID", () => {
    const value = decodeSync(CampaignIdFromString)(
      "2b2360b8-fb60-4b8f-9f9c-7f0d9a12d8f6",
    );

    expect(value).toBeDefined();
  });

  it("rejects invalid CampaignId", () => {
    expect(() => decodeSync(CampaignIdFromString)("bad-id")).toThrow();
  });

  it("decodes CreateCampaignPayload", () => {
    const payload = decodeSync(CreateCampaignPayload)({
      name: "Test Campaign",
      description: "Test Description",
    });

    expect(payload.name).toBe("Test Campaign");
  });

  it("rejects empty campaign name", () => {
    expect(() =>
      decodeSync(CreateCampaignPayload)({
        name: " ",
        description: "Valid",
      }),
    ).toThrow();
  });

  it("decodes Campaign", () => {
    const campaign = decodeSync(Campaign)({
      id: "2b2360b8-fb60-4b8f-9f9c-7f0d9a12d8f6",
      name: "Test Campaign",
      description: "Test Description",
    });

    expect(campaign.description).toBe("Test Description");
  });
});
