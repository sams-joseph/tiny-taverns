import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { CampaignId } from "./CampaignsApi.js";
import { EncounterId } from "./EncountersApi.js";

export const QuestId = Schema.UUID.pipe(Schema.brand("QuestId"));
export type QuestId = typeof QuestId.Type;

export const QuestIdFromString = Schema.UUID.pipe(Schema.compose(QuestId));

export const QuestReward = Schema.Struct({
  experience: Schema.Number,
  currency: Schema.Number,
});
export type QuestReward = typeof QuestReward.Type;

export class Quest extends Schema.Class<Quest>("Quest")({
  id: QuestId,
  name: Schema.NonEmptyTrimmedString,
  description: Schema.NullishOr(Schema.NonEmptyTrimmedString),
  campaignId: Schema.optional(CampaignId),
  parentQuestId: Schema.NullishOr(QuestId),
  rewards: QuestReward,
}) {}

export class CreateQuestPayload extends Schema.Class<CreateQuestPayload>(
  "CreateQuestPayload",
)({
  name: Schema.NonEmptyTrimmedString,
  description: Schema.optional(Schema.NonEmptyTrimmedString),
  campaignId: Schema.optional(CampaignId),
  parentQuestId: Schema.optional(QuestId),
  rewards: QuestReward,
}) {}

export class QuestEncounterLink extends Schema.Class<QuestEncounterLink>(
  "QuestEncounterLink",
)({
  questId: QuestId,
  encounterId: EncounterId,
}) {}

export class QuestEncounterLinkPayload extends Schema.Class<QuestEncounterLinkPayload>(
  "QuestEncounterLinkPayload",
)({
  questId: QuestId,
  encounterId: EncounterId,
}) {}

export class QuestEncountersByQuestPayload extends Schema.Class<QuestEncountersByQuestPayload>(
  "QuestEncountersByQuestPayload",
)({
  questId: QuestId,
}) {}

export class QuestEncountersByEncounterPayload extends Schema.Class<QuestEncountersByEncounterPayload>(
  "QuestEncountersByEncounterPayload",
)({
  encounterId: EncounterId,
}) {}

export class QuestRpc extends RpcGroup.make(
  Rpc.make("QuestList", {
    success: Quest,
    stream: true,
  }),
  Rpc.make("QuestCreate", {
    success: Quest,
    payload: CreateQuestPayload,
  }),
  Rpc.make("QuestEncounterLink", {
    success: QuestEncounterLink,
    payload: QuestEncounterLinkPayload,
  }),
  Rpc.make("QuestEncounterUnlink", {
    success: QuestEncounterLink,
    payload: QuestEncounterLinkPayload,
  }),
  Rpc.make("QuestEncountersForQuest", {
    success: QuestEncounterLink,
    payload: QuestEncountersByQuestPayload,
    stream: true,
  }),
  Rpc.make("QuestEncountersForEncounter", {
    success: QuestEncounterLink,
    payload: QuestEncountersByEncounterPayload,
    stream: true,
  }),
) {}
