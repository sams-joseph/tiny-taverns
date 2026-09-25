import { Badge, cn } from "@taverns/ui";
import { useState, type ReactNode } from "react";
import { apiUrl } from "../api/client";

/**
 * The two signed sizes of a landscape Hob drew — a campaign's cover
 * (`CampaignImages`), a Shared World's (`SharedWorldImages`) or an encounter's
 * battle map (`BattleMapImages`), which are the same shape because all three
 * kinds keep the same variants (`apps/server/src/images/kinds.ts`).
 */
export interface HobCoverImages {
  readonly cardUrl: string;
  readonly fullUrl: string;
}

/**
 * A cover: the landscape Hob drew once, after a campaign or a Shared World was
 * made, across the top of whatever shows it.
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
 * **Four shapes of one 3:2 image.** Three crop it, and `object-cover` keeps
 * its middle, which the cover framing (`HouseStyle.ts`) keeps clear; a map's
 * ground runs to its edges, so its strip is a glimpse and the encounter's
 * page draws it whole:
 *
 * - `card` — the head of a card on the campaign or Shared World list, bled to
 *   the card's edges (the card clips it to its radius); its `src` is the
 *   768 × 512 size.
 * - `hero` — the top of an Overview (a campaign's, a player's, a Shared
 *   World's), as the redesign draws it: a fixed height that follows the window
 *   (`--overview-cover-h`) rather than a ratio, and the bottom of the picture
 *   fading into the page so the header can sit over it
 *   (`campaign/OverviewParts.tsx`'s `OverviewHero`); its `src` is the
 *   1536 × 1024 size. It sits in the page, never in the sticky chrome rows.
 * - `strip` — a battle map across the Encounters preview, under its header, at
 *   the drawing's 24:9 (`campaign/EncounterPreview.tsx`).
 * - `whole` — a battle map uncropped, at the drawn size's 3:2, in the
 *   encounter builder's *Battle map* card. The fight's board is not this: it
 *   lays a grid over the picture and draws the grid alone without one
 *   (`campaign/BattleMapBoard.tsx`).
 *
 * Both battle-map shapes, like `card`, bleed to the edges of what holds them
 * and close with a hairline under the picture.
 *
 * `data-picture` is set while there is a picture to show and Hob is not
 * drawing a new one: it is the one thing a caller may lay content over, and
 * it is on the element rather than handed back because a URL that fails to
 * load is only discovered in here. `children` are laid over the frame — the
 * preview's link across its strip — so they go with it when it collapses and
 * never stand in an empty box.
 */
export function HobCover({
  image,
  pending,
  shape,
  children,
}: {
  readonly image: HobCoverImages | null;
  readonly pending: boolean;
  readonly shape: "card" | "hero" | "strip" | "whole";
  /** Laid over the frame, and gone with it. */
  readonly children?: ReactNode;
}) {
  const src = image === null ? undefined : apiUrl(shape === "card" ? image.cardUrl : image.fullUrl);
  // Both sizes, so a browser picks by the width it actually draws: a wide list
  // card on a 2x screen wants the full size, a narrow hero on a 1x screen the
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
      data-picture={showable && !pending ? "" : undefined}
      className={cn(
        "relative overflow-hidden bg-surface-sunken",
        shape === "card" && "aspect-5/2 border-b border-hairline",
        shape === "hero" && "h-overview-cover rounded-card border border-hairline shadow-1",
        shape === "strip" && "aspect-24/9 border-b border-hairline",
        shape === "whole" && "aspect-3/2 border-b border-hairline",
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
      {/* The bottom 45% of the picture fades into the page, which is what the
          header over it is read against. */}
      {shape === "hero" && showable && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-9/20 bg-linear-to-t from-surface-page to-transparent"
        />
      )}
      {pending && (
        <Badge variant="outline" role="status" className="absolute bottom-3 left-3">
          Hob is drawing…
        </Badge>
      )}
      {children}
    </div>
  );
}
