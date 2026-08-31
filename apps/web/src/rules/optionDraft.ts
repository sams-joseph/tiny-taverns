import type {
  AbilityBonus,
  BackgroundBody,
  CharacterOption,
  ClassBody,
  OptionKind,
  RaceBody,
  SubraceBody,
} from "@taverns/api";
import { ABILITY_KEYS, type AbilityKey } from "@taverns/api";

export const MAX_HIT_DIE = 100;
export const MAX_HP_PER_LEVEL = 20;
export const MAX_BONUS = 10;
export const MAX_SPEED = 200;

export const NOUN: Record<OptionKind, string> = {
  class: "class",
  race: "race",
  background: "background",
};

export interface OptionDraft {
  readonly name: string;
  readonly summary: string;
  readonly hitDie: string;
  readonly unarmouredAc: ReadonlyArray<AbilityKey>;
  readonly classProficiencies: string;
  readonly savingThrows: string;
  readonly speed: string;
  readonly size: string;
  readonly hpPerLevel: string;
  readonly abilityBonuses: Readonly<Record<AbilityKey, string>>;
  readonly abilityBonusChoice: RaceBody["abilityBonusChoice"];
  readonly traits: string;
  readonly subraces: ReadonlyArray<SubraceBody>;
  readonly proficiencies: string;
  readonly languages: string;
  readonly equipment: string;
  readonly gold: string;
  readonly featureName: string;
  readonly featureText: string;
  readonly choices: string;
}

const NO_BONUSES: Record<AbilityKey, string> = {
  STR: "",
  DEX: "",
  CON: "",
  INT: "",
  WIS: "",
  CHA: "",
};

const lines = (values: ReadonlyArray<string> | undefined): string => (values ?? []).join("\n");
const list = (value: string): ReadonlyArray<string> =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

const boxesFrom = (bonuses: ReadonlyArray<AbilityBonus>): Record<AbilityKey, string> => {
  const boxes = { ...NO_BONUSES };
  for (const bonus of bonuses) boxes[bonus.ability] = String(bonus.amount);
  return boxes;
};

export const draftFrom = (option: CharacterOption | undefined): OptionDraft => {
  const body = option?.body;
  return {
    name: option?.name ?? "",
    summary: body?.summary ?? "",
    hitDie: option?.kind === "class" ? String(option.body.hitDie) : "8",
    unarmouredAc: option?.kind === "class" ? [...option.body.unarmouredAc] : ["DEX"],
    classProficiencies: option?.kind === "class" ? lines(option.body.proficiencies) : "",
    savingThrows: option?.kind === "class" ? lines(option.body.savingThrows) : "",
    speed: option?.kind === "race" ? String(option.body.speed) : "30",
    size: option?.kind === "race" ? option.body.size : "Medium",
    hpPerLevel: option?.kind === "race" ? String(option.body.hpPerLevel) : "0",
    abilityBonuses: option?.kind === "race" ? boxesFrom(option.body.abilityBonuses) : NO_BONUSES,
    abilityBonusChoice: option?.kind === "race" ? option.body.abilityBonusChoice : undefined,
    traits: option?.kind === "race" ? lines(option.body.traits) : "",
    subraces: option?.kind === "race" ? option.body.subraces : [],
    proficiencies: option?.kind === "background" ? lines(option.body.proficiencies) : "",
    languages: option?.kind === "background" ? lines(option.body.languages) : "",
    equipment: option?.kind === "background" ? lines(option.body.equipment) : "",
    gold: option?.kind === "background" ? (option.body.gold ?? "") : "",
    featureName: option?.kind === "background" ? (option.body.feature?.name ?? "") : "",
    featureText: option?.kind === "background" ? (option.body.feature?.text ?? "") : "",
    choices: option?.kind === "background" ? lines(option.body.choices) : "",
  };
};

const parseWhole = (raw: string): number | undefined =>
  raw.trim() !== "" && Number.isInteger(Number(raw)) ? Number(raw) : undefined;

export interface DraftProblems {
  readonly name?: string;
  readonly hitDie?: string;
  readonly speed?: string;
  readonly hpPerLevel?: string;
  readonly abilityBonuses?: string;
}

