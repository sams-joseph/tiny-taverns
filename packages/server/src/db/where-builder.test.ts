import * as PgClient from "@effect/sql-pg/PgClient";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { make as makeSqlClient, SqlClient } from "effect/unstable/sql/SqlClient";
import { ConnectionError, SqlError } from "effect/unstable/sql/SqlError";
import { makeWhereBuilder } from "./where-builder.js";

const testSqlClient = makeSqlClient({
  acquirer: Effect.die(
    new SqlError({
      reason: new ConnectionError({
        cause: new Error("where-builder tests only compile SQL"),
      }),
    }),
  ),
  compiler: PgClient.makeCompiler(),
  spanAttributes: [],
});

const TestSql = Layer.effect(SqlClient, testSqlClient).pipe(
  Layer.provide(Reactivity.layer),
  Layer.orDie,
);

describe("makeWhereBuilder", () => {
  it.effect("builds nested and/or where clauses with bound parameters", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient;
      const whereClause = makeWhereBuilder(sql, {
        campaignId_equals: (campaignId: string) => sql`campaign_id = ${campaignId}`,
        title_equals: (title: string) => sql`title = ${title}`,
        archivedAt_isNull: () => sql`archived_at IS NULL`,
      });

      const [statement, params] = sql`${
        whereClause({
          and: [
            { campaignId_equals: "campaign-1" },
            {
              or: [
                { title_equals: "General" },
                { archivedAt_isNull: true },
              ],
            },
          ],
        })
      }`.compile();

      expect(statement).toBe(
        "WHERE ((campaign_id = $1) AND ((title = $2) OR (archived_at IS NULL)))",
      );
      expect(params).toEqual(["campaign-1", "General"]);
    }).pipe(Effect.provide(TestSql)));

  it.effect("returns an empty fragment when where is omitted", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient;
      const whereClause = makeWhereBuilder(sql, {
        userId_equals: (userId: string) => sql`user_id = ${userId}`,
      });

      const [statement, params] = sql`${whereClause(undefined)}`.compile();

      expect(statement).toBe("");
      expect(params).toEqual([]);
    }).pipe(Effect.provide(TestSql)));

  it.effect("throws for empty groups", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient;
      const whereClause = makeWhereBuilder(sql, {
        userId_equals: (userId: string) => sql`user_id = ${userId}`,
      });

      expect(() => sql`${whereClause({ and: [] } as never)}`.compile()).toThrowError(
        "where-builder: empty and group",
      );
    }).pipe(Effect.provide(TestSql)));

  it.effect("throws for unknown filters", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient;
      const whereClause = makeWhereBuilder(sql, {
        userId_equals: (userId: string) => sql`user_id = ${userId}`,
      });

      expect(() => sql`${whereClause({ campaignId_equals: "campaign-1" } as never)}`.compile())
        .toThrowError("where-builder: unknown filter campaignId_equals");
    }).pipe(Effect.provide(TestSql)));
});
