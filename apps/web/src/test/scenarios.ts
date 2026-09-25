import {
  campaign,
  campaignId,
  encounterShelf,
  fullCampaign,
  type Answer,
} from "../campaign/campaign.fixtures";
import { twoTables } from "../characters/characters.fixtures";
import { fullChronicle } from "../chronicle/chronicle.fixtures";
import { brannocSheetSeat, fullParty, pellSeat, sorrelSeat } from "../party/party.fixtures";
import { fullRules } from "../rules/rules.fixtures";
import { liveFight } from "../run/run.fixtures";
import type { Scenario } from "./screens";

/**
 * The wire each screen in `test/screens.ts` is read over.
 *
 * One map per scenario, for two readers: `shell/primaries.test.tsx` installs it
 * as the jsdom suite's stub server, and the Playwright suite's stub API
 * (`apps/web/e2e/stub/`) serves it over HTTP to a real Chromium, so the browser
 * suite needs no Postgres and answers with exactly the JSON the screen tests
 * assert against.
 *
 * A scenario is one account's view of the wire. The maps are merged in order
 * and a later key wins, so the fight's running session is what the creator's
 * campaign row shows. A request the merged map cannot answer is a 404 the
 * Playwright suite records against the test that made it.
 */
export const scenarios = {
  // `fullParty` and `fullRules` are each `fullCampaign` plus overrides, so the
  // Chronicle's sessions go after them or the campaign's own list wins back.
  // The membership is the campaign's, not the Chronicle's world-less one, so
  // the campaign row carries its Shared World chip; the encounters are the
  // shelf of every kind, one of them played, so the Encounters page draws each
  // group, pill and preview section, and one encounter's page has its own.
  creator: () => {
    const routes = new Map([
      ...fullParty(),
      ...fullRules(),
      ...fullChronicle(),
      ...liveFight(),
      ...encounterShelf(),
    ]);
    const answer = fullCampaign().get("GET /me/campaigns");
    if (answer !== undefined) routes.set("GET /me/campaigns", answer);
    // The seated party, after the Chronicle's empty one, so the Party tab and
    // a seat's page are measured over characters — Brannoc's with the whole
    // sheet the seat page draws read-only.
    routes.set(`GET /campaigns/${campaignId}/party`, {
      status: 200,
      body: [brannocSheetSeat, sorrelSeat, pellSeat],
    });
    return routes;
  },
  // The campaign's reads, with `twoTables`' memberships seating this account
  // as a player — the composition `PlayerCampaignScreen.test.tsx` makes.
  player: () =>
    new Map([
      ...fullCampaign(),
      ...twoTables(),
      [`GET /campaigns/${campaignId}`, { status: 200, body: campaign }],
    ]),
} satisfies Record<Scenario, () => Map<string, Answer>>;
