import { describe, expect, it } from "vitest";
import type { CombatantId } from "./Ids.js";
import type { RunBoardLevel } from "./LevelFight.js";
import { LEVEL_MATERIALS, type LevelAmbient } from "./LevelKit.js";
import { combineModes, coverBonus, coveredAc, sensesOf, sightMode } from "./LevelRules.js";
import { npcTurnCheck } from "./NpcTurnCheck.js";
import { fightOf, option } from "./testing/npcFight.js";

const FLAGSTONE = LEVEL_MATERIALS.indexOf("flagstone");
const WATER = LEVEL_MATERIALS.indexOf("water");

type Wall = RunBoardLevel["walls"][number];
type Prop = RunBoardLevel["props"][number];

/** A 20 × 20 flagstone level, as a fight's copy carries it. */
const levelOf = (
  parts: Partial<Omit<RunBoardLevel, "ambient">> & { readonly ambient?: LevelAmbient } = {},
): RunBoardLevel => ({
  ambient: "bright",
  floor: Array.from({ length: 400 }, () => FLAGSTONE),
  walls: [],
  props: [],
  lights: [],
  regions: [],
  ...parts,
});

const wall = (x1: number, y1: number, x2: number, y2: number, parts: Partial<Wall> = {}): Wall =>
  ({
    id: `w${String(x1)}${String(y1)}${String(x2)}${String(y2)}`,
    x1,
    y1,
    x2,
    y2,
    kind: "wall",
    doorState: null,
    low: false,
    revealed: false,
    ...parts,
  }) as Wall;

const crate = (x: number, y: number): Prop =>
  ({
    id: `crate${String(x)}${String(y)}`,
    kind: "crate",
    x,
    y,
    rotation: 0,
    blocksMovement: null,
    blocksSight: null,
    cover: null,
    difficult: null,
    dmOnly: false,
  }) as Prop;

/** A wall down the line x = 8 from top to bottom: nothing passes it. */
const divide = [wall(8, 0, 8, 20)];
const named = (id: CombatantId) => `#${id.slice(-2)}`;

describe("the level rules", () => {
  it("reads senses off a stat block, and says what it could not read", () => {
    expect(sensesOf({ darkvision: "60 ft.", passive_perception: 9 })).toEqual({
      senses: { darkvision: 60, blindsight: 0, truesight: 0 },
      unread: [],
    });
    expect(sensesOf({ blindsight: "10 ft. (blind beyond this radius)", truesight: 120 })).toEqual({
      senses: { darkvision: 0, blindsight: 10, truesight: 120 },
      unread: [],
    });
    expect(sensesOf({ darkvision: "as far as it likes" }).unread).toEqual([
      "darkvision as far as it likes",
    ]);
    expect(sensesOf(undefined).senses.darkvision).toBe(0);
  });

  it("adds cover to AC, and cancels advantage against disadvantage", () => {
    expect([coverBonus("none"), coverBonus("half"), coverBonus("threeQuarters")]).toEqual([
      0, 2, 5,
    ]);
    expect(coverBonus("total")).toBeNull();
    expect(coveredAc(15, "half")).toBe(17);
    expect(coveredAc(null, "half")).toBeNull();
    expect(combineModes(["advantage", "disadvantage", "advantage"])).toBe("normal");
    expect(combineModes(["normal", "advantage"])).toBe("advantage");
    expect(sightMode({ attackerSees: false, targetSees: true })).toBe("disadvantage");
    expect(sightMode({ attackerSees: true, targetSees: false })).toBe("advantage");
  });
});