export const problemsIn = (kind: OptionKind, draft: OptionDraft): DraftProblems => {
  const problems: {
    name?: string;
    hitDie?: string;
    speed?: string;
    hpPerLevel?: string;
    abilityBonuses?: string;
  } = {};
  if (draft.name.trim() === "") problems.name = "Give it a name.";

  if (kind === "class") {
    const die = parseWhole(draft.hitDie);
    if (die === undefined) problems.hitDie = "A hit die is a whole number of faces.";
    else if (die < 1 || die > MAX_HIT_DIE)
      problems.hitDie = `Between 1 and ${String(MAX_HIT_DIE)}.`;
  }

  if (kind === "race") {
    const speed = parseWhole(draft.speed);
    if (speed === undefined) problems.speed = "Speed is a whole number.";
    else if (speed < 0 || speed > MAX_SPEED) problems.speed = `Between 0 and ${String(MAX_SPEED)}.`;
    const hp = parseWhole(draft.hpPerLevel);
    if (hp === undefined) problems.hpPerLevel = "Hit points per level are a whole number.";
    else if (hp < 0 || hp > MAX_HP_PER_LEVEL) {
      problems.hpPerLevel = `Between 0 and ${String(MAX_HP_PER_LEVEL)}.`;
    }
    const bad = ABILITY_KEYS.filter((ability) => {
      const raw = draft.abilityBonuses[ability].trim();
      if (raw === "") return false;
      const amount = parseWhole(raw);
      return amount === undefined || amount < 0 || amount > MAX_BONUS;
    });
    if (bad.length > 0)
      problems.abilityBonuses = `A bonus is a whole number, 0 to ${String(MAX_BONUS)}.`;
  }

  return problems;
};

export const refuses = (problems: DraftProblems): boolean => Object.keys(problems).length > 0;

export const bonusesFrom = (draft: OptionDraft): ReadonlyArray<AbilityBonus> =>
  ABILITY_KEYS.flatMap((ability) => {
    const amount = parseWhole(draft.abilityBonuses[ability]);
    return amount === undefined || amount < 1 ? [] : [{ ability, amount }];
  });

export type WrittenOption =
  | { readonly kind: "class"; readonly body: ClassBody }
  | { readonly kind: "race"; readonly body: RaceBody }
  | { readonly kind: "background"; readonly body: BackgroundBody };

export const documentOf = (kind: OptionKind, draft: OptionDraft): WrittenOption => {
  const summary = draft.summary.trim();
  const said = summary === "" ? {} : { summary };
  switch (kind) {
    case "class":
      return {
        kind: "class",
        body: {
          hitDie: parseWhole(draft.hitDie) ?? 8,
          unarmouredAc: draft.unarmouredAc,
          proficiencies: list(draft.classProficiencies),
          savingThrows: list(draft.savingThrows),
          ...said,
        },
      };
    case "race":
      return {
        kind: "race",
        body: {
          speed: parseWhole(draft.speed) ?? 30,
          size: draft.size.trim() || "Medium",
          abilityBonuses: bonusesFrom(draft),
          ...(draft.abilityBonusChoice === undefined
            ? {}
            : { abilityBonusChoice: draft.abilityBonusChoice }),
          hpPerLevel: parseWhole(draft.hpPerLevel) ?? 0,
          traits: list(draft.traits),
          subraces: draft.subraces,
          ...said,
        },
      };
    case "background": {
      const feature =
        draft.featureName.trim() === "" && draft.featureText.trim() === ""
          ? undefined
          : { name: draft.featureName.trim() || "Feature", text: draft.featureText.trim() };
      return {
        kind: "background",
        body: {
          proficiencies: list(draft.proficiencies),
          languages: list(draft.languages),
          equipment: list(draft.equipment),
          ...(draft.gold.trim() === "" ? {} : { gold: draft.gold.trim() }),
          ...(feature === undefined ? {} : { feature }),
          choices: list(draft.choices),
          ...said,
        },
      };
    }
  }
};
