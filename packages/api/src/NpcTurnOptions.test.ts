import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Combatant } from "./Combatant.js";
import type { StatBlock } from "./Creature.js";
import type { CombatantId, CreatureId, EncounterRunId } from "./Ids.js";
import {
  type NpcSpell,
  type NpcTurnFight,
  type NpcTurnOption,
  npcTurnOptions,
  STANDARD_ACTIONS,
} from "./NpcTurnOptions.js";

/**
 * Real SRD stat blocks, as the import writes them (`fixtures/srd-turn.json`,
 * which `apps/server/test/srd-turn-fixture.test.ts` holds to the import), set
 * on a 5-foot board in fights built square by square.
 */
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/srd-turn.json", import.meta.url), "utf8"),
) as {
  readonly statBlocks: Record<string, StatBlock>;
  readonly starter: Record<string, StatBlock>;
  readonly spells: Record<string, NpcSpell>;
};

const block = (name: string): StatBlock => {
  const found = fixture.statBlocks[name] ?? fixture.starter[name];
  if (found === undefined) throw new Error(`no fixture stat block for ${name}`);
  return found;
};

const spells = new Map(Object.entries(fixture.spells));

let made = 0;
const idFor = () => `00000000-0000-4000-8000-${String(++made).padStart(12, "0")}`;

interface Row {
  readonly name: string;
  readonly at: readonly [number, number] | null;
  readonly kind?: "pc" | "npc";
  readonly creature?: string;
  readonly hp?: number;
  readonly conditions?: ReadonlyArray<string>;
  readonly over?: Partial<Combatant>;
}

