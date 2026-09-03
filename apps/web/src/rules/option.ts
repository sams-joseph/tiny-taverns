import type { AbilityKey, CharacterOption } from "@taverns/api";
import { bonusesLine } from "@taverns/api";

export const unarmouredLine = (abilities: ReadonlyArray<AbilityKey>): string =>
  ["10", ...abilities].join(" + ");

const joined = (values: ReadonlyArray<string> | undefined, fallback: string): string => {
  const lines = values ?? [];
  return lines.length === 0 ? fallback : lines.join(", ");
};

export const numbersOf = (option: CharacterOption): string => {
  switch (option.kind) {
    case "class":
      return `d${String(option.body.hitDie)} · unarmoured ${unarmouredLine(option.body.unarmouredAc)}`;
    case "race": {
      const fixed = bonusesLine(option.body.abilityBonuses) || "no fixed bonuses";
      const choice = option.body.abilityBonusChoice;
      const chosen =
        choice === undefined
          ? ""
          : ` · choose ${String(choice.choose)} from ${choice.bonuses
              .map((bonus) => bonus.ability)
              .join(", ")}`;
      const hp =
        option.body.hpPerLevel === 0
          ? ""
          : ` · +${String(option.body.hpPerLevel)} hit point${option.body.hpPerLevel === 1 ? "" : "s"} per level`;
      const subs =
        option.body.subraces.length === 0
          ? ""
          : ` · ${option.body.subraces.length} subrace${option.body.subraces.length === 1 ? "" : "s"}`;
      return `${fixed} · ${String(option.body.speed)} ft · ${option.body.size}${hp}${chosen}${subs}`;
    }
    case "background": {
      const proficiencies = joined(option.body.proficiencies, "no fixed proficiencies");
      const languages =
        option.body.languages.length === 0 ? "" : ` · ${option.body.languages.join(", ")}`;
      return `${proficiencies}${languages}`;
    }
  }
};

export type OptionOwner = "bundle" | "library" | "campaign";

/**
 * `campaign` survives as an owner only for inert rows in old data — nothing
 * lists or edits a campaign copy since the instancing decision of 2026-09-02.
 */
export const ownerOf = (option: CharacterOption): OptionOwner =>
  option.accountId !== null ? "library" : option.campaignId !== null ? "campaign" : "bundle";

export const isLibraryOriginal = (option: CharacterOption): boolean =>
  ownerOf(option) === "library";
