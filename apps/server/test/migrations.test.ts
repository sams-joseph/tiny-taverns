import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, describe, expect, it } from "vitest";
import * as Database from "../src/Database.js";
import init from "../src/migrations/0001_init.js";
import clerkIdentity from "../src/migrations/0002_clerk_identity.js";
import sessionFinished from "../src/migrations/0006_session_finished.js";
import characterSheet from "../src/migrations/0012_character_sheet.js";
import invites from "../src/migrations/0013_group_invites.js";
import characterLive from "../src/migrations/0014_character_live.js";
import libraryCreatures from "../src/migrations/0015_library_creatures.js";
import playerThreads from "../src/migrations/0016_player_threads.js";
import characterOptions from "../src/migrations/0017_character_options.js";
import backgroundOption from "../src/migrations/0018_background_option.js";
import sourceProvenance from "../src/migrations/0019_rules_source_provenance.js";
import prepSurface from "../src/migrations/0003_prep_surface.js";
import bestiary from "../src/migrations/0004_bestiary.js";
import liveSession from "../src/migrations/0005_live_session.js";
import runCarryover from "../src/migrations/0007_run_carryover.js";
import beats from "../src/migrations/0008_beats.js";
import searchIndex from "../src/migrations/0009_search_index.js";
import assistantConversation from "../src/migrations/0010_assistant_conversation.js";
import { freshDatabase } from "./support/database.js";

/** Migrations run against a database created empty for this file. */
const runtime = ManagedRuntime.make(freshDatabase("taverns_test_migrations"));
afterAll(() => runtime.dispose());

/** A second empty database, for stepping through the migrations by hand. */
const upgradeRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_upgrade"));
afterAll(() => upgradeRuntime.dispose());

/** A third, for the database that already holds the shipped defect. */
const stuckRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_stuck"));
afterAll(() => stuckRuntime.dispose());

/** A fifth, for characters written before they had a sheet. */
const sheetRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_sheet"));
afterAll(() => sheetRuntime.dispose());

/** A sixth, for characters written before they were live. */
const liveRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_live"));
afterAll(() => liveRuntime.dispose());

/** A seventh, for creatures written before a monster could belong to an account. */
const libraryRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_library"));
afterAll(() => libraryRuntime.dispose());

/** An eighth, for conversations written before a player could have one. */
const threadRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_threads"));
afterAll(() => threadRuntime.dispose());

/** A ninth, for source provenance added after the starter bundle existed. */
const sourceRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_sources"));
afterAll(() => sourceRuntime.dispose());

/**
 * A campaign as the clean baseline requires one: its group, the owner's
 * membership, the campaign and the creator's participation — written the way
 * `Groups.create` and `Campaigns.create` write them, in raw SQL because these
 * tests run at points in the ledger where the repositories may not exist yet.
 * Two transactions, because each deferred owner/creator key wants its pair of
 * statements committed together.
 */
const rawCampaign = (sql: SqlClient.SqlClient, accountId: string, name: string) =>
  Effect.gen(function* () {
    const group = yield* sql.withTransaction(
      Effect.gen(function* () {
        const rows = yield* sql<{ readonly id: string }>`
          insert into play_group ${sql.insert({
            owner_account_id: accountId,
            name: `${name} group`,
          })}
          returning id
        `;
        yield* sql`
          insert into group_member ${sql.insert({ group_id: rows[0]!.id, account_id: accountId })}
        `;
        return rows[0]!.id;
      }),
    );
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const rows = yield* sql<{ readonly id: string }>`
          insert into campaign ${sql.insert({
            group_id: group,
            creator_account_id: accountId,
            name,
          })}
          returning id
        `;
        yield* sql`
          insert into campaign_member ${sql.insert({
            campaign_id: rows[0]!.id,
            group_id: group,
            account_id: accountId,
          })}
        `;
        return rows[0]!.id;
      }),
    );
  });

const migrate = Effect.scoped(
  Layer.build(Layer.provide(Database.layerMigrator, NodeServices.layer)),
).pipe(Effect.orDie);

