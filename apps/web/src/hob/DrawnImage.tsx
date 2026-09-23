import { cn } from "@taverns/ui";
import { useState } from "react";

/**
 * A picture Hob drew, laid over the plate it belongs to — the one `<img>` a
 * character's portrait (`characters/CharacterPortrait.tsx`) and an NPC's
 * (`cast/NpcAvatar.tsx`) both draw, so they load, fade and fail the same way.
 *
 * **Nothing when there is nothing to show.** No `src`, or one that failed to
 * load (an expired signature, a server that has since lost the file), renders
 * nothing, so whatever the plate draws underneath — the initials — is what the
 * reader sees. There is no error chrome.
 *
 * It fills its plate (`absolute inset-0`, so the plate must be `relative` and
 * clip), fades in on load by the motion tokens, and is decorative (`alt=""`):
 * the name is always beside it. Its size is stated in CSS, never by attribute
 * — preflight's `img { height: auto }` beats a `height` attribute
 * (`web-screens.md`, the `HobAvatar` note).
 */
export function DrawnImage({
  src,
  className,
}: {
  readonly src: string | undefined;
  /** Where the crop anchors, e.g. `object-top` for a bust. */
  readonly className?: string;
}) {
  // Which URL loaded, and which failed — by URL rather than a flag, so a new
  // one (the picture arrived, or a later read signed a fresh URL) gets a fresh
  // chance with nothing to reset.
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const [brokenSrc, setBrokenSrc] = useState<string>();
  if (src === undefined || brokenSrc === src) return null;
  const loaded = loadedSrc === src;
  return (
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
        className,
      )}
    />
  );
}
