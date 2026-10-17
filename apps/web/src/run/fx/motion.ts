/**
 * The effects' timing, read from the theme rather than restated: the
 * delivery's motion steps and the board's own `--dur-effect`
 * (`local-tokens.css`), all zero under reduced motion, so an effect there
 * ends the frame it starts and is never seen.
 *
 * The effects are choreographed with the Web Animations API rather than CSS
 * keyframes because they are sequences — a charge, a flight, an impact that
 * freezes the board — and a hit-stop pauses whatever is mid-flight. A browser
 * that animates nothing (jsdom) plays nothing and ends nothing, so an effect
 * stays standing for a test to read, as a CSS animation's never-fired
 * `animationend` always left it.
 */

/** The motion steps, in milliseconds. */
export interface Beats {
  readonly instant: number;
  readonly fast: number;
  readonly base: number;
  readonly slow: number;
  readonly slower: number;
  readonly effect: number;
  /** The effects' overshoot (`--ease-overshoot`), and the delivery's ease out. */
  readonly overshoot: string;
  readonly out: string;
}

const millis = (value: string): number => {
  const text = value.trim();
  if (text.endsWith("ms")) return Number.parseFloat(text) || 0;
  if (text.endsWith("s")) return (Number.parseFloat(text) || 0) * 1000;
  return 0;
};

/** The steps as the theme sets them where `el` is. */
export const beatsAt = (el: Element): Beats => {
  const style = getComputedStyle(el);
  const read = (name: string) => style.getPropertyValue(name);
  return {
    instant: millis(read("--dur-instant")),
    fast: millis(read("--dur-fast")),
    base: millis(read("--dur-base")),
    slow: millis(read("--dur-slow")),
    slower: millis(read("--dur-slower")),
    effect: millis(read("--dur-effect")),
    overshoot: read("--ease-overshoot").trim() || "ease-out",
    out: read("--ease-out").trim() || "ease-out",
  };
};

/** Whether this browser animates at all. */
export const animates = (el: Element | null): el is Element =>
  el !== null && typeof (el as Partial<Element>).animate === "function";

const NEVER = new Promise<void>(() => undefined);

/**
 * One effect's choreography: every animation it starts, so unmounting the
 * effect (or React's development double-mount) cancels them all and no later
 * step of a cancelled one runs.
 */
export interface Choreo {
  readonly play: (
    el: Element | null,
    frames: ReadonlyArray<Keyframe>,
    options: KeyframeAnimationOptions,
  ) => Promise<void>;
  readonly stop: () => void;
  readonly live: () => boolean;
}

export const choreo = (): Choreo => {
  const running: Array<Animation> = [];
  let dead = false;
  return {
    play: (el, frames, options) => {
      if (dead || !animates(el)) return NEVER;
      const animation = el.animate([...frames], { fill: "forwards", ...options });
      running.push(animation);
      return animation.finished.then(
        () => (dead ? NEVER : undefined),
        () => NEVER,
      );
    },
    stop: () => {
      dead = true;
      for (const animation of running) animation.cancel();
    },
    live: () => !dead,
  };
};