const tableNames = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly table_name: string }>`
    select table_name from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `;
  return rows.map((row) => row.table_name);
});

const appliedMigrations = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<{ readonly migration_id: number; readonly name: string }>`
    select migration_id, name from effect_sql_migrations order by migration_id
  `;
});

describe("migrations", () => {
  it("bring an empty database up to the current schema", async () => {
    expect(await runtime.runPromise(tableNames)).toEqual([]);

    await runtime.runPromise(migrate);

    expect(await runtime.runPromise(tableNames)).toEqual([
      "ability_score",
      "account",
      "assistant_thread",
      "assistant_turn",
      "beat",
      "campaign",
      "campaign_character",
      "campaign_member",
      "character",
      "character_option",
      "character_option_ability_bonus",
      "character_option_equipment_reference",
      "character_option_language",
      "character_option_proficiency",
      "character_option_subrace",
      "character_option_trait",
      "character_resource_request",
      "character_roll",
      "class_level",
      "combatant",
      "condition",
      "creature",
      "creature_armor_equipment",
      "creature_condition_immunity",
      "creature_damage_type",
      "creature_form",
      "creature_proficiency",
      "creature_spell",
      "damage_type",
      "effect_sql_migrations",
      "encounter",
      "encounter_creature",
      "encounter_run",
      "equipment",
      "equipment_category",
      "equipment_content",
      "equipment_property",
      "feat",
      "feat_description",
      "feat_prerequisite_ability_score",
      "feat_prerequisite_group",
      "feature",
      "group_history_entry",
      "group_history_summary",
      "group_invite",
      "group_library_share",
      "group_member",
      "hob_direct_resource_update",
      "language",
      "magic_item",
      "magic_item_rarity",
      "magic_item_variant",
      "magic_school",
      "note",
      "npc",
      "npc_knowledge_fact",
      "npc_memory",
      "npc_thread",
      "npc_turn",
      "play_group",
      "prep_item",
      "proficiency",
      "racial_trait",
      "racial_trait_damage_type",
      "racial_trait_proficiency",
      "rule_article",
      "rule_choice_ability",
      "rule_choice_group",
      "rule_choice_language",
      "rule_choice_proficiency",
      "rule_choice_trait",
      "rule_section",
      "session",
      "session_event",
      "skill",
      "spell",
      "spell_class",
      "spell_damage_type",
      "spell_subclass",
      "subclass",
      "weapon_property",
    ]);
    // Numbering is load-bearing and the failure is silent: `Migrator.run` keeps
    // only `currentId > latestMigrationId`, so a file numbered below one that
    // has already been applied is skipped rather than refused. Two people
    // numbering in parallel is how that happens; a database that applied 13
    // before 12 existed needs `pnpm db:reset`, and a fresh one is fine.
    expect(await runtime.runPromise(appliedMigrations)).toEqual([
      { migration_id: 1, name: "init" },
      { migration_id: 2, name: "clerk_identity" },
      { migration_id: 3, name: "prep_surface" },
      { migration_id: 4, name: "bestiary" },
      { migration_id: 5, name: "live_session" },
      { migration_id: 6, name: "session_finished" },
      { migration_id: 7, name: "run_carryover" },
      { migration_id: 8, name: "beats" },
      { migration_id: 9, name: "search_index" },
      { migration_id: 10, name: "assistant_conversation" },
      { migration_id: 12, name: "character_sheet" },
      { migration_id: 13, name: "group_invites" },
      { migration_id: 14, name: "character_live" },
      { migration_id: 15, name: "library_creatures" },
      { migration_id: 16, name: "player_threads" },
      { migration_id: 17, name: "character_options" },
      { migration_id: 18, name: "background_option" },
      { migration_id: 19, name: "rules_source_provenance" },
      { migration_id: 20, name: "2014_character_rules" },
      { migration_id: 21, name: "spells" },
      { migration_id: 22, name: "equipment" },
      { migration_id: 23, name: "magic_items" },
      { migration_id: 24, name: "creature_monster_corpus" },
      { migration_id: 25, name: "concrete_source_relationships" },
      { migration_id: 26, name: "class_progression" },
      { migration_id: 27, name: "character_vocabulary_traits" },
      { migration_id: 28, name: "rules_compendium" },
      { migration_id: 29, name: "feats" },
      { migration_id: 30, name: "group_history" },
      { migration_id: 31, name: "group_threads" },
      { migration_id: 32, name: "group_library_share" },
      { migration_id: 33, name: "character_resource_requests" },
      { migration_id: 34, name: "rolls" },
      { migration_id: 35, name: "hob_direct_resource_writes" },
      { migration_id: 36, name: "session_event_character" },
      { migration_id: 37, name: "npcs" },
      { migration_id: 38, name: "npc_knowledge_memory" },
      { migration_id: 39, name: "npc_player_direct_chat" },
      { migration_id: 40, name: "npc_library_sources" },
      { migration_id: 41, name: "npc_session_shared_chat" },
    ]);
  }, 60_000);

  it("are a no-op when run a second time", async () => {
    // Forward-only — `Migrator` has no down-migration concept — so "safe to
    // re-run" is the only property there is to hold onto.
    await runtime.runPromise(migrate);
    await runtime.runPromise(migrate);

    expect(await runtime.runPromise(appliedMigrations)).toEqual([
      { migration_id: 1, name: "init" },
      { migration_id: 2, name: "clerk_identity" },
      { migration_id: 3, name: "prep_surface" },
      { migration_id: 4, name: "bestiary" },
      { migration_id: 5, name: "live_session" },
      { migration_id: 6, name: "session_finished" },
      { migration_id: 7, name: "run_carryover" },
      { migration_id: 8, name: "beats" },
      { migration_id: 9, name: "search_index" },
      { migration_id: 10, name: "assistant_conversation" },
      { migration_id: 12, name: "character_sheet" },
      { migration_id: 13, name: "group_invites" },
      { migration_id: 14, name: "character_live" },
      { migration_id: 15, name: "library_creatures" },
      { migration_id: 16, name: "player_threads" },
      { migration_id: 17, name: "character_options" },
      { migration_id: 18, name: "background_option" },
      { migration_id: 19, name: "rules_source_provenance" },
      { migration_id: 20, name: "2014_character_rules" },
      { migration_id: 21, name: "spells" },
      { migration_id: 22, name: "equipment" },
      { migration_id: 23, name: "magic_items" },
      { migration_id: 24, name: "creature_monster_corpus" },
      { migration_id: 25, name: "concrete_source_relationships" },
      { migration_id: 26, name: "class_progression" },
      { migration_id: 27, name: "character_vocabulary_traits" },
      { migration_id: 28, name: "rules_compendium" },
      { migration_id: 29, name: "feats" },
      { migration_id: 30, name: "group_history" },
      { migration_id: 31, name: "group_threads" },
      { migration_id: 32, name: "group_library_share" },
      { migration_id: 33, name: "character_resource_requests" },
      { migration_id: 34, name: "rolls" },
      { migration_id: 35, name: "hob_direct_resource_writes" },
      { migration_id: 36, name: "session_event_character" },
      { migration_id: 37, name: "npcs" },
      { migration_id: 38, name: "npc_knowledge_memory" },
      { migration_id: 39, name: "npc_player_direct_chat" },
      { migration_id: 40, name: "npc_library_sources" },
      { migration_id: 41, name: "npc_session_shared_chat" },
    ]);
  }, 60_000);
});

