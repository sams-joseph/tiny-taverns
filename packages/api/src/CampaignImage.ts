import { type Campaign, CAMPAIGN_DESCRIPTION_MAX } from "./Campaign.js";

/**
 * The text an image model is given for a campaign's cover — **one
 * implementation, pure**, beside `portraitPromptFor` (`Portrait.ts`) and for
 * the same reason: the server builds it when it draws, and any screen that says
 * what a cover is drawn from calls this rather than restating it.
 *
 * ### What goes in
 *
 * A campaign carries three player-facing things about itself, and all are read:
 *
 * 1. **The description**, when the creator wrote one — the pitch every player
 *    reads, and the scene itself: it comes first and the rest colours it.
 * 2. **The name** — the one thing every campaign has. Without a description it
 *    is the subject, asked for as the place and mood it suggests; with one, it
 *    colours the mood. Either way it is shown rather than written, because the
 *    house style forbids lettering and a title in quotes is an invitation to
 *    write it.
 * 3. **The party's name**, when the table has given one — a hint at who the
 *    story is about, never drawn as a face.
 * 4. **Style** — `HOUSE_COVER_STYLE` (`HouseStyle.ts`), the house style framed
 *    as a wide scene rather than a bust.
 *
 * ### What never goes in
 *
 * Everything else on the table: notes, prep, sessions, the cast, beats and the
 * chronicle are the creator's working record, often private to them, and a
 * cover is shown to every player. The Shared World a campaign is connected to
 * is not the campaign's own field and can change after the one draw, so it is
 * not read either.
 */

/** The most the name or the party's name contributes; both are open text. */
const LABEL_MAX = 120;

/** The parts of a campaign a cover reads. */
export type CampaignImageSubject = Pick<Campaign, "name" | "partyName" | "description">;

export interface CampaignImageOptions {
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
 * in it. A campaign with neither would be a cover of the house style alone, so
 * a caller skips rather than drawing a stranger's scene.
 */
export const campaignImageHasSubject = (campaign: CampaignImageSubject): boolean =>
  clean(campaign.name) !== undefined ||
  clean(campaign.description, CAMPAIGN_DESCRIPTION_MAX) !== undefined;

const scene = (name: string | undefined, description: string | undefined): string => {
  if (description !== undefined) {
    return [
      `Wide establishing scene for a fantasy adventure. ${sentence(description)}`,
      name === undefined
        ? undefined
        : `The adventure is called ${name}; let that colour the mood, shown rather than written.`,
    ]
      .filter((part) => part !== undefined)
      .join(" ");
  }
  return name === undefined
    ? "Wide establishing scene for a fantasy adventure."
    : `Wide establishing scene for a fantasy adventure called ${name}: the place and the ` +
        "mood that title suggests, shown rather than written.";
};

export const campaignImagePromptFor = (
  campaign: CampaignImageSubject,
  options: CampaignImageOptions,
): string => {
  const name = clean(campaign.name);
  const description = clean(campaign.description, CAMPAIGN_DESCRIPTION_MAX);
  const party = clean(campaign.partyName);
  return [
    scene(name, description),
    party === undefined
      ? undefined
      : `The adventuring party at its heart is known as ${party}; hint at them, small in the scene.`,
    options.style.trim(),
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");
};