describe("a monster's options on a level", () => {
  const fight = (level: RunBoardLevel, at: readonly [number, number] = [11, 5]) =>
    fightOf(
      [
        { name: "Goblin", creature: "Goblin", at: [5, 5] },
        { name: "Tamsin", at },
      ],
      { level },
    );

  it("leaves out a target behind total cover, and says why", () => {
    const { optionsOf, byName } = fight(levelOf({ walls: divide }));
    const turn = optionsOf("Goblin");
    expect(option(turn.options, "actions/Shortbow").targets).toEqual([]);
    expect(turn.sight?.hidden).toEqual([
      { combatantId: byName("Tamsin").id, reason: "total cover" },
    ]);
  });

  it("puts each target's cover on it", () => {
    const { optionsOf } = fight(levelOf({ props: [crate(8, 5)] }));
    const [target] = option(optionsOf("Goblin").options, "actions/Shortbow").targets!;
    expect(target?.cover).toBe("half");
    const open = fight(levelOf());
    expect(option(open.optionsOf("Goblin").options, "actions/Shortbow").targets?.[0]?.cover).toBe(
      "none",
    );
  });

  it("sees a target in the dark by darkvision, and has advantage on one that cannot see it", () => {
    const { optionsOf } = fight(levelOf({ ambient: "dark" }));
    // 30 feet away, within the goblin's 60 feet of darkvision; Tamsin has none.
    const [target] = option(optionsOf("Goblin").options, "actions/Shortbow").targets!;
    expect(target).toMatchObject({ cover: "none", unseenByTarget: true });
  });

  it("does not see a target in the dark past its darkvision", () => {
    const { optionsOf, byName } = fight(levelOf({ ambient: "dark" }), [18, 5]);
    const turn = optionsOf("Goblin");
    expect(option(turn.options, "actions/Shortbow").targets).toEqual([]);
    expect(turn.sight?.hidden).toEqual([
      { combatantId: byName("Tamsin").id, reason: "out of sight" },
    ]);
  });

  it("does not see a target in the dark with no darkvision at all", () => {
    const { optionsOf } = fightOf(
      [
        { name: "Bandit Captain", creature: "Bandit Captain", at: [5, 5] },
        { name: "Tamsin", at: [7, 5] },
      ],
      { level: levelOf({ ambient: "dark" }) },
    );
    const turn = optionsOf("Bandit Captain");
    expect(turn.sight?.hidden.map((entry) => entry.reason)).toEqual(["out of sight"]);
    expect(turn.sight?.senses).toEqual({ darkvision: 0, blindsight: 0, truesight: 0 });
  });

  it("walks round walls, not through them, and pays double for difficult terrain", () => {
    const walled = fight(levelOf({ walls: divide }));
    const squares = walled.optionsOf("Goblin").movement!.squares;
    expect(squares.length).toBeGreaterThan(0);
    expect(squares.every((square) => square.column < 8)).toBe(true);

    // A pool of water from column 6 on: each square of it costs 10 feet.
    const floor = Array.from({ length: 400 }, (_, at) => (at % 20 >= 6 ? WATER : FLAGSTONE));
    const wading = fight(levelOf({ floor }));
    const reach = wading.optionsOf("Goblin").movement!.squares;
    // 5 feet to column 6? No: into the water is 10, then 10 a square, so 30
    // feet takes it three squares east (to column 8), not six.
    expect(Math.max(...reach.filter((square) => square.row === 5).map((s) => s.column))).toBe(8);
  });
});

describe("a monster's turn checked on a level", () => {
  it("refuses a move through a wall, and a shot at what it cannot see", () => {
    const { fight, byName } = fightOf(
      [
        { name: "Goblin", creature: "Goblin", at: [5, 5] },
        { name: "Tamsin", at: [11, 5] },
      ],
      { level: levelOf({ walls: divide }) },
    );
    const goblin = byName("Goblin").id;
    const through = npcTurnCheck(
      fight,
      goblin,
      "turn",
      [{ option: "move", square: { column: 9, row: 5 } }],
      named,
    );
    expect(through).toMatchObject({ ok: false, step: 0 });
    expect(!through.ok && through.reason).toMatch(/walled off/);
    const shot = npcTurnCheck(
      fight,
      goblin,
      "turn",
      [{ option: "actions/Shortbow", targets: [byName("Tamsin").id] }],
      named,
    );
    expect(!shot.ok && shot.reason).toMatch(/total cover/);
  });

  it("counts a move's feet by the walk, and carries the target's cover", () => {
    const floor = Array.from({ length: 400 }, (_, at) => (at === 5 * 20 + 6 ? WATER : FLAGSTONE));
    const { fight, byName } = fightOf(
      [
        { name: "Goblin", creature: "Goblin", at: [5, 5] },
        { name: "Tamsin", at: [11, 5] },
      ],
      { level: levelOf({ floor, props: [crate(9, 5)] }) },
    );
    const tamsin = byName("Tamsin").id;
    const check = npcTurnCheck(
      fight,
      byName("Goblin").id,
      "turn",
      [
        // Through the water square straight on would be 5 + 10; round it is 10.
        { option: "move", square: { column: 7, row: 5 } },
        { option: "actions/Shortbow", targets: [tamsin] },
      ],
      named,
    );
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.steps[0]).toEqual({ kind: "move", to: { column: 7, row: 5 }, feet: 10 });
    expect(check.steps[1]).toMatchObject({ aims: { [tamsin]: { cover: "half" } } });
  });
});