describe("upgrading a database that already holds accounts", () => {
  it("adds the second credential without a backfill and without losing a row", async () => {
    // Stepped by hand rather than through the migrator, because the property
    // is about the *order*: rows written under the old schema have to satisfy
    // the new constraint as they stand. Running both migrations against an
    // empty database — which the tests above do — cannot show that.
    const accountsAfterUpgrade = await upgradeRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* init;
        // An account as 0001 knew them: a machine token and nothing else.
        yield* sql`insert into account ${sql.insert({ name: "Jo", token_hash: "existing-hash" })}`;

        yield* clerkIdentity;

        return yield* sql<{
          readonly name: string;
          readonly token_hash: string | null;
          readonly clerk_user_id: string | null;
        }>`select name, token_hash, clerk_user_id from account`;
      }).pipe(Effect.orDie),
    );

    expect(accountsAfterUpgrade).toEqual([
      { name: "Jo", token_hash: "existing-hash", clerk_user_id: null },
    ]);
  }, 60_000);
});

describe("upgrading a database left in the dead end", () => {
  it("releases a campaign still pointing at a session it finished", async () => {
    // The shipped defect, on every database that has run one night to its end:
    // `ended_at` stamped, the pointer never moved. `0006` cannot add its
    // foreign key while such a row exists, so it repairs them first — and the
    // repair is exactly what the fix would have done at the time. Stepped by
    // hand for the reason the test above is: the property is about rows written
    // under the old schema, which an empty database cannot show.
    const campaignAfterUpgrade = await stuckRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* init;
        const accounts = yield* sql<{
          readonly id: string;
        }>`insert into account ${sql.insert({ name: "Jo", token_hash: "hash" })} returning id`;
        const campaigns = [{ id: yield* rawCampaign(sql, accounts[0]!.id, "The Salt Road") }];
        const sessions = yield* sql<{ readonly id: string }>`
          insert into session ${sql.insert({ campaign_id: campaigns[0]!.id, number: 12 })}
          returning id
        `;
        // A night run to its end under the old code: both halves of §1.4's
        // transition were the client's to do, and it only did the first.
        yield* sql`update session set ended_at = now() where id = ${sessions[0]!.id}`;
        yield* sql`
          update campaign set current_session_id = ${sessions[0]!.id}
          where id = ${campaigns[0]!.id}
        `;

        yield* sessionFinished;

        return yield* sql<{ readonly current_session_id: string | null }>`
          select current_session_id from campaign where id = ${campaigns[0]!.id}
        `;
      }).pipe(Effect.orDie),
    );

    expect(campaignAfterUpgrade).toEqual([{ current_session_id: null }]);
  }, 60_000);
});

