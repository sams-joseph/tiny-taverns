import { Schema } from "effect";
import { CampaignActId, CampaignId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/** The bound the schema and the table both state for an act's title. */
export const ACT_TITLE_MAX = 120;

/**
 * A named run of a campaign's nights on the Chronicle — *"Act II · The salt
 * road"*, sessions 7–12.
 *
 * An act is where it starts: the night numbered `firstSessionNumber` and every
 * night after it, up to the night before the next act's start. Which nights
 * that is, and so the range a heading shows, is the client's arithmetic over
 * the nights it reads; nothing stores an end (`0071_campaign_act.ts`).
 *
 * The creator and a player read the same shape. A player lists only the acts
 * the DM shared, and a shared act tells them its title and the number it
 * starts at, which is nothing about that night beyond its number.
 */
export class CampaignAct extends Schema.Class<CampaignAct>("CampaignAct")({
  id: CampaignActId,
  campaignId: CampaignId,
  title: Schema.String,
  firstSessionNumber: Schema.Int,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/** An act's title: something besides whitespace, bounded. Trimmed on the way in. */
const title = Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(ACT_TITLE_MAX));

/**
 * Starting a new act at a night. The night must exist in the campaign; a
 * second act at the same night is a `Conflict`. There is no `origin`: an act
 * the creator keeps from their Hob is stamped by the accept
 * (`repo/Proposals.ts`), never by a payload.
 */
export const CampaignActCreate = Schema.Struct({
  title,
  firstSessionNumber: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000 })),
  visibility: Schema.optional(Visibility),
});
export type CampaignActCreate = typeof CampaignActCreate.Type;

/**
 * Renaming an act, and sharing or unsharing it. An act does not move: to start
 * it at another night, remove it and start one there.
 */
export const CampaignActUpdate = Schema.Struct({
  title: Schema.optional(title),
  visibility: Schema.optional(Visibility),
});
export type CampaignActUpdate = typeof CampaignActUpdate.Type;
