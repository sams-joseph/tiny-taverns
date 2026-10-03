import type { CharacterSheet, CreatureFeature, StatBlock, SheetAction, Trait } from "@taverns/api";

/**
 * The selected creature's *Actions* list (`Encounter Runner.dc.html`): one line
 * per thing it rolls for, each a name and the numbers behind it —
 * `Longsword · +7 to hit · 1d8+4 slashing`.
 *
 * Pure, and the one reading of the two places those numbers live:
 *
 * - **A monster's stat block.** An imported creature writes its attacks as
 *   source features (`StatBlock.actions` and `bonusActions`, with
 *   `attackBonus`, `damage` and a save `dc`); one typed in the bestiary or by
 *   Hob writes them as traits (`hit` and `dice`). A block may carry both, and
 *   both are read, actions first, in the block's own order.
 * - **A party member's sheet** (`sheet.actions`), the same lines the player's
 *   sheet draws, through the party read the runner already holds.
 *
 * **A line is listed only when it rolls**: a to-hit, damage dice or a save DC.
 * Prose with no numbers — *Multiattack*, *Nimble Escape*, a spell with no roll —
 * is the stat block's to show in full, under the disclosure below the list.
 * A row the DM typed in mid-fight has neither a block nor a sheet, so its list
 * is empty and the panel draws none.
 */
export interface ActionLine {
  /** Unique within one list; the sheet's own id, or the block's section and name. */
  readonly key: string;
  readonly name: string;
  /** What is added to the d20, when it is an attack roll. */
  readonly toHit: number | undefined;
  /** Each damage (or healing) roll, its notation and its type when written. */
  readonly damage: ReadonlyArray<{ readonly dice: string; readonly type: string | undefined }>;
  /** `DC 13 Dexterity`, when the target saves rather than the attacker rolls. */
  readonly save: string | undefined;
}

/** `+7`, `-1`, `+0`. */
const signed = (value: number): string => `${value >= 0 ? "+" : ""}${String(value)}`;

/** `"+5"` (or `"5"`) as a number; `"—"`, the "does not roll to hit" mark, as none. */
const parseHit = (hit: string | undefined): number | undefined => {
  const match = hit === undefined ? null : /^\s*([+-]?\d+)\s*$/.exec(hit);
  return match === null ? undefined : Number(match[1]);
};

const nonEmpty = (text: string | undefined): string | undefined => {
  const trimmed = text?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

const rolls = (line: ActionLine): boolean =>
  line.toHit !== undefined || line.damage.length > 0 || line.save !== undefined;

const fromFeature =
  (section: string) =>
  (feature: CreatureFeature): ActionLine => ({
    key: `${section}:${feature.name}`,
    name: feature.name,
    toHit: feature.attackBonus,
    damage: (feature.damage ?? []).flatMap((entry) => {
      const dice = nonEmpty(entry.damageDice);
      return dice === undefined ? [] : [{ dice, type: entry.damageType?.name.toLowerCase() }];
    }),
    save:
      feature.dc === undefined
        ? undefined
        : `DC ${String(feature.dc.dcValue)} ${feature.dc.dcType.name}`,
  });

const fromTrait = (trait: Trait): ActionLine => {
  const dice = nonEmpty(trait.dice);
  return {
    key: `trait:${trait.name}`,
    name: trait.name,
    toHit: parseHit(trait.hit),
    damage: dice === undefined ? [] : [{ dice, type: undefined }],
    save: undefined,
  };
};

const fromSheet = (action: SheetAction): ActionLine => {
  const dice = nonEmpty(action.dice);
  return {
    key: action.id,
    name: action.name,
    toHit: parseHit(action.hit),
    damage: dice === undefined ? [] : [{ dice, type: nonEmpty(action.damageType)?.toLowerCase() }],
    save: undefined,
  };
};

/**
 * What the panel lists for a combatant: from the stat block when it was seeded
 * from a creature this credential can still read, from the sheet when it was
 * seeded from a party member whose sheet the party read carries, and nothing
 * otherwise. A combatant has at most one of the two (`Combatant.ts`).
 */
export const actionsOf = (source: {
  readonly statBlock?: StatBlock | undefined;
  readonly sheet?: CharacterSheet | undefined;
}): ReadonlyArray<ActionLine> => {
  const lines: Array<ActionLine> =
    source.statBlock !== undefined
      ? [
          ...(source.statBlock.actions ?? []).map(fromFeature("action")),
          ...(source.statBlock.bonusActions ?? []).map(fromFeature("bonus")),
          ...source.statBlock.traits.map(fromTrait),
        ]
      : (source.sheet?.actions ?? []).map(fromSheet);
  const seen = new Set<string>();
  return lines.filter((line) => {
    if (!rolls(line) || seen.has(line.key)) return false;
    seen.add(line.key);
    return true;
  });
};

/** `+7 to hit · 1d8+4 slashing`, `DC 13 Dexterity · 4d6 fire`. */
export const actionDetail = (line: ActionLine): string =>
  [
    line.toHit === undefined ? undefined : `${signed(line.toHit)} to hit`,
    line.save,
    ...line.damage.map(({ dice, type }) => (type === undefined ? dice : `${dice} ${type}`)),
  ]
    .filter((part): part is string => part !== undefined)
    .join(" · ");
