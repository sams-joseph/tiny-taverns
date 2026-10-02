import { expect } from "@effect/vitest";
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
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { PrepItems } from "../src/repo/PrepItems.js";
import { Acts } from "../src/repo/Acts.js";
import { Advancement } from "../src/repo/Advancement.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignStories } from "../src/repo/CampaignStories.js";
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
import { Options } from "../src/repo/Options.js";
import { NpcPreps } from "../src/repo/NpcPrep.js";
import { NpcSheets } from "../src/repo/NpcSheets.js";
import { Npcs } from "../src/repo/Npcs.js";
import { Party } from "../src/repo/Party.js";
import { Proposals } from "../src/repo/Proposals.js";
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
import { describeLayer } from "./support/suite.js";

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
const services = Layer.mergeAll(
  Accounts.layer,
  Advancement.layer.pipe(Layer.provide(live)),
  Beats.layer.pipe(Layer.provide(live)),
  CampaignCreatorActors.layer,
  Campaigns.layer,
  CampaignStories.layer,
  Characters.layer.pipe(Layer.provide(live)),
  Creatures.layer,
  EncounterCreatures.layer,
  Encounters.layer,
  GroupHistory.layer,
  Groups.layer,
  HobThreads.layer,
  Invites.layer,
  LibraryShares.layer,
  Memberships.layer,
  Notes.layer,
  Npcs.layer,
  Options.layer,
  Party.layer.pipe(Layer.provide(live)),
  Proposals.layer.pipe(
    Layer.provide([
      Groups.layer,
      CampaignCreatorActors.layer,
      NpcSheets.layer,
      Npcs.layer,
      NpcPreps.layer,
      Beats.layer.pipe(Layer.provide(live)),
      Campaigns.layer,
      CampaignStories.layer,
      Characters.layer.pipe(Layer.provide(live)),
      EncounterCreatures.layer,
      Encounters.layer,
      GroupHistory.layer,
      Notes.layer,
      Sessions.layer.pipe(Layer.provide(live)),
      Acts.layer,
      PrepItems.layer,
    ]),
  ),
  Sessions.layer.pipe(Layer.provide(live)),
  Acts.layer,
  PrepItems.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_permanent_delete")));

const as =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/** The failure a call answers with, or `undefined` when it succeeded. */
const refusal = <E, R>(effect: Effect.Effect<unknown, E, R>) =>
  effect.pipe(
    Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }),
    Effect.orDie,
  );

const query = <A extends object>(
  build: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<A>, unknown>,
) => Effect.flatMap(SqlClient.SqlClient, build).pipe(Effect.orDie);

/** The levels a character's level-up records reached. */
const levelUpsOf = (characterId: string) =>
  Effect.map(
    query(
      (sql) => sql<{ readonly level: number }>`
        select level from character_advancement where character_id = ${characterId} order by level
      `,
    ),
    (rows) => rows.map((row) => row.level),
  );

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
  }).pipe(Effect.orDie);

/** The same sweep for a `play_group`, over `group_id`. */
const rowsNamingGroup = (groupId: SharedWorldId) =>
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
  }).pipe(Effect.orDie);

