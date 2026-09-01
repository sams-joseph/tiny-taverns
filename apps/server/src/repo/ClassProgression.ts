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
  type Visibility,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf } from "./rows.js";
import { corpusRowReadable, ensureCampaignReadable, libraryRowReadable } from "./visibility.js";

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

const encode = (value: unknown): string => JSON.stringify(value);

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

const ownerFor = (owner: {
  readonly campaign_id?: CampaignId;
  readonly account_id?: AccountId;
}): Record<string, CampaignId | AccountId | undefined> => ({
  campaign_id: owner.campaign_id,
  account_id: owner.account_id,
});

/**
 * Copy every progression row from one class row to a new class row.
 *
 * The caller has already proven the source is copyable and the target has just
 * been inserted. This function preserves the source graph by concrete ids, then
 * remaps those ids onto the target scope.
 */
export const copyClassProgression = (
  sql: SqlClient.SqlClient,
  sourceClassId: CharacterOptionId,
  targetClassId: CharacterOptionId,
  owner: { readonly campaign_id?: CampaignId; readonly account_id?: AccountId },
  visibility: Visibility | undefined,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    const base = ownerFor(owner);
    const subclassMap = new Map<SubclassId, SubclassId>();
    const levelMap = new Map<ClassLevelId, ClassLevelId>();
    const featureMap = new Map<FeatureId, FeatureId>();

    const subclasses = yield* sql<
      SubclassRow & {
        readonly source_corpus: string | null;
        readonly source_family: string | null;
        readonly source_key: string | null;
      }
    >`
      select * from subclass
      where class_option_id = ${sourceClassId}
      order by lower(name), id
    `;
    for (const row of subclasses) {
      const inserted = yield* sql<{ readonly id: SubclassId }>`
        insert into subclass ${sql.insert(
          defined({
            ...base,
            derived_from: row.id,
            source_corpus: row.source_corpus,
            source_family: row.source_family,
            source_key: row.source_key,
            class_option_id: targetClassId,
            name: row.name,
            flavor: row.flavor,
            body: encode(row.body),
            visibility,
          }),
        )}
        returning id
      `;
      subclassMap.set(row.id, inserted[0]!.id);
    }

    const levels = yield* sql<
      ClassLevelRow & {
        readonly source_corpus: string | null;
        readonly source_family: string | null;
        readonly source_key: string | null;
      }
    >`
      select * from class_level
      where class_option_id = ${sourceClassId}
      order by level, subclass_id nulls first, id
    `;
    for (const row of levels) {
      const inserted = yield* sql<{ readonly id: ClassLevelId }>`
        insert into class_level ${sql.insert(
          defined({
            ...base,
            derived_from: row.id,
            source_corpus: row.source_corpus,
            source_family: row.source_family,
            source_key: row.source_key,
            class_option_id: targetClassId,
            subclass_id: row.subclass_id === null ? undefined : subclassMap.get(row.subclass_id),
            level: row.level,
            ability_score_bonuses: row.ability_score_bonuses,
            proficiency_bonus: row.proficiency_bonus,
            body: encode(row.body),
            visibility,
          }),
        )}
        returning id
      `;
      levelMap.set(row.id, inserted[0]!.id);
    }

    const features = yield* sql<
      FeatureRow & {
        readonly source_corpus: string | null;
        readonly source_family: string | null;
        readonly source_key: string | null;
      }
    >`
      select * from feature
      where class_option_id = ${sourceClassId}
      order by level, parent_feature_id nulls first, id
    `;
    for (const row of features) {
      const inserted = yield* sql<{ readonly id: FeatureId }>`
        insert into feature ${sql.insert(
          defined({
            ...base,
            derived_from: row.id,
            source_corpus: row.source_corpus,
            source_family: row.source_family,
            source_key: row.source_key,
            class_option_id: targetClassId,
            subclass_id: row.subclass_id === null ? undefined : subclassMap.get(row.subclass_id),
            class_level_id:
              row.class_level_id === null ? undefined : levelMap.get(row.class_level_id),
            name: row.name,
            level: row.level,
            body: encode(row.body),
            visibility,
          }),
        )}
        returning id
      `;
      featureMap.set(row.id, inserted[0]!.id);
    }

    for (const row of features) {
      if (row.parent_feature_id === null) continue;
      const child = featureMap.get(row.id);
      const parent = featureMap.get(row.parent_feature_id);
      if (child !== undefined && parent !== undefined) {
        yield* sql`update feature set parent_feature_id = ${parent} where id = ${child}`;
      }
    }
  });

export class ClassProgression extends Context.Service<
  ClassProgression,
  {
    readonly read: (
      campaignId: CampaignId,
      id: CharacterOptionId,
    ) => Effect.Effect<ClassProgressionView, NotFound, CurrentActor>;
    readonly libraryRead: (
      id: CharacterOptionId,
    ) => Effect.Effect<ClassProgressionView, NotFound, CurrentActor>;
  }
>()("ClassProgression") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const readRows = (
        option: ClassOption,
        predicate: "campaign" | "library",
        campaignId?: CampaignId,
      ) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const childPredicate = (table: "subclass" | "class_level" | "feature") =>
            predicate === "campaign" && campaignId !== undefined
              ? corpusRowReadable(sql, table, campaignId, actor)
              : libraryRowReadable(sql, table, actor);

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

      const campaignOption = (campaignId: CampaignId, id: CharacterOptionId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          yield* ensureCampaignReadable(sql, campaignId, actor);
          const rows = yield* sql<
            Omit<ClassOptionRow, "subclass_count" | "level_count" | "feature_count">
          >`
            select * from character_option
            where id = ${id}
              and kind = 'class'
              and ${corpusRowReadable(sql, "character_option", campaignId, actor)}
          `;
          const row = rows[0];
          if (row === undefined) return yield* new NotFound({ resource: "option", id });
          const counts = (yield* classCounts(id))[0]!;
          return toClassOption({ ...row, ...counts });
        });

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
        read: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const option = yield* campaignOption(campaignId, id);
              return yield* readRows(option, "campaign", campaignId);
            }),
          ),
        libraryRead: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const option = yield* libraryOption(id);
              return yield* readRows(option, "library");
            }),
          ),
      };
    }),
  );
}
