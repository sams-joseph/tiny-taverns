import { CharacterPortraitImages } from "@taverns/api";
import { Context, Layer, Redacted } from "effect";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed image URLs for character portraits.
 *
 * An `<img>` cannot send the bearer header every other request carries, so the
 * image route (`GET /portraits/:portraitId/:variant`) has no `Authorization`
 * and takes an HMAC in the query string instead. **The signature is minted only
 * by `toCharacter`**, for rows a visibility predicate already returned, so a
 * URL is that SQL decision carried forward, never a second way in.
 *
 * ### Bucketed expiry
 *
 * A URL signed at any moment in one 12-hour window carries the same expiry, 36
 * hours after the window opened. So every read in a window mints the *same*
 * URL (the browser cache keeps working), and a URL lives between 24 and 36
 * hours. Retiring a seat does not revoke a URL already issued; it lapses.
 */

export const PORTRAIT_VARIANTS = ["thumb", "card", "full"] as const;
export type PortraitVariant = (typeof PORTRAIT_VARIANTS)[number];

const WINDOW_SECONDS = 12 * 60 * 60;
const LIFETIME_SECONDS = 36 * 60 * 60;

/** The expiry, in Unix seconds, of a URL minted at `nowMillis`. */
export const expiryFor = (nowMillis: number): number => {
  const now = Math.floor(nowMillis / 1000);
  return Math.floor(now / WINDOW_SECONDS) * WINDOW_SECONDS + LIFETIME_SECONDS;
};

const signatureOf = (
  secret: Redacted.Redacted,
  portraitId: string,
  variant: PortraitVariant,
  expiry: number,
): string =>
  createHmac("sha256", Redacted.value(secret))
    .update(`portrait:${portraitId}:${variant}:${String(expiry)}`)
    .digest("base64url");

/** `/portraits/:portraitId/:variant?e=…&s=…`, relative to the API root. */
export const signedPath = (
  secret: Redacted.Redacted,
  portraitId: string,
  variant: PortraitVariant,
  nowMillis: number,
): string => {
  const expiry = expiryFor(nowMillis);
  const signature = signatureOf(secret, portraitId, variant, expiry);
  return `/portraits/${portraitId}/${variant}?e=${String(expiry)}&s=${signature}`;
};

/**
 * Whether a request names a live, correctly signed URL. Every way of being
 * wrong answers `false`, and the route turns each into the same `NotFound`.
 * Returns the checked variant and the seconds the URL has left.
 */
export const verifySigned = (
  secret: Redacted.Redacted,
  request: {
    readonly portraitId: string;
    readonly variant: string;
    readonly e: string | undefined;
    readonly s: string | undefined;
  },
  nowMillis: number,
): { readonly variant: PortraitVariant; readonly remainingSeconds: number } | undefined => {
  const variant = PORTRAIT_VARIANTS.find((candidate) => candidate === request.variant);
  if (variant === undefined || request.e === undefined || request.s === undefined) return;
  if (!/^\d{1,12}$/.test(request.e)) return;
  const expiry = Number(request.e);
  const remainingSeconds = expiry - Math.floor(nowMillis / 1000);
  if (remainingSeconds <= 0) return;
  const expected = Buffer.from(signatureOf(secret, request.portraitId, variant, expiry));
  const given = Buffer.from(request.s);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return;
  return { variant, remainingSeconds };
};

export class PortraitUrls extends Context.Service<
  PortraitUrls,
  {
    /** The three signed paths for a ready portrait, or `null` when this server cannot sign. */
    readonly imagesFor: (portraitId: string) => CharacterPortraitImages | null;
    /** See {@link verifySigned}; always `undefined` when this server cannot sign. */
    readonly verify: (
      request: Parameters<typeof verifySigned>[1],
    ) => ReturnType<typeof verifySigned>;
  }
>()("PortraitUrls") {
  /** No `PORTRAIT_URL_SECRET`: nothing is minted and nothing verifies. */
  static readonly off: Layer.Layer<PortraitUrls> = Layer.succeed(this)({
    imagesFor: () => null,
    verify: () => undefined,
  });

  static readonly layer = (
    secret: Redacted.Redacted,
    now: () => number = Date.now,
  ): Layer.Layer<PortraitUrls> =>
    Layer.succeed(this)({
      imagesFor: (portraitId) => {
        const at = now();
        return new CharacterPortraitImages({
          thumbUrl: signedPath(secret, portraitId, "thumb", at),
          cardUrl: signedPath(secret, portraitId, "card", at),
          fullUrl: signedPath(secret, portraitId, "full", at),
        });
      },
      verify: (request) => verifySigned(secret, request, now()),
    });
}