describe("upgrading a database whose characters predate the sheet", () => {
  it("keeps every column's data, derives the descriptor, and takes the old one at its word", async () => {
    // The risky half of `0012`. `descriptor` was a column the DM typed and is
    // now generated from three others, so the migration has to drop and re-add
    // it — and a drop is where a party quietly loses what somebody wrote.
    //
    // Stepped by hand for the reason the three above are: the property is about
    // rows written under the old schema, and an empty database cannot show it.
    // Three characters: one with every column filled, one with the numbers left
    // blank, and one with no descriptor at all.
    const { rows, refused } = await sheetRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* init;
        const account = (yield* sql<{ readonly id: string }>`
          insert into account ${sql.insert({ name: "Jo", token_hash: "hash" })} returning id
        `)[0]!.id;
        // Account-owned from `0001` — the clean baseline has no campaign_id
        // on character; a campaign's claim is a seat, which this property
        // does not need.
        const character = (values: Record<string, unknown>) =>
          sql`insert into character ${sql.insert({ account_id: account, ...values })}`;

        yield* character({
          name: "Brannoc",
          player_name: "Ilse",
          descriptor: "Half-orc paladin",
          ac: 18,
          hp_max: 52,
          visibility: "shared",
        });
        yield* character({ name: "Wren", player_name: "Kofi", descriptor: "Tiefling bard" });
        yield* character({ name: "Sister Pell", ac: 16 });

        yield* characterSheet;

        const rows = yield* sql<{
          readonly name: string;
          readonly player_name: string | null;
          readonly ac: number | null;
          readonly hp_max: number | null;
          readonly visibility: string;
          readonly descriptor: string | null;
          readonly level: number | null;
          readonly race: string | null;
          readonly class_name: string | null;
          readonly sheet_url: string | null;
          readonly body: { readonly notes: string };
        }>`
          select name, player_name, ac, hp_max, visibility, descriptor,
                 level, species as race, class_name, sheet_url, body
          from character order by name
        `;

        // And the new descriptor really is generated, not merely computed by
        // whatever wrote the row: Postgres refuses to be told what it says.
        const refused = yield* sql`
          update character set descriptor = 'Something else' where name = 'Wren'
        `.pipe(Effect.result);

        return { rows, refused: refused._tag };
      }).pipe(Effect.orDie),
    );

    expect(rows).toEqual([
      {
        name: "Brannoc",
        // The four columns that did not move still hold exactly what they held.
        player_name: "Ilse",
        ac: 18,
        hp_max: 52,
        visibility: "shared",
        // The fifth is prose, and the migration does not parse prose: the text
        // is kept verbatim as the sheet's opening note, and the derived
        // descriptor is null until somebody fills in the two columns that make
        // it. Guessing that "Half-orc paladin" is a race and a class is the
        // thing these columns exist to stop.
        body: { notes: "Half-orc paladin", abilities: [], traits: [] },
        descriptor: null,
        level: null,
        race: null,
        class_name: null,
        sheet_url: null,
      },
      {
        name: "Sister Pell",
        player_name: null,
        ac: 16,
        hp_max: null,
        visibility: "dm",
        // No descriptor to keep, so the empty document the column defaults to.
        body: { notes: "", abilities: [], traits: [] },
        descriptor: null,
        level: null,
        race: null,
        class_name: null,
        sheet_url: null,
      },
      {
        name: "Wren",
        player_name: "Kofi",
        ac: null,
        hp_max: null,
        visibility: "dm",
        body: { notes: "Tiefling bard", abilities: [], traits: [] },
        descriptor: null,
        level: null,
        race: null,
        class_name: null,
        sheet_url: null,
      },
    ]);
    expect(refused).toBe("Failure");
  }, 60_000);
});

