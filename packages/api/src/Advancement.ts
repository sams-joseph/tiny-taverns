import { Result, Schema } from "effect";
import {
  Character,
  type SheetBody,
  type SheetFeature,
  type Skill,
  type SpellKnown,
} from "./Character.js";
import type { Ability } from "./Creature.js";
import {
  CharacterAdvancementId,
  CharacterId,
  FeatId,
  FeatureId,
  SpellId,
  SubclassId,
} from "./Ids.js";
import {
  type LevelUpChoice,
  type LevelUpHitPoints,
  LevelUpOfferedBy,
  type LevelUpOffer,
  type LevelUpSpellOption,
} from "./LevelUp.js";
import { provenanceFields } from "./Provenance.js";
import { AbilityKey, modifierFor, STANDARD_SKILLS } from "./Ruleset.js";

/**
 * **A level-up** — the write behind the wizard (`POST
 * /me/characters/:id/level-up`) and the record it leaves (`character_advancement`).
 *
 * The owner sends what they chose for the next level, by id, against the
 * offer they read (`LevelUpOffer`); the server re-derives the offer in the
 * same transaction, and {@link levelUpChosen} holds the payload to it and
 * applies it. The record keeps each choice by name as well as by id, so the
 * Log draws it without reading the corpus again. Nothing here carries
 * `origin`: a level-up the owner confirms is `authored`, and only a kept Hob
 * proposal is `assistant`, stamped by the server.
 */

const text = Schema.String;

/**
 * How the level's hit points are found: `fixed`, the die's average rounded
 * up (the default, and the only answer a Hob proposal gives), or `rolled`, a
 * roll of the hit die the server makes at the write and records.
 */
export const LevelUpHitPointMethod = Schema.Literals(["fixed", "rolled"]);
export type LevelUpHitPointMethod = typeof LevelUpHitPointMethod.Type;

/** What a payload that names no method gets. */
export const DEFAULT_HIT_POINT_METHOD: LevelUpHitPointMethod = "fixed";

/** The bound on a level-up's note. */
export const LEVEL_UP_NOTE_MAX = 2000;

/**
 * One answer to a choice the offer asks for, named by the feature that offers
 * it (`LevelUpChoice.offeredBy`): a feature it lists (`featureId`), or one of
 * its words (`value`) — a favored enemy, a terrain, a skill or tool for
 * expertise.
 */
export const LevelUpPick = Schema.Union([
  Schema.Struct({ offeredBy: FeatureId, featureId: FeatureId }),
  Schema.Struct({ offeredBy: FeatureId, value: Schema.NonEmptyString }),
]);
export type LevelUpPick = typeof LevelUpPick.Type;

/** Points onto one score: `{ability: "STR", amount: 2}`, or two of `amount: 1`. */
export const LevelUpAbilityIncrease = Schema.Struct({
  ability: AbilityKey,
  amount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2 })),
});
export type LevelUpAbilityIncrease = typeof LevelUpAbilityIncrease.Type;

/**
 * What the owner chose for one level, against the offer read at
 * `expectedVersion`. Every choice is by id from the offer, except a typed
 * subclass label (which grants nothing, as a typed `identity.subclass`
 * always has) and the words a `text` or `expertise` choice lists.
 */
