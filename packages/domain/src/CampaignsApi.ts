import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
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

export class CampaignsApiGroup extends HttpApiGroup.make("campaigns")
  .add(
    HttpApiEndpoint.get("getAllCampaigns", "/campaigns")
      .addSuccess(Schema.Array(Campaign))
      .setUrlParams(
        Schema.Struct({
          search: Schema.optional(Schema.NonEmptyTrimmedString),
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("createCampaign", "/campaigns")
      .addSuccess(Campaign)
      .setPayload(CreateCampaignPayload),
  ) {}

export class CampaignsApi extends HttpApi.make("api").add(CampaignsApiGroup) {}
