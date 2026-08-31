import { Schema } from "effect";
import type { Ability } from "./Creature.js";

/** The six ability labels, in the order every sheet draws them. */
export const AbilityKey = Schema.Literals(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
export type AbilityKey = typeof AbilityKey.Type;

export const ABILITY_KEYS: ReadonlyArray<AbilityKey> = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export const signed = (value: number): string => (value < 0 ? String(value) : `+${String(value)}`);

export const modifierFor = (score: number): string => signed(Math.floor((score - 10) / 2));

/** A fixed 2014 race/subrace ability bonus. */
export const AbilityBonus = Schema.Struct({
  ability: AbilityKey,
  amount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10 })),
});
export type AbilityBonus = typeof AbilityBonus.Type;

/** A source-defined choice, e.g. Half-Elf choosing two +1 bonuses. */
export const AbilityBonusChoice = Schema.Struct({
  choose: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 6 })),
  bonuses: Schema.Array(AbilityBonus).check(Schema.isLengthBetween(1, 6)),
});
export type AbilityBonusChoice = typeof AbilityBonusChoice.Type;

export interface ClassEntry {
  readonly hitDie: number;
  readonly unarmouredAc: ReadonlyArray<AbilityKey>;
}

export interface SubraceEntry {
  readonly name: string;
  readonly abilityBonuses: ReadonlyArray<AbilityBonus>;
  readonly hpPerLevel?: number;
}

export interface RaceEntry {
  readonly speed: number;
  readonly size: string;
  readonly abilityBonuses: ReadonlyArray<AbilityBonus>;
  readonly abilityBonusChoice?: AbilityBonusChoice;
  readonly hpPerLevel: number;
  readonly subraces: ReadonlyArray<SubraceEntry>;
}

/** 2014 backgrounds seed no ability scores. Their source grants are display/provenance data. */
export type BackgroundEntry = object;

export const bonusesLine = (bonuses: ReadonlyArray<AbilityBonus>): string =>
  bonuses.map((bonus) => `${signed(bonus.amount)} ${bonus.ability}`).join(", ");

const applyBonuses = (
  abilities: ReadonlyArray<Ability>,
  bonuses: ReadonlyArray<AbilityBonus>,
): ReadonlyArray<Ability> => {
  if (bonuses.length === 0) return abilities;
  const by = new Map<string, number>();
  for (const bonus of bonuses) by.set(bonus.ability, (by.get(bonus.ability) ?? 0) + bonus.amount);
  return abilities.map((ability) => {
    const amount = by.get(ability.label.trim().toUpperCase());
    if (amount === undefined || amount === 0) return ability;
    const score = Number(ability.score.trim());
    if (!Number.isInteger(score)) return ability;
    const raised = score + amount;
    return { ...ability, score: String(raised), modifier: modifierFor(raised) };
  });
};

const DEX_ONLY: ReadonlyArray<AbilityKey> = ["DEX"];

export const STARTING_LEVEL = 1;

export const modifierOf = (abilities: ReadonlyArray<Ability>, key: AbilityKey): number => {
  const cell = abilities.find((ability) => ability.label.trim().toUpperCase() === key);
  if (cell === undefined) return 0;
  const value = Number(cell.modifier.trim());
  return Number.isInteger(value) ? value : 0;
};

export interface CharacterSeed {
  readonly level: number;
  readonly ac: number;
  readonly hpMax?: number;
  /** The ability cells after race, subrace and explicit source-defined choices were applied. */
  readonly abilities: ReadonlyArray<Ability>;
  /** The source-defined bonuses that were applied to those ability cells. */
  readonly appliedBonuses: ReadonlyArray<AbilityBonus>;
}

/**
 * Seed-only 2014 arithmetic. Callers resolve labels against their campaign vocabulary and pass the
 * entries here; this module holds no class/race/background fallback maps.
 */
export const seedFor = (input: {
  readonly classEntry: ClassEntry | undefined;
  readonly raceEntry: RaceEntry | undefined;
  /** Must already be a subrace contained by `raceEntry`; callers use `subraceNamed`. */
  readonly subraceEntry: SubraceEntry | undefined;
  /** Explicit choices for a source-defined race bonus option. Empty means no choice was made. */
  readonly raceBonusChoices?: ReadonlyArray<AbilityBonus>;
  /** Accepted for call-site symmetry; 2014 backgrounds do not seed scores. */
  readonly backgroundEntry?: BackgroundEntry | undefined;
  readonly abilities: ReadonlyArray<Ability>;
}): CharacterSeed => {
  const { classEntry, raceEntry, subraceEntry } = input;
  const level = STARTING_LEVEL;
  const chosen = input.raceBonusChoices ?? [];
  const appliedBonuses = [
    ...(raceEntry?.abilityBonuses ?? []),
    ...(subraceEntry?.abilityBonuses ?? []),
    ...chosen,
  ];
  const abilities = applyBonuses(input.abilities, appliedBonuses);

  const acFrom = classEntry?.unarmouredAc ?? DEX_ONLY;
  const ac = acFrom.reduce((total, key) => total + modifierOf(abilities, key), 10);

  if (classEntry === undefined) return { level, ac, abilities, appliedBonuses };

  const hp =
    classEntry.hitDie +
    modifierOf(abilities, "CON") +
    ((raceEntry?.hpPerLevel ?? 0) + (subraceEntry?.hpPerLevel ?? 0)) * level;
  return { level, ac, hpMax: Math.max(1, hp), abilities, appliedBonuses };
};
