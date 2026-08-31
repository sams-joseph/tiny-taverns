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
import { Creatures } from "../src/repo/Creatures.js";
import { Options } from "../src/repo/Options.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import type { SystemOption } from "../src/ruleset/systemOptions.js";
import { migratedDatabase } from "./support/database.js";

const database = migratedDatabase("taverns_test_source_provenance");
const services = servicesOver(database);
const runtime = ManagedRuntime.make(services.pipe(Layer.provideMerge(database)));
afterAll(() => runtime.dispose());

const run = <A, E>(
  effect: Effect.Effect<A, E, Accounts | Campaigns | Creatures | Options | SqlClient.SqlClient>,
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
  sourceUrl: `/api/2014/classes/${sourceIndex}`,
  name,
  body: { hitDie, unarmouredAc: ["DEX"] },
  raw: { index: sourceIndex, name, hit_die: hitDie },
});

describe("rules source provenance", () => {
  it("records the current starter bundle as Taverns-authored, not as 5e-bits or SRD", async () => {
    await run(importSystemCreatures([creature("source-test-attribution", "Attribution Goblin")]));

    const rows = await sql(
      (client) => client<{
        readonly system: string;
        readonly edition: string;
        readonly document_name: string;
        readonly license: string;
        readonly attribution: string;
      }>`
      select system, edition, document_name, license, attribution
      from rules_source_document
      where system = 'taverns' and edition = 'project'
    `,
    );

    expect(rows).toEqual([
      {
        system: "taverns",
        edition: "project",
        document_name: "Tiny Taverns starter bundle",
        license: "project-authored",
        attribution: "Project-authored starter data bundled with Tiny Taverns.",
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/5e-bits|SRD|Wizards|OGL/i);
  });

  it("records character rules as pinned 2014 5e-bits/SRD data", async () => {
    await run(importSystemOptions([option("source-test-rules-attribution", "Attribution Class")]));

    const rows = await sql(
      (client) => client<{
        readonly system: string;
        readonly edition: string;
        readonly document_name: string;
        readonly document_version: string;
        readonly license: string;
        readonly attribution: string;
        readonly provider: string;
        readonly provider_commit: string | null;
      }>`
      select rules_source_document.system,
             rules_source_document.edition,
             rules_source_document.document_name,
             rules_source_document.document_version,
             rules_source_document.license,
             rules_source_document.attribution,
             rules_import_run.provider,
             rules_import_run.provider_commit
      from rules_source_document
      join rules_import_run on rules_import_run.document_id = rules_source_document.id
      where rules_source_document.system = 'dnd-5e-srd'
        and rules_source_document.edition = '2014'
      order by rules_import_run.imported_at desc
      limit 1
    `,
    );

    expect(rows).toEqual([
      {
        system: "dnd-5e-srd",
        edition: "2014",
        document_name: "5e-bits 2014 SRD data",
        document_version: "5e-database 5.10.0+5a7ee5a0489b26655d343e4a41e8f7942a887af2",
        license: "5e-bits MIT project data; underlying SRD 5.1 content under OGL-1.0a",
        attribution:
          "Rules data transformed from 5e-bits/5e-database commit 5a7ee5a0489b26655d343e4a41e8f7942a887af2 (MIT). Underlying Dungeons & Dragons 5th Edition SRD 5.1 material is used under the Open Game License version 1.0a.",
        provider: "5e-bits-transform",
        provider_commit: "5a7ee5a0489b26655d343e4a41e8f7942a887af2",
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
        readonly entity_name: string;
        readonly revisions: number;
        readonly has_source: boolean;
      }>`
      select creature.name,
             creature.hp,
             rules_source_entity.name as entity_name,
             count(rules_source_entity_revision.id)::int as revisions,
             (creature.source_entity_id is not null and creature.source_revision_id is not null) as has_source
      from creature
      join rules_source_entity on rules_source_entity.id = creature.source_entity_id
      join rules_source_entity_revision on rules_source_entity_revision.entity_id = rules_source_entity.id
      where rules_source_entity.family = 'monsters'
        and rules_source_entity.source_index = ${sourceIndex}
      group by creature.name, creature.hp, rules_source_entity.name,
               creature.source_entity_id, creature.source_revision_id
    `,
    );

    expect(rows).toEqual([
      {
        name: "Renamed Marsh Thing",
        hp: 13,
        entity_name: "Renamed Marsh Thing",
        revisions: 2,
        has_source: true,
      },
    ]);
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
        readonly source_index: string;
        readonly name: string;
        readonly hp: number;
      }>`
      select rules_source_entity.source_index, creature.name, creature.hp
      from creature
      join rules_source_entity on rules_source_entity.id = creature.source_entity_id
      where rules_source_entity.source_index in ('source-test-twin-a', 'source-test-twin-b')
      order by rules_source_entity.source_index
    `,
    );

    expect(result).toEqual({ inserted: 2, updated: 0 });
    expect(rows).toEqual([
      { source_index: "source-test-twin-a", name: "Twin Name", hp: 5 },
      { source_index: "source-test-twin-b", name: "Twin Name", hp: 9 },
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
      where source_entity_id in (
        select id from rules_source_entity where source_index = ${sourceIndex}
      )
    `,
    );
    expect(await run(importSystemOptions([renamed]))).toEqual({ inserted: 0, updated: 1 });

    const rows = await sql(
      (client) => client<{
        readonly name: string;
        readonly visibility: string;
        readonly body: ClassBody;
        readonly revisions: number;
      }>`
      select character_option.name,
             character_option.visibility,
             character_option.body,
             count(rules_source_entity_revision.id)::int as revisions
      from character_option
      join rules_source_entity on rules_source_entity.id = character_option.source_entity_id
      join rules_source_entity_revision on rules_source_entity_revision.entity_id = rules_source_entity.id
      where rules_source_entity.family = 'classes'
        and rules_source_entity.source_index = ${sourceIndex}
      group by character_option.name, character_option.visibility, character_option.body
    `,
    );

    expect(rows).toEqual([
      { name: "Renamed Class", visibility: "dm", body: renamed.body, revisions: 2 },
    ]);
  });

  it("copies source provenance onto campaign snapshots and leaves them there after source updates", async () => {
    const accounts = await run(
      Accounts.pipe(Effect.flatMap((service) => service.issue("Source DM"))),
    );
    const actor = new Actor({ accountId: accounts.accountId, campaignId: null });
    const campaign = await run(
      Campaigns.pipe(
        Effect.flatMap((campaigns) => campaigns.create({ name: "The Source Road" })),
        Effect.provideService(CurrentActor, actor),
      ),
    );

    const monsterSource = "source-test-snapshot-creature";
    const classSource = "source-test-snapshot-class";
    await run(importSystemCreatures([creature(monsterSource, "Snapshot Beast", 20)]));
    await run(importSystemOptions([option(classSource, "Snapshot Class", 8)]));

    const sourceRows = await sql(
      (client) => client<{
        readonly source_index: string;
        readonly domain_id: CreatureId | CharacterOptionId;
        readonly source_entity_id: string;
        readonly source_revision_id: string;
      }>`
      select rules_source_entity.source_index,
             creature.id::text as domain_id,
             creature.source_entity_id::text,
             creature.source_revision_id::text
      from creature
      join rules_source_entity on rules_source_entity.id = creature.source_entity_id
      where rules_source_entity.source_index = ${monsterSource}
      union all
      select rules_source_entity.source_index,
             character_option.id::text as domain_id,
             character_option.source_entity_id::text,
             character_option.source_revision_id::text
      from character_option
      join rules_source_entity on rules_source_entity.id = character_option.source_entity_id
      where rules_source_entity.source_index = ${classSource}
      order by source_index
    `,
    );
    const classRow = sourceRows.find((row) => row.source_index === classSource);
    const monsterRow = sourceRows.find((row) => row.source_index === monsterSource);
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
        readonly source_entity_id: string;
        readonly source_revision_id: string;
        readonly current_source_revision_id: string;
      }>`
      select 'creature' as table_name,
             creature.name,
             creature.source_entity_id::text,
             creature.source_revision_id::text,
             latest.id::text as current_source_revision_id
      from creature
      join rules_source_entity on rules_source_entity.id = creature.source_entity_id
      join lateral (
        select id from rules_source_entity_revision
        where entity_id = rules_source_entity.id
        order by imported_at desc, id desc
        limit 1
      ) latest on true
      where creature.campaign_id = ${campaign.id}
      union all
      select 'character_option' as table_name,
             character_option.name,
             character_option.source_entity_id::text,
             character_option.source_revision_id::text,
             latest.id::text as current_source_revision_id
      from character_option
      join rules_source_entity on rules_source_entity.id = character_option.source_entity_id
      join lateral (
        select id from rules_source_entity_revision
        where entity_id = rules_source_entity.id
        order by imported_at desc, id desc
        limit 1
      ) latest on true
      where character_option.campaign_id = ${campaign.id}
      order by table_name
    `,
    );

    expect(copies).toEqual([
      {
        table_name: "character_option",
        name: "Snapshot Class",
        source_entity_id: classRow.source_entity_id,
        source_revision_id: classRow.source_revision_id,
        current_source_revision_id: expect.not.stringMatching(classRow.source_revision_id),
      },
      {
        table_name: "creature",
        name: "Snapshot Beast",
        source_entity_id: monsterRow.source_entity_id,
        source_revision_id: monsterRow.source_revision_id,
        current_source_revision_id: expect.not.stringMatching(monsterRow.source_revision_id),
      },
    ]);
  });

  it("constrains source entity/revision pairs", async () => {
    await run(importSystemCreatures([creature("source-test-pair-a", "Pair A", 3)]));
    await run(importSystemCreatures([creature("source-test-pair-b", "Pair B", 4)]));

    const rows = await sql(
      (client) => client<{
        readonly source_index: string;
        readonly source_entity_id: string;
        readonly source_revision_id: string;
      }>`
      select rules_source_entity.source_index,
             creature.source_entity_id::text,
             creature.source_revision_id::text
      from creature
      join rules_source_entity on rules_source_entity.id = creature.source_entity_id
      where rules_source_entity.source_index in ('source-test-pair-a', 'source-test-pair-b')
      order by rules_source_entity.source_index
    `,
    );

    const mismatched = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* SqlClient.SqlClient;
        yield* client`
          insert into creature (
            campaign_id, origin, source_entity_id, source_revision_id,
            name, type, cr, cr_sort, ac, hp, environments, legendary, body
          )
          values (
            null,
            'system',
            ${rows[0]!.source_entity_id},
            ${rows[1]!.source_revision_id},
            'Impossible Pair',
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
