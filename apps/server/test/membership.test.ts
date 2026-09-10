import {
  type Actor,
  type AssistantTurnId,
  type NpcTurnId,
  type CampaignId,
  CurrentActor,
  type NotFound,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { LibraryShares } from "../src/repo/LibraryShares.js";
import { Recap } from "../src/repo/Recap.js";
import { Groups } from "../src/repo/Groups.js";
import { Characters } from "../src/repo/Characters.js";
import { ClassProgression } from "../src/repo/ClassProgression.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { type CampaignCreatorActor, CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { EquipmentRepo } from "../src/repo/Equipment.js";
import { Feats } from "../src/repo/Feats.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { MagicItems } from "../src/repo/MagicItems.js";
import { Notes } from "../src/repo/Notes.js";
import { NpcKnowledge } from "../src/repo/NpcKnowledge.js";
import { NpcMemories } from "../src/repo/NpcMemories.js";
import { NpcProposals } from "../src/repo/NpcProposals.js";
import { NpcAwareness } from "../src/repo/NpcAwareness.js";
import { Npcs } from "../src/repo/Npcs.js";
import { NpcThreads } from "../src/repo/NpcThreads.js";
import { Party } from "../src/repo/Party.js";
import { Options } from "../src/repo/Options.js";
import { PrepItems } from "../src/repo/PrepItems.js";
import { RuleArticles } from "../src/repo/RuleArticles.js";
import { Rolls } from "../src/repo/Rolls.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { Spells } from "../src/repo/Spells.js";
import { aCharacterAt, anAccount, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { items } from "./support/paging.js";

/**
 * Membership: the base case every predicate in the product composes, and the
 * two things that keep it from quietly coming undone.
 *
 * `campaignInScope` used to mean "the actor's account owns this campaign". It
 * now means "the actor's account holds a live `campaign_member` row", and
 * nothing else in `repo/visibility.ts` changed shape — which is exactly why
 * this file exists. The seam is a grep away from being reopened by a future
 * query that reaches for `campaign.account_id` because it is still there, and
 * the negative space (a stranger reads *nothing*, from every table) is the part
 * a suite full of positive assertions cannot see.
 *
 * Four blocks:
 *
 *   1. the two greps, in the shape of `seam.test.ts` and `hob.test.ts`
 *   2. a campaign cannot exist without a DM — the composite key, driven
 *   3. a stranger reads nothing, from all sixteen content tables
 *   4. what an account is before anybody invites it
 *
 * The fourth block used to be "no player actor can be minted yet". The invite
 * landed, so it is not that any more; `invites.test.ts` is where the player it
 * mints is measured, and what is left here is the complement — an account
 * nobody has invited still reaches only what it created.
 */

const sourceDirectory = fileURLToPath(new URL("../src", import.meta.url));

const sourceFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });

const relative = (path: string): string => path.slice(sourceDirectory.length + 1);

/**
 * A source file with its comments removed, so the rules below can be described
 * in the files they govern. Crude on purpose, exactly as `hob.test.ts`'s is:
 * it does not know about a `//` inside a string literal, and there is no
 * construct here that would produce a false negative.
 */
const code = (path: string): string =>
  readFileSync(`${sourceDirectory}/${path}`, "utf8")
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/\/\/.*$/gm, "");

/**
 * The source files outside the migrations whose *code* matches.
 *
 * Migrations are excluded because they **are** the schema: `0011_membership.ts`
 * necessarily writes both names, and a migration is a historical record rather
 * than a query anyone composes.
 */
const mentioning = (pattern: RegExp): ReadonlyArray<string> =>
  sourceFiles(sourceDirectory)
    .map(relative)
    .filter((path) => !path.startsWith("migrations/"))
    .filter((path) => pattern.test(code(path)))
    .sort();

