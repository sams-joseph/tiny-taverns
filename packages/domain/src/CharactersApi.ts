import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { UserId } from "./UsersApi.js";

export const CharacterId = Schema.UUID.pipe(Schema.brand("CharacterId"));
export type CharacterId = typeof CharacterId.Type;

export const CharacterIdFromString = Schema.UUID.pipe(
  Schema.compose(CharacterId),
);

export const CharacterKind = Schema.Literal("player", "npc");
export type CharacterKind = typeof CharacterKind.Type;

export const NpcMetadata = Schema.Struct({
  role: Schema.optional(Schema.NonEmptyTrimmedString),
  location: Schema.optional(Schema.NonEmptyTrimmedString),
  traits: Schema.optional(Schema.Array(Schema.NonEmptyTrimmedString)),
  voice: Schema.optional(Schema.NonEmptyTrimmedString),
  constraints: Schema.optional(Schema.Array(Schema.NonEmptyTrimmedString)),
});
export type NpcMetadata = typeof NpcMetadata.Type;

export const NpcMetadataJson = Schema.parseJson(NpcMetadata);

export class Character extends Schema.Class<Character>("Character")({
  id: CharacterId,
  name: Schema.NonEmptyTrimmedString,
  kind: CharacterKind,
  userId: Schema.NullishOr(UserId),
  npcMetadata: Schema.NullishOr(NpcMetadataJson),
  createdAt: Schema.Any,
  updatedAt: Schema.Any,
}) {}

export class CreateCharacterPayload extends Schema.Class<CreateCharacterPayload>(
  "CreateCharacterPayload",
)({
  name: Schema.NonEmptyTrimmedString,
  kind: Schema.optional(CharacterKind),
  userId: Schema.optional(UserId),
  npcMetadata: Schema.optional(NpcMetadataJson),
}) {}

export class CharacterRpc extends RpcGroup.make(
  Rpc.make("CharacterList", {
    success: Character,
    stream: true,
  }),
  Rpc.make("CharacterCreate", {
    success: Character,
    payload: CreateCharacterPayload,
  }),
) {}
