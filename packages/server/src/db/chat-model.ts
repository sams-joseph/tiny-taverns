import { ModelFamily } from "@app/domain/ai-models";
import * as Campaign from "@app/domain/api/campaign-rpc";
import * as Chat from "@app/domain/api/chat-rpc";
import * as Schema from "effect/Schema";
import { Model } from "effect/unstable/schema";

export class ChatModel extends Model.Class<ChatModel>("ChatModel")({
  id: Model.Generated(Chat.ChatId),
  userId: Schema.String,
  campaignId: Schema.NullOr(Campaign.CampaignId),
  title: Schema.NonEmptyString,
  model: ModelFamily,
  messages: Model.JsonFromString(Schema.Array(Chat.Message)),
  activeRunId: Schema.NullOr(Chat.RunId),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}
