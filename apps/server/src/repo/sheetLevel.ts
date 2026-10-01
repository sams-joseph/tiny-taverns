import {
  Conflict,
  type RaceBody,
  type SheetBody,
  type SheetResource,
  Spell,
  SpellId,
  spellActionFor,
} from "@taverns/api";
import { Effect, Schema, Struct } from "effect";
import { type SqlClient, type SqlError, SqlSchema, type Statement } from "effect/unstable/sql";
import { fromColumns, uuidArray } from "./rows.js";
import type { Vocabulary } from "./visibility.js";

/**
 * **The one level-up rule for a sheet's rules half** — a character's and an
 * NPC's (`repo/NpcSheets.ts`). A level or class change with no sheet in the
 * same write runs this, against the vocabulary the caller says the sheet is
 * written in (a character's is `characterVocabulary`, a campaign NPC's its
 * campaign's). It checks no reach: the caller has already proven the write is
 * theirs. The subrace check below is shared the same way.
 *
 * It rewrites the derived half only, and keeps what a person typed:
 *
 * - the spell slots and hit dice the class table gives at the new level, with
 *   what was already spent carried over and clamped;
 * - the known spells, narrowed to what the class (or subclass) list still
 *   reaches at the new level's highest slot, and their derived action lines
 *   rewritten at the new level (a cantrip's dice grow).
 *
 * Its limits are the same for every caller: it adds no features, and it moves
 * neither the proficiency bonus nor the hit points.
 */
export const recomputeForLevel = <Body extends SheetBody>(
  sql: SqlClient.SqlClient,
  input: {
    readonly body: Body;
    /** The level after the write; `null` reads as 1. */
    readonly level: number | null;
    /** The class after the write; blank or `null` leaves the body as it was. */
    readonly className: string | null;
    readonly vocabulary: Vocabulary;
  },
): Effect.Effect<Body, SqlError.SqlError | Schema.SchemaError> =>
  Effect.gen(function* () {
    const { body, vocabulary } = input;
    const level = Math.max(1, input.level ?? 1);
    const className = present(input.className);
    if (className === undefined) return body;
    const classRows = yield* sql<{
      readonly id: string;
      readonly name: string;
      readonly body: { readonly hitDie?: number; readonly spellcastingAbility?: string };
    }>`
      select id, name, body from character_option
      where kind = 'class'
        and lower(name) = lower(${className})
        and ${vocabulary("character_option")}
      order by case when account_id is null and campaign_id is null then 0 else 1 end,
               created_at asc, id asc
      limit 1
    `;
    const classOption = classRows[0];
    if (classOption === undefined) return body;
    const levelRows = yield* sql<{
      readonly body: { readonly spellcasting?: Record<string, unknown> };
    }>`
      select body from class_level
      where class_option_id = ${classOption.id}
        and subclass_id is null
        and level <= ${level}
      order by level desc
      limit 1
    `;
    const slots = rawSlots(levelRows[0]?.body.spellcasting);
    const highest = slots.reduce((best, count, index) => (count > 0 ? index + 1 : best), 0);
    const knownIds = (body.spellcasting?.known ?? []).flatMap((spell) =>
      spell.spellId === undefined || spell.spellId === null ? [] : [spell.spellId],
    );
    const subclassName = present(body.identity?.subclass);
    const spellRows =
      knownIds.length === 0
        ? []
        : yield* SqlSchema.findAll({
            Request: Schema.toType(Schema.Array(SpellId)),
            Result: LevelSpellRow,
            execute: (ids) => sql`
              select id, name, level, school_name, ritual, concentration, casting_time,
                     spell_range, body
              from spell
              where id = any(${uuidArray(ids)})
                and ${vocabulary("spell")}
                and (level = 0 or level <= ${highest})
                and ${
                  subclassName === undefined
                    ? sql`exists (select 1 from unnest(spell.class_names) as class_name where lower(class_name) = lower(${classOption.name}))`
                    : sql.or([
                        sql`exists (select 1 from unnest(spell.class_names) as class_name where lower(class_name) = lower(${classOption.name}))`,
                        sql`exists (select 1 from unnest(spell.subclass_names) as subclass_name where lower(subclass_name) = lower(${subclassName}))`,
                      ])
                }
            `,
          })(knownIds);
    const spellById = new Map(spellRows.map((row) => [row.id, row]));
    const keptKnown = (body.spellcasting?.known ?? []).filter(
      (spell) =>
        spell.spellId !== undefined && spell.spellId !== null && spellById.has(spell.spellId),
    );
    const spellActions = keptKnown.flatMap((known) => {
      if (known.spellId === undefined || known.spellId === null) return [];
      const row = spellById.get(known.spellId);
      if (row === undefined) return [];
      if (row.level > 0 && known.prepared !== true) return [];
      return [
        spellActionFor(
          { spell: row },
          {
            characterLevel: level,
            spellAttack: body.spellcasting?.attack,
            spellSave: body.spellcasting?.save,
          },
        ),
      ];
    });
    return {
      ...body,
      resources: levelUpResources(body, level, classOption.body.hitDie, slots),
      actions: [
        ...(body.actions ?? []).filter(
          (action) => !(action.derived === true && action.source === "spell"),
        ),
        ...spellActions,
      ],
      ...(body.spellcasting === undefined
        ? {}
        : { spellcasting: { ...body.spellcasting, known: keptKnown } }),
    };
  });

