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
import campaignMoveKeys from "../src/migrations/0053_campaign_move_keys.js";
import encounterRunBoards from "../src/migrations/0058_encounter_run_boards.js";
import encounterPrep from "../src/migrations/0060_encounter_prep.js";
import encounterReady from "../src/migrations/0061_encounter_ready.js";
import characterInspiration from "../src/migrations/0062_character_inspiration.js";
import runScenes from "../src/migrations/0065_run_scenes.js";
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

/** A tenth, for the keys a campaign's move depends on, as they were before it could move. */
const moveKeysRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_move_keys"));
afterAll(() => moveKeysRuntime.dispose());

/** An eleventh, for fights on file before a fight kept its board. */
const boardsRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_boards"));
afterAll(() => boardsRuntime.dispose());

/** A twelfth, for encounters written before they had a kind or any prep. */
const prepRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_prep"));
afterAll(() => prepRuntime.dispose());

/** A thirteenth, for encounters written before one could be marked ready. */
const readyRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_ready"));
afterAll(() => readyRuntime.dispose());

/** A fourteenth, for characters written before a DM could award inspiration. */
const inspirationRuntime = ManagedRuntime.make(
  freshDatabase("taverns_test_migrations_inspiration"),
);
afterAll(() => inspirationRuntime.dispose());

/** A fifteenth, for runs played before a run had a mode or a scene. */
const scenesRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_scenes"));
afterAll(() => scenesRuntime.dispose());

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
      "battle_map",
      "battle_map_image",
      "beat",
      "campaign",
      "campaign_character",
      "campaign_character_prep",
      "campaign_image",
      "campaign_member",
      "character",
      "character_option",
      "character_option_ability_bonus",
      "character_option_equipment_reference",
      "character_option_language",
      "character_option_proficiency",
      "character_option_subrace",
      "character_option_trait",
      "character_portrait",
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
      "encounter_prep",
      "encounter_run",
      "encounter_run_board",
      "encounter_run_check",
      "encounter_run_scene",
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
      "image_spend",
      "language",
      "magic_item",
      "magic_item_rarity",
      "magic_item_variant",
      "magic_school",
      "note",
      "npc",
      "npc_awareness_candidate",
      "npc_image",
      "npc_knowledge_fact",
      "npc_memory",
      "npc_proposal",
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
      "shared_world_image",
      "skill",
      "spell",
      "spell_class",
      "spell_damage_type",
      "spell_subclass",
      "storage_deletion",
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
      { migration_id: 42, name: "npc_proposals" },
      { migration_id: 43, name: "npc_search" },
      { migration_id: 44, name: "npc_session_lifecycle" },
      { migration_id: 45, name: "npc_awareness_candidates" },
      { migration_id: 46, name: "campaign_invites" },
      { migration_id: 47, name: "shared_worlds" },
      { migration_id: 48, name: "character_portraits" },
      { migration_id: 49, name: "campaign_images" },
      { migration_id: 50, name: "shared_world_images" },
      { migration_id: 51, name: "npc_images" },
      { migration_id: 52, name: "descriptions" },
      { migration_id: 53, name: "campaign_move_keys" },
      { migration_id: 54, name: "account_threads" },
      { migration_id: 55, name: "image_spend" },
      { migration_id: 56, name: "character_draft_provenance" },
      { migration_id: 57, name: "battle_maps" },
      { migration_id: 58, name: "encounter_run_boards" },
      { migration_id: 59, name: "computed_encounter_difficulty" },
      { migration_id: 60, name: "encounter_prep" },
      { migration_id: 61, name: "encounter_ready" },
      { migration_id: 62, name: "character_inspiration" },
      { migration_id: 63, name: "seat_prep" },
      { migration_id: 64, name: "combatant_positions" },
      { migration_id: 65, name: "run_scenes" },
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
      { migration_id: 42, name: "npc_proposals" },
      { migration_id: 43, name: "npc_search" },
      { migration_id: 44, name: "npc_session_lifecycle" },
      { migration_id: 45, name: "npc_awareness_candidates" },
      { migration_id: 46, name: "campaign_invites" },
      { migration_id: 47, name: "shared_worlds" },
      { migration_id: 48, name: "character_portraits" },
      { migration_id: 49, name: "campaign_images" },
      { migration_id: 50, name: "shared_world_images" },
      { migration_id: 51, name: "npc_images" },
      { migration_id: 52, name: "descriptions" },
      { migration_id: 53, name: "campaign_move_keys" },
      { migration_id: 54, name: "account_threads" },
      { migration_id: 55, name: "image_spend" },
      { migration_id: 56, name: "character_draft_provenance" },
      { migration_id: 57, name: "battle_maps" },
      { migration_id: 58, name: "encounter_run_boards" },
      { migration_id: 59, name: "computed_encounter_difficulty" },
      { migration_id: 60, name: "encounter_prep" },
      { migration_id: 61, name: "encounter_ready" },
      { migration_id: 62, name: "character_inspiration" },
      { migration_id: 63, name: "seat_prep" },
      { migration_id: 64, name: "combatant_positions" },
      { migration_id: 65, name: "run_scenes" },
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