describe("upgrading a database whose characters predate the live columns", () => {
  it("keeps every row, says nothing about where anybody is, and takes one more event kind", async () => {
    // The risky half of `0014` is what it does *not* do. A party written before
    // characters were live has no current hit points, and the tempting
    // backfill — `hp_current = hp_max` — writes a claim into a column the DM
    // will trust: that everybody walked in unhurt. Null is the honest answer
    // and every reader treats it as full, so the absence costs nothing and the
    // guess would cost a party's health.
    //
    // Stepped by hand for the reason the four above are: the property is about
    // rows written under the old schema, and an empty database cannot show it.
    const { rows, kindAccepted, kindRefused } = await liveRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* init;
        const account = (yield* sql<{ readonly id: string }>`
          insert into account ${sql.insert({ name: "Jo", token_hash: "hash" })} returning id
        `)[0]!.id;
        const campaign = yield* rawCampaign(sql, account, "The Salt Road");
        yield* sql`
          insert into character ${sql.insert({
            account_id: account,
            name: "Brannoc",
            player_name: "Ilse",
            ac: 18,
            hp_max: 52,
            visibility: "shared",
          })}
        `;
        yield* sql`
          insert into character ${sql.insert({ account_id: account, name: "Sister Pell" })}
        `;

        // Everything between, because `0014` also widens the session log's
        // closed `kind` vocabulary and that table arrives in `0005`. Skipped in
        // the tests above only because `character` does not depend on it.
        yield* prepSurface;
        yield* bestiary;
        yield* liveSession;
        yield* sessionFinished;
        yield* runCarryover;
        yield* beats;
        yield* searchIndex;
        yield* assistantConversation;
        yield* characterSheet;
        yield* invites;
        yield* characterLive;

        const rows = yield* sql<{
          readonly name: string;
          readonly player_name: string | null;
          readonly ac: number | null;
          readonly hp_max: number | null;
          readonly hp_current: number | null;
          readonly temp_hp: number;
          readonly conditions: ReadonlyArray<string>;
          readonly visibility: string;
        }>`
          select name, player_name, ac, hp_max, hp_current, temp_hp, conditions, visibility
          from character order by name
        `;

        // The log's vocabulary grew by exactly one, and it is still closed.
        const session = (yield* sql<{ readonly id: string }>`
          insert into session ${sql.insert({ campaign_id: campaign, number: 1 })} returning id
        `)[0]!.id;
        const kindAccepted = yield* sql`
          insert into session_event ${sql.insert({ session_id: session, kind: "character-updated" })}
        `.pipe(Effect.result);
        const kindRefused = yield* sql`
          insert into session_event ${sql.insert({ session_id: session, kind: "character-levelled" })}
        `.pipe(Effect.result);

        return { rows, kindAccepted: kindAccepted._tag, kindRefused: kindRefused._tag };
      }).pipe(Effect.orDie),
    );

    expect(rows).toEqual([
      {
        name: "Brannoc",
        player_name: "Ilse",
        ac: 18,
        hp_max: 52,
        visibility: "shared",
        // Nobody has said. Not zero, and not 52.
        hp_current: null,
        // These two are ordinary states rather than unsaid ones, so they have
        // defaults and no row is left carrying a null nobody meant.
        temp_hp: 0,
        conditions: [],
      },
      {
        name: "Sister Pell",
        player_name: null,
        ac: null,
        hp_max: null,
        visibility: "dm",
        hp_current: null,
        temp_hp: 0,
        conditions: [],
      },
    ]);
    expect(kindAccepted).toBe("Success");
    expect(kindRefused).toBe("Failure");
  }, 60_000);
});

