import type { ActionArea, ActionRange } from "@taverns/api";

/**
 * The SRD's reach, range and area, read once out of an action's prose at
 * import (`StatBlock`'s `reach`, `range` and `area`, `Creature.ts`).
 *
 * The 2014 source carries no structured distance at all: every one of them is
 * in `desc`, in a handful of fixed spellings this file names. A spelling it
 * does not know gives nothing, and the option that needed it is left out
 * downstream rather than guessed; `geometry.test.ts` runs every SRD monster
 * through it and pins what is found and what is not.
 *
 * Deliberately not read: an aura that fires when a creature *starts its turn*
 * near this one (a gaze, a stench) or when it touches or hits it. Those are
 * not something the creature chooses to do, so they have no target to list.
 */
export interface ActionGeometry {
  readonly reach?: number;
  readonly range?: ActionRange;
  readonly area?: ActionArea;
}

const FEET = String.raw`(?:feet|foot|ft\.?)`;
const n = (text: string | undefined): number => Number(text);

/** The sentences of a description, so one clause's distance never lends itself to another. */
const sentencesOf = (desc: string): ReadonlyArray<string> =>
  desc
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");

/** `"reach 10 ft."` — a melee attack's. */
const reachOf = (desc: string): number | undefined => {
  const match = new RegExp(String.raw`\breach (\d+) ?${FEET}`, "i").exec(desc);
  return match === null ? undefined : n(match[1]);
};

/** `"range 80/320 ft."` — a ranged attack's normal and long range. */
const weaponRangeOf = (desc: string): ActionRange | undefined => {
  const match = new RegExp(String.raw`\brange (\d+)(?:/(\d+))? ?${FEET}`, "i").exec(desc);
  if (match === null) return undefined;
  return { normal: n(match[1]), ...(match[2] === undefined ? {} : { long: n(match[2]) }) };
};

/** `"at a point it can see within 120 feet of it"`: where a placed area may go. */
const pointRangeOf = (desc: string): number | undefined => {
  const match = new RegExp(String.raw`\bpoint\b[^.]*?\bwithin (\d+) ?${FEET}`, "i").exec(desc);
  return match === null ? undefined : n(match[1]);
};

/**
 * `"targets one creature it can see within 30 ft. of it"`, `"One humanoid the
 * fiend can see within 30 feet"`, `"fixes its gaze on one creature ... within
 * 10 feet"`, `"strike a target ... within 120 feet"`: a
 * single target, or a few, chosen within a distance — a range, not an area.
 */
const targetRangeOf = (sentence: string): number | undefined => {
  if (/\bstarts? its turn\b/i.test(sentence)) return undefined;
  const match = new RegExp(
    String.raw`(?:^one\b|\btargets?\s+(?:one|a|an|up to \w+)\b|\bon\s+one\b|\bstrike\s+(?:a|an|one)\b)[^.]*?\bwithin (\d+) ?${FEET}`,
    "i",
  ).exec(sentence);
  return match === null ? undefined : n(match[1]);
};

/** The smallest area read: `"a 1-foot cube"` of metal (the rust monster) is no area of effect. */
const MIN_AREA_FEET = 5;

/** A named shape: `"60-foot cone"`, `"90-foot line that is 10 feet wide"`, `"20-foot-radius sphere"`. */
const namedAreaOf = (desc: string): Omit<ActionArea, "origin"> | undefined => {
  const line =
    new RegExp(String.raw`(\d+)-foot line(?: that is (\d+) ${FEET} wide)?`, "i").exec(desc) ??
    // `"a line that is 30 ft. long and 5 ft. wide"` (the ankheg, the behir).
    new RegExp(
      String.raw`line(?: of \w+)? that is (\d+) ?${FEET} long and (\d+) ?${FEET} wide`,
      "i",
    ).exec(desc);
  if (line !== null) {
    const width = line[2] === undefined ? undefined : n(line[2]);
    return {
      shape: "line",
      feet: n(line[1]),
      ...(width === undefined || width === 5 ? {} : { width }),
    };
  }
  const cone = /(\d+)-foot cone/i.exec(desc);
  if (cone !== null) return { shape: "cone", feet: n(cone[1]) };
  const cube = /(\d+)-foot cube/i.exec(desc);
  if (cube !== null) return { shape: "cube", feet: n(cube[1]) };
  const radius = /(\d+)-foot[- ]radius/i.exec(desc);
  if (radius !== null) return { shape: "sphere", feet: n(radius[1]) };
  return undefined;
};