describe("the reach seam, enforced rather than asserted", () => {
  it("has no role column and no role literal anywhere in src", () => {
    // The captain's decision of 2026-09-01: the campaign creator is its sole
    // DM, derived from `campaign.creator_account_id`, and every other live
    // participant is a player. A mutable role was the thing that made co-DM
    // semantics one UPDATE away; it is gone, and this grep is what keeps a
    // future predicate or writer from quietly reintroducing it.
    expect(mentioning(/\bcampaign_member\.role\b/)).toEqual([]);
    expect(mentioning(/\brole\s*=\s*'(dm|player)'/)).toEqual([]);
  });

  it("leaves campaign.account_id gone, and creator_account_id where authority is written", () => {
    // `campaign.account_id` is gone from the schema entirely; nothing in
    // `src` may spell it again.
    expect(mentioning(/\bcampaign\.account_id\b/)).toEqual([]);

    // `creator_account_id` *is* an authority path now, by design — the
    // captain's decision — so the honest guard is an inventory of who reads
    // it, kept short: the predicate (`isCreator` in `repo/visibility.ts`),
    // the row mapper and create (`repo/Campaigns.ts`), the derived relation
    // and creator guard (`repo/Memberships.ts`), the group directory
    // (`repo/Groups.ts`), and the invitation projection that names the
    // campaign's creator (`repo/Invites.ts`). Invites only joins the account
    // for display; it still receives creator authority as a proof. A new file
    // on this list is a new place creator-ness may be interpreted, and should
    // be looked at hard.
    expect(mentioning(/\bcreator_account_id\b/)).toEqual([
      "repo/Campaigns.ts",
      "repo/Groups.ts",
      "repo/Invites.ts",
      "repo/Memberships.ts",
      "repo/visibility.ts",
    ]);

    // The column name itself is legal on other tables, and the list is how a
    // new one gets looked at. `repo/Memberships.ts` and `repo/visibility.ts`
    // are `campaign_member`'s own column; `repo/Campaigns.ts` is the only
    // writer of the campaign's — whose account this is, the cascade parent and
    // the billing owner and no longer a way in.
    //
    // `repo/Characters.ts` is `character.account_id` under the continuity
    // decision: whose character it is, `not null` and the whole of the
    // owner-side reach. The predicates are `ownCharacter` (the owner, read
    // and write alike) and `characterSeatedAt` (the campaign side, reached
    // through a live `campaign_character` seat) — both in
    // `repo/visibility.ts`, both comparing the column to the actor's own
    // account and to nothing a caller supplied.
    //
    // `repo/Party.ts` is the seat's own `account_id` — whose seat it is, the
    // join key written from `CurrentActor` at seating time and the value the
    // owner-retires-their-own-seat predicate compares. The seat is campaign
    // content, so the generic row predicates cover the rest of it.
    //
    // `repo/Creatures.ts` is the newest and the one that is *not* about a
    // campaign at all: `creature.account_id`, added by
    // `0015_library_creatures.ts`, is whose **Library** a monster is in — a row
    // that belongs to an account and to no campaign. So it is named by two
    // predicates in `repo/visibility.ts` (`libraryRowReadable` and
    // `libraryRowWritable`) and written once here, from `CurrentActor` and never
    // from anything a caller supplied. It is not a reach path for the same
    // reason it is not a membership question: there is no campaign for it to
    // reach *into*. `library.test.ts` pins that one account's Library is neither
    // readable nor writable by another.
    // `bestiary/import.ts` names it in the *negative*, in the one place that
    // has to: the bundled corpus's upsert target is now the partial unique index
    // over rows owned by nobody, and Postgres infers an arbiter index only from
    // an inference predicate that implies the index's own. It never assigns the
    // column — a bundled row has no owner, which is what
    // `creature_system_is_unowned` makes a fact about the schema.
    //
    // `repo/HobThreads.ts` is the sixth and arrived when the captain reversed
    // *players do not talk to Hob*: `assistant_thread.account_id` (`0016`) is
    // whose **conversation** this is, null for the campaign's own. It is the
    // same shape as `character` and for the same reason — the column is written
    // here from `CurrentActor` and compared nowhere, because
    // `conversationReachable` in `repo/visibility.ts` is where the comparison
    // lives. It is not a reach path into a campaign either: the campaign half of
    // that predicate is the one every other predicate already composes, so a
    // conversation is reachable exactly while the table it is at is.
    //
    // `repo/Options.ts` / `ruleset/import.ts`, `repo/Spells.ts` /
    // `spells/import.ts`, `repo/Equipment.ts` / `equipment/import.ts`, and
    // `repo/MagicItems.ts` / `magic-items/import.ts` are the next pairs, and
    // they are `repo/Creatures.ts`'s and `bestiary/import.ts`'s shape over the
    // other tables that carry the Library model. Not one new predicate between
    // them: the four Library predicates in `repo/visibility.ts` take a table
    // name, so each repository composes them with a different string and each
    // seeder names the column in the negative for the arbiter-index reason
    // above. If a change here ever seems to need a predicate of its own, that
    // is a finding rather than a step.
    //
    // `repo/LibraryShares.ts` is the explicit-share layer of the 2026-09-01
    // Library decision: `owner_account_id`/`shared_by_account_id` on the
    // grant row, written from `CurrentActor` and compared against the
    // resource's own owner — never a value a caller supplied. The reach it
    // grants lives in one predicate (`groupSharedIntoCampaign`,
    // `repo/visibility.ts`), and `group-library.test.ts` pins that it never
    // widens a Library.
    expect(mentioning(/\baccount_id\b/)).toEqual([
      "bestiary/import.ts",
      "equipment/import.ts",
      "magic-items/import.ts",
      "repo/Characters.ts",
      "repo/ClassProgression.ts",
      "repo/Creatures.ts",
      // The point-of-use instancing seam (2026-09-02): a roster add reads the
      // source's owner columns to decide whether an owned original needs an
      // internal campaign instance minted for it. The comparison is against
      // `copyableIntoCampaign`'s answer, never a caller-supplied account.
      "repo/EncounterCreatures.ts",
      "repo/Equipment.ts",
      "repo/Feats.ts",
      "repo/Groups.ts",
      "repo/HobThreads.ts",
      "repo/LibraryShares.ts",
      "repo/MagicItems.ts",
      "repo/Memberships.ts",
      "repo/NpcMemories.ts",
      "repo/NpcProposals.ts",
      "repo/NpcThreads.ts",
      "repo/Npcs.ts",
      "repo/Options.ts",
      "repo/Party.ts",
      "repo/PlayerTable.ts",
      "repo/Rolls.ts",
      "repo/RuleArticles.ts",
      "repo/Spells.ts",
      "repo/visibility.ts",
      "ruleset/import.ts",
      "ruleset/progression.ts",
      "ruleset/rules.ts",
      "ruleset/source.ts",
      "ruleset/vocabularies.ts",
      "spells/import.ts",
    ]);
  });

  it("confines campaign_member to the one module that reads it and the one that writes it", () => {
    // Two modules, one question each. A third would be a second answer to
    // "who reaches this campaign", and the day the two disagree is the day the
    // one that is wrong is the one nobody is looking at.
    expect(mentioning(/\bcampaign_member\b/)).toEqual([
      "repo/Memberships.ts",
      "repo/visibility.ts",
    ]);
  });

  it("confines group_member the same way", () => {
    // The group-level twin of the rule above: `repo/Groups.ts` writes it,
    // `repo/visibility.ts` reads it, and a third module naming it would be a
    // second answer to "who is in this group".
    expect(mentioning(/\bgroup_member\b/)).toEqual(["repo/Groups.ts", "repo/visibility.ts"]);
  });

  it("writes participation in one module, and no writer can express a role", () => {
    // There is nothing for a writer to smuggle: `campaign_member` has no role
    // column, so "an invitation cannot become a DM membership" stopped being a
    // property of which statements exist and became a property of the schema.
    // What is left to guard is the number of writers.
    expect(mentioning(/insert into campaign_member/)).toEqual(["repo/Memberships.ts"]);
    expect(mentioning(/insert into group_member/)).toEqual(["repo/Groups.ts"]);

    // The invite repository, which mints memberships for whoever redeems,
    // mentions no role because there is none to mention.
    expect(code("repo/Invites.ts")).not.toMatch(/\brole\b/);
  });
});

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
    Campaigns.layer,
    Groups.layer,
    GroupHistory.layer.pipe(Layer.provide(Recap.layer)),
    LibraryShares.layer,
    Characters.layer,
    Party.layer.pipe(Layer.provide(LiveEvents.layer)),
    ClassProgression.layer,
    Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
    Creatures.layer,
    CampaignCreatorActors.layer,
    EncounterCreatures.layer,
    EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
    Encounters.layer,
    EquipmentRepo.layer,
    Feats.layer,
    MagicItems.layer,
    HobThreads.layer,
    Notes.layer,
    NpcKnowledge.layer,
    NpcMemories.layer,
    NpcAwareness.layer.pipe(Layer.provide([NpcKnowledge.layer, NpcMemories.layer])),
    NpcProposals.layer.pipe(
      Layer.provide([
        Campaigns.layer,
        Notes.layer,
        Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
        NpcMemories.layer,
        NpcThreads.layer,
      ]),
    ),
    Npcs.layer,
    NpcThreads.layer,
    Options.layer,
    PrepItems.layer,
    RuleArticles.layer,
    Rolls.layer.pipe(Layer.provide(LiveEvents.layer)),
    SessionEvents.layer,
    Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
    Spells.layer,
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_membership"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/** The DM proof, for whichever actor the enclosing `withActor` provided. */
const dmOf = (
  campaignId: CampaignId,
): Effect.Effect<CampaignCreatorActor, NotFound, CurrentActor | CampaignCreatorActors> =>
  Effect.flatMap(CampaignCreatorActors, (dmActors) => dmActors.of(campaignId));