export const LevelUpPayload = Schema.Struct({
  /** The version the offer was read at; a sheet that moved since is a `Conflict`. */
  expectedVersion: Schema.Int,
  /** The level being reached: always the offer's `toLevel`, one past the row's. */
  toLevel: Schema.Int,
  hitPoints: Schema.optional(LevelUpHitPointMethod),
  /** Required when the offer asks for a subclass and the sheet names none. */
  subclass: Schema.optional(
    Schema.Union([
      Schema.Struct({ subclassId: SubclassId }),
      Schema.Struct({ name: Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(120)) }),
    ]),
  ),
  /** Required when the offer has an ASI: the points, or one of its feats instead. */
  abilityScoreImprovement: Schema.optional(
    Schema.Union([
      Schema.Struct({ increases: Schema.Array(LevelUpAbilityIncrease) }),
      Schema.Struct({ featId: FeatId }),
    ]),
  ),
  /** Exactly as many answers to each choice as it asks for. */
  picks: Schema.optional(Schema.Array(LevelUpPick)),
  /**
   * New spells, up to the counts the offer allows: any left unpicked can be
   * learned later in the spell picker.
   */
  spells: Schema.optional(
    Schema.Struct({
      cantrips: Schema.optional(Schema.Array(SpellId)),
      learned: Schema.optional(Schema.Array(SpellId)),
      /** A known caster swapping one spell it knows for another. */
      replace: Schema.optional(Schema.Struct({ from: SpellId, to: SpellId })),
      magicalSecrets: Schema.optional(Schema.Array(SpellId)),
      mysticArcanum: Schema.optional(SpellId),
    }),
  ),
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(LEVEL_UP_NOTE_MAX))),
});
export type LevelUpPayload = typeof LevelUpPayload.Type;

const named = { spellId: SpellId, name: text, level: Schema.Int };

/**
 * What one level-up chose, as the record keeps it: by id, and by name so the
 * Log draws it without reading the corpus again.
 */
export const AdvancementChoices = Schema.Struct({
  /** The subclass taken at this level: one of the vocabulary's, or a typed label (no id). */
  subclass: Schema.optional(Schema.Struct({ name: text, subclassId: Schema.optional(SubclassId) })),
  /** An ASI's scores, before and after. */
  abilityScores: Schema.optional(
    Schema.Array(Schema.Struct({ ability: AbilityKey, from: Schema.Int, to: Schema.Int })),
  ),
  /** The feat taken in place of an ASI. */
  feat: Schema.optional(Schema.Struct({ featId: FeatId, name: text })),
  picks: Schema.Array(
    Schema.Struct({
      kind: Schema.Literals(["feature", "expertise", "text"]),
      offeredBy: LevelUpOfferedBy,
      /** The feature picked, for a `feature` choice. */
      featureId: Schema.optional(FeatureId),
      name: text,
    }),
  ),
  spells: Schema.Array(
    Schema.Struct({
      ...named,
      kind: Schema.Literals(["cantrip", "learned", "magicalSecrets", "mysticArcanum"]),
    }),
  ),
  /** A known caster's swap: the spell given up and the one learned in its place. */
  replaced: Schema.optional(
    Schema.Struct({ from: Schema.Struct(named), to: Schema.Struct(named) }),
  ),
});
export type AdvancementChoices = typeof AdvancementChoices.Type;

/**
 * One level a character gained through a level-up: the record the Log draws.
 * The owner's read; the deltas the server applied (`AdvancementApplied`) are
 * not on it.
 */
export const CharacterAdvancement = Schema.Struct({
  id: CharacterAdvancementId,
  characterId: CharacterId,
  /** The level reached. */
  level: Schema.Int,
  /** The class it was reached in. */
  className: text,
  hitPoints: Schema.Struct({
    method: LevelUpHitPointMethod,
    /** The die's part: its average rounded up, or what the server rolled. */
    die: Schema.Int,
    /** What was added to the hit point maximum, CON and the race's bonus included. */
    gain: Schema.Int,
  }),
  choices: AdvancementChoices,
  note: Schema.NullOr(text),
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
});
export type CharacterAdvancement = typeof CharacterAdvancement.Type;

/** A level-up's answer: the character at its new level, and the record of how it got there. */
export const CharacterLeveledUp = Schema.Struct({
  character: Character,
  advancement: CharacterAdvancement,
});
export type CharacterLeveledUp = typeof CharacterLeveledUp.Type;

/**
 * **What a level-up changed beyond the level's recompute**, stored beside the
 * record and never on the wire: the exact deltas an undo reverses, so it
 * reverses what was done rather than inferring it.
 */
