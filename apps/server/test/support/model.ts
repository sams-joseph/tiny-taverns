import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat";
import { Effect, Layer } from "effect";
import type { LanguageModel } from "effect/unstable/ai";
import {
  HttpClient,
  type HttpClientError,
  type HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";

/**
 * A model that says exactly what a test tells it to.
 *
 * **The whole assistant is tested offline, and the seam that makes that
 * possible is `HttpClient`.** `@effect/ai-openai-compat` talks to a plain
 * OpenAI-compatible `POST /chat/completions`, so a stub client that answers
 * with scripted `text/event-stream` chunks exercises the real provider layer,
 * the real toolkit, the real tool handlers and the real Postgres underneath —
 * everything except the model's own judgement, which is the one part a test
 * could not assert on anyway.
 *
 * It also makes the two properties that matter *checkable* rather than
 * arguable. The request bodies are recorded, so a test can assert that
 * `max_tokens` reached the wire, and — more importantly — that the tool result
 * the model was shown contains this campaign's rows and nothing else. Reading
 * the second request is the only way to see what the assistant actually knows.
 */

/** One chat-completions chunk, or the `[DONE]` sentinel. */
export type Chunk = Record<string, unknown> | "[DONE]";

/**
 * A round the endpoint refuses outright, rather than one the model answers.
 *
 * The failures that are *not* the model's — the port is closed, the key is
 * wrong, the provider is rate-limiting — arrive as an HTTP status and never as
 * a chunk, so they are the one thing a script of chunks cannot express. They
 * are worth expressing because the panel's rule is that no framework message
 * ever reaches it, and a rule about failures needs a failure nobody wrote a
 * sentence for in advance.
 */
export interface Refusal {
  readonly status: number;
  /** The provider's own error body. Anything; it must not reach the panel. */
  readonly body?: string;
}

/** One provider round-trip, as a script. */
export type Round = ReadonlyArray<Chunk> | Refusal;

const isRefusal = (round: Round): round is Refusal => !Array.isArray(round);

/** A round the endpoint answers with an error status. See {@link Refusal}. */
export const refused = (status: number, body?: string): Refusal => ({ status, body });

/** What the provider sent, parsed. Loose on purpose — it is a wire capture. */
export interface ChatRequest {
  readonly model?: string;
  readonly max_tokens?: number;
  readonly messages?: ReadonlyArray<Record<string, unknown>>;
  readonly tools?: ReadonlyArray<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export interface ScriptedModel {
  /** Drop-in for the real provider layer. */
  readonly layer: Layer.Layer<LanguageModel.LanguageModel>;
  /** Every request the provider made, in order. */
  readonly requests: () => ReadonlyArray<ChatRequest>;
}

const CHUNK = {
  id: "chatcmpl_scripted",
  object: "chat.completion.chunk",
  model: "scripted",
  created: 1,
} as const;

/** Text arriving a piece at a time, which is the property the panel needs. */
export const textChunks = (...pieces: ReadonlyArray<string>): ReadonlyArray<Chunk> => [
  ...pieces.map((content) => ({
    ...CHUNK,
    choices: [{ index: 0, delta: { role: "assistant", content } }],
  })),
  { ...CHUNK, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  "[DONE]",
];

/**
 * A round that spends its whole budget thinking, which is what a reasoning
 * model does when `HOB_MAX_TOKENS` is too small for it.
 *
 * `reasoning_content` and a `length` finish are the exact shape a real Qwen3
 * puts on the wire — measured, and the reason `Config.hobMaxTokens` is 4096
 * rather than 1024. The parts are dropped by `toHobEvent`, so without a
 * deliberate report this round reaches the panel as `began` … `done` and
 * nothing else: an answer that never happened, presented as one that did.
 *
 * @param inline For an endpoint that leaves the thinking in `content` rather
 *   than splitting it out — plain `llama-server`, among others. Then the same
 *   run reads on the panel as nothing but text deltas, which is exactly the
 *   report this test file exists to keep answered.
 */
export const reasoningChunks = (
  text: string,
  options?: { readonly inline?: boolean },
): ReadonlyArray<Chunk> => [
  {
    ...CHUNK,
    choices: [
      {
        index: 0,
        delta:
          options?.inline === true
            ? { role: "assistant", content: `<think>${text}` }
            : { role: "assistant", reasoning_content: text },
      },
    ],
  },
  { ...CHUNK, choices: [{ index: 0, delta: {}, finish_reason: "length" }] },
  "[DONE]",
];

/** A round that asks for one tool and says nothing else. */
export const toolCallChunks = (
  name: string,
  params: Record<string, unknown>,
  id = "call_1",
): ReadonlyArray<Chunk> => [
  {
    ...CHUNK,
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id,
              type: "function",
              function: { name, arguments: JSON.stringify(params) },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  },
  "[DONE]",
];

const sseBody = (chunks: ReadonlyArray<Chunk>): string =>
  chunks
    .map((chunk) => `data: ${typeof chunk === "string" ? chunk : JSON.stringify(chunk)}\n\n`)
    .join("");

const bodyOf = (request: HttpClientRequest.HttpClientRequest): ChatRequest => {
  const body = request.body;
  if (body._tag !== "Uint8Array") throw new Error("expected a JSON request body");
  return JSON.parse(new TextDecoder().decode(body.body)) as ChatRequest;
};

/**
 * @param rounds One entry per provider round-trip. A round beyond the script
 *   answers with an empty `stop`, so a model that keeps asking cannot hang a
 *   test — it runs out of things to say instead.
 */
export const scriptedModel = (options: {
  readonly model: string;
  readonly maxTokens: number;
  readonly rounds: ReadonlyArray<Round>;
}): ScriptedModel => {
  const requests: Array<ChatRequest> = [];

  const httpClient = HttpClient.makeWith(
    Effect.fnUntraced(function* (requestEffect) {
      const request = yield* requestEffect;
      const index = requests.length;
      requests.push(bodyOf(request));
      const round = options.rounds[index] ?? textChunks();
      if (isRefusal(round)) {
        return HttpClientResponse.fromWeb(
          request,
          new Response(round.body ?? `{"error":{"message":"scripted refusal"}}`, {
            status: round.status,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return HttpClientResponse.fromWeb(
        request,
        new Response(sseBody(round), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>,
  );

  return {
    requests: () => requests,
    layer: OpenAiLanguageModel.layer({
      model: options.model,
      // The same shape `assistantFromConfig` uses, so the assertion that
      // `max_tokens` reaches the wire is an assertion about the real wiring.
      config: { max_output_tokens: options.maxTokens },
    }).pipe(
      Layer.provide(
        OpenAiClient.layer({ apiUrl: "http://model.invalid/v1" }).pipe(
          Layer.provide(Layer.succeed(HttpClient.HttpClient, httpClient)),
        ),
      ),
    ),
  };
};
