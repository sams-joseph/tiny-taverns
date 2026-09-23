import { Context, Data, Duration, Effect, Layer, Option, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

/**
 * The image model every Hob-drawn image is drawn by: one OpenAI-shaped call,
 * `POST {apiUrl}/images/generations`, answered with `data[0].b64_json`.
 *
 * OpenAI's Images API and stable-diffusion.cpp's `sd-server` both speak this
 * shape, so which one draws is `PORTRAIT_API_URL` and nothing else, the way
 * `HOB_API_URL` picks Hob's model. `@effect/ai-openai-compat` has no image
 * surface, so this is a plain `HttpClient` call — which is also the seam the
 * tests stub (`test/support/imageModel.ts`).
 *
 * ### The body is endpoint-aware
 *
 * As `assistant/modelConfig.ts` is for chat: requests to `api.openai.com` carry
 * OpenAI's `quality` and `moderation: "auto"`; every other endpoint gets only
 * the fields `sd-server` documents (`model`, `prompt`, `n`, `size`,
 * `output_format`). See {@link imageRequestBody}.
 *
 * ### Errors carry no provider text
 *
 * A moderation block (`error.code = "moderation_blocked"`) is
 * {@link ImageRefused}; anything else the provider says is
 * {@link ImageProviderFailed}. Both keep the provider's words in `detail`, for
 * the log line, and the image record keeps only the kind.
 */

export type ImageQuality = "low" | "medium" | "high" | "auto";

export interface ImageModelOptions {
  readonly apiUrl: string;
  readonly model: string;
  readonly apiKey: Redacted.Redacted | undefined;
  readonly quality: ImageQuality;
}

const isOpenAi = (apiUrl: string): boolean => new URL(apiUrl).hostname === "api.openai.com";

/**
 * The request body for one image, in the dialect `apiUrl` speaks. `size` is the
 * kind's (`kinds.ts`): a square for a portrait, 3:2 for a cover — both sizes
 * OpenAI's image models accept, and any size `sd-server` does.
 */
export const imageRequestBody = (
  options: Pick<ImageModelOptions, "apiUrl" | "model" | "quality">,
  prompt: string,
  size: string,
): Record<string, unknown> => ({
  model: options.model,
  prompt,
  n: 1,
  size,
  // PNG, so the original is kept lossless; the WebP variants are ours.
  output_format: "png",
  ...(isOpenAi(options.apiUrl) ? { quality: options.quality, moderation: "auto" } : {}),
});

/** The provider's moderation refused the prompt or the image. */
export class ImageRefused extends Data.TaggedError("ImageRefused")<{
  readonly detail: string;
}> {}

/** The provider failed, or answered something that is not an image. */
export class ImageProviderFailed extends Data.TaggedError("ImageProviderFailed")<{
  readonly detail: string;
}> {}

export interface GeneratedImage {
  readonly bytes: Uint8Array;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

const Generated = Schema.Struct({
  data: Schema.NonEmptyArray(Schema.Struct({ b64_json: Schema.String })),
  usage: Schema.optional(
    Schema.Struct({
      input_tokens: Schema.optional(Schema.Number),
      output_tokens: Schema.optional(Schema.Number),
    }),
  ),
});

const ProviderError = Schema.Struct({
  error: Schema.Struct({ code: Schema.optional(Schema.NullOr(Schema.String)) }),
});

const tokens = (value: number | undefined): number | null =>
  value === undefined || !Number.isInteger(value) || value < 0 ? null : value;

/** Longer than the job timeout would allow anyway; a hung socket is a provider failure. */
const REQUEST_TIMEOUT = Duration.seconds(140);

export class ImageModel extends Context.Service<
  ImageModel,
  {
    /** The model name, as recorded on the image row. */
    readonly model: string;
    readonly generate: (
      prompt: string,
      size: string,
    ) => Effect.Effect<GeneratedImage, ImageRefused | ImageProviderFailed>;
  }
>()("ImageModel") {
  static readonly layer = (
    options: ImageModelOptions,
  ): Layer.Layer<ImageModel, never, HttpClient.HttpClient> =>
    Layer.effect(this)(
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const url = `${options.apiUrl.replace(/\/+$/, "")}/images/generations`;
        const failed = (detail: string) => new ImageProviderFailed({ detail });

        return {
          model: options.model,
          generate: (prompt, size) =>
            Effect.gen(function* () {
              const request = HttpClientRequest.post(url).pipe(
                HttpClientRequest.bodyJsonUnsafe(imageRequestBody(options, prompt, size)),
                options.apiKey === undefined
                  ? (request) => request
                  : HttpClientRequest.bearerToken(Redacted.value(options.apiKey)),
              );
              const response = yield* client.execute(request).pipe(
                Effect.timeout(REQUEST_TIMEOUT),
                Effect.mapError((error) => failed(`request failed: ${String(error)}`)),
              );
              const text = yield* response.text.pipe(
                Effect.mapError((error) => failed(`unreadable body: ${String(error)}`)),
              );

              if (response.status < 200 || response.status >= 300) {
                const code = Option.getOrUndefined(
                  Schema.decodeUnknownOption(Schema.fromJsonString(ProviderError))(text),
                )?.error.code;
                const detail = `HTTP ${String(response.status)}: ${text.slice(0, 500)}`;
                return yield* code === "moderation_blocked"
                  ? new ImageRefused({ detail })
                  : failed(detail);
              }

              const body = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Generated))(
                text,
              ).pipe(Effect.mapError(() => failed("the response carried no b64_json image")));
              const bytes = Buffer.from(body.data[0].b64_json, "base64");
              if (bytes.byteLength === 0) return yield* failed("the image was empty");
              return {
                bytes: new Uint8Array(bytes),
                inputTokens: tokens(body.usage?.input_tokens),
                outputTokens: tokens(body.usage?.output_tokens),
              };
            }),
        };
      }),
    );
}
