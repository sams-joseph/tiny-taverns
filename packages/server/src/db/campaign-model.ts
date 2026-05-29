import * as Campaign from "@app/domain/api/campaign-rpc";
import * as Schema from "effect/Schema";
import { Model } from "effect/unstable/schema";

export class CampaignModel extends Model.Class<CampaignModel>("CampaignModel")({
  id: Model.Generated(Campaign.CampaignId),
  userId: Schema.String,
  title: Schema.NonEmptyString,
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}
