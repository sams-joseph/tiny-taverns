import { type SharedWorld, SHARED_WORLD_DESCRIPTION_MAX } from "./SharedWorld.js";

/**
 * The text an image model is given for a Shared World's cover — **one
 * implementation, pure**, beside `campaignImagePromptFor` (`CampaignImage.ts`)
 * and for the same reason: the server builds it when it draws, and anything
 * that says what a cover is drawn from calls this rather than restating it.
 *
 * ### What goes in
 *
 * A Shared World carries two things about itself that every member reads:
 *
 * 1. **The description**, when the owner wrote one — the land in their words,
 *    and the scene itself: it comes first and the name colours it.
 * 2. **The name**. Without a description it is the subject, asked for as the
 *    land and the mood it suggests; with one, it colours the mood. Either way
 *    it is shown rather than written, because the house style forbids
 *    lettering.
 *
 * The style is `HOUSE_COVER_STYLE` (`HouseStyle.ts`), the framing a campaign's
 * cover uses, since both show a place under a card.
 *
 * ### What never goes in
 *
 * Everything the world holds rather than is: the campaigns connected to it
 * (which change, and whose names a member who does not play there sees only in
 * the directory), the Chronicle and the Story So Far, the members, and the
 * Library shared into it. A cover is drawn once, so it depicts only what the
 * world was called and described as when it was made.
 */

/** The most the name contributes; it is open text. */
const LABEL_MAX = 120;

/** The parts of a Shared World a cover reads. */
export type SharedWorldImageSubject = Pick<SharedWorld, "name" | "description">;

export interface SharedWorldImageOptions {
  /** The style sentence(s) appended last; `HOUSE_COVER_STYLE` is the one there is. */
  readonly style: string;
}

const clean = (text: string | null | undefined, max = LABEL_MAX): string | undefined => {
  const trimmed = (text ?? "").replace(/\s+/g, " ").replace(/["“”]/g, "").trim();
  return trimmed === "" ? undefined : trimmed.slice(0, max).trim();
};

const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * Whether there is anything to draw: a name or a description with any letters
 * in it. A world with neither would be a cover of the house style alone, so a
 * caller skips rather than drawing a stranger's land.
 */
export const sharedWorldImageHasSubject = (world: SharedWorldImageSubject): boolean =>
  clean(world.name) !== undefined ||
  clean(world.description, SHARED_WORLD_DESCRIPTION_MAX) !== undefined;

const vista = (name: string | undefined, description: string | undefined): string => {
  if (description !== undefined) {
    return [
      `Wide vista of a fantasy world. ${sentence(description)}`,
      name === undefined
        ? undefined
        : `The world is called ${name}; let that colour the mood, shown rather than written.`,
    ]
      .filter((part) => part !== undefined)
      .join(" ");
  }
  return name === undefined
    ? "Wide vista of a fantasy world."
    : `Wide vista of a fantasy world called ${name}: the land and the mood that name ` +
        "suggests, shown rather than written.";
};

export const sharedWorldImagePromptFor = (
  world: SharedWorldImageSubject,
  options: SharedWorldImageOptions,
): string =>
  [
    vista(clean(world.name), clean(world.description, SHARED_WORLD_DESCRIPTION_MAX)),
    options.style.trim(),
  ]
    .filter((part) => part !== "")
    .join(" ");