const present = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

/** A known spell as a level-up rewrites its action line: `spellActionFor`'s half of a `spell` row. */
const LevelSpellRow = fromColumns(
  Schema.Struct(
    Struct.pick(Spell.fields, [
      "id",
      "name",
      "level",
      "schoolName",
      "ritual",
      "concentration",
      "castingTime",
      "range",
      "spell",
    ]),
  ),
  { range: "spell_range", spell: "body" },
);

const ordinal = (n: number): string =>
  `${String(n)}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

const slotResourcesFor = (
  slots: ReadonlyArray<number>,
  previous: ReadonlyArray<SheetResource>,
): ReadonlyArray<SheetResource> => {
  const used = new Map(previous.map((resource) => [resource.id, resource.used]));
  return slots.flatMap((count, index) => {
    if (count <= 0) return [];
    const id = `slot:${String(index + 1)}`;
    return [
      {
        id,
        name: `${ordinal(index + 1)}-level slots`,
        used: Math.max(0, Math.min(count, used.get(id) ?? 0)),
        max: count,
        recharge: "long" as const,
        derived: true,
      },
    ];
  });
};

const levelUpResources = (
  sheet: SheetBody,
  level: number,
  hitDie: number | undefined,
  slots: ReadonlyArray<number>,
): ReadonlyArray<SheetResource> => {
  const previous = sheet.resources ?? [];
  const customAndNonSlots = previous.filter(
    (resource) =>
      !(
        resource.derived === true &&
        (resource.id.startsWith("slot:") || resource.id === "hit-dice")
      ),
  );
  const hitDice =
    hitDie === undefined
      ? []
      : [
          {
            id: "hit-dice",
            name: "Hit dice",
            used: Math.max(
              0,
              Math.min(level, previous.find((r) => r.id === "hit-dice")?.used ?? 0),
            ),
            max: level,
            recharge: "long" as const,
            unit: `d${String(hitDie)}`,
            derived: true,
          },
        ];
  return [...customAndNonSlots, ...slotResourcesFor(slots, previous), ...hitDice];
};

const rawSlots = (raw: Record<string, unknown> | undefined): ReadonlyArray<number> => {
  if (raw === undefined) return [];
  if (Array.isArray(raw.slots))
    return raw.slots.filter((value): value is number => typeof value === "number");
  const slots = Array.from({ length: 9 }, (_, index) => {
    const value = raw[`spell_slots_level_${String(index + 1)}`];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  });
  while (slots.length > 0 && slots[slots.length - 1] === 0) slots.pop();
  return slots;
};

const subraceMismatch = (race: string, subrace: string, place: string): Conflict =>
  new Conflict({
    message: `"${subrace}" is not a subrace of "${race}" ${place}. Pick one contained by that race or leave subrace blank.`,
  });

const missingRaceForSubrace = (subrace: string): Conflict =>
  new Conflict({
    message: `"${subrace}" needs a race before it can be checked. Pick the race it belongs to or leave subrace blank.`,
  });

/**
 * **The one subrace check for a sheet's identity** — a character's and an
 * NPC's. A named subrace must be contained by the named race in the vocabulary
 * the sheet is checked against, so what is pickable is exactly what validates.
 *
 * For a character, at creation that is the one the form or Hob used: the
 * campaign context's (`usableInCampaign`, `Options.list`'s) or the core rules
 * (`coreRulesUsable`, `Options.core`'s). On the shared sheet it is
 * `characterVocabulary`: every table the character sits at, or the core rules
 * when it sits at none. For a campaign NPC's sheet it is its campaign's.
 * `place` says which, in the refusal ("in a campaign this character is at").
 */
export const validateSubrace = (
  sql: SqlClient.SqlClient,
  vocabulary: Statement.Fragment,
  race: string | null | undefined,
  subrace: string | null | undefined,
  place: string,
): Effect.Effect<void, Conflict> =>
  Effect.gen(function* () {
    const namedSubrace = present(subrace);
    if (namedSubrace === undefined) return;
    const namedRace = present(race);
    if (namedRace === undefined) return yield* missingRaceForSubrace(namedSubrace);

    const rows = yield* sql<{ readonly name: string; readonly body: RaceBody }>`
      select name, body from character_option
      where kind = 'race'
        and lower(name) = lower(${namedRace})
        and ${vocabulary}
    `.pipe(Effect.orDie);
    const resolves = rows.some((row) =>
      row.body.subraces.some(
        (candidate) => candidate.name.toLowerCase() === namedSubrace.toLowerCase(),
      ),
    );
    if (!resolves) return yield* subraceMismatch(namedRace, namedSubrace, place);
  });
