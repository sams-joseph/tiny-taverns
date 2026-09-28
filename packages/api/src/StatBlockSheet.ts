import type {
  SheetAction,
  SheetBody,
  SheetIdentity,
  Skill,
  ActionCost,
  ActionSource,
} from "./Character.js";
import type {
  Ability,
  Creature,
  CreatureActionUsage,
  CreatureDamage,
  CreatureFeature,
  StatBlock,
  Trait,
} from "./Creature.js";
import { CHALLENGE_RATINGS, type ChallengeRating } from "./EncounterDifficulty.js";
import { signed, STANDARD_SKILLS } from "./Ruleset.js";

/**
 * What a stat block answers of an NPC sheet: the three numbers a fight reads
 * and the rules half of the document — the columns and the `sheet` of an
 * `NpcSheetPut`, less the identity columns a stat block cannot answer.
 *
 * **Class and level are not here, and neither are race and subrace.** A Guard
 * or a Veteran is a template, not a Fighter 5: the SRD prints no class and no
 * level, and a guess at either would be a descriptor nobody wrote. The DM
 * sets them afterwards if they want them.
 */
export interface StatBlockSheet {
  readonly ac: number;
  readonly hpMax: number;
  /** The creature's rating when the XP table knows it; `null` for one it does not (`"—"`). */
  readonly cr: ChallengeRating | null;
  readonly sheet: SheetBody;
}

/**
 * **A bestiary creature translated into an NPC's character-style sheet** —
 * *Start from a bestiary NPC*, the quick start that turns a Guard, a Veteran or
 * a Mage into a sheet in one pick.
 *
 * Every value is the stat block's own, moved to where a character's sheet
 * keeps the same fact, and nothing is computed that the block did not print:
 *
 * - the six cells verbatim — they are one shape (`Ability`) — with each
 *   `"Saving Throw: DEX"` proficiency written onto its cell as the save and
 *   the mark;
 * - `"Skill: Athletics"` proficiencies as skill rows, with the printed bonus
 *   and the ability `STANDARD_SKILLS` keys the skill off;
 * - speed and proficiency bonus on the identity card;
 * - senses, languages, damage resistances, immunities and vulnerabilities and
 *   condition immunities as proficiency badges, the sheet's open vocabulary
 *   for exactly this kind of line;
 * - special abilities, and a legendary action, as features, with the use
 *   limit as the feature's note (*"3/day"*, *"Recharge 5–6"*);
 * - actions, bonus actions and reactions as action lines with their cost, the
 *   to-hit from the attack bonus and the dice from the first damage.
 *
 * **The block's words are kept whole.** An action line's text is the action's
 * own description, so what a line cannot hold as a number — a longsword's
 * two-handed damage, the Assassin's poison, a Druid's *shillelagh* — is still
 * written on it, not summarised away. Passive Perception is not a badge: the
 * sheet derives it from the Perception row, which carries the block's bonus.
 *
 * A creature typed into the Library keeps its features as prose `traits`
 * rather than structured sections; a trait with a to-hit is an attack and
 * becomes an action line, and the rest are features. No line is `derived`,
 * because a level-up recompute rewrites derived lines from a class, and these
 * came from no class.
 */
export const sheetFromStatBlock = (
  creature: Pick<Creature, "ac" | "hp" | "cr" | "statBlock">,
): StatBlockSheet => {
  const block = creature.statBlock;
  const ids = uniqueIds();
  const skills = skillsOf(block);
  const proficiencies = badgesOf(block);
  const identity: SheetIdentity = {
    ...(block.speed.trim() === "" ? {} : { speed: block.speed.trim() }),
    ...(block.proficiencyBonus === undefined
      ? {}
      : { proficiency: signed(block.proficiencyBonus) }),
  };
  const prose = block.traits.filter((trait) => !isAttack(trait));
  const traits: ReadonlyArray<Trait> = [
    ...prose,
    ...(block.specialAbilities ?? []).map((feature) => featureTrait(feature)),
    ...(block.legendaryActions ?? []).map((feature) => featureTrait(feature, "Legendary action")),
  ];
  const actions: ReadonlyArray<SheetAction> = [
    ...block.traits.filter(isAttack).map((trait) => traitAction(trait, ids)),
    ...(block.actions ?? []).map((feature) => featureAction(feature, "action", ids)),
    ...(block.bonusActions ?? []).map((feature) => featureAction(feature, "bonus", ids)),
    ...(block.reactions ?? []).map((feature) => featureAction(feature, "reaction", ids)),
  ];
  return {
    ac: creature.ac,
    hpMax: creature.hp,
    cr: challengeRatingOf(creature.cr),
    sheet: {
      abilities: withSaves(block),
      traits,
      ...(Object.keys(identity).length === 0 ? {} : { identity }),
      ...(skills.length === 0 ? {} : { skills }),
      ...(proficiencies.length === 0 ? {} : { proficiencies }),
      ...(actions.length === 0 ? {} : { actions }),
    },
  };
};

