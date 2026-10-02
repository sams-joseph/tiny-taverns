import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { AccountId, CampaignId } from "./Ids.js";

const uuid = "6f1c2b9e-3d4a-4c5b-8e7f-9a0b1c2d3e4f";

describe("an id", () => {
  it("decodes a UUID and refuses anything else", () => {
    expect(Schema.decodeUnknownSync(CampaignId)(uuid)).toBe(uuid);
    expect(() => Schema.decodeUnknownSync(CampaignId)("campaign-1")).toThrow();
  });

  // The brand is type-only since effect 4.0.0, so the compiler is the whole
  // proof that two ids built by the same helper stay apart.
  it("is not interchangeable with another kind of id", () => {
    const account = Schema.decodeUnknownSync(AccountId)(uuid);
    // @ts-expect-error an AccountId is not a CampaignId
    const campaign: CampaignId = account;
    expect(campaign).toBe(uuid);
  });
});
