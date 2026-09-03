import type {
  CharacterSheet,
  Currency,
  OwnedCharacter,
  SheetAction,
  SheetResource,
  SpellSlot,
  Trait,
} from "@taverns/api";
import type { IconName } from "@taverns/ui";

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
 * The sections of the continuous sheet, in the order the seventh delivery draws
 * them (`ui_kits/dm-screen/CharacterSheetB.jsx`'s `B_SECTIONS`).
 *
 * One list, read by three things: the document draws a section per entry, the
 * spine lists them, and `sheetSections` decides which are drawn. It lives here
 * rather than in the screen so the spine and the document cannot disagree about
 * what a section is called or which glyph it wears — the delivery's short label
 * is the narrow rail's, the long one the wide spine's, and the icon is by name so
 * `packages/ui`'s table is the one place a glyph is bound.
 */
export type SheetSectionId =
  "abilities" | "actions" | "magic" | "features" | "gear" | "story" | "log";

export interface SheetSectionSpec {
  readonly id: SheetSectionId;
  /** *Abilities & skills* — the wide spine's label and the section's heading. */
  readonly label: string;
  /** *Abilities* — the narrow rail's pill, where seven long labels will not fit. */
  readonly short: string;
  readonly icon: IconName;
}

export const SHEET_SECTIONS: ReadonlyArray<SheetSectionSpec> = [
  { id: "abilities", label: "Abilities & skills", short: "Abilities", icon: "hexagon" },
  { id: "actions", label: "Actions", short: "Actions", icon: "swords" },
  { id: "magic", label: "Spellcasting", short: "Spells", icon: "sparkles" },
  { id: "features", label: "Features & traits", short: "Features", icon: "scroll-text" },
  { id: "gear", label: "Gear & coin", short: "Gear", icon: "backpack" },
  { id: "story", label: "Story", short: "Story", icon: "book-open" },
  { id: "log", label: "Level ups", short: "Log", icon: "history" },
];

/**
 * Which sections the document can fill.
 *
 * **A section is drawn when it has something in it, or somewhere to write** —
 * the screens rule (*do not render a field the API does not have*) applied to a
 * container, and then relaxed by exactly the amount the player write bought.
 * The sheet is thirteen optional keys on one `jsonb` document and a character
 * created through `CharacterDialog` has none of them, so seven empty sections
 * over an empty sheet would say the data exists and is blank when what is true
 * is that nobody has written it.
 *
 * `writable` is what the player's own sheet passes. Under it *Abilities &
 * skills*, *Gear & coin* and *Story* are drawn whether or not they hold
 * anything, because each carries an affordance that *creates* the thing the
 * section is for — and a section that appears only once its contents exist is a
 * first line of backstory nobody can type. The other four stay content-driven
 * for exactly the same test — nothing on the sheet writes an attack, a spell
 * slot, a feature or a level-up — which is what keeps the flag meaning
 * something rather than being *writable* spelled twice.
 *
 * This was `sheetTabs` while the sheet was tabbed, with the same semantics over
 * five tabs; the seventh delivery's continuous sheet split *Stats* into
 * abilities and features and *Actions* into attacks and spellcasting, so the
 * rule is spelled over seven names now and the spine lists exactly the drawn
 * ones. The pure half of `chronicle/fight.ts`'s reason applies: an empty section
 * renders perfectly well, which is why this is decided here and tested.
 */
export interface SheetSections {
  readonly abilities: boolean;
  readonly actions: boolean;
  readonly magic: boolean;
  readonly features: boolean;
  readonly gear: boolean;
  readonly story: boolean;
  readonly log: boolean;
  /**
   * Nothing in the document at all — the state every row written before it is
   * in, and one a writable sheet is never in: three sections are always drawn
   * there, so there is always somewhere to start.
   */
  readonly empty: boolean;
}

const some = (list: ReadonlyArray<unknown> | undefined): boolean =>
  list !== undefined && list.length > 0;

const written = (text: string | undefined): boolean => text !== undefined && text.trim() !== "";

/**
 * The spell slots, wherever the document holds them: the `"slot:N"` rows of
 * `resources` — what a fresh sheet carries since the corpus started writing it
 * — and, on a row written before that, the legacy `spellcasting.slots`. One
 * reader for both, so the pips and the section rule cannot disagree about
 * whether there is anything to draw.
 */
export const slotRows = (sheet: CharacterSheet): ReadonlyArray<SpellSlot> => {
  const fromResources = (sheet.resources ?? []).flatMap((resource) => {
    const match = /^slot:(\d+)$/.exec(resource.id);
    return match?.[1] === undefined
      ? []
      : [{ level: Number(match[1]), used: resource.used, total: resource.max }];
  });
  return fromResources.length > 0 ? fromResources : (sheet.spellcasting?.slots ?? []);
};

/**
 * The Actions section's lines, wherever the document holds them: `actions`
 * first, and the legacy `attacks` (`Trait`s) drawn through the same shape so a
 * row written before the key exists reads exactly as it did — the note as the
 * range line, and no cost, because a `Trait` never carried one.
 */
export const actionRows = (sheet: CharacterSheet): ReadonlyArray<SheetAction> =>
  sheet.actions !== undefined && sheet.actions.length > 0
    ? sheet.actions
    : (sheet.attacks ?? []).map((attack: Trait): SheetAction => ({
        id: `attack:${attack.name}`,
        name: attack.name,
        ...(attack.text === "" ? {} : { text: attack.text }),
        ...(attack.hit === undefined ? {} : { hit: attack.hit }),
        ...(attack.dice === undefined ? {} : { dice: attack.dice }),
        ...(attack.note === undefined ? {} : { range: attack.note }),
        source: "other",
      }));

/** *"1 action"*, *"bonus"* — the economy as the drawing badges it, D6's cost on the line. */
export const costLabel = (cost: SheetAction["cost"]): string | undefined => {
  switch (cost) {
    case "action":
      return "1 action";
    case "bonus":
      return "bonus";
    case "reaction":
      return "reaction";
    case "free":
      return "free";
    default:
      return undefined;
  }
};

const rechargeWords = (recharge: SheetResource["recharge"]): string | undefined => {
  switch (recharge) {
    case "short":
      return "short rest";
    case "long":
      return "long rest";
    case "dawn":
      return "dawn";
    default:
      return undefined;
  }
};

/**
 * *"2/2 · short rest"*, *"25/25 hp · long rest"* — the accent note a feature
 * row wears when a counter of the same name is on `resources`. Matched by name
 * because a `Trait` carries no id, and read-only: nothing here spends one.
 */
export const usesNote = (
  trait: Trait,
  resources: ReadonlyArray<SheetResource> | undefined,
): string | undefined => {
  const wanted = trait.name.trim().toLowerCase();
  const resource = (resources ?? []).find(
    (candidate) =>
      !candidate.id.startsWith("slot:") && candidate.name.trim().toLowerCase() === wanted,
  );
  if (resource === undefined) return undefined;
  const left = Math.max(0, resource.max - resource.used);
  const count = `${String(left)}/${String(resource.max)}${resource.unit === undefined ? "" : ` ${resource.unit}`}`;
  const recharge = rechargeWords(resource.recharge);
  return recharge === undefined ? count : `${count} · ${recharge}`;
};

export const sheetSections = (sheet: CharacterSheet, writable = false): SheetSections => {
  const spellcasting = sheet.spellcasting;
  const story = sheet.story;

  const sections = {
    abilities: writable || some(sheet.abilities) || some(sheet.skills) || some(sheet.proficiencies),
    // `actions` is what the corpus writes now; `attacks` is the key a row
    // written before it holds, and it still draws.
    actions: some(sheet.actions) || some(sheet.attacks),
    magic:
      slotRows(sheet).length > 0 ||
      (spellcasting !== undefined &&
        (some(spellcasting.known) ||
          written(spellcasting.ability) ||
          written(spellcasting.save) ||
          written(spellcasting.attack))),
    features: some(sheet.traits),
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

  return { ...sections, empty: !Object.values(sections).some(Boolean) };
};

/** The drawn sections, in the delivery's order — what the spine lists. */
export const drawnSections = (
  sheet: CharacterSheet,
  writable = false,
): ReadonlyArray<SheetSectionSpec> => {
  const drawn = sheetSections(sheet, writable);
  return SHEET_SECTIONS.filter((section) => drawn[section.id]);
};

/**
 * Which section the reader is looking at — the spine's scroll-spy, as
 * arithmetic over positions the screen measured.
 *
 * The last section whose top has scrolled up past the reading line is the
 * active one; `slack` is how far below the top edge that line sits, so a
 * section becomes active a little before it reaches the edge rather than a
 * little after. Two edges the plain rule gets wrong, both decided here:
 *
 * - **At the very top nothing has passed the line yet**, and the answer is the
 *   first section rather than none — a spine with nothing lit reads as broken.
 * - **At the very bottom the last section may never reach the line** when it is
 *   shorter than the viewport, so `atEnd` hands it the marker: a reader who has
 *   scrolled as far as the sheet goes is reading the last thing on it.
 *
 * Pure, because the browser half — `offsetTop`, `scrollTop`, a sticky rail's
 * height — is exactly the part jsdom cannot see, and the decisions are the part
 * that is wrong silently.
 */
export const sectionInView = <Id extends string>(
  tops: ReadonlyArray<{ readonly id: Id; readonly top: number }>,
  scrollTop: number,
  slack: number,
  atEnd: boolean,
): Id | undefined => {
  const first = tops[0];
  if (first === undefined) return undefined;
  if (atEnd) return tops[tops.length - 1]?.id ?? first.id;
  let active = first.id;
  for (const section of tops) {
    if (section.top <= scrollTop + slack) active = section.id;
  }
  return active;
};

/**
 * The line under *Your characters*: who is reading, and then what is true.
 *
 * **The delivery's *"Ilse Vantar · playing in 2 campaigns"*, with the half that
 * is real.** The name is now real: `GET /me` answers who the credential belongs
 * to, which is the one thing every other `/me` read declines to say, and
 * `load.ts` asks for it in the round it was already making. The number stays
 * counted rather than copied — *campaigns played in* is not *tables sat at*, and
 * `tableCount` is the one that makes an empty roster legible, so the two are
 * kept apart instead of collapsed into the drawn phrase.
 *
 * The name leads and is never punctuated into nothing: `AccountIdentity.name` is
 * `not null` at the column and defaults to `DEFAULT_ACCOUNT_NAME` when the
 * identity provider offered none, so there is no absent case to design for —
 * only a name we do not yet know, which is that default's own business.
 */
export const rosterSummary = (
  characters: ReadonlyArray<OwnedCharacter>,
  tableCount: number,
  accountName: string,
): string => {
  // The tables a character is *seated* at — one shared character can sit at
  // several, and a character between tables sits at none, so this counts
  // distinct seat campaigns rather than characters.
  const tables = new Set(characters.flatMap((row) => row.seats.map((seat) => seat.campaignId)))
    .size;
  const plural = (count: number, one: string, many: string) =>
    `${String(count)} ${count === 1 ? one : many}`;

  const counted =
    characters.length === 0
      ? tableCount === 0
        ? "not at a table yet."
        : `no characters yet, at ${plural(tableCount, "table", "tables")}.`
      : tables === 0
        ? // Characters outlive tables now: a retired seat keeps the character,
          // so "N characters, at 0 tables" is a real state and gets a sentence
          // rather than an arithmetic oddity.
          `${plural(characters.length, "character", "characters")}, none seated at a table.`
        : `${plural(characters.length, "character", "characters")}, at ${plural(tables, "table", "tables")}.`;

  return `${accountName} · ${counted}`;
};
