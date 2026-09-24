import {
  type Actor,
  type AssistantTurnId,
  type Campaign,
  type CampaignId,
  Conflict,
  CurrentActor,
  emptyCharacterSheet,
  NotFound,
  type SharedWorldId,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Creatures } from "../src/repo/Creatures.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { Encounters } from "../src/repo/Encounters.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { admitToGroup, Groups } from "../src/repo/Groups.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Invites } from "../src/repo/Invites.js";
import { LibraryShares } from "../src/repo/LibraryShares.js";
import { Memberships } from "../src/repo/Memberships.js";
import { Notes } from "../src/repo/Notes.js";
import { Npcs } from "../src/repo/Npcs.js";
import { Party } from "../src/repo/Party.js";
import { Proposals } from "../src/repo/Proposals.js";
import { Recap } from "../src/repo/Recap.js";
import { Sessions } from "../src/repo/Sessions.js";
import {
  accountWide,
  aCharacterAt,
  aGroupMemberAt,
  anAccount,
  aPlayerAt,
  asDm,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * Permanent delete of a campaign and of a Shared World: owner-only, one
 * transaction, nothing left pointing at what went, and nothing taken that
 * belongs to somebody else.
 *
 * The images each delete queues on the storage outbox are proved over the real
 * endpoints in `campaign-images.test.ts`, `shared-world-images.test.ts` and
 * `npc-images.test.ts`; this file is the repositories and the rows.
 */

const live = LiveEvents.layer;
const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Beats.layer.pipe(Layer.provide(live)),
    CampaignCreatorActors.layer,
    Campaigns.layer,
    Characters.layer.pipe(Layer.provide(live)),
    Creatures.layer,
    EncounterCreatures.layer,
    Encounters.layer,
    GroupHistory.layer.pipe(Layer.provide(Recap.layer)),
    Groups.layer,
    HobThreads.layer,
    Invites.layer,
    LibraryShares.layer,
    Memberships.layer,
    Notes.layer,
    Npcs.layer,
    Party.layer.pipe(Layer.provide(live)),
    Proposals.layer.pipe(
      Layer.provide([
        Beats.layer.pipe(Layer.provide(live)),
        Campaigns.layer,
        Characters.layer.pipe(Layer.provide(live)),
        EncounterCreatures.layer,
        Encounters.layer,
        GroupHistory.layer.pipe(Layer.provide(Recap.layer)),
        Notes.layer,
      ]),
    ),
    Sessions.layer.pipe(Layer.provide(live)),
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_permanent_delete"))),
);
afterAll(() => runtime.dispose());

const as =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

/** The failure a call answers with, or `undefined` when it succeeded. */
const refusal = <E>(
  effect: Effect.Effect<unknown, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) =>
  runtime.runPromise(
    effect.pipe(
      Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }),
      Effect.orDie,
    ),
  );

const query = <A extends object>(
  build: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<A>, unknown>,
) => run(Effect.flatMap(SqlClient.SqlClient, build));

const deleteCampaign = (actor: Actor, id: CampaignId) =>
  Effect.flatMap(Campaigns, (campaigns) => as(actor)(campaigns.deletePermanently(id)));

const deleteWorld = (actor: Actor, id: SharedWorldId) =>
  Effect.flatMap(Groups, (groups) => as(actor)(groups.deletePermanently(id)));

/**
 * Every row in the database that still names this campaign in a
 * `campaign_id` column, by table. Read off the catalogue rather than listed,
 * so a table added later is covered without anyone remembering it.
 */
const rowsNaming = (campaignId: CampaignId) =>
  run(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const tables = yield* sql<{ readonly table_name: string }>`
        select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'campaign_id'
        order by table_name
      `;
      const found: Record<string, number> = {};
      for (const { table_name } of tables) {
        const rows = yield* sql<{ readonly count: number }>`
          select count(*)::int as count from ${sql(table_name)}
          where campaign_id = ${campaignId}
        `;
        if (rows[0]!.count > 0) found[table_name] = rows[0]!.count;
      }
      return found;
    }),
  );