/** Every message down an error's `cause` chain, where Postgres names the key. */
const describeError = (error: unknown): string => {
  let cause: unknown = error;
  const seen: Array<string> = [];
  while (cause !== null && cause !== undefined) {
    seen.push(String(cause));
    cause = (cause as { readonly cause?: unknown }).cause;
  }
  return seen.join("\n");
};

describe("upgrading a database whose campaign keys predate moving a campaign", () => {
  it("lets a campaign change context with its table, and leaves accepted history behind", async () => {
    // `0001`, `0013` and `0030` gained `on update cascade` by being edited
    // after databases had applied them, so those databases kept the keys
    // restored below and every connect on them failed. The move is the one
    // `Groups.connect` makes: admit the participants, then repoint the campaign.
    const measured = await moveKeysRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* migrate;
        yield* sql`
          alter table campaign_member
            drop constraint campaign_member_campaign_fkey,
            add constraint campaign_member_campaign_fkey foreign key (campaign_id, group_id)
              references campaign (id, group_id) on delete cascade
        `;
        yield* sql`
          alter table campaign_character
            drop constraint campaign_character_campaign_fkey,
            add constraint campaign_character_campaign_fkey foreign key (campaign_id, group_id)
              references campaign (id, group_id) on delete cascade
        `;
        yield* sql`
          alter table group_invite
            alter column campaign_id drop not null,
            drop constraint group_invite_campaign_fkey,
            add constraint group_invite_campaign_fkey foreign key (campaign_id, group_id)
              references campaign (id, group_id) on delete set null (campaign_id)
        `;
        yield* sql`
          alter table group_history_entry
            drop constraint group_history_entry_campaign_id_fkey,
            add constraint group_history_entry_campaign_fkey foreign key (campaign_id, group_id)
              references campaign (id, group_id) on delete set null (campaign_id)
        `;

        const accounts = yield* sql<{ readonly id: string }>`
          insert into account ${sql.insert([
            { name: "Jo", token_hash: "creator-hash" },
            { name: "Sam", token_hash: "player-hash" },
          ])}
          returning id
        `;
        const [creator, player] = [accounts[0]!.id, accounts[1]!.id];
        const campaign = yield* rawCampaign(sql, creator, "The Salt Road");
        const contexts = yield* sql<{ readonly group_id: string }>`
          select group_id from campaign where id = ${campaign}
        `;
        const source = contexts[0]!.group_id;

        // A seated player, an invitation and a night already in the record.
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`
              insert into group_member ${sql.insert({ group_id: source, account_id: player })}
            `;
            yield* sql`
              insert into campaign_member ${sql.insert({
                campaign_id: campaign,
                group_id: source,
                account_id: player,
              })}
            `;
            yield* sql`
              insert into campaign_character ${sql.insert({
                campaign_id: campaign,
                group_id: source,
                account_id: player,
                display_name: "Wren",
              })}
            `;
          }),
        );
        yield* sql`
          insert into group_invite ${sql.insert({
            group_id: source,
            campaign_id: campaign,
            token_hash: "invite-hash",
            expires_at: new Date(Date.now() + 86_400_000),
          })}
        `;
        yield* sql`
          insert into group_history_entry ${sql.insert({
            group_id: source,
            campaign_id: campaign,
            source_kind: "manual",
            body: "The ferry burned.",
          })}
        `;

        const destination = yield* sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* sql<{ readonly id: string }>`
              insert into play_group ${sql.insert({
                owner_account_id: creator,
                name: "The Drowned Coast",
                is_shared_world: true,
              })}
              returning id
            `;
            yield* sql`
              insert into group_member ${sql.insert({ group_id: rows[0]!.id, account_id: creator })}
            `;
            return rows[0]!.id;
          }),
        );

        const move = sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`
              insert into group_member ${sql.insert({ group_id: destination, account_id: player })}
            `;
            yield* sql`update campaign set group_id = ${destination} where id = ${campaign}`;
          }),
        );

        const refused = yield* move.pipe(Effect.flip, Effect.map(describeError));

        // Twice: the second run meets the shape the first one wrote.
        yield* campaignMoveKeys;
        yield* campaignMoveKeys;
        yield* move;

        const followed = yield* sql<{ readonly table_name: string; readonly group_id: string }>`
          select 'campaign_member' as table_name, group_id from campaign_member
          where campaign_id = ${campaign}
          union all
          select 'campaign_character', group_id from campaign_character
          where campaign_id = ${campaign}
          union all
          select 'group_invite', group_id from group_invite where campaign_id = ${campaign}
        `;
        const history = yield* sql<{ readonly group_id: string; readonly campaign_id: string }>`
          select group_id, campaign_id from group_history_entry
        `;
        return { refused, followed, history, source, destination, campaign };
      }).pipe(Effect.orDie),
    );

    expect(measured.refused).toContain("campaign_member_campaign_fkey");
    expect(measured.followed).toHaveLength(4);
    expect(new Set(measured.followed.map((row) => row.group_id))).toEqual(
      new Set([measured.destination]),
    );
    expect(measured.history).toEqual([
      { group_id: measured.source, campaign_id: measured.campaign },
    ]);
  }, 60_000);
});