describe("upgrading a database whose creatures predate the Library", () => {
  it("keeps every row, gives none of them an owner, and keeps the bundle unownable", async () => {
    // **`0015` clears nothing, and that is the property to hold.** The captain's
    // note was that the app is early and campaign-authored monsters need not be
    // carried over — but a migration is permanent history and runs everywhere it
    // is ever applied, so "the app is early" is a fact about today rather than
    // about the file. What lands instead is one nullable column and two
    // constraints that every existing row already satisfies.
    //
    // A creature written before this is a campaign's, `account_id` null, and
    // stays exactly that: readable in its campaign's bestiary as it always was,
    // and absent from every Library because it is not an original. Backfilling
    // one into somebody's Library would mean guessing whose, and a guess written
    // into a column somebody trusts is worse than an absence — the same refusal
    // `0012` made about parsing old descriptors.
    //
    // Stepped by hand for the reason the five above are: the property is about
    // rows written under the old schema, and an empty database cannot show it.
    const { rows, owned, promoted, both, stillUnique } = await libraryRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* init;
        yield* prepSurface;
        yield* bestiary;

        const account = (yield* sql<{ readonly id: string }>`
          insert into account ${sql.insert({ name: "Jo", token_hash: "hash" })} returning id
        `)[0]!.id;
        const campaign = yield* rawCampaign(sql, account, "The Salt Road");
        const authored = (yield* sql<{ readonly id: string }>`
          insert into creature ${sql.insert({
            campaign_id: campaign,
            name: "The Ferryman's Wife",
            type: "Fey",
            cr: "5",
            ac: 17,
            hp: 82,
            visibility: "shared",
          })}
          returning id
        `)[0]!.id;
        const bundled = (yield* sql<{ readonly id: string }>`
          insert into creature ${sql.insert({
            campaign_id: null,
            origin: "system",
            name: "Goblin Boss",
            type: "Humanoid",
            cr: "1",
            ac: 17,
            hp: 21,
          })}
          returning id
        `)[0]!.id;

        // Everything between, because `creature` arrives in `0004` and nothing
        // after it touches the table until here.
        yield* liveSession;
        yield* sessionFinished;
        yield* runCarryover;
        yield* beats;
        yield* searchIndex;
        yield* assistantConversation;
        yield* characterSheet;
        yield* invites;
        yield* characterLive;
        yield* libraryCreatures;

        const rows = yield* sql<{
          readonly name: string;
          readonly campaign_id: string | null;
          readonly account_id: string | null;
          readonly origin: string;
          readonly visibility: string;
        }>`
          select name, campaign_id, account_id, origin, visibility
          from creature order by name
        `;

        // The bundle cannot be given an owner, which is the sentence the shared
        // corpus's immutability now rests on, and an owned row cannot be made
        // bundled from the other side.
        const owned = yield* sql`
          update creature set account_id = ${account} where id = ${bundled}
        `.pipe(Effect.result);
        const promoted = yield* sql`
          update creature set origin = 'system' where id = ${authored}
        `.pipe(Effect.result);
        // And no row is a campaign's and an account's at once.
        const both = yield* sql`
          insert into creature ${sql.insert({
            campaign_id: campaign,
            account_id: account,
            name: "Two owners",
            type: "Ooze",
            cr: "1",
            ac: 10,
            hp: 10,
          })}
        `.pipe(Effect.result);

        // The upsert target is the bundle's alone now, so two accounts may both
        // keep a Goblin Boss and neither collides with the corpus.
        yield* sql`
          insert into creature ${sql.insert({
            account_id: account,
            name: "Goblin Boss",
            type: "Humanoid",
            cr: "1",
            ac: 17,
            hp: 21,
          })}
        `;
        const stillUnique = yield* sql`
          insert into creature ${sql.insert({
            campaign_id: null,
            origin: "system",
            name: "goblin boss",
            type: "Humanoid",
            cr: "1",
            ac: 17,
            hp: 21,
          })}
        `.pipe(Effect.result);

        return {
          rows,
          owned: owned._tag,
          promoted: promoted._tag,
          both: both._tag,
          stillUnique: stillUnique._tag,
        };
      }).pipe(Effect.orDie),
    );

    expect(rows).toEqual([
      // Bundled before, bundled after, owned by nobody.
      {
        name: "Goblin Boss",
        campaign_id: null,
        account_id: null,
        origin: "system",
        visibility: "dm",
      },
      // A campaign's own creature, untouched — including the visibility its DM
      // chose, which nothing here re-decides.
      {
        name: "The Ferryman's Wife",
        campaign_id: expect.any(String),
        account_id: null,
        origin: "authored",
        visibility: "shared",
      },
    ]);
    expect(owned).toBe("Failure");
    expect(promoted).toBe("Failure");
    expect(both).toBe("Failure");
    expect(stillUnique).toBe("Failure");
  }, 60_000);
});

