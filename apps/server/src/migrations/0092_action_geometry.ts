import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Reach, range and area become structured stat-block fields, and this fills
 * them in on the stat blocks a re-import cannot reach.
 *
 * `bestiary:import` upserts the bundle's rows, so re-running it gives every SRD
 * creature the new keys (`bestiary/geometry.ts`). A Library original and a
 * campaign's instance are `insert … select` copies (`derive`, a roster add):
 * the import never touches them, and nothing is read through `derived_from`.
 * Their documents still hold the source's prose and its raw `options` and
 * `actionOptions`, so the same extraction runs over them here, once.
 *
 * - **Only what is missing is written.** A key a person (or the import) has
 *   already set stays as it is, so a row edited after this and a row that
 *   already had the keys are both left alone; running it twice changes nothing.
 * - **Bundle rows are not touched.** They are the import's, and it rewrites them.
 * - **Bonus actions**: the 2014 source has no section for them, so a special
 *   ability whose prose grants one is marked `bonusAction`.
 * - **Plain traits too**: a creature typed in the bestiary whose own text says
 *   `"reach 5 ft."` gets `reach: 5`. That is its author's prose read, not a
 *   distance invented for it; a trait whose text gives none gets none.
 *
 * The extraction is a frozen copy of `bestiary/geometry.ts` and the import's
 * `choicesOf` / `multiattackOptionsOf` as they stood when this was written.
 * Migrations import nothing from the application, so a later change to the
 * import cannot change what this did; `migrations.test.ts` checks the two
 * agreed, over every SRD monster, when this was written.
 */

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const recordsIn = (value: unknown): ReadonlyArray<Json> =>
  Array.isArray(value) ? value.filter(isRecord) : [];
const textIn = (value: unknown): string => (typeof value === "string" ? value : "");

const FEET = String.raw`(?:feet|foot|ft\.?)`;
const MIN_AREA_FEET = 5;

const sentencesOf = (desc: string): ReadonlyArray<string> =>
  desc
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");

const first = (pattern: string, text: string): RegExpExecArray | null =>
  new RegExp(pattern, "i").exec(text);

const areaOf = (desc: string): Json | undefined => {
  const line =
    first(String.raw`(\d+)-foot line(?: that is (\d+) ${FEET} wide)?`, desc) ??
    first(String.raw`line(?: of \w+)? that is (\d+) ?${FEET} long and (\d+) ?${FEET} wide`, desc);
  if (line !== null) {
    const width = line[2] === undefined ? undefined : Number(line[2]);
    return {
      shape: "line",
      feet: Number(line[1]),
      ...(width === undefined || width === 5 ? {} : { width }),
    };
  }
  const cone = /(\d+)-foot cone/i.exec(desc);
  if (cone !== null) return { shape: "cone", feet: Number(cone[1]) };
  const cube = /(\d+)-foot cube/i.exec(desc);
  if (cube !== null) return { shape: "cube", feet: Number(cube[1]) };
  const radius = /(\d+)-foot[- ]radius/i.exec(desc);
  if (radius !== null) return { shape: "sphere", feet: Number(radius[1]) };
  return undefined;
};

const burstOf = (sentence: string): { feet: number; about: "self" | "point" } | undefined => {
  if (/\bstarts? its turn\b/i.test(sentence)) return undefined;
  const match = first(
    String.raw`^(?:each|any)\b[^.]*?\bwithin (\d+) ?${FEET} of (that point|the point|it|him|her|itself|the [\w'-]+(?: [\w'-]+)?)\b`,
    sentence,
  );
  if (match === null) return undefined;
  return { feet: Number(match[1]), about: /point$/i.test(match[2] ?? "") ? "point" : "self" };
};

const targetRangeOf = (sentence: string): number | undefined => {
  if (/\bstarts? its turn\b/i.test(sentence)) return undefined;
  const match = first(
    String.raw`(?:^one\b|\btargets?\s+(?:one|a|an|up to \w+)\b|\bon\s+one\b|\bstrike\s+(?:a|an|one)\b)[^.]*?\bwithin (\d+) ?${FEET}`,
    sentence,
  );
  return match === null ? undefined : Number(match[1]);
};

