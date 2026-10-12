import {
  type Combatant,
  type CombatantId,
  type CreatureId,
  type DiagonalRule,
  type EncounterRun,
  type EncounterRunBoard,
  type NpcTurnOption,
  type NpcTurnOptions,
  npcTurnOptions,
  type StatBlock,
} from "@taverns/api";
import type { ActionLine } from "./actions";

/**
 * The runner's reading of `npcTurnOptions` (`packages/api`): the same rule the
 * server will check an NPC's turn against, over the fight the screen already
 * holds. It draws two things from it: a multiattack the DM runs strike by
 * strike, and the targets an attack's reach or range does not take in, marked
 * while one is picked. The DM's dice stay this screen's.
 *
 * Spells are not passed: the runner reads no spell rows, so the options leave
 * spells out (`spell not supplied`) and the panel offers none of its own.
 */

/** What the runner holds that the options read. */
export interface RunOptionsSource {
  readonly run: Pick<EncounterRun, "phase" | "activeCombatantId" | "endedAt">;
  readonly combatants: ReadonlyArray<Combatant>;
  readonly board: Pick<EncounterRunBoard, "columns" | "rows" | "feetPerCell"> | null | undefined;
  readonly diagonals: DiagonalRule;
  readonly statBlocks: ReadonlyMap<CreatureId, StatBlock>;
}

/** The options for one combatant, or `undefined` for a party member, whose turn is its player's. */
export const runOptionsFor = (
  source: RunOptionsSource,
  combatant: Combatant,
): NpcTurnOptions | undefined =>
  combatant.kind === "pc"
    ? undefined
    : npcTurnOptions(
        {
          run: source.run,
          combatants: source.combatants,
          board: source.board ?? undefined,
          diagonals: source.diagonals,
          statBlocks: source.statBlocks,
        },
        combatant.id,
      );

/** `action:Bite` (a line of `actionsOf`) is the option `actions/Bite`; `trait:Claw` is `traits/Claw`. */
export const optionIdOf = (line: Pick<ActionLine, "key">): string | undefined => {
  const [section, ...rest] = line.key.split(":");
  const name = rest.join(":");
  if (section === "action") return `actions/${name}`;
  if (section === "bonus") return `bonusActions/${name}`;
  if (section === "trait") return `traits/${name}`;
  return undefined;
};

/** The panel's line for an attack option: the same to-hit and damage the option carries. */
const lineOf = (option: NpcTurnOption): ActionLine | undefined =>
  option.attack === undefined
    ? undefined
    : {
        key: option.id.replace(/^actions\//, "action:").replace(/^traits\//, "trait:"),
        name: option.name,
        toHit: option.attack.toHit,
        damage: option.attack.damage.map(({ dice, type }) => ({ dice, type: type?.toLowerCase() })),
        save:
          option.save === undefined
            ? undefined
            : `DC ${String(option.save.dc)} ${option.save.ability}`,
      };

/** One way of taking a multiattack: its name, what it says, and the attack rolls it makes, in order. */
export interface MultiattackRun {
  readonly id: string;
  readonly name: string;
  /** `Bite, then Claw ×2`, every strike, the ones that roll no attack too. */
  readonly summary: string;
  /** Each attack roll, a strike made twice listed twice. */
  readonly strikes: ReadonlyArray<ActionLine>;
}

/**
 * The multiattacks the options offer now, each as the attack rolls the DM
 * runs in sequence. A strike that rolls no attack (a dragon's Frightful
 * Presence, a mummy lord's glare) is named in the summary and left to its own
 * line; a multiattack with no attack roll at all is not offered here.
 */
export const multiattacksOf = (
  options: NpcTurnOptions | undefined,
): ReadonlyArray<MultiattackRun> =>
  (options?.options ?? []).flatMap((option) => {
    if (option.kind !== "multiattack" || option.strikes === undefined) return [];
    const strikes = option.strikes.flatMap(({ option: strike, count }) => {
      const line = lineOf(strike);
      return line === undefined ? [] : Array.from({ length: count }, () => line);
    });
    if (strikes.length === 0) return [];
    const summary = option.strikes
      .map(({ option: strike, count }) =>
        count > 1 ? `${strike.name} ×${String(count)}` : strike.name,
      )
      .join(", then ");
    return [{ id: option.id, name: option.name, summary, strikes }];
  });

/**
 * The options as reach and range see them: the attacker's action and bonus
 * action unspent. Where a line reaches is the board's question, not the
 * turn's, and the first strike of a multiattack spends the action the rest of
 * its strikes are part of.
 */
export const rangeOptionsFor = (
  source: RunOptionsSource,
  combatant: Combatant,
): NpcTurnOptions | undefined =>
  runOptionsFor(
    {
      ...source,
      combatants: source.combatants.map((row) =>
        row.id === combatant.id
          ? ({ ...row, actionUsed: false, bonusUsed: false } as Combatant)
          : row,
      ),
    },
    combatant,
  );

const bandOf = (
  options: NpcTurnOptions | undefined,
  line: Pick<ActionLine, "key">,
  band: "out" | "long",
): ReadonlySet<CombatantId> => {
  const id = optionIdOf(line);
  const option = options?.options.find((entry) => entry.id === id);
  return new Set(
    (option?.targets ?? [])
      .filter((target) => target.band === band)
      .map((target) => target.combatantId),
  );
};

/**
 * Who the line's reach and range do not take in — marked while its target is
 * picked, never refused: the DM moves the miniatures, and may know better.
 * Empty when the options measured nothing (no board, or the attacker is off it).
 */
export const outOfRangeFor = (options: NpcTurnOptions | undefined, line: Pick<ActionLine, "key">) =>
  bandOf(options, line, "out");

/** Who the line takes in only at long range, at disadvantage. */
export const longRangeFor = (options: NpcTurnOptions | undefined, line: Pick<ActionLine, "key">) =>
  bandOf(options, line, "long");
