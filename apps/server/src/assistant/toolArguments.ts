import { Effect, Predicate, Schema, Stream } from "effect";
import { AiError, LanguageModel, type Response, type Tool } from "effect/unstable/ai";

/**
 * A language model whose tool calls are read against their tool's parameters
 * as they arrive, so a call that does not decode fails the stream there.
 *
 * That is where it failed up to effect 4.0.0-rc.112, which decoded a tool
 * call's arguments as part of decoding the response, and Hob's `recover` and
 * the NPC reply are built on it. From rc.113 the response carries the arguments
 * undecoded and `Toolkit.handle` decodes them later, routing a failure through
 * the tool's `failureMode`. Every tool here is `failureMode: "return"`, so a
 * malformed call would go on as an ordinary refused step: drawn as a call Hob
 * reached for, written to the `Chat` history with nothing answering it, handed
 * to the model as a tool's refusal, and never seen by `recover`, which is where
 * the correction a model can act on is written.
 *
 * Failing before the part leaves the model keeps all of that as it was: the
 * call is not drawn, the history does not hold it, and `recover` gets the
 * `ToolParameterValidationError` it reads. The decode asks for the rejected
 * input (`reportInput`), so the description already names the value a model
 * got wrong (`Expected a UUID, got "not-a-uuid"`).
 *
 * Only a toolkit handed over as a value is read, which is how Hob and the NPC
 * agent pass theirs; a call naming a tool the toolkit lacks still fails the
 * response decode, as it always did. Every parameter schema in these toolkits
 * is plain data with no services, which is what the cast below asserts.
 */
export const decodeToolCalls = (
  model: LanguageModel.LanguageModel,
): LanguageModel.LanguageModel => {
  // `streamText`'s overloads are about which toolkit it was given; this passes
  // every call through unchanged, so one signature is enough to say so.
  const streamText = model.streamText as (
    options: LanguageModel.GenerateTextOptions<Record<string, Tool.Any>>,
  ) => Stream.Stream<Response.AnyPart, unknown, unknown>;
  return LanguageModel.LanguageModel.of({
    ...model,
    streamText: ((options: LanguageModel.GenerateTextOptions<Record<string, Tool.Any>>) => {
      const parts = streamText(options);
      const toolkit: unknown = options.toolkit;
      return Predicate.hasProperty(toolkit, "tools")
        ? Stream.mapEffect(parts, (part) =>
            readable(toolkit.tools as Record<string, Tool.Any>, part),
          )
        : parts;
    }) as LanguageModel.LanguageModel["streamText"],
  });
};

const readable = <Part extends Response.AnyPart>(
  tools: Record<string, Tool.Any>,
  part: Part,
): Effect.Effect<Part, AiError.AiError> => {
  if (part.type !== "tool-call" || part.providerExecuted === true) return Effect.succeed(part);
  const call = part as Response.ToolCallPart<string, unknown>;
  const tool = Object.hasOwn(tools, call.name) ? tools[call.name] : undefined;
  if (tool === undefined || !Schema.isSchema(tool.parametersSchema)) return Effect.succeed(part);
  const decoded = Schema.decodeUnknownEffect(tool.parametersSchema)(call.params, {
    reportInput: true,
  }) as Effect.Effect<unknown, Schema.SchemaError>;
  return decoded.pipe(
    Effect.mapError((error) =>
      AiError.make({
        module: "LanguageModel",
        method: "streamText",
        reason: new AiError.ToolParameterValidationError({
          toolName: call.name,
          description: error.message,
        }),
      }),
    ),
    Effect.as(part),
  );
};
