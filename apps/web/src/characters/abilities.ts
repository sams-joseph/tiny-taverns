import type { Ability } from "@taverns/api";
import { ABILITY_KEYS, modifierFor, signed } from "@taverns/api";

/**
 * The six cells, the arithmetic under them, and the dice — **the pure half of
 * the abilities editor.**
 *
 * Separately tested for the reason `chronicle/fight.ts` and `live.ts` are: every
 * decision here is wrong *silently*. A modifier that disagrees with the score
 * beside it renders perfectly well, a `4d6` that is really `8 + random × 9`
 * produces plausible numbers, and a swap that drops a score leaves a sheet that
 * still draws six cells.
 *
 * ### Where the dice live, and why they are here rather than on the server
 *
 * **The RNG is the browser's, by a decision already written down.**
 * `run/RunScreen.tsx` rolls a d20 for every monster in one submit and says why:
 * *"there is no roll endpoint and there should not be — a roll is not durable
 * state, only the number it produced is"*. Six 4d6-drop-lowest rolls are the
 * same shape as that d20 and are the player's own character at their own DM's
 * table, so there is nothing adversarial for a server to arbitrate. The numbers
 * become `sheet.abilities` through the ordinary `PATCH /me/characters/:id` and
 * are not distinguishable afterwards from six typed by hand — which is correct,
 * because they are not.
 *
 * ### The modifier is derived here and stored there
 *
 * `Ability.score` and `Ability.modifier` are **both `NonEmptyString`**
 * (`Creature.ts`): *"a stat block is a document, so it keeps what was written
 * rather than what can be recomputed."* That is why the modifier is a stored
 * value and not something the reader works out — and it is exactly why an
 * *editor* has to compute it, because the one thing the document cannot survive
 * is the two disagreeing. Everywhere a score is written here the modifier is
 * written with it, in the same object literal, so there is no path that moves
 * one without the other.
 */

/**
 * The six, in the order every sheet in the product draws them.
 *
 * `packages/api/src/Ruleset.ts`'s list, re-exported under this file's own name
 * rather than copied. It was written out here and again in
 * `apps/server/src/assistant/toolkit.ts`, which is two chances for a
 * reordering to reach one and not the other — and the seed reads two of the six
 * by name, so a third copy would have been three.
 */
export const ABILITY_LABELS = ABILITY_KEYS;

/**
 * The default, and it is the default because the drawing says so.
 *
 * `CharacterCreate.jsx:157` opens on the standard array and makes rolling an
 * explicit second action — *"Standard array, assigned to fit the description.
 * Roll again for 4d6-drop-lowest"*. A sheet that generated random numbers the
 * moment it was opened would be the one control in this product that changes
 * the document without being asked.
 */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/**
 * `+4`, `-1`, `+0`, and `⌊(score − 10) / 2⌋` signed — **`Ruleset`'s, re-exported
 * rather than restated.**
 *
 * The one implementation, and it has to be one: the seed reads a modifier back
 * out of the document this editor wrote, so an editor that signed differently
 * from the reader would produce a hit point total nobody could account for.
 */
export { modifierFor, signed };

/** A fair d6. Injectable so the roll can be measured rather than hoped at. */
export type Die = () => number;

const d6: Die = () => 1 + Math.floor(Math.random() * 6);

/**
 * **4d6, drop the lowest** — the rule the drawing's own toast names and its
 * code does not.
 *
 * `CharacterCreate.jsx:73-77` is `8 + floor(random() × 9)`, a flat 8–16, under a
 * toast reading *"4d6 drop lowest, six times."* The toast is the intent and the
 * prototype is a stub; this is the rule. The distributions are not close — a
 * flat 8–16 cannot produce a 17 or an 18 at all, and rolls a 3 exactly as often
 * as a 13.
 */
export const roll4d6DropLowest = (die: Die = d6): number => {
  const dice = [die(), die(), die(), die()].sort((a, b) => a - b);
  return dice.slice(1).reduce((total, face) => total + face, 0);
};

/** Six of them, in the order the six cells are drawn. */
export const rollAbilityScores = (die: Die = d6): ReadonlyArray<number> =>
  ABILITY_LABELS.map(() => roll4d6DropLowest(die));

/**
 * One cell as it is being edited: the score may still be blank, which the wire
 * refuses.
 *
 * `save` is kept as typed and is deliberately **not** derived. It is the saving
 * throw, which is the modifier *plus a proficiency this document does not
 * model* — deriving it would mean inventing the proficiency bonus and whether
 * this ability has it, and getting either wrong writes a wrong number into a
 * column a player reads out at the table. So the score's arithmetic is done and
 * the save's is not, and the difference is that one has a right answer here.
 */
export interface AbilityDraft {
  readonly label: string;
  readonly score: string;
  readonly save: string;
  readonly proficient: boolean;
  /** Whether the label is one of the six, or something already in the document. */
  readonly extra: boolean;
}

const blank = (label: string, extra: boolean): AbilityDraft => ({
  label,
  score: "",
  save: "",
  proficient: false,
  extra,
});

const of = (ability: Ability, extra: boolean): AbilityDraft => ({
  label: ability.label,
  score: ability.score,
  save: ability.save ?? "",
  proficient: ability.proficient === true,
  extra,
});

/**
 * The rows the dialog opens with: **the six, always, plus anything else the
 * document already holds.**
 *
 * The six are drawn even on a sheet that has none, because that is what the
 * editor is for — a cell that appeared only once it had a value would be a
 * score nobody could type a first time. Anything with a label outside the six
 * is carried through rather than quietly dropped: `Ability.label` is an open
 * string, the document may have been written by the DM's own form, and
 * `sheetWith` guards the *keys* of the sheet while this guards the rows inside
 * one of them.
 */
