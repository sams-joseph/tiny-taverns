import {
  type BoardSquare,
  type DiagonalRule,
  areaSquares,
  feetBetween,
  reachableSquares,
} from "./BattleMap.js";
import type { Combatant } from "./Combatant.js";
import type {
  ActionArea,
  ActionRange,
  CreatureDamage,
  CreatureDifficultyClass,
  CreatureFeature,
  StatBlock,
  Trait,
} from "./Creature.js";
import type { EncounterRun } from "./EncounterRun.js";
import type { CombatantId, CreatureId } from "./Ids.js";
import {
  type FeatureSection,
  featureKey,
  leftOf,
  npcLimits,
  slotKey,
  spellKey,
  spellcastingOf,
} from "./NpcResources.js";
import { walkingFeet } from "./Speed.js";
import type { Spell } from "./Spell.js";

/**
 * **What a monster may do now**, as code decides it: every action, bonus
 * action, reaction and legendary action its stat block gives it that the turn's
 * economy and its row's spending still allow, each with the targets its reach
 * or range takes in on the board and, for an area, the squares and creatures
 * each placement covers; and the squares it can still walk to. A later
 * proposal names one option by its `id`; the model chooses, the code has
 * already said what is legal.
 *
 * Pure, and the one reading of these rules: the runner draws its multiattack
 * and its range marks from it, and the server will check a proposal against
 * it. **Absent beats stubbed**: what a stat block lacks the numbers for is not
 * guessed at but put in {@link NpcTurnOptions.omitted} with its reason, so a
 * caller can say what it left out.
 *
 * Not modelled, and so never refused or offered on their account: creature
 * size (every token is one square), cover and line of sight, a reaction's or a
 * triggered bonus action's trigger (offered and flagged `triggered`, for the
 * chooser to judge), and conditions beyond the ones that stop a creature
 * acting or moving.
 */

/** What a fight answers that the options read. */
export interface NpcTurnFight {
  readonly run: Pick<EncounterRun, "phase" | "activeCombatantId" | "endedAt">;
  /** The creator's rows: the options read positions, hit points and spending. */
  readonly combatants: ReadonlyArray<Combatant>;
  /** The fight's board, or `undefined` for a fight with none: then nothing is measured. */
  readonly board:
    | { readonly columns: number; readonly rows: number; readonly feetPerCell: number }
    | undefined;
  readonly diagonals: DiagonalRule;
  /** Each combatant's stat block by the creature it was seeded from. */
  readonly statBlocks: ReadonlyMap<CreatureId, StatBlock>;
  /**
   * The spells its spellcasting names, by lower-cased name. A spell missing
   * here is left out: its casting time says which slot it takes, and only the
   * spell row says that.
   */
  readonly spells?: ReadonlyMap<string, NpcSpell>;
}

/** What a spell option reads off a spell row. */
export type NpcSpell = Pick<Spell, "name" | "level" | "range" | "castingTime"> & {
  readonly spell: Pick<Spell["spell"], "attackType" | "dc" | "areaOfEffect" | "damage">;
};

export type NpcSlot = "action" | "bonus" | "reaction" | "legendary";

/** A creature an option could be aimed at, and how far it is. */
export interface NpcTarget {
  readonly combatantId: CombatantId;
  readonly kind: Combatant["kind"];
  readonly feet: number;
  /**
   * `reach` within a melee reach; `normal` or `long` within a range (long at
   * disadvantage); `out` beyond all of them, which the runner marks.
   */
  readonly band: "reach" | "normal" | "long" | "out";
}

/** One place an area could go, the squares it covers and who stands in them. */
export interface NpcPlacement {
  readonly origin: BoardSquare;
  /** Where a cone or a line points; the origin itself for a sphere or a cube. */
  readonly toward: BoardSquare;
  readonly squares: ReadonlyArray<BoardSquare>;
  readonly catches: ReadonlyArray<CombatantId>;
}

/** What taking an option spends, beyond its slot. */
export interface NpcSpend {
  readonly recharge?: string;
  readonly uses?: string;
  readonly slot?: string;
  /** Legendary actions it costs. */
  readonly legendary?: number;
}

