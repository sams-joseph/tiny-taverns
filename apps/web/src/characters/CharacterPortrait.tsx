import type { CharacterPortraitImages } from "@taverns/api";
import { cn } from "@taverns/ui";
import type { ReactNode } from "react";
import { apiUrl } from "../api/client";
import { DrawnImage } from "../hob/DrawnImage";
import { initialsOf } from "./sheet";

/**
 * A character's plate: the initials, always, with Hob's portrait laid over them
 * when there is one.
 *
 * **The initials are every state that is not a loaded picture** — no portrait
 * (portraits are off, there was nothing to draw from, the provider refused),
 * one still being drawn, one still loading, and one whose URL failed (an
 * expired signature, a server that has since lost the file). The picture is
 * `DrawnImage` (`hob/DrawnImage.tsx`), the same fade and the same collapse an
 * NPC's plate uses, filling a plate whose size the class names.
 */
export function CharacterPortrait({
  name,
  portrait,
  size = "sm",
  fallback,
}: {
  readonly name: string;
  readonly portrait: CharacterPortraitImages | null;
  /**
   * `row` is a list row's 28px mark (the party list, the initiative order, the
   * player table), `xs` the narrow sheet's 40px summary plate, `lg` the wide
   * sheet's 64px one; all three load the 160px thumb. `card` fills the *My
   * characters* card's 4:3 header and loads the 640px card size.
   */
  readonly size?: "row" | "xs" | "sm" | "lg" | "card";
  /**
   * For `row`: drawn in the plate's place, in a slot the plate's size, when
   * there is no portrait at all — the row's existing icon, so a list with
   * portraits off looks as it always did and its names stay in one column.
   * The initials still stand under a portrait that is loading or failed.
   */
  readonly fallback?: ReactNode;
}) {
  const src =
    portrait === null ? undefined : apiUrl(size === "card" ? portrait.cardUrl : portrait.thumbUrl);
  const image = <DrawnImage src={src} className="object-top" />;

  if (portrait === null && fallback !== undefined) {
    return (
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center">
        {fallback}
      </span>
    );
  }

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
            : size === "row"
              ? "size-7 text-micro"
              : "size-13 text-display-s",
      )}
    >
      {initialsOf(name)}
      {image}
    </div>
  );
}