/**
 * One campaign with a row in every content table, and one stranger who is a DM
 * of their own campaign somewhere else.
 *
 * Every row is left at the column default for `visibility` — `dm` — because the
 * question here is reach and not sharing: a stranger must not have the shared
 * ones either, and `visibility.test.ts` is where that half lives.
 */
const makeFixture = Effect.gen(function* () {
  const beats = yield* Beats;
  const campaigns = yield* Campaigns;
  const combatants = yield* Combatants;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const equipment = yield* EquipmentRepo;
  const feats = yield* Feats;
  const hob = yield* HobThreads;
  const magicItems = yield* MagicItems;
  const notes = yield* Notes;
  const npcKnowledge = yield* NpcKnowledge;
  const npcMemories = yield* NpcMemories;
  const npcAwareness = yield* NpcAwareness;
  const npcProposals = yield* NpcProposals;
  const npcs = yield* Npcs;
  const npcThreads = yield* NpcThreads;
  const options = yield* Options;
  const prep = yield* PrepItems;
  const ruleArticles = yield* RuleArticles;
  const roster = yield* EncounterCreatures;
  const runs = yield* EncounterRuns;
  const sessions = yield* Sessions;
  const spells = yield* Spells;

  const dm = yield* anAccount("Ada");
  const as = withActor(dm);

  const campaign = yield* as(createCampaign({ name: "The Salt Road" }));
  const session = yield* as(sessions.create(campaign.id, { number: 12 }));
  yield* as(campaigns.update(campaign.id, { currentSessionId: session.id }));

  // The creator's own character, seated here — a creator is a player too, and
  // this is what gives both `character` and `campaign_character` a row for the
  // stranger below to be refused.
  yield* aCharacterAt(campaign.id, dm, { name: "Brannoc", playerName: "Ilse" });
  yield* as(notes.create(campaign.id, { title: "The crate" }));
  // A Library original of the creator's, granted to the group — the share
  // shelf's row for the stranger below to be refused.
  const original = yield* as(
    creatures.libraryCreate({ name: "Bog Owlbear", type: "Monstrosity", cr: "3", ac: 14, hp: 59 }),
  );
  yield* as(
    Effect.flatMap(LibraryShares, (shares) =>
      shares.share(campaign.contextId, { kind: "creature", resourceId: original.id as string }),
    ),
  );
  // The group's chronicle: one entry through the shipped write, and one
  // accepted summary — raw SQL, because the accept flow is group Hob's and has
  // not shipped; the read under test is the same either way.
  yield* as(
    Effect.flatMap(GroupHistory, (h) =>
      h.create(campaign.contextId, { body: "Both tables reached the crossing." }),
    ),
  );
  yield* Effect.flatMap(
    SqlClient.SqlClient,
    (sql) => sql`
      insert into group_history_summary (group_id, status, last_group_seq, text, origin)
      values (${campaign.contextId}, 'accepted', 1, 'The story so far.', 'authored')
    `,
  ).pipe(Effect.orDie);
  yield* as(
    beats.create(campaign.id, session.id, { body: "The ferryman would not say his name." }),
  );
  yield* as(prep.create(campaign.id, session.id, { label: "Reread the ford" }));
  yield* as(
    Effect.flatMap(Rolls, (rolls) =>
      rolls.create(campaign.id, {
        label: "Lantern check",
        notation: "1d20+2",
        dice: [12],
        kept: [12],
        modifier: 2,
        total: 14,
        mode: "normal",
      }),
    ),
  );
  yield* as(
    spells.libraryCreate({
      name: "Shield",
      level: 1,
      school: { index: "abjuration", name: "Abjuration" },
      castingTime: "1 reaction",
      range: "Self",
      duration: "1 round",
      ritual: false,
      concentration: false,
    }),
  );
  yield* as(
    equipment.libraryCreate({
      name: "Hemp Rope",
      equipmentCategory: { index: "adventuring-gear", name: "Adventuring Gear" },
      cost: { quantity: 1, unit: "gp" },
      weight: 10,
    }),
  );
  yield* as(
    magicItems.libraryCreate({
      name: "Lantern Ring",
      equipmentCategory: { index: "ring", name: "Ring" },
      rarity: { index: "uncommon", name: "Uncommon" },
    }),
  );

  const creature = yield* as(
    creatures.libraryCreate({
      name: "Bullywug Croaker",
      type: "humanoid",
      cr: "1/4",
      ac: 15,
      hp: 11,
    }),
  );
  const encounter = yield* as(encounters.create(campaign.id, { name: "Ambush in the reeds" }));
  yield* as(roster.create(campaign.id, encounter.id, { creatureId: creature.id, count: 6 }));

  // A homebrew class, authored into this account's Library. Since the
  // instancing decision of 2026-09-02 a campaign holds no managed option
  // copies: the campaign vocabulary read below answers the DM their own
  // original (`usableInCampaign`), and the stranger is refused at the campaign
  // gate. The progression rows hang off the original, in the Library.
  const homebrew = yield* as(
    options.libraryCreate({
      kind: "class",
      name: "Bloodsworn",
      body: { hitDie: 10, unarmouredAc: ["DEX", "CON"] },
    }),
  );
  const houseRules = yield* as(
    ruleArticles.libraryCreate({
      name: "House Weather",
      sections: [{ title: "Storm Glass", content: "## Storm Glass\n\nFog answers the bell." }],
    }),
  );
  yield* as(
    feats.libraryCreate({
      name: "Tavern Wrestler",
      description: ["Hold your ground when the room turns rough."],
    }),
  );

  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    insert into racial_trait ${sql.insert({
      account_id: dm.accountId,
      name: "Saltborn",
      body: JSON.stringify({ desc: ["Knows the old road by lantern light."] }),
    })}
  `;
  const subclass = yield* sql<{ readonly id: string }>`
    insert into subclass ${sql.insert({
      account_id: dm.accountId,
      class_option_id: homebrew.id,
      name: "Oathkept",
      visibility: "shared",
    })}
    returning id::text
  `;
  const level = yield* sql<{ readonly id: string }>`
    insert into class_level ${sql.insert({
      account_id: dm.accountId,
      class_option_id: homebrew.id,
      subclass_id: subclass[0]!.id,
      level: 1,
      visibility: "shared",
    })}
    returning id::text
  `;
  yield* sql`
    insert into feature ${sql.insert({
      account_id: dm.accountId,
      class_option_id: homebrew.id,
      subclass_id: subclass[0]!.id,
      class_level_id: level[0]!.id,
      name: "Blood vow",
      level: 1,
      visibility: "shared",
    })}
  `;

  const asDm = yield* as(dmOf(campaign.id));
  const run = yield* as(runs.start(asDm, session.id, { encounterId: encounter.id }));
  yield* as(combatants.create(asDm, session.id, run.id, { displayName: "Croaker 1" }));

  const thread = yield* as(hob.start("dm", campaign.id, "Who is the ferryman?"));
  yield* as(
    hob.append("dm", campaign.id, thread.id, {
      id: randomUUID() as AssistantTurnId,
      who: "user",
      text: "Who is the ferryman?",
    }),
  );

  // The cast: an NPC with creator-only material, one rehearsal thread and one
  // line in it — three more rows a stranger must never see.
  const npc = yield* npcs.create(asDm, {
    name: "Cazril",
    role: "the ferryman",
    privateMaterial: { secrets: "He is paid by the hag." },
  });
  yield* npcKnowledge.create(asDm, npc.id, {
    body: "Cazril knows the hag's ferryman rite.",
    sourceKind: "manual",
    sourceLabel: "Membership fixture",
  });
  yield* npcMemories.draft(asDm, npc.id, { body: "The party asked Cazril about the crossing." });
  const awarenessTurnId = randomUUID() as AssistantTurnId;
  yield* as(
    hob.append("dm", campaign.id, thread.id, {
      id: awarenessTurnId,
      who: "hob",
      text: "Cazril should know the hag's ferryman rite.",
    }),
  );
  yield* npcAwareness.recordFromHob(asDm, awarenessTurnId, {
    npcId: npc.id,
    kind: "knowledge",
    body: "Cazril knows the hag's ferryman rite.",
    sourceKind: "manual",
    sourceLabel: "Membership fixture",
    sourceId: null,
    sourceExcerpt: "",
    rationale: "",
  });
  const npcThread = yield* npcThreads.start(asDm, npc.id, "What is your price?");
  yield* npcThreads.append(asDm, npc.id, npcThread.id, {
    id: randomUUID() as NpcTurnId,
    who: "user",
    text: "What is your price?",
  });
  const proposalTurnId = randomUUID() as NpcTurnId;
  yield* npcThreads.append(asDm, npc.id, npcThread.id, {
    id: proposalTurnId,
    who: "npc",
    text: "I may remember that.",
  });
  yield* as(
    npcProposals.record(campaign.id, npc.id, npcThread.id, proposalTurnId, {
      kind: "memory",
      body: "Cazril should remember the offered price.",
    }),
  );

  return {
    dm,
    /** A DM of their own table, and a stranger to this one. */
    stranger: yield* anAccount("Bo"),
    campaign,
    session,
    encounter,
    run,
    thread,
    npc,
    npcThread,
    homebrew,
    houseRules,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

/**
 * The shipped read for each content table, keyed by the table it reads.
 *
 * Table-driven on purpose. The suite proves the positive cases richly and the
 * negative ones case by case, which is what makes the *next* table the
 * dangerous one: it would be read by a new repository, tested for what it
 * returns, and never asked what it returns to somebody who should have nothing.
 * The first assertion below fails if a table is added without an entry here.
 */
const READS: Record<
  string,
  (
    f: Effect.Success<typeof makeFixture>,
  ) => Effect.Effect<
    ReadonlyArray<unknown>,
    { readonly _tag: string },
    | Beats
    | Campaigns
    | Characters
    | ClassProgression
    | Combatants
    | Creatures
    | CurrentActor
    | CampaignCreatorActors
    | EncounterCreatures
    | EncounterRuns
    | Encounters
    | EquipmentRepo
    | Feats
    | GroupHistory
    | LibraryShares
    | MagicItems
    | HobThreads
    | Notes
    | NpcKnowledge
    | NpcMemories
    | NpcAwareness
    | NpcProposals
    | Npcs
    | NpcThreads
    | Options
    | Party
    | PrepItems
    | RuleArticles
    | Rolls
    | SessionEvents
    | Sessions
    | Spells
  >
> = {
  campaign: () => Effect.flatMap(Campaigns, (r) => r.list),
  session: (f) => Effect.flatMap(Sessions, (r) => r.list(f.campaign.id)),
  // `character` left the campaign: it is account-owned and top-level, so its
  // one read is the owner's `mine` and a stranger's honest answer is an empty
  // list rather than a 404 about a campaign the read never names. What a
  // campaign holds is the seat below.
  character: () => Effect.flatMap(Characters, (r) => r.mine),
  campaign_character: (f) => Effect.flatMap(Party, (r) => r.list(f.campaign.id)),
  note: (f) => items(Effect.flatMap(Notes, (r) => r.list(f.campaign.id, {}))),
  beat: (f) => items(Effect.flatMap(Beats, (r) => r.list(f.campaign.id, f.session.id, {}))),
  prep_item: (f) => Effect.flatMap(PrepItems, (r) => r.list(f.campaign.id, f.session.id)),
  character_roll: (f) => Effect.flatMap(Rolls, (r) => r.list(f.campaign.id, f.session.id, {})),
  creature: (f) => items(Effect.flatMap(Creatures, (r) => r.list(f.campaign.id, {}))),
  // The campaign's rules vocabulary. It is `creature`'s shape over a second
  // table and needed no predicate of its own — `corpusRowReadable` takes a
  // table name, so the reach question is the one already answered here. What
  // makes it worth its own row in this list is that it is the **one list a
  // player reads to fill in a control**, so a stranger reading it would be a
  // leak somebody would have found by using the product rather than by testing
  // it.
  character_option: (f) => Effect.flatMap(Options, (r) => r.list(f.campaign.id, {})),
  // The five corpora below lost their campaign-scoped reads with the
  // instancing decision of 2026-09-02: the Library is their whole surface, and
  // a Library read is scoped to the reader's own account — so "a stranger
  // reads nothing" holds as an empty answer about *their* Library rather than
  // a 404 about somebody's campaign.
  rule_article: (f) =>
    items(Effect.flatMap(RuleArticles, (r) => r.library({ q: f.houseRules.article.name }))),
  feat: () => items(Effect.flatMap(Feats, (r) => r.library({ q: "Tavern Wrestler" }))),
  rule_section: (f) =>
    Effect.map(
      Effect.flatMap(RuleArticles, (r) => r.libraryFindById(f.houseRules.article.id)),
      (detail) => detail.sections,
    ),
  racial_trait: () =>
    Effect.map(
      Effect.flatMap(Options, (r) => r.libraryVocabulary()),
      (vocabulary) => vocabulary.traits,
    ),
  subclass: (f) =>
    Effect.map(
      Effect.flatMap(ClassProgression, (r) => r.libraryRead(f.homebrew.id)),
      (progression) => progression.subclasses,
    ),
  class_level: (f) =>
    Effect.map(
      Effect.flatMap(ClassProgression, (r) => r.libraryRead(f.homebrew.id)),
      (progression) => progression.levels,
    ),
  feature: (f) =>
    Effect.map(
      Effect.flatMap(ClassProgression, (r) => r.libraryRead(f.homebrew.id)),
      (progression) => progression.features,
    ),
  spell: () => items(Effect.flatMap(Spells, (r) => r.library({ q: "Shield" }))),
  equipment: () => items(Effect.flatMap(EquipmentRepo, (r) => r.library({ q: "Hemp Rope" }))),
  magic_item: () => items(Effect.flatMap(MagicItems, (r) => r.library({ q: "Lantern Ring" }))),
  encounter: (f) => items(Effect.flatMap(Encounters, (r) => r.list(f.campaign.id, {}))),
  encounter_creature: (f) =>
    Effect.flatMap(EncounterCreatures, (r) => r.list(f.campaign.id, f.encounter.id)),
  // The three DM-gated tables. The proof is obtained the same way `src` obtains
  // it — from the ambient actor — so a stranger fails at the gate rather than
  // at the read, which is the `NotFound` branch this file already allows for.
  encounter_run: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) =>
      Effect.flatMap(EncounterRuns, (r) => r.list(dm, f.session.id)),
    ),
  combatant: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) =>
      Effect.flatMap(Combatants, (r) => r.list(dm, f.session.id, f.run.id)),
    ),
  session_event: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) =>
      Effect.flatMap(SessionEvents, (r) => r.list(dm, f.session.id, {})),
    ),
  // The cast is creator-only in every read: the proof is minted from the
  // ambient actor exactly as the three gated tables above are, so a stranger
  // fails at the gate with the `NotFound` branch.
  npc: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) => Effect.flatMap(Npcs, (r) => r.list(dm, {}))),
  npc_knowledge_fact: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) =>
      Effect.flatMap(NpcKnowledge, (r) => r.list(dm, f.npc.id)),
    ),
  npc_awareness_candidate: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) =>
      Effect.flatMap(NpcAwareness, (r) => r.list(dm, f.npc.id)),
    ),
  npc_memory: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) =>
      Effect.flatMap(NpcMemories, (r) => r.list(dm, f.npc.id)),
    ),
  npc_proposal: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) =>
      Effect.flatMap(NpcProposals, (r) => r.list(dm, f.npc.id)),
    ),
  npc_thread: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) =>
      Effect.flatMap(NpcThreads, (r) => r.list(dm, f.npc.id)),
    ),
  npc_turn: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) =>
      Effect.flatMap(NpcThreads, (r) => r.turns(dm, f.npc.id, f.npcThread.id)),
    ),
  assistant_thread: (f) => Effect.flatMap(HobThreads, (r) => r.list("dm", f.campaign.id)),
  assistant_turn: (f) =>
    Effect.flatMap(HobThreads, (r) => r.turns("dm", f.campaign.id, f.thread.id)),
  // The group's chronicle: gated on live *group* membership rather than on a
  // campaign, so the stranger's refusal names the group. Reached through the
  // fixture campaign's own group, the way every group read in src is.
  group_history_entry: (f) => Effect.flatMap(GroupHistory, (r) => r.list(f.campaign.contextId)),
  // The share shelf: reach data any live member reads, a grant a stranger
  // must not see exists. Gated on group membership like the chronicle.
  group_library_share: (f) =>
    Effect.flatMap(LibraryShares, (shares) => shares.list(f.campaign.contextId)),
  // `summary` answers one row or null; boxed so the harness's "something to
  // miss / nothing leaked" arithmetic reads it like every list.
  group_history_summary: (f) =>
    Effect.map(
      Effect.flatMap(GroupHistory, (r) => r.summary(f.campaign.contextId)),
      (summary) => (summary === null ? [] : [summary]),
    ),
};

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

describe("a campaign cannot exist without a DM", () => {
  /**
   * What buys back the one thing membership genuinely weakens.
   *
   * A player's write refusal used to be a literal — `campaignWritable` compiled
   * to the constant `false`. It is now a row, so the question "can that row go
   * missing" has to have a structural answer rather than a careful one.
   * `campaign_owner_is_dm_member` is that answer, and these are its edges.
   */
  const attempt = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
    // `Effect.exit`, not `Effect.result`: a deferred constraint fails at COMMIT,
    // and `sql.withTransaction` wraps the commit in `Effect.orDie` — so the
    // refusal arrives as a defect. See the note in `schema.test.ts`.
    runtime.runPromise(Effect.exit(effect));

  const sqlOf = <A>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown, never>) =>
    Effect.flatMap(SqlClient.SqlClient, f);

  it("refuses a campaign written with no participation row", async () => {
    const refused = await attempt(
      sqlOf(
        (sql) =>
          sql`insert into campaign ${sql.insert({
            group_id: fixture.campaign.contextId,
            creator_account_id: fixture.dm.accountId,
            name: "No DM",
          })}`,
      ),
    );

    expect(refused._tag).toBe("Failure");
  });

  it("accepts a campaign and its owner's membership in one transaction", async () => {
    // Which is what `Campaigns.create` does, and the reason the key is
    // deferred rather than immediate: two statements, and neither order is
    // legal if the check fires at once.
    const accepted = await attempt(
      sqlOf((sql) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* sql<{ readonly id: string }>`
              insert into campaign ${sql.insert({
                group_id: fixture.campaign.contextId,
                creator_account_id: fixture.dm.accountId,
                name: "With a DM",
              })}
              returning id
            `;
            yield* sql`
              insert into campaign_member ${sql.insert({
                campaign_id: rows[0]!.id,
                group_id: fixture.campaign.contextId,
                account_id: fixture.dm.accountId,
              })}
            `;
          }),
        ),
      ),
    );

    expect(accepted._tag).toBe("Success");
  });

  it("refuses revoking or deleting the creator's own participation", async () => {
    // Both on the *referenced* side of the key, so both are refused on the
    // spot rather than at some later commit — which is the behaviour you want
    // from a statement typed into `psql` at two in the morning. There is no
    // demotion to refuse: there is no role column left to demote through, and
    // `schema.test.ts` fails if one reappears.
    const revoked = await attempt(
      sqlOf(
        (sql) =>
          sql`update campaign_member set revoked_at = now() where campaign_id = ${fixture.campaign.id}`,
      ),
    );
    const deleted = await attempt(
      sqlOf(
        (sql) =>
          sql`delete from campaign_member where campaign_id = ${fixture.campaign.id} and account_id = ${fixture.dm.accountId}`,
      ),
    );

    expect(revoked._tag).toBe("Failure");
    expect(deleted._tag).toBe("Failure");

    // …and the DM can still write, so the refusals above kept something real.
    const still = await runtime.runPromise(
      withActor(fixture.dm)(
        Effect.flatMap(Campaigns, (r) => r.update(fixture.campaign.id, { partyName: "Gilded" })),
      ),
    );
    expect(still.partyName).toBe("Gilded");
  });

  it("lets a player member leave, and deletes the campaign with its members", async () => {
    // The other direction, so the key is not simply refusing everything. A
    // player leaving is an ordinary act; the owner leaving is not.
    const gone = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const campaign = yield* withActor(fixture.dm)(createCampaign({ name: "A table to leave" }));
        const guest = yield* anAccount("Pim");
        yield* sql`
          insert into group_member ${sql.insert({
            group_id: campaign.contextId,
            account_id: guest.accountId,
          })}
        `;
        yield* sql`
          insert into campaign_member ${sql.insert({
            campaign_id: campaign.id,
            group_id: campaign.contextId,
            account_id: guest.accountId,
          })}
        `;
        const left = yield* sql`
          delete from campaign_member where account_id = ${guest.accountId}
        `.pipe(Effect.exit);
        const removed = yield* sql`delete from campaign where id = ${campaign.id}`.pipe(
          Effect.exit,
        );
        const remaining = yield* sql<{ readonly count: number }>`
          select count(*)::int as count from campaign_member
          where campaign_id = ${campaign.id}
        `;
        return { left: left._tag, removed: removed._tag, remaining: remaining[0]!.count };
      }).pipe(Effect.orDie),
    );

    expect(gone).toEqual({ left: "Success", removed: "Success", remaining: 0 });
  });
});

describe("a stranger reads nothing", () => {
  it("has a shipped read named for every content table", async () => {
    // The guard on the guard, and the thing that makes the fifteenth table
    // fail loudly rather than silently go unchecked.
    const tables = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql<{ readonly table_name: string }>`
          select table_name from information_schema.tables
          where table_schema = 'public'
            and table_name not in (
              'ability_score',
              'account',
              'campaign_member',
              'character_resource_request',
              'group_invite',
              'group_member',
              'hob_direct_resource_update',
              'play_group',
              'character_option_ability_bonus',
              'character_option_equipment_reference',
              'character_option_language',
              'character_option_proficiency',
              'character_option_subrace',
              'character_option_trait',
              'condition',
              'creature_armor_equipment',
              'creature_condition_immunity',
              'creature_damage_type',
              'creature_form',
              'creature_proficiency',
              'creature_spell',
              'damage_type',
              'effect_sql_migrations',
              'equipment_category',
              'equipment_content',
              'equipment_property',
              'feat_description',
              'feat_prerequisite_ability_score',
              'feat_prerequisite_group',
              'language',
              'magic_item_rarity',
              'magic_item_variant',
              'magic_school',
              'proficiency',
              'racial_trait_damage_type',
              'racial_trait_proficiency',
              'rule_choice_ability',
              'rule_choice_group',
              'rule_choice_language',
              'rule_choice_proficiency',
              'rule_choice_trait',
              'skill',
              'spell_class',
              'spell_damage_type',
              'spell_subclass',
              'weapon_property'
            )
          order by table_name
        `;
        return rows.map((row) => row.table_name);
      }).pipe(Effect.orDie),
    );

    expect(Object.keys(READS).sort()).toEqual(tables);
  });

  for (const [table, read] of Object.entries(READS)) {
    it(`gives ${table} to its DM and nothing at all to a stranger`, async () => {
      const mine = await runtime.runPromise(
        withActor(fixture.dm)(read(fixture)).pipe(Effect.result),
      );
      const theirs = await runtime.runPromise(
        withActor(fixture.stranger)(read(fixture)).pipe(Effect.result),
      );

      // The fixture really has something to miss — otherwise "nothing" is
      // trivially true and this file proves less than it appears to.
      expect(mine._tag, `the DM's own read of ${table} failed`).toBe("Success");
      expect(
        mine._tag === "Success" ? mine.success.length : 0,
        `${table} has no row for a stranger to miss`,
      ).toBeGreaterThan(0);

      // Either a `NotFound` — a read that names an unreachable parent says so
      // rather than returning an empty list that reads as "there is nothing
      // here" — or no rows. Never a `Forbidden`: "it exists but is not yours"
      // is itself a disclosure.
      if (theirs._tag === "Success") {
        expect(theirs.success, `${table} leaked rows to a stranger`).toEqual([]);
      } else {
        expect(theirs.failure._tag, `${table} refused a stranger with the wrong error`).toBe(
          "NotFound",
        );
      }
    });
  }
});

