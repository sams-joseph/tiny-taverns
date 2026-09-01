import {
  Actor,
  type CharacterOptionId,
  type ClassBody,
  CurrentActor,
  type CreatureId,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { servicesOver } from "../src/app.js";
import { importSystemCreatures } from "../src/bestiary/import.js";
import type { SystemCreature } from "../src/bestiary/systemCreatures.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Groups } from "../src/repo/Groups.js";
import { Creatures } from "../src/repo/Creatures.js";
import { Options } from "../src/repo/Options.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import type { SystemOption } from "../src/ruleset/systemOptions.js";
import { createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

const database = migratedDatabase("taverns_test_source_provenance");
const services = servicesOver(database);
const runtime = ManagedRuntime.make(services.pipe(Layer.provideMerge(database)));
afterAll(() => runtime.dispose());

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    Accounts | Campaigns | Groups | Creatures | Options | SqlClient.SqlClient
  >,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const sql = <A>(effect: (client: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  run(Effect.flatMap(SqlClient.SqlClient, effect));

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

describe("rules source identity", () => {
  it("stores the starter bundle as a Taverns source key, not as 5e-bits/SRD provenance", async () => {
    await run(importSystemCreatures([creature("source-test-attribution", "Attribution Goblin")]));

    const rows = await sql(
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
  });

  it("stores character rules as stable 2014 source keys rather than source documents", async () => {
    await run(importSystemOptions([option("source-test-rules-attribution", "Attribution Class")]));

    const rows = await sql(
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
  });

  it("uses source identity rather than display names for creature upserts", async () => {
    const sourceIndex = "source-test-renamed-creature";

    expect(
      await run(importSystemCreatures([creature(sourceIndex, "Old Marsh Thing", 11)])),
    ).toEqual({
      inserted: 1,
      updated: 0,
    });
    expect(
      await run(importSystemCreatures([creature(sourceIndex, "Renamed Marsh Thing", 13)])),
    ).toEqual({
      inserted: 0,
      updated: 1,
    });

    const rows = await sql(
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
  });

  it("allows two system creatures with the same display name when their source keys differ", async () => {
    const result = await run(
      importSystemCreatures([
        creature("source-test-twin-a", "Twin Name", 5),
        creature("source-test-twin-b", "Twin Name", 9),
      ]),
    );

    const rows = await sql(
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
  });

  it("uses source identity for options and still preserves the insert-only shared rule", async () => {
    const sourceIndex = "source-test-renamed-class";
    const first = option(sourceIndex, "Old Class", 6);
    const renamed = option(sourceIndex, "Renamed Class", 10);

    expect(await run(importSystemOptions([first]))).toEqual({ inserted: 1, updated: 0 });
    await sql(
      (client) => client`
      update character_option set visibility = 'dm'
      where source_corpus = '5e-bits-2014'
        and source_family = 'classes'
        and source_key = ${sourceIndex}
    `,
    );
    expect(await run(importSystemOptions([renamed]))).toEqual({ inserted: 0, updated: 1 });

    const rows = await sql(
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
  });

  it("copies source identity onto campaign snapshots and leaves the snapshot content alone after source updates", async () => {
    const accounts = await run(
      Accounts.pipe(Effect.flatMap((service) => service.issue("Source DM"))),
    );
    const actor = new Actor({ accountId: accounts.accountId, scope: { _tag: "account" } });
    const campaign = await run(
      createCampaign({ name: "The Source Road" }).pipe(Effect.provideService(CurrentActor, actor)),
    );

    const monsterSource = "source-test-snapshot-creature";
    const classSource = "source-test-snapshot-class";
    await run(importSystemCreatures([creature(monsterSource, "Snapshot Beast", 20)]));
    await run(importSystemOptions([option(classSource, "Snapshot Class", 8)]));

    const sourceRows = await sql(
      (client) => client<{
        readonly source_key: string;
        readonly domain_id: CreatureId | CharacterOptionId;
      }>`
      select source_key, id::text as domain_id
      from creature
      where source_key = ${monsterSource}
      union all
      select source_key, id::text as domain_id
      from character_option
      where source_key = ${classSource}
      order by source_key
    `,
    );
    const classRow = sourceRows.find((row) => row.source_key === classSource);
    const monsterRow = sourceRows.find((row) => row.source_key === monsterSource);
    if (classRow === undefined || monsterRow === undefined) throw new Error("expected source rows");

    await run(
      Effect.all([
        Creatures.pipe(
          Effect.flatMap((creatures) =>
            creatures.derive(campaign.id, monsterRow.domain_id as CreatureId, {}),
          ),
        ),
        Options.pipe(
          Effect.flatMap((options) =>
            options.derive(campaign.id, classRow.domain_id as CharacterOptionId, {}),
          ),
        ),
      ]).pipe(Effect.provideService(CurrentActor, actor)),
    );

    await run(importSystemCreatures([creature(monsterSource, "Snapshot Beast Revised", 21)]));
    await run(importSystemOptions([option(classSource, "Snapshot Class Revised", 12)]));

    const copies = await sql(
      (client) => client<{
        readonly table_name: string;
        readonly name: string;
        readonly source_corpus: string;
        readonly source_family: string;
        readonly source_key: string;
      }>`
      select 'creature' as table_name, name, source_corpus, source_family, source_key
      from creature
      where campaign_id = ${campaign.id}
      union all
      select 'character_option' as table_name, name, source_corpus, source_family, source_key
      from character_option
      where campaign_id = ${campaign.id}
      order by table_name
    `,
    );

    expect(copies).toEqual([
      {
        table_name: "character_option",
        name: "Snapshot Class",
        source_corpus: "5e-bits-2014",
        source_family: "classes",
        source_key: classSource,
      },
      {
        table_name: "creature",
        name: "Snapshot Beast",
        source_corpus: "taverns-starter",
        source_family: "monsters",
        source_key: monsterSource,
      },
    ]);
  });

  it("keeps source keys as all-or-nothing metadata and removes the old raw source graph", async () => {
    const tables = await sql(
      (client) => client<{ readonly table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and (table_name like 'rules_source_%' or table_name = 'rules_term')
      order by table_name
    `,
    );
    expect(tables).toEqual([]);

    const mismatched = await runtime.runPromise(
      Effect.gen(function* () {
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
      }).pipe(Effect.result, Effect.orDie),
    );

    expect(mismatched._tag).toBe("Failure");
  });
});
