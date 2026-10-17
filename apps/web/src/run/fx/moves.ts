import type { Choreo } from "./motion";
import type { Ember } from "./shapes";

/** How the effects' parts move (`parts.tsx` draws them): embers flung, petals grown, a bolt flickered. */

/** Fling every ember in `group` out along its own path, falling as it fades. */
export const fling = (
  c: Choreo,
  group: SVGGElement | null,
  embers: ReadonlyArray<Ember>,
  duration: number,
  delay = 0,
): Promise<unknown> =>
  Promise.all(
    [...(group?.children ?? [])].map((dot, i) => {
      const ember = embers[i];
      if (ember === undefined) return Promise.resolve();
      return c.play(
        dot,
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          {
            transform: `translate(${String(ember.dx * 0.7)}px, ${String(ember.dy * 0.7)}px) scale(0.8)`,
            opacity: 1,
            offset: 0.45,
          },
          {
            transform: `translate(${String(ember.dx)}px, ${String(ember.dy + ember.fall)}px) scale(0.2)`,
            opacity: 0,
          },
        ],
        { duration, delay: delay + ember.delay * duration, easing: "ease-out" },
      );
    }),
  );

/** Grow every petal of `group` out from its root and wither it. */
export const bloom = (
  c: Choreo,
  group: SVGGElement | null,
  duration: number,
  easing: string,
  stagger = 0,
): Promise<unknown> =>
  Promise.all(
    [...(group?.querySelectorAll("path") ?? [])].map((path, i) =>
      c.play(
        path,
        [
          { transform: "scale(0.6, 0.1)", opacity: 1 },
          { transform: "scale(1, 1.1)", opacity: 1, offset: 0.35 },
          { transform: "scale(0.2, 0.6)", opacity: 0 },
        ],
        { duration, delay: i * stagger, easing },
      ),
    ),
  );

/** Flicker a crackle's three bolts in turn over `duration`, then let the last fade. */
export const flicker = async (c: Choreo, group: SVGGElement | null, duration: number) => {
  const bolts = [...(group?.children ?? [])];
  const each = duration / (bolts.length + 2);
  for (const [i, bolt] of bolts.entries()) {
    const last = i === bolts.length - 1;
    await c.play(
      bolt,
      last
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }]
        : [{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }],
      { duration: last ? each * 3 : each },
    );
  }
};
