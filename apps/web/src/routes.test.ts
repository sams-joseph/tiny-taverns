import { CampaignId, EncounterRunId, SessionId } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { hrefFor, listFor, modeOf, parseRoute, type Route } from "./routes";

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
      { screen: "bestiary", campaignId: CAMPAIGN_ID },
      { screen: "chronicle", campaignId: CAMPAIGN_ID },
      { screen: "run", campaignId: CAMPAIGN_ID, sessionId: SESSION_ID, runId: RUN_ID },
      { screen: "join", token: "aG93LWRvLXlvdS1kbw" },
      { screen: "play" },
      { screen: "playCampaign", campaignId: CAMPAIGN_ID },
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

  it("carries an invitation token in the fragment, and refuses a mangled one", () => {
    // The fragment is the point: a browser never sends it to a server, so the
    // token stays out of access logs and out of the `Referer` of anything the
    // join page links to. base64url is the alphabet `randomBytes(32)` produces,
    // so a link a chat client wrapped is refused here rather than sent onwards
    // to be refused there.
    expect(parseRoute("#/join/aG93LWRvLXlvdS1kbw")).toEqual({
      screen: "join",
      token: "aG93LWRvLXlvdS1kbw",
    });
    expect(parseRoute("#/join/not a token")).toEqual({ screen: "campaigns" });
    expect(parseRoute("#/join")).toEqual({ screen: "campaigns" });
  });

  it("hangs the bestiary off a campaign, because the API does", () => {
    // `creatures.list` is `/campaigns/:campaignId/creatures`, and that path is
    // the only thing gating the global `system` rows it returns beside the
    // campaign's own — so there is no campaign-less bestiary to route to.
    expect(parseRoute(`#/campaigns/${CAMPAIGN_ID}/bestiary`)).toEqual({
      screen: "bestiary",
      campaignId: CAMPAIGN_ID,
    });
    expect(parseRoute("#/campaigns/not-a-uuid/bestiary")).toEqual({ screen: "campaigns" });
  });

  it("hangs the chronicle off a campaign too, for the same reason", () => {
    // Every source it reads — `sessions.list`, `recap.read`, `search.search` —
    // is under `/campaigns/:campaignId`, and on the search endpoint that path is
    // a security property rather than a routing one.
    expect(parseRoute(`#/campaigns/${CAMPAIGN_ID}/chronicle`)).toEqual({
      screen: "chronicle",
      campaignId: CAMPAIGN_ID,
    });
    expect(parseRoute("#/campaigns/not-a-uuid/chronicle")).toEqual({ screen: "campaigns" });
    // An unknown section under a real campaign is that campaign, not a 404.
    expect(parseRoute(`#/campaigns/${CAMPAIGN_ID}/chronicles`)).toEqual({
      screen: "campaign",
      campaignId: CAMPAIGN_ID,
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

  it("carries the role switch in the URL, because a mode kept beside it could disagree", () => {
    // The captain settled the switch as a mode rather than a filter, so it
    // changes what the app is. Held in React state it would be a second answer
    // to "which app am I in" beside the URL, and a reload, a bookmark or a
    // shared link would land on a screen the pill says you are not looking at.
    expect(parseRoute("#/play")).toEqual({ screen: "play" });
    expect(parseRoute(`#/play/campaigns/${CAMPAIGN_ID}`)).toEqual({
      screen: "playCampaign",
      campaignId: CAMPAIGN_ID,
    });

    expect(modeOf({ screen: "play" })).toBe("player");
    expect(modeOf({ screen: "playCampaign", campaignId: CAMPAIGN_ID })).toBe("player");
    expect(modeOf({ screen: "campaign", campaignId: CAMPAIGN_ID })).toBe("dm");
    // Neither names a mode; the answer only decides which nav they draw, and
    // the invitation page runs before there is anybody to have a role at all.
    expect(modeOf({ screen: "join", token: "aG93" })).toBe("dm");
    expect(modeOf({ screen: "gallery" })).toBe("dm");

    expect(hrefFor(listFor("player"))).toBe("#/play");
    expect(hrefFor(listFor("dm"))).toBe("#/campaigns");
  });

  it("falls back within the mode, not out of it, on a player link it cannot read", () => {
    // The id is what was illegible; the mode was not. Falling back to the DM's
    // list would answer a question the URL did not ask.
    expect(parseRoute("#/play/campaigns/not-a-uuid")).toEqual({ screen: "play" });
    expect(parseRoute("#/play/campaigns")).toEqual({ screen: "play" });
    expect(parseRoute("#/play/nonsense")).toEqual({ screen: "play" });
  });

  it("falls back to the list rather than throwing on an id we never minted", () => {
    // The ids are branded UUIDs, so a hand-typed one has to decode or be refused.
    expect(parseRoute("#/campaigns/not-a-uuid")).toEqual({ screen: "campaigns" });
    expect(parseRoute("#/campaigns")).toEqual({ screen: "campaigns" });
    expect(parseRoute("")).toEqual({ screen: "campaigns" });
  });
});