export interface NpcAttack {
  readonly toHit: number;
  readonly damage: ReadonlyArray<{ readonly dice: string; readonly type?: string }>;
  readonly reach?: number;
  readonly range?: ActionRange;
}

export interface NpcSave {
  readonly dc: number;
  /** `DEX`, as the stat block writes it. */
  readonly ability: string;
  /** The source's `success_type`: `none`, `half`, … */
  readonly onSuccess: string;
  readonly damage: ReadonlyArray<{ readonly dice: string; readonly type?: string }>;
}

export interface NpcTurnOption {
  /** Stable for the same stat block and fight: what a proposal names. */
  readonly id: string;
  readonly slot: NpcSlot;
  readonly kind: "attack" | "save" | "multiattack" | "spell" | "feature" | "standard";
  readonly name: string;
  /** The stat block's prose for it, when it has some. */
  readonly text?: string;
  readonly spends: NpcSpend;
  /** Offered only once something the options cannot see has happened (a reaction's trigger). */
  readonly triggered?: true;
  readonly attack?: NpcAttack;
  readonly save?: NpcSave;
  readonly area?: ActionArea;
  /** A spell's level; 0 is a cantrip. */
  readonly level?: number;
  /** Everyone on the board it could be aimed at, nearest first; absent when nothing is measured. */
  readonly targets?: ReadonlyArray<NpcTarget>;
  /** For an area: each place it could go. */
  readonly placements?: ReadonlyArray<NpcPlacement>;
  /** For a multiattack: its strikes, in order, each the option it makes and how many times. */
  readonly strikes?: ReadonlyArray<{ readonly option: NpcTurnOption; readonly count: number }>;
}

export type NpcOmission =
  | "out of the fight"
  | "not taking turns"
  | "incapacitated"
  | "action used"
  | "bonus action used"
  | "reaction used"
  | "not its turn"
  | "its own turn"
  | "no legendary actions left"
  | "recharging"
  | "no uses left"
  | "no slot left"
  | "spell not supplied"
  | "not cast in combat"
  | "names an action it lacks"
  | "count is not a number"
  | "no stat block"
  | "not on the board"
  | "speed is not a number"
  | "prose only";

export interface NpcTurnOptions {
  readonly combatantId: CombatantId;
  /** Whether it is this creature's own turn. */
  readonly up: boolean;
  readonly options: ReadonlyArray<NpcTurnOption>;
  /** Where it can still walk this turn; absent off its turn, off the board or with no speed. */
  readonly movement?: { readonly feetLeft: number; readonly squares: ReadonlyArray<BoardSquare> };
  /** What was left out and why, by the id it would have had. */
  readonly omitted: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly reason: NpcOmission;
  }>;
}

/** The actions every creature has (SRD, "Actions in Combat"). */
export const STANDARD_ACTIONS = [
  "Dash",
  "Disengage",
  "Dodge",
  "Help",
  "Hide",
  "Ready",
  "Search",
  "Use an Object",
] as const;

const INCAPACITATING = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"];
const SPEED_ZERO = ["grappled", "restrained", ...INCAPACITATING];

const has = (combatant: Combatant, conditions: ReadonlyArray<string>): boolean =>
  combatant.conditions.some((condition) => conditions.includes(condition.toLowerCase()));

/** Out of the fight: a monster at zero, as the runner and `nextTurn` treat one. */
const isOut = (combatant: Combatant): boolean =>
  combatant.kind === "npc" && combatant.hpCurrent <= 0;

const damageOf = (
  damage: ReadonlyArray<CreatureDamage> | undefined,
): ReadonlyArray<{ readonly dice: string; readonly type?: string }> =>
  (damage ?? []).flatMap((entry) =>
    entry.damageDice === undefined
      ? []
      : [
          {
            dice: entry.damageDice,
            ...(entry.damageType === undefined ? {} : { type: entry.damageType.name }),
          },
        ],
  );

const saveOf = (
  dc: CreatureDifficultyClass,
  damage: ReadonlyArray<CreatureDamage> | undefined,
): NpcSave => ({
  dc: dc.dcValue,
  ability: dc.dcType.name,
  onSuccess: dc.successType,
  damage: damageOf(damage),
});

