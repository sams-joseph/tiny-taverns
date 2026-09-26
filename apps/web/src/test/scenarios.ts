import {
  campaign,
  campaignId,
  sessionId,
  encounterShelf,
  fullCampaign,
  noteShelf,
  page,
  type Answer,
} from "../campaign/campaign.fixtures";
import { playing, sharedBoard, tableOrder, twoTables } from "../characters/characters.fixtures";
import { fullChronicle } from "../chronicle/chronicle.fixtures";
import { fullParty, fullPartyPrep, fullPartySeats } from "../party/party.fixtures";
import { fullRules } from "../rules/rules.fixtures";
import { liveFight, liveScene, type SceneMode } from "../run/run.fixtures";
import { brannocId } from "./ids";
import type { Scenario } from "./screens";

// The campaign's reads, with `twoTables`' memberships seating this account as a
// player — the composition `PlayerCampaignScreen.test.tsx` makes. The
// creator's notes read is refused, as the server refuses it, so a player
// screen that reached for it would record a 404 rather than draw a DM note.
const player = (): Map<string, Answer> => {
  const routes = new Map([
    ...fullCampaign(),
    ...twoTables(),
    [`GET /campaigns/${campaignId}`, { status: 200, body: campaign }],
  ]);
  routes.set(`GET /campaigns/${campaignId}/notes`, {
    status: 404,
    body: { _tag: "NotFound", resource: "campaign", id: campaignId },
  });
  return routes;
};

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
// `fullParty` and `fullRules` are each `fullCampaign` plus overrides, so the
// Chronicle's sessions go after them or the campaign's own list wins back.
// The membership is the campaign's, not the Chronicle's world-less one, so
// the campaign row carries its Shared World chip; the encounters are the
// shelf of every kind, one of them played, so the Encounters page draws each
// group, pill and preview section, and one encounter's page has its own.
const creator = (): Map<string, Answer> => {
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
  // a seat's page are measured over characters — four cards, one deleted,
  // Brannoc's with the whole sheet the seat page draws read-only — and
  // their prep, so a card's foot draws a hook and a secret.
  routes.set(`GET /campaigns/${campaignId}/party`, { status: 200, body: fullPartySeats });
  routes.set(`GET /campaigns/${campaignId}/party-prep`, { status: 200, body: fullPartyPrep });
  // The Notes tab's shelf, after the Chronicle's empty list, so the list and
  // the pane are measured over notes: a read-aloud, two paragraphs, a shared
  // one and an empty one.
  routes.set(`GET /campaigns/${campaignId}/notes`, { status: 200, body: page(noteShelf) });
  for (const note of noteShelf)
    routes.set(`PATCH /campaigns/${campaignId}/notes/${note.id}`, { status: 200, body: note });
  return routes;
};

/** The creator's wire, with the run on the table played as this kind of scene. */
const creatorScene = (mode: SceneMode) => (): Map<string, Answer> =>
  new Map([...creator(), ...liveScene(mode)]);

export const scenarios = {
  creator,
  "creator-social": creatorScene("social"),
  "creator-challenge": creatorScene("challenge"),
  "creator-hazard": creatorScene("hazard"),
  player,
  // The same player with a fight on the table and its map shared: themselves,
  // an ally and a monster in the order, and the board with two of them on it.
  // The doorbell is refused, as `PlayerTableScreen.test.tsx` refuses it: a
  // stub cannot hold a stream open, and one that closed would be retried and
  // re-read for as long as the page is measured.
  seated: () =>
    new Map([
      ...player(),
      playing(campaignId, { order: tableOrder, board: sharedBoard }),
      [
        `GET /campaigns/${campaignId}/table/sessions/${sessionId}/characters/${brannocId}/rolls`,
        { status: 200, body: [] },
      ],
      [`GET /campaigns/${campaignId}/npcs/-/sessions/${sessionId}`, { status: 200, body: [] }],
      [
        `GET /campaigns/${campaignId}/table/sessions/${sessionId}/events`,
        { status: 404, body: { _tag: "NotFound", resource: "session" } },
      ],
    ]),
} satisfies Record<Scenario, () => Map<string, Answer>>;
