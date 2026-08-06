import { CampaignId } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { hrefFor, parseRoute, type Route } from "./routes";

const CAMPAIGN_ID = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");

describe("hash routes", () => {
  it("reads a campaign id out of the hash", () => {
    expect(parseRoute(`#/campaigns/${CAMPAIGN_ID}`)).toEqual({
      screen: "campaign",
      campaignId: CAMPAIGN_ID,
    });
  });

  it("round-trips every screen through its href", () => {
    const routes: ReadonlyArray<Route> = [
      { screen: "campaigns" },
      { screen: "gallery" },
      { screen: "campaign", campaignId: CAMPAIGN_ID },
    ];
    for (const route of routes) {
      expect(parseRoute(hrefFor(route))).toEqual(route);
    }
  });

  it("falls back to the list rather than throwing on an id we never minted", () => {
    // The ids are branded UUIDs, so a hand-typed one has to decode or be refused.
    expect(parseRoute("#/campaigns/not-a-uuid")).toEqual({ screen: "campaigns" });
    expect(parseRoute("#/campaigns")).toEqual({ screen: "campaigns" });
    expect(parseRoute("")).toEqual({ screen: "campaigns" });
  });
});
