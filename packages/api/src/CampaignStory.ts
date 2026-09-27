import { Schema } from "effect";
import { CampaignId, CampaignStoryId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * A campaign's story: the story so far, and the *Previously* its creator reads
 * to open the next night.
 *
 * **Drafted by Hob, kept by the creator.** Hob's `proposeCampaignStory` offers
 * both from the recorded nights, and only the creator's accept writes them
 * (`origin = 'assistant'` with the turn). The creator may also write or edit
 * it by hand (`PUT`), and clear it (`DELETE`). There is one per campaign; a
 * write replaces it.
 *
 * `afterSessionNumber` is the newest ended night the story was written after,
 * stamped by the server — from the nights Hob read, or at the moment the
 * creator wrote it. A newer ended night means it needs updating, which the
 * client works out from the nights it already lists (zero before any night
 * has ended).
 */

/** The bounds `0072_campaign_story.ts` checks, stated once for both sides. */
export const CAMPAIGN_STORY_MAX = 8000;
export const CAMPAIGN_PREVIOUSLY_MAX = 4000;

export class CampaignStory extends Schema.Class<CampaignStory>("CampaignStory")({
  id: CampaignStoryId,
  campaignId: CampaignId,
  text: Schema.String,
  /** Spoken to the players to open the night after `afterSessionNumber`. */
  previously: Schema.NullOr(Schema.String),
  afterSessionNumber: Schema.Int,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * The story as a player reads it, once the creator has shared it.
 *
 * **A distinct type on a distinct path**, the `PlayerNote` rule: it cannot
 * spell `visibility` or provenance, so nothing but the SQL decides whether a
 * player reads it.
 */
export class PlayerCampaignStory extends Schema.Class<PlayerCampaignStory>("PlayerCampaignStory")({
  text: Schema.String,
  previously: Schema.NullOr(Schema.String),
  afterSessionNumber: Schema.Int,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const prose = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));

/**
 * The creator's write: the whole story, both texts named.
 *
 * Changing `text` or `previously` makes it the creator's own (`authored`) and
 * restamps `afterSessionNumber`; the same words with a `visibility` is the
 * share switch, and leaves both as they were. An absent `visibility` keeps the
 * story's own, and a new story falls to the column's `dm`. No `origin` and no
 * coverage: the server decides both.
 */
export const CampaignStoryPut = Schema.Struct({
  text: prose(CAMPAIGN_STORY_MAX),
  previously: Schema.NullOr(prose(CAMPAIGN_PREVIOUSLY_MAX)),
  visibility: Schema.optional(Visibility),
});
export type CampaignStoryPut = typeof CampaignStoryPut.Type;