/** `"+4"` → 4; anything else is no to-hit. */
const signedNumber = (text: string | undefined): number | undefined => {
  const match = /^\s*([+-−]?\s*\d+)\s*$/.exec(text ?? "");
  return match === null ? undefined : Number((match[1] ?? "").replace("−", "-").replace(/\s/g, ""));
};

/**
 * A spell row's range: `"60 feet"`, `"1 mile"`, `"Touch"` (5 feet, the reach
 * of a touch), `"Self"` (the caster, or an area from it). `"Sight"`,
 * `"Unlimited"` and `"Special"` are no distance a board measures.
 */
const spellRangeOf = (label: string): number | "self" | undefined => {
  const trimmed = label.trim().toLowerCase();
  if (trimmed.startsWith("self")) return "self";
  if (trimmed === "touch") return 5;
  const feet = /^(\d+)\s*(?:feet|foot|ft\.?)$/.exec(trimmed);
  if (feet !== null) return Number(feet[1]);
  const miles = /^(\d+)\s*miles?$/.exec(trimmed);
  return miles === null ? undefined : Number(miles[1]) * 5280;
};

/**
 * Whether a feature rolls to hit. The source writes `attack_bonus: 0` on some
 * features that only point at others (the kraken's, the vampire's legendary
 * actions), so a zero is a to-hit only when the prose says `+0 to hit`.
 */
const rollsToHit = (
  feature: CreatureFeature,
): feature is CreatureFeature & { readonly attackBonus: number } =>
  feature.attackBonus !== undefined &&
  (feature.attackBonus !== 0 || /\+0 to hit/i.test(feature.desc));

/**
 * An action's name as a multiattack or a legendary action names it: the
 * source writes `"Claws"` for the Claw action and `"Unarmed Strike (Vampire
 * Form Only)"` for Unarmed Strike, so the parenthetical, a plural *s* and
 * the case are not part of the match.
 */
const actionName = (name: string): string =>
  name
    .replace(/\s*\(.*\)\s*$/, "")
    .trim()
    .toLowerCase()
    .replace(/s$/, "");

const castingSlotOf = (castingTime: string): NpcSlot | undefined => {
  const time = castingTime.trim().toLowerCase();
  if (time === "1 action") return "action";
  if (time === "1 bonus action") return "bonus";
  if (time.startsWith("1 reaction")) return "reaction";
  return undefined;
};

const spellAreaOf = (
  area: NpcSpell["spell"]["areaOfEffect"],
  self: boolean,
): ActionArea | undefined => {
  if (area === undefined) return undefined;
  const shape =
    area.type === "cylinder"
      ? "sphere"
      : (["sphere", "cone", "line", "cube"] as const).find((s) => s === area.type);
  return shape === undefined
    ? undefined
    : { shape, feet: area.size, origin: self ? "self" : "point" };
};