/**
 * A campaign with something in every drawer: a note, a played night with a
 * beat and a planned one, an encounter with a Library creature instanced onto
 * its roster, an NPC, the creator's Hob thread, an open invitation, a player
 * with a seated character that has levelled up there, a character that player
 * kept from a Hob draft at this table, and a Chronicle entry the world accepted
 * from it.
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
    // Pell is a Spellsword, Pim's own Library class, which the table's rules
    // reach once Pell sits there, and has gained a level: a record that is
    // Pell's, not the campaign's.
    yield* as(accountWide(player))(
      (yield* Options).libraryCreate({
        kind: "class",
        name: "Spellsword",
        body: { hitDie: 8, unarmouredAc: ["DEX"] },
      }),
    );
    const seated = yield* aCharacterAt(campaign.id, player, {
      name: "Pell",
      className: "Spellsword",
      level: 1,
      hpMax: 9,
      sheet: { ...emptyCharacterSheet, abilities: [{ label: "CON", score: "12", modifier: "+1" }] },
    });
    const advancement = yield* Advancement;
    const offer = yield* as(player)(advancement.offer(seated.character.id));
    yield* as(player)(
      advancement.levelUp(seated.character.id, {
        expectedVersion: offer.version,
        toLevel: offer.toLevel,
      }),
    );

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

const makeDeleting = Effect.gen(function* () {
  const groups = yield* Groups;
  const campaigns = yield* Campaigns;
  const ada = yield* anAccount("Ada");
  const stranger = yield* anAccount("Bo");
  const worldId = (yield* as(ada)(groups.create({ name: "The Salt Company" }))).id;
  const campaign = yield* as(ada)(
    campaigns.create(worldId, { name: "The Salt Road", visibility: "shared" }),
  );
  const furnished = yield* furnish(ada, campaign, worldId);
  const bystander = yield* aGroupMemberAt(campaign.id, "Wren");
  return { ada, stranger, worldId, campaign, furnished, bystander };
}).pipe(Effect.orDie);

class Deleting extends Context.Service<Deleting, Effect.Success<typeof makeDeleting>>()(
  "permanent-delete.test/Deleting",
) {}

const makeWorld = Effect.gen(function* () {
  const groups = yield* Groups;
  const campaigns = yield* Campaigns;
  const creatures = yield* Creatures;
  const shares = yield* LibraryShares;
  const history = yield* GroupHistory;
  const threads = yield* HobThreads;
  const sql = yield* SqlClient.SqlClient;

  const ada = yield* anAccount("Ada");
  const fen = yield* anAccount("Fen");
  const stranger = yield* anAccount("Bo");
  const worldId = (yield* as(ada)(groups.create({ name: "The Salt Company" }))).id;
  yield* admitToGroup(sql, worldId, fen.accountId);

  // Fen's table, with a player and a seated character: somebody else's
  // campaign in Ada's world.
  const fens = yield* as(fen)(
    campaigns.create(worldId, { name: "Fen's Table", visibility: "shared" }),
  );
  const pim = yield* aPlayerAt(fens.id, "Pim");
  yield* aCharacterAt(fens.id, pim, { name: "Pell" });

  // Ada's own table, archived.
  const adas = yield* as(ada)(campaigns.create(worldId, { name: "Ada's Table" }));
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
  return { ada, fen, pim, stranger, worldId, fens, adas };
}).pipe(Effect.orDie);

class World extends Context.Service<World, Effect.Success<typeof makeWorld>>()(
  "permanent-delete.test/World",
) {}

describeLayer("permanent-delete", services, (it) => {
  it.layer(Layer.effect(Deleting)(makeDeleting))("deleting a campaign", (it) => {
    it.effect(
      "answers NotFound to a player, a world member and a stranger, and deletes nothing",
      () =>
        Effect.gen(function* () {
          const { ada, stranger, campaign, furnished, bystander } = yield* Deleting;
          for (const who of [
            furnished.player,
            accountWide(furnished.player),
            bystander,
            stranger,
          ]) {
            expect(yield* refusal(deleteCampaign(who, campaign.id))).toBeInstanceOf(NotFound);
          }
          const still = yield* Effect.flatMap(Campaigns, (c) => as(ada)(c.findById(campaign.id)));
          expect(still.id).toBe(campaign.id);
        }),
    );

    it.effect("refuses while a night is open, and deletes nothing", () =>
      Effect.gen(function* () {
        const { ada, campaign, furnished } = yield* Deleting;
        const night = furnished.sessionIds[0]!;
        yield* Effect.flatMap(Campaigns, (c) =>
          as(ada)(c.update(campaign.id, { currentSessionId: night as never })),
        );
        expect(yield* refusal(deleteCampaign(ada, campaign.id))).toBeInstanceOf(Conflict);
        expect(Object.keys(yield* rowsNaming(campaign.id)).length).toBeGreaterThan(0);

        yield* Effect.flatMap(Campaigns, (c) =>
          as(ada)(c.update(campaign.id, { currentSessionId: null })),
        );
      }),
    );

    it.effect("removes the campaign and every row that belongs only to it", () =>
      Effect.gen(function* () {
        const { ada, campaign, furnished } = yield* Deleting;
        expect(yield* rowsNaming(campaign.id)).toMatchObject({
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

        yield* deleteCampaign(ada, campaign.id);

        expect(yield* rowsNaming(campaign.id)).toEqual({});
        const nested = yield* query(
          (sql) => sql<{
            readonly sessions: number;
            readonly turns: number;
            readonly beats: number;
          }>`
        select
          (select count(*)::int from session where id in ${sql.in(furnished.sessionIds)}) as sessions,
          (select count(*)::int from assistant_turn where id in ${sql.in(furnished.turnIds)}) as turns,
          (select count(*)::int from beat where session_id in ${sql.in(furnished.sessionIds)}) as beats
      `,
        );
        expect(nested[0]).toEqual({ sessions: 0, turns: 0, beats: 0 });
        expect(
          yield* refusal(Effect.flatMap(Campaigns, (c) => as(ada)(c.findById(campaign.id)))),
        ).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("leaves the characters, which lose only their seat", () =>
      Effect.gen(function* () {
        const { furnished } = yield* Deleting;
        const characters = yield* query(
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
          {
            id: furnished.seated.character.id,
            origin: "authored",
            assistant_turn_id: null,
            seats: 0,
          },
          // Hob drafted this one; the conversation it came from went with the table.
          { id: furnished.drafted.id, origin: "assistant", assistant_turn_id: null, seats: 0 },
        ]);
        // Pell's level-up was Pell's, not the table's.
        expect(yield* levelUpsOf(furnished.seated.character.id)).toEqual([2]);
      }),
    );

    it.effect("leaves the Shared World and the Chronicle entry it accepted", () =>
      Effect.gen(function* () {
        const { ada, worldId, furnished } = yield* Deleting;
        const entries = yield* query(
          (sql) => sql<{ readonly group_id: string; readonly campaign_id: string | null }>`
        select group_id, campaign_id from group_history_entry where id = ${furnished.entry!.id}
      `,
        );
        expect(entries).toEqual([{ group_id: worldId, campaign_id: null }]);
        const world = yield* Effect.flatMap(Groups, (g) => as(ada)(g.findById(worldId)));
        expect(world.id).toBe(worldId);
      }),
    );

    it.effect("takes a standalone campaign's hidden context with it", () =>
      Effect.gen(function* () {
        const { ada } = yield* Deleting;
        const standalone = yield* Effect.flatMap(Campaigns, (c) =>
          as(ada)(c.createStandalone({ name: "Low Tide", visibility: "shared" })),
        );
        yield* furnish(ada, standalone, undefined);

        yield* deleteCampaign(ada, standalone.id);

        expect(yield* rowsNaming(standalone.id)).toEqual({});
        expect(yield* rowsNamingGroup(standalone.contextId)).toEqual({});
      }),
    );

    it.effect("deletes an archived campaign too", () =>
      Effect.gen(function* () {
        const { ada } = yield* Deleting;
        const shelved = yield* Effect.gen(function* () {
          const campaigns = yield* Campaigns;
          const made = yield* as(ada)(campaigns.createStandalone({ name: "Shelved" }));
          yield* as(ada)(campaigns.archive(made.id));
          return made;
        });

        yield* deleteCampaign(ada, shelved.id);

        expect(yield* rowsNaming(shelved.id)).toEqual({});
        const archived = yield* Effect.flatMap(Memberships, (m) => as(ada)(m.mine("archived")));
        expect(archived.map((row) => row.campaign.id)).not.toContain(shelved.id);
      }),
    );

    it.effect("leaves a character's level-ups for its own delete to take", () =>
      Effect.gen(function* () {
        const { furnished } = yield* Deleting;
        const pell = furnished.seated.character.id;
        expect(yield* levelUpsOf(pell)).toEqual([2]);
        yield* Effect.flatMap(Characters, (characters) =>
          as(furnished.player)(characters.removeOwn(pell)),
        );
        expect(yield* levelUpsOf(pell)).toEqual([]);
      }),
    );
  });

  it.layer(Layer.effect(World)(makeWorld))("deleting a Shared World", (it) => {
    it.effect("answers NotFound to a campaign creator, a player and a stranger", () =>
      Effect.gen(function* () {
        const { fen, pim, stranger, worldId } = yield* World;
        for (const who of [fen, pim, accountWide(pim), stranger]) {
          expect(yield* refusal(deleteWorld(who, worldId))).toBeInstanceOf(NotFound);
        }
        expect(Object.keys(yield* rowsNamingGroup(worldId))).toContain("play_group");
      }),
    );

    it.effect("refuses a campaign's hidden context as a world that does not exist", () =>
      Effect.gen(function* () {
        const { ada } = yield* World;
        const standalone = yield* Effect.flatMap(Campaigns, (c) =>
          as(ada)(c.createStandalone({ name: "Hidden" })),
        );
        expect(yield* refusal(deleteWorld(ada, standalone.contextId))).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("removes the world and everything that belongs only to it", () =>
      Effect.gen(function* () {
        const { ada, worldId } = yield* World;
        expect(yield* rowsNamingGroup(worldId)).toMatchObject({
          assistant_thread: 1,
          group_history_entry: 1,
          group_library_share: 1,
          play_group: 1,
        });

        yield* deleteWorld(ada, worldId);

        expect(yield* rowsNamingGroup(worldId)).toEqual({});
      }),
    );

    it.effect(
      "leaves every campaign standalone, in a context of its creator's, with its table intact",
      () =>
        Effect.gen(function* () {
          const { ada, fen, pim, fens, adas } = yield* World;
          const after = yield* Effect.gen(function* () {
            const campaigns = yield* Campaigns;
            const party = yield* Party;
            return {
              fens: yield* as(fen)(campaigns.findById(fens.id)),
              // Pim's campaign-scoped credential still reaches the table.
              pimReads: yield* as(pim)(campaigns.findById(fens.id)),
              seats: yield* as(fen)(party.list(fens.id)),
              adas: yield* as(ada)(campaigns.findById(adas.id)),
            };
          });
          expect(after.pimReads.id).toBe(fens.id);
          expect(after.seats.map((row) => row.character?.name)).toEqual(["Pell"]);
          // The archived one moved too, and is still archived.
          expect(after.adas.archivedAt).not.toBeNull();

          const contexts = yield* query(
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
        }),
    );

    it.effect("deletes an archived world from the shelf", () =>
      Effect.gen(function* () {
        const { ada } = yield* World;
        const shelved = yield* Effect.gen(function* () {
          const groups = yield* Groups;
          const made = yield* as(ada)(groups.create({ name: "The Old Coast" }));
          yield* as(ada)(groups.archive(made.id));
          return made.id;
        });

        yield* deleteWorld(ada, shelved);

        expect(yield* rowsNamingGroup(shelved)).toEqual({});
        const archived = yield* Effect.flatMap(Groups, (g) => as(ada)(g.archived));
        expect(archived.map((world) => world.id)).not.toContain(shelved);
      }),
    );
  });
});