export const AdvancementApplied = Schema.Struct({
  subclass: Schema.optional(Schema.Struct({ from: Schema.optional(text), to: text })),
  abilities: Schema.Array(
    Schema.Struct({
      label: text,
      score: Schema.Struct({ from: text, to: text }),
      modifier: Schema.Struct({ from: text, to: text }),
    }),
  ),
  /** Features the picks and the feat added, by name. */
  traits: Schema.Array(text),
  /** Skills marked expert, and whether the row was added for it. */
  expertise: Schema.Array(Schema.Struct({ skill: text, added: Schema.Boolean })),
  knownAdded: Schema.Array(SpellId),
  knownRemoved: Schema.Array(
    Schema.Struct({ name: text, spellId: Schema.optional(Schema.NullOr(SpellId)) }),
  ),
  hpMax: Schema.Struct({ from: Schema.NullOr(Schema.Int), to: Schema.NullOr(Schema.Int) }),
});
export type AdvancementApplied = typeof AdvancementApplied.Type;

/** What {@link levelUpChosen} answers for a payload the offer allows. */
export interface LevelUpChosen<Body extends SheetBody> {
  /** The sheet with every choice applied, before the level's recompute. */
  readonly body: Body;
  readonly choices: AdvancementChoices;
  /** `AdvancementApplied` without the hit points, which are the server's to add. */
  readonly applied: Omit<AdvancementApplied, "hpMax">;
  /** The CON modifier before and after: a change moves every level's hit points. */
  readonly constitution: { readonly from: number; readonly to: number };
}

const wanted = (label: string | undefined): string => (label ?? "").trim().toLowerCase();

const prose = (lines: ReadonlyArray<string>): string => lines.join("\n\n");

/** `"Favored Enemy (2 types)"` → `"Favored Enemy"`: the feature's name without its count. */
const bareName = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;

const statedModifier = (cell: Ability | undefined): number | undefined => {
  const value = Number(cell?.modifier.trim());
  return cell !== undefined && Number.isInteger(value) ? value : undefined;
};

const cellOf = (abilities: ReadonlyArray<Ability>, key: string): Ability | undefined =>
  abilities.find((ability) => ability.label.trim().toUpperCase() === key);

/** A choice's picks: a `feature` choice is answered by features, the others by words. */
const answers = (choice: LevelUpChoice, pick: LevelUpPick): boolean =>
  pick.offeredBy === choice.offeredBy.featureId &&
  (choice.kind === "feature" ? "featureId" in pick : "value" in pick);

/**
 * **The one rule for whether a level-up payload is what the offer allows, and
 * what it does to the sheet.** Pure, so the write (`repo/Advancement.ts`) and
 * the web's review cannot disagree.
 *
 * It refuses, with every reason at once:
 *
 * - a level other than the offer's `toLevel`;
 * - a subclass where none is offered, or none where one must be taken;
 * - a choice answered with the wrong count, an option it does not list, an
 *   option whose prerequisites are not met, or the same option twice, and a
 *   pick for a feature that offers nothing at this level;
 * - an ASI where none is offered, none where one is, points that do not add
 *   up, a score past the maximum, or a feat the offer does not list (its
 *   prerequisites unmet, or not in the character's vocabulary);
 * - more spells than the offer allows, a spell it does not list, or a
 *   replacement of something the sheet does not know.
 *
 * Otherwise it applies the choices to the sheet: the subclass label, the
 * scores (each modifier moved while it still states its score), a feature
 * line per pick and for a feat (`derived`, marked as a pick of the feature
 * that offered it, so a level down drops it), expertise marks, and the new
 * known spells. The level's own recompute is the caller's, against the sheet
 * as it was before (`LevelChange.written`), so every number that read a moved
 * score or an expertise mark moves with it.
 */
