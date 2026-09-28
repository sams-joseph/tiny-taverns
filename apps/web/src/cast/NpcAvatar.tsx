import type { NpcImages } from "@taverns/api";
import { cn } from "@taverns/ui";
import { apiUrl } from "../api/client";
import { DrawnImage } from "../hob/DrawnImage";
import { initialsOf } from "./persona";

/**
 * An NPC's plate: two letters in a square, always, with the portrait Hob drew
 * laid over them when there is one.
 *
 * **The initials are every state that is not a loaded picture** — no portrait
 * (images are off, there was nothing public to draw from, the provider
 * refused, or it is a Library original, which is never drawn), one still being
 * drawn, one still loading, and one whose URL failed. The picture is
 * `DrawnImage`, the same fade and collapse a character's plate uses. There is
 * no upload and no redraw: the plate shows what Hob drew once, or the letters.
 *
 * Not a Hob mark: the rehearsal is branded as the NPC and never as Hob, so the
 * plate is the NPC's own face wherever it stands — the cast card, the NPC's
 * page, each reply in a conversation.
 *
 * `sm` is the 28px row mark and `lg` the 44px heading plate, both loading the
 * 160px thumb. `card` fills the Cast card's portrait band, as a character's
 * `CharacterPortrait` fills a seat card's, and loads the 640px card size. The
 * plate clips with `overflow-clip`, not `overflow-hidden`: it sits inside the
 * rehearsal panel, which the window scrolls, and a clip makes no scroll
 * container (`RehearsalPanel.test.tsx` holds it to that).
 */
export function NpcAvatar({
  name,
  image,
  size = "sm",
}: {
  readonly name: string;
  readonly image: NpcImages | null;
  readonly size?: "sm" | "lg" | "card";
}) {
  const src = image === null ? undefined : apiUrl(size === "card" ? image.cardUrl : image.thumbUrl);
  const picture = <DrawnImage src={src} className="object-top" />;

  if (size === "card") {
    return (
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-display-xl leading-none font-semibold text-faint">
          {initialsOf(name)}
        </span>
        {picture}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-clip border border-strong bg-surface-raised font-display font-semibold text-heading",
        size === "lg" ? "size-11 rounded-control text-body" : "size-7 rounded-sm text-micro",
      )}
    >
      {initialsOf(name)}
      {picture}
    </span>
  );
}
