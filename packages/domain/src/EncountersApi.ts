import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { CampaignId } from "./CampaignsApi.js";

export const EncounterId = Schema.UUID.pipe(Schema.brand("EncounterId"));
export type EncounterId = typeof EncounterId.Type;

export const EncounterIdFromString = Schema.UUID.pipe(
  Schema.compose(EncounterId),
);

export const EncounterPhase = Schema.Literal(
  "exploration",
  "combat",
  "resolved",
);

export class Encounter extends Schema.Class<Encounter>("Encounter")({
  id: EncounterId,
  name: Schema.NonEmptyTrimmedString,
  campaignId: Schema.optional(CampaignId),
  phase: EncounterPhase,
  // startedAt: Schema.optional(Schema.DateTimeUtcFromDate),
  // endedAt: Schema.optional(Schema.DateTimeUtcFromDate),
  // TODO: Fix this throws a parse error when decoding from postgres TIMESTAMP
  // createdAt: Schema.DateTimeUtcFromDate,
  // updatedAt: Schema.DateTimeUtcFromDate,
}) {}

export class CreateEncounterPayload extends Schema.Class<CreateEncounterPayload>(
  "CreateEncounterPayload",
)({
  name: Schema.NonEmptyTrimmedString,
  campaignId: Schema.optional(CampaignId),
  phase: EncounterPhase,
}) {}

export class EncounterRpc extends RpcGroup.make(
  Rpc.make("EncounterList", {
    success: Encounter,
    stream: true,
  }),
  Rpc.make("EncounterCreate", {
    success: Encounter,
    payload: CreateEncounterPayload,
  }),
) {}
