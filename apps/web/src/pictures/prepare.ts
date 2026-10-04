import { IMAGE_UPLOAD_TYPES, type ImageUploadType, MAX_IMAGE_UPLOAD_BYTES } from "@taverns/api";
import type { PictureSize } from "./crop";

/**
 * What the browser does with a chosen file before it is sent.
 *
 * The server decodes at most 4096 × 4096 pixels and takes at most
 * `MAX_IMAGE_UPLOAD_BYTES`, and a phone's photo exceeds both. So a file that
 * is too large, too many pixels, or not a type the server reads is drawn
 * upright onto a canvas no longer than `MAX_EDGE` on its long side and sent
 * as a JPEG. A file inside every limit is sent as it is; the server strips its
 * metadata when it re-encodes the picture.
 */

/** The longest side the server will decode. */
export const MAX_EDGE = 4096;

export type UploadPlan =
  | { readonly _tag: "asIs"; readonly type: ImageUploadType }
  | { readonly _tag: "redraw"; readonly size: PictureSize };

const isUploadType = (type: string): type is ImageUploadType =>
  (IMAGE_UPLOAD_TYPES as ReadonlyArray<string>).includes(type);

/** Whether a file can go as it is, or the size to redraw it at. */
export const planUpload = (file: {
  readonly type: string;
  readonly size: number;
  readonly width: number;
  readonly height: number;
}): UploadPlan => {
  const longest = Math.max(file.width, file.height);
  if (isUploadType(file.type) && file.size <= MAX_IMAGE_UPLOAD_BYTES && longest <= MAX_EDGE) {
    return { _tag: "asIs", type: file.type };
  }
  const scale = Math.min(1, MAX_EDGE / longest);
  return {
    _tag: "redraw",
    size: {
      width: Math.max(1, Math.round(file.width * scale)),
      height: Math.max(1, Math.round(file.height * scale)),
    },
  };
};

/** A file ready to send, with its upright size and a URL the cropper shows. */
export interface PreparedPicture {
  readonly blob: Blob;
  readonly type: ImageUploadType;
  readonly size: PictureSize;
  readonly previewUrl: string;
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

/**
 * Read a chosen file and make it sendable, or say in a sentence why not.
 * `createImageBitmap` with `imageOrientation: "from-image"` gives the upright
 * size, the same orientation the server's `rotate()` applies and the one an
 * `<img>` shows, so a crop means the same thing in all three.
 */
export const preparePicture = async (file: File): Promise<PreparedPicture | string> => {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return "That file is not a picture this browser can open.";
  }
  try {
    const size = { width: bitmap.width, height: bitmap.height };
    const plan = planUpload({ type: file.type, size: file.size, ...size });
    if (plan._tag === "asIs") {
      return { blob: file, type: plan.type, size, previewUrl: URL.createObjectURL(file) };
    }
    const canvas = document.createElement("canvas");
    canvas.width = plan.size.width;
    canvas.height = plan.size.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, plan.size.width, plan.size.height);
    for (const quality of [0.9, 0.8, 0.65]) {
      const blob = await toBlob(canvas, quality);
      if (blob !== null && blob.size <= MAX_IMAGE_UPLOAD_BYTES) {
        return {
          blob,
          type: "image/jpeg",
          size: plan.size,
          previewUrl: URL.createObjectURL(blob),
        };
      }
    }
    return "That picture is too large to send, even made smaller.";
  } finally {
    bitmap.close();
  }
};
