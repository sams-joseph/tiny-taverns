import type { SharedWorld } from "./SharedWorld.js";

/**
 * The text an image model is given for a Shared World's cover — **one
 * implementation, pure**, beside `campaignImagePromptFor` (`CampaignImage.ts`)
 * and for the same reason: the server builds it when it draws, and anything
 * that says what a cover is drawn from calls this rather than restating it.
 *
 * ### What goes in
 *
 * A Shared World carries one descriptive word about itself: **its name**, which
 * every member reads. It is the subject, asked for as the land and the mood it
 * suggests rather than as a title, because the house style forbids lettering.
 * The style is `HOUSE_COVER_STYLE` (`HouseStyle.ts`), the framing a campaign's
 * cover uses, since both show a place under a card.
 *
 * ### What never goes in
 *
 * Everything the world holds rather than is: the campaigns connected to it
 * (which change, and whose names a member who does not play there sees only in
 * the directory), the Chronicle and the Story So Far, the members, and the
 * Library shared into it. A cover is drawn once, so it depicts only what the
 * world was called when it was made.
 */

/** The most the name contributes; it is open text. */
const LABEL_MAX = 120;

/** The parts of a Shared World a cover reads. */
export type SharedWorldImageSubject = Pick<SharedWorld, "name">;

export interface SharedWorldImageOptions {
  /** The style sentence(s) appended last; `HOUSE_COVER_STYLE` is the one there is. */
  readonly style: string;
}

const clean = (text: string): string | undefined => {
  const trimmed = text.replace(/\s+/g, " ").replace(/["“”]/g, "").trim();
  return trimmed === "" ? undefined : trimmed.slice(0, LABEL_MAX).trim();
};

/**
 * Whether there is anything to draw: a name with any letters in it. A world
 * named only in spaces or quotes would be a cover of the house style alone, so
 * a caller skips rather than drawing a stranger's land.
 */
export const sharedWorldImageHasSubject = (world: SharedWorldImageSubject): boolean =>
  clean(world.name) !== undefined;

export const sharedWorldImagePromptFor = (
  world: SharedWorldImageSubject,
  options: SharedWorldImageOptions,
): string => {
  const name = clean(world.name);
  return [
    name === undefined
      ? "Wide vista of a fantasy world."
      : `Wide vista of a fantasy world called ${name}: the land and the mood that name ` +
        "suggests, shown rather than written.",
    options.style.trim(),
  ]
    .filter((part) => part !== "")
    .join(" ");
};