/** A row as the creator's read answers it; the options read fields, never the class. */
const combatant = (row: Row, creatureIds: Map<string, CreatureId>): Combatant =>
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
const fightOf = (
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

const ids = (options: ReadonlyArray<NpcTurnOption>) => options.map((option) => option.id);
const option = (options: ReadonlyArray<NpcTurnOption>, id: string) => {
  const found = options.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no option ${id} among ${ids(options).join(", ")}`);
  return found;
};
const bands = (entry: NpcTurnOption, byName: (name: string) => Combatant) =>
  Object.fromEntries(
    (entry.targets ?? []).map((target) => [
      [...["Ilse", "Tamsin", "Brannoc", "Pim", "Wren"]].find(
        (name) => byName(name)?.id === target.combatantId,
      ) ?? target.combatantId,
      target.band,
    ]),
  );

describe("a goblin's turn", () => {
  const goblin = () =>
    fightOf([
      { name: "Goblin", creature: "Goblin", at: [5, 5] },
      { name: "Ilse", at: [6, 5] },
      { name: "Tamsin", at: [11, 5] },
      { name: "Brannoc", at: [25 - 5, 5] },
      { name: "Pim", at: null },
    ]);

  it("bands each target by the attack's reach and its two ranges", () => {
    const { optionsOf, byName } = goblin();
    const { options } = optionsOf("Goblin");
    expect(bands(option(options, "actions/Scimitar"), byName)).toEqual({
      Ilse: "reach",
      Tamsin: "out",
      Brannoc: "out",
    });
    // 30 feet is within 80, 75 feet is too; nobody is past 320.
    expect(bands(option(options, "actions/Shortbow"), byName)).toEqual({
      Ilse: "normal",
      Tamsin: "normal",
      Brannoc: "normal",
    });
    expect(option(options, "actions/Scimitar").attack).toEqual({
      toHit: 4,
      damage: [{ dice: "1d6+2", type: "Slashing" }],
      reach: 5,
    });
  });

  it("leaves a creature off the board out of every target list", () => {
    const { optionsOf, byName } = goblin();
    const scimitar = option(optionsOf("Goblin").options, "actions/Scimitar");
    expect(scimitar.targets?.map((target) => target.combatantId)).not.toContain(byName("Pim").id);
  });

  it("offers its bonus action, the eight standard actions, and the squares it can walk to", () => {
    const { optionsOf } = goblin();
    const turn = optionsOf("Goblin");
    expect(option(turn.options, "specialAbilities/Nimble Escape")).toMatchObject({
      slot: "bonus",
      kind: "feature",
    });
    expect(option(turn.options, "specialAbilities/Nimble Escape").triggered).toBeUndefined();
    expect(
      turn.options.filter((entry) => entry.kind === "standard").map((entry) => entry.name),
    ).toEqual([...STANDARD_ACTIONS]);
    expect(turn.movement?.feetLeft).toBe(30);
    // Six squares any way, cut at the board's edge five squares off (columns
    // and rows 0 to 11), less its own square and the two others stand on.
    expect(turn.movement?.squares).toHaveLength(12 * 12 - 3);
  });

  it("offers no action once it is used, and says so", () => {
    const { fight, byName } = goblin();
    const used = {
      ...fight,
      combatants: fight.combatants.map((row) =>
        row.displayName === "Goblin"
          ? ({ ...row, actionUsed: true, feetMoved: 20 } as Combatant)
          : row,
      ),
    };
    const turn = npcTurnOptions(used, byName("Goblin").id);
    expect(turn.options.filter((entry) => entry.slot === "action")).toEqual([]);
    expect(turn.omitted).toContainEqual({ id: "action", name: "Action", reason: "action used" });
    expect(ids(turn.options)).toContain("specialAbilities/Nimble Escape");
    expect(turn.movement?.feetLeft).toBe(10);
  });

  it("offers only its reactions off its own turn, and no movement", () => {
    const { optionsOf } = fightOf(
      [
        { name: "Ilse", at: [6, 5] },
        { name: "Goblin", creature: "Goblin", at: [5, 5] },
      ],
      { up: "Ilse" },
    );
    const turn = optionsOf("Goblin");
    expect(turn.up).toBe(false);
    expect(new Set(turn.options.map((entry) => entry.slot))).toEqual(new Set(["reaction"]));
    expect(ids(turn.options)).toEqual(["opportunity/actions/Scimitar"]);
    expect(turn.movement).toBeUndefined();
  });

  it("gives the same ids for the same fight, so a proposal can name one", () => {
    const { optionsOf } = goblin();
    expect(ids(optionsOf("Goblin").options)).toEqual(ids(optionsOf("Goblin").options));
  });
});

describe("conditions and the fight's state", () => {
  it("offers a stunned, paralysed or unconscious creature nothing", () => {
    for (const condition of ["Stunned", "Paralyzed", "Unconscious", "Incapacitated"]) {
      const { optionsOf } = fightOf([
        { name: "Goblin", creature: "Goblin", at: [5, 5], conditions: [condition] },
        { name: "Ilse", at: [6, 5] },
      ]);
      const turn = optionsOf("Goblin");
      expect(turn.options).toEqual([]);
      expect(turn.omitted).toEqual([{ id: "*", name: "Goblin", reason: "incapacitated" }]);
    }
  });

  it("lets a grappled creature act but not walk", () => {
    const { optionsOf } = fightOf([
      { name: "Goblin", creature: "Goblin", at: [5, 5], conditions: ["Grappled"] },
      { name: "Ilse", at: [6, 5] },
    ]);
    const turn = optionsOf("Goblin");
    expect(ids(turn.options)).toContain("actions/Scimitar");
    expect(turn.movement).toEqual({ feetLeft: 0, squares: [] });
  });

  it("offers a monster at zero nothing, and leaves it out of everyone's targets", () => {
    const { optionsOf, byName } = fightOf([
      { name: "Orc", creature: "Orc", at: [5, 5] },
      { name: "Goblin", creature: "Goblin", at: [6, 5], hp: 0 },
    ]);
    expect(optionsOf("Goblin").omitted).toEqual([
      { id: "*", name: "Goblin", reason: "out of the fight" },
    ]);
    const greataxe = option(optionsOf("Orc").options, "actions/Greataxe");
    expect(greataxe.targets?.map((target) => target.combatantId)).not.toContain(
      byName("Goblin").id,
    );
  });

  it("offers nothing while the fight is rolling initiative", () => {
    const { fight, byName } = fightOf([
      { name: "Goblin", creature: "Goblin", at: [5, 5] },
      { name: "Ilse", at: [6, 5] },
    ]);
    const rolling = {
      ...fight,
      run: { ...fight.run, phase: "initiative" as const, activeCombatantId: null },
    };
    expect(npcTurnOptions(rolling, byName("Goblin").id).omitted).toEqual([
      { id: "*", name: "Goblin", reason: "not taking turns" },
    ]);
  });

  it("measures nothing on a fight with no board, and lists the options all the same", () => {
    const { optionsOf } = fightOf(
      [
        { name: "Goblin", creature: "Goblin", at: null },
        { name: "Ilse", at: null },
      ],
      { board: false },
    );
    const turn = optionsOf("Goblin");
    expect(option(turn.options, "actions/Scimitar").targets).toBeUndefined();
    expect(turn.movement).toBeUndefined();
    expect(turn.omitted).toContainEqual({ id: "move", name: "Move", reason: "not on the board" });
  });
});

describe("reach and to-hit at the edges", () => {
  it("reaches only a creature in its own space with reach 0", () => {
    const { optionsOf, byName } = fightOf([
      { name: "Swarm of Rats", creature: "Swarm of Rats", at: [5, 5] },
      { name: "Ilse", at: [5, 5] },
      { name: "Tamsin", at: [6, 5] },
    ]);
    expect(bands(option(optionsOf("Swarm of Rats").options, "actions/Bites"), byName)).toEqual({
      Ilse: "reach",
      Tamsin: "out",
    });
  });

  it("keeps a +0 to-hit an attack", () => {
    const { optionsOf } = fightOf([
      { name: "Cat", creature: "Cat", at: [5, 5] },
      { name: "Ilse", at: [6, 5] },
    ]);
    expect(option(optionsOf("Cat").options, "actions/Claws")).toMatchObject({
      kind: "attack",
      attack: { toHit: 0 },
    });
  });

  it("bands a thrown weapon as melee within reach and ranged beyond it", () => {
    const { optionsOf, byName } = fightOf([
      { name: "Orc", creature: "Orc", at: [0, 0] },
      { name: "Ilse", at: [1, 0] },
      { name: "Tamsin", at: [4, 0] },
      { name: "Brannoc", at: [19, 19] },
    ]);
    // 95 feet is past the javelin's 30 and within its 120.
    expect(bands(option(optionsOf("Orc").options, "actions/Javelin"), byName)).toEqual({
      Ilse: "reach",
      Tamsin: "normal",
      Brannoc: "long",
    });
  });

  it("writes a hand-typed creature's rolling traits as its actions, and leaves its prose out", () => {
    const { optionsOf } = fightOf([
      { name: "Goblin Boss", creature: "Goblin Boss", at: [5, 5] },
      { name: "Ilse", at: [6, 5] },
    ]);
    const turn = optionsOf("Goblin Boss");
    expect(option(turn.options, "traits/Scimitar")).toMatchObject({
      kind: "feature",
      targets: [{ band: "reach" }],
    });
    expect(turn.omitted).toEqual(
      expect.arrayContaining([
        { id: "traits/Multiattack", name: "Multiattack", reason: "prose only" },
        { id: "traits/Nimble Escape", name: "Nimble Escape", reason: "prose only" },
      ]),
    );
  });
});

describe("a multiattack", () => {
  it("breaks into its strikes, each with its own targets", () => {
    const { optionsOf } = fightOf([
      { name: "Adult Red Dragon", creature: "Adult Red Dragon", at: [5, 5] },
      { name: "Ilse", at: [7, 5] },
    ]);
    const multiattack = option(optionsOf("Adult Red Dragon").options, "actions/Multiattack");
    expect(multiattack.strikes?.map(({ option: strike, count }) => [strike.id, count])).toEqual([
      ["actions/Frightful Presence", 1],
      ["actions/Bite", 1],
      ["actions/Claw", 2],
    ]);
    // Ilse is 10 feet off: in the bite's reach, not the claw's.
    const [, bite, claw] = multiattack.strikes ?? [];
    expect(bite?.option.targets?.[0]?.band).toBe("reach");
    expect(claw?.option.targets?.[0]?.band).toBe("out");
  });

  it("offers each of its alternatives under its own id", () => {
    const { optionsOf } = fightOf([
      { name: "Bandit Captain", creature: "Bandit Captain", at: [5, 5] },
      { name: "Ilse", at: [6, 5] },
    ]);
    const options = optionsOf("Bandit Captain").options;
    expect(
      [1, 2].map((n) =>
        option(options, `actions/Multiattack#${String(n)}`).strikes?.map(
          ({ option: strike, count }) => [strike.name, count],
        ),
      ),
    ).toEqual([
      [
        ["Scimitar", 2],
        ["Dagger", 1],
      ],
      [["Dagger", 2]],
    ]);
  });

  it("finds a strike the source names otherwise than the action", () => {
    const { optionsOf } = fightOf([
      { name: "Vampire", creature: "Vampire, Vampire Form", at: [5, 5] },
      { name: "Ilse", at: [6, 5] },
    ]);
    // `"Unarmed Strike (Vampire Form Only)"` is the Unarmed Strike action.
    const [first] = ids(optionsOf("Vampire").options).filter((id) =>
      id.startsWith("actions/Multiattack"),
    );
    const multiattack = option(optionsOf("Vampire").options, first!);
    expect(multiattack.strikes?.map(({ option: strike }) => strike.id)).toEqual([
      "actions/Unarmed Strike",
      "actions/Bite",
    ]);
  });

  it("strikes with a save-based action where its stat block says so", () => {
    const { optionsOf } = fightOf([
      { name: "Mummy Lord", creature: "Mummy Lord", at: [5, 5] },
      { name: "Ilse", at: [6, 5] },
    ]);
    const [glare] = option(optionsOf("Mummy Lord").options, "actions/Multiattack").strikes ?? [];
    expect(glare?.option).toMatchObject({
      kind: "save",
      save: { dc: 16, ability: "WIS" },
      targets: [{ band: "normal" }],
    });
  });
});

