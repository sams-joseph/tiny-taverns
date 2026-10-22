import { CampaignId, CharacterId } from "@taverns/api";
import { Schema } from "effect";

/**
 * The fixture ids a screen's path names.
 *
 * They live apart from the fixture maps because the screen list
 * (`test/screens.ts`) is also read outside Vitest, by the Playwright suite in
 * `apps/web/e2e/`, which cannot import a module that imports `vitest` and the
 * render harness. The fixture files re-export them, so a test names them from
 * where it always did.
 */

export const campaignId = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
export const sessionId = "2b1f2a1e-0000-4000-8000-000000000501";
export const encounterId = "2b1f2a1e-0000-4000-8000-000000000601";
export const npcId = "2b1f2a1e-0000-4000-8000-00000000d0c1";
/** Cazril's Library original — the Library NPC page's path names it. */
export const sourceNpcId = "2b1f2a1e-0000-4000-8000-00000000d0c0";
export const runId = "2b1f2a1e-0000-4000-8000-000000000c01";
/** The Chronicle's older night, session 11 — `?session=` names it. */
export const chronicleNightId = "2b1f2a1e-0000-4000-8000-000000000511";
/** The Shared World the fixture campaign lives in — one per shared server. */
export const worldId = "5a1e2b3c-0000-4000-8000-00000000aaa1";
export const brannocId = Schema.decodeSync(CharacterId)("2b1f2a1e-0000-4000-8000-000000000901");
/** Brannoc's seat at the fixture campaign — the seat page's path names it. */
export const seatId = "2b1f2a1e-0000-4000-8000-000000000951";

/** The Hob conversation `creator-hob` offers a note in, and the turn it offers it on. */
export const hobThreadId = "2b1f2a1e-0000-4000-8000-00000000b0b1";
export const hobTurnId = "2b1f2a1e-0000-4000-8000-00000000b0b2";
/** An older conversation `creator-hob-threads` lists beside it. */
export const olderHobThreadId = "2b1f2a1e-0000-4000-8000-00000000b0b3";

/** The fixture shelf's places (`locations/locations.fixtures.ts`). */
export const gullportId = "6c0c0000-0000-4000-8000-000000000001";
export const stacksId = "6c0c0000-0000-4000-8000-000000000002";
export const lambId = "6c0c0000-0000-4000-8000-000000000003";
export const marshId = "6c0c0000-0000-4000-8000-000000000004";

/** The fixture shelf's levels (`levels/levels.fixtures.ts`). */
export const cryptLevelId = "1e7e0000-0000-4000-8000-000000000001";
export const fordLevelId = "1e7e0000-0000-4000-8000-000000000002";