/**
 * `"Each creature within 10 ft. of the dragon"`, `"Each living creature within
 * 20 feet of the lich"`: a burst about the creature itself. `"Each creature
 * within 10 feet of that point"` is the same burst about a placed point.
 */
const burstOf = (
  sentence: string,
): { readonly feet: number; readonly about: "self" | "point" } | undefined => {
  if (/\bstarts? its turn\b/i.test(sentence)) return undefined;
  const match = new RegExp(
    String.raw`^(?:each|any)\b[^.]*?\bwithin (\d+) ?${FEET} of (that point|the point|it|him|her|itself|the [\w'-]+(?: [\w'-]+)?)\b`,
    "i",
  ).exec(sentence);
  if (match === null) return undefined;
  return { feet: n(match[1]), about: /point$/i.test(match[2] ?? "") ? "point" : "self" };
};

export const geometryOf = (desc: string): ActionGeometry => {
  const reach = reachOf(desc);
  const weaponRange = weaponRangeOf(desc);
  const sentences = sentencesOf(desc);
  const pointRange = pointRangeOf(desc);

  const shaped = namedAreaOf(desc);
  const named = shaped !== undefined && shaped.feet >= MIN_AREA_FEET ? shaped : undefined;
  const burst =
    named === undefined ? sentences.map(burstOf).find((b) => b !== undefined) : undefined;
  const area: ActionArea | undefined =
    named !== undefined
      ? { ...named, origin: pointRange === undefined ? "self" : "point" }
      : burst !== undefined
        ? {
            shape: "sphere",
            feet: burst.feet,
            origin: burst.about === "point" || pointRange !== undefined ? "point" : "self",
          }
        : undefined;

  const range: ActionRange | undefined =
    weaponRange ??
    (pointRange === undefined ? undefined : { normal: pointRange }) ??
    (area === undefined
      ? (() => {
          const feet = sentences.map(targetRangeOf).find((f) => f !== undefined);
          return feet === undefined ? undefined : { normal: feet };
        })()
      : undefined);

  return {
    ...(reach === undefined ? {} : { reach }),
    ...(range === undefined ? {} : { range }),
    ...(area === undefined ? {} : { area }),
  };
};

/** `"Wing Attack (Costs 2 Actions)"` → 2; absent is one action. */
export const legendaryCostOf = (name: string): number | undefined => {
  const match = /\(costs (\d+) actions?\)/i.exec(name);
  return match === null ? undefined : n(match[1]);
};

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/**
 * The actions a legendary action performs by name: `"The dragon makes a tail
 * attack."` → `["Tail"]`, `"makes one tentacle attack or uses its Fling"` →
 * `["Tentacle", "Fling"]`, `"makes one attack with its rotting fist"` →
 * `["Rotting Fist"]`, in the order the prose names them. Matched against the
 * creature's own action names (less any parenthetical, never *Multiattack*),
 * so a word that is not one of its actions is never a pointer.
 */
export const performsOf = (
  desc: string,
  actionNames: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const found: Array<{ readonly name: string; readonly at: number }> = [];
  for (const sentence of sentencesOf(desc)) {
    if (!/\b(?:makes?|uses?)\b/i.test(sentence)) continue;
    for (const name of actionNames) {
      const bare = name.replace(/\s*\(.*\)\s*$/, "").trim();
      if (bare === "" || /^multiattack$/i.test(bare)) continue;
      const match = new RegExp(
        String.raw`\b(?:a|an|one|or|its|uses)\s+${escape(bare)}\b`,
        "i",
      ).exec(sentence);
      if (match !== null && !found.some((f) => f.name === name)) {
        found.push({ name, at: desc.indexOf(sentence) + match.index });
      }
    }
  }
  return [...found].sort((a, b) => a.at - b.at).map((f) => f.name);
};
