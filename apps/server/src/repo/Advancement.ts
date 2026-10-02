import {
  asClassOption,
  asRaceOption,
  type CharacterId,
  CharacterSheet,
  Conflict,
  CurrentActor,
  FeatId,
  FeatureBody,
  FeatureId,
  type LevelUpOffer,
  levelUpOfferFor,
  levelUpWideSpells,
  NotFound,
  SHEET_LEVEL_MAX,
  SpellId,
  SubclassBody,
  SubclassId,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { optionDetailsReader } from "../ruleset/vocabularies.js";
import type { OptionRow } from "./Options.js";
import { dieOnSqlError, fromColumns, uuidArray } from "./rows.js";
import { optionNamedIn } from "./sheetLevel.js";
import { spellbookRulesFor } from "./Spells.js";
import { characterVocabulary, ownCharacter } from "./visibility.js";

/** The character as the offer reads it: the columns a level-up starts from, and the sheet. */
const OfferCharacterRow = fromColumns(
  Schema.Struct({
    id: Schema.String,
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

const ClassOptionIdRequest = Schema.toType(Schema.String);
const SubclassIdsRequest = Schema.toType(Schema.Array(SubclassId));

/**
 * **A character's advancement**: what its next level offers, read for its
 * owner in its own vocabulary.
 *
 * | method  | predicate                                   |
 * | ------- | ------------------------------------------- |
 * | `offer` | `ownCharacter`, then `characterVocabulary`  |
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
  }
>()("Advancement") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const details = optionDetailsReader(sql);

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
              const row = character.value;
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
                return levelUpOfferFor({
                  ...base,
                  features: [],
                  subclasses: [],
                  subclassSpells: [],
                  feats: [],
                });
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

              return levelUpOfferFor({
                ...base,
                classOption,
                features,
                subclasses,
                subclassSpells,
                feats,
                spellRules,
                wideSpells,
              });
            }),
          ),
      };
    }),
  );
}
