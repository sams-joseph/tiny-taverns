/**
 * A speed as a sheet or a stat block writes it, read into feet per mode.
 *
 * The string is the one source both kinds of combatant have: a character's
 * `identity.speed` and a creature's `StatBlock.speed` are display text —
 * `"30 ft."`, `"30 ft., climb 30 ft."`, `"0 ft., fly 30 ft. (hover)"` — and the
 * import writes the SRD's `speeds` record into exactly that shape
 * (`bestiary/import.ts`, `speedLine`), walking speed first and bare. So this
 * reads the text rather than `speeds`, and a creature typed by hand reads the
 * same way as an imported one.
 *
 * Shared because the runner draws a token's range from it and the server lists
 * the squares a creature can move to from it; two parsers would disagree about
 * a creature the moment one of them learned a new spelling.
 */
export interface Speeds {
  readonly walk?: number;
  readonly burrow?: number;
  readonly climb?: number;
  readonly fly?: number;
  readonly swim?: number;
  /** `"(hover)"` or a bare `"hover"`: a flier that does not fall when it stops. */
  readonly hover: boolean;
}

const modes = ["burrow", "climb", "fly", "swim"] as const;

/**
 * Each comma-separated part is `N ft.` (walking) or `<mode> N ft.`. A part that
 * says anything else (`"varies"`, a parenthetical about a form) is no speed,
 * and nothing is guessed for it: a mode the text does not give is absent.
 */
export const speedsOf = (speed: string | undefined): Speeds => {
  const found: { -readonly [K in keyof Speeds]?: Speeds[K] } = {};
  let hover = false;
  for (const raw of (speed ?? "").split(",")) {
    const part = raw.trim().toLowerCase();
    if (/\bhover\b/.test(part)) hover = true;
    const walk = /^(\d+)\s*(?:ft\b|feet\b|')/.exec(part);
    if (walk !== null) {
      found.walk ??= Number(walk[1]);
      continue;
    }
    for (const mode of modes) {
      const match = new RegExp(`^${mode}\\s+(\\d+)\\s*(?:ft\\b|feet\\b|')`).exec(part);
      if (match !== null) found[mode] ??= Number(match[1]);
    }
  }
  return { ...found, hover };
};

/**
 * The walking speed in feet, which is what a turn's movement spends. Absent
 * when the text gives none (blank, `"varies"`, a swimmer with no walk), and the
 * board then draws no range rather than a guessed one.
 */
export const walkingFeet = (speed: string | undefined): number | undefined => speedsOf(speed).walk;