export const levelUpChosen = <Body extends SheetBody>(
  offer: LevelUpOffer,
  body: Body,
  payload: LevelUpPayload,
): Result.Result<LevelUpChosen<Body>, ReadonlyArray<string>> => {
  const problems: Array<string> = [];

  if (payload.toLevel !== offer.toLevel) {
    problems.push(
      `This character is level ${String(offer.fromLevel)}, so a level-up reaches ${String(offer.toLevel)}, not ${String(payload.toLevel)}.`,
    );
  }

  // The subclass: one of the offer's, a typed label, or the label already there.
  const subclassOffer = offer.subclass;
  const chosenSubclass = payload.subclass;
  const subclassOption =
    chosenSubclass === undefined || subclassOffer === undefined
      ? undefined
      : subclassOffer.options.find((option) =>
          "subclassId" in chosenSubclass
            ? option.subclassId === chosenSubclass.subclassId
            : wanted(option.name) === wanted(chosenSubclass.name),
        );
  const typedSubclass =
    chosenSubclass !== undefined && "name" in chosenSubclass && subclassOption === undefined
      ? chosenSubclass.name.trim()
      : undefined;
  if (chosenSubclass !== undefined && subclassOffer === undefined) {
    problems.push("No subclass is taken at this level.");
  } else if (subclassOffer !== undefined) {
    if (chosenSubclass === undefined && subclassOffer.current === undefined) {
      problems.push(`Choose a subclass: it is taken at level ${String(subclassOffer.level)}.`);
    } else if (
      chosenSubclass !== undefined &&
      "subclassId" in chosenSubclass &&
      subclassOption === undefined
    ) {
      problems.push("That subclass is not one this character's rules offer.");
    }
  }

  // The choices: the level's own, and the ones the chosen subclass brings.
  const choices = [...offer.choices, ...(subclassOption?.choices ?? [])];
  const picks = payload.picks ?? [];
  const recordedPicks: Array<AdvancementChoices["picks"][number]> = [];
  const pickTraits: Array<SheetFeature> = [];
  const expertise: Array<{ readonly name: string; readonly offeredBy: FeatureId }> = [];
  for (const pick of picks) {
    if (!choices.some((choice) => answers(choice, pick))) {
      problems.push(
        "featureId" in pick
          ? "A pick answers a choice this level does not offer."
          : `"${pick.value}" answers a choice this level does not offer.`,
      );
    }
  }
  for (const choice of choices) {
    const mine = picks.filter((pick) => answers(choice, pick));
    const offeredBy = choice.offeredBy;
    if (mine.length !== choice.choose) {
      problems.push(
        `${offeredBy.name} asks for ${String(choice.choose)} ${choice.choose === 1 ? "choice" : "choices"}; ${String(mine.length)} ${mine.length === 1 ? "was" : "were"} made.`,
      );
    }
    const seen = new Set<string>();
    for (const pick of mine) {
      if (choice.kind === "feature" && "featureId" in pick) {
        const option = choice.options.find((entry) => entry.featureId === pick.featureId);
        if (option === undefined) {
          problems.push(`${offeredBy.name} does not offer that option.`);
          continue;
        }
        if (!option.available) {
          problems.push(`${option.name} is not available yet: its prerequisites are not met.`);
          continue;
        }
        if (seen.has(option.featureId)) {
          problems.push(`${option.name} is chosen twice.`);
          continue;
        }
        seen.add(option.featureId);
        recordedPicks.push({
          kind: "feature",
          offeredBy,
          featureId: option.featureId,
          name: option.name,
        });
        pickTraits.push({
          name: option.name,
          text: prose(option.desc),
          featureId: option.featureId,
          derived: true,
          pick: { offeredBy: offeredBy.featureId },
        });
      } else if (choice.kind !== "feature" && "value" in pick) {
        const value = choice.options.find((entry) => wanted(entry) === wanted(pick.value));
        if (value === undefined) {
          problems.push(`${offeredBy.name} does not offer "${pick.value}".`);
          continue;
        }
        if (seen.has(wanted(value))) {
          problems.push(`"${value}" is chosen twice.`);
          continue;
        }
        seen.add(wanted(value));
        recordedPicks.push({ kind: choice.kind, offeredBy, name: value });
        if (choice.kind === "expertise") {
          expertise.push({ name: value, offeredBy: offeredBy.featureId });
        } else {
          pickTraits.push({
            name: `${bareName(offeredBy.name)}: ${value}`,
            text: "",
            derived: true,
            pick: { offeredBy: offeredBy.featureId },
          });
        }
      }
    }
  }

  // The ASI, or a feat in its place.
  const asi = offer.abilityScoreImprovement;
  const chosenAsi = payload.abilityScoreImprovement;
  const increases = chosenAsi !== undefined && "increases" in chosenAsi ? chosenAsi.increases : [];
  const feat =
    chosenAsi !== undefined && "featId" in chosenAsi
      ? asi?.feats?.find((entry) => entry.featId === chosenAsi.featId)
      : undefined;
  const scoreChanges: Array<{
    readonly ability: AbilityKey;
    readonly from: number;
    readonly to: number;
  }> = [];
  if (asi === undefined) {
    if (chosenAsi !== undefined) problems.push("This level has no Ability Score Improvement.");
  } else if (chosenAsi === undefined) {
    problems.push(
      asi.feats === undefined
        ? "Choose where the Ability Score Improvement's points go."
        : "Choose where the Ability Score Improvement's points go, or a feat in its place.",
    );
  } else if ("featId" in chosenAsi) {
    if (feat === undefined) {
      problems.push(
        "That feat is not offered: its prerequisites are not met, or this character's rules do not have it.",
      );
    }
  } else {
    const total = increases.reduce((sum, increase) => sum + increase.amount, 0);
    if (total !== asi.points) {
      problems.push(
        `An Ability Score Improvement is ${String(asi.points)} points; ${String(total)} ${total === 1 ? "was" : "were"} given.`,
      );
    }
    const abilities = new Set<string>();
    for (const increase of increases) {
      if (abilities.has(increase.ability)) {
        problems.push(`${increase.ability} is raised twice; put both points on it at once.`);
        continue;
      }
      abilities.add(increase.ability);
      const score = Number(cellOf(body.abilities, increase.ability)?.score.trim());
      if (!Number.isInteger(score)) {
        problems.push(`${increase.ability} has no score on this sheet to raise.`);
        continue;
      }
      const raised = score + increase.amount;
      if (raised > asi.maximum) {
        problems.push(
          `${increase.ability} would be ${String(raised)}; no score goes above ${String(asi.maximum)}.`,
        );
        continue;
      }
      scoreChanges.push({ ability: increase.ability, from: score, to: raised });
    }
  }

  // The spells, each from the list the offer gave for it.
  const spellOffer = offer.spells;
  const spellPicks = payload.spells ?? {};
  const chosenSpells: Array<AdvancementChoices["spells"][number]> = [];
  const chosenIds = new Set<string>();
  const anySpells =
    (spellPicks.cantrips?.length ?? 0) +
      (spellPicks.learned?.length ?? 0) +
      (spellPicks.magicalSecrets?.length ?? 0) >
      0 ||
    spellPicks.replace !== undefined ||
    spellPicks.mysticArcanum !== undefined;
  const pickSpells = (
    ids: ReadonlyArray<SpellId>,
    limit: number,
    options: ReadonlyArray<LevelUpSpellOption>,
    kind: AdvancementChoices["spells"][number]["kind"],
    what: string,
    fits: (option: LevelUpSpellOption) => boolean,
  ) => {
    if (ids.length > limit) {
      problems.push(
        `This level lets the character learn ${String(limit)} ${what}; ${String(ids.length)} were chosen.`,
      );
    }
    for (const id of ids) {
      const option = options.find((entry) => entry.spellId === id && fits(entry));
      if (option === undefined) {
        problems.push(`A chosen spell is not one this level offers as ${what}.`);
      } else if (chosenIds.has(id)) {
        problems.push(`${option.name} is chosen twice.`);
      } else {
        chosenIds.add(id);
        chosenSpells.push({ spellId: id, name: option.name, level: option.level, kind });
      }
    }
  };
  let replaced: AdvancementChoices["replaced"];
  let replacedRow: SpellKnown | undefined;
  if (spellOffer === undefined) {
    if (anySpells) problems.push("This level brings no spells to learn.");
  } else {
    pickSpells(
      spellPicks.cantrips ?? [],
      spellOffer.cantrips,
      spellOffer.options,
      "cantrip",
      "cantrips",
      (option) => option.level === 0,
    );
    pickSpells(
      spellPicks.learned ?? [],
      spellOffer.spells,
      spellOffer.options,
      "learned",
      "spells",
      (option) => option.level > 0,
    );
    const secrets = spellOffer.magicalSecrets;
    pickSpells(
      spellPicks.magicalSecrets ?? [],
      secrets?.count ?? 0,
      secrets?.options ?? [],
      "magicalSecrets",
      "Magical Secrets",
      () => true,
    );
    const arcanum = spellOffer.mysticArcanum;
    pickSpells(
      spellPicks.mysticArcanum === undefined ? [] : [spellPicks.mysticArcanum],
      arcanum === undefined ? 0 : 1,
      arcanum?.options ?? [],
      "mysticArcanum",
      "a Mystic Arcanum",
      () => true,
    );
    const swap = spellPicks.replace;
    if (swap !== undefined) {
      const given = (body.spellcasting?.known ?? []).find((spell) => spell.spellId === swap.from);
      const taken = spellOffer.options.find(
        (option) => option.spellId === swap.to && option.level > 0,
      );
      if (!spellOffer.replace) {
        problems.push("This class does not swap a known spell on a level-up.");
      } else if (given === undefined || (given.level ?? 0) === 0 || given.learnedBy !== undefined) {
        problems.push("The spell to give up is not a class spell this character knows.");
      } else if (taken === undefined) {
        problems.push("The spell taken in a swap is not one this level offers.");
      } else if (chosenIds.has(taken.spellId)) {
        problems.push(`${taken.name} is chosen twice.`);
      } else {
        chosenIds.add(taken.spellId);
        replacedRow = given;
        replaced = {
          from: { spellId: swap.from, name: given.name, level: given.level ?? 0 },
          to: { spellId: taken.spellId, name: taken.name, level: taken.level },
        };
      }
    }
  }

  if (problems.length > 0) return Result.fail(problems);

  // Everything holds: apply it.
  const subclassName = subclassOption?.name ?? typedSubclass;
  const identity = body.identity ?? {};
  const raised = new Map(scoreChanges.map((change) => [change.ability, change]));
  const appliedAbilities: Array<AdvancementApplied["abilities"][number]> = [];
  const abilities = body.abilities.map((cell): Ability => {
    const change = raised.get(cell.label.trim().toUpperCase() as AbilityKey);
    if (change === undefined) return cell;
    const stated = statedModifier(cell);
    const modifier =
      stated === Math.floor((change.from - 10) / 2) ? modifierFor(change.to) : cell.modifier;
    const score = String(change.to);
    appliedAbilities.push({
      label: cell.label,
      score: { from: cell.score, to: score },
      modifier: { from: cell.modifier, to: modifier },
    });
    return { ...cell, score, modifier };
  });

  const featTraits: ReadonlyArray<SheetFeature> =
    feat === undefined || asi === undefined
      ? []
      : [
          {
            name: feat.name,
            text: prose(feat.description),
            featId: feat.featId,
            derived: true,
            pick: { offeredBy: asi.offeredBy.featureId },
          },
        ];
  const addedTraits = [...pickTraits, ...featTraits];

  // Expertise: the skill row's mark, a new row for a standard skill the sheet
  // lists only as a proficiency, or a line for a tool.
  const skillRows: Array<Skill> = [...(body.skills ?? [])];
  const expertiseApplied: Array<AdvancementApplied["expertise"][number]> = [];
  for (const { name, offeredBy } of expertise) {
    const index = skillRows.findIndex((skill) => wanted(skill.name) === wanted(name));
    if (index >= 0) {
      skillRows[index] = { ...skillRows[index]!, proficient: true, expertise: true };
      expertiseApplied.push({ skill: skillRows[index]!.name, added: false });
      continue;
    }
    const standard = STANDARD_SKILLS.find(([skill]) => wanted(skill) === wanted(name));
    if (standard !== undefined) {
      skillRows.push({
        name: standard[0],
        ability: standard[1],
        proficient: true,
        expertise: true,
      });
      expertiseApplied.push({ skill: standard[0], added: true });
      continue;
    }
    addedTraits.push({
      name: `Expertise: ${name}`,
      text: "",
      derived: true,
      pick: { offeredBy },
    });
  }

  // Known spells: the new ones, the swap, each by the picker's own shape.
  const learnedRows: ReadonlyArray<SpellKnown> = chosenSpells.map((spell) => ({
    name: spell.name,
    level: spell.level,
    spellId: spell.spellId,
    ...(spell.kind === "magicalSecrets" || spell.kind === "mysticArcanum"
      ? { learnedBy: spell.kind }
      : {}),
  }));
  const swapRows: ReadonlyArray<SpellKnown> =
    replaced === undefined
      ? []
      : [{ name: replaced.to.name, level: replaced.to.level, spellId: replaced.to.spellId }];
  const knownBefore = body.spellcasting?.known ?? [];
  const known = [
    ...knownBefore.filter((spell) => spell !== replacedRow),
    ...learnedRows,
    ...swapRows,
  ];
  const addedSpells = [...learnedRows, ...swapRows];

  const next: Body = {
    ...body,
    abilities,
    traits: [...body.traits, ...addedTraits],
    ...(subclassName === undefined ? {} : { identity: { ...identity, subclass: subclassName } }),
    ...(expertiseApplied.length === 0 ? {} : { skills: skillRows }),
    ...(addedSpells.length === 0 && replacedRow === undefined
      ? {}
      : { spellcasting: { ...body.spellcasting, known } }),
  };

  const constitution = {
    from: statedModifier(cellOf(body.abilities, "CON")) ?? 0,
    to: statedModifier(cellOf(abilities, "CON")) ?? 0,
  };

  return Result.succeed({
    body: next,
    choices: {
      ...(subclassName === undefined
        ? {}
        : {
            subclass: {
              name: subclassName,
              ...(subclassOption === undefined ? {} : { subclassId: subclassOption.subclassId }),
            },
          }),
      ...(scoreChanges.length === 0 ? {} : { abilityScores: scoreChanges }),
      ...(feat === undefined ? {} : { feat: { featId: feat.featId, name: feat.name } }),
      picks: recordedPicks,
      spells: chosenSpells,
      ...(replaced === undefined ? {} : { replaced }),
    },
    applied: {
      ...(subclassName === undefined
        ? {}
        : {
            subclass: {
              ...(identity.subclass === undefined ? {} : { from: identity.subclass }),
              to: subclassName,
            },
          }),
      abilities: appliedAbilities,
      traits: addedTraits.map((trait) => trait.name),
      expertise: expertiseApplied,
      knownAdded: addedSpells.flatMap((spell) => spell.spellId ?? []),
      knownRemoved:
        replacedRow === undefined
          ? []
          : [
              {
                name: replacedRow.name,
                ...(replacedRow.spellId === undefined ? {} : { spellId: replacedRow.spellId }),
              },
            ],
    },
    constitution,
  });
};

/**
 * The hit points one level adds: the die's part (its average rounded up, or
 * the server's roll), the offer's bonus (CON and the race's per level), and,
 * when the level's ASI moved the CON modifier, the difference for every level
 * the character now has — *"as though you had the new modifier from 1st
 * level"* (the 2014 rule `using-each-ability`).
 */
export const levelUpHitPointGain = (
  hitPoints: LevelUpHitPoints,
  die: number,
  constitution: { readonly from: number; readonly to: number },
  toLevel: number,
): number => die + hitPoints.bonus + (constitution.to - constitution.from) * toLevel;