describe("save-based and area actions", () => {
  const dragon = (over: Partial<Combatant> = {}) =>
    fightOf([
      { name: "Adult Red Dragon", creature: "Adult Red Dragon", at: [5, 5], over },
      { name: "Ilse", at: [6, 5] },
      { name: "Tamsin", at: [9, 5] },
      { name: "Brannoc", at: [5, 15] },
    ]);

  it("gives a breath weapon its DC, ability and each aim's catch", () => {
    const { optionsOf, byName } = dragon();
    const breath = option(optionsOf("Adult Red Dragon").options, "actions/Fire Breath");
    expect(breath).toMatchObject({
      kind: "save",
      save: { dc: 21, ability: "DEX", damage: [{ dice: "18d6", type: "Fire" }] },
      area: { shape: "cone", feet: 60, origin: "self" },
      spends: { recharge: "actions/Fire Breath" },
    });
    const catches = (breath.placements ?? []).map((placement) =>
      placement.catches
        .map((id) =>
          byName("Ilse").id === id ? "Ilse" : byName("Tamsin").id === id ? "Tamsin" : "Brannoc",
        )
        .sort(),
    );
    // Aimed east, both in the line of it; aimed south, Brannoc alone.
    expect(catches).toEqual([["Ilse", "Tamsin"], ["Brannoc"]]);
  });

  it("leaves a breath that is recharging out, and the multiattack in", () => {
    const { optionsOf } = dragon({ rechargeSpent: ["actions/Fire Breath"] });
    const turn = optionsOf("Adult Red Dragon");
    expect(ids(turn.options)).not.toContain("actions/Fire Breath");
    expect(ids(turn.options)).toContain("actions/Multiattack");
    expect(turn.omitted).toContainEqual({
      id: "actions/Fire Breath",
      name: "Fire Breath",
      reason: "recharging",
    });
  });

  it("offers each of a metallic dragon's breaths, which share one recharge", () => {
    const fresh = fightOf([
      { name: "Adult Brass Dragon", creature: "Adult Brass Dragon", at: [5, 5] },
      { name: "Ilse", at: [8, 5] },
    ]);
    const options = fresh.optionsOf("Adult Brass Dragon").options;
    expect(option(options, "actions/Breath Weapons>Fire Breath")).toMatchObject({
      save: { dc: 18, ability: "DEX", onSuccess: "half" },
      area: { shape: "line", feet: 60 },
      spends: { recharge: "actions/Breath Weapons" },
    });
    expect(option(options, "actions/Breath Weapons>Sleep Breath")).toMatchObject({
      save: { dc: 18, ability: "CON" },
      area: { shape: "cone", feet: 60 },
      spends: { recharge: "actions/Breath Weapons" },
    });
    const spent = fightOf([
      {
        name: "Adult Brass Dragon",
        creature: "Adult Brass Dragon",
        at: [5, 5],
        over: { rechargeSpent: ["actions/Breath Weapons"] },
      },
      { name: "Ilse", at: [8, 5] },
    ]);
    expect(
      ids(spent.optionsOf("Adult Brass Dragon").options).filter((id) => id.includes("Breath")),
    ).toEqual([]);
  });

  it("covers a 10-foot-wide line three squares across", () => {
    const { optionsOf } = fightOf([
      { name: "Ancient Blue Dragon", creature: "Ancient Blue Dragon", at: [0, 10] },
      { name: "Ilse", at: [19, 10] },
    ]);
    const [aim] =
      option(optionsOf("Ancient Blue Dragon").options, "actions/Lightning Breath").placements ?? [];
    expect(new Set(aim?.squares.map((square) => square.row))).toEqual(new Set([9, 10, 11]));
  });

  it("centres an area placed at a point on each creature within its range", () => {
    const { optionsOf, byName } = fightOf([
      { name: "Storm Giant", creature: "Storm Giant", at: [0, 0] },
      { name: "Ilse", at: [10, 10] },
      { name: "Tamsin", at: [11, 10] },
    ]);
    const strike = option(optionsOf("Storm Giant").options, "actions/Lightning Strike");
    expect(strike.area).toEqual({ shape: "sphere", feet: 10, origin: "point" });
    // Centred on either, the 10-foot burst takes in both: one placement.
    expect(strike.placements?.map((placement) => [...placement.catches].sort())).toEqual([
      [byName("Ilse").id, byName("Tamsin").id].sort(),
    ]);
  });
});

