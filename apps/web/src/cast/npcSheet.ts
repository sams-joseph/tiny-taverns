import {
  type CampaignId,
  type ChallengeRating,
  type CharacterOption,
  creatureXp,
  type NpcId,
  type NpcSheet,
  type NpcSheetPut,
  type NpcSheetSummary,
  type NpcSheetUpdate,
  type NpcSpellbook,
  type SheetBody,
  asRaceOption,
  optionNamed,
  startingSheetBody,
  subraceNamed,
  type StatBlockSheet,
} from "@taverns/api";
import type { Effect } from "effect";
import type { AsyncResult, Atom } from "effect/unstable/reactivity";
import type { HttpClient } from "effect/unstable/http";
import { reads, type Invalidation } from "../api/keys";
import type { TavernsClient } from "../api/client";
import type { BestiaryScope } from "../campaign/CreaturePicker";
import { badScores } from "../characters/abilities";
import {
  type CharacterDraft,
  emptyDraft,
  identityNumberProblems,
  parseOptional,
  seededDraft,
  startingSourcesOf,
  withKitDefaults,
} from "../characters/create";
import { campaignOptionsAtom, coreOptionsAtom } from "../rules/load";
import type { SheetTarget } from "../characters/sheetTarget";
import { librarySheetSpellsAtom } from "./libraryLoad";
import { npcSheetSpellsAtom } from "./load";

/**
 * An NPC's sheet as the Cast draws and writes it — the drawer's one line, the
 * Stats header's challenge line, and the identity dialog's payloads — in one
 * place, so the drawer and the Stats tab cannot disagree about a word.
 *
 * Nothing here guesses: a column nobody set draws no part, and the descriptor
 * is the server's generated column, never assembled here.
 */

/**
 * *"Level 5 Human Fighter · AC 17 · HP 44 · CR 3"* — the drawer's line, from
 * the columns alone, because the shelf read carries no document. A sheet
 * whose columns are all blank still exists, and says so rather than drawing
 * nothing.
 */
