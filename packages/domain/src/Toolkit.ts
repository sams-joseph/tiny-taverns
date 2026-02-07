import * as Tool from "@effect/ai/Tool";
import * as Toolkit from "@effect/ai/Toolkit";
import * as Schema from "effect/Schema";
import { CreateMonsterPayload, Monster } from "./MonstersApi.js";
import { CreateCampaignPayload } from "./index.js";

export const TerminalResponse = <S extends Schema.Schema.Any>(
  schema: S,
): Schema.transform<
  S,
  Schema.TaggedStruct<"Terminal", { value: Schema.Schema<S["Type"]> }>
> =>
  Schema.transform(
    schema,
    Schema.TaggedStruct("Terminal", {
      value: Schema.typeSchema(schema),
    }),
    {
      decode: (value) => ({ _tag: "Terminal", value }) as const,
      encode: ({ value }) => value,
    },
  );

export const TransientResponse = <S extends Schema.Schema.Any>(
  schema: S,
): Schema.transform<
  S,
  Schema.TaggedStruct<"Transient", { value: Schema.Schema<S["Type"]> }>
> =>
  Schema.transform(
    schema,
    Schema.TaggedStruct("Transient", {
      value: Schema.typeSchema(schema),
    }),
    {
      decode: (value) => ({ _tag: "Transient", value }) as const,
      encode: ({ value }) => value,
    },
  );

export class toolkit extends Toolkit.make(
  Tool.make("SearchMonsters", {
    description: "Search the users monsters by name",
    parameters: {
      query: Schema.optional(Schema.NonEmptyTrimmedString),
    },
    success: TransientResponse(Schema.Array(Monster)),
  }),
  Tool.make("CreateMonster", {
    description:
      "Create a new monster from the provided information. Returns the new monster ID.",
    parameters: {
      monster: CreateMonsterPayload,
    },
    success: TransientResponse(Schema.Struct({ monsterId: Schema.String })),
  }),
  Tool.make("CreateCampaign", {
    description:
      "Create a new campaign from the provided information. Returns the new campaign ID.",
    parameters: {
      campaign: CreateCampaignPayload,
    },
    success: TransientResponse(Schema.Struct({ campaignId: Schema.String })),
  }),
) {}

export type ToolkitSuccess = Tool.Success<
  (typeof toolkit)["tools"][keyof (typeof toolkit)["tools"]]
>;
