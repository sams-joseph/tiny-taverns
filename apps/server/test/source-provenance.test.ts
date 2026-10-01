import { describe, expect } from "@effect/vitest";
import { Actor, type ClassBody, CurrentActor, type CreatureId } from "@taverns/api";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { Accounts } from "../src/Accounts.js";
import { servicesOver } from "../src/app.js";
import { importSystemCreatures } from "../src/bestiary/import.js";
import type { SystemCreature } from "../src/bestiary/systemCreatures.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { Encounters } from "../src/repo/Encounters.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import type { SystemOption } from "../src/ruleset/systemOptions.js";
import { createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

const database = migratedDatabase("taverns_test_source_provenance");
const services = servicesOver(database).pipe(Layer.provideMerge(database));

const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.orDie);

const sql = <A>(effect: (client: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, effect).pipe(Effect.orDie);

const creature = (sourceIndex: string, name: string, hp = 7): SystemCreature => ({
  sourceIndex,
  name,
  type: "Humanoid",
  cr: "1/8",
  ac: 12,
  hp,
  environments: ["Test"],
});

const option = (sourceIndex: string, name: string, hitDie = 8): SystemOption => ({
  kind: "class",
  sourceFamily: "classes",
  sourceIndex,
  name,
  body: { hitDie, unarmouredAc: ["DEX"] },
  raw: { index: sourceIndex, name, hit_die: hitDie },
});

describeLayer("source-provenance", services, (it) => {
  describe("rules source identity", () => {
    it.effect(
      "stores the starter bundle as a Taverns source key, not as 5e-bits/SRD provenance",
      () =>
        Effect.gen(function* () {
          yield* run(
            importSystemCreatures([creature("source-test-attribution", "Attribution Goblin")]),
          );

          const rows = yield* sql(
            (client) => client<{
              readonly source_corpus: string;
              readonly source_family: string;
              readonly source_key: string;
            }>`
      select source_corpus, source_family, source_key
      from creature
      where source_key = 'source-test-attribution'
    `,
          );

          expect(rows).toEqual([
            {
              source_corpus: "taverns-starter",
              source_family: "monsters",
              source_key: "source-test-attribution",
            },
          ]);
          expect(JSON.stringify(rows)).not.toMatch(/5e-bits|SRD|Wizards|OGL/i);
        }),
    );

    it.effect(
      "stores character rules as stable 2014 source keys rather than source documents",
      () =>
        Effect.gen(function* () {
          yield* run(
            importSystemOptions([option("source-test-rules-attribution", "Attribution Class")]),
          );

          const rows = yield* sql(
            (client) => client<{
              readonly source_corpus: string;
              readonly source_family: string;
              readonly source_key: string;
            }>`
      select source_corpus, source_family, source_key
      from character_option
      where source_key = 'source-test-rules-attribution'
    `,
          );

          expect(rows).toEqual([
            {
              source_corpus: "5e-bits-2014",
              source_family: "classes",
              source_key: "source-test-rules-attribution",
            },
          ]);
        }),
    );

    it.effect("uses source identity rather than display names for creature upserts", () =>
      Effect.gen(function* () {
        const sourceIndex = "source-test-renamed-creature";

        expect(
          yield* run(importSystemCreatures([creature(sourceIndex, "Old Marsh Thing", 11)])),
        ).toEqual({
          inserted: 1,
          updated: 0,
        });
        expect(
          yield* run(importSystemCreatures([creature(sourceIndex, "Renamed Marsh Thing", 13)])),
        ).toEqual({
          inserted: 0,
          updated: 1,
        });

        const rows = yield* sql(
          (client) => client<{
            readonly name: string;
            readonly hp: number;
            readonly revisions: number;
          }>`
      select name, hp, count(*) over ()::int as revisions
      from creature
      where source_corpus = 'taverns-starter'
        and source_family = 'monsters'
        and source_key = ${sourceIndex}
    `,
        );

        expect(rows).toEqual([{ name: "Renamed Marsh Thing", hp: 13, revisions: 1 }]);
      }),
    );

    it.effect(
      "allows two system creatures with the same display name when their source keys differ",
      () =>
        Effect.gen(function* () {
          const result = yield* run(
            importSystemCreatures([
              creature("source-test-twin-a", "Twin Name", 5),
              creature("source-test-twin-b", "Twin Name", 9),
            ]),
          );

          const rows = yield* sql(
            (client) => client<{
              readonly source_key: string;
              readonly name: string;
              readonly hp: number;
            }>`
      select source_key, name, hp
      from creature
      where source_key in ('source-test-twin-a', 'source-test-twin-b')
      order by source_key
    `,
          );

          expect(result).toEqual({ inserted: 2, updated: 0 });
          expect(rows).toEqual([
            { source_key: "source-test-twin-a", name: "Twin Name", hp: 5 },
            { source_key: "source-test-twin-b", name: "Twin Name", hp: 9 },
          ]);
        }),
    );

    it.effect(
      "uses source identity for options and still preserves the insert-only shared rule",
      () =>
        Effect.gen(function* () {
          const sourceIndex = "source-test-renamed-class";
          const first = option(sourceIndex, "Old Class", 6);
          const renamed = option(sourceIndex, "Renamed Class", 10);

          expect(yield* run(importSystemOptions([first]))).toEqual({ inserted: 1, updated: 0 });
          yield* sql(
            (client) => client`
      update character_option set visibility = 'dm'
      where source_corpus = '5e-bits-2014'
        and source_family = 'classes'
        and source_key = ${sourceIndex}
    `,
          );
          expect(yield* run(importSystemOptions([renamed]))).toEqual({ inserted: 0, updated: 1 });

          const rows = yield* sql(
            (client) => client<{
              readonly name: string;
              readonly visibility: string;
              readonly body: ClassBody;
            }>`
      select name, visibility, body
      from character_option
      where source_corpus = '5e-bits-2014'
        and source_family = 'classes'
        and source_key = ${sourceIndex}
    `,
          );

          expect(rows).toEqual([{ name: "Renamed Class", visibility: "dm", body: renamed.body }]);
        }),
    );

    it.effect("carries source identity onto the internal instance a roster add mints", () =>
      Effect.gen(function* () {
        // The campaign-copy endpoints are gone (the instancing decision of
        // 2026-09-02); the one snapshot the product still takes is the internal
        // instance `EncounterCreatures.create` mints from an owned original, and
        // it copies the source triplet exactly as `derive` did — so lineage
        // survives the plumbing.
        const accounts = yield* run(
          Accounts.pipe(Effect.flatMap((service) => service.issue("Source DM"))),
        );
        const actor = new Actor({ accountId: accounts.accountId, scope: { _tag: "account" } });
        const campaign = yield* run(
          createCampaign({ name: "The Source Road" }).pipe(
            Effect.provideService(CurrentActor, actor),
          ),
        );

        // An owned original wearing a source triplet — the shape an imported-then-
        // owned row has; written with SQL because no shipped path stamps one.
        const original = yield* sql(
          (client) => client<{ readonly id: CreatureId }>`
        insert into creature (
          account_id, origin, source_corpus, source_family, source_key,
          name, type, cr, cr_sort, ac, hp
        )
        values (
          ${accounts.accountId}, 'imported', 'somewhere-else', 'monsters',
          'source-test-instance-lineage', 'Lineage Beast', 'Beast', '1', 1, 12, 20
        )
        returning id
      `,
        );

        const line = yield* run(
          Effect.gen(function* () {
            const encounters = yield* Encounters;
            const roster = yield* EncounterCreatures;
            const encounter = yield* encounters.create(campaign.id, { name: "Lineage check" });
            return yield* roster.create(campaign.id, encounter.id, {
              creatureId: original[0]!.id,
            });
          }).pipe(Effect.provideService(CurrentActor, actor)),
        );

        const instance = yield* sql(
          (client) => client<{
            readonly source_corpus: string;
            readonly source_family: string;
            readonly source_key: string;
            readonly derived_from: string;
          }>`
        select source_corpus, source_family, source_key, derived_from::text
        from creature where id = ${line.creatureId}
      `,
        );

        expect(instance[0]).toEqual({
          source_corpus: "somewhere-else",
          source_family: "monsters",
          source_key: "source-test-instance-lineage",
          derived_from: original[0]!.id,
        });
      }),
    );

    it.effect(
      "keeps source keys as all-or-nothing metadata and removes the old raw source graph",
      () =>
        Effect.gen(function* () {
          const tables = yield* sql(
            (client) => client<{ readonly table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and (table_name like 'rules_source_%' or table_name = 'rules_term')
      order by table_name
    `,
          );
          expect(tables).toEqual([]);

          const mismatched = yield* Effect.gen(function* () {
            const client = yield* SqlClient.SqlClient;
            yield* client`
          insert into creature (
            campaign_id, account_id, origin, source_corpus, source_family, source_key,
            name, type, cr, cr_sort, ac, hp, environments, legendary, body
          )
          values (
            null,
            null,
            'system',
            '5e-bits-2014',
            'monsters',
            null,
            'Impossible Key',
            'Humanoid',
            '1',
            1,
            10,
            10,
            '{}'::text[],
            false,
            '{}'::jsonb
          )
        `;
          }).pipe(Effect.result, Effect.orDie);

          expect(mismatched._tag).toBe("Failure");
        }),
    );
  });
});