describe("upgrading a database whose conversations predate the player surface", () => {
  it("leaves every existing thread the campaign's own, and none of them anybody's", async () => {
    // **`0016` backfills nothing, and that is the whole of it.** Every thread
    // written before it was a DM's — `HobThreads.start` composed
    // `campaignWritable`, so no other kind could exist — and a null
    // `account_id` is exactly what the DM's reach now looks for. So the upgrade
    // is one nullable column and the rows already say the right thing.
    //
    // The property worth pinning is that it *stays* that way: the DM's reach
    // adds `account_id is null`, so a thread that predates the column is still
    // theirs, and a player's is a row that could not have existed. Stepped by
    // hand for the reason the others are — an empty database cannot show it.
    const { threads, cascaded } = await threadRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* init;
        yield* prepSurface;
        yield* bestiary;
        yield* liveSession;
        yield* sessionFinished;
        yield* runCarryover;
        yield* beats;
        yield* searchIndex;
        yield* assistantConversation;

        const account = (yield* sql<{ readonly id: string }>`
          insert into account ${sql.insert({ name: "Jo", token_hash: "hash" })} returning id
        `)[0]!.id;
        const campaign = yield* rawCampaign(sql, account, "The Salt Road");
        yield* sql`
          insert into assistant_thread ${sql.insert({
            campaign_id: campaign,
            title: "Who is the ferryman?",
          })}
        `;

        yield* characterSheet;
        yield* invites;
        yield* characterLive;
        yield* libraryCreatures;
        yield* playerThreads;

        const player = (yield* sql<{ readonly id: string }>`
          insert into account ${sql.insert({ name: "Ilse", token_hash: "hash2" })} returning id
        `)[0]!.id;
        yield* sql`
          insert into assistant_thread ${sql.insert({
            campaign_id: campaign,
            account_id: player,
            title: "A wood elf who watches",
          })}
        `;

        const threads = yield* sql<{
          readonly title: string;
          readonly account_id: string | null;
        }>`select title, account_id from assistant_thread order by title`;

        // The owner's account going takes their conversation with it and leaves
        // the campaign's own standing — `on delete cascade`, which is what makes
        // a thread whose owner is gone impossible rather than unreachable.
        yield* sql`delete from account where id = ${player}`;
        const cascaded = yield* sql<{
          readonly title: string;
        }>`select title from assistant_thread order by title`;

        return { threads, cascaded };
      }).pipe(Effect.orDie),
    );

    expect(threads).toEqual([
      { title: "A wood elf who watches", account_id: expect.any(String) as unknown as string },
      { title: "Who is the ferryman?", account_id: null },
    ]);
    expect(cascaded.map((thread) => thread.title)).toEqual(["Who is the ferryman?"]);
  }, 60_000);
});

