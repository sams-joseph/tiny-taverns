import { Schema } from "effect";

/**
 * A picture a person uploads in place of the one Hob draws.
 *
 * An upload becomes the same record a draw does: a `ready` row in the image
 * kind's own table, read as a field of its subject and signed by the
 * subject's own reads. Only how the bytes arrive is new. The browser asks for
 * a ticket, sends the file to the ticket's URL (a storage provider's
 * presigned `PUT`, or this server's own), then asks the server to apply it:
 * to crop it once per kind the subject shows, and replace that kind's picture.
 *
 * **One file, a crop per kind.** A character and a campaign NPC show a square
 * portrait and a wide banner; one upload can fill both, each with its own
 * crop. A crop is a fraction of the uploaded picture as the person saw it
 * (rotated upright), so it means the same whatever size the server decodes.
 */

/** What may be uploaded. HEIC is not: iOS converts it to JPEG for this list. */
export const IMAGE_UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const ImageUploadType = Schema.Literals(IMAGE_UPLOAD_TYPES);
export type ImageUploadType = typeof ImageUploadType.Type;

/** The largest file accepted. The web client scales a picture down before it gets here. */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The things a person may upload a picture of. */
export const ImageSubject = Schema.Literals([
  "character",
  "npc",
  "campaign",
  "sharedWorld",
  "battleMap",
]);
export type ImageSubject = typeof ImageSubject.Type;

/** Every kind of picture, as the server's image kinds name them. */
export const ImageKindName = Schema.Literals([
  "character",
  "characterBanner",
  "npc",
  "npcBanner",
  "campaign",
  "sharedWorld",
  "battleMap",
]);
export type ImageKindName = typeof ImageKindName.Type;

/** The pictures each subject shows, the square first. */
export const IMAGE_KINDS_OF_SUBJECT: {
  readonly [S in ImageSubject]: ReadonlyArray<ImageKindName>;
} = {
  character: ["character", "characterBanner"],
  npc: ["npc", "npcBanner"],
  campaign: ["campaign"],
  sharedWorld: ["sharedWorld"],
  battleMap: ["battleMap"],
};

/**
 * Each kind's width over height, which a crop is drawn at: a square plate,
 * a 2:1 banner band, a 3:2 cover. `null` for a battle map, which is never
 * cropped, because its grid is measured against the whole picture. The
 * server's variant sizes agree with these (`images/kinds.ts`, pinned by its
 * test).
 */
export const IMAGE_ASPECT: { readonly [K in ImageKindName]: number | null } = {
  character: 1,
  characterBanner: 2,
  npc: 1,
  npcBanner: 2,
  campaign: 3 / 2,
  sharedWorld: 3 / 2,
  battleMap: null,
};

const fraction = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));

/** Rounding a crop to pixels in the browser can carry it a hair past an edge. */
const EDGE_SLACK = 1e-6;

/** Part of the upright picture, each side a fraction of its width or height. */
export const ImageCrop = Schema.Struct({
  x: fraction,
  y: fraction,
  width: fraction,
  height: fraction,
}).check(
  Schema.makeFilter((crop) => {
    const issues: Array<Schema.FilterIssue> = [];
    if (crop.width <= 0 || crop.x + crop.width > 1 + EDGE_SLACK) {
      issues.push({ path: ["width"], issue: "a crop has width and stays inside the picture" });
    }
    if (crop.height <= 0 || crop.y + crop.height > 1 + EDGE_SLACK) {
      issues.push({ path: ["height"], issue: "a crop has height and stays inside the picture" });
    }
    return issues;
  }),
);
export type ImageCrop = typeof ImageCrop.Type;

/** Ask to upload one file of a subject's picture. */
export const ImageUploadCreate = Schema.Struct({
  subject: ImageSubject,
  subjectId: Schema.String.check(Schema.isUUID()),
  contentType: ImageUploadType,
  contentLength: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: MAX_IMAGE_UPLOAD_BYTES }),
  ),
});
export type ImageUploadCreate = typeof ImageUploadCreate.Type;

/**
 * Where to send the file: `PUT` the bytes to `url` with exactly `headers`.
 * `url` is either absolute (a storage provider's) or a path on this API; it
 * is good until `expiresAt`, and the ticket is applied by `uploadId`.
 */
export const ImageUploadTicket = Schema.Struct({
  uploadId: Schema.String,
  url: Schema.String,
  method: Schema.Literal("PUT"),
  headers: Schema.Record(Schema.String, Schema.String),
  expiresAt: Schema.DateTimeUtcFromString,
});
export type ImageUploadTicket = typeof ImageUploadTicket.Type;

/**
 * Make the uploaded file the subject's picture, once per kind named. A kind
 * with no `crop` is cut the way a drawn picture is (centred, or for a bust
 * from the top); a battle map is never cut. Kinds the subject does not show,
 * or a kind named twice, are refused.
 */
export const ImageUploadApply = Schema.Struct({
  images: Schema.NonEmptyArray(
    Schema.Struct({ kind: ImageKindName, crop: Schema.optional(ImageCrop) }),
  ),
});
export type ImageUploadApply = typeof ImageUploadApply.Type;

/** This server has nowhere to keep a file: no storage driver, or nothing to sign with. */
export class UploadsUnavailable extends Schema.Error<UploadsUnavailable>("UploadsUnavailable")(
  {
    _tag: Schema.tag("UploadsUnavailable"),
    message: Schema.String,
  },
  { httpApiStatus: 503 },
) {}

/**
 * The upload was received but cannot become a picture: not an image the
 * server reads, not the file the ticket was for, or a kind its subject does
 * not show.
 */
export class UploadRejected extends Schema.Error<UploadRejected>("UploadRejected")(
  {
    _tag: Schema.tag("UploadRejected"),
    message: Schema.String,
  },
  { httpApiStatus: 422 },
) {}