/** The same sweep for a `play_group`, over `group_id`. */
const rowsNamingGroup = (groupId: SharedWorldId) =>
  run(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const tables = yield* sql<{ readonly table_name: string }>`
        select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'group_id'
        order by table_name
      `;
      const found: Record<string, number> = {};
      for (const { table_name } of tables) {
        const rows = yield* sql<{ readonly count: number }>`
          select count(*)::int as count from ${sql(table_name)}
          where group_id = ${groupId}
        `;
        if (rows[0]!.count > 0) found[table_name] = rows[0]!.count;
      }
      const world = yield* sql<{ readonly count: number }>`
        select count(*)::int as count from play_group where id = ${groupId}
      `;
      if (world[0]!.count > 0) found["play_group"] = world[0]!.count;
      return found;
    }),
  );

/**
 * A campaign with something in every drawer: a note, a played night with a
 * beat and a planned one, an encounter with a Library creature instanced onto
 * its roster, an NPC, the creator's Hob thread, an open invitation, a player
 * with a seated character, a character that player kept from a Hob draft at
 * this table, and a Chronicle entry the world accepted from it.
 */
const furnish = (creator: Actor, campaign: Campaign, worldId: SharedWorldId | undefined) =>
  Effect.gen(function* () {
    const notes = yield* Notes;
    const sessions = yield* Sessions;
    const beats = yield* Beats;
    const encounters = yield* Encounters;
    const encounterCreatures = yield* EncounterCreatures;
    const creatures = yield* Creatures;
    const npcs = yield* Npcs;
    const threads = yield* HobThreads;
    const proposals = yield* Proposals;
    const invites = yield* Invites;
    const history = yield* GroupHistory;
    const sql = yield* SqlClient.SqlClient;

    yield* as(creator)(notes.create(campaign.id, { title: "Who the ferryman is" }));
    const played = yield* as(creator)(sessions.create(campaign.id, { number: 1 }));
    yield* as(creator)(
      sessions.update(campaign.id, played.id, { startedAt: DateTime.nowUnsafe() }),
    );
    yield* as(creator)(beats.create(campaign.id, played.id, { body: "The ferry sank." }));
    yield* as(creator)(sessions.create(campaign.id, { number: 2, title: "The reeds" }));

    const croaker = yield* as(creator)(
      creatures.libraryCreate({
        name: "Bullywug Croaker",
        type: "humanoid",
        cr: "1/4",
        ac: 15,
        hp: 11,
      }),
    );
    const fight = yield* as(creator)(encounters.create(campaign.id, { name: "Song in the reeds" }));
    yield* as(creator)(
      encounterCreatures.create(campaign.id, fight.id, { creatureId: croaker.id, count: 2 }),
    );

    const proof = yield* asDm(creator, campaign.id);
    yield* npcs.create(proof, { name: "Cazril", role: "the ferryman" });
    yield* as(creator)(threads.start("dm", campaign.id, "Who is the ferryman?"));
    yield* invites.createForCampaign(proof, { label: "an open seat" });

    const player = yield* aPlayerAt(campaign.id, "Pim");
    const seated = yield* aCharacterAt(campaign.id, player, { name: "Pell" });

    // A character Pim kept from a Hob draft at this table: the thread and the
    // turn are the campaign's, the character is Pim's.
    const thread = yield* as(player)(threads.start("own", campaign.id, "Draft me a ranger"));
    const turnId = crypto.randomUUID() as AssistantTurnId;
    yield* as(player)(
      threads.append("own", campaign.id, thread.id, {
        id: turnId,
        who: "hob",
        text: "",
        proposal: {
          target: "character",
          name: "Sorrel",
          race: null,
          className: null,
          sheet: emptyCharacterSheet,
          rationale: [],
        },
      }),
    );
    const accepted = yield* as(player)(proposals.accept("own", campaign.id, thread.id, turnId));
    if (accepted.accepted !== "character") throw new Error("expected a character");
    const drafted = accepted.character;

    const entry =
      worldId === undefined
        ? undefined
        : yield* as(creator)(
            history.create(worldId, { body: "The ferry sank.", campaignId: campaign.id }),
          );

    const sessionIds = (yield* sql<{ readonly id: string }>`
      select id from session where campaign_id = ${campaign.id}
    `).map((row) => row.id);
    const turnIds = (yield* sql<{ readonly id: string }>`
      select assistant_turn.id from assistant_turn
      join assistant_thread on assistant_thread.id = assistant_turn.thread_id
      where assistant_thread.campaign_id = ${campaign.id}
    `).map((row) => row.id);

    return { player, seated, drafted, entry, sessionIds, turnIds };
  });

