import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * A sheet line's distances as numbers (`SheetAction.reachFeet`, `rangeFeet`,
 * `spellAttack`) and a spell's area (`SheetAction.area`), filled in on the
 * characters composed before a line kept them.
 *
 * The composers now write them from the corpus (`weaponAttack` in
 * `SheetGrants.ts`, `spellActionFor` in `Spellbook.ts`), and a party member's
 * attack is delivered by them (`attackDelivery`): a line without them files
 * its roll with no delivery, and the board draws no strike for it; a spell
 * line without its area fills no pinned template, and the board draws no blast. A sheet
 * written before then keeps its weapon and spell lines' pointers
 * (`equipmentId`, `spellId`), so the same reading runs over the rows they name,
 * once.
 *
 * - **Only what is missing is written**, so running it twice changes nothing
 *   and a line that already has a key keeps it.
 * - **A line with no pointer gets nothing**: a hand-written line's distances
 *   are its author's to give.
 *
 * Frozen, like `0092`: migrations import nothing from the application.
 */

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface WeaponRow {
  readonly id: string;
  readonly weapon_range: string | null;
  readonly range_normal: number | null;
  readonly range_long: number | null;
  readonly throw_range_normal: number | null;
  readonly throw_range_long: number | null;
  readonly property_names: ReadonlyArray<string>;
}

interface SpellRow {
  readonly id: string;
  readonly spell_range: string;
  readonly attack_type: unknown;
  readonly area_of_effect: unknown;
}

const distances = (normal: number | null, long: number | null): Json | undefined =>
  normal === null ? undefined : long === null ? { normal } : { normal, long };

/** A melee weapon reaches 5 feet, 10 with Reach; a ranged one shoots, and a thrown one is both. */
const weaponGeometry = (row: WeaponRow): Json => {
  const has = (property: string) =>
    row.property_names.some((name) => name.toLowerCase() === property);
  const ranged = row.weapon_range === "Ranged";
  const rangeFeet = ranged
    ? distances(row.range_normal, row.range_long)
    : has("thrown")
      ? distances(row.throw_range_normal, row.throw_range_long)
      : undefined;
  return {
    ...(ranged ? {} : { reachFeet: has("reach") ? 10 : 5 }),
    ...(rangeFeet === undefined ? {} : { rangeFeet }),
  };
};

/** `spellAreaOf` as it stood: a cylinder is a sphere on the board, and a Self range starts at the caster. */
const spellAreaOf = (row: SpellRow): Json | undefined => {
  const area = row.area_of_effect;
  if (!isRecord(area) || typeof area.size !== "number") return undefined;
  const shape =
    area.type === "cylinder"
      ? "sphere"
      : ["sphere", "cone", "line", "cube"].find((name) => name === area.type);
  if (shape === undefined) return undefined;
  const self = row.spell_range.trim().toLowerCase().startsWith("self");
  return { shape, feet: area.size, origin: self ? "self" : "point" };
};

const spellGeometry = (row: SpellRow): Json => {
  const word = typeof row.attack_type === "string" ? row.attack_type.trim().toLowerCase() : "";
  const area = spellAreaOf(row);
  return {
    ...(word === "melee" || word === "ranged" ? { spellAttack: word } : {}),
    ...(area === undefined ? {} : { area }),
  };
};

/** `extra` with every key `existing` already has taken out: nothing is overwritten. */
const missing = (existing: Json, extra: Json): Json =>
  Object.fromEntries(Object.entries(extra).filter(([key]) => !(key in existing)));

/**
 * A sheet with each weapon and spell line's distances filled in from the row
 * it names, where they are missing. Exported for `migrations.test.ts`.
 */
export const sheetWithGeometry = (
  body: Json,
  weapons: ReadonlyMap<string, WeaponRow>,
  spells: ReadonlyMap<string, SpellRow>,
): Json => {
  if (!Array.isArray(body.actions)) return body;
  return {
    ...body,
    actions: (body.actions as ReadonlyArray<unknown>).map((action) => {
      if (!isRecord(action)) return action;
      const weapon =
        typeof action.equipmentId === "string" ? weapons.get(action.equipmentId) : undefined;
      const spell = typeof action.spellId === "string" ? spells.get(action.spellId) : undefined;
      const extra =
        weapon !== undefined
          ? weaponGeometry(weapon)
          : spell !== undefined
            ? spellGeometry(spell)
            : {};
      return { ...action, ...missing(action, extra) };
    }),
  };
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const characters = yield* sql<{ readonly id: string; readonly body: unknown }>`
    select id, body from character where jsonb_typeof(body -> 'actions') = 'array'
  `;
  const bodies = characters.flatMap((row) => {
    const body: unknown = typeof row.body === "string" ? JSON.parse(row.body) : row.body;
    return isRecord(body) ? [{ id: row.id, body }] : [];
  });
  const pointers = (key: string) => [
    ...new Set(
      bodies.flatMap(({ body }) =>
        (body.actions as ReadonlyArray<unknown>).flatMap((action) =>
          isRecord(action) && typeof action[key] === "string" && uuid.test(action[key])
            ? [action[key]]
            : [],
        ),
      ),
    ),
  ];
  const weaponIds = pointers("equipmentId");
  const spellIds = pointers("spellId");
  const weapons =
    weaponIds.length === 0
      ? []
      : yield* sql<WeaponRow>`
          select id::text, weapon_range, range_normal, range_long,
                 throw_range_normal, throw_range_long, property_names
          from equipment where id in ${sql.in(weaponIds)}
        `;
  const spells =
    spellIds.length === 0
      ? []
      : yield* sql<SpellRow>`
          select id::text, spell_range, body -> 'attackType' as attack_type,
                 body -> 'areaOfEffect' as area_of_effect
          from spell where id in ${sql.in(spellIds)}
        `;
  const weaponsById = new Map(weapons.map((row) => [row.id, row]));
  const spellsById = new Map(spells.map((row) => [row.id, row]));
  for (const { id, body } of bodies) {
    const next = sheetWithGeometry(body, weaponsById, spellsById);
    if (JSON.stringify(next) === JSON.stringify(body)) continue;
    yield* sql`update character set body = ${JSON.stringify(next)}::jsonb where id = ${id}`;
  }
});