describe("upgrading a database whose fights predate their boards", () => {
  it("gives a fight its encounter's grid as it stands, and a fight whose encounter is gone none", async () => {
    const boards = await boardsRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* migrate;
        // The shape `0057` left: no boards table at all.
        yield* sql`drop table encounter_run_board`;

        const accounts = yield* sql<{ readonly id: string }>`
          insert into account ${sql.insert({ name: "Jo", token_hash: "board-hash" })}
          returning id
        `;
        const campaign = yield* rawCampaign(sql, accounts[0]!.id, "The Salt Road");
        const encounters = yield* sql<{ readonly id: string }>`
          insert into encounter ${sql.insert([
            { campaign_id: campaign, name: "Kept" },
            { campaign_id: campaign, name: "Deleted" },
          ])}
          returning id
        `;
        const [kept, deleted] = [encounters[0]!.id, encounters[1]!.id];
        const maps = yield* sql<{ readonly id: string }>`
          insert into battle_map ${sql.insert([
            {
              encounter_id: kept,
              campaign_id: campaign,
              board_columns: 30,
              cell_px: 51.2,
              offset_x_px: 7,
            },
            // `sql.insert` takes its columns from the first row, so both name them.
            {
              encounter_id: deleted,
              campaign_id: campaign,
              board_columns: 24,
              cell_px: 64,
              offset_x_px: 0,
            },
          ])}
          returning id
        `;
        const sessions = yield* sql<{ readonly id: string }>`
          insert into session ${sql.insert({ campaign_id: campaign, number: 1 })}
          returning id
        `;
        const runs = yield* sql<{ readonly id: string }>`
          insert into encounter_run ${sql.insert([
            {
              session_id: sessions[0]!.id,
              encounter_id: kept,
              encounter_name: "Kept",
              started_at: new Date(Date.now() - 60_000),
              ended_at: new Date(),
            },
            {
              session_id: sessions[0]!.id,
              encounter_id: deleted,
              encounter_name: "Deleted",
              started_at: new Date(),
              ended_at: null,
            },
          ])}
          returning id
        `;
        yield* sql`delete from encounter where id = ${deleted}`;

        yield* encounterRunBoards;
        const rows = yield* sql<{
          readonly run_id: string;
          readonly map_id: string | null;
          readonly board_columns: number;
          readonly cell_px: number;
          readonly offset_x_px: number;
        }>`
          select run_id, map_id, board_columns, cell_px, offset_x_px from encounter_run_board
        `;
        return { rows, keptRun: runs[0]!.id, keptMap: maps[0]!.id };
      }).pipe(Effect.orDie),
    );
    expect(boards.rows).toEqual([
      {
        run_id: boards.keptRun,
        map_id: boards.keptMap,
        board_columns: 30,
        cell_px: 51.2,
        offset_x_px: 7,
      },
    ]);
  }, 60_000);
});

