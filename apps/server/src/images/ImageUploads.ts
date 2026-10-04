import {
  CurrentActor,
  IMAGE_KINDS_OF_SUBJECT,
  type ImageSubject,
  type ImageUploadApply,
  type ImageUploadCreate,
  type ImageUploadTicket,
  NotFound,
  RateLimited,
  UploadRejected,
  UploadsUnavailable,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Stream } from "effect";
import { ImageRecords, imageObjectKey } from "../repo/Images.js";
import { ObjectStorage, StorageKey } from "../storage/ObjectStorage.js";
import { UploadUrls } from "../storage/UploadUrls.js";
import { HobImages } from "./HobImages.js";
import { renderUpload } from "./render.js";

/**
 * A person's own picture of something they made: the ticket, the apply and
 * the remove behind the `pictures` endpoints.
 *
 * Who may do any of it is `OWNED_SUBJECT`, the statement that decides who may
 * start a draw (`repo/Images.ts`); who may see the result is the subject's own
 * reads, unchanged, because an upload becomes the same `ready` row a draw
 * does. Uploads cost no draw, so they do not touch `image_spend`; they have a
 * daily count of their own, so the store cannot become free hosting.
 */

/** Upload tickets one account may take in a UTC day. */
export const UPLOADS_PER_ACCOUNT_PER_DAY = 40;

/** How long a ticket's URL is good for: long enough for a slow phone upload. */
export const UPLOAD_TICKET_SECONDS = 15 * 60;

const unavailable = new UploadsUnavailable({
  message: "This server has nowhere to keep an uploaded picture.",
});

/** Seconds until the next UTC midnight, when the daily count starts again. */
const secondsToUtcMidnight = (nowMillis: number): number => {
  const midnight = new Date(nowMillis);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((midnight.getTime() - nowMillis) / 1000));
};