export const npcTurnOptions = (fight: NpcTurnFight, combatantId: CombatantId): NpcTurnOptions => {
  const omitted: Array<{ id: string; name: string; reason: NpcOmission }> = [];
  const omit = (id: string, name: string, reason: NpcOmission) =>
    omitted.push({ id, name, reason });
  const self = fight.combatants.find((row) => row.id === combatantId);
  const up =
    self !== undefined &&
    fight.run.phase === "turns" &&
    fight.run.endedAt === null &&
    fight.run.activeCombatantId === self.id;
  const none = (reason: NpcOmission): NpcTurnOptions => {
    omit("*", self?.displayName ?? "", reason);
    return { combatantId, up, options: [], omitted };
  };

  if (self === undefined || isOut(self)) return none("out of the fight");
  if (fight.run.phase !== "turns" || fight.run.endedAt !== null) return none("not taking turns");
  if (has(self, INCAPACITATING)) return none("incapacitated");
  const statBlock = self.creatureId === null ? undefined : fight.statBlocks.get(self.creatureId);
  if (statBlock === undefined) return none("no stat block");

  const limits = npcLimits(statBlock);
  const board = fight.board;
  const measure =
    board === undefined
      ? undefined
      : { feetPerCell: board.feetPerCell, diagonals: fight.diagonals };
  const from = self.position ?? undefined;
  const measured = board !== undefined && measure !== undefined && from !== undefined;
  const others = fight.combatants.filter((row) => row.id !== self.id && !isOut(row));
  const placed = others.flatMap((row) =>
    row.position === null ? [] : [{ row, at: row.position }],
  );

  /** Everyone on the board, nearest first, banded by the option's reach and range. */
  const targetsFor = (
    reach: number | undefined,
    range: ActionRange | undefined,
  ): ReadonlyArray<NpcTarget> | undefined => {
    if (!measured || (reach === undefined && range === undefined)) return undefined;
    return placed
      .map(({ row, at }) => {
        const feet = feetBetween(from, at, measure);
        const band: NpcTarget["band"] =
          reach !== undefined && feet <= reach
            ? "reach"
            : range !== undefined && feet <= range.normal
              ? "normal"
              : range?.long !== undefined && feet <= range.long
                ? "long"
                : "out";
        return { combatantId: row.id, kind: row.kind, feet, band };
      })
      .sort((a, b) => a.feet - b.feet);
  };

  const catchesIn = (
    squares: ReadonlyArray<BoardSquare>,
    excludeSelf: boolean,
  ): ReadonlyArray<CombatantId> =>
    fight.combatants
      .filter((row) => !isOut(row) && row.position !== null && (!excludeSelf || row.id !== self.id))
      .filter((row) =>
        squares.some(
          (square) => square.column === row.position?.column && square.row === row.position.row,
        ),
      )
      .map((row) => row.id);

  /**
   * Where an area could go: a cone or a line from the creature aimed at each
   * creature on the board, a burst about itself once, and an area placed at a
   * point centred on each creature within its range. Two aims that catch the
   * same creatures are one placement.
   */
  const placementsFor = (
    area: ActionArea,
    range: ActionRange | undefined,
  ): ReadonlyArray<NpcPlacement> | undefined => {
    if (!measured) return undefined;
    const cover = (origin: BoardSquare, toward: BoardSquare) =>
      areaSquares(board, {
        shape: area.shape,
        feet: area.feet,
        feetPerCell: board.feetPerCell,
        origin,
        toward,
        ...(area.width === undefined ? {} : { width: area.width }),
      });
    const out: Array<NpcPlacement> = [];
    const seen = new Set<string>();
    const add = (origin: BoardSquare, toward: BoardSquare, excludeSelf: boolean) => {
      const squares = cover(origin, toward);
      const catches = catchesIn(squares, excludeSelf);
      const key = [...catches].sort().join(",");
      if (catches.length === 0 || seen.has(key)) return;
      seen.add(key);
      out.push({ origin, toward, squares, catches });
    };
    if (area.origin === "self") {
      if (area.shape === "cone" || area.shape === "line") {
        for (const { at } of placed) add(from, at, true);
      } else {
        add(from, from, true);
      }
    } else if (range !== undefined) {
      for (const { at } of placed) {
        if (feetBetween(from, at, measure) <= range.normal) add(at, at, false);
      }
    }
    return out;
  };

  /** The spending a feature's usage asks, or why it cannot be had now. */
  const spendingOf = (key: string): NpcSpend | NpcOmission => {
    if (limits.recharge[key] !== undefined) {
      return self.rechargeSpent.includes(key) ? "recharging" : { recharge: key };
    }
    if (limits.uses[key] !== undefined) {
      return leftOf(limits.uses[key], self.usesSpent[key]) > 0 ? { uses: key } : "no uses left";
    }
    return {};
  };

  /** The option a feature is in a slot, before the slot's own rules; `undefined` when it is prose only. */
  const optionOf = (
    id: string,
    slot: NpcSlot,
    feature: CreatureFeature,
    spends: NpcSpend,
  ): NpcTurnOption => {
    const base = { id, slot, name: feature.name, text: feature.desc, spends } as const;
    const range = feature.range;
    if (rollsToHit(feature)) {
      const targets = targetsFor(feature.reach, range);
      return {
        ...base,
        kind: "attack",
        attack: {
          toHit: feature.attackBonus,
          damage: damageOf(feature.damage),
          ...(feature.reach === undefined ? {} : { reach: feature.reach }),
          ...(range === undefined ? {} : { range }),
        },
        // A rider the target saves against once hit (a bite's poison).
        ...(feature.dc === undefined ? {} : { save: saveOf(feature.dc, undefined) }),
        ...(targets === undefined ? {} : { targets }),
      };
    }
    const geometry = {
      ...(feature.area === undefined ? {} : { area: feature.area }),
      ...(feature.area === undefined
        ? (() => {
            const targets = targetsFor(feature.reach, range);
            return targets === undefined ? {} : { targets };
          })()
        : (() => {
            const placements = placementsFor(feature.area, range);
            return placements === undefined ? {} : { placements };
          })()),
    };
    if (feature.dc !== undefined) {
      return { ...base, kind: "save", save: saveOf(feature.dc, feature.damage), ...geometry };
    }
    return { ...base, kind: "feature", ...geometry };
  };

  const options: Array<NpcTurnOption> = [];
  const actionsByName = new Map(
    (statBlock.actions ?? []).map((action) => [actionName(action.name), action] as const),
  );

  /** A section's features as options in `slot`, each through its spending. */
  const featureOptions = (
    section: FeatureSection,
    features: ReadonlyArray<CreatureFeature>,
    slot: NpcSlot,
  ): ReadonlyArray<NpcTurnOption> =>
    features.flatMap((feature): ReadonlyArray<NpcTurnOption> => {
      const key = featureKey(section, feature.name);
      if (feature.spellcasting !== undefined) return [];
      if (/^multiattack$/i.test(feature.name.trim())) return [];
      const spending = spendingOf(key);
      if (typeof spending === "string") {
        omit(key, feature.name, spending);
        return [];
      }
      if (feature.choices !== undefined && feature.choices.length > 0) {
        return feature.choices.map((choice) =>
          optionOf(
            `${key}>${choice.name}`,
            slot,
            { ...feature, ...choice, desc: feature.desc },
            spending,
          ),
        );
      }
      return [optionOf(key, slot, feature, spending)];
    });

  /** A multiattack's strikes, by the actions they name, or why it cannot be made. */
  const strikesOf = (
    items: ReadonlyArray<{ readonly actionName: string; readonly count: number | string }>,
    singles: ReadonlyArray<NpcTurnOption>,
  ): NpcTurnOption["strikes"] | NpcOmission => {
    const strikes: Array<{ option: NpcTurnOption; count: number }> = [];
    for (const item of items) {
      if (typeof item.count !== "number") return "count is not a number";
      const action = actionsByName.get(actionName(item.actionName));
      if (action === undefined) return "names an action it lacks";
      const id = featureKey("actions", action.name);
      const option = singles.find((single) => single.id === id);
      // A strike whose action is spent (a recharge, a use) takes the whole
      // multiattack with it, for the same reason.
      if (option === undefined)
        return omitted.find((entry) => entry.id === id)?.reason ?? "prose only";
      strikes.push({ option, count: item.count });
    }
    return strikes;
  };

  /** A trait typed by hand: an action when it has a to-hit or dice, prose otherwise. */
  const traitOption = (trait: Trait): ReadonlyArray<NpcTurnOption> => {
    const id = `traits/${trait.name}`;
    const toHit = signedNumber(trait.hit);
    const damage = trait.dice === undefined ? [] : [{ dice: trait.dice }];
    if (toHit === undefined && damage.length === 0) {
      omit(id, trait.name, "prose only");
      return [];
    }
    const base = { id, slot: "action" as const, name: trait.name, text: trait.text, spends: {} };
    if (toHit === undefined) {
      const targets = targetsFor(trait.reach, trait.range);
      return [
        {
          ...base,
          kind: "feature",
          ...(trait.area === undefined ? {} : { area: trait.area }),
          ...(targets === undefined ? {} : { targets }),
        },
      ];
    }
    const targets = targetsFor(trait.reach, trait.range);
    return [
      {
        ...base,
        kind: "attack",
        attack: {
          toHit,
          damage,
          ...(trait.reach === undefined ? {} : { reach: trait.reach }),
          ...(trait.range === undefined ? {} : { range: trait.range }),
        },
        ...(targets === undefined ? {} : { targets }),
      },
    ];
  };

  // --- Its action, on its own turn.
  if (up) {
    if (self.actionUsed) {
      omit("action", "Action", "action used");
    } else {
      const singles = featureOptions("actions", statBlock.actions ?? [], "action");
      for (const multiattack of (statBlock.actions ?? []).filter((action) =>
        /^multiattack$/i.test(action.name.trim()),
      )) {
        const key = featureKey("actions", multiattack.name);
        const ways =
          multiattack.multiattackOptions !== undefined && multiattack.multiattackOptions.length > 0
            ? multiattack.multiattackOptions
            : multiattack.actions !== undefined && multiattack.actions.length > 0
              ? [multiattack.actions]
              : [];
        if (ways.length === 0) {
          omit(key, multiattack.name, "prose only");
          continue;
        }
        ways.forEach((items, index) => {
          const id = ways.length === 1 ? key : `${key}#${String(index + 1)}`;
          const strikes = strikesOf(items, singles);
          if (typeof strikes === "string") {
            omit(id, multiattack.name, strikes);
            return;
          }
          options.push({
            id,
            slot: "action",
            kind: "multiattack",
            name: multiattack.name,
            text: multiattack.desc,
            spends: {},
            strikes,
          });
        });
      }
      options.push(...singles);
      // A creature typed by hand writes its attacks as traits, with no section:
      // one with a to-hit or dice is an action, prose alone is left out.
      for (const trait of statBlock.traits) options.push(...traitOption(trait));
      for (const name of STANDARD_ACTIONS) {
        options.push({
          id: `standard/${name}`,
          slot: "action",
          kind: "standard",
          name,
          spends: {},
        });
      }
    }

    // --- Its bonus action.
    const bonuses = [
      ...(statBlock.bonusActions ?? []).map((feature) => ({
        section: "bonusActions" as const,
        feature,
      })),
      ...(statBlock.specialAbilities ?? [])
        .filter((feature) => feature.bonusAction !== undefined)
        .map((feature) => ({ section: "specialAbilities" as const, feature })),
    ];
    if (self.bonusUsed) {
      if (bonuses.length > 0) omit("bonus", "Bonus action", "bonus action used");
    } else {
      for (const { section, feature } of bonuses) {
        for (const option of featureOptions(section, [feature], "bonus")) {
          options.push(
            feature.bonusAction === "triggered" ? { ...option, triggered: true } : option,
          );
        }
      }
    }
  }

  // --- Spells, in whichever slot each is cast with.
  for (const { name: caster, spellcasting } of spellcastingOf(statBlock)) {
    for (const entry of spellcasting.spells) {
      const id = spellKey(caster, entry.name);
      const spell = fight.spells?.get(entry.name.toLowerCase());
      if (spell === undefined) {
        omit(id, entry.name, "spell not supplied");
        continue;
      }
      const slot = castingSlotOf(spell.castingTime);
      if (slot === undefined) {
        omit(id, entry.name, "not cast in combat");
        continue;
      }
      if (slot === "action" && (!up || self.actionUsed)) {
        omit(id, entry.name, up ? "action used" : "not its turn");
        continue;
      }
      if (slot === "bonus" && (!up || self.bonusUsed)) {
        omit(id, entry.name, up ? "bonus action used" : "not its turn");
        continue;
      }
      if (slot === "reaction" && self.reactionUsed) {
        omit(id, entry.name, "reaction used");
        continue;
      }
      let spends: NpcSpend = {};
      if (limits.uses[id] !== undefined) {
        if (leftOf(limits.uses[id], self.usesSpent[id]) === 0) {
          omit(id, entry.name, "no uses left");
          continue;
        }
        spends = { uses: id };
      } else if (entry.level > 0 && entry.usage === undefined) {
        // The lowest slot it can be cast with that has one left.
        const level = Object.keys(spellcasting.slots ?? {})
          .map(Number)
          .filter((slotLevel) => slotLevel >= entry.level)
          .sort((a, b) => a - b)
          .find((slotLevel) => {
            const key = slotKey(caster, slotLevel);
            return leftOf(limits.slots[key], self.slotsSpent[key]) > 0;
          });
        if (level === undefined) {
          omit(id, entry.name, "no slot left");
          continue;
        }
        spends = { slot: slotKey(caster, level) };
      }
      const reach = spellRangeOf(spell.range);
      const area = spellAreaOf(spell.spell.areaOfEffect, reach === "self");
      const range = typeof reach === "number" ? { normal: reach } : undefined;
      const geometry =
        area !== undefined
          ? (() => {
              const placements = placementsFor(area, range);
              return { area, ...(placements === undefined ? {} : { placements }) };
            })()
          : (() => {
              const targets = targetsFor(undefined, range);
              return targets === undefined ? {} : { targets };
            })();
      const base = {
        id,
        slot,
        kind: "spell" as const,
        name: entry.name,
        level: entry.level,
        spends,
        ...(slot === "reaction" ? { triggered: true as const } : {}),
        ...geometry,
      };
      options.push({
        ...base,
        ...(spell.spell.attackType !== undefined && spellcasting.modifier !== undefined
          ? {
              attack: {
                toHit: spellcasting.modifier,
                damage: [],
                ...(range === undefined ? {} : { range }),
              },
            }
          : {}),
        ...(spell.spell.dc !== undefined && spellcasting.dc !== undefined
          ? {
              save: {
                dc: spellcasting.dc,
                ability: spell.spell.dc.dcType.name,
                onSuccess: spell.spell.dc.dcSuccess,
                damage: [],
              },
            }
          : {}),
      });
    }
  }

  // --- Its reaction, on anyone's turn: its own reactions, and an opportunity
  // attack with each of its melee attacks.
  if (self.reactionUsed) {
    omit("reaction", "Reaction", "reaction used");
  } else {
    for (const option of featureOptions("reactions", statBlock.reactions ?? [], "reaction")) {
      options.push({ ...option, triggered: true });
    }
    for (const action of statBlock.actions ?? []) {
      if (action.reach === undefined || !rollsToHit(action)) continue;
      const key = featureKey("actions", action.name);
      const spending = spendingOf(key);
      if (typeof spending === "string") continue;
      const strike = optionOf(`opportunity/${key}`, "reaction", action, spending);
      options.push({ ...strike, name: `Opportunity attack (${action.name})`, triggered: true });
    }
  }

  // --- Legendary actions, at the end of another creature's turn.
  const legendary = statBlock.legendaryActions ?? [];
  if (legendary.length > 0) {
    const left = leftOf(limits.legendaryActions, self.legendarySpent);
    for (const feature of legendary) {
      const key = featureKey("legendaryActions", feature.name);
      const cost = feature.legendaryCost ?? 1;
      if (up) {
        omit(key, feature.name, "its own turn");
        continue;
      }
      if (limits.legendaryActions === undefined || cost > left) {
        omit(key, feature.name, "no legendary actions left");
        continue;
      }
      if (feature.performs !== undefined && feature.performs.length > 0) {
        for (const name of feature.performs) {
          const action = actionsByName.get(actionName(name));
          const id = `${key}>${name}`;
          if (action === undefined) {
            omit(id, feature.name, "names an action it lacks");
            continue;
          }
          const spending = spendingOf(featureKey("actions", action.name));
          if (typeof spending === "string") {
            omit(id, feature.name, spending);
            continue;
          }
          const performed = optionOf(id, "legendary", action, { ...spending, legendary: cost });
          options.push({ ...performed, name: `${feature.name}: ${action.name}` });
        }
        continue;
      }
      const spending = spendingOf(key);
      if (typeof spending === "string") {
        omit(key, feature.name, spending);
        continue;
      }
      options.push(optionOf(key, "legendary", feature, { ...spending, legendary: cost }));
    }
  }

  // --- Where it can still walk.
  let movement: NpcTurnOptions["movement"];
  if (up) {
    const speed = has(self, SPEED_ZERO) ? 0 : walkingFeet(statBlock.speed);
    if (speed === undefined) omit("move", "Move", "speed is not a number");
    else if (!measured) omit("move", "Move", "not on the board");
    else {
      const feetLeft = Math.max(0, speed - self.feetMoved);
      movement = {
        feetLeft,
        squares: reachableSquares(board, {
          from,
          feet: feetLeft,
          occupied: placed.map(({ at }) => at),
          ...measure,
        }),
      };
    }
  } else {
    omit("move", "Move", "not its turn");
  }

  return { combatantId, up, options, ...(movement === undefined ? {} : { movement }), omitted };
};
