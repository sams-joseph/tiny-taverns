import {
  type Combatant,
  type CombatantResources,
  FEATURE_SECTIONS,
  featureKey,
  leftOf,
  npcLimits,
  spellcastingOf,
  spellKey,
  slotKey,
  type StatBlock,
} from "@taverns/api";
import { toast } from "@taverns/ui";
import { Result } from "effect";
import { useCallback } from "react";
import { useMutation } from "../api/mutation";
import type { RunPath } from "./load";
import { newRequestId, type RunController } from "./state";

/**
 * A monster's spending over the fight, the panel's *Resources* block: legendary
 * actions this round, recharge abilities, X/day uses and spell slots. The stat
 * block says how many (`npcLimits`) and the row how many are spent
 * (`Combatant.legendarySpent` and friends), so every count here is the one
 * less the other. The DM sets them both ways with `CombatantResources`.
 */

/** What the DM sends: any of the four, each its whole new value. */
export type ResourcePatch = Omit<CombatantResources, "requestId">;

/** One line of the block, in the stat block's order. */
export type ResourceRow =
  | {
      readonly kind: "legendary";
      readonly key: "legendary";
      readonly label: string;
      readonly left: number;
      readonly max: number;
    }
  | {
      readonly kind: "recharge";
      readonly key: string;
      readonly label: string;
      /** The lowest d6 face that recharges it. */
      readonly on: number;
      readonly spent: boolean;
    }
  | {
      readonly kind: "uses" | "slots";
      readonly key: string;
      readonly label: string;
      readonly left: number;
      readonly max: number;
    };

/**
 * The lines a creature's stat block gives it, with what its row has spent.
 * Empty for a party member (its resources are its sheet's) and for a creature
 * with nothing to spend, so the panel draws no block for either.
 */
export const resourceRows = (
  combatant: Combatant,
  statBlock: StatBlock | undefined,
): ReadonlyArray<ResourceRow> => {
  if (combatant.kind === "pc" || statBlock === undefined) return [];
  const limits = npcLimits(statBlock);
  const rows: Array<ResourceRow> = [];
  if (limits.legendaryActions !== undefined) {
    rows.push({
      kind: "legendary",
      key: "legendary",
      label: "Legendary actions",
      left: leftOf(limits.legendaryActions, combatant.legendarySpent),
      max: limits.legendaryActions,
    });
  }
  for (const section of FEATURE_SECTIONS) {
    for (const feature of statBlock[section] ?? []) {
      const key = featureKey(section, feature.name);
      const on = limits.recharge[key];
      if (on !== undefined) {
        rows.push({
          kind: "recharge",
          key,
          label: feature.name,
          on,
          spent: combatant.rechargeSpent.includes(key),
        });
      }
      const max = limits.uses[key];
      if (max !== undefined) {
        rows.push({
          kind: "uses",
          key,
          label: feature.name,
          left: leftOf(max, combatant.usesSpent[key]),
          max,
        });
      }
    }
  }
  const casters = spellcastingOf(statBlock);
  for (const { name, spellcasting } of casters) {
    // The feature's name only when there is more than one to tell apart.
    const of = casters.length > 1 ? ` (${name})` : "";
    for (const [level, count] of Object.entries(spellcasting.slots ?? {})) {
      const key = slotKey(name, level);
      if (limits.slots[key] === undefined) continue;
      rows.push({
        kind: "slots",
        key,
        label: `Level ${level} slots${of}`,
        left: leftOf(count, combatant.slotsSpent[key]),
        max: count,
      });
    }
    for (const spell of spellcasting.spells) {
      const key = spellKey(name, spell.name);
      const max = limits.uses[key];
      if (max === undefined) continue;
      rows.push({
        kind: "uses",
        key,
        label: `${spell.name}${of}`,
        left: leftOf(max, combatant.usesSpent[key]),
        max,
      });
    }
  }
  return rows;
};

/** The patch that leaves `row` at `left` (a count) or spent or not (a recharge). */
export const patchFor = (
  combatant: Combatant,
  row: ResourceRow,
  next: number | boolean,
): ResourcePatch => {
  if (row.kind === "legendary") {
    return { legendarySpent: row.max - Math.max(0, Math.min(row.max, Number(next))) };
  }
  if (row.kind === "recharge") {
    const others = combatant.rechargeSpent.filter((key) => key !== row.key);
    return { rechargeSpent: next === true ? [...others, row.key] : others };
  }
  const spent = row.max - Math.max(0, Math.min(row.max, Number(next)));
  const map = row.kind === "uses" ? combatant.usesSpent : combatant.slotsSpent;
  const { [row.key]: _was, ...rest } = map;
  const written = spent === 0 ? rest : { ...rest, [row.key]: spent };
  return row.kind === "uses" ? { usesSpent: written } : { slotsSpent: written };
};

/**
 * The resources write. Not optimistic, as the turn's ticks are not: the block
 * waits for the answer and shows the row it carries. Nothing outside the fight
 * reads it, so it names no reads.
 */
export function useResources(path: RunPath, controller: RunController) {
  const mutation = useMutation();
  const { submit } = mutation;
  const { applyCombatant } = controller;

  const set = useCallback(
    async (combatant: Combatant, patch: ResourcePatch) => {
      const written = await submit(
        (client) =>
          client.combatants.resources({
            params: { ...path, combatantId: combatant.id },
            payload: { ...patch, requestId: newRequestId() },
          }),
        [],
      );
      if (Result.isSuccess(written)) {
        applyCombatant(written.success);
        return;
      }
      toast.add({
        type: "destructive",
        title: `${combatant.displayName}'s resources are unchanged`,
        description: "That did not reach the server. The block shows what it holds.",
      });
    },
    [submit, path, applyCombatant],
  );

  return { busy: mutation.busy, set };
}
