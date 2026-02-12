import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import type { Chat } from "@effect/ai";
import type { StreamPart } from "@effect/ai/Response";
import type * as Tool from "@effect/ai/Tool";
import type * as Toolkit from "@effect/ai/Toolkit";
import { Mailbox, Ref } from "effect";

type RunAgentLoopOptions<Tools extends Record<string, Tool.Any>> = {
  chat: Chat.Service;
  mailbox: Mailbox.Mailbox<StreamPart<Tools>>;
  tools?: Toolkit.WithHandler<Tools> | undefined;
  maxIterations?: number;
};

type AnyStreamPart = StreamPart<Record<string, Tool.Any>>;

export const runAgentLoop = <Tools extends Record<string, Tool.Any>>(
  options: RunAgentLoopOptions<Tools>,
) =>
  Effect.iterate(
    {
      finishReason: "tool-calls",
      iteration: 0,
    },
    {
      while: (state) =>
        state.finishReason === "tool-calls" &&
        state.iteration < (options.maxIterations ?? 8),
      body: (state) =>
        Effect.gen(function* () {
          const iteration = state.iteration + 1;
          const finishReason = yield* Effect.gen(function* () {
            const finishReasonRef = yield* Ref.make("stop");

            yield* options.chat
              .streamText({
                prompt: [],
                toolkit: options.tools,
              })
              .pipe(
                Stream.runForEach((chunk) =>
                  Effect.gen(function* () {
                    if ((chunk as AnyStreamPart).type === "tool-call") {
                      yield* Ref.set(finishReasonRef, "tool-calls");
                    }

                    yield* options.mailbox.offer(chunk);
                  }),
                ),
                Stream.runDrain,
              );

            return yield* Ref.get(finishReasonRef);
          });

          return {
            finishReason,
            iteration,
          } as const;
        }),
    },
  );