describe("adding source provenance after the starter bundle existed", () => {
  it("adds nullable source pointers, drops name identity, and does not backfill disposable data", async () => {
    // The captain confirmed existing DB data is disposable for this foundation
    // slice, so `0019` is not a compatibility migration: it adds nullable source
    // slots and moves future importer identity to source keys. Rows already in a
    // scratch database stay exactly as they were until the database is reset and
    // the source-keyed importer writes them fresh.
    const measured = await sourceRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* init;
        yield* prepSurface;
        yield* bestiary;
        yield* liveSession;
        yield* sessionFinished;
        yield* runCarryover;
        yield* beats;
        yield* searchIndex;
        yield* assistantConversation;
        yield* characterSheet;
        yield* invites;
        yield* characterLive;
        yield* libraryCreatures;
        yield* playerThreads;
        yield* characterOptions;
        yield* backgroundOption;

        yield* sql`
          insert into creature ${sql.insert({
            campaign_id: null,
            origin: "system",
            name: "Legacy Goblin",
            type: "Humanoid",
            cr: "1",
            ac: 17,
            hp: 21,
          })}
        `;
        yield* sql`
          insert into character_option ${sql.insert({
            campaign_id: null,
            account_id: null,
            origin: "system",
            kind: "class",
            name: "Legacy Druid",
            body: { hitDie: 8, unarmouredAc: ["DEX"] },
            visibility: "shared",
          })}
        `;

        yield* sourceProvenance;

        const legacy = yield* sql<{
          readonly table_name: string;
          readonly source_entity_id: string | null;
          readonly source_revision_id: string | null;
        }>`
          select 'creature' as table_name, source_entity_id, source_revision_id
          from creature where name = 'Legacy Goblin'
          union all
          select 'character_option' as table_name, source_entity_id, source_revision_id
          from character_option where name = 'Legacy Druid'
          order by table_name
        `;

        const duplicateName = yield* sql`
          insert into creature ${sql.insert({
            campaign_id: null,
            origin: "system",
            name: "Legacy Goblin",
            type: "Humanoid",
            cr: "2",
            ac: 15,
            hp: 30,
          })}
        `.pipe(Effect.result);

        return { legacy, duplicateName: duplicateName._tag };
      }).pipe(Effect.orDie),
    );

    expect(measured.legacy).toEqual([
      { table_name: "character_option", source_entity_id: null, source_revision_id: null },
      { table_name: "creature", source_entity_id: null, source_revision_id: null },
    ]);
    expect(measured.duplicateName).toBe("Success");
  }, 60_000);
});
