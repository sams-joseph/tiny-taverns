import { PgClient } from "@effect/sql-pg";
import {
  Config,
  Duration,
  Effect,
  identity,
  Layer,
  Schedule,
  String,
} from "effect";

export const pgConfig = {
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel,
  // - 114: JSON (return as string instead of parsed object)
  // - 1082: DATE
  // - 3802: JSONB (return as string instead of parsed object)
  getTypesParser: {
    114: {
      to: 25,
      from: [114],
      parse: identity,
      serialize: identity,
    },
    1082: {
      to: 25,
      from: [1082],
      parse: identity,
      serialize: identity,
    },
    3802: {
      to: 25,
      from: [3802],
      parse: identity,
      serialize: identity,
    },
  },
} as const;

export const PostgresClient = Layer.unwrapEffect(
  Effect.gen(function* () {
    return PgClient.layer({
      url: yield* Config.redacted("DATABASE_URL"),
      ...pgConfig,
    });
  }),
).pipe((self) =>
  Layer.retry(
    self,
    Schedule.identity<Layer.Layer.Error<typeof self>>().pipe(
      Schedule.check((input) => input._tag === "SqlError"),
      Schedule.intersect(Schedule.exponential("1 second")),
      Schedule.intersect(Schedule.recurs(2)),
      Schedule.onDecision(([[_error, duration], attempt], decision) =>
        decision._tag === "Continue"
          ? Effect.logInfo(
              `Retrying database connection in ${Duration.format(duration)} (attempt #${++attempt})`,
            )
          : Effect.void,
      ),
    ),
  ),
);
