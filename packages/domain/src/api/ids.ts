import * as Schema from "effect/Schema";

export const CampaignId = Schema.String.pipe(
  Schema.check(Schema.isUUID(undefined)),
  Schema.brand("CampaignId"),
);
export type CampaignId = typeof CampaignId.Type;

export const ChatId = Schema.String.pipe(
  Schema.check(Schema.isUUID(undefined)),
  Schema.brand("ChatId"),
);
export type ChatId = typeof ChatId.Type;

export const RunId = Schema.String.pipe(
  Schema.check(Schema.isUUID(undefined)),
  Schema.brand("RunId"),
);
export type RunId = typeof RunId.Type;
