import { type ImageSubject, type ImageUploadApply, UploadRejected } from "@taverns/api";
import { Effect } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { apiUrl, type TavernsClient } from "../api/client";
import type { PreparedPicture } from "./prepare";

/**
 * One upload, as one write: a ticket, the file sent where the ticket says, and
 * the apply that makes it the subject's pictures. `useMutation` runs it as a
 * single `submit`, so the dialog has one busy flag and one failure.
 *
 * The file goes to `ticket.url` on the bare `HttpClient`, with exactly the
 * ticket's headers and **no bearer token**: the URL may be a storage
 * provider's, which must never see our credential and would refuse a request
 * with headers it did not sign. A path is this API's own `PUT /uploads`, made
 * absolute the way every signed path is.
 */
export const uploadPicture =
  (input: {
    readonly subject: ImageSubject;
    readonly subjectId: string;
    readonly picture: PreparedPicture;
    readonly images: ImageUploadApply["images"];
  }) =>
  (client: TavernsClient) =>
    Effect.gen(function* () {
      const bytes = new Uint8Array(
        yield* Effect.tryPromise({
          try: () => input.picture.blob.arrayBuffer(),
          // Not the server's failure: say so, rather than "did not answer".
          catch: () => new UploadRejected({ message: "This browser could not read that file." }),
        }),
      );
      const ticket = yield* client.pictures.createUpload({
        payload: {
          subject: input.subject,
          subjectId: input.subjectId,
          contentType: input.picture.type,
          contentLength: bytes.byteLength,
        },
      });
      const http = yield* HttpClient.HttpClient;
      const sent = yield* http.execute(
        HttpClientRequest.put(ticket.url.startsWith("/") ? apiUrl(ticket.url) : ticket.url).pipe(
          HttpClientRequest.setHeaders(ticket.headers),
          HttpClientRequest.bodyUint8Array(bytes, input.picture.type),
        ),
      );
      if (sent.status < 200 || sent.status >= 300) {
        return yield* new UploadRejected({
          message: "The file did not reach the server. Try again.",
        });
      }
      yield* client.pictures.applyUpload({
        params: { uploadId: ticket.uploadId },
        payload: { images: input.images },
      });
    });

/** Take every picture off a subject. */
export const removePictures =
  (input: { readonly subject: ImageSubject; readonly subjectId: string }) =>
  (client: TavernsClient) =>
    client.pictures.remove({ params: { subject: input.subject, subjectId: input.subjectId } });
