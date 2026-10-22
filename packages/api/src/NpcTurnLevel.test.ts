import { describe, expect, it } from "vitest";
import type { CombatantId } from "./Ids.js";
import type { PlayerLiveLevel, RunBoardLevel } from "./LevelFight.js";
import { LEVEL_MATERIALS, type LevelAmbient } from "./LevelKit.js";
import {
  combineModes,
  coverBonus,
  coveredAc,
  playerCover,
  saveCoverBonus,
  saveCoverLine,
  sensesOf,
  sightMode,
} from "./LevelRules.js";
import { npcMomentRefusal, npcTurnCheck } from "./NpcTurnCheck.js";
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

  it("adds cover from an area's origin to a Dexterity save alone, and total cover is out", () => {
    expect(saveCoverBonus("half", "DEX")).toBe(2);
    expect(saveCoverBonus("threeQuarters", "Dexterity")).toBe(5);
    expect(saveCoverBonus("half", "WIS")).toBe(0);
    expect(saveCoverBonus("none", "DEX")).toBe(0);
    expect(saveCoverBonus("total", "WIS")).toBeNull();
    expect(saveCoverLine("half")).toBe("Half cover: +2 to a Dex save");
    expect(saveCoverLine("threeQuarters")).toBe("Three-quarters cover: +5 to a Dex save");
    expect(saveCoverLine("none")).toBeUndefined();
  });
});

describe("cover as a player's table can tell it", () => {
  const board = { columns: 10, rows: 10, feetPerCell: 5 };
  /** The party's view: `seen` squares of flagstone, these walls and props. */
  const view = (
    seen: ReadonlyArray<number>,
    parts: Partial<Pick<PlayerLiveLevel, "walls" | "props">> = {},
  ): PlayerLiveLevel => ({
    ambient: "bright",
    sees: seen,
    seen,
    floor: seen.map(() => FLAGSTONE),
    walls: [],
    props: [],
    lights: [],
    regions: [],
    ...parts,
  });
  const row = (r: number, from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, k) => r * 10 + from + k);
  const strip = [...row(4, 0, 9), ...row(5, 0, 9), ...row(6, 0, 9)];
  const me = { column: 1, row: 5 };
  const it5 = { column: 6, row: 5 };

  it("reads the party's view as the server reads the fight's copy", () => {
    expect(playerCover(board, view(strip), me, it5)).toBe("none");
    const crated = view(strip, {
      props: [
        {
          id: "c" as never,
          kind: "crate",
          x: 3,
          y: 5,
          rotation: 0,
          blocksMovement: null,
          blocksSight: null,
          cover: null,
          difficult: null,
        },
      ],
    });
    expect(playerCover(board, crated, me, it5)).toBe("half");
    const walled = view(strip, {
      walls: [
        {
          id: "w" as never,
          x1: 4,
          y1: 0,
          x2: 4,
          y2: 10,
          kind: "wall",
          doorState: null,
          low: false,
        },
      ],
    });
    expect(playerCover(board, walled, me, it5)).toBe("total");
  });

  it("says nothing when the party has not seen every square between", () => {
    const gap = strip.filter((square) => square !== 5 * 10 + 4);
    expect(playerCover(board, view(gap), me, it5)).toBeUndefined();
    // Squares off the rectangle the two span do not matter.
    const narrow = row(5, 1, 6);
    expect(playerCover(board, view(narrow), me, it5)).toBe("none");
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

  it("takes no turn for Hob while it sees none of its foes, and does once it sees one", () => {
    const walled = fight(levelOf({ walls: divide })).optionsOf("Goblin");
    expect(walled.sight?.seesFoe).toBe(false);
    expect(npcMomentRefusal(walled, "turn")).toBe("it sees none of its foes yet");
    // A reaction is asked for with its trigger, so it is still the asker's call.
    expect(npcMomentRefusal(walled, "reaction")).not.toBe("it sees none of its foes yet");
    const open = fight(levelOf()).optionsOf("Goblin");
    expect(open.sight?.seesFoe).toBe(true);
    expect(npcMomentRefusal(open, "turn")).toBeUndefined();
    // An ally in plain view is not a foe found.
    const friends = fightOf(
      [
        { name: "Goblin", creature: "Goblin", at: [5, 5] },
        { name: "Boss", creature: "Goblin", at: [6, 5] },
        { name: "Tamsin", at: [12, 5] },
      ],
      { level: levelOf({ walls: divide }) },
    ).optionsOf("Goblin");
    expect(npcMomentRefusal(friends, "turn")).toBe("it sees none of its foes yet");
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

describe("an area on a level", () => {
  /**
   * The dragon at (2,5) breathes east. Tamsin at (6,5) has a crate at (4,5)
   * between them; Ilse at (7,4) stands in the open; Bo at (8,7) is boxed in
   * by four walls.
   */
  const breath = () => {
    const box = [wall(8, 7, 9, 7), wall(9, 7, 9, 8), wall(8, 8, 9, 8), wall(8, 7, 8, 8)];
    return fightOf(
      [
        { name: "Dragon", creature: "Adult Red Dragon", at: [2, 5] },
        { name: "Tamsin", at: [6, 5] },
        { name: "Ilse", at: [7, 4] },
        { name: "Bo", at: [8, 7] },
      ],
      { level: levelOf({ walls: box, props: [crate(4, 5)] }) },
    );
  };

  it("catches nobody behind total cover from its origin, and says who has cover", () => {
    const { optionsOf, byName } = breath();
    const placements = option(optionsOf("Dragon").options, "actions/Fire Breath").placements!;
    const toward = placements.find(
      (placement) => placement.toward.column === 6 && placement.toward.row === 5,
    );
    expect(toward).toBeDefined();
    expect(toward!.squares).toContainEqual({ column: 8, row: 7 });
    expect([...toward!.catches].sort()).toEqual([byName("Tamsin").id, byName("Ilse").id].sort());
    expect(toward!.covers).toEqual({ [byName("Tamsin").id]: "half" });
    // Bo is in nobody's catch, wherever it goes.
    expect(placements.some((placement) => placement.catches.includes(byName("Bo").id))).toBe(false);
  });

  it("carries the covers into the checked step", () => {
    const { fight, byName } = breath();
    const check = npcTurnCheck(
      fight,
      byName("Dragon").id,
      "turn",
      [{ option: "actions/Fire Breath", square: { column: 6, row: 5 } }],
      named,
    );
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.steps[0]).toMatchObject({
      placement: { covers: { [byName("Tamsin").id]: "half" } },
    });
  });

  it("is the plain template on a plain grid", () => {
    const { optionsOf, byName } = fightOf([
      { name: "Dragon", creature: "Adult Red Dragon", at: [2, 5] },
      { name: "Bo", at: [8, 7] },
    ]);
    const [placement] = option(optionsOf("Dragon").options, "actions/Fire Breath").placements!;
    expect(placement?.catches).toEqual([byName("Bo").id]);
    expect(placement?.covers).toBeUndefined();
  });
});

describe("a monster's turn checked on a level", () => {
  it("refuses a move through a wall, and a shot at what it cannot see", () => {
    const { fight, byName } = fightOf(
      [
        { name: "Goblin", creature: "Goblin", at: [5, 5] },
        { name: "Tamsin", at: [11, 5] },
        // On its side of the wall, so it has found the party and takes its turn.
        { name: "Ilse", at: [2, 2] },
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