describe("what an account is before anybody invites it", () => {
  it("gives a machine token an actor with no role on it at all", async () => {
    // The retrofit's load-bearing property, restated as an assertion because it
    // is otherwise only visible as the absence of a compile error. A role on
    // the credential could not be right: a person is the DM of one table and a
    // player at another on the same one.
    const actor = await runtime.runPromise(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const issued = yield* accounts.issue("Jo");
        return yield* accounts.actorForToken(issued.token);
      }).pipe(Effect.orDie),
    );

    expect(actor._tag).toBe("Some");
    expect(actor._tag === "Some" ? Object.keys(actor.value).sort() : []).toEqual([
      "accountId",
      "scope",
    ]);
    expect(actor._tag === "Some" ? actor.value.scope : null).toEqual({ _tag: "account" });
  });

  it("makes every campaign an uninvited account reaches one it created", async () => {
    // The other participation writer now exists — `Invites.redeem` and the
    // creator's `Memberships.add` — but both run when somebody is deliberately
    // admitted. So an account nobody has invited participates only in
    // campaigns it created, which is what keeps a campaign's own creation from
    // quietly acquiring players. `invites.test.ts` pins the redeemed half.
    const rows = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{ readonly is_creator: boolean; readonly count: number }>`
          select (campaign.creator_account_id = campaign_member.account_id) as is_creator,
                 count(*)::int as count
          from campaign_member
          join campaign on campaign.id = campaign_member.campaign_id
          join account on account.id = campaign_member.account_id
          where account.name in ('Ada', 'Bo', 'Jo')
          group by 1
        `;
      }).pipe(Effect.orDie),
    );

    expect(rows.map((row) => row.is_creator)).toEqual([true]);
  });
});
