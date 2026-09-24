import {
  campaign,
  campaignId,
  encounterId,
  fullCampaign,
  npcId,
  runId,
  sessionId,
  worldId,
  type Answer,
} from "../campaign/campaign.fixtures";
import { brannocId, twoTables } from "../characters/characters.fixtures";
import { fullChronicle } from "../chronicle/chronicle.fixtures";
import { fullParty } from "../party/party.fixtures";
import { fullRules } from "../rules/rules.fixtures";
import { liveFight } from "../run/run.fixtures";

/**
 * The screens the shell is measured on, and the wire each is read over.
 *
 * One list for two readers: `shell/primaries.test.tsx` renders every screen in
 * jsdom, and `apps/web/audit/audit.mjs` serves these maps over HTTP to a real
 * Chromium, so the browser audit needs no Postgres and answers with exactly
 * the JSON the screen tests assert against.
 *
 * A scenario is one account's view of the wire. The maps are merged in order
 * and a later key wins, so the fight's running session is what the creator's
 * campaign row shows. A screen the merged map cannot answer shows up in the
 * audit's `unanswered` column rather than as a silent 404.
 */
export const scenarios = {
  // `fullParty` and `fullRules` are each `fullCampaign` plus overrides, so the
  // Chronicle's sessions go after them or the campaign's own list wins back.
  // The membership is the campaign's, not the Chronicle's world-less one, so
  // the campaign row carries its Shared World chip; the encounters are the
  // campaign's too, so the Encounters list and one encounter's page have one.
  creator: () => {
    const routes = new Map([...fullParty(), ...fullRules(), ...fullChronicle(), ...liveFight()]);
    const campaignOwn = fullCampaign();
    for (const route of ["GET /me/campaigns", `GET /campaigns/${campaignId}/encounters`]) {
      const answer = campaignOwn.get(route);
      if (answer !== undefined) routes.set(route, answer);
    }
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
} satisfies Record<string, () => Map<string, Answer>>;

export interface Screen {
  readonly name: string;
  readonly scenario: keyof typeof scenarios;
  readonly path: string;
}

const c = `/campaigns/${campaignId}`;

/** The eighteen screens, in the order the audit walks them. */
export const screens: ReadonlyArray<Screen> = [
  { name: "campaigns", scenario: "creator", path: "/campaigns" },
  { name: "worlds", scenario: "creator", path: "/worlds" },
  { name: "world", scenario: "creator", path: `/worlds/${worldId}` },
  { name: "world-chronicle", scenario: "creator", path: `/worlds/${worldId}/chronicle` },
  { name: "overview", scenario: "creator", path: c },
  { name: "encounters", scenario: "creator", path: `${c}/encounters` },
  { name: "encounter", scenario: "creator", path: `${c}/encounters/${encounterId}` },
  { name: "notes", scenario: "creator", path: `${c}/notes` },
  { name: "cast", scenario: "creator", path: `${c}/cast` },
  { name: "npc", scenario: "creator", path: `${c}/cast/${npcId}` },
  { name: "chronicle", scenario: "creator", path: `${c}/chronicle` },
  { name: "party", scenario: "creator", path: `${c}/party` },
  { name: "run", scenario: "creator", path: `${c}/sessions/${sessionId}/runs/${runId}` },
  { name: "spells", scenario: "creator", path: "/library/spells" },
  { name: "characters", scenario: "player", path: "/characters" },
  { name: "sheet", scenario: "player", path: `/characters/${brannocId}` },
  { name: "player-overview", scenario: "player", path: c },
  { name: "player-table", scenario: "player", path: `${c}/table` },
];