export const abilityDrafts = (abilities: ReadonlyArray<Ability>): ReadonlyArray<AbilityDraft> => {
  const known = new Set<string>(ABILITY_LABELS);
  const six = ABILITY_LABELS.map((label) => {
    const held = abilities.find((ability) => ability.label === label);
    return held === undefined ? blank(label, false) : of(held, false);
  });
  const rest = abilities.filter((ability) => !known.has(ability.label)).map((a) => of(a, true));
  return [...six, ...rest];
};

/** `""` ⇄ absent. A score is a whole number or it is nothing. */
export const parseScore = (raw: string): number | undefined =>
  raw.trim() === "" || !Number.isInteger(Number(raw)) ? undefined : Number(raw);

export const MIN_SCORE = 1;
export const MAX_SCORE = 30;

/**
 * Two abilities trade scores — **the accessible half of the drawing's drag.**
 *
 * `CharacterCreate.jsx:157` offers *"drag a score onto another ability"*, which
 * is buildable and is the least reachable of the three ways to do this. A select
 * naming the other ability says the same thing to a pointer, a keyboard and a
 * screen reader alike, and it is what makes a rolled set usable: six numbers
 * arrive in the order they were rolled and the player puts them where they want
 * them without having to remember and retype any of them.
 *
 * **Only the score moves.** The saving throw and its proficiency belong to the
 * ability rather than to the number — a paladin proficient in Charisma saves
 * stays proficient in Charisma saves when the 16 goes to Strength — so swapping
 * those with it would silently rewrite two facts nobody asked about.
 */
export const swapScores = (
  drafts: ReadonlyArray<AbilityDraft>,
  from: string,
  to: string,
): ReadonlyArray<AbilityDraft> => {
  const a = drafts.find((draft) => draft.label === from);
  const b = drafts.find((draft) => draft.label === to);
  if (a === undefined || b === undefined || from === to) return drafts;
  return drafts.map((draft) =>
    draft.label === from
      ? { ...draft, score: b.score }
      : draft.label === to
        ? { ...draft, score: a.score }
        : draft,
  );
};

/** A generated set, laid into the rows in the order they are drawn. */
export const assignScores = (
  drafts: ReadonlyArray<AbilityDraft>,
  scores: ReadonlyArray<number>,
): ReadonlyArray<AbilityDraft> => {
  let next = 0;
  return drafts.map((draft) => {
    if (draft.extra) return draft;
    const score = scores[next];
    next += 1;
    return score === undefined ? draft : { ...draft, score: String(score) };
  });
};

/**
 * What goes on the wire — **and a cell with no score is not a cell.**
 *
 * `Ability.score` is a `NonEmptyString`, so a blank row is not expressible; and
 * a blank row is somebody who opened the dialog on an empty sheet and filled in
 * four of the six, which is a real thing to do. Dropping it is the rule
 * `GearDialog` already follows for a line nobody named, and it is what lets a
 * sheet that has never had abilities typed on it be saved back as `[]` rather
 * than as six cells reading nothing.
 */
export const abilitiesFrom = (drafts: ReadonlyArray<AbilityDraft>): ReadonlyArray<Ability> =>
  drafts.flatMap((draft) => {
    const score = parseScore(draft.score);
    if (score === undefined) return [];
    const save = draft.save.trim();
    return [
      {
        label: draft.label,
        score: String(score),
        // Written in the same literal as the score, so there is no path that
        // moves one without the other.
        modifier: modifierFor(score),
        ...(save === "" ? {} : { save }),
        ...(draft.proficient ? { proficient: true } : {}),
      },
    ];
  });

/**
 * The cells whose score is neither blank nor a whole number in range — **the
 * one thing said before a set of scores is accepted anywhere.**
 *
 * Pure and here rather than in either dialog because there are two surfaces
 * over these six cells now (the sheet's editor and the create form's), and a
 * rule about what a score may be that each of them spelled for itself would be
 * two rules the day one of them was corrected.
 *
 * **A blank score is not in it.** It is a cell nobody has filled in, which is
 * what lets four of the six be set — and on the create form it is what lets a
 * player get in and fix it later, which is the whole reason ability scores are
 * not required there.
 */
export const badScores = (drafts: ReadonlyArray<AbilityDraft>): ReadonlyArray<AbilityDraft> =>
  drafts.filter((draft) => {
    if (draft.score.trim() === "") return false;
    const score = parseScore(draft.score);
    return score === undefined || score < MIN_SCORE || score > MAX_SCORE;
  });

/**
 * The six as one line — `"STR 15 · DEX 14 · CON 13"` — or **nothing at all when
 * nobody has typed one.**
 *
 * The create form draws its scores behind the same dialog the sheet does, so
 * this is what it shows in the dialog's place. `undefined` rather than a
 * placeholder because the two states are genuinely different sentences: *these
 * are the scores* and *there are none yet, and the two numbers below are
 * therefore a bare 10 and the die*.
 *
 * Only cells that carry a score are named, in the order they are drawn, so it
 * says exactly what {@link abilitiesFrom} would send and never implies a value
 * for a cell that was skipped.
 */
export const abilitySummary = (drafts: ReadonlyArray<AbilityDraft>): string | undefined => {
  const set = drafts.filter((draft) => parseScore(draft.score) !== undefined);
  return set.length === 0
    ? undefined
    : set.map((draft) => `${draft.label} ${draft.score.trim()}`).join(" · ");
};
