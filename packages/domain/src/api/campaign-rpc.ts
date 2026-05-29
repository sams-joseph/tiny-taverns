import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import { AuthMiddleware } from "../auth.js";
import { CampaignId } from "./ids.js";

export { CampaignId } from "./ids.js";

export class CampaignNotFoundError extends Schema.TaggedErrorClass<CampaignNotFoundError>()(
  "CampaignNotFoundError",
  {
    id: CampaignId,
  },
) {}

export class Campaign extends Schema.Opaque<Campaign>()(
  Schema.Struct({
    id: CampaignId,
    title: Schema.String,
    createdAt: Schema.DateTimeUtcFromString,
    updatedAt: Schema.DateTimeUtcFromString,
  }),
) {}

export class CampaignCreateRpc extends Rpc.make("campaign_create", {
  payload: {
    title: Schema.NonEmptyString,
  },
  success: Campaign,
}) {}

export class CampaignListRpc extends Rpc.make("campaign_list", {
  payload: {
    cursor: Schema.NullOr(Schema.DateTimeUtcFromString),
  },
  success: Schema.Struct({
    items: Schema.Array(Campaign),
    hasMore: Schema.Boolean,
  }),
}) {}

export class CampaignGetRpc extends Rpc.make("campaign_get", {
  payload: { campaignId: CampaignId },
  success: Campaign,
  error: CampaignNotFoundError,
}) {}

export class CampaignRpc extends RpcGroup.make(
  CampaignCreateRpc,
  CampaignListRpc,
  CampaignGetRpc,
).middleware(AuthMiddleware) {}
