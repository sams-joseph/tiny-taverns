import type {
  AbilityIncrease,
  BackgroundBody,
  CharacterOption,
  ClassBody,
  OptionKind,
  SpeciesBody,
} from "@taverns/api";
import { ABILITY_KEYS, type AbilityKey } from "@taverns/api";

/**
 * **What a class, species or background form holds, and what it becomes** — the
 * pure half of both authoring surfaces over `character_option`.
 *
 * Its own file, and separately tested, for the reason `option.ts`,
 * `chronicle/fight.ts` and `characters/sheet.ts` are: everything decided here
 * is wrong *silently*. A hit die read off the wrong half of a draft is still a
 * number, a summary sent as `""` rather than omitted is still a document the
 * schema accepts, and a `+0` increase written as a row still renders.
 *
 * ### There are two shells over it, and that is why it is a file
 *
 * `OptionDialog` writes a campaign's vocabulary — authoring into the Library
 * and copying in, in one `submit`, plus the visibility switch a copy has and an
 * original does not. `OptionForm` writes the Library original itself, with a
 * delete beside it and no visibility anywhere. **They are two shells around one
 * editor**, the shape `characters/AbilityFields.tsx` already has: a second
 * implementation of *what a hit die is* would disagree first about the thing
 * nobody looks at — whether an untouched summary is an absent key, or whether
 * a background box holding `0` becomes a row.
 *
 * What is deliberately **not** here is `visibility`. It is on `OptionUpdate`
 * and on `OptionDerive` and on neither of the Library payloads, because a row's
 * visibility says which of a *campaign's* players may read it and an original
 * is in no campaign. So it is the campaign shell's own state, held beside a
 * draft rather than inside one.
 */

/** All three match `CharacterOption.ts`'s own checks, so the sentence beats the schema to it. */
export const MAX_HIT_DIE = 100;
export const MAX_HP_PER_LEVEL = 20;
export const MAX_INCREASE = 10;

/** What each kind is called in a sentence — one map, so the three agree. */
export const NOUN: Record<OptionKind, string> = {
  class: "class",
  species: "species",
  background: "background",
};

/** What the form holds, before any of it is a payload. */
export interface OptionDraft {
  readonly name: string;
  readonly summary: string;
  /** A number of faces: `"10"` for a d10. Class only. */
  readonly hitDie: string;
  /** Which ability modifiers are added to 10 unarmoured. Class only. */
  readonly unarmouredAc: ReadonlyArray<AbilityKey>;
  /** Extra hit points per level. Species only. */
  readonly hpPerLevel: string;
  /**
   * What this background adds to each ability, as the six boxes hold it —
   * `""` and `"0"` both meaning *nothing*. Background only.
   *
   * Six boxes keyed by ability rather than a list of rows, because that is what
   * the control is: every ability is always offered and most of them are
   * empty, exactly as the unarmoured-armour-class checkboxes are. It becomes a
   * **list** on the way out ({@link documentOf}), which is what
   * `BackgroundBody` stores — a record with four zeroes in it would say four
   * things nobody wrote.
   */
  readonly increases: Readonly<Record<AbilityKey, string>>;
}

/** Six empty boxes — what a background that grants nothing looks like. */
const NO_INCREASES: Record<AbilityKey, string> = {
  STR: "",
  DEX: "",
  CON: "",
  INT: "",
  WIS: "",
  CHA: "",
};

/** The stored list, back as the six boxes. Anything not named is blank. */
const boxesFrom = (increases: ReadonlyArray<AbilityIncrease>): Record<AbilityKey, string> => {
  const boxes = { ...NO_INCREASES };
  for (const increase of increases) boxes[increase.ability] = String(increase.amount);
  return boxes;
};

/**
 * The form's starting state.
 *
 * It takes no `kind` and does not need one: an empty draft carries a plausible
 * default for **all three** parts and a form draws only the one its `kind` prop
 * names, and an existing row's `kind` is on the row. That is the union earning
 * its place — there is no state in which the wrong part could be read as the
 * right one, because the row says which it is.
 */
export const draftFrom = (option: CharacterOption | undefined): OptionDraft => {
  if (option === undefined) {
    return {
      name: "",
      summary: "",
      hitDie: "8",
      // The ten-of-twelve answer, and the one a homebrew class most often
      // wants. The two exceptions are a press away.
      unarmouredAc: ["DEX"],
      hpPerLevel: "0",
      // Blank rather than six zeroes, and the difference is the sentence the
      // card ends up drawing: nothing typed is *nobody has said*, which is what
      // an empty `abilityIncreases` means.
      increases: NO_INCREASES,
    };
  }
  return {
    name: option.name,
    summary: option.body.summary ?? "",
    hitDie: option.kind === "class" ? String(option.body.hitDie) : "8",
    unarmouredAc: option.kind === "class" ? [...option.body.unarmouredAc] : ["DEX"],
    hpPerLevel: option.kind === "species" ? String(option.body.hpPerLevel) : "0",
    increases:
      option.kind === "background" ? boxesFrom(option.body.abilityIncreases) : NO_INCREASES,
  };
};

