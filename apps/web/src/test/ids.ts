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
export const runId = "2b1f2a1e-0000-4000-8000-000000000c01";
/** The Shared World the fixture campaign lives in — one per shared server. */
export const worldId = "5a1e2b3c-0000-4000-8000-00000000aaa1";
export const brannocId = Schema.decodeSync(CharacterId)("2b1f2a1e-0000-4000-8000-000000000901");
