import { Data, Effect } from "effect";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { PortraitVariant } from "./PortraitUrls.js";

/**
 * What a generated image becomes before it is stored: the provider's bytes,
 * untouched, plus three square WebP sizes made with `sharp`.
 *
 * The original is kept byte for byte so provider provenance (OpenAI's C2PA
 * credentials) survives and sizes can be re-derived later; a resize would
 * strip it. The variants are what browsers load: `full` 1024, `card` 640 (the
 * 4:3 card at 2x), `thumb` 160 (the 40 and 64 px plates at 2x).
 */

export const VARIANT_SIZES: Readonly<Record<PortraitVariant, number>> = {
  full: 1024,
  card: 640,
  thumb: 160,
};

/** Refuse a decompression bomb: a 1024 square is about a million pixels. */
const MAX_INPUT_PIXELS = 4096 * 4096;

const ORIGINAL_TYPES: Readonly<Record<string, { readonly type: string; readonly ext: string }>> = {
  png: { type: "image/png", ext: "png" },
  jpeg: { type: "image/jpeg", ext: "jpeg" },
  webp: { type: "image/webp", ext: "webp" },
};

/** The bytes were not an image `sharp` would decode. */
export class ImageUnreadable extends Data.TaggedError("ImageUnreadable")<{
  readonly detail: string;
}> {}

export interface RenderedPortrait {
  readonly original: {
    readonly bytes: Uint8Array;
    readonly contentType: string;
    readonly ext: string;
  };
  readonly width: number;
  readonly height: number;
  readonly sha256: Uint8Array;
  readonly variants: ReadonlyArray<{
    readonly variant: PortraitVariant;
    readonly bytes: Uint8Array;
  }>;
}

export const renderPortrait = (
  bytes: Uint8Array,
): Effect.Effect<RenderedPortrait, ImageUnreadable> =>
  Effect.tryPromise({
    try: async () => {
      const input = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });
      const metadata = await input.metadata();
      const original = ORIGINAL_TYPES[metadata.format ?? ""];
      if (original === undefined || metadata.width === undefined || metadata.height === undefined) {
        throw new Error(`unsupported image format ${String(metadata.format)}`);
      }
      const variants = await Promise.all(
        (Object.keys(VARIANT_SIZES) as ReadonlyArray<PortraitVariant>).map(async (variant) => ({
          variant,
          bytes: new Uint8Array(
            await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
              .resize(VARIANT_SIZES[variant], VARIANT_SIZES[variant], {
                fit: "cover",
                position: "top",
              })
              .webp({ quality: 82 })
              .toBuffer(),
          ),
        })),
      );
      return {
        original: { bytes, contentType: original.type, ext: original.ext },
        width: metadata.width,
        height: metadata.height,
        sha256: new Uint8Array(createHash("sha256").update(bytes).digest()),
        variants,
      };
    },
    catch: (cause) => new ImageUnreadable({ detail: String(cause) }),
  });
