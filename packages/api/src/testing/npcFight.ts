import { readFileSync } from "node:fs";
import type { Combatant } from "../Combatant.js";
import type { StatBlock } from "../Creature.js";
import type { CombatantId, CreatureId, EncounterRunId } from "../Ids.js";
import {
  type NpcSpell,
  type NpcTurnFight,
  type NpcTurnOption,
  npcTurnOptions,
} from "../NpcTurnOptions.js";

/**
 * Real SRD stat blocks, as the import writes them (`fixtures/srd-turn.json`,
 * which `apps/server/test/srd-turn-fixture.test.ts` holds to the import), set
 * on a 5-foot board in fights built square by square.
 */
export const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/srd-turn.json", import.meta.url), "utf8"),
) as {
  readonly statBlocks: Record<string, StatBlock>;
  readonly starter: Record<string, StatBlock>;
  readonly spells: Record<string, NpcSpell>;
};

export const block = (name: string): StatBlock => {
  const found = fixture.statBlocks[name] ?? fixture.starter[name];
  if (found === undefined) throw new Error(`no fixture stat block for ${name}`);
  return found;
};

export const spells = new Map(Object.entries(fixture.spells));

let made = 0;
const idFor = () => `00000000-0000-4000-8000-${String(++made).padStart(12, "0")}`;

export interface Row {
  readonly name: string;
  readonly at: readonly [number, number] | null;
  readonly kind?: "pc" | "npc";
  /** Omit and the kind decides, as an add by hand does. */
  readonly side?: "party" | "foes";
  readonly creature?: string;
  readonly hp?: number;
  readonly conditions?: ReadonlyArray<string>;
  readonly over?: Partial<Combatant>;
}

/** A row as the creator's read answers it; the options read fields, never the class. */
export const combatant = (row: Row, creatureIds: Map<string, CreatureId>): Combatant =>
  ({
    id: idFor() as CombatantId,
    encounterRunId: "00000000-0000-4000-8000-0000000000aa" as EncounterRunId,
    characterId: null,
    creatureId: row.creature === undefined ? null : (creatureIds.get(row.creature) ?? null),
    displayName: row.name,
    subtitle: null,
    playerName: null,
    initiative: 10,
    initiativeBonus: 0,
    initiativeSetBy: "dm",
    hpCurrent: row.hp ?? 20,
    hpMax: 20,
    ac: 15,
    kind: row.kind ?? (row.creature === undefined ? "pc" : "npc"),
    side:
      row.side ??
      ((row.kind ?? (row.creature === undefined ? "pc" : "npc")) === "pc" ? "party" : "foes"),
    conditions: row.conditions ?? [],
    deathSaves: null,
    visibility: "dm",
    position: row.at === null ? null : { column: row.at[0], row: row.at[1] },
    actionUsed: false,
    bonusUsed: false,
    reactionUsed: false,
    feetMoved: 0,
    legendarySpent: 0,
    rechargeSpent: [],
    usesSpent: {},
    slotsSpent: {},
    portrait: null,
    origin: "authored",
    assistantTurnId: null,
    createdAt: undefined,
    updatedAt: undefined,
    ...row.over,
  }) as unknown as Combatant;

/**
 * A fight on a 20 by 20 board of 5-foot squares, the first row up unless
 * `up` names another, everyone else as listed.
 */
export const fightOf = (
  rows: ReadonlyArray<Row>,
  { up, board = true }: { readonly up?: string; readonly board?: boolean } = {},
) => {
  const creatureIds = new Map<string, CreatureId>();
  const statBlocks = new Map<CreatureId, StatBlock>();
  for (const row of rows) {
    if (row.creature !== undefined && !creatureIds.has(row.creature)) {
      const id = idFor() as CreatureId;
      creatureIds.set(row.creature, id);
      statBlocks.set(id, block(row.creature));
    }
  }
  const combatants = rows.map((row) => combatant(row, creatureIds));
  const byName = (name: string) => combatants.find((row) => row.displayName === name)!;
  const fight: NpcTurnFight = {
    run: { phase: "turns", activeCombatantId: byName(up ?? rows[0]!.name).id, endedAt: null },
    combatants,
    board: board ? { columns: 20, rows: 20, feetPerCell: 5 } : undefined,
    diagonals: "five",
    statBlocks,
    spells,
  };
  return { fight, byName, optionsOf: (name: string) => npcTurnOptions(fight, byName(name).id) };
};

export const ids = (options: ReadonlyArray<NpcTurnOption>) => options.map((option) => option.id);
export const option = (options: ReadonlyArray<NpcTurnOption>, id: string) => {
  const found = options.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no option ${id} among ${ids(options).join(", ")}`);
  return found;
};
