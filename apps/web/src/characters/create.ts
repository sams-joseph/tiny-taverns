import type { CampaignMembership, CharacterOwnCreate, CharacterSheet } from "@taverns/api";
import { emptyCharacterSheet } from "@taverns/api";

/**
 * The two decisions the create form makes that are not rendering — **which
 * tables a character of your own may go into, and what the payload says.**
 *
 * Both are here rather than in the screen for the reason `chronicle/fight.ts`
 * and `characters/live.ts` are separate files: each has a branch that renders
 * perfectly plausible output when it is wrong. A picker offering the wrong
 * table looks like a picker; a payload sending `""` where it means *absent*
 * looks like a save. Neither fails loudly, so both are pinned by
 * `create.test.ts`.
 */

/** All three match `Character.ts`'s own checks, so the sentence beats the schema to it. */
export const MAX_AC = 40;
export const MAX_HP = 10_000;
export const MAX_LEVEL = 100;

/**
 * The tables a player may write a character of their own into.
 *
 * **`role === "player"` and nothing else**, which is the mode rather than the
 * endpoint talking. `ensureCampaignReadable` would let a DM through at their own
 * table — `isDm` is a disjunct of `campaignReadable` — and the server documents
 * that as harmless. It is still not what this control is for: the pill is a
 * *mode*, so a table you run has no player screen to be on, and offering one
 * here would put a character of your own at a table where the way to write one
 * is `campaign/CharacterDialog.tsx`.
 *
 * An archived table is already absent, because `GET /me/campaigns` is the live
 * shelf and `repo/Memberships.ts` is the one place that clause is written.
 */
export const tablesForNewCharacter = (
  memberships: ReadonlyArray<CampaignMembership>,
): ReadonlyArray<CampaignMembership> =>
  memberships.filter((membership) => membership.role === "player");

/** `""` ⇄ absent. A blank number field is "I have not filled this in". */
const parseOptional = (raw: string): number | null | undefined =>
  raw.trim() === "" ? null : Number.isInteger(Number(raw)) ? Number(raw) : undefined;

/** The same rule the schema applies, said in a sentence first. */
const isWebUrl = (raw: string): boolean => /^https?:\/\//i.test(raw);

/** What the form holds, before any of it is a payload. */
export interface CharacterDraft {
  readonly name: string;
  readonly playerName: string;
  readonly level: string;
  readonly species: string;
  readonly className: string;
  readonly ac: string;
  readonly hpMax: string;
  readonly sheetUrl: string;
  readonly notes: string;
}

export const emptyDraft: CharacterDraft = {
  name: "",
  playerName: "",
  level: "",
  species: "",
  className: "",
  ac: "",
  hpMax: "",
  sheetUrl: "",
  notes: "",
};

/**
 * What the player is told before anything is sent.
 *
 * The contract catches all of it on its own — the derived client encodes
 * through the same schema the handler decodes with, so a bad payload fails
 * locally and never reaches the network. But `Expected a value between 0 and 40
 * at ["ac"]` is a sentence for whoever wrote the schema, so these come first and
 * `SaveFailure` is the backstop. `CharacterDialog` states the same rule for the
 * DM's form; the numbers are shared with it through `Character.ts`'s checks
 * rather than through this file.
 */
export interface DraftProblems {
  readonly name?: string;
  readonly level?: string;
  readonly ac?: string;
  readonly hpMax?: string;
  readonly sheetUrl?: string;
}

export const problemsIn = (draft: CharacterDraft): DraftProblems => {
  const problems: {
    name?: string;
    level?: string;
    ac?: string;
    hpMax?: string;
    sheetUrl?: string;
  } = {};
  const level = parseOptional(draft.level);
  const ac = parseOptional(draft.ac);
  const hpMax = parseOptional(draft.hpMax);

  if (draft.name.trim() === "") problems.name = "Give them a name.";
  if (level === undefined) problems.level = "A level is a whole number.";
  else if (level !== null && (level < 1 || level > MAX_LEVEL)) {
    problems.level = `Between 1 and ${String(MAX_LEVEL)}.`;
  }
  if (ac === undefined) problems.ac = "An armour class is a whole number.";
  else if (ac !== null && (ac < 0 || ac > MAX_AC)) problems.ac = `Between 0 and ${String(MAX_AC)}.`;
  if (hpMax === undefined) problems.hpMax = "Hit points are a whole number.";
  else if (hpMax !== null && (hpMax < 0 || hpMax > MAX_HP)) {
    problems.hpMax = `Between 0 and ${MAX_HP.toLocaleString("en")}.`;
  }
  if (draft.sheetUrl.trim() !== "" && !isWebUrl(draft.sheetUrl.trim())) {
    // The schema refuses anything else, and this is why: the link is rendered as
    // an `href`, and a `javascript:` URL in one is how a text column becomes an
    // exploit.
    problems.sheetUrl = "A link starting http:// or https://.";
  }
  return problems;
};

export const refused = (problems: DraftProblems): boolean => Object.keys(problems).length > 0;

/**
 * The draft as `CharacterOwnCreate` — **omission, never a null and never a
 * blank string.**
 *
 * Every optional field on the create payload is optional-by-omission (there is
 * no `Schema.NullOr` on any of them, unlike the update), so a character with no
 * class named simply does not say so, exactly as an unrated encounter omits its
 * difficulty rather than sending one. Sending `""` would be worse than either:
 * `species` and `className` are `NonEmptyString`, so the contract refuses them
 * locally and the form fails on a field the player deliberately left blank.
 *
 * `sheet` goes the same way. `notes` is the one key this form writes, and an
 * empty one means *send no document at all* so the column default decides —
 * which is what keeps a brand new character's `body` the same shape as one the
 * DM typed.
 *
 * **There is nothing here for the live trio, `visibility` or `accountId`**, and
 * that is not a filter this function applies: `CharacterOwnCreate` has no field
 * for any of them, so a control for one would not compile. The row comes out
 * `dm` and unhurt because those are the columns' defaults.
 */
export const payloadFrom = (draft: CharacterDraft): CharacterOwnCreate => {
  const level = parseOptional(draft.level);
  const ac = parseOptional(draft.ac);
  const hpMax = parseOptional(draft.hpMax);
  const playerName = draft.playerName.trim();
  const species = draft.species.trim();
  const className = draft.className.trim();
  const sheetUrl = draft.sheetUrl.trim();
  const notes = draft.notes.trim();
  const sheet: CharacterSheet = { ...emptyCharacterSheet, notes };

  return {
    name: draft.name.trim(),
    ...(playerName === "" ? {} : { playerName }),
    ...(level === null || level === undefined ? {} : { level }),
    ...(species === "" ? {} : { species }),
    ...(className === "" ? {} : { className }),
    ...(ac === null || ac === undefined ? {} : { ac }),
    ...(hpMax === null || hpMax === undefined ? {} : { hpMax }),
    ...(sheetUrl === "" ? {} : { sheetUrl }),
    ...(notes === "" ? {} : { sheet }),
  };
};
