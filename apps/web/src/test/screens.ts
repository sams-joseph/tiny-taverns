import {
  brannocId,
  campaignId,
  encounterId,
  npcId,
  runId,
  seatId,
  sessionId,
  sourceNpcId,
  worldId,
} from "./ids";

/**
 * The screens the shell is measured on.
 *
 * One list for two readers: `shell/primaries.test.tsx` renders every screen in
 * jsdom, and the Playwright suite (`apps/web/e2e/`) measures every screen in a
 * real Chromium. Each names the scenario (`test/scenarios.ts`) whose wire it is
 * read over. This file imports nothing but ids, because Playwright loads it
 * outside Vitest.
 */

/**
 * One account's view of the wire; `test/scenarios.ts` holds the maps. The
 * three `creator-*` scenes are the creator's wire with the run on the table
 * played as that kind of scene instead of a fight.
 */
export type Scenario =
  | "creator"
  | "creator-social"
  | "creator-challenge"
  | "creator-hazard"
  | "player"
  | "player-chronicle"
  | "seated";

export interface Screen {
  readonly name: string;
  readonly scenario: Scenario;
  readonly path: string;
}

const c = `/campaigns/${campaignId}`;

/** The thirty screens. */
export const screens: ReadonlyArray<Screen> = [
  { name: "campaigns", scenario: "creator", path: "/campaigns" },
  { name: "worlds", scenario: "creator", path: "/worlds" },
  { name: "world", scenario: "creator", path: `/worlds/${worldId}` },
  { name: "world-chronicle", scenario: "creator", path: `/worlds/${worldId}/chronicle` },
  { name: "overview", scenario: "creator", path: c },
  { name: "encounters", scenario: "creator", path: `${c}/encounters` },
  { name: "encounter", scenario: "creator", path: `${c}/encounters/${encounterId}` },
  { name: "encounter-new", scenario: "creator", path: `${c}/encounters/new` },
  { name: "encounter-edit", scenario: "creator", path: `${c}/encounters/${encounterId}/edit` },
  { name: "notes", scenario: "creator", path: `${c}/notes` },
  { name: "cast", scenario: "creator", path: `${c}/cast` },
  { name: "npc", scenario: "creator", path: `${c}/cast/${npcId}` },
  { name: "npc-stats", scenario: "creator", path: `${c}/cast/${npcId}#stats` },
  { name: "cast-archived", scenario: "creator", path: `${c}/cast/archived` },
  { name: "chronicle", scenario: "creator", path: `${c}/chronicle` },
  { name: "party", scenario: "creator", path: `${c}/party` },
  { name: "party-seat", scenario: "creator", path: `${c}/party/${seatId}` },
  { name: "run", scenario: "creator", path: `${c}/sessions/${sessionId}/runs/${runId}` },
  {
    name: "run-social",
    scenario: "creator-social",
    path: `${c}/sessions/${sessionId}/runs/${runId}`,
  },
  {
    name: "run-challenge",
    scenario: "creator-challenge",
    path: `${c}/sessions/${sessionId}/runs/${runId}`,
  },
  {
    name: "run-hazard",
    scenario: "creator-hazard",
    path: `${c}/sessions/${sessionId}/runs/${runId}`,
  },
  { name: "spells", scenario: "creator", path: "/library/spells" },
  { name: "library-npcs", scenario: "creator", path: "/library/npcs" },
  { name: "library-npc", scenario: "creator", path: `/library/npcs/${sourceNpcId}` },
  { name: "characters", scenario: "player", path: "/characters" },
  { name: "sheet", scenario: "player", path: `/characters/${brannocId}` },
  { name: "player-overview", scenario: "player", path: c },
  { name: "player-table", scenario: "player", path: `${c}/table` },
  { name: "player-chronicle", scenario: "player-chronicle", path: `${c}/chronicle` },
  { name: "player-table-fight", scenario: "seated", path: `${c}/table` },
];
