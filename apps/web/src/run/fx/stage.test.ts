import { describe, expect, it } from "vitest";
import { embers, jagged, seeded } from "./shapes";
import { boardStage } from "./stage";

const stage = () => boardStage({ box: () => null, standing: () => [] });
const settled = async (promise: Promise<void>) => {
  let done = false;
  void promise.then(() => (done = true));
  await Promise.resolve();
  await Promise.resolve();
  return done;
};

describe("a number waiting for its blow", () => {
  const square = { column: 3, row: 4 };

  it("plays at once with nothing coming at its square", async () => {
    expect(await settled(stage().landing(square))).toBe(true);
  });

  it("waits for every blow coming at its square, and no other", async () => {
    const board = stage();
    board.expect(square);
    board.expect(square);
    const waiting = board.landing(square);
    board.landed({ column: 9, row: 9 });
    expect(await settled(waiting)).toBe(false);
    board.landed(square);
    expect(await settled(waiting)).toBe(false);
    board.landed(square);
    expect(await settled(waiting)).toBe(true);
    expect(await settled(board.landing(square))).toBe(true);
  });

  it("does nothing to a board it cannot see", () => {
    const board = stage();
    expect(() => {
      board.shake(4, 100);
      board.recoil([], { x: 1, y: 0 }, 3);
    }).not.toThrow();
  });
});

describe("the effects' shapes", () => {
  it("scatter and crackle the same for the same seed", () => {
    const a = embers({ x: 0, y: 0 }, 5, 10, 1, seeded(7));
    const b = embers({ x: 0, y: 0 }, 5, 10, 1, seeded(7));
    expect(a).toEqual(b);
    expect(jagged({ x: 0, y: 0 }, { x: 10, y: 0 }, 4, 2, seeded(3))).toBe(
      jagged({ x: 0, y: 0 }, { x: 10, y: 0 }, 4, 2, seeded(3)),
    );
  });

  it("starts and ends a bolt exactly where it is aimed", () => {
    const points = jagged({ x: 1, y: 2 }, { x: 9, y: 8 }, 6, 3, seeded(1)).split(" ");
    expect(points[0]).toBe("1,2");
    expect(points.at(-1)).toBe("9,8");
  });
});