export class ImageUploads extends Context.Service<
  ImageUploads,
  {
    readonly create: (
      payload: ImageUploadCreate,
    ) => Effect.Effect<
      ImageUploadTicket,
      NotFound | RateLimited | UploadsUnavailable,
      CurrentActor
    >;
    readonly apply: (
      uploadId: string,
      payload: ImageUploadApply,
    ) => Effect.Effect<void, NotFound | UploadRejected | UploadsUnavailable, CurrentActor>;
    readonly remove: (
      subject: ImageSubject,
      subjectId: string,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("ImageUploads") {
  static readonly layer: Layer.Layer<
    ImageUploads,
    never,
    ImageRecords | ObjectStorage | UploadUrls | HobImages
  > = Layer.effect(this)(
    Effect.gen(function* () {
      const records = yield* ImageRecords;
      const storage = yield* ObjectStorage;
      const uploads = yield* UploadUrls;
      const images = yield* HobImages;

      return {
        create: (payload) =>
          Effect.gen(function* () {
            const begun = yield* records.beginUpload(payload.subject, payload.subjectId, {
              contentType: payload.contentType,
              contentLength: payload.contentLength,
              expiresInSeconds: UPLOAD_TICKET_SECONDS,
              perAccountPerDay: UPLOADS_PER_ACCOUNT_PER_DAY,
            });
            if (begun._tag === "notFound") {
              return yield* new NotFound({ resource: payload.subject, id: payload.subjectId });
            }
            if (begun._tag === "capped") {
              return yield* new RateLimited({
                message: "That is as many pictures as one account can upload today.",
                retryAfterSeconds: secondsToUtcMidnight(Date.now()),
              });
            }
            const signed = yield* uploads
              .sign(imageObjectKey(begun.prefix, "source"), {
                contentType: payload.contentType,
                contentLength: payload.contentLength,
                expiresInSeconds: UPLOAD_TICKET_SECONDS,
              })
              .pipe(
                Effect.catchTags({
                  StorageUnavailable: () => Effect.fail(unavailable),
                  StorageError: (error) => Effect.die(error),
                }),
              );
            if (signed === null) return yield* unavailable;
            return {
              uploadId: begun.id,
              url: signed.url,
              method: signed.method,
              headers: signed.headers,
              expiresAt: DateTime.fromDateUnsafe(begun.expiresAt),
            };
          }),

        apply: (uploadId, payload) =>
          Effect.gen(function* () {
            const missing = new NotFound({ resource: "upload", id: uploadId });
            const upload = yield* records.pendingUpload(uploadId);
            if (upload === undefined) return yield* missing;

            const shown = IMAGE_KINDS_OF_SUBJECT[upload.subject];
            const kinds = payload.images.map((image) => image.kind);
            if (kinds.some((kind) => !shown.includes(kind))) {
              return yield* new UploadRejected({
                message: `A ${upload.subject}'s pictures are ${shown.join(" and ")}.`,
              });
            }
            if (new Set(kinds).size !== kinds.length) {
              return yield* new UploadRejected({ message: "Each picture is named once." });
            }
            if (payload.images.some((image) => image.kind === "battleMap" && image.crop)) {
              return yield* new UploadRejected({
                message:
                  "A battle map is never cropped: its grid is measured on the whole picture.",
              });
            }

            const source = imageObjectKey(upload.prefix, "source");
            const object = yield* storage.get(source).pipe(
              Effect.catchTags({
                StorageNotFound: () =>
                  Effect.fail(new UploadRejected({ message: "The file has not arrived yet." })),
                StorageUnavailable: () => Effect.fail(unavailable),
                StorageError: (error) => Effect.die(error),
              }),
            );
            if (object.size !== upload.contentLength || object.contentType !== upload.contentType) {
              return yield* new UploadRejected({ message: "The file is not the one announced." });
            }
            const chunks = yield* Stream.runCollect(object.body).pipe(Effect.orDie);
            const bytes = new Uint8Array(Buffer.concat(chunks));

            const rendered = yield* Effect.forEach(payload.images, (image) =>
              renderUpload(image.kind, bytes, image.crop).pipe(
                Effect.map((picture) => ({ kind: image.kind, id: crypto.randomUUID(), picture })),
              ),
            ).pipe(
              Effect.catchTag("ImageUnreadable", () =>
                Effect.fail(
                  new UploadRejected({
                    message: "That file is not a picture this server can read.",
                  }),
                ),
              ),
            );

            const written: Array<StorageKey> = [];
            const applied = yield* records
              .applyUpload(
                upload.id,
                rendered.map(({ kind, id, picture }) => ({
                  kind,
                  id,
                  stored: {
                    originalType: picture.original.contentType,
                    sha256: picture.sha256,
                    width: picture.width,
                    height: picture.height,
                    originalBytes: picture.original.bytes.byteLength,
                    storedBytes:
                      picture.original.bytes.byteLength +
                      picture.variants.reduce((total, file) => total + file.bytes.byteLength, 0),
                  },
                })),
                (prefixes) =>
                  Effect.forEach(
                    prefixes,
                    ({ kind, prefix }) =>
                      Effect.gen(function* () {
                        written.push(prefix);
                        const picture = rendered.find((entry) => entry.kind === kind)!.picture;
                        yield* storage.put(
                          imageObjectKey(prefix, `original.${picture.original.ext}`),
                          picture.original.bytes,
                          picture.original.contentType,
                        );
                        for (const file of picture.variants) {
                          yield* storage.put(
                            imageObjectKey(prefix, `${file.variant}.webp`),
                            file.bytes,
                            "image/webp",
                          );
                        }
                      }),
                    { discard: true },
                  ),
              )
              .pipe(
                // A write that rolled back may have put some files first.
                Effect.onError(() => records.enqueueDeletions(written)),
                Effect.catchTags({
                  StorageUnavailable: () => Effect.fail(unavailable),
                  StorageError: (error) => Effect.die(error),
                }),
              );
            yield* images.drainSoon;
            if (!applied) return yield* missing;
          }),

        remove: (subject, subjectId) =>
          Effect.gen(function* () {
            if (!(yield* records.remove(subject, subjectId))) {
              return yield* new NotFound({ resource: subject, id: subjectId });
            }
            yield* images.drainSoon;
          }),
      };
    }),
  );
}