describe("legendary actions", () => {
  const between = (over: Partial<Combatant> = {}) =>
    fightOf(
      [
        { name: "Ilse", at: [6, 5] },
        { name: "Adult Red Dragon", creature: "Adult Red Dragon", at: [5, 5], over },
      ],
      { up: "Ilse" },
    );

  it("are taken on another creature's turn, each at its cost", () => {
    const options = between()
      .optionsOf("Adult Red Dragon")
      .options.filter((entry) => entry.slot === "legendary");
    expect(options.map((entry) => [entry.id, entry.spends.legendary])).toEqual([
      ["legendaryActions/Detect", 1],
      ["legendaryActions/Tail Attack>Tail", 1],
      ["legendaryActions/Wing Attack (Costs 2 Actions)", 2],
    ]);
    // The tail attack is the Tail action's own numbers.
    expect(option(options, "legendaryActions/Tail Attack>Tail").attack).toMatchObject({
      toHit: 14,
      reach: 15,
    });
  });

  it("leave out what costs more than is left this round", () => {
    const turn = between({ legendarySpent: 2 }).optionsOf("Adult Red Dragon");
    expect(ids(turn.options.filter((entry) => entry.slot === "legendary"))).toEqual([
      "legendaryActions/Detect",
      "legendaryActions/Tail Attack>Tail",
    ]);
    expect(turn.omitted).toContainEqual({
      id: "legendaryActions/Wing Attack (Costs 2 Actions)",
      name: "Wing Attack (Costs 2 Actions)",
      reason: "no legendary actions left",
    });
  });

  it("are not taken on its own turn", () => {
    const { optionsOf } = fightOf([
      { name: "Adult Red Dragon", creature: "Adult Red Dragon", at: [5, 5] },
      { name: "Ilse", at: [6, 5] },
    ]);
    const turn = optionsOf("Adult Red Dragon");
    expect(turn.options.filter((entry) => entry.slot === "legendary")).toEqual([]);
    expect(turn.omitted).toContainEqual({
      id: "legendaryActions/Detect",
      name: "Detect",
      reason: "its own turn",
    });
  });

  it("offer each action one names as an alternative", () => {
    const { optionsOf } = fightOf(
      [
        { name: "Ilse", at: [6, 5] },
        { name: "Kraken", creature: "Kraken", at: [5, 5] },
      ],
      { up: "Ilse" },
    );
    const options = optionsOf("Kraken").options;
    expect(ids(options)).toEqual(
      expect.arrayContaining([
        "legendaryActions/Tentacle Attack or Fling>Tentacle",
        "legendaryActions/Tentacle Attack or Fling>Fling",
        "legendaryActions/Lightning Storm (Costs 2 Actions)>Lightning Storm",
      ]),
    );
    expect(option(options, "legendaryActions/Tentacle Attack or Fling>Tentacle")).toMatchObject({
      kind: "attack",
      attack: { reach: 30 },
    });
  });
});

