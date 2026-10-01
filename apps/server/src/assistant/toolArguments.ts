import { Deferred, Effect, Predicate, Schema, Stream } from "effect";
import { AiError, LanguageModel, type Response, type Tool, type Toolkit } from "effect/ai";

/**
 * A language model that reads every tool call in a response against its tool's
 * parameters before any of them is drawn or run, so one call that does not
 * decode fails the whole round.
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
 * Reading each call alone as it leaves `streamText` is not enough either:
 * `LanguageModel.make` reads the provider in a fiber of its own and starts the
 * handlers from there, so a valid call beside a malformed one could be drawn,
 * or its handler already done, by the time the malformed one failed the stream,
 * and the retried round would run it again. So the calls are read a chunk at a
 * time, before any part of the chunk is handed on, and every handler waits
 * until the chunk its call came in has been read. A chunk with one call that
 * does not decode fails the stream: none of its calls is drawn, no handler
 * runs, the history does not hold them, and `recover` gets the
 * `ToolParameterValidationError` it reads. The openai-compat adapter sends a
 * response's every tool call in the one chunk that finishes it, so that chunk
 * is the whole round. The decode asks for the rejected input (`reportInput`),
 * so the description already names the value a model got wrong
 * (`Expected a UUID, got "not-a-uuid"`).
 *
 * Only a toolkit handed over as a value is read, which is how Hob and the NPC
 * agent pass theirs, and none of their tools asks for approval (an approved
 * call is handled before the response it would be read in). A call naming a
 * tool the toolkit lacks still fails the response decode, as it always did.
 * Every parameter schema in these toolkits is plain data with no services,
 * which is what the casts below assert.
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
      const toolkit: unknown = options.toolkit;
      if (!Predicate.hasProperty(toolkit, "tools") || !Predicate.hasProperty(toolkit, "handle")) {
        return streamText(options);
      }
      const { tools, handle } = toolkit as Toolkit.WithHandler<Record<string, Tool.Any>>;
      return Stream.suspend(() => {
        const read = new Map<string, Deferred.Deferred<void>>();
        const gate = (id: string) => {
          const known = read.get(id);
          if (known !== undefined) return known;
          const made = Deferred.makeUnsafe<void>();
          read.set(id, made);
          return made;
        };
        const gated: Toolkit.WithHandler<Record<string, Tool.Any>> = {
          tools,
          handle: (name, params, id, parseOptions) =>
            Effect.andThen(
              id === undefined ? Effect.void : Deferred.await(gate(id)),
              handle(name, params, id, parseOptions),
            ),
        };
        return Stream.mapArrayEffect(streamText({ ...options, toolkit: gated }), (parts) =>
          readable(tools, parts).pipe(
            Effect.andThen(
              Effect.forEach(
                parts,
                (part) =>
                  part.type === "tool-call"
                    ? Deferred.succeed(gate(part.id), undefined)
                    : Effect.void,
                { discard: true },
              ),
            ),
            Effect.as(parts),
          ),
        );
      });
    }) as LanguageModel.LanguageModel["streamText"],
  });
};

const readable = (
  tools: Record<string, Tool.Any>,
  parts: ReadonlyArray<Response.AnyPart>,
): Effect.Effect<void, AiError.AiError> =>
  Effect.forEach(
    parts,
    (part) => {
      if (part.type !== "tool-call" || part.providerExecuted === true) return Effect.void;
      const call = part as Response.ToolCallPart<string, unknown>;
      const tool = Object.hasOwn(tools, call.name) ? tools[call.name] : undefined;
      if (tool === undefined || !Schema.isSchema(tool.parametersSchema)) return Effect.void;
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
        Effect.asVoid,
      );
    },
    { discard: true },
  );
