import { brannocId, campaignId, encounterId, npcId, runId, sessionId, worldId } from "./ids";

/**
 * The screens the shell is measured on.
 *
 * One list for two readers: `shell/primaries.test.tsx` renders every screen in
 * jsdom, and the Playwright suite (`apps/web/e2e/`) measures every screen in a
 * real Chromium. Each names the scenario (`test/scenarios.ts`) whose wire it is
 * read over. This file imports nothing but ids, because Playwright loads it
 * outside Vitest.
 */

/** One account's view of the wire; `test/scenarios.ts` holds the maps. */
export type Scenario = "creator" | "player";

export interface Screen {
  readonly name: string;
  readonly scenario: Scenario;
  readonly path: string;
}

const c = `/campaigns/${campaignId}`;

/** The eighteen screens. */
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