describe("reactions", () => {
  it("offer the stat block's own and an opportunity attack with each melee attack, flagged triggered", () => {
    const { optionsOf } = fightOf(
      [
        { name: "Ilse", at: [6, 5] },
        { name: "Bandit Captain", creature: "Bandit Captain", at: [5, 5] },
      ],
      { up: "Ilse" },
    );
    const options = optionsOf("Bandit Captain").options;
    expect(ids(options)).toEqual([
      "reactions/Parry",
      "opportunity/actions/Scimitar",
      "opportunity/actions/Dagger",
    ]);
    expect(options.every((entry) => entry.triggered === true)).toBe(true);
    expect(option(options, "opportunity/actions/Dagger").targets?.[0]?.band).toBe("reach");
  });

  it("are gone once its reaction is spent", () => {
    const { optionsOf } = fightOf(
      [
        { name: "Ilse", at: [6, 5] },
        {
          name: "Bandit Captain",
          creature: "Bandit Captain",
          at: [5, 5],
          over: { reactionUsed: true },
        },
      ],
      { up: "Ilse" },
    );
    const turn = optionsOf("Bandit Captain");
    expect(turn.options).toEqual([]);
    expect(turn.omitted).toContainEqual({
      id: "reaction",
      name: "Reaction",
      reason: "reaction used",
    });
  });
});

