import { Data, Effect } from "effect";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { IMAGE_KINDS, type ImageKind, variantSize, variantsOf } from "./kinds.js";

/**
 * What a generated image becomes before it is stored: the provider's bytes,
 * untouched, plus the kind's WebP sizes made with `sharp` (`kinds.ts`).
 *
 * The original is kept byte for byte so provider provenance (OpenAI's C2PA
 * credentials) survives and sizes can be re-derived later; a resize would
 * strip it. The variants are what browsers load, each cropped to its exact
 * size with a cover fit anchored where the kind keeps its subject.
 */

/** Refuse a decompression bomb: a 1536 × 1024 image is about a million and a half pixels. */
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

export interface RenderedImage {
  readonly original: {
    readonly bytes: Uint8Array;
    readonly contentType: string;
    readonly ext: string;
  };
  readonly width: number;
  readonly height: number;
  readonly sha256: Uint8Array;
  readonly variants: ReadonlyArray<{
    readonly variant: string;
    readonly bytes: Uint8Array;
  }>;
}

export const renderImage = (
  kind: ImageKind,
  bytes: Uint8Array,
): Effect.Effect<RenderedImage, ImageUnreadable> =>
  Effect.tryPromise({
    try: async () => {
      const input = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });
      const metadata = await input.metadata();
      const original = ORIGINAL_TYPES[metadata.format ?? ""];
      if (original === undefined || metadata.width === undefined || metadata.height === undefined) {
        throw new Error(`unsupported image format ${String(metadata.format)}`);
      }
      const variants = await Promise.all(
        variantsOf(kind).map(async (variant) => ({
          variant,
          bytes: new Uint8Array(
            await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
              .resize(variantSize(kind, variant).width, variantSize(kind, variant).height, {
                fit: "cover",
                position: IMAGE_KINDS[kind].position,
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
