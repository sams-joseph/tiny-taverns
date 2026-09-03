import {
  type AccountId,
  type CampaignId,
  type CharacterOptionId,
  type ClassBody,
  type ClassLevel,
  type ClassLevelBody,
  type ClassLevelId,
  type ClassOption,
  type ClassProgression as ClassProgressionView,
  CurrentActor,
  type Feature,
  type FeatureBody,
  type FeatureId,
  NotFound,
  type Subclass,
  type SubclassBody,
  type SubclassId,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { dieOnSqlError, type ProvenanceColumns, provenanceOf } from "./rows.js";
import { libraryRowReadable } from "./visibility.js";

interface ClassOptionRow extends ProvenanceColumns {
  readonly id: CharacterOptionId;
  readonly campaign_id: CampaignId | null;
  readonly account_id: AccountId | null;
  readonly derived_from: CharacterOptionId | null;
  readonly kind: "class";
  readonly name: string;
  readonly body: ClassBody;
  readonly subclass_count: number;
  readonly level_count: number;
  readonly feature_count: number;
}

interface SubclassRow extends ProvenanceColumns {
  readonly id: SubclassId;
  readonly campaign_id: CampaignId | null;
  readonly account_id: AccountId | null;
  readonly derived_from: SubclassId | null;
  readonly class_option_id: CharacterOptionId;
  readonly name: string;
  readonly flavor: string | null;
  readonly body: SubclassBody;
}

interface ClassLevelRow extends ProvenanceColumns {
  readonly id: ClassLevelId;
  readonly campaign_id: CampaignId | null;
  readonly account_id: AccountId | null;
  readonly derived_from: ClassLevelId | null;
  readonly class_option_id: CharacterOptionId;
  readonly subclass_id: SubclassId | null;
  readonly level: number;
  readonly ability_score_bonuses: number | null;
  readonly proficiency_bonus: number | null;
  readonly body: ClassLevelBody;
}

interface FeatureRow extends ProvenanceColumns {
  readonly id: FeatureId;
  readonly campaign_id: CampaignId | null;
  readonly account_id: AccountId | null;
  readonly derived_from: FeatureId | null;
  readonly class_option_id: CharacterOptionId;
  readonly subclass_id: SubclassId | null;
  readonly class_level_id: ClassLevelId | null;
  readonly parent_feature_id: FeatureId | null;
  readonly name: string;
  readonly level: number;
  readonly body: FeatureBody;
}

const toClassOption = (row: ClassOptionRow): ClassOption => ({
  id: row.id,
  campaignId: row.campaign_id,
  accountId: row.account_id,
  derivedFrom: row.derived_from,
  kind: "class",
  name: row.name,
  body: {
    ...row.body,
    subclassCount: row.subclass_count,
    levelCount: row.level_count,
    featureCount: row.feature_count,
  },
  ...provenanceOf(row),
});

const toSubclass = (row: SubclassRow): Subclass => ({
  id: row.id,
  campaignId: row.campaign_id,
  accountId: row.account_id,
  derivedFrom: row.derived_from,
  classOptionId: row.class_option_id,
  name: row.name,
  flavor: row.flavor,
  body: row.body,
  ...provenanceOf(row),
});

const toClassLevel = (row: ClassLevelRow): ClassLevel => ({
  id: row.id,
  campaignId: row.campaign_id,
  accountId: row.account_id,
  derivedFrom: row.derived_from,
  classOptionId: row.class_option_id,
  subclassId: row.subclass_id,
  level: row.level,
  abilityScoreBonuses: row.ability_score_bonuses,
  proficiencyBonus: row.proficiency_bonus,
  body: row.body,
  ...provenanceOf(row),
});

const toFeature = (row: FeatureRow): Feature => ({
  id: row.id,
  campaignId: row.campaign_id,
  accountId: row.account_id,
  derivedFrom: row.derived_from,
  classOptionId: row.class_option_id,
  subclassId: row.subclass_id,
  classLevelId: row.class_level_id,
  parentFeatureId: row.parent_feature_id,
  name: row.name,
  level: row.level,
  body: row.body,
  ...provenanceOf(row),
});

export class ClassProgression extends Context.Service<
  ClassProgression,
  {
    readonly libraryRead: (
      id: CharacterOptionId,
    ) => Effect.Effect<ClassProgressionView, NotFound, CurrentActor>;
  }
>()("ClassProgression") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const readRows = (option: ClassOption) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const childPredicate = (table: "subclass" | "class_level" | "feature") =>
            libraryRowReadable(sql, table, actor);

          const subclasses = yield* sql<SubclassRow>`
            select * from subclass
            where class_option_id = ${option.id}
              and ${childPredicate("subclass")}
            order by lower(name), id
          `;
          const levels = yield* sql<ClassLevelRow>`
            select * from class_level
            where class_option_id = ${option.id}
              and ${childPredicate("class_level")}
            order by level, subclass_id nulls first, id
          `;
          const features = yield* sql<FeatureRow>`
            select * from feature
            where class_option_id = ${option.id}
              and ${childPredicate("feature")}
            order by level, subclass_id nulls first, lower(name), id
          `;
          return {
            option,
            subclasses: subclasses.map(toSubclass),
            levels: levels.map(toClassLevel),
            features: features.map(toFeature),
          };
        });

      const classCounts = (id: CharacterOptionId) => sql<{
        readonly subclass_count: number;
        readonly level_count: number;
        readonly feature_count: number;
      }>`
        select
          (select count(*)::int from subclass where class_option_id = ${id}) as subclass_count,
          (select count(*)::int from class_level where class_option_id = ${id}) as level_count,
          (select count(*)::int from feature where class_option_id = ${id}) as feature_count
      `;

      const libraryOption = (id: CharacterOptionId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<
            Omit<ClassOptionRow, "subclass_count" | "level_count" | "feature_count">
          >`
            select * from character_option
            where id = ${id}
              and kind = 'class'
              and ${libraryRowReadable(sql, "character_option", actor)}
          `;
          const row = rows[0];
          if (row === undefined) return yield* new NotFound({ resource: "option", id });
          const counts = (yield* classCounts(id))[0]!;
          return toClassOption({ ...row, ...counts });
        });

      return {
        libraryRead: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const option = yield* libraryOption(id);
              return yield* readRows(option);
            }),
          ),
      };
    }),
  );
}
