import { Schema } from "effect";

export const CampaignId = Schema.UUID.pipe(Schema.brand("CampaignId"));
export type CampaignId = typeof CampaignId.Type;

export const CampaignIdFromString = Schema.UUID.pipe(
  Schema.compose(CampaignId),
);

export class Campaign extends Schema.Class<Campaign>("Campaign")({
  id: CampaignId,
  name: Schema.NonEmptyTrimmedString,
  description: Schema.NonEmptyTrimmedString,
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
}) {}

export class CreateCampaignPayload extends Schema.Class<CreateCampaignPayload>(
  "CreateCampaignPayload",
)({
  name: Schema.NonEmptyTrimmedString,
  description: Schema.NonEmptyTrimmedString,
}) {}
