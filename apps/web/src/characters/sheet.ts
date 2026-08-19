import type { Character, CharacterSheet, Currency } from "@taverns/api";

/**
 * What the sheet screens work out before they draw anything.
 *
 * Pure and separately tested, for the reason `chronicle/fight.ts` is: the
 * decisions here are the ones that are wrong silently. A sheet whose Actions tab
 * is drawn empty and a roster line that invents a hit point both render
 * perfectly well.
 */

/**
 * The lettered plate the design system uses in place of art it does not ship.
 *
 * Two letters at most, and the first of each word — `PlayerParts.jsx`'s
 * `Portrait` exactly. A name with no letters in it at all (somebody's
 * placeholder) gets nothing rather than an em dash pretending to be initials.
 */
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

/**
 * `44 / 52`, `52`, or nothing — the same three answers `campaign/PartyList.tsx`
 * gives, and for its reason.
 *
 * **`hpCurrent` null is *nobody has said*, which is neither full nor zero.** The
 * server refuses to backfill it for exactly that reason, so a screen that filled
 * in `hpMax` here would be making the claim `0014` declined to make: that the
 * party walked in unhurt.
 */
export const hitPoints = (current: number | null, max: number | null): string | undefined =>
  max === null
    ? current === null
      ? undefined
      : String(current)
    : current === null
      ? String(max)
      : `${String(current)} / ${String(max)}`;

/** The number the hit-point bar fills to, when there is a bar to fill. */
export const hpFraction = (current: number | null, max: number | null): number | undefined => {
  if (max === null || max <= 0) return undefined;
  const at = current ?? max;
  return Math.max(0, Math.min(1, at / max));
};

/** Which coins are actually held. An absent pile is absent, not a zero. */
export const coins = (
  currency: Currency,
): ReadonlyArray<{
  readonly label: string;
  readonly amount: number;
}> =>
  (["pp", "gp", "ep", "sp", "cp"] as const).flatMap((key) => {
    const amount = currency[key];
    return amount === undefined ? [] : [{ label: key, amount }];
  });

/**
 * Which tabs the document can fill.
 *
 * **A tab is drawn when it has something in it, or somewhere to write** — the
 * screens rule (*do not render a field the API does not have*) applied to a
 * container, and then relaxed by exactly the amount the player write bought.
 * The sheet is thirteen optional keys on one `jsonb` document and a character
 * created through `CharacterDialog` has none of them, so five empty tabs over
 * an empty sheet would say the data exists and is blank when what is true is
 * that nobody has written it.
 *
 * `writable` is what the player's own sheet passes. Under it Gear and Story are
 * drawn whether or not they hold anything, because each carries an affordance
 * that *creates* the thing the tab is for — and a tab that appears only once
 * its contents exist is a first line of backstory nobody can type. The other
 * three stay content-driven: nothing on this screen writes an ability cell, an
 * attack or a level-up, so an empty Stats tab would still be a promise with
 * nothing behind it.
 */
export interface SheetTabs {
  readonly stats: boolean;
  readonly actions: boolean;
  readonly gear: boolean;
  readonly story: boolean;
  readonly log: boolean;
  /**
   * Nothing in the document at all — the state every row written before it is
   * in, and one a writable sheet is never in: Gear and Story are always drawn
   * there, so there is always somewhere to start.
   */
  readonly empty: boolean;
}

const some = (list: ReadonlyArray<unknown> | undefined): boolean =>
  list !== undefined && list.length > 0;

const written = (text: string | undefined): boolean => text !== undefined && text.trim() !== "";

export const sheetTabs = (sheet: CharacterSheet, writable = false): SheetTabs => {
  const spellcasting = sheet.spellcasting;
  const story = sheet.story;

  const tabs = {
    stats:
      some(sheet.abilities) ||
      some(sheet.skills) ||
      some(sheet.proficiencies) ||
      some(sheet.traits),
    actions:
      some(sheet.attacks) ||
      (spellcasting !== undefined &&
        (some(spellcasting.slots) ||
          some(spellcasting.known) ||
          written(spellcasting.ability) ||
          written(spellcasting.save) ||
          written(spellcasting.attack))),
    gear:
      writable ||
      some(sheet.inventory) ||
      (sheet.currency !== undefined && coins(sheet.currency).length > 0),
    story:
      writable ||
      written(sheet.notes) ||
      some(sheet.journal) ||
      (story !== undefined &&
        [story.personality, story.ideal, story.bond, story.flaw].some(written)),
    log: some(sheet.levelUps),
  };

  return { ...tabs, empty: !Object.values(tabs).some(Boolean) };
};

/**
 * The line under *Your characters*: what is true, counted.
 *
 * Deliberately not the delivery's *"Ilse Vantar · playing in 2 campaigns"* — the
 * API has no read that names the signed-in account (`GET /me/…` answers what an
 * account *has*, never who it is), and a name invented here would be the stubbed
 * field the screens rule forbids. `tableCount` is the memberships, which is a
 * different number from the campaigns played in and is the one that makes the
 * empty roster legible.
 */
export const rosterSummary = (characters: ReadonlyArray<Character>, tableCount: number): string => {
  const tables = new Set(characters.map((character) => character.campaignId)).size;
  const plural = (count: number, one: string, many: string) =>
    `${String(count)} ${count === 1 ? one : many}`;

  if (characters.length === 0) {
    return tableCount === 0
      ? "You are not at a table yet."
      : `No characters yet, at ${plural(tableCount, "table", "tables")}.`;
  }
  return `${plural(characters.length, "character", "characters")}, at ${plural(tables, "table", "tables")}.`;
};