describe("upgrading a database whose encounters predate their kind and prep", () => {
  it("makes every encounter a fight with empty prep, and ties a challenge to its kind", async () => {
    const measured = await prepRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* migrate;
        // The shape `0059` left: no prep table and no kind.
        yield* sql`drop table encounter_prep`;
        yield* sql`alter table encounter drop column kind`;

        const accounts = yield* sql<{ readonly id: string }>`
          insert into account ${sql.insert({ name: "Jo", token_hash: "prep-hash" })}
          returning id
        `;
        const campaign = yield* rawCampaign(sql, accounts[0]!.id, "The Salt Road");
        const encounters = yield* sql<{ readonly id: string }>`
          insert into encounter ${sql.insert([
            { campaign_id: campaign, name: "Ambush in the reeds" },
            { campaign_id: campaign, name: "The dry well" },
          ])}
          returning id
        `;
        const [ambush, well] = [encounters[0]!.id, encounters[1]!.id];

        yield* encounterPrep;
        const kinds = yield* sql<{ readonly id: string; readonly kind: string }>`
          select id, kind from encounter order by name
        `;
        const preps = yield* sql<{
          readonly encounter_id: string;
          readonly kind: string;
          readonly tactics: ReadonlyArray<string>;
          readonly treasure: string | null;
          readonly challenge: unknown;
        }>`
          select encounter_id, kind, tactics, treasure, challenge from encounter_prep
          order by encounter_id
        `;

        const challenge = JSON.stringify({
          kind: "challenge",
          dc: 14,
          successes: 3,
          failures: 2,
          skills: ["Survival"],
        });
        // A skill challenge's numbers on a fight: the check refuses them.
        const onAFight = yield* sql`
          update encounter_prep set challenge = ${challenge} where encounter_id = ${ambush}
        `.pipe(
          Effect.as("written"),
          Effect.catch((error) => Effect.succeed(describeError(error))),
        );
        // The kind moves the prep row's copy with it, so the numbers are
        // accepted once the encounter is a skill challenge…
        yield* sql`update encounter set kind = 'challenge' where id = ${well}`;
        yield* sql`update encounter_prep set challenge = ${challenge} where encounter_id = ${well}`;
        // …and moving it away again, with the numbers still there, is refused.
        const movedAway = yield* sql`update encounter set kind = 'hazard' where id = ${well}`.pipe(
          Effect.as("written"),
          Effect.catch((error) => Effect.succeed(describeError(error))),
        );
        const unknownKind =
          yield* sql`update encounter set kind = 'puzzle' where id = ${well}`.pipe(
            Effect.as("written"),
            Effect.catch((error) => Effect.succeed(describeError(error))),
          );
        return { kinds, preps, onAFight, movedAway, unknownKind, ambush, well };
      }).pipe(Effect.orDie),
    );

    expect(measured.kinds.map((row) => row.kind)).toEqual(["combat", "combat"]);
    expect(measured.preps).toEqual(
      [measured.ambush, measured.well].sort().map((id) => ({
        encounter_id: id,
        kind: "combat",
        tactics: [],
        treasure: null,
        challenge: null,
      })),
    );
    expect(measured.onAFight).toContain("encounter_prep_challenge_kind");
    expect(measured.movedAway).toContain("encounter_prep_challenge_kind");
    expect(measured.unknownKind).toContain("encounter_kind_known");
  }, 60_000);
});

describe("upgrading a database whose encounters predate Ready", () => {
  it("leaves every encounter already written a draft, and refuses no answer at all", async () => {
    const measured = await readyRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* migrate;
        // The shape `0060` left: prep with no word on whether it is ready.
        yield* sql`alter table encounter_prep drop column ready`;

        const accounts = yield* sql<{ readonly id: string }>`
          insert into account ${sql.insert({ name: "Jo", token_hash: "ready-hash" })}
          returning id
        `;
        const campaign = yield* rawCampaign(sql, accounts[0]!.id, "The Salt Road");
        const encounters = yield* sql<{ readonly id: string }>`
          insert into encounter ${sql.insert({ campaign_id: campaign, name: "Ambush in the reeds" })}
          returning id
        `;
        const ambush = encounters[0]!.id;
        yield* sql`
          insert into encounter_prep ${sql.insert({
            encounter_id: ambush,
            campaign_id: campaign,
            kind: "combat",
            treasure: "28 sp and a bone whistle",
          })}
        `;

        yield* encounterReady;
        const preps = yield* sql<{ readonly treasure: string | null; readonly ready: boolean }>`
          select treasure, ready from encounter_prep where encounter_id = ${ambush}
        `;
        const cleared = yield* sql`
          update encounter_prep set ready = null where encounter_id = ${ambush}
        `.pipe(
          Effect.as("written"),
          Effect.catch((error) => Effect.succeed(describeError(error))),
        );
        return { preps, cleared };
      }).pipe(Effect.orDie),
    );

    expect(measured.preps).toEqual([{ treasure: "28 sp and a bone whistle", ready: false }]);
    expect(measured.cleared).toContain("not-null");
  }, 60_000);
});