describe("bonus actions", () => {
  it("offer one waiting on a trigger, flagged so", () => {
    const { optionsOf } = fightOf([
      { name: "Lion", creature: "Lion", at: [5, 5] },
      { name: "Ilse", at: [6, 5] },
    ]);
    expect(option(optionsOf("Lion").options, "specialAbilities/Pounce")).toMatchObject({
      slot: "bonus",
      triggered: true,
    });
  });

  it("are gone once the bonus action is spent", () => {
    const { optionsOf } = fightOf([
      { name: "Orc", creature: "Orc", at: [5, 5], over: { bonusUsed: true } },
      { name: "Ilse", at: [6, 5] },
    ]);
    const turn = optionsOf("Orc");
    expect(turn.options.filter((entry) => entry.slot === "bonus")).toEqual([]);
    expect(turn.omitted).toContainEqual({
      id: "bonus",
      name: "Bonus action",
      reason: "bonus action used",
    });
  });
});

describe("spellcasting", () => {
  const lich = (over: Partial<Combatant> = {}, up = "Lich") =>
    fightOf(
      [
        { name: "Lich", creature: "Lich", at: [5, 5], over },
        { name: "Ilse", at: [12, 5] },
        { name: "Tamsin", at: [13, 5] },
      ],
      { up: up === "Lich" ? "Lich" : "Ilse" },
    );

  it("spends the lowest slot left that can cast it", () => {
    const fresh = option(lich().optionsOf("Lich").options, "spell/Spellcasting/Magic Missile");
    expect(fresh).toMatchObject({
      slot: "action",
      level: 1,
      spends: { slot: "slot/Spellcasting/1" },
    });
    const upcast = option(
      lich({ slotsSpent: { "slot/Spellcasting/1": 4 } }).optionsOf("Lich").options,
      "spell/Spellcasting/Magic Missile",
    );
    expect(upcast.spends).toEqual({ slot: "slot/Spellcasting/2" });
  });

  it("leaves a spell out when no slot can cast it", () => {
    const spent = Object.fromEntries(
      [6, 7, 8, 9].map((level) => [`slot/Spellcasting/${String(level)}`, 1]),
    );
    const turn = lich({ slotsSpent: spent }).optionsOf("Lich");
    expect(turn.omitted).toContainEqual({
      id: "spell/Spellcasting/Disintegrate",
      name: "Disintegrate",
      reason: "no slot left",
    });
    expect(ids(turn.options)).toContain("spell/Spellcasting/Fireball");
  });

  it("casts a cantrip for nothing, with the caster's to-hit", () => {
    const { optionsOf, byName } = lich();
    const ray = option(optionsOf("Lich").options, "spell/Spellcasting/Ray of Frost");
    expect(ray).toMatchObject({
      level: 0,
      spends: {},
      attack: { toHit: 12, range: { normal: 60 } },
    });
    expect(bands(ray, byName)).toEqual({ Ilse: "normal", Tamsin: "normal" });
  });

  it("places an area spell and gives its save the caster's DC", () => {
    const fireball = option(lich().optionsOf("Lich").options, "spell/Spellcasting/Fireball");
    expect(fireball).toMatchObject({
      area: { shape: "sphere", feet: 20, origin: "point" },
      save: { dc: 20, ability: "DEX" },
    });
    expect(fireball.placements).toHaveLength(1);
  });

  it("casts a reaction spell off its turn, and an action spell only on it", () => {
    const turn = lich({}, "Ilse").optionsOf("Lich");
    expect(option(turn.options, "spell/Spellcasting/Shield")).toMatchObject({
      slot: "reaction",
      triggered: true,
    });
    expect(turn.omitted).toContainEqual({
      id: "spell/Spellcasting/Fireball",
      name: "Fireball",
      reason: "not its turn",
    });
  });

  it("leaves out a spell that takes longer than a turn", () => {
    expect(lich().optionsOf("Lich").omitted).toContainEqual({
      id: "spell/Spellcasting/Animate Dead",
      name: "Animate Dead",
      reason: "not cast in combat",
    });
  });

  it("counts an innate spell's uses a day, and leaves one out when they are gone", () => {
    const fresh = fightOf([
      { name: "Drow", creature: "Drow", at: [5, 5] },
      { name: "Ilse", at: [8, 5] },
    ]);
    const options = fresh.optionsOf("Drow").options;
    expect(option(options, "spell/Innate Spellcasting/Darkness").spends).toEqual({
      uses: "spell/Innate Spellcasting/Darkness",
    });
    expect(option(options, "spell/Innate Spellcasting/Dancing Lights").spends).toEqual({});
    const spent = fightOf([
      {
        name: "Drow",
        creature: "Drow",
        at: [5, 5],
        over: { usesSpent: { "spell/Innate Spellcasting/Darkness": 1 } },
      },
      { name: "Ilse", at: [8, 5] },
    ]);
    expect(spent.optionsOf("Drow").omitted).toContainEqual({
      id: "spell/Innate Spellcasting/Darkness",
      name: "Darkness",
      reason: "no uses left",
    });
  });

  it("casts a bonus-action spell in the bonus slot", () => {
    const { optionsOf } = fightOf([
      { name: "Priest", creature: "Priest", at: [5, 5] },
      { name: "Ilse", at: [8, 5] },
    ]);
    const options = optionsOf("Priest").options;
    expect(option(options, "spell/Spellcasting/Spiritual Weapon")).toMatchObject({
      slot: "bonus",
      level: 2,
    });
    expect(option(options, "specialAbilities/Divine Eminence")).toMatchObject({ slot: "bonus" });
  });

  it("leaves out a spell the caller did not supply, rather than guessing its slot", () => {
    const { fight, byName } = lich();
    const turn = npcTurnOptions({ ...fight, spells: new Map() }, byName("Lich").id);
    expect(turn.options.filter((entry) => entry.kind === "spell")).toEqual([]);
    expect(turn.omitted).toContainEqual({
      id: "spell/Spellcasting/Fireball",
      name: "Fireball",
      reason: "spell not supplied",
    });
  });
});
