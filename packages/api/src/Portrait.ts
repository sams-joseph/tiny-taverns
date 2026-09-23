import type { Character, CharacterSheet } from "./Character.js";
import { APPEARANCE_MAX } from "./Character.js";

/**
 * The text an image model is given for a character's portrait — **one
 * implementation, pure, and shared by whoever asks.**
 *
 * The server builds it when it generates; a screen that wants to say what a
 * portrait draws from calls the same function, so the two cannot disagree (the
 * `SheetGrants.ts` pattern).
 *
 * ### What goes in, in this order
 *
 * 1. **Subject** — `"Head-and-shoulders portrait of a Hill Dwarf Paladin, Oath
 *    of Devotion"`. The subrace stands in for the race when there is one, the
 *    rule the generated `descriptor` column follows. Level shapes nothing.
 * 2. **Look** — `sheet.story.appearance`, verbatim.
 * 3. **Kit** — up to two lines the character is visibly carrying (see
 *    {@link kitFor}). A visual hint only; it links nothing.
 * 4. **Background** — only when there is no appearance line, as a light hint.
 * 5. **Style** — the fixed house text, `HOUSE_PORTRAIT_STYLE` (`HouseStyle.ts`).
 *
 * ### What never goes in
 *
 * The name, so no lettering is invited into the image. The backstory, bond,
 * ideal and flaw: narrative, often violent, and the likeliest thing to trip a
 * provider's moderation. Ability scores, which would push toward stereotyped
 * bodies.
 */

/** The most any one label contributes; a row's labels are open text with no bound of their own. */
const LABEL_MAX = 80;

/** How many carried lines the prompt names. */
const KIT_MAX = 2;

/**
 * The longest prompt the builder can return with the house style: every label
 * at {@link LABEL_MAX}, a full appearance line, and the joining words.
 */
export const PORTRAIT_PROMPT_MAX = 1200;

/** The parts of a character a portrait reads. A proposal's draft has them too. */
export type PortraitSubject = Pick<Character, "race" | "subrace" | "className"> & {
  readonly sheet: CharacterSheet;
};

export interface PortraitOptions {
  /** The style sentence(s) appended last; `HOUSE_PORTRAIT_STYLE` is the one there is. */
  readonly style: string;
}

const clean = (text: string | null | undefined, max: number): string | undefined => {
  const trimmed = (text ?? "").replace(/\s+/g, " ").trim();
  return trimmed === "" ? undefined : trimmed.slice(0, max).trim();
};

const withArticle = (phrase: string): string =>
  `${/^[aeiou]/i.test(phrase) ? "an" : "a"} ${phrase}`;

/**
 * What they are visibly carrying: the inventory lines ticked *equipped*, then
 * the weapons the Actions section attacks with, in that order, at most two.
 *
 * Inventory lines carry no category, and `equipmentId` is provenance, never
 * read through, so *equipped* is the only structural signal a line is worn or
 * held. A fresh character has none ticked — the starting kit writes none — so
 * the weapon actions the kit derived are the fallback, and they name exactly
 * the weapons the sheet says they fight with.
 */
const kitFor = (sheet: CharacterSheet): ReadonlyArray<string> => {
  const equipped = (sheet.inventory ?? [])
    .filter((item) => item.equipped === true)
    .map((item) => item.name);
  const weapons = (sheet.actions ?? [])
    .filter((action) => action.source === "weapon")
    .map((action) => action.name);
  const seen = new Set<string>();
  const lines: Array<string> = [];
  for (const name of [...equipped, ...weapons]) {
    const label = clean(name, LABEL_MAX);
    if (label === undefined || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    lines.push(label.toLowerCase());
    if (lines.length === KIT_MAX) break;
  }
  return lines;
};

/**
 * Whether there is anything to draw — a race, a class, an appearance line or a
 * background. With none of them a prompt would be the house style and nothing
 * else, so a caller skips generation rather than drawing a stranger.
 */
export const portraitHasSubject = (character: PortraitSubject): boolean =>
  clean(character.race, LABEL_MAX) !== undefined ||
  clean(character.subrace, LABEL_MAX) !== undefined ||
  clean(character.className, LABEL_MAX) !== undefined ||
  clean(character.sheet.story?.appearance, APPEARANCE_MAX) !== undefined ||
  clean(character.sheet.identity?.background, LABEL_MAX) !== undefined;

export const portraitPromptFor = (character: PortraitSubject, options: PortraitOptions): string => {
  const people = clean(character.subrace, LABEL_MAX) ?? clean(character.race, LABEL_MAX);
  const className = clean(character.className, LABEL_MAX);
  const subclass = clean(character.sheet.identity?.subclass, LABEL_MAX);
  const who = [people, className].filter((part) => part !== undefined).join(" ");
  const subject =
    "Head-and-shoulders portrait of " +
    (who === "" ? "an adventurer" : withArticle(who)) +
    (subclass === undefined ? "" : `, ${subclass}`) +
    ".";

  const appearance = clean(character.sheet.story?.appearance, APPEARANCE_MAX);
  const kit = kitFor(character.sheet);
  const background =
    appearance === undefined ? clean(character.sheet.identity?.background, LABEL_MAX) : undefined;

  return [
    subject,
    appearance === undefined
      ? undefined
      : /[.!?]$/.test(appearance)
        ? appearance
        : `${appearance}.`,
    kit.length === 0 ? undefined : `Equipped with ${kit.join(" and ")}.`,
    background === undefined
      ? undefined
      : `Something of ${withArticle(background.toLowerCase())} about them.`,
    options.style.trim(),
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");
};
