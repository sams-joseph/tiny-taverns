import { describe, expect } from "@effect/vitest";
import { CurrentActor, type Actor } from "@taverns/api";
import { Effect, Exit, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Accounts } from "../src/Accounts.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Groups } from "../src/repo/Groups.js";
import { Feats } from "../src/repo/Feats.js";
import { importSystemFeats } from "../src/ruleset/import.js";
import { SYSTEM_FEATS } from "../src/ruleset/systemFeats.js";
import { anAccount } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { items } from "./support/paging.js";
import { describeLayer } from "./support/suite.js";

const services = Layer.mergeAll(Accounts.layer, Campaigns.layer, Groups.layer, Feats.layer).pipe(
  Layer.provideMerge(migratedDatabase("taverns_test_feats")),
);

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(CurrentActor, actor));

const strengthId = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly id: string }>`
    select id::text from ability_score
    where source_corpus = '5e-bits-2014' and source_key = 'str'
  `;
  return rows[0]!.id;
});

describeLayer("feats", services, (it) => {
  describe("2014 feats", () => {
    it.effect(
      "imports the pinned baseline exactly, with Grappler's concrete Strength prerequisite",
      () =>
        Effect.gen(function* () {
          const imported = yield* importSystemFeats();
          const account = yield* anAccount("Feat DM");
          const feats = yield* withActor(account)(
            items(Effect.flatMap(Feats, (repo) => repo.library({}))),
          );
          const second = yield* importSystemFeats();
          const result = { imported, second, feats };

          expect(SYSTEM_FEATS).toHaveLength(1);
          expect(result.imported.inserted + result.imported.updated).toBe(1);
          expect(result.imported.prerequisites).toBe(1);
          expect(result.second.inserted).toBe(0);
          expect(result.second.updated).toBe(1);
          expect(result.second.prerequisites).toBe(1);
          expect(result.feats).toHaveLength(1);
          expect(result.feats[0]?.name).toBe("Grappler");
          expect(result.feats[0]?.description).toContain(
            "- You have advantage on Attack Rolls against a creature you are Grappling.",
          );
          expect(result.feats[0]?.prerequisites).toMatchObject([
            {
              ability: { index: "str", name: "STR" },
              minimumScore: 13,
              groupOrdinal: 0,
              ordinal: 0,
            },
          ]);
        }),
    );

    it.effect("authors custom feats and keeps them apart from later system imports", () =>
      Effect.gen(function* () {
        // The Library is the whole feat surface since the instancing decision of
        // 2026-09-02 — there is no campaign feat list and no copy-in. What is left
        // to pin is that an authored original and the pinned system row never
        // rewrite each other.
        yield* importSystemFeats();
        const account = yield* anAccount("Copy DM");
        const as = withActor(account);
        const feats = yield* Feats;
        const str = yield* strengthId;

        const custom = yield* as(
          feats.libraryCreate({
            name: "Chair Wrestler",
            description: ["You know where to put your weight."],
            prerequisites: [{ abilityScoreId: str as never, minimumScore: 11 }],
          }),
        );
        yield* as(
          feats.libraryUpdate(custom.id, {
            name: "Chair Wrestler Revised",
            description: ["The original moved."],
            prerequisites: [{ abilityScoreId: str as never, minimumScore: 15 }],
          }),
        );
        yield* importSystemFeats([
          {
            ...SYSTEM_FEATS[0]!,
            description: ["Changed by a later pinned import."],
            prerequisites: [{ abilityIndex: "str", minimumScore: 14 }],
          },
        ]);
        const original = yield* as(feats.libraryFindById(custom.id));
        const system = yield* as(
          items(Effect.flatMap(Feats, (repo) => repo.library({ q: "Changed" }))),
        );
        const outcome = { original, system };

        expect(outcome.original.name).toBe("Chair Wrestler Revised");
        expect(outcome.original.prerequisites[0]?.minimumScore).toBe(15);
        expect(outcome.system[0]?.name).toBe("Grappler");
        expect(outcome.system[0]?.prerequisites[0]?.minimumScore).toBe(14);
      }),
    );

    it.effect("enforces prerequisite ability-score identity with a foreign key", () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            const feat = yield* sql<{
              readonly id: string;
            }>`insert into feat (name, origin) values ('Broken', 'system') returning id::text`;
            const group = yield* sql<{ readonly id: string }>`
              insert into feat_prerequisite_group (feat_id, ordinal)
              values (${feat[0]!.id}, 0)
              returning id::text
            `;
            yield* sql`
              insert into feat_prerequisite_ability_score (
                feat_id, group_id, ability_score_id, minimum_score, ordinal
              ) values (
                ${feat[0]!.id}, ${group[0]!.id}, '00000000-0000-4000-8000-000000000001', 13, 0
              )
            `;
          }),
        );
        expect(Exit.isFailure(exit)).toBe(true);
      }),
    );
  });
});
