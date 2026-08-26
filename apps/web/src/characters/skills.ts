import type { Skill } from "@taverns/api";

/**
 * The skill list, and which ability each one keys off — **the pure half of the
 * skills editor**, tested on its own for the reason `abilities.ts` is.
 *
 * ### The eighteen are a vocabulary, not a schema
 *
 * `Skill.name` is an open `NonEmptyString` and `Skill.ability` an optional
 * string, so nothing on the wire knows there are eighteen of anything. What the
 * list buys is that a player picking *Sleight of Hand* gets the same spelling
 * and the same keyed ability as every other player picking it, which is what
 * makes the column under the name mean something. A row already in the document
 * with a name outside the list is kept and drawn beside them — the same rule
 * `abilityDrafts` follows for a seventh ability cell.
 *
 * ### There is no *four of four*, and that is the departure
 *
 * `CharacterCreate.jsx:162` counts *"N of 4 picked"* and refuses a fifth, which
 * is right for the moment a class hands out its proficiencies and wrong for
 * every moment after it: a background grants two more, a feat grants two, an
 * expertise doubles one. This editor is the sheet's, so it counts what is
 * proficient and refuses nothing. A creation screen that wants the limit can
 * hold it itself; a sheet that held it would tell a level-9 rogue their sheet
 * is wrong.
 */

/** `[skill, the ability it keys off]`, in the order the sheet draws them. */
export const STANDARD_SKILLS: ReadonlyArray<readonly [string, string]> = [
  ["Acrobatics", "DEX"],
  ["Animal Handling", "WIS"],
  ["Arcana", "INT"],
  ["Athletics", "STR"],
  ["Deception", "CHA"],
  ["History", "INT"],
  ["Insight", "WIS"],
  ["Intimidation", "CHA"],
  ["Investigation", "INT"],
  ["Medicine", "WIS"],
  ["Nature", "INT"],
  ["Perception", "WIS"],
  ["Performance", "CHA"],
  ["Persuasion", "CHA"],
  ["Religion", "INT"],
  ["Sleight of Hand", "DEX"],
  ["Stealth", "DEX"],
  ["Survival", "WIS"],
];

/** One row as it is being edited. `bonus` is free text — it is stored, not derived. */
export interface SkillDraft {
  readonly name: string;
  /** The keyed ability: the document's if it has one, otherwise the list's. */
  readonly ability: string;
  /** `"+7"`, pre-signed and typed by hand — see `abilities.ts` on the saving throw. */
  readonly bonus: string;
  readonly proficient: boolean;
  /** Whether this row came from the document rather than from the list. */
  readonly extra: boolean;
}

/**
 * The rows the dialog opens with: the eighteen, plus anything else already
 * written.
 *
 * The keyed ability is **the document's where it has one**. The list is a
 * default for a row nobody has written, not a correction to one somebody has —
 * a DM running a variant where Intimidation keys off Strength typed that, and an
 * editor that quietly put it back would be arguing with the table.
 */
export const skillDrafts = (skills: ReadonlyArray<Skill>): ReadonlyArray<SkillDraft> => {
  const named = new Set(STANDARD_SKILLS.map(([name]) => name));
  const of = (name: string, ability: string, extra: boolean): SkillDraft => {
    const held = skills.find((skill) => skill.name === name);
    return {
      name,
      ability: held?.ability ?? ability,
      bonus: held?.bonus ?? "",
      proficient: held?.proficient === true,
      extra,
    };
  };

  return [
    ...STANDARD_SKILLS.map(([name, ability]) => of(name, ability, false)),
    ...skills
      .filter((skill) => !named.has(skill.name))
      .map((skill) => of(skill.name, skill.ability ?? "", true)),
  ];
};

/**
 * What goes on the wire — **a row is written when there is something to say
 * about it.**
 *
 * Proficient, or a bonus typed: either is a fact. Neither is the state every one
 * of the eighteen is in on a sheet nobody has touched, and writing all eighteen
 * would fill the Skills panel with a list of things this character is *not* good
 * at — the same reason an absent coin pile is absent rather than a nought.
 *
 * A non-proficient row **with** a bonus survives, which is not an edge case: it
 * is how a sheet records the number you add anyway, and the shipped reader
 * already draws exactly that row in muted type.
 */
export const skillsFrom = (drafts: ReadonlyArray<SkillDraft>): ReadonlyArray<Skill> =>
  drafts.flatMap((draft) => {
    const bonus = draft.bonus.trim();
    if (!draft.proficient && bonus === "") return [];
    const ability = draft.ability.trim();
    return [
      {
        name: draft.name,
        ...(ability === "" ? {} : { ability }),
        ...(bonus === "" ? {} : { bonus }),
        ...(draft.proficient ? { proficient: true } : {}),
      },
    ];
  });