export const sheetSummaryLine = (sheet: NpcSheetSummary): string => {
  const parts = [
    sheet.descriptor,
    sheet.ac === null ? null : `AC ${String(sheet.ac)}`,
    sheet.hpMax === null ? null : `HP ${String(sheet.hpMax)}`,
    sheet.cr === null ? null : `CR ${sheet.cr}`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? "A sheet with nothing on it yet" : parts.join(" · ");
};

/**
 * *"CR 3 · 700 XP"*. The rating is closed to the ones the XP table knows
 * (`ChallengeRating`), so it always has XP; the XP is `creatureXp`'s, the one
 * table the difficulty meter reads.
 */
export const challengeLine = (cr: ChallengeRating): string => {
  const xp = creatureXp({ cr, statBlockXp: null });
  return xp === null ? `CR ${cr}` : `CR ${cr} · ${xp.toLocaleString("en")} XP`;
};

/**
 * *"AC 17 · HP 58 · CR 3 · 700 XP"*, then what else the stat block brings —
 * the confirm step of *Start from a bestiary NPC*, so the DM sees what is
 * about to be written before it is.
 */
export const bestiaryStartLines = (
  started: StatBlockSheet,
): { readonly numbers: string; readonly contents: string } => {
  const numbers = [
    `AC ${String(started.ac)}`,
    `HP ${String(started.hpMax)}`,
    ...(started.cr === null ? [] : [challengeLine(started.cr)]),
  ].join(" · ");
  const count = (n: number, one: string, many: string) =>
    n === 0 ? [] : [`${String(n)} ${n === 1 ? one : many}`];
  const sheet = started.sheet;
  const contents = [
    ...(sheet.abilities.length === 0 ? [] : ["Abilities"]),
    ...count(sheet.skills?.length ?? 0, "skill", "skills"),
    ...count(sheet.traits.length, "feature", "features"),
    ...count(sheet.actions?.length ?? 0, "action", "actions"),
  ];
  return {
    numbers,
    contents: contents.length === 0 ? "Nothing else is written on it." : contents.join(" · "),
  };
};

/** What the identity dialog's boxes hold, as typed. */
export interface IdentityBoxes {
  readonly level: string;
  readonly race: string;
  readonly subrace: string;
  readonly className: string;
  readonly ac: string;
  readonly hpMax: string;
  /** `""` is *no rating*. */
  readonly cr: ChallengeRating | "";
}

const numberBox = (value: number | null): string => (value === null ? "" : String(value));

/** The boxes filled from the sheet, or all blank for *Write one*. */
export const boxesOf = (sheet: NpcSheet | null): IdentityBoxes =>
  sheet === null
    ? { level: "", race: "", subrace: "", className: "", ac: "", hpMax: "", cr: "" }
    : {
        level: numberBox(sheet.level),
        race: sheet.race ?? "",
        subrace: sheet.subrace ?? "",
        className: sheet.className ?? "",
        ac: numberBox(sheet.ac),
        hpMax: numberBox(sheet.hpMax),
        cr: sheet.cr ?? "",
      };

/** The columns as the boxes say them: a blank box is `null`, never a zero. */
interface Columns {
  readonly level: number | null;
  readonly race: string | null;
  readonly subrace: string | null;
  readonly className: string | null;
  readonly ac: number | null;
  readonly hpMax: number | null;
  readonly cr: ChallengeRating | null;
}

const label = (raw: string): string | null => (raw.trim() === "" ? null : raw.trim());

/** Call only once `identityNumberProblems` has passed the boxes: an unparseable one is `null` here. */
const columnsOf = (boxes: IdentityBoxes): Columns => ({
  level: parseOptional(boxes.level) ?? null,
  race: label(boxes.race),
  subrace: label(boxes.subrace),
  className: label(boxes.className),
  ac: parseOptional(boxes.ac) ?? null,
  hpMax: parseOptional(boxes.hpMax) ?? null,
  cr: boxes.cr === "" ? null : boxes.cr,
});

/** The column default: a sheet with no abilities and no features, and none of the optional keys. */
const BLANK_BODY: SheetBody = { abilities: [], traits: [] };

/**
 * *Write one*: the identity alone over a blank document, the PUT that starts a
 * sheet. It names no `expectedVersion`, because there is no sheet to have
 * read; if one was started meanwhile, the server says so as a `Conflict`.
 */
export const writeOnePayload = (boxes: IdentityBoxes): NpcSheetPut => ({
  ...columnsOf(boxes),
  sheet: BLANK_BODY,
});

/**
 * *Edit identity*: a PATCH of **only the columns that changed**, with the
 * version it read. Only what moved, because a `level` or `className` in the
 * PATCH recomputes the document's derived lines on the server, and a race
 * re-checks its subrace — neither is a reason to send an unchanged box.
 * `undefined` when nothing changed, so the dialog sends nothing.
 */
export const identityPatch = (
  sheet: NpcSheet,
  boxes: IdentityBoxes,
): NpcSheetUpdate | undefined => {
  const next = columnsOf(boxes);
  const changed = (Object.keys(next) as Array<keyof Columns>).filter(
    (key) => next[key] !== sheet[key],
  );
  if (changed.length === 0) return undefined;
  return {
    expectedVersion: sheet.version,
    ...Object.fromEntries(changed.map((key) => [key, next[key]])),
  };
};

/**
 * What *Start from class and level* holds: the new-character form's own draft
 * (`CharacterDraft`), so the pickers, the race's bonuses, the kit picks and the
 * seeded armour class and hit points are the form's helpers over the form's
 * state, and the document is composed by the same `startingSourcesOf` →
 * `startingSheetBody`. The name, player, link, notes and appearance boxes stay
 * blank and unread: an NPC's persona is its own.
 */
export type QuickStartDraft = CharacterDraft;

/**
 * The draft a quick start opens on: the form's blank one, or — rebuilding a
 * sheet — its level and the labels that still name an option here, the kits
 * at side (a), and the armour class and hit points seeded from those. **Not
 * its scores**: the document's are after the race's
 * bonuses, and seeding from them would add the bonuses a second time.
 */
export const quickStartDraft = (
  sheet: NpcSheet | null,
  options: ReadonlyArray<CharacterOption>,
): QuickStartDraft => {
  if (sheet === null) return emptyDraft;
  const known = (kind: CharacterOption["kind"], name: string | null | undefined) =>
    optionNamed(options, kind, name)?.name ?? "";
  const raceOption = asRaceOption(optionNamed(options, "race", sheet.race));
  const draft: QuickStartDraft = {
    ...emptyDraft,
    level: sheet.level === null ? "" : String(sheet.level),
    race: raceOption?.name ?? "",
    subrace: subraceNamed(raceOption?.body, sheet.subrace)?.name ?? "",
    className: known("class", sheet.className),
    background: known("background", sheet.sheet.identity?.background),
  };
  const kits = withKitDefaults(withKitDefaults(draft, options), options, "backgroundKitChoices");
  return seededDraft(kits, new Set(), options);
};

/** What stops a quick start: it needs a class and a level, and the form's own bounds. */
export interface QuickStartProblems {
  readonly className?: string;
  readonly level?: string;
  readonly ac?: string;
  readonly hpMax?: string;
  readonly abilities?: string;
}

export const quickStartProblems = (draft: QuickStartDraft): QuickStartProblems => {
  const problems: {
    className?: string;
    level?: string;
    ac?: string;
    hpMax?: string;
    abilities?: string;
  } = { ...identityNumberProblems(draft) };
  if (draft.className === "") problems.className = "Pick a class.";
  if (problems.level === undefined && draft.level.trim() === "") {
    problems.level = "Give them a level.";
  }
  if (badScores(draft.abilities).length > 0) {
    problems.abilities = "An ability score is a whole number, 1 to 30.";
  }
  return problems;
};

/**
 * *Start from class and level*: the PUT of **a whole sheet composed by the
 * character form's own assembly** (`startingSheetBody`, through the form's
 * `startingSourcesOf`) — every class feature to that level, its proficiency
 * bonus, slots and hit dice, the kits as picked, the race's traits and the
 * background's proficiencies — with the seeded armour class and hit points as
 * the boxes now say them.
 *
 * Over a sheet it is a rebuild: it names the version it read, so a sheet edited
 * meanwhile is a `Conflict` rather than lost, and it keeps the challenge
 * rating, which is the DM's call and nothing a class decides. Call only once
 * `quickStartProblems` has passed the draft.
 */
export const quickStartPayload = (
  draft: QuickStartDraft,
  options: ReadonlyArray<CharacterOption>,
  sheet: NpcSheet | null,
): NpcSheetPut => {
  const { body } = startingSheetBody(startingSourcesOf(draft, options));
  return {
    ...(sheet === null ? {} : { expectedVersion: sheet.version }),
    level: parseOptional(draft.level) ?? null,
    race: label(draft.race),
    subrace: label(draft.subrace),
    className: label(draft.className),
    ac: parseOptional(draft.ac) ?? null,
    hpMax: parseOptional(draft.hpMax) ?? null,
    cr: sheet?.cr ?? null,
    sheet: body,
  };
};

type SheetWrite<A> = Effect.Effect<A, unknown, HttpClient.HttpClient>;

/**
 * Where an NPC's sheet is read and written, so the Stats panel draws one sheet
 * whichever NPC it is: a campaign NPC's through the creator's endpoints, a
 * Library original's through its owner's, under `/library`.
 */
export interface NpcSheetTarget {
  /**
   * Where the NPC lives, which is what *Remove* tells the DM stays: a campaign
   * NPC in its cast with its prep, a Library original on its shelf, with every
   * copy's sheet its own.
   */
  readonly home: "cast" | "library";
  readonly put: (client: TavernsClient, payload: NpcSheetPut) => SheetWrite<NpcSheet>;
  readonly update: (client: TavernsClient, patch: NpcSheetUpdate) => SheetWrite<NpcSheet>;
  readonly remove: (client: TavernsClient) => SheetWrite<void>;
  /**
   * The classes, races and backgrounds a quick start picks from — the rules
   * the NPC's sheet is written against: its campaign's for a campaign NPC,
   * the core rules for a Library original (the rules the server checks it
   * against).
   */
  readonly options: Atom.Atom<AsyncResult.AsyncResult<ReadonlyArray<CharacterOption>, unknown>>;
  /**
   * The bestiary *Start from a bestiary NPC* picks from: the one the NPC's
   * owner reads beside it — a campaign's for a campaign NPC, the owner's
   * Library and the bundle for a Library original.
   */
  readonly bestiary: BestiaryScope;
  /**
   * What every write of the sheet changed: the sheet, and the shelf the
   * one-line summaries read (the drawer's, a Library card's).
   */
  readonly writes: Invalidation;
  /** The spell picker's rules for this sheet, against the rules it is written in. */
  readonly spellbook: Atom.Atom<AsyncResult.AsyncResult<NpcSpellbook, unknown>>;
  /** What the spell picker says when those rules offer no spell. */
  readonly noSpells: string;
}

export const campaignSheetTarget = (campaignId: CampaignId, npcId: NpcId): NpcSheetTarget => {
  const params = { campaignId, npcId };
  return {
    home: "cast",
    put: (client, payload) => client.npcs.putSheet({ params, payload }),
    update: (client, patch) => client.npcs.updateSheet({ params, payload: patch }),
    remove: (client) => client.npcs.removeSheet({ params }),
    options: campaignOptionsAtom(campaignId),
    bestiary: { kind: "campaign", campaignId },
    writes: [reads.npcSheet(npcId), reads.npcSheets(campaignId)],
    spellbook: npcSheetSpellsAtom(params),
    noSpells: "No spells are available for this class and level in this campaign’s rules.",
  };
};

/**
 * A Library original's sheet: the owner's, written against the core rules. A
 * copy into a campaign took the sheet as it stood, so nothing here moves a
 * copy's, and no campaign's shelf is named.
 */
export const librarySheetTarget = (npcId: NpcId): NpcSheetTarget => {
  const params = { npcId };
  return {
    home: "library",
    put: (client, payload) => client.library.putNpcSheet({ params, payload }),
    update: (client, patch) => client.library.updateNpcSheet({ params, payload: patch }),
    remove: (client) => client.library.removeNpcSheet({ params }),
    options: coreOptionsAtom,
    bestiary: { kind: "library" },
    writes: [reads.npcSheet(npcId), reads.libraryNpcSheets],
    spellbook: librarySheetSpellsAtom(npcId),
    noSpells: "No spells are available for this class and level in the core rules.",
  };
};

/**
 * The character sheet's section editors over an NPC's sheet: the same
 * abilities, skills, spells and gear dialogs, each saving the whole document
 * as a PATCH with the version it was read at, so an edit made elsewhere
 * meanwhile is a `Conflict` offered *Reload* rather than lost. A document in
 * the PATCH is kept as sent: the server recomputes derived lines only for a
 * level or class change with no document, which is the identity dialog's.
 */
export const npcSheetEditor = (
  name: string,
  sheet: NpcSheet,
  target: NpcSheetTarget,
): SheetTarget => ({
  name,
  sheet: sheet.sheet,
  save: (client, body) => target.update(client, { expectedVersion: sheet.version, sheet: body }),
  writes: target.writes,
  spellbook: target.spellbook,
  noSpells: target.noSpells,
});