describe("upgrading a database whose characters predate inspiration", () => {
  it("leaves every character already written uninspired, and refuses no answer at all", async () => {
    const measured = await inspirationRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* migrate;
        // The shape `0061` left: a character with no word on inspiration.
        yield* sql`alter table character drop column inspiration`;

        const account = (yield* sql<{ readonly id: string }>`
          insert into account ${sql.insert({ name: "Jo", token_hash: "inspiration-hash" })}
          returning id
        `)[0]!.id;
        const brannoc = (yield* sql<{ readonly id: string }>`
          insert into character ${sql.insert({ account_id: account, name: "Brannoc" })}
          returning id
        `)[0]!.id;

        yield* characterInspiration;
        const characters = yield* sql<{ readonly name: string; readonly inspiration: boolean }>`
          select name, inspiration from character where id = ${brannoc}
        `;
        const cleared = yield* sql`
          update character set inspiration = null where id = ${brannoc}
        `.pipe(
          Effect.as("written"),
          Effect.catch((error) => Effect.succeed(describeError(error))),
        );
        return { characters, cleared };
      }).pipe(Effect.orDie),
    );

    expect(measured.characters).toEqual([{ name: "Brannoc", inspiration: false }]);
    expect(measured.cleared).toContain("not-null");
  }, 60_000);
});

describe("upgrading a database whose runs predate modes and scenes", () => {
  it("makes every run a fight, whatever its encounter's kind, with an empty scene", async () => {
    const measured = await scenesRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* migrate;
        // The shape `0064` left: no mode, no scene, no checks.
        yield* sql`drop table encounter_run_check`;
        yield* sql`drop table encounter_run_scene`;
        yield* sql`alter table encounter_run drop column mode`;

        const accounts = yield* sql<{ readonly id: string }>`
          insert into account ${sql.insert({ name: "Jo", token_hash: "scenes-hash" })}
          returning id
        `;
        const campaign = yield* rawCampaign(sql, accounts[0]!.id, "The Salt Road");
        // A conversation — which the runner could only play as a fight then.
        const encounters = yield* sql<{ readonly id: string }>`
          insert into encounter ${sql.insert({
            campaign_id: campaign,
            name: "A bargain at the ford",
            kind: "social",
          })}
          returning id
        `;
        yield* sql`
          insert into encounter_prep ${sql.insert({
            encounter_id: encounters[0]!.id,
            campaign_id: campaign,
            kind: "social",
            tactics: JSON.stringify(["Wants the toll waived"]),
          })}
        `;
        const sessions = yield* sql<{ readonly id: string }>`
          insert into session ${sql.insert({ campaign_id: campaign, number: 1 })}
          returning id
        `;
        const runs = yield* sql<{ readonly id: string }>`
          insert into encounter_run ${sql.insert({
            session_id: sessions[0]!.id,
            encounter_id: encounters[0]!.id,
            encounter_name: "A bargain at the ford",
          })}
          returning id
        `;

        yield* runScenes;
        const modes = yield* sql<{ readonly id: string; readonly mode: string }>`
          select id, mode from encounter_run
        `;
        const scenes = yield* sql<{
          readonly run_id: string;
          readonly beats: ReadonlyArray<unknown>;
          readonly challenge: unknown;
          readonly stage: number | null;
        }>`
          select run_id, beats, challenge, stage from encounter_run_scene
        `;
        return { run: runs[0]!.id, modes, scenes };
      }).pipe(Effect.orDie),
    );
    expect(measured.modes).toEqual([{ id: measured.run, mode: "combat" }]);
    // Nothing copied from today's prep: that run was never played as a scene.
    expect(measured.scenes).toEqual([
      { run_id: measured.run, beats: [], challenge: null, stage: null },
    ]);
  }, 60_000);
});
