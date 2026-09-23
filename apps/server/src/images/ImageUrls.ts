import { Context, Effect, Layer, Option, Redacted } from "effect";
import { createHmac, timingSafeEqual } from "node:crypto";
import { IMAGE_KINDS, type ImageKind, type VariantOf, variantsOf } from "./kinds.js";

/**
 * Signed image URLs for every Hob-drawn image.
 *
 * An `<img>` cannot send the bearer header every other request carries, so the
 * image routes (`/portraits/:imageId/:variant`, `/campaign-images/:imageId/:variant`)
 * have no `Authorization` and take an HMAC in the query string instead. **A
 * signature is minted only by a subject's own reads** — `portraitImages`
 * (`repo/Characters.ts`) and `campaignImages` (`repo/Campaigns.ts`) — for ids
 * a visibility predicate already returned, so a URL is that SQL decision
 * carried forward, never a second way in.
 *
 * ### What is signed
 *
 * `{tag}:{imageId}:{variant}:{expiry}`, where the tag is the kind's
 * (`kinds.ts`). A portrait's tag is `portrait`, the whole string it was before
 * there was a second kind, so every portrait URL already issued still checks
 * out; and because the tag differs per kind, a signature minted for one kind's
 * route opens nothing on another's.
 *
 * ### Bucketed expiry
 *
 * A URL signed at any moment in one 12-hour window carries the same expiry, 36
 * hours after the window opened. So every read in a window mints the *same*
 * URL (the browser cache keeps working), and a URL lives between 24 and 36
 * hours. Losing sight of the subject (a retired seat, a campaign unshared) does
 * not revoke a URL already issued; it lapses.
 */

const WINDOW_SECONDS = 12 * 60 * 60;
const LIFETIME_SECONDS = 36 * 60 * 60;

/** The expiry, in Unix seconds, of a URL minted at `nowMillis`. */
export const expiryFor = (nowMillis: number): number => {
  const now = Math.floor(nowMillis / 1000);
  return Math.floor(now / WINDOW_SECONDS) * WINDOW_SECONDS + LIFETIME_SECONDS;
};

/** One signed path per variant of a kind, e.g. a portrait's `{ thumb, card, full }`. */
export type SignedPaths<K extends ImageKind> = { readonly [V in VariantOf<K>]: string };

/** What the image route was asked for; every field is the plain string the wire carried. */
export interface ImageRequest {
  readonly imageId: string;
  readonly variant: string;
  readonly e: string | undefined;
  readonly s: string | undefined;
}

const signatureOf = (
  secret: Redacted.Redacted,
  kind: ImageKind,
  imageId: string,
  variant: string,
  expiry: number,
): string =>
  createHmac("sha256", Redacted.value(secret))
    .update(`${IMAGE_KINDS[kind].tag}:${imageId}:${variant}:${String(expiry)}`)
    .digest("base64url");

/** `{route}/:imageId/:variant?e=…&s=…`, relative to the API root. */
export const signedPath = (
  secret: Redacted.Redacted,
  kind: ImageKind,
  imageId: string,
  variant: string,
  nowMillis: number,
): string => {
  const expiry = expiryFor(nowMillis);
  const signature = signatureOf(secret, kind, imageId, variant, expiry);
  return `${IMAGE_KINDS[kind].route}/${imageId}/${variant}?e=${String(expiry)}&s=${signature}`;
};

/**
 * Whether a request names a live, correctly signed URL of this kind. Every way
 * of being wrong answers `undefined`, and the route turns each into the same
 * `NotFound`. Returns the checked variant and the seconds the URL has left.
 */
export const verifySigned = (
  secret: Redacted.Redacted,
  kind: ImageKind,
  request: ImageRequest,
  nowMillis: number,
): { readonly variant: string; readonly remainingSeconds: number } | undefined => {
  const variant = variantsOf(kind).find((candidate) => candidate === request.variant);
  if (variant === undefined || request.e === undefined || request.s === undefined) return;
  if (!/^\d{1,12}$/.test(request.e)) return;
  const expiry = Number(request.e);
  const remainingSeconds = expiry - Math.floor(nowMillis / 1000);
  if (remainingSeconds <= 0) return;
  const expected = Buffer.from(signatureOf(secret, kind, request.imageId, variant, expiry));
  const given = Buffer.from(request.s);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return;
  return { variant, remainingSeconds };
};

export class ImageUrls extends Context.Service<
  ImageUrls,
  {
    /** The signed paths for a ready image, or `null` when this server cannot sign. */
    readonly pathsFor: <K extends ImageKind>(kind: K, imageId: string) => SignedPaths<K> | null;
    /** See {@link verifySigned}; always `undefined` when this server cannot sign. */
    readonly verify: (kind: ImageKind, request: ImageRequest) => ReturnType<typeof verifySigned>;
  }
>()("ImageUrls") {
  /** No `PORTRAIT_URL_SECRET`: nothing is minted and nothing verifies. */
  static readonly off: Layer.Layer<ImageUrls> = Layer.succeed(this)({
    pathsFor: () => null,
    verify: () => undefined,
  });

  static readonly layer = (
    secret: Redacted.Redacted,
    now: () => number = Date.now,
  ): Layer.Layer<ImageUrls> =>
    Layer.succeed(this)({
      pathsFor: <K extends ImageKind>(kind: K, imageId: string) => {
        const at = now();
        return Object.fromEntries(
          variantsOf(kind).map((variant) => [
            variant,
            signedPath(secret, kind, imageId, variant, at),
          ]),
        ) as SignedPaths<K>;
      },
      verify: (kind, request) => verifySigned(secret, kind, request, now()),
    });
}

/**
 * Signs a ready image's paths; `ImageUrls.pathsFor`. Absent when a repository
 * was built without the service (most repository tests), which mints nothing —
 * the same answer a server with no URL secret gives.
 */
export type ImageSigner = ImageUrls["Service"]["pathsFor"];

/**
 * The signer a repository layer was built with, or `undefined`; read once at
 * build time by every repository that maps a subject with a picture.
 */
export const imageSigner: Effect.Effect<ImageSigner | undefined> = Effect.map(
  Effect.serviceOption(ImageUrls),
  (urls) => Option.getOrUndefined(Option.map(urls, (service) => service.pathsFor)),
);