describe("deleting a campaign", () => {
  let ada: Actor;
  let stranger: Actor;
  let worldId: SharedWorldId;
  let campaign: Campaign;
  let furnished: Effect.Success<ReturnType<typeof furnish>>;
  let bystander: Actor;

  beforeAll(async () => {
    await run(
      Effect.gen(function* () {
        const groups = yield* Groups;
        const campaigns = yield* Campaigns;
        ada = yield* anAccount("Ada");
        stranger = yield* anAccount("Bo");
        worldId = (yield* as(ada)(groups.create({ name: "The Salt Company" }))).id;
        campaign = yield* as(ada)(
          campaigns.create(worldId, { name: "The Salt Road", visibility: "shared" }),
        );
        furnished = yield* furnish(ada, campaign, worldId);
        bystander = yield* aGroupMemberAt(campaign.id, "Wren");
      }),
    );
  }, 60_000);

  it("answers NotFound to a player, a world member and a stranger, and deletes nothing", async () => {
    for (const who of [furnished.player, accountWide(furnished.player), bystander, stranger]) {
      expect(await refusal(deleteCampaign(who, campaign.id))).toBeInstanceOf(NotFound);
    }
    const still = await run(Effect.flatMap(Campaigns, (c) => as(ada)(c.findById(campaign.id))));
    expect(still.id).toBe(campaign.id);
  });

  it("refuses while a night is open, and deletes nothing", async () => {
    const night = furnished.sessionIds[0]!;
    await run(
      Effect.flatMap(Campaigns, (c) =>
        as(ada)(c.update(campaign.id, { currentSessionId: night as never })),
      ),
    );
    expect(await refusal(deleteCampaign(ada, campaign.id))).toBeInstanceOf(Conflict);
    expect(Object.keys(await rowsNaming(campaign.id)).length).toBeGreaterThan(0);

    await run(
      Effect.flatMap(Campaigns, (c) => as(ada)(c.update(campaign.id, { currentSessionId: null }))),
    );
  });

  it("removes the campaign and every row that belongs only to it", async () => {
    expect(await rowsNaming(campaign.id)).toMatchObject({
      assistant_thread: 2,
      campaign_character: 1,
      // Ada, Pim and Wren, and the three invitations: Pim's, Wren's, the open one.
      campaign_member: 3,
      creature: 1,
      encounter: 1,
      group_history_entry: 1,
      group_invite: 3,
      note: 1,
      npc: 1,
      session: 2,
    });

    await run(deleteCampaign(ada, campaign.id));

    expect(await rowsNaming(campaign.id)).toEqual({});
    const nested = await query(
      (sql) => sql<{ readonly sessions: number; readonly turns: number; readonly beats: number }>`
        select
          (select count(*)::int from session where id in ${sql.in(furnished.sessionIds)}) as sessions,
          (select count(*)::int from assistant_turn where id in ${sql.in(furnished.turnIds)}) as turns,
          (select count(*)::int from beat where session_id in ${sql.in(furnished.sessionIds)}) as beats
      `,
    );
    expect(nested[0]).toEqual({ sessions: 0, turns: 0, beats: 0 });
    expect(
      await refusal(Effect.flatMap(Campaigns, (c) => as(ada)(c.findById(campaign.id)))),
    ).toBeInstanceOf(NotFound);
  });

  it("leaves the characters, which lose only their seat", async () => {
    const characters = await query(
      (sql) => sql<{
        readonly id: string;
        readonly origin: string;
        readonly assistant_turn_id: string | null;
        readonly seats: number;
      }>`
        select character.id, character.origin, character.assistant_turn_id,
               (select count(*)::int from campaign_character
                where campaign_character.character_id = character.id) as seats
        from character
        where character.id in ${sql.in([furnished.seated.character.id, furnished.drafted.id])}
        order by character.name
      `,
    );
    expect(characters).toEqual([
      { id: furnished.seated.character.id, origin: "authored", assistant_turn_id: null, seats: 0 },
      // Hob drafted this one; the conversation it came from went with the table.
      { id: furnished.drafted.id, origin: "assistant", assistant_turn_id: null, seats: 0 },
    ]);
  });

  it("leaves the Shared World and the Chronicle entry it accepted", async () => {
    const entries = await query(
      (sql) => sql<{ readonly group_id: string; readonly campaign_id: string | null }>`
        select group_id, campaign_id from group_history_entry where id = ${furnished.entry!.id}
      `,
    );
    expect(entries).toEqual([{ group_id: worldId, campaign_id: null }]);
    const world = await run(Effect.flatMap(Groups, (g) => as(ada)(g.findById(worldId))));
    expect(world.id).toBe(worldId);
  });

  it("takes a standalone campaign's hidden context with it", async () => {
    const standalone = await run(
      Effect.flatMap(Campaigns, (c) =>
        as(ada)(c.createStandalone({ name: "Low Tide", visibility: "shared" })),
      ),
    );
    await run(furnish(ada, standalone, undefined));

    await run(deleteCampaign(ada, standalone.id));

    expect(await rowsNaming(standalone.id)).toEqual({});
    expect(await rowsNamingGroup(standalone.contextId)).toEqual({});
  });

  it("deletes an archived campaign too", async () => {
    const shelved = await run(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const made = yield* as(ada)(campaigns.createStandalone({ name: "Shelved" }));
        yield* as(ada)(campaigns.archive(made.id));
        return made;
      }),
    );

    await run(deleteCampaign(ada, shelved.id));

    expect(await rowsNaming(shelved.id)).toEqual({});
    const archived = await run(Effect.flatMap(Memberships, (m) => as(ada)(m.mine("archived"))));
    expect(archived.map((row) => row.campaign.id)).not.toContain(shelved.id);
  });
});

