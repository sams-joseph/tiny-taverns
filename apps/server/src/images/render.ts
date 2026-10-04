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
 * strip it. The variants are what browsers load: each cropped to its exact
 * size with a cover fit anchored where the kind keeps its subject, or, for a
 * kind whose picture is measured against (`fit: "inside"`), scaled whole.
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
                fit: IMAGE_KINDS[kind].fit,
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

/** Part of the upright picture, as fractions of its width and height. */
export interface CropFraction {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * What an uploaded file becomes for one kind: the part the person cropped,
 * upright, re-encoded as WebP, plus the kind's variants cut from it.
 *
 * Unlike a drawn image, **the file's own bytes are not kept**. Its metadata
 * (a phone's GPS, the camera, the editing history) is not the product's to
 * keep, and `sharp` drops all of it on re-encode. The original stored beside
 * the variants is the crop at its full resolution, so sizes can still be
 * derived again.
 *
 * The crop is applied after `rotate()`, which honours the EXIF orientation,
 * so it describes the picture the person saw. Without one, the kind's own
 * fit applies to the whole picture, exactly as it does to a drawn one.
 */
export const renderUpload = (
  kind: ImageKind,
  bytes: Uint8Array,
  crop: CropFraction | undefined,
): Effect.Effect<RenderedImage, ImageUnreadable> =>
  Effect.tryPromise({
    try: async () => {
      const metadata = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
      if (ORIGINAL_TYPES[metadata.format ?? ""] === undefined) {
        throw new Error(`unsupported image format ${String(metadata.format)}`);
      }
      const upright = metadata.autoOrient;
      const region =
        crop === undefined
          ? undefined
          : (() => {
              const left = Math.min(upright.width - 1, Math.round(crop.x * upright.width));
              const top = Math.min(upright.height - 1, Math.round(crop.y * upright.height));
              return {
                left,
                top,
                width: Math.max(
                  1,
                  Math.min(upright.width - left, Math.round(crop.width * upright.width)),
                ),
                height: Math.max(
                  1,
                  Math.min(upright.height - top, Math.round(crop.height * upright.height)),
                ),
              };
            })();
      const oriented = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
      const original = new Uint8Array(
        await (region === undefined ? oriented : oriented.extract(region))
          .webp({ quality: 90 })
          .toBuffer(),
      );
      const variants = await Promise.all(
        variantsOf(kind).map(async (variant) => ({
          variant,
          bytes: new Uint8Array(
            await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
              .resize(variantSize(kind, variant).width, variantSize(kind, variant).height, {
                fit: IMAGE_KINDS[kind].fit,
                position: IMAGE_KINDS[kind].position,
              })
              .webp({ quality: 82 })
              .toBuffer(),
          ),
        })),
      );
      return {
        original: { bytes: original, contentType: "image/webp", ext: "webp" },
        width: region?.width ?? upright.width,
        height: region?.height ?? upright.height,
        sha256: new Uint8Array(createHash("sha256").update(original).digest()),
        variants,
      };
    },
    catch: (cause) => new ImageUnreadable({ detail: String(cause) }),
  });
