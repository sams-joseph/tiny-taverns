import type { LocationKind, LocationPin } from "@taverns/api";
import { Effect } from "effect";
import sharp from "sharp";

/**
 * A place's layout as a picture the image model draws over
 * (`ImageModel.edit`): a plain field with a pale round mark where each place
 * inside it is pinned, sized by what kind of place it is. The prompt says the
 * marks are where the sites stand and that none of them may show
 * (`locationImagePromptFor` with `guided`), so the drawn map puts a harbour
 * where its pin is rather than wherever the model liked.
 *
 * The guide is the drawn size (`kinds.ts`'s `location` kind) so a pin's
 * fraction is the same point on both. It carries no text: a label in the
 * guide would be a label in the map.
 */

/** How large a mark each kind of site gets, as a fraction of the picture's height. */
const MARK: Readonly<Record<LocationKind, number>> = {
  realm: 0.16,
  region: 0.14,
  wilderness: 0.12,
  city: 0.1,
  town: 0.08,
  village: 0.06,
  district: 0.08,
  dungeon: 0.07,
  landmark: 0.05,
  building: 0.045,
};

/** One place inside the one being drawn, where it is pinned. */
export interface GuideSite {
  readonly kind: LocationKind;
  readonly pin: LocationPin;
}

/** The guide's SVG, kept apart from the rendering so a test can read it. */
export const layoutGuideSvg = (
  sites: ReadonlyArray<GuideSite>,
  width: number,
  height: number,
): string => {
  const marks = sites
    .map((site) => {
      const radius = Math.round(MARK[site.kind] * height);
      const cx = Math.round(site.pin.x * width);
      const cy = Math.round(site.pin.y * height);
      return `<circle cx="${String(cx)}" cy="${String(cy)}" r="${String(radius)}" fill="#e8e2d4" stroke="#2b2620" stroke-width="6"/>`;
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">` +
    `<rect width="100%" height="100%" fill="#7d776c"/>${marks}</svg>`
  );
};

/** The guide as a PNG of `size` (`"1536x1024"`). */
export const layoutGuide = (
  sites: ReadonlyArray<GuideSite>,
  size: string,
): Effect.Effect<Uint8Array> =>
  Effect.promise(async () => {
    const [width, height] = size.split("x").map(Number) as [number, number];
    const png = await sharp(Buffer.from(layoutGuideSvg(sites, width, height)))
      .png()
      .toBuffer();
    return new Uint8Array(png);
  });