const geometryOf = (desc: string): Json => {
  const reachMatch = first(String.raw`\breach (\d+) ?${FEET}`, desc);
  const rangeMatch = first(String.raw`\brange (\d+)(?:/(\d+))? ?${FEET}`, desc);
  const pointMatch = first(String.raw`\bpoint\b[^.]*?\bwithin (\d+) ?${FEET}`, desc);
  const pointRange = pointMatch === null ? undefined : Number(pointMatch[1]);
  const sentences = sentencesOf(desc);

  const shaped = areaOf(desc);
  const named = shaped !== undefined && Number(shaped.feet) >= MIN_AREA_FEET ? shaped : undefined;
  const burst =
    named === undefined ? sentences.map(burstOf).find((b) => b !== undefined) : undefined;
  const area =
    named !== undefined
      ? { ...named, origin: pointRange === undefined ? "self" : "point" }
      : burst !== undefined
        ? {
            shape: "sphere",
            feet: burst.feet,
            origin: burst.about === "point" || pointRange !== undefined ? "point" : "self",
          }
        : undefined;

  const targetRange =
    area === undefined ? sentences.map(targetRangeOf).find((f) => f !== undefined) : undefined;
  const range =
    rangeMatch !== null
      ? {
          normal: Number(rangeMatch[1]),
          ...(rangeMatch[2] === undefined ? {} : { long: Number(rangeMatch[2]) }),
        }
      : pointRange !== undefined
        ? { normal: pointRange }
        : targetRange !== undefined
          ? { normal: targetRange }
          : undefined;

  return {
    ...(reachMatch === null ? {} : { reach: Number(reachMatch[1]) }),
    ...(range === undefined ? {} : { range }),
    ...(area === undefined ? {} : { area }),
  };
};

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const performsOf = (desc: string, actionNames: ReadonlyArray<string>): ReadonlyArray<string> => {
  const found: Array<{ name: string; at: number }> = [];
  for (const sentence of sentencesOf(desc)) {
    if (!/\b(?:makes?|uses?)\b/i.test(sentence)) continue;
    for (const name of actionNames) {
      const bare = name.replace(/\s*\(.*\)\s*$/, "").trim();
      if (bare === "" || /^multiattack$/i.test(bare)) continue;
      const match = first(String.raw`\b(?:a|an|one|or|its|uses)\s+${escape(bare)}\b`, sentence);
      if (match !== null && !found.some((f) => f.name === name)) {
        found.push({ name, at: desc.indexOf(sentence) + match.index });
      }
    }
  }
  return [...found].sort((a, b) => a.at - b.at).map((f) => f.name);
};

const GRANTS_BONUS = new RegExp(
  String.raw`\b(?:can|may)\b[^.]*?\b(?:as a |use (?:a|its) |take a )bonus action\b|^as a bonus action,? (?:the|it|she|he)\b[^.]*?\bcan\b`,
  "i",
);
const REFUSES_BONUS = /\bcan.t take\b[^.]*bonus action|\bno bonus action/i;

const bonusActionOf = (desc: string): "always" | "triggered" | undefined => {
  const grants = sentencesOf(desc).some(
    (sentence) => GRANTS_BONUS.test(sentence) && !REFUSES_BONUS.test(sentence),
  );
  if (!grants) return undefined;
  return /^(?:if|when)\b/i.test(desc.trim()) ? "triggered" : "always";
};

/** A raw source reference, as the stored `options` payload keeps it. */
const refOf = (value: unknown): Json | undefined =>
  isRecord(value) && typeof value.index === "string" && typeof value.name === "string"
    ? { index: value.index, name: value.name }
    : undefined;

const dcOf = (value: unknown): Json | undefined => {
  if (!isRecord(value)) return undefined;
  const dcType = refOf(value.dc_type);
  if (dcType === undefined || typeof value.dc_value !== "number") return undefined;
  return {
    dcType,
    dcValue: value.dc_value,
    successType: textIn(value.success_type),
    ...(typeof value.desc === "string" ? { desc: value.desc } : {}),
  };
};

const damageOf = (value: Json): Json => {
  const damageType = refOf(value.damage_type);
  if (damageType === undefined) return { choice: value };
  return {
    damageType,
    ...(typeof value.damage_dice === "string" ? { damageDice: value.damage_dice } : {}),
  };
};

