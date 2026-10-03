import type { AssistantThreadId } from "@taverns/api";
import { CurrentActor } from "@taverns/api";
import { Cause, Context, Duration, Effect, FiberSet, Layer, Stream } from "effect";
import { LanguageModel } from "effect/ai";
import { type ConversationScope, HobThreads } from "../repo/HobThreads.js";
import type { ConversationReach } from "../repo/visibility.js";

/**
 * Hob names a conversation after its first question.
 *
 * One more round-trip to the model Hob answers on, asked once per thread and
 * **after** the first answer has been delivered: a local server that takes one
 * request at a time would otherwise make the DM wait for the name before the
 * answer, and a name is worth less than the answer it would delay. The job is
 * a fiber this service owns (the `HobImages` shape): the request that started
 * the thread does not wait for it, a failure is a log line and never an event
 * in the answer, and shutdown interrupts it.
 *
 * What it writes is `assistant_thread.name`, through `HobThreads.name` and the
 * asker's own reach — never past what the asker could read — and only when the
 * thread has none. Until it lands, and for good when the model says nothing
 * usable, the conversations list shows the thread's `title`, the question
 * itself, shortened.
 *
 * Optional, the way `HobDirectWrites` is: `Hob` names threads only when this
 * service is provided, which `app.ts` does whenever Hob is ON. A suite that
 * scripts the model round by round does not provide it, so its scripts are not
 * shifted by a round it never asked for; `hob-naming.test.ts` does.
 */

/** Longer than a reply is allowed to take, since nobody is waiting on it. */
export const NAME_TIMEOUT = Duration.seconds(90);

const SYSTEM =
  "You name conversations for a tabletop game master's assistant. Reply with a name " +
  "of at most six words for the conversation that begins with the message below: its " +
  "subject, in title case, with no quotation marks, no ending punctuation, and nothing else.";

/** The longest name kept whole; longer is shortened at a word, as a title is. */
const NAME_MAX = 60;

/**
 * What the model said, as a name, or nothing when it said nothing usable.
 *
 * Models dress a one-line answer up — a `Name:` label, quotes, bold, a full
 * stop, an inline `<think>` block from a server that does not split reasoning
 * out — so this keeps the first line of what is left and strips the dressing.
 */
export const nameFrom = (said: string): string | undefined => {
  const unthought = said.replaceAll(/<think>[\s\S]*?(<\/think>|$)/g, "");
  const line =
    unthought
      .split("\n")
      .map((each) => each.trim())
      .find((each) => each !== "") ?? "";
  const bare = line
    .replaceAll(/[*_`#]/g, "")
    .replace(/^(name|title)\s*:\s*/i, "")
    .replace(/[.!?:;,]+$/, "")
    .replace(/^["'“‘]+/, "")
    .replace(/["'”’]+$/, "")
    .replace(/[.!?:;,]+$/, "")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (bare === "") return undefined;
  if (bare.length <= NAME_MAX) return bare;
  const cut = bare.slice(0, NAME_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

export class HobNamer extends Context.Service<
  HobNamer,
  {
    /**
     * Names a thread from the question that started it, in the background.
     * Returns at once and cannot fail; the asker is captured here, so the
     * write later answers to the same reach the question did.
     */
    readonly nameSoon: (
      reach: ConversationReach,
      scopeId: ConversationScope,
      threadId: AssistantThreadId,
      question: string,
    ) => Effect.Effect<void, never, CurrentActor>;
    /** Every naming begun has finished, however it ended. For tests. */
    readonly idle: Effect.Effect<void>;
  }
>()("HobNamer") {
  static readonly layer: Layer.Layer<HobNamer, never, LanguageModel.LanguageModel | HobThreads> =
    Layer.effect(this)(
      Effect.gen(function* () {
        const model = yield* LanguageModel.LanguageModel;
        const threads = yield* HobThreads;
        const jobs = yield* FiberSet.make<void, never>();

        const said = (question: string) =>
          LanguageModel.streamText({
            prompt: [
              { role: "system", content: SYSTEM },
              { role: "user", content: question },
            ],
          }).pipe(
            Stream.runFold(
              () => "",
              (text, part) => (part.type === "text-delta" ? text + part.delta : text),
            ),
            Effect.provideService(LanguageModel.LanguageModel, model),
          );

        return {
          nameSoon: (reach, scopeId, threadId, question) =>
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const job = said(question).pipe(
                Effect.timeout(NAME_TIMEOUT),
                Effect.flatMap((text) => {
                  const name = nameFrom(text);
                  return name === undefined
                    ? Effect.void
                    : threads.name(reach, scopeId, threadId, name);
                }),
                Effect.provideService(CurrentActor, actor),
                Effect.catchCause((cause) =>
                  Cause.hasInterruptsOnly(cause)
                    ? Effect.void
                    : Effect.logWarning("Hob could not name a conversation", cause),
                ),
              );
              yield* FiberSet.run(jobs, job);
            }),
          idle: FiberSet.awaitEmpty(jobs),
        };
      }),
    );
}
