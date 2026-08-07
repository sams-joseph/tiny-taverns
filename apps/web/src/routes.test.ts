import { CampaignId, EncounterRunId, SessionId } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { hrefFor, parseRoute, type Route } from "./routes";

const CAMPAIGN_ID = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
const SESSION_ID = Schema.decodeSync(SessionId)("2b1f2a1e-0000-4000-8000-000000000501");
const RUN_ID = Schema.decodeSync(EncounterRunId)("2b1f2a1e-0000-4000-8000-000000000c01");

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
      { screen: "run", campaignId: CAMPAIGN_ID, sessionId: SESSION_ID, runId: RUN_ID },
    ];
    for (const route of routes) {
      expect(parseRoute(hrefFor(route))).toEqual(route);
    }
  });

  it("carries all three ids for a fight, which is what makes a reload land back in it", () => {
    expect(parseRoute(`#/campaigns/${CAMPAIGN_ID}/sessions/${SESSION_ID}/runs/${RUN_ID}`)).toEqual({
      screen: "run",
      campaignId: CAMPAIGN_ID,
      sessionId: SESSION_ID,
      runId: RUN_ID,
    });
  });

  it("falls back a level, not all the way, on a half-typed run link", () => {
    // It still knows which campaign was meant, so that is where it lands.
    expect(parseRoute(`#/campaigns/${CAMPAIGN_ID}/sessions/nope/runs/${RUN_ID}`)).toEqual({
      screen: "campaign",
      campaignId: CAMPAIGN_ID,
    });
    expect(parseRoute(`#/campaigns/${CAMPAIGN_ID}/sessions/${SESSION_ID}`)).toEqual({
      screen: "campaign",
      campaignId: CAMPAIGN_ID,
    });
  });

  it("falls back to the list rather than throwing on an id we never minted", () => {
    // The ids are branded UUIDs, so a hand-typed one has to decode or be refused.
    expect(parseRoute("#/campaigns/not-a-uuid")).toEqual({ screen: "campaigns" });
    expect(parseRoute("#/campaigns")).toEqual({ screen: "campaigns" });
    expect(parseRoute("")).toEqual({ screen: "campaigns" });
  });
});
