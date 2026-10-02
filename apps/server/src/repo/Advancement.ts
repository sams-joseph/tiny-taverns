import {
  type Actor,
  AdvancementApplied,
  asClassOption,
  asRaceOption,
  averageHitDie,
  CharacterAdvancement,
  CharacterId,
  type CharacterLeveledUp,
  CharacterSheet,
  Conflict,
  CurrentActor,
  DEFAULT_HIT_POINT_METHOD,
  FeatId,
  FeatureBody,
  FeatureId,
  type LevelUpOffer,
  levelUpChosen,
  levelUpHitPointGain,
  levelUpOfferFor,
  type LevelUpPayload,
  levelUpWideSpells,
  NotFound,
  SHEET_LEVEL_MAX,
  SpellId,
  SubclassBody,
  SubclassId,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Random, Result, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { optionDetailsReader } from "../ruleset/vocabularies.js";
import {
  appendSeatSessionsTouched,
  characterRow,
  liveFightsOf,
  openSeatSessionsOf,
  portraitColumns,
  portraitSigner,
  ringSeatSessions,
} from "./Characters.js";
import type { OptionRow } from "./Options.js";
import {
  type AssistantOrigin,
  assistantColumns,
  dieOnSqlError,
  fromColumns,
  uuidArray,
} from "./rows.js";
import { optionNamedIn, recomputeForLevel } from "./sheetLevel.js";
import { spellbookRulesFor } from "./Spells.js";
import { characterVocabulary, ownCharacter, type Vocabulary } from "./visibility.js";

/** The character as the offer reads it: the columns a level-up starts from, and the sheet. */
type OfferCharacter = typeof OfferCharacterRow.Type;
const OfferCharacterRow = fromColumns(
  Schema.Struct({
    id: CharacterId,
    version: Schema.Int,
    level: Schema.NullOr(Schema.Int),
    className: Schema.NullOr(Schema.String),
    race: Schema.NullOr(Schema.String),
    subrace: Schema.NullOr(Schema.String),
    sheet: CharacterSheet,
  }),
  { sheet: "body" },
);

const FeatureRow = fromColumns(
  Schema.Struct({
    id: FeatureId,
    index: Schema.NullOr(Schema.String),
    name: Schema.String,
    level: Schema.Int,
    subclassId: Schema.NullOr(SubclassId),
    parentFeatureId: Schema.NullOr(FeatureId),
    body: FeatureBody,
  }),
  { index: "source_key" },
);

const SubclassRow = fromColumns(
  Schema.Struct({
    id: SubclassId,
    name: Schema.String,
    flavor: Schema.NullOr(Schema.String),
    body: SubclassBody,
  }),
);

const SubclassSpellRow = fromColumns(
  Schema.Struct({
    subclassId: SubclassId,
    spellId: SpellId,
    name: Schema.String,
    spellLevel: Schema.Int,
    level: Schema.Int,
    featureId: Schema.NullOr(FeatureId),
  }),
);

const FeatRow = fromColumns(
  Schema.Struct({
    id: FeatId,
    name: Schema.String,
    description: Schema.Array(Schema.String),
    prerequisites: Schema.Array(
      Schema.Struct({
        groupOrdinal: Schema.Int,
        ability: Schema.String,
        minimumScore: Schema.Int,
      }),
    ),
  }),
);

const WideSpellRow = fromColumns(
  Schema.Struct({
    id: SpellId,
    name: Schema.String,
    level: Schema.Int,
    schoolName: Schema.String,
    classNames: Schema.Array(Schema.String),
  }),
);

/** A level-up record as the wire reads it, off its columns; the hit points are one object. */
const AdvancementRow = fromColumns(
  Schema.Struct({ ...CharacterAdvancement.fields, createdAt: Schema.DateTimeUtcFromDate }),
);

/** Every column of a record, as `AdvancementRow` decodes it. */
const advancementColumns = (sql: SqlClient.SqlClient) => sql`
  character_advancement.id, character_advancement.character_id, character_advancement.level,
  character_advancement.class_name,
  jsonb_build_object('method', character_advancement.hp_method,
                     'die', character_advancement.hp_die,
                     'gain', character_advancement.hp_gain) as hit_points,
  character_advancement.choices, character_advancement.note, character_advancement.origin,
  character_advancement.assistant_turn_id, character_advancement.created_at
`;

const staleVersion = (expected: number, actual: number): Conflict =>
  new Conflict({
    message: `the sheet moved on since the level-up was offered (version ${String(actual)}, you read ${String(expected)}). Read the offer again and choose again.`,
  });

const levelUpWhileFighting = (campaignName: string): Conflict =>
  new Conflict({
    message: `Level up after the fight at ${campaignName}; this character is on the table there.`,
  });

const ClassOptionIdRequest = Schema.toType(Schema.String);
const SubclassIdsRequest = Schema.toType(Schema.Array(SubclassId));

/**
 * **A character's advancement**: what its next level offers, and taking it,
 * for its owner in its own vocabulary.
 *
 * | method    | predicate                                              |
 * | --------- | ------------------------------------------------------ |
 * | `offer`   | `ownCharacter`, then `characterVocabulary`             |
 * | `levelUp` | `ownCharacter` (row locked), then `characterVocabulary` |
 *
 * The first vocabulary-aware read of the class progression. The class and
 * race resolve by name the way the level recompute resolves them
 * (`optionNamedIn`), and every progression row is read through the same
 * vocabulary as the class (`feature`, `subclass`, the subclass spells' `spell`,
 * `feat`). The Library's progression endpoint (`ClassProgression`) is a
 * different read for a different reader and stays as it is. What the rows
 * mean is `levelUpOfferFor` in `@taverns/api`, which the level-up write and the
 * web's review share.
 */
export class Advancement extends Context.Service<
  Advancement,
  {
    readonly offer: (
      id: CharacterId,
    ) => Effect.Effect<LevelUpOffer, NotFound | Conflict, CurrentActor>;
    /**
     * **The level-up**: one level, in one transaction. The row is locked and
     * its version checked; a character on the table in a live fight at any
     * campaign is refused (the fight holds its copy of the hit points); the
     * offer is read again here, in the same vocabulary, and `levelUpChosen`
     * holds the payload to it. Then the hit points (fixed, or rolled here),
     * the choices, the level's recompute (`recomputeForLevel`, against the
     * sheet as it was, so a raised score moves what it feeds), the record,
     * the bumped version, and `character-updated` at every open night where
     * the character sits.
     *
     * A record above the character's level is one the Level box has since
     * taken back; gaining that level again replaces it. Current hit points
     * are not raised (an unset `hp_current` reads as full).
     */
    readonly levelUp: (
      id: CharacterId,
      payload: LevelUpPayload,
      /**
       * The turn that proposed it, when the owner kept a Hob proposal. Only
       * an accept passes it; a confirmed level-up is `authored`.
       */
      from?: AssistantOrigin,
    ) => Effect.Effect<CharacterLeveledUp, NotFound | Conflict, CurrentActor>;
  }
>()("Advancement") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const details = optionDetailsReader(sql);
      const live = yield* Effect.serviceOption(LiveEvents);
      const CharacterRow = characterRow(yield* portraitSigner);
      // The hit point roll's dice. Captured here so a test can seed them.
      const random = yield* Random.Random;

      /**
       * The offer for a character row this actor owns, in its vocabulary:
       * the read behind `offer`, and what `levelUp` holds a payload to.
       */
      const offerFor = (
        row: OfferCharacter,
        actor: Actor,
      ): Effect.Effect<
        { readonly offer: LevelUpOffer; readonly vocabulary: Vocabulary },
        Conflict | SqlError.SqlError | Schema.SchemaError
      > =>
        Effect.gen(function* () {
          const id = row.id;
          const level = Math.max(1, row.level ?? 1);
          if (level >= SHEET_LEVEL_MAX) {
            return yield* new Conflict({
              message: `This character is level ${String(level)}, the highest a sheet can hold, so there is no next level to offer.`,
            });
          }
          const vocabulary = yield* characterVocabulary(sql, id, actor);
          const named = (kind: "class" | "race", name: string | null) => {
            const trimmed = name?.trim();
            return trimmed === undefined || trimmed === ""
              ? Effect.succeed(undefined)
              : Effect.map(
                  optionNamedIn(sql, {
                    kind,
                    name: trimmed,
                    vocabulary: vocabulary("character_option"),
                  }),
                  Option.getOrUndefined,
                );
          };
          const classRow = yield* named("class", row.className);
          const raceRow = yield* named("race", row.race);
          const resolved = [classRow, raceRow].flatMap((option) =>
            option === undefined ? [] : [option],
          );
          const hydrated = yield* details(resolved.map((option) => option.id));
          const withDetails = (option: OptionRow | undefined) =>
            option === undefined ? undefined : { ...option, details: hydrated.get(option.id)! };
          const classOption = asClassOption(withDetails(classRow));
          const raceOption = asRaceOption(withDetails(raceRow));
          const base = {
            character: {
              id,
              version: row.version,
              level: row.level,
              className: row.className,
              subrace: row.subrace,
              body: row.sheet,
            },
            raceOption,
          };
          if (classOption === undefined) {
            return {
              offer: levelUpOfferFor({
                ...base,
                features: [],
                subclasses: [],
                subclassSpells: [],
                feats: [],
              }),
              vocabulary,
            };
          }

          const features = yield* SqlSchema.findAll({
            Request: ClassOptionIdRequest,
            Result: FeatureRow,
            execute: (classId) => sql`
                  select id, source_key, name, level, subclass_id, parent_feature_id, body
                  from feature
                  where class_option_id = ${classId} and ${vocabulary("feature")}
                  order by level, subclass_id nulls first, lower(name), id
                `,
          })(classOption.id);
          const subclasses = yield* SqlSchema.findAll({
            Request: ClassOptionIdRequest,
            Result: SubclassRow,
            execute: (classId) => sql`
                  select id, name, flavor, body
                  from subclass
                  where class_option_id = ${classId} and ${vocabulary("subclass")}
                  order by lower(name), id
                `,
          })(classOption.id);
          const subclassSpells =
            subclasses.length === 0
              ? []
              : yield* SqlSchema.findAll({
                  Request: SubclassIdsRequest,
                  Result: SubclassSpellRow,
                  execute: (ids) => sql`
                        select subclass_spell.subclass_id, subclass_spell.spell_id,
                               spell.name, spell.level as spell_level,
                               subclass_spell.level, subclass_spell.feature_id
                        from subclass_spell
                        join spell on spell.id = subclass_spell.spell_id
                        where subclass_spell.subclass_id = any(${uuidArray(ids)})
                          and ${vocabulary("spell")}
                        order by subclass_spell.subclass_id, subclass_spell.ordinal
                      `,
                })(subclasses.map((subclass) => subclass.id));
          const feats = yield* SqlSchema.findAll({
            Request: Schema.Void,
            Result: FeatRow,
            execute: () => sql`
                  select feat.id, feat.name,
                         coalesce(
                           (select array_agg(feat_description.text order by feat_description.ordinal)
                            from feat_description
                            where feat_description.feat_id = feat.id),
                           '{}'::text[]
                         ) as description,
                         coalesce(
                           (select jsonb_agg(
                                     jsonb_build_object(
                                       'groupOrdinal', feat_prerequisite_group.ordinal,
                                       'ability', ability_score.name,
                                       'minimumScore', feat_prerequisite_ability_score.minimum_score
                                     )
                                     order by feat_prerequisite_group.ordinal,
                                              feat_prerequisite_ability_score.ordinal
                                   )
                            from feat_prerequisite_ability_score
                            join feat_prerequisite_group
                              on feat_prerequisite_group.id = feat_prerequisite_ability_score.group_id
                            join ability_score
                              on ability_score.id = feat_prerequisite_ability_score.ability_score_id
                            where feat_prerequisite_ability_score.feat_id = feat.id),
                           '[]'::jsonb
                         ) as prerequisites
                  from feat
                  where ${vocabulary("feat")}
                  order by lower(feat.name), feat.id
                `,
          })(undefined);

          // The spell picker's own rule, at both levels, so the counts and
          // the list are the ones the picker will hold the sheet to.
          const rulesAt = (at: number) =>
            spellbookRulesFor(sql, {
              className: classOption.name,
              subclassName: row.sheet.identity?.subclass,
              level: at,
              body: row.sheet,
              vocabulary,
            });
          const spellRules = { from: yield* rulesAt(level), to: yield* rulesAt(level + 1) };
          const wide = levelUpWideSpells(classOption, level);
          const wideSpells =
            wide.magicalSecrets === undefined && wide.mysticArcanum === undefined
              ? undefined
              : yield* SqlSchema.findAll({
                  Request: Schema.Void,
                  Result: WideSpellRow,
                  execute: () => sql`
                        select id, name, level, school_name, class_names
                        from spell
                        where ${vocabulary("spell")}
                        order by level, lower(name), id
                      `,
                })(undefined);

          return {
            offer: levelUpOfferFor({
              ...base,
              classOption,
              features,
              subclasses,
              subclassSpells,
              feats,
              spellRules,
              wideSpells,
            }),
            vocabulary,
          };
        });

      /** The levelled row, under the owner's predicate, with the version bumped in the same statement. */
      const levelledRow = (actor: Actor) =>
        SqlSchema.findOne({
          Request: Schema.toType(
            Schema.Struct({
              id: CharacterId,
              level: Schema.Int,
              hpMax: Schema.NullOr(Schema.Int),
              body: Schema.String,
            }),
          ),
          Result: CharacterRow,
          execute: ({ id, level, hpMax, body }) => sql`
          update character
          set level = ${level},
              hp_max = ${hpMax},
              hp_current = case
                when character.hp_current is null or ${hpMax}::integer is null
                  then character.hp_current
                else least(character.hp_current, ${hpMax}::integer)
              end,
              body = ${body}::jsonb,
              version = character.version + 1,
              updated_at = now()
          where character.id = ${id} and ${ownCharacter(sql, actor)}
          returning character.*, ${portraitColumns(sql)}
        `,
        });

      return {
        offer: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const character = yield* SqlSchema.findOneOption({
                Request: Schema.Void,
                Result: OfferCharacterRow,
                execute: () => sql`
                  select id, version, level, class_name, race, subrace, body
                  from character
                  where character.id = ${id} and ${ownCharacter(sql, actor)}
                `,
              })(undefined);
              if (Option.isNone(character)) {
                return yield* new NotFound({ resource: "character", id });
              }
              return (yield* offerFor(character.value, actor)).offer;
            }),
          ),

        levelUp: (id, payload, from) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const done = yield* sql.withTransaction(
                Effect.gen(function* () {
                  const locked = yield* SqlSchema.findOneOption({
                    Request: Schema.Void,
                    Result: CharacterRow,
                    execute: () => sql`
                      select character.*, ${portraitColumns(sql)} from character
                      where character.id = ${id} and ${ownCharacter(sql, actor)}
                      for update of character
                    `,
                  })(undefined);
                  if (Option.isNone(locked)) {
                    return yield* new NotFound({ resource: "character", id });
                  }
                  const before = locked.value;
                  if (payload.expectedVersion !== before.version) {
                    return yield* staleVersion(payload.expectedVersion, before.version);
                  }
                  const fight = (yield* liveFightsOf(sql, [id])).get(id);
                  if (fight !== undefined) return yield* levelUpWhileFighting(fight.campaignName);

                  const { offer, vocabulary } = yield* offerFor(
                    {
                      id,
                      version: before.version,
                      level: before.level,
                      className: before.className,
                      race: before.race,
                      subrace: before.subrace,
                      sheet: before.sheet,
                    },
                    actor,
                  );
                  const hitPoints = offer.hitPoints;
                  if (hitPoints === undefined || offer.className === null) {
                    return yield* new Conflict({
                      message:
                        "This character's class is not in its rules, so there is no hit die to level up with. Change its level in Edit your character instead.",
                    });
                  }
                  const chosen = levelUpChosen(offer, before.sheet, payload);
                  if (Result.isFailure(chosen)) {
                    return yield* new Conflict({ message: chosen.failure.join(" ") });
                  }
                  const { body, choices, applied, constitution } = chosen.success;

                  const method = payload.hitPoints ?? DEFAULT_HIT_POINT_METHOD;
                  const die =
                    method === "fixed"
                      ? averageHitDie(hitPoints.die)
                      : yield* Effect.provideService(
                          Random.nextIntBetween(1, hitPoints.die),
                          Random.Random,
                          random,
                        );
                  const gain = levelUpHitPointGain(hitPoints, die, constitution, offer.toLevel);
                  const hpMax = before.hpMax === null ? null : before.hpMax + gain;

                  const sheet = yield* recomputeForLevel(sql, {
                    body,
                    level: offer.toLevel,
                    className: before.className,
                    race: before.race,
                    subrace: before.subrace,
                    from: { level: before.level, className: before.className, body: before.sheet },
                    vocabulary,
                    actor,
                  });

                  // A record at or above the level reached is one the Level box
                  // has since taken back: this level-up replaces it.
                  yield* sql`
                    delete from character_advancement
                    where character_id = ${id} and level >= ${offer.toLevel}
                  `;
                  const character = yield* levelledRow(actor)({
                    id,
                    level: offer.toLevel,
                    hpMax,
                    body: JSON.stringify(sheet),
                  }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                  const record: AdvancementApplied = {
                    ...applied,
                    hpMax: { from: before.hpMax, to: hpMax },
                  };
                  const advancement = yield* SqlSchema.findOne({
                    Request: Schema.Void,
                    Result: AdvancementRow,
                    execute: () => sql`
                      insert into character_advancement ${sql.insert({
                        character_id: id,
                        level: offer.toLevel,
                        class_name: offer.className,
                        hp_method: method,
                        hp_die: die,
                        hp_gain: gain,
                        choices: JSON.stringify(choices),
                        applied: JSON.stringify(Schema.encodeSync(AdvancementApplied)(record)),
                        ...(payload.note === undefined || payload.note.trim() === ""
                          ? {}
                          : { note: payload.note.trim() }),
                        ...assistantColumns(from),
                      })}
                      returning ${advancementColumns(sql)}
                    `,
                  })(undefined).pipe(Effect.catchTag("NoSuchElementError", Effect.die));

                  const sessions = yield* openSeatSessionsOf(sql, id, actor);
                  yield* appendSeatSessionsTouched(
                    sql,
                    id,
                    sessions,
                    { levelUp: { level: offer.toLevel } },
                    undefined,
                  );
                  return { result: { character, advancement }, sessions };
                }),
              );
              yield* ringSeatSessions(live, done.sessions);
              return done.result;
            }),
          ),
      };
    }),
  );
}