const challengeRatingOf = (cr: string): ChallengeRating | null => {
  const trimmed = cr.trim();
  return CHALLENGE_RATINGS.find((rating) => rating === trimmed) ?? null;
};

const SKILL_PREFIX = "Skill: ";
const SAVE_PREFIX = "Saving Throw: ";

/** The cells, with each printed saving-throw proficiency written onto its own. */
const withSaves = (block: StatBlock): ReadonlyArray<Ability> => {
  const saves = new Map<string, number>();
  for (const entry of block.proficiencies ?? []) {
    const name = entry.proficiency.name;
    if (name.startsWith(SAVE_PREFIX)) {
      saves.set(name.slice(SAVE_PREFIX.length).trim().toUpperCase(), entry.value);
    }
  }
  return block.abilities.map((ability) => {
    const save = saves.get(ability.label.trim().toUpperCase());
    return save === undefined ? ability : { ...ability, save: signed(save), proficient: true };
  });
};

const skillAbility = new Map(
  STANDARD_SKILLS.map(([name, ability]) => [name.toLowerCase(), ability]),
);

const skillsOf = (block: StatBlock): ReadonlyArray<Skill> =>
  (block.proficiencies ?? []).flatMap((entry) => {
    const name = entry.proficiency.name;
    if (!name.startsWith(SKILL_PREFIX)) return [];
    const skill = name.slice(SKILL_PREFIX.length).trim();
    if (skill === "") return [];
    const ability = skillAbility.get(skill.toLowerCase());
    return [
      {
        name: skill,
        ...(ability === undefined ? {} : { ability }),
        bonus: signed(entry.value),
        proficient: true,
      },
    ];
  });

