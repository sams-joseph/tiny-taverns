/**
 * The effects' shapes, as SVG path data and points in the board's plane: a
 * flame petal, a four-pointed spark, a jagged bolt, and a seeded scatter of
 * embers, so one effect draws the same however often it renders.
 */

/** A teardrop from the origin to `length` along −y, `width` across at its belly. */
export const petal = (length: number, width: number): string =>
  `M 0 0 C ${String(width)} ${String(-length * 0.3)} ${String(width * 0.6)} ${String(-length * 0.8)} 0 ${String(-length)} ` +
  `C ${String(-width * 0.6)} ${String(-length * 0.8)} ${String(-width)} ${String(-length * 0.3)} 0 0 Z`;

/** A four-pointed spark about the origin, `size` to each point. */
export const spark = (size: number): string => {
  const waist = size * 0.2;
  return [
    `M 0 ${String(-size)}`,
    `L ${String(waist)} ${String(-waist)}`,
    `L ${String(size)} 0`,
    `L ${String(waist)} ${String(waist)}`,
    `L 0 ${String(size)}`,
    `L ${String(-waist)} ${String(waist)}`,
    `L ${String(-size)} 0`,
    `L ${String(-waist)} ${String(-waist)} Z`,
  ].join(" ");
};

/** A small deterministic random from a seed, so a render and a re-render agree. */
export const seeded = (seed: number): (() => number) => {
  let state = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A jagged bolt from `a` to `b`: `segments` kinks, each up to `amplitude` off the straight line. */
export const jagged = (
  a: Point,
  b: Point,
  segments: number,
  amplitude: number,
  random: () => number,
): string => {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  const points: Array<string> = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const off = i === 0 || i === segments ? 0 : (random() - 0.5) * 2 * amplitude;
    points.push(
      `${String(a.x + (b.x - a.x) * t + normal.x * off)},${String(a.y + (b.y - a.y) * t + normal.y * off)}`,
    );
  }
  return points.join(" ");
};

/** One ember: where it starts, where it is flung, how far it falls, its size and when it goes. */
export interface Ember {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly fall: number;
  readonly r: number;
  readonly delay: number;
  /** 0 the glow's colour, 1 the body's, 2 the core's. */
  readonly shade: 0 | 1 | 2;
}

/**
 * A scatter of embers flung from `at`: `count` of them, `reach` far at most,
 * within `spread` radians of `heading` (a full circle by default).
 */
export const embers = (
  at: Point,
  count: number,
  reach: number,
  size: number,
  random: () => number,
  heading = 0,
  spread = Math.PI * 2,
): ReadonlyArray<Ember> =>
  Array.from({ length: count }, (_, i) => {
    const angle = heading + (random() - 0.5) * spread;
    const distance = reach * (0.35 + random() * 0.65);
    return {
      x: at.x,
      y: at.y,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      fall: reach * 0.25 * random(),
      r: size * (0.5 + random() * 0.7),
      delay: random() * 0.15,
      shade: (i % 3) as 0 | 1 | 2,
    };
  });
