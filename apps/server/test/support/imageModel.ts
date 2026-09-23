import { Deferred, Effect, Layer } from "effect";
import {
  HttpClient,
  type HttpClientError,
  type HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import { ImageModel } from "../../src/images/ImageModel.js";

/**
 * An image endpoint that answers exactly what a test tells it to — the
 * portraits' `scriptedModel` (`support/model.ts`), stubbed at `HttpClient` for
 * the same reason: the real `ImageModel`, the real `sharp` pipeline, the real
 * storage writes and the real rows all run, and the request bodies are recorded
 * so a test can assert the dialect that reached the wire. Nothing here ever
 * talks to a real provider.
 */

/** A 1×1 PNG, as an OpenAI `b64_json`. */
export const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export type ImageReply =
  /** A drawn image with OpenAI-shaped usage. */
  | { readonly kind: "image" }
  /** OpenAI's moderation refusal, with provider text that must reach no one. */
  | { readonly kind: "refused" }
  /** Any other provider error. */
  | { readonly kind: "error"; readonly status: number }
  /** Never answers, for the job timeout. */
  | { readonly kind: "hang" }
  /** Answers with an image once `release` is completed. */
  | { readonly kind: "held"; readonly release: Deferred.Deferred<void> };

export const MODERATION_TEXT =
  "Your request was rejected by the safety system. secret-provider-words";

export interface ScriptedImages {
  readonly layer: Layer.Layer<ImageModel>;
  /** Every request body, in order. */
  readonly requests: () => ReadonlyArray<Record<string, unknown>>;
  /** Queue the next replies; an empty queue answers `image`. */
  readonly next: (...replies: ReadonlyArray<ImageReply>) => void;
}

const json = (request: HttpClientRequest.HttpClientRequest, status: number, body: unknown) =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

export const scriptedImages = (options: {
  readonly apiUrl: string;
  readonly model: string;
}): ScriptedImages => {
  const requests: Array<Record<string, unknown>> = [];
  const queue: Array<ImageReply> = [];

  const image = (request: HttpClientRequest.HttpClientRequest) =>
    json(request, 200, {
      created: 1,
      data: [{ b64_json: TINY_PNG_B64 }],
      usage: { input_tokens: 57, output_tokens: 272, total_tokens: 329 },
    });

  const client = HttpClient.makeWith(
    Effect.fnUntraced(function* (requestEffect) {
      const request = yield* requestEffect;
      const body = request.body;
      if (body._tag !== "Uint8Array") throw new Error("expected a JSON request body");
      requests.push(JSON.parse(new TextDecoder().decode(body.body)) as Record<string, unknown>);
      const reply = queue.shift() ?? { kind: "image" };
      switch (reply.kind) {
        case "image":
          return image(request);
        case "refused":
          return json(request, 400, {
            error: {
              code: "moderation_blocked",
              message: MODERATION_TEXT,
              type: "image_generation_user_error",
            },
          });
        case "error":
          return json(request, reply.status, { error: { message: "provider fell over" } });
        case "hang":
          return yield* Effect.never;
        case "held":
          yield* Deferred.await(reply.release);
          return image(request);
      }
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>,
  );

  return {
    requests: () => requests,
    next: (...replies) => {
      queue.push(...replies);
    },
    layer: ImageModel.layer({
      apiUrl: options.apiUrl,
      model: options.model,
      apiKey: undefined,
      quality: "medium",
    }).pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client))),
  };
};