/** `""` ⇄ not a number. A blank die is a form that is not finished. */
const parseWhole = (raw: string): number | undefined =>
  raw.trim() !== "" && Number.isInteger(Number(raw)) ? Number(raw) : undefined;

export interface DraftProblems {
  readonly name?: string;
  readonly hitDie?: string;
  readonly hpPerLevel?: string;
  readonly increases?: string;
}

/**
 * What the author is told before anything is sent.
 *
 * The contract catches all of it on its own — the derived client encodes
 * through the same schema the handler decodes with, so a bad payload fails
 * locally and never reaches the network. But `Expected a value between 1 and
 * 100 at ["body"]["hitDie"]` is a sentence for whoever wrote the schema, so
 * these come first and `SaveFailure` is the backstop.
 */
export const problemsIn = (kind: OptionKind, draft: OptionDraft): DraftProblems => {
  const problems: {
    name?: string;
    hitDie?: string;
    hpPerLevel?: string;
    increases?: string;
  } = {};
  if (draft.name.trim() === "") problems.name = "Give it a name.";

  if (kind === "class") {
    const die = parseWhole(draft.hitDie);
    if (die === undefined) problems.hitDie = "A hit die is a whole number of faces.";
    else if (die < 1 || die > MAX_HIT_DIE) {
      problems.hitDie = `Between 1 and ${String(MAX_HIT_DIE)}.`;
    }
  } else if (kind === "species") {
    const hp = parseWhole(draft.hpPerLevel);
    if (hp === undefined) problems.hpPerLevel = "Hit points per level are a whole number.";
    else if (hp < 0 || hp > MAX_HP_PER_LEVEL) {
      problems.hpPerLevel = `Between 0 and ${String(MAX_HP_PER_LEVEL)}.`;
    }
  } else {
    // **Blank is not a problem, and that is the whole rule of these six boxes**
    // — an empty one is an ability this background does not touch, which is
    // most of them. Only something typed that is not a usable number is.
    const bad = ABILITY_KEYS.filter((ability) => {
      const raw = draft.increases[ability].trim();
      if (raw === "") return false;
      const amount = parseWhole(raw);
      return amount === undefined || amount < 0 || amount > MAX_INCREASE;
    });
    if (bad.length > 0) {
      problems.increases = `An increase is a whole number, 0 to ${String(MAX_INCREASE)}.`;
    }
  }
  return problems;
};

/** Whether anything above would stop a save. */
export const refuses = (problems: DraftProblems): boolean => Object.keys(problems).length > 0;

/** The six boxes as the list `BackgroundBody` stores. */
export const increasesFrom = (draft: OptionDraft): ReadonlyArray<AbilityIncrease> =>
  ABILITY_KEYS.flatMap((ability) => {
    const amount = parseWhole(draft.increases[ability]);
    return amount === undefined || amount < 1 ? [] : [{ ability, amount }];
  });

/**
 * The draft as the part of a document its `kind` names, **paired with that
 * kind** rather than returned bare.
 *
 * The pair is what makes both shells' writes cast-free: `OptionLibraryCreate`
 * is a union discriminated on `kind`, so a bare `ClassBody | SpeciesBody |
 * BackgroundBody` beside a `kind` the compiler cannot relate it to would need
 * an assertion at every call site — which is exactly what a discriminated union
 * exists to avoid.
 */
export type WrittenOption =
  | { readonly kind: "class"; readonly body: ClassBody }
  | { readonly kind: "species"; readonly body: SpeciesBody }
  | { readonly kind: "background"; readonly body: BackgroundBody };

export const documentOf = (kind: OptionKind, draft: OptionDraft): WrittenOption => {
  const summary = draft.summary.trim();
  // Omitted rather than `""`, which is `CharacterOption.ts`'s own rule about an
  // optional key: an empty summary is *nobody wrote one*, and a blank string
  // stored in the document would render as an empty paragraph on the card.
  const said = summary === "" ? {} : { summary };
  switch (kind) {
    case "class":
      return {
        kind: "class",
        body: { hitDie: parseWhole(draft.hitDie) ?? 8, unarmouredAc: draft.unarmouredAc, ...said },
      };
    case "species":
      return { kind: "species", body: { hpPerLevel: parseWhole(draft.hpPerLevel) ?? 0, ...said } };
    case "background":
      return {
        kind: "background",
        // Six boxes become a list of what was actually said. A box left blank
        // and a box holding `0` are the same thing — an ability this
        // background does not touch — and neither becomes a row, because
        // `AbilityIncrease.amount` starts at 1 and a `+0` row would say
        // something nobody wrote. In `ABILITY_KEYS` order, so `+2 STR, +1 CON`
        // reads the same however it was typed.
        body: { abilityIncreases: increasesFrom(draft), ...said },
      };
  }
};
