import type { CampaignImages } from "@taverns/api";
import { Badge, cn } from "@taverns/ui";
import { useState } from "react";
import { apiUrl } from "../api/client";

/**
 * A campaign's cover: the landscape Hob drew once, after the campaign was made,
 * as a band across the top of whatever shows the campaign.
 *
 * **Absent is the current look.** With no cover — images are off, there was
 * nothing to draw from, the provider refused, or the URL failed to load (an
 * expired signature, a server that has since lost the file) — this renders
 * nothing at all, so a campaign card or an Overview without one is exactly
 * what it was before there were covers. There is no placeholder art, because
 * there is none to show.
 *
 * **Pending is the one state that takes space without a picture**: the band,
 * in the sunken surface, saying Hob is drawing, while the screen re-reads
 * (`hob/drawingPolling.ts`). When the draw fails the band goes, which is the
 * same collapse a broken URL gets.
 *
 * The picture fades in on load, timed by the motion tokens, over the sunken
 * surface, so a slow load is a quiet band rather than a flash. It is
 * decorative (`alt=""`): the campaign's name is always beside it.
 *
 * **Two shapes, both crops of one 3:2 image**, and `object-cover` keeps its
 * middle, which the cover framing (`HouseStyle.ts`) keeps clear:
 *
 * - `card` — the head of a campaign card on the list, bled to the card's edges
 *   (the card clips it to its radius), from the 768 × 512 size.
 * - `band` — the top of a campaign's home page, the creator's Overview and the
 *   player's alike, from the 1536 × 1024 size: wide and shallow above the
 *   content, deeper once the column is narrow enough that a 4:1 strip would be
 *   a sliver. It sits in the page, never in the sticky chrome rows.
 */
export function CampaignCover({
  image,
  pending,
  shape,
}: {
  readonly image: CampaignImages | null;
  readonly pending: boolean;
  readonly shape: "card" | "band";
}) {
  const src = image === null ? undefined : apiUrl(shape === "card" ? image.cardUrl : image.fullUrl);
  // By URL rather than a flag, so a fresh URL (the cover arrived, or a later
  // read signed a new one) gets a fresh chance with nothing to reset.
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const [brokenSrc, setBrokenSrc] = useState<string>();
  const loaded = src !== undefined && loadedSrc === src;
  const showable = src !== undefined && brokenSrc !== src;

  if (!showable && !pending) return null;

  return (
    <div
      data-slot="campaign-cover"
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