describe("deleting a Shared World", () => {
  let ada: Actor;
  let fen: Actor;
  let pim: Actor;
  let stranger: Actor;
  let worldId: SharedWorldId;
  let fens: Campaign;
  let adas: Campaign;

  beforeAll(async () => {
    await run(
      Effect.gen(function* () {
        const groups = yield* Groups;
        const campaigns = yield* Campaigns;
        const creatures = yield* Creatures;
        const shares = yield* LibraryShares;
        const history = yield* GroupHistory;
        const threads = yield* HobThreads;
        const sql = yield* SqlClient.SqlClient;

        ada = yield* anAccount("Ada");
        fen = yield* anAccount("Fen");
        stranger = yield* anAccount("Bo");
        worldId = (yield* as(ada)(groups.create({ name: "The Salt Company" }))).id;
        yield* admitToGroup(sql, worldId, fen.accountId);

        // Fen's table, with a player and a seated character: somebody else's
        // campaign in Ada's world.
        fens = yield* as(fen)(
          campaigns.create(worldId, { name: "Fen's Table", visibility: "shared" }),
        );
        pim = yield* aPlayerAt(fens.id, "Pim");
        yield* aCharacterAt(fens.id, pim, { name: "Pell" });

        // Ada's own table, archived.
        adas = yield* as(ada)(campaigns.create(worldId, { name: "Ada's Table" }));
        yield* as(ada)(campaigns.archive(adas.id));

        // What belongs to the world alone.
        yield* as(ada)(history.create(worldId, { body: "Two tables met at the ferry." }));
        yield* as(ada)(threads.start("sharedWorld", worldId, "What happened at the ferry?"));
        const owlbear = yield* as(ada)(
          creatures.libraryCreate({
            name: "Owlbear",
            type: "monstrosity",
            cr: "3",
            ac: 13,
            hp: 59,
          }),
        );
        yield* as(ada)(shares.share(worldId, { kind: "creature", resourceId: owlbear.id }));
      }),
    );
  }, 60_000);

  it("answers NotFound to a campaign creator, a player and a stranger", async () => {
    for (const who of [fen, pim, accountWide(pim), stranger]) {
      expect(await refusal(deleteWorld(who, worldId))).toBeInstanceOf(NotFound);
    }
    expect(Object.keys(await rowsNamingGroup(worldId))).toContain("play_group");
  });

  it("refuses a campaign's hidden context as a world that does not exist", async () => {
    const standalone = await run(
      Effect.flatMap(Campaigns, (c) => as(ada)(c.createStandalone({ name: "Hidden" }))),
    );
    expect(await refusal(deleteWorld(ada, standalone.contextId))).toBeInstanceOf(NotFound);
  });

  it("removes the world and everything that belongs only to it", async () => {
    expect(await rowsNamingGroup(worldId)).toMatchObject({
      assistant_thread: 1,
      group_history_entry: 1,
      group_library_share: 1,
      play_group: 1,
    });

    await run(deleteWorld(ada, worldId));

    expect(await rowsNamingGroup(worldId)).toEqual({});
  });

  it("leaves every campaign standalone, in a context of its creator's, with its table intact", async () => {
    const after = await run(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const party = yield* Party;
        return {
          fens: yield* as(fen)(campaigns.findById(fens.id)),
          // Pim's campaign-scoped credential still reaches the table.
          pimReads: yield* as(pim)(campaigns.findById(fens.id)),
          seats: yield* as(fen)(party.list(fens.id)),
          adas: yield* as(ada)(campaigns.findById(adas.id)),
        };
      }),
    );
    expect(after.pimReads.id).toBe(fens.id);
    expect(after.seats.map((row) => row.character?.name)).toEqual(["Pell"]);
    // The archived one moved too, and is still archived.
    expect(after.adas.archivedAt).not.toBeNull();

    const contexts = await query(
      (sql) => sql<{
        readonly campaign: string;
        readonly is_shared_world: boolean;
        readonly owner_account_id: string;
        readonly members: number;
      }>`
        select campaign.name as campaign, play_group.is_shared_world, play_group.owner_account_id,
               (select count(*)::int from group_member
                where group_member.group_id = play_group.id
                  and group_member.revoked_at is null) as members
        from campaign join play_group on play_group.id = campaign.group_id
        where campaign.id in ${sql.in([fens.id, adas.id])}
        order by campaign.name
      `,
    );
    expect(contexts).toEqual([
      {
        campaign: "Ada's Table",
        is_shared_world: false,
        owner_account_id: ada.accountId,
        members: 1,
      },
      {
        campaign: "Fen's Table",
        is_shared_world: false,
        owner_account_id: fen.accountId,
        members: 2,
      },
    ]);
  });

  it("deletes an archived world from the shelf", async () => {
    const shelved = await run(
      Effect.gen(function* () {
        const groups = yield* Groups;
        const made = yield* as(ada)(groups.create({ name: "The Old Coast" }));
        yield* as(ada)(groups.archive(made.id));
        return made.id;
      }),
    );

    await run(deleteWorld(ada, shelved));

    expect(await rowsNamingGroup(shelved)).toEqual({});
    const archived = await run(Effect.flatMap(Groups, (g) => as(ada)(g.archived)));
    expect(archived.map((world) => world.id)).not.toContain(shelved);
  });
});
