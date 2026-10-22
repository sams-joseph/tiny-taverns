import { LEVEL_PROP_KINDS, partyVision, withinVisibility } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { generatedLevel, smallLevel } from "./level.fixtures";
import {
  describeFloor,
  describeLights,
  describeProps,
  describeScene,
  describeVision,
  describeWalls,
  dmReader,
  leafEnd,
  lightBlockers,
  partyReader,
} from "./scene";

describe("the scene a level draws", () => {
  it("hands the floor over as one byte a square", () => {
    const level = smallLevel();
    const floor = describeFloor(level);
    expect(floor.materials).toHaveLength(level.columns * level.rows);
    expect(floor.materials[1 * level.columns + 1]).toBe(1);
    expect(floor.materials[0]).toBe(0);
  });

  it("draws a door as jambs and a leaf, and a shut secret door as wall", () => {
    const level = smallLevel();
    const walls = describeWalls(level, dmReader(level));
    expect(walls.doors.map((d) => d.id)).toEqual(["door-east"]);
    expect(walls.solid).toHaveLength(level.walls.length - 1);
    const door = walls.doors[0]!;
    expect(door.open).toBe(false);
    expect(door.hinge).toEqual({ x: 7, y: 3.14 });
    expect(door.length).toBeCloseTo(0.72);
    // Swung all the way, the leaf stands a quarter turn from the wall.
    const open = leafEnd(door, 1);
    expect(open.x).toBeCloseTo(7 - 0.72);
    expect(open.y).toBeCloseTo(3.14);
  });

  it("shows an open secret door as a door to the DM, and as a wall to the party", () => {
    const base = smallLevel();
    const level = {
      ...base,
      walls: base.walls.map((w) =>
        w.id === "secret-south" ? { ...w, doorState: "open" as const } : w,
      ),
    };
    expect(describeWalls(level, dmReader(level)).doors.map((d) => d.id)).toContain("secret-south");
    expect(describeWalls(level, partyReader).doors.map((d) => d.id)).not.toContain("secret-south");
  });

  it("keeps one DM reader per walls array", () => {
    const level = smallLevel();
    expect(dmReader(level)).toBe(dmReader({ ...level }));
    expect(dmReader(level)).not.toBe(dmReader({ ...level, walls: [...level.walls] }));
  });

  it("groups props by kind, centred on their footprints, and hides DM-only ones from the party", () => {
    const base = smallLevel();
    const level = {
      ...base,
      props: [
        ...base.props,
        { ...base.props[1]!, id: "secret-crate", x: 9, y: 8, rotation: 1, dmOnly: true },
      ],
    };
    const dm = describeProps(level, dmReader(level));
    expect([...dm.keys()]).toEqual([...LEVEL_PROP_KINDS]);
    expect(dm.get("crate")).toEqual([
      { id: "crate", cx: 2.5, cy: 2.5, rotation: 0 },
      { id: "secret-crate", cx: 9.5, cy: 8.5, rotation: 1 },
    ]);
    expect(
      describeProps(level, partyReader)
        .get("crate")!
        .map((p) => p.id),
    ).toEqual(["crate"]);
  });

  it("lights every lit light and every prop's own, with radii in squares", () => {
    const level = smallLevel();
    const lights = describeLights(level, lightBlockers(level, dmReader(level)));
    expect(lights.map((l) => [l.id, l.fromProp, l.bright, l.dim, l.flicker])).toEqual([
      ["torch", false, 4, 4, true],
      ["brazier", true, 2, 2, true],
    ]);
    const unlit = { ...level, lights: level.lights.map((l) => ({ ...l, lit: false })) };
    expect(describeLights(unlit, lightBlockers(unlit, dmReader(unlit))).map((l) => l.id)).toEqual([
      "brazier",
    ]);
  });

  it("stops a light's fan at the walls", () => {
    const level = smallLevel();
    const torch = describeLights(level, lightBlockers(level, dmReader(level)))[0]!;
    // Inside the room, within reach: lit. Through the north wall: not.
    expect(withinVisibility(torch.polygon, { x: 2.5, y: 2 })).toBe(true);
    expect(withinVisibility(torch.polygon, { x: 2.5, y: 0.5 })).toBe(false);
    // Out through the shut east door: not; with it open, the corridor is.
    expect(withinVisibility(torch.polygon, { x: 8.2, y: 3.5 })).toBe(false);
  });

  it("sees what partyVision sees", () => {
    const level = smallLevel();
    const viewers = [{ id: "v", name: "Ash", column: 2, row: 5, darkvision: 60 }];
    const vision = describeVision(level, viewers, partyReader);
    expect(vision.sees).toEqual(
      partyVision(level, [{ square: { column: 2, row: 5 }, darkvision: 60 }], {
        revealed: partyReader.revealed,
      }),
    );
    expect(vision.viewers[0]!.darkvision).toBe(12);
    expect(vision.sees).not.toContain(0);
  });

  it("describes a 200-square level as one batch a prop kind", () => {
    const level = generatedLevel(7, 200, 200);
    const scene = describeScene(level, dmReader(level));
    expect(level.props.length).toBeGreaterThan(500);
    const batches = [...scene.props.values()].filter((list) => list.length > 0).length;
    expect(batches).toBeLessThanOrEqual(LEVEL_PROP_KINDS.length);
    expect([...scene.props.values()].reduce((n, list) => n + list.length, 0)).toBe(
      level.props.length,
    );
    expect(scene.lights.length).toBeGreaterThan(50);
  });
});
