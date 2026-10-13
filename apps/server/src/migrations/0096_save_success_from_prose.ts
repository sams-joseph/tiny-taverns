import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * A save's `successType` corrected from its own prose on the stat blocks a
 * re-import cannot reach.
 *
 * A handful of SRD rows mark a save-for-damage `none` while their text says
 * "half as much damage on a successful one" (the Adult Red Dragon's Fire
 * Breath, the Winter Wolf's Cold Breath, …), and a kept Hob turn halves or not
 * by this word. The import now writes `half` for them (`bestiary/import.ts`'s
 * `dcOf`); re-running `bestiary:import` corrects the bundle's rows. A Library
 * original and a campaign's instance are copies the import never touches, so
 * the same reading runs over them here, once. A choice (one breath of a
 * dragon's several) is read against its own clause of the prose, as the
 * import reads it.
 *
 * Frozen, like `0092`: migrations import nothing from the application.
 */

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const textIn = (value: unknown): string => (typeof value === "string" ? value : "");

const HALF = /half as much damage/i;

const corrected = (dc: unknown, prose: string): unknown =>
  isRecord(dc) && dc.successType === "none" && HALF.test(prose)
    ? { ...dc, successType: "half" }
    : dc;

const upgradedFeature = (feature: Json): Json => {
  const desc = textIn(feature.desc);
  const next: Json =
    "dc" in feature ? { ...feature, dc: corrected(feature.dc, desc) } : { ...feature };
  if (Array.isArray(feature.choices)) {
    const names = feature.choices.map((choice) => (isRecord(choice) ? textIn(choice.name) : ""));
    const starts = names.map((name) => (name === "" ? -1 : desc.indexOf(`${name}.`)));
    next.choices = feature.choices.map((choice, index) => {
      if (!isRecord(choice) || !("dc" in choice)) return choice;
      const start = starts[index] ?? -1;
      const end = Math.min(...starts.filter((at) => at > start), desc.length);
      return { ...choice, dc: corrected(choice.dc, start < 0 ? "" : desc.slice(start, end)) };
    });
  }
  return next;
};

/** A stat block with each mislabelled save corrected. Exported for `migrations.test.ts`. */
export const savesFromProse = (body: Json): Json => {
  const next: Json = { ...body };
  for (const section of ["specialAbilities", "actions", "reactions", "legendaryActions"]) {
    if (!Array.isArray(body[section])) continue;
    next[section] = (body[section] as ReadonlyArray<unknown>).map((feature) =>
      isRecord(feature) ? upgradedFeature(feature) : feature,
    );
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
    const next = savesFromProse(body);
    if (JSON.stringify(next) === JSON.stringify(body)) continue;
    yield* sql`update creature set body = ${JSON.stringify(next)}::jsonb where id = ${row.id}`;
  }
});
