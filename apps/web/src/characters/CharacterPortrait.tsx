import type { CharacterPortraitImages } from "@taverns/api";
import { cn } from "@taverns/ui";
import { useState } from "react";
import { apiUrl } from "../api/client";
import { initialsOf } from "./sheet";

/**
 * A character's plate: the initials, always, with Hob's portrait laid over them
 * when there is one.
 *
 * **The initials are every state that is not a loaded picture** — no portrait
 * (portraits are off, there was nothing to draw from, the provider refused),
 * one still being drawn, one still loading, and one whose URL failed (an
 * expired signature, a server that has since lost the file). So there is no
 * error chrome anywhere: `onError` drops the `<img>` and the plate underneath
 * is what was always there.
 *
 * The picture fades in on load, timed by the motion tokens, so a slow load
 * never flashes a half-drawn image over the letters. It is decorative
 * (`alt=""`): the name is always beside it.
 *
 * **Its size is stated in CSS, never by attribute** — preflight's
 * `img { height: auto }` beats a `height` attribute (`web-screens.md`, the
 * `HobAvatar` note) — by filling a plate whose size the class names.
 */
export function CharacterPortrait({
  name,
  portrait,
  size = "sm",
}: {
  readonly name: string;
  readonly portrait: CharacterPortraitImages | null;
  /**
   * `xs` is the narrow sheet's 40px summary plate, `lg` the wide sheet's 64px
   * one; both load the 160px thumb. `card` fills the *My characters* card's
   * 4:3 header and loads the 640px card size.
   */
  readonly size?: "xs" | "sm" | "lg" | "card";
}) {
  const src =
    portrait === null ? undefined : apiUrl(size === "card" ? portrait.cardUrl : portrait.thumbUrl);
  // Which URL loaded, and which failed — by URL rather than a flag, so a new
  // one (the portrait arrived, or a later read signed a fresh URL) gets a
  // fresh chance with nothing to reset.
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const [brokenSrc, setBrokenSrc] = useState<string>();
  const loaded = src !== undefined && loadedSrc === src;

  const image = src !== undefined && brokenSrc !== src && (
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
        "absolute inset-0 size-full object-cover object-top opacity-0 transition-opacity duration-(--dur-slow) ease-out",
        loaded && "opacity-100",
      )}
    />
  );

  if (size === "card") {
    return (
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-display-xl leading-none font-semibold text-faint">
          {initialsOf(name)}
        </span>
        {image}
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden border border-strong bg-accent-soft font-display leading-none font-semibold text-accent-ink",
        size === "lg"
          ? "size-16 text-display-m"
          : size === "xs"
            ? "size-10 text-title"
            : "size-13 text-display-s",
      )}
    >
      {initialsOf(name)}
      {image}
    </div>
  );
}
