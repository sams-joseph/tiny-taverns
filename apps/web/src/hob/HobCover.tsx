import { Badge, cn } from "@taverns/ui";
import { useState } from "react";
import { apiUrl } from "../api/client";

/**
 * The two signed sizes of a cover Hob drew — a campaign's (`CampaignImages`) or
 * a Shared World's (`SharedWorldImages`), which are the same shape because both
 * kinds keep the same variants (`apps/server/src/images/kinds.ts`).
 */
export interface HobCoverImages {
  readonly cardUrl: string;
  readonly fullUrl: string;
}

/**
 * A cover: the landscape Hob drew once, after a campaign or a Shared World was
 * made, as a band across the top of whatever shows it.
 *
 * **Absent is the current look.** With no cover — images are off, there was
 * nothing to draw from, the provider refused, or the URL failed to load (an
 * expired signature, a server that has since lost the file) — this renders
 * nothing at all, so a card or a page without one is exactly what it was before
 * there were covers. There is no placeholder art, because there is none to show.
 *
 * **Pending is the one state that takes space without a picture**: the band,
 * in the sunken surface, saying Hob is drawing, while the screen re-reads
 * (`hob/drawingPolling.ts`). When the draw fails the band goes, which is the
 * same collapse a broken URL gets.
 *
 * The picture fades in on load, timed by the motion tokens, over the sunken
 * surface, so a slow load is a quiet band rather than a flash. It is
 * decorative (`alt=""`): the name is always beside it.
 *
 * **Two shapes, both crops of one 3:2 image**, and `object-cover` keeps its
 * middle, which the cover framing (`HouseStyle.ts`) keeps clear:
 *
 * - `card` — the head of a card on the campaign or Shared World list, bled to
 *   the card's edges (the card clips it to its radius); its `src` is the
 *   768 × 512 size.
 * - `band` — the top of a campaign's home page (the creator's Overview and the
 *   player's page alike) or a Shared World's screen; its `src` is the
 *   1536 × 1024 size. Wide and shallow above the content, deeper once the
 *   column is narrow enough that a 4:1 strip would be a sliver. It sits in the
 *   page, never in the sticky chrome rows.
 */
export function HobCover({
  image,
  pending,
  shape,
}: {
  readonly image: HobCoverImages | null;
  readonly pending: boolean;
  readonly shape: "card" | "band";
}) {
  const src = image === null ? undefined : apiUrl(shape === "card" ? image.cardUrl : image.fullUrl);
  // Both sizes, so a browser picks by the width it actually draws: a wide list
  // card on a 2x screen wants the full size, a narrow band on a 1x screen the
  // card size. `auto` is the lazy image's own rendered width where a browser
  // supports it; `100vw` is the fallback where it does not. The widths are the
  // cover kinds' variants (`apps/server/src/images/kinds.ts`).
  const srcSet =
    image === null ? undefined : `${apiUrl(image.cardUrl)} 768w, ${apiUrl(image.fullUrl)} 1536w`;
  // By URL rather than a flag, so a fresh URL (the cover arrived, or a later
  // read signed a new one) gets a fresh chance with nothing to reset.
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const [brokenSrc, setBrokenSrc] = useState<string>();
  const loaded = src !== undefined && loadedSrc === src;
  const showable = src !== undefined && brokenSrc !== src;

  if (!showable && !pending) return null;

  return (
    <div
      data-slot="hob-cover"
      className={cn(
        "relative overflow-hidden bg-surface-sunken",
        shape === "card"
          ? "aspect-5/2 border-b border-hairline"
          : "aspect-5/2 rounded-card border border-hairline @3xl:aspect-4/1",
      )}
    >
      {showable && (
        <img
          key={src}
          src={src}
          srcSet={srcSet}
          sizes="auto, 100vw"
          alt=""
          loading="lazy"
          decoding="async"
          data-loaded={loaded ? "" : undefined}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setBrokenSrc(src)}
          className={cn(
            "absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-(--dur-slow) ease-out",
            loaded && "opacity-100",
          )}
        />
      )}
      {pending && (
        <Badge variant="outline" role="status" className="absolute bottom-3 left-3">
          Hob is drawing…
        </Badge>
      )}
    </div>
  );
}
