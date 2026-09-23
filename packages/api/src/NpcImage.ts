import type { Npc } from "./Npc.js";

/**
 * The text an image model is given for an NPC's portrait — **one
 * implementation, pure**, beside `portraitPromptFor` (`Portrait.ts`) and
 * `campaignImagePromptFor` (`CampaignImage.ts`), for the same reason: the
 * server builds it when it draws, and anything that says what an NPC's
 * portrait is drawn from calls this rather than restating it.
 *
 * ### What goes in, in this order
 *
 * Only the NPC's **public persona** — the half `Npc.ts` keeps player-facing by
 * construction, and the half a player reads once the NPC is shared:
 *
 * 1. **Subject** — a bust, and the role when there is one (`"the ferryman at
 *    the crossing"`).
 * 2. **Who they are** — `persona.identity.summary`, bounded. An NPC has no
 *    appearance field; the summary is the nearest thing the creator writes.
 * 3. **Pronouns** — `persona.identity.pronouns`, when given.
 * 4. **Style** — `HOUSE_PORTRAIT_STYLE` (`HouseStyle.ts`), the bust framing a
 *    character's portrait uses, so a cast and a party look like one table.
 *
 * ### What never goes in
 *
 * **The private material** — secrets and play instructions — is not even in
 * {@link NpcImageSubject}: the picture is shown to every player who can see the
 * NPC, so drawing from a secret would put it on the table. Knowledge facts,
 * memories and transcripts are not the NPC's own fields and are never read.
 * The voice, intent and boundaries are player-safe but not visual. The name is
 * left out, as a character's is, so no lettering is invited into the image.
 */

/** The most the role contributes; it is bounded at 120 by the schema. */
const ROLE_MAX = 120;

/** The most of the summary a prompt carries; the summary may run to 2000. */
const SUMMARY_MAX = 600;

/** Pronouns are a short label. */
const PRONOUNS_MAX = 40;

/** The parts of an NPC a portrait reads. `PlayerNpc` has them too; the private material does not belong here. */
export type NpcImageSubject = Pick<Npc, "role" | "persona">;

export interface NpcImageOptions {
  /** The style sentence(s) appended last; `HOUSE_PORTRAIT_STYLE` is the one there is. */
  readonly style: string;
}

const clean = (text: string | null | undefined, max: number): string | undefined => {
  const trimmed = (text ?? "").replace(/\s+/g, " ").replace(/["“”]/g, "").trim();
  return trimmed === "" ? undefined : trimmed.slice(0, max).trim();
};

const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * Whether there is anything to draw: a role or a summary. An NPC that is only a
 * name would be a portrait of the house style alone, so a caller skips rather
 * than drawing a stranger.
 */
export const npcImageHasSubject = (npc: NpcImageSubject): boolean =>
  clean(npc.role, ROLE_MAX) !== undefined ||
  clean(npc.persona.identity?.summary, SUMMARY_MAX) !== undefined;

export const npcImagePromptFor = (npc: NpcImageSubject, options: NpcImageOptions): string => {
  const role = clean(npc.role, ROLE_MAX);
  const summary = clean(npc.persona.identity?.summary, SUMMARY_MAX);
  const pronouns = clean(npc.persona.identity?.pronouns, PRONOUNS_MAX);
  return [
    role === undefined
      ? "Head-and-shoulders portrait of a character in a fantasy adventure."
      : `Head-and-shoulders portrait of a character in a fantasy adventure: ${sentence(role)}`,
    summary === undefined ? undefined : sentence(summary),
    pronouns === undefined ? undefined : `Pronouns: ${sentence(pronouns)}`,
    options.style.trim(),
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");
};
