import {
  CharacterOptionId,
  ClassLevel,
  ClassOption,
  type ClassProgression as ClassProgressionView,
  CurrentActor,
  Feature,
  NotFound,
  Subclass,
} from "@taverns/api";
import { Context, Effect, Layer, Schema, Struct } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { dieOnSqlError, fromColumns, orNotFound, timestampColumns } from "./rows.js";
import { libraryRowReadable } from "./visibility.js";

/**
 * A class as its progression reads it: the `character_option` row without
 * `details`, and a body carrying the three counts beside the class document.
 * The counts are merged into the body in the query, which answers it as
 * `counted_body`.
 */
const ClassOptionRow = fromColumns(
  Schema.Struct({ ...Struct.omit(ClassOption.fields, ["details"]), ...timestampColumns }),
  { body: "counted_body" },
);
const SubclassRow = fromColumns(Schema.Struct({ ...Subclass.fields, ...timestampColumns }));
const ClassLevelRow = fromColumns(Schema.Struct({ ...ClassLevel.fields, ...timestampColumns }));
const FeatureRow = fromColumns(Schema.Struct({ ...Feature.fields, ...timestampColumns }));

const OptionIdRequest = Schema.toType(CharacterOptionId);

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

      // Each child table through its own Library predicate, not the class's:
      // a subclass, level or feature is a row of its own.
      const subclasses = SqlSchema.findAll({
        Request: OptionIdRequest,
        Result: SubclassRow,
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select * from subclass
              where class_option_id = ${id}
                and ${libraryRowReadable(sql, "subclass", actor)}
              order by lower(name), id
            `,
          ),
      });
      const levels = SqlSchema.findAll({
        Request: OptionIdRequest,
        Result: ClassLevelRow,
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select * from class_level
              where class_option_id = ${id}
                and ${libraryRowReadable(sql, "class_level", actor)}
              order by level, subclass_id nulls first, id
            `,
          ),
      });
      const features = SqlSchema.findAll({
        Request: OptionIdRequest,
        Result: FeatureRow,
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select * from feature
              where class_option_id = ${id}
                and ${libraryRowReadable(sql, "feature", actor)}
              order by level, subclass_id nulls first, lower(name), id
            `,
          ),
      });

      const libraryOption = SqlSchema.findOne({
        Request: OptionIdRequest,
        Result: ClassOptionRow,
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select character_option.*,
                     character_option.body || jsonb_build_object(
                       'subclassCount',
                       (select count(*)::int from subclass where class_option_id = character_option.id),
                       'levelCount',
                       (select count(*)::int from class_level where class_option_id = character_option.id),
                       'featureCount',
                       (select count(*)::int from feature where class_option_id = character_option.id)
                     ) as counted_body
              from character_option
              where id = ${id}
                and kind = 'class'
                and ${libraryRowReadable(sql, "character_option", actor)}
            `,
          ),
      });

      return {
        libraryRead: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const option = yield* libraryOption(id).pipe(orNotFound("option", id));
              return {
                option,
                subclasses: yield* subclasses(option.id),
                levels: yield* levels(option.id),
                features: yield* features(option.id),
              };
            }),
          ),
      };
    }),
  );
}
