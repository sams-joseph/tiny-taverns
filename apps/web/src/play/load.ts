import type { Campaign, CampaignId, Character, Note } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

/** Everything the player's view of a table renders, in one shape. */
export interface PlayerCampaignView {
  readonly campaign: Campaign;
  /** The characters this account may read: their own, and any shared. */
  readonly party: ReadonlyArray<Character>;
  /** What the DM has shared. A player is answered no `dm` row, by predicate. */
  readonly notes: ReadonlyArray<Note>;
}

/**
 * One Effect for the screen, the rule `campaign/load.ts` set — and three calls
 * rather than six, because **this is not the DM's load with rows dropped.**
 *
 * Every endpoint here is one a player may actually call. The DM's view composes
 * `runs.list`, which is behind the `DmActor` gate and answers a player a 404, so
 * a narrowed version of that load would fail as a whole for the audience it was
 * narrowed for. What is absent is absent because there is nothing behind it:
 *
 * - **the nights** — `sessions.list` is `rowReadable` and a session starts `dm`,
 *   so it is empty for a player until a DM shares one; a section that is
 *   structurally empty is the stubbed field the screens rule forbids.
 * - **the record** — `recap.readAsPlayer` exists and is the player Chronicle's,
 *   a screen of its own and not this one's aside.
 * - **the fight** — the player's live table needs the narrow run projection,
 *   which is not built.
 *
 * Each of those is a screen with a step of its own, and each earns its nav item
 * on the day it exists.
 */
export const loadPlayerCampaignView = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [campaign, party, notes] = yield* Effect.all(
      [
        client.campaigns.findById({ params: { campaignId } }),
        client.characters.list({ params: { campaignId } }),
        client.notes.list({ params: { campaignId } }),
      ],
      { concurrency: "unbounded" },
    );

    return { campaign, party, notes } satisfies PlayerCampaignView;
  });