/** `"passive_perception"` → `"Passive perception"`. */
const senseName = (key: string): string => {
  const words = key.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * `"Common, Goblin"` → two badges, the way a character's languages are one
 * badge each; a comma inside a parenthesis does not split.
 */
const languagesOf = (languages: string | undefined): ReadonlyArray<string> => {
  const parts: Array<string> = [];
  let depth = 0;
  let current = "";
  for (const char of languages ?? "") {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== "" && part !== "—");
};

const badgesOf = (block: StatBlock): ReadonlyArray<string> => {
  const senses = Object.entries(block.senses ?? {})
    .filter(([key]) => key !== "passive_perception")
    .map(([key, value]) => `${senseName(key)} ${String(value)}`.trim());
  const lines = [
    ...senses,
    ...languagesOf(block.languages),
    ...(block.damageResistances ?? []).map((damage) => `Resists ${damage}`),
    ...(block.damageImmunities ?? []).map((damage) => `Immune to ${damage}`),
    ...(block.damageVulnerabilities ?? []).map((damage) => `Vulnerable to ${damage}`),
    ...(block.conditionImmunities ?? []).map((condition) => `Immune to ${condition.name}`),
  ];
  return [...new Set(lines.filter((line) => line !== ""))];
};

/** A use limit as a stat block prints it beside the name: *"3/day"*, *"Recharge 5–6"*. */
const usageNote = (usage: CreatureActionUsage | undefined): string | undefined => {
  if (usage === undefined) return undefined;
  switch (usage.type) {
    case "per day":
      return usage.times === undefined ? "Per day" : `${String(usage.times)}/day`;
    case "recharge on roll":
      return usage.minValue === undefined
        ? "Recharge"
        : usage.minValue >= 6
          ? "Recharge 6"
          : `Recharge ${String(usage.minValue)}–6`;
    case "recharge after rest": {
      const rests = usage.restTypes ?? [];
      return rests.length === 0
        ? "Recharges after a rest"
        : `Recharges after a ${rests.join(" or ")} rest`;
    }
    default:
      return usage.type.trim() === "" ? undefined : usage.type;
  }
};

/**
 * The first damage the feature prints, as a roll: a one-handed/two-handed
 * choice reads its first option, which is the line the description leads with.
 * The damage type is not taken apart from it: the description, which the line
 * keeps, already says it.
 */
const firstDice = (damage: ReadonlyArray<CreatureDamage> | undefined): string | undefined => {
  for (const entry of damage ?? []) {
    const dice = entry.damageDice?.trim() ?? firstChoiceDice(entry.choice);
    if (dice !== undefined && dice !== "") return dice;
  }
  return undefined;
};

const firstChoiceDice = (choice: Record<string, unknown> | undefined): string | undefined => {
  const from = choice?.["from"];
  const options =
    typeof from === "object" && from !== null && "options" in from ? from.options : undefined;
  if (!Array.isArray(options)) return undefined;
  for (const option of options as ReadonlyArray<unknown>) {
    if (typeof option !== "object" || option === null || !("damage_dice" in option)) continue;
    const dice = option.damage_dice;
    if (typeof dice === "string" && dice.trim() !== "") return dice.trim();
  }
  return undefined;
};

const featureTrait = (feature: CreatureFeature, kind?: string): Trait => {
  const note = [kind, usageNote(feature.usage)].filter(
    (part): part is string => part !== undefined,
  );
  const dice = firstDice(feature.damage);
  return {
    name: feature.name,
    text: feature.desc,
    ...(note.length === 0 ? {} : { note: note.join(" · ") }),
    ...(dice === undefined ? {} : { dice }),
    ...(feature.attackBonus === undefined ? {} : { hit: signed(feature.attackBonus) }),
  };
};

/** What kind of line the description says it is: a weapon attack, a spell attack, or another action. */
const sourceOf = (description: string): ActionSource =>
  /^(melee|ranged)( or ranged)? weapon attack/i.test(description.trim())
    ? "weapon"
    : /^(melee|ranged)( or ranged)? spell attack/i.test(description.trim())
      ? "spell"
      : "other";

/** `"atk:longsword"`, and `"atk:longsword-2"` for a second line of the same name. */
const uniqueIds = () => {
  const seen = new Set<string>();
  return (prefix: string, name: string): string => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const base = `${prefix}:${slug === "" ? "line" : slug}`;
    let id = base;
    for (let n = 2; seen.has(id); n += 1) id = `${base}-${String(n)}`;
    seen.add(id);
    return id;
  };
};

const featureAction = (
  feature: CreatureFeature,
  cost: ActionCost,
  ids: ReturnType<typeof uniqueIds>,
): SheetAction => {
  const dice = firstDice(feature.damage);
  const attack = feature.attackBonus !== undefined;
  const usage = usageNote(feature.usage);
  const text = [usage, feature.desc.trim()].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  return {
    id: ids(attack ? "atk" : "act", feature.name),
    name: feature.name,
    cost,
    ...(feature.attackBonus === undefined ? {} : { hit: signed(feature.attackBonus) }),
    ...(dice === undefined ? {} : { dice }),
    ...(text.length === 0 ? {} : { text: text.join(". ") }),
    source: attack ? sourceOf(feature.desc) : "other",
  };
};

/**
 * A prose trait is an attack when it has a to-hit, or when its words say it is
 * one (*"Melee weapon attack: +4 to hit…"*) — the Goblin Boss's scimitar
 * carries its dice and leaves the to-hit in the sentence.
 */
const isAttack = (trait: Trait): boolean => writtenHit(trait) !== undefined;

/** The to-hit as the trait wrote it: its own `hit`, else the *"+4 to hit"* in its text. */
const writtenHit = (trait: Trait): string | undefined => {
  const hit = trait.hit?.trim();
  if (hit !== undefined && hit !== "" && hit !== "—") return hit;
  if (sourceOf(trait.text) === "other") return undefined;
  return /([+\-−]\d+) to hit/.exec(trait.text)?.[1]?.replace("−", "-");
};

const traitAction = (trait: Trait, ids: ReturnType<typeof uniqueIds>): SheetAction => {
  const hit = writtenHit(trait);
  const text = [trait.note?.trim(), trait.text.trim()].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  return {
    id: ids("atk", trait.name),
    name: trait.name,
    cost: "action",
    ...(hit === undefined ? {} : { hit }),
    ...(trait.dice === undefined || trait.dice.trim() === "" ? {} : { dice: trait.dice.trim() }),
    ...(text.length === 0 ? {} : { text: text.join(". ") }),
    source: sourceOf(trait.text),
  };
};