const choicesOf = (options: Json, desc: string): ReadonlyArray<Json> => {
  const from = isRecord(options.from) ? options.from : {};
  const entries = recordsIn(from.options);
  const names = entries.map((entry) => textIn(entry.name));
  const starts = names.map((name) => desc.indexOf(`${name}.`));
  return entries.flatMap((entry, index) => {
    const name = names[index] ?? "";
    if (name === "") return [];
    const start = starts[index] ?? -1;
    const next = Math.min(...starts.filter((at) => at > start), desc.length);
    const clause = start < 0 ? "" : desc.slice(start, next);
    const dc = dcOf(entry.dc);
    return [
      {
        name,
        ...(dc === undefined ? {} : { dc }),
        ...(Array.isArray(entry.damage) ? { damage: recordsIn(entry.damage).map(damageOf) } : {}),
        ...geometryOf(clause),
      },
    ];
  });
};

const actionItemOf = (value: Json): Json => ({
  actionName: textIn(value.action_name),
  count: typeof value.count === "number" || typeof value.count === "string" ? value.count : 1,
  type: textIn(value.type),
});

const multiattackOptionsOf = (actionOptions: Json): ReadonlyArray<ReadonlyArray<Json>> => {
  const from = isRecord(actionOptions.from) ? actionOptions.from : {};
  return recordsIn(from.options).map((option) =>
    option.option_type === "multiple"
      ? recordsIn(option.items).map(actionItemOf)
      : [actionItemOf(option)],
  );
};

const GEOMETRY_KEYS = ["reach", "range", "area"] as const;

/** `extra` with every key `existing` already has taken out: nothing is overwritten. */
const missing = (existing: Json, extra: Json): Json =>
  Object.fromEntries(Object.entries(extra).filter(([key]) => !(key in existing)));

const upgradedFeature = (
  feature: Json,
  section: string,
  actionNames: ReadonlyArray<string>,
): Json => {
  const legendary = section === "legendaryActions";
  const bonusAction =
    section === "specialAbilities" ? bonusActionOf(textIn(feature.desc)) : undefined;
  const desc = textIn(feature.desc);
  const hasGeometry = GEOMETRY_KEYS.some((key) => key in feature) || "choices" in feature;
  const choices = isRecord(feature.options) ? choicesOf(feature.options, desc) : undefined;
  const cost = legendary ? /\(costs (\d+) actions?\)/i.exec(textIn(feature.name)) : null;
  const performs = legendary ? performsOf(desc, actionNames) : [];
  return {
    ...feature,
    ...missing(feature, {
      ...(hasGeometry
        ? {}
        : choices === undefined || choices.length === 0
          ? geometryOf(desc)
          : { choices }),
      ...(isRecord(feature.actionOptions)
        ? { multiattackOptions: multiattackOptionsOf(feature.actionOptions) }
        : {}),
      ...(cost === null ? {} : { legendaryCost: Number(cost[1]) }),
      ...(performs.length === 0 ? {} : { performs }),
      ...(bonusAction === undefined ? {} : { bonusAction }),
    }),
  };
};

const upgradedTrait = (trait: Json): Json =>
  GEOMETRY_KEYS.some((key) => key in trait)
    ? trait
    : { ...trait, ...geometryOf(textIn(trait.text)) };

/**
 * A stat block with the structured fields the import now writes filled in
 * where they are missing. Exported for `migrations.test.ts`.
 */
export const upgradedStatBlock = (body: Json): Json => {
  const actionNames = recordsIn(body.actions).map((action) => textIn(action.name));
  const next: Json = { ...body };
  for (const section of ["specialAbilities", "actions", "reactions", "legendaryActions"]) {
    if (!Array.isArray(body[section])) continue;
    next[section] = (body[section] as ReadonlyArray<unknown>).map((feature) =>
      isRecord(feature) ? upgradedFeature(feature, section, actionNames) : feature,
    );
  }
  if (Array.isArray(body.traits)) {
    next.traits = (body.traits as ReadonlyArray<unknown>).map((trait) =>
      isRecord(trait) ? upgradedTrait(trait) : trait,
    );
  }
  if (recordsIn(body.legendaryActions).length > 0 && !("legendaryActionsPerRound" in body)) {
    next.legendaryActionsPerRound = 3;
  }
  return next;
};

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly id: string; readonly body: unknown }>`
    select id, body from creature
    where campaign_id is not null or account_id is not null
  `;
  for (const row of rows) {
    const body: unknown = typeof row.body === "string" ? JSON.parse(row.body) : row.body;
    if (!isRecord(body)) continue;
    const next = upgradedStatBlock(body);
    if (JSON.stringify(next) === JSON.stringify(body)) continue;
    yield* sql`update creature set body = ${JSON.stringify(next)}::jsonb where id = ${row.id}`;
  }
});
