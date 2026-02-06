import * as Tool from "@effect/ai/Tool";
import * as Toolkit from "@effect/ai/Toolkit";
import * as Schema from "effect/Schema";

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
  Tool.make("SendGreeting", {
    description: "Send a greeting message",
    parameters: {
      query: Schema.String,
    },
    success: TransientResponse(Schema.String),
  }),
) {}

export type ToolkitSuccess = Tool.Success<
  (typeof toolkit)["tools"][keyof (typeof toolkit)["tools"]]
>;
