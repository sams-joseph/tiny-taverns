import {
  type Actor,
  type CampaignId,
  CurrentActor,
  Heartbeat,
  type LiveEvent,
  type NotFound,
  PlayerLiveHeartbeat,
  type PlayerLiveEvent,
  type SessionEvent,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Duration, Effect, Layer, Result, Schedule, Stream } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Accounts } from "./Accounts.js";
import { Hob } from "./assistant/Hob.js";
import { NpcAgent } from "./assistant/NpcAgent.js";
import { liveHeartbeatSeconds } from "./Config.js";
import { Health } from "./Health.js";
import { LiveEvents } from "./live/LiveEvents.js";
import { Beats } from "./repo/Beats.js";
import { Campaigns } from "./repo/Campaigns.js";
import { GroupHistory } from "./repo/GroupHistory.js";
import { LibraryShares } from "./repo/LibraryShares.js";
import { Groups } from "./repo/Groups.js";
import { Characters } from "./repo/Characters.js";
import { Party } from "./repo/Party.js";
import { ClassProgression } from "./repo/ClassProgression.js";
import { Combatants } from "./repo/Combatants.js";
import { Creatures } from "./repo/Creatures.js";
import { Options } from "./repo/Options.js";
import { type CampaignCreatorActor, CampaignCreatorActors } from "./repo/CreatorActor.js";
import { EncounterCreatures } from "./repo/EncounterCreatures.js";
import { EncounterRuns } from "./repo/EncounterRuns.js";
import { Encounters } from "./repo/Encounters.js";
import { EquipmentRepo } from "./repo/Equipment.js";
import { Feats } from "./repo/Feats.js";
import { HobDirectWrites } from "./repo/HobDirectWrites.js";
import { HobThreads } from "./repo/HobThreads.js";
import { Invites } from "./repo/Invites.js";
import { MagicItems } from "./repo/MagicItems.js";
import { Memberships } from "./repo/Memberships.js";
import { Notes } from "./repo/Notes.js";
import { NpcKnowledge } from "./repo/NpcKnowledge.js";
import { NpcMemories } from "./repo/NpcMemories.js";
import { NpcProposals } from "./repo/NpcProposals.js";
import { NpcAwareness } from "./repo/NpcAwareness.js";
import { NpcFollowUps } from "./repo/NpcFollowUp.js";
import { Npcs } from "./repo/Npcs.js";
import { NpcThreads } from "./repo/NpcThreads.js";
import { PlayerTable } from "./repo/PlayerTable.js";
import { PrepItems } from "./repo/PrepItems.js";
import { Proposals } from "./repo/Proposals.js";
import { Recap } from "./repo/Recap.js";
import { RuleArticles } from "./repo/RuleArticles.js";
import { Rolls } from "./repo/Rolls.js";
import { Search } from "./repo/Search.js";
import { SessionEvents } from "./repo/SessionEvents.js";
import { Spells } from "./repo/Spells.js";
import { Sessions } from "./repo/Sessions.js";

/**
 * Handlers for every group in `TavernsApi`.
 *
 * They are thin on purpose. Authorization is not here — it is the group's
 * declared middleware. Visibility is not here either — it is in the repository's
 * `WHERE` clause. A handler that forgot to filter is not a bug that can be
 * written, because a handler has nothing to filter with.
 *
 * Each group resolves its services in the build effect rather than per request,
 * which keeps the service a plain layer requirement instead of a request-level
 * one.
 */

/**
 * The DM gate for the three live groups, resolved once per group build.
 *
 * `runs`, `combatants` and `live` are the endpoints whose rows differ for a
 * player, and their repositories take a `CampaignCreatorActor` rather than a campaign id —
 * so this is the only expression in `handlers.ts` that turns a path segment
 * into one, and a handler that tried to skip it would have no campaign to pass.
 * See `repo/CampaignCreatorActor.ts`.
 *
 * The campaign id is named once per handler, which is what keeps the proof and
 * the read talking about the same table: there is no second id for it to
 * disagree with.
 */
const asDmOf = Effect.map(
  CampaignCreatorActors,
  (dmActors) =>
    <A, E, R>(
      campaignId: CampaignId,
      read: (dm: CampaignCreatorActor) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | NotFound, R | CurrentActor> =>
      Effect.flatMap(dmActors.of(campaignId), read),
);

const HealthLive = HttpApiBuilder.group(
  TavernsApi,
  "health",
  Effect.fnUntraced(function* (handlers) {
    const health = yield* Health;
    return handlers.handle("check", () => health.check);
  }),
);

const CampaignsLive = HttpApiBuilder.group(
  TavernsApi,
  "campaigns",
  Effect.fnUntraced(function* (handlers) {
    const campaigns = yield* Campaigns;
    const groups = yield* Groups;
    const asDm = yield* asDmOf;
    return handlers
      .handle("list", () => campaigns.list)
      .handle("create", ({ payload }) => campaigns.createStandalone(payload))
      .handle("promoteSharedWorld", ({ params, payload }) =>
        asDm(params.campaignId, (creator) => groups.promote(creator, payload)),
      )
      .handle("findById", ({ params }) => campaigns.findById(params.campaignId))
      .handle("update", ({ params, payload }) => campaigns.update(params.campaignId, payload))
      .handle("archive", ({ params }) => campaigns.archive(params.campaignId))
      .handle("restore", ({ params }) => campaigns.restore(params.campaignId));
  }),
);

/**
 * The endpoints that name no campaign — who this account is, which tables it is
 * at, which characters it plays across them, and the one write a player may
 * make.
 *
 * The two reads are `mine` on their repository and neither takes a proof: what a
 * credential already reaches is not a disclosure to the credential reaching it.
 * The narrowing to *your own* characters is in the predicate, not here — a
 * handler that filtered would be the leak pattern `repo/visibility.ts` exists
 * to prevent, and it has nothing to filter with.
 *
 * The three writes are as thin as the reads, which matters more here than
 * anywhere else in this file: they are the whole of what a non-DM may do to a
 * `character`, and a "while we are here, refuse a live column" block would be
 * the second place that rule lives. There is nothing to refuse.
 * `CharacterOwnUpdate` and `CharacterOwnCreate` have no field for a live column,
 * for `visibility` or for an account; `ownRowWritable` decides the row for the
 * PATCH and the DELETE, and `ensureCampaignReadable` decides where the POST may
 * put one.
 */
const MeLive = HttpApiBuilder.group(
  TavernsApi,
  "me",
  Effect.fnUntraced(function* (handlers) {
    const accounts = yield* Accounts;
    const memberships = yield* Memberships;
    const characters = yield* Characters;
    const spells = yield* Spells;
    return (
      handlers
        // The whole handler, and there is nothing for it to pass: `identity`
        // takes `CurrentActor` and no argument, so which account it answers
        // about is not a decision made here.
        .handle("identity", () => accounts.identity)
        // Two paths, one read, and the shelf named at each of them — which is
        // what makes "no existing read answers an archived campaign" a fact about
        // the URL rather than about a decoded default. See `repo/Memberships.ts`.
        .handle("campaigns", () => memberships.mine("live"))
        .handle("archivedCampaigns", () => memberships.mine("archived"))
        .handle("characters", () => characters.mine)
        .handle("characterSpells", ({ params }) => spells.forCharacter(params.characterId))
        .handle("updateCharacter", ({ params, payload }) =>
          characters.updateOwn(params.characterId, payload),
        )
        .handle("spendCharacterResource", ({ params, payload }) =>
          characters.spendResource(params.characterId, payload),
        )
        .handle("restCharacter", ({ params, payload }) =>
          characters.rest(params.characterId, payload),
        )
        // The one handler in this group whose path names a campaign, because an
        // insert has no row to derive one from. There is still nothing to check
        // here: `ensureCampaignReadable` refuses a campaign this credential does
        // not reach, and the owner is `CurrentActor`'s rather than an argument.
        .handle("createCharacter", ({ params, payload }) =>
          characters.createOwn(params.campaignId, payload),
        )
        .handle("deleteCharacter", ({ params }) => characters.removeOwn(params.characterId))
    );
  }),
);

/**
 * The roster, and the only handler here that spends a proof outside the live
 * groups and the recap.
 *
 * `Memberships` answers the same table from both ends — `mine` above with an
 * ordinary actor, `list` here with a `CampaignCreatorActor` — so this is the whole of the
 * fifth gate: a path segment becomes a proof, and there is no campaign id left
 * for the read to be given.
 */
const MembersLive = HttpApiBuilder.group(
  TavernsApi,
  "members",
  Effect.fnUntraced(function* (handlers) {
    const memberships = yield* Memberships;
    const asDm = yield* asDmOf;
    return handlers
      .handle("list", ({ params }) =>
        asDm(params.campaignId, (creator) => memberships.list(creator)),
      )
      .handle("add", ({ params, payload }) =>
        asDm(params.campaignId, (creator) => memberships.add(creator, payload.accountId)),
      )
      .handle("remove", ({ params }) =>
        asDm(params.campaignId, (creator) => memberships.remove(creator, params.accountId)),
      );
  }),
);

/**
 * Groups — the top-level container. As thin as everything else: who may found,
 * read, administer or populate a group is decided in `repo/Groups.ts` and
 * `repo/visibility.ts`, and campaign creation inside one is `Campaigns.create`
 * with the group from the path as its claim.
 */
const SharedWorldsLive = HttpApiBuilder.group(
  TavernsApi,
  "sharedWorlds",
  Effect.fnUntraced(function* (handlers) {
    const groups = yield* Groups;
    const campaigns = yield* Campaigns;
    return handlers
      .handle("list", () => groups.mine)
      .handle("create", ({ payload }) => groups.create(payload))
      .handle("findById", ({ params }) => groups.findById(params.worldId))
      .handle("update", ({ params, payload }) => groups.update(params.worldId, payload))
      .handle("archive", ({ params }) => groups.archive(params.worldId))
      .handle("restore", ({ params }) => groups.restore(params.worldId))
      .handle("campaigns", ({ params }) => groups.campaigns(params.worldId))
      .handle("createCampaign", ({ params, payload }) => campaigns.create(params.worldId, payload));
  }),
);

const SharedWorldMembersLive = HttpApiBuilder.group(
  TavernsApi,
  "sharedWorldMembers",
  Effect.fnUntraced(function* (handlers) {
    const groups = yield* Groups;
    return handlers.handle("list", ({ params }) => groups.members(params.worldId));
  }),
);

const CampaignInvitesLive = HttpApiBuilder.group(
  TavernsApi,
  "campaignInvites",
  Effect.fnUntraced(function* (handlers) {
    const invites = yield* Invites;
    const asDm = yield* asDmOf;
    return handlers
      .handle("list", ({ params }) =>
        asDm(params.campaignId, (creator) => invites.listForCampaign(creator)),
      )
      .handle("create", ({ params, payload }) =>
        asDm(params.campaignId, (creator) => invites.createForCampaign(creator, payload)),
      )
      .handle("revoke", ({ params }) =>
        asDm(params.campaignId, (creator) => invites.revokeForCampaign(creator, params.inviteId)),
      );
  }),
);

/**
 * The invitation page's read, and the only handler in the product outside
 * `health` with no actor above it.
 *
 * As thin as the rest, which matters more here than anywhere: an unauthenticated
 * endpoint is where a "just look up the campaign while we are here" block would
 * do real damage. There is nothing to look up with — the token is the only thing
 * this handler has, and what it discloses is decided in `repo/Invites.ts`.
 */
const InvitePreviewLive = HttpApiBuilder.group(
  TavernsApi,
  "invitePreview",
  Effect.fnUntraced(function* (handlers) {
    const invites = yield* Invites;
    return handlers.handle("read", ({ payload }) => invites.preview(payload.token));
  }),
);

/**
 * Accepting an invitation — the one write in the product that reaches a campaign
 * the caller is not yet a member of.
 *
 * It takes no campaign id and no account id, and neither is an omission the
 * handler makes: there is nowhere in the declaration to put one. The campaign is
 * the invitation's and the account is `CurrentActor`'s.
 */
const JoinLive = HttpApiBuilder.group(
  TavernsApi,
  "join",
  Effect.fnUntraced(function* (handlers) {
    const invites = yield* Invites;
    return handlers.handle("redeem", ({ payload }) => invites.redeem(payload.token));
  }),
);

const SessionsLive = HttpApiBuilder.group(
  TavernsApi,
  "sessions",
  Effect.fnUntraced(function* (handlers) {
    const sessions = yield* Sessions;
    return handlers
      .handle("list", ({ params }) => sessions.list(params.campaignId))
      .handle("create", ({ params, payload }) => sessions.create(params.campaignId, payload))
      .handle("findById", ({ params }) => sessions.findById(params.campaignId, params.sessionId))
      .handle("update", ({ params, payload }) =>
        sessions.update(params.campaignId, params.sessionId, payload),
      )
      .handle("remove", ({ params }) => sessions.remove(params.campaignId, params.sessionId));
  }),
);

/**
 * The group's chronicle. `fromRecap` is the one handler here that spends a
 * proof: sharing a played night is the campaign creator's act, so the payload
 * campaign becomes a `CampaignCreatorActor` exactly as the live groups do it,
 * and the repository checks the proof's group against the path.
 */
const SharedWorldHistoryLive = HttpApiBuilder.group(
  TavernsApi,
  "sharedWorldHistory",
  Effect.fnUntraced(function* (handlers) {
    const history = yield* GroupHistory;
    const asDm = yield* asDmOf;
    return handlers
      .handle("list", ({ params }) => history.list(params.worldId))
      .handle("create", ({ params, payload }) => history.create(params.worldId, payload))
      .handle("fromRecap", ({ params, payload }) =>
        asDm(payload.campaignId, (creator) =>
          history.fromRecap(params.worldId, creator, payload.sessionId),
        ),
      )
      .handle("summary", ({ params }) => history.summary(params.worldId));
  }),
);

const PartyLive = HttpApiBuilder.group(
  TavernsApi,
  "party",
  Effect.fnUntraced(function* (handlers) {
    const party = yield* Party;
    return handlers
      .handle("list", ({ params }) => party.list(params.campaignId))
      .handle("join", ({ params, payload }) => party.join(params.campaignId, payload))
      .handle("update", ({ params, payload }) =>
        party.update(params.campaignId, params.campaignCharacterId, payload),
      )
      .handle("leave", ({ params }) => party.leave(params.campaignId, params.campaignCharacterId))
      .handle("damage", ({ params, payload }) =>
        party.damage(params.campaignId, params.campaignCharacterId, payload),
      );
  }),
);

const NotesLive = HttpApiBuilder.group(
  TavernsApi,
  "notes",
  Effect.fnUntraced(function* (handlers) {
    const notes = yield* Notes;
    return handlers
      .handle("list", ({ params, query }) => notes.list(params.campaignId, query))
      .handle("create", ({ params, payload }) => notes.create(params.campaignId, payload))
      .handle("findById", ({ params }) => notes.findById(params.campaignId, params.noteId))
      .handle("update", ({ params, payload }) =>
        notes.update(params.campaignId, params.noteId, payload),
      )
      .handle("remove", ({ params }) => notes.remove(params.campaignId, params.noteId));
  }),
);

const EncountersLive = HttpApiBuilder.group(
  TavernsApi,
  "encounters",
  Effect.fnUntraced(function* (handlers) {
    const encounters = yield* Encounters;
    return handlers
      .handle("list", ({ params, query }) => encounters.list(params.campaignId, query))
      .handle("create", ({ params, payload }) => encounters.create(params.campaignId, payload))
      .handle("findById", ({ params }) =>
        encounters.findById(params.campaignId, params.encounterId),
      )
      .handle("update", ({ params, payload }) =>
        encounters.update(params.campaignId, params.encounterId, payload),
      )
      .handle("remove", ({ params }) => encounters.remove(params.campaignId, params.encounterId));
  }),
);

/**
 * What a campaign can use of the creature corpus — the encounter picker's
 * list, and the by-id read that resolves internal instances a roster or a
 * fight already names. The campaign-copy management endpoints are gone with
 * the 2026-09-02 instancing decision; the instances are minted inside
 * `EncounterCreatures.create` and managed by nobody.
 */
const CreaturesLive = HttpApiBuilder.group(
  TavernsApi,
  "creatures",
  Effect.fnUntraced(function* (handlers) {
    const creatures = yield* Creatures;
    return handlers
      .handle("list", ({ params, query }) => creatures.list(params.campaignId, query))
      .handle("findById", ({ params }) => creatures.findById(params.campaignId, params.creatureId));
  }),
);

/**
 * A campaign's rules vocabulary — the classes, races and backgrounds a
 * character at this table is built from.
 *
 * **The only list in the product a *player* reads to fill in a control.** The
 * create form's pickers are this read: the shared bundle, the reader's own
 * Library, and originals explicitly shared to the campaign's group. There is
 * nothing else in the group — authoring lives in the Library, sharing lives on
 * the group, and a campaign holds no managed copies.
 */
const CharacterOptionsLive = HttpApiBuilder.group(
  TavernsApi,
  "options",
  Effect.fnUntraced(function* (handlers) {
    const options = yield* Options;
    return handlers.handle("list", ({ params, query }) => options.list(params.campaignId, query));
  }),
);

/**
 * The Library — where an original is authored, and the originals a campaign's
 * copies are made from.
 *
 * The same `Creatures` service as the group above, because it is the same table
 * and one table gets one mapper. What differs is the pair of predicates the
 * methods compose, and that difference is in the repository where every other
 * one is: **no handler here has a campaign to pass and none takes an account
 * id**, which is what makes "one account's Library never shows or accepts
 * another's monsters" a property of `libraryRowReadable` / `libraryRowWritable`
 * rather than of anything on this page. The owner comes from `CurrentActor`,
 * inside the repository, and there is nowhere in these signatures to put one.
 */
const LibraryLive = HttpApiBuilder.group(
  TavernsApi,
  "library",
  Effect.fnUntraced(function* (handlers) {
    const creatures = yield* Creatures;
    // Two tables in one group, because the Library is one *place*: an account's
    // originals, whatever kind they are. Two repositories rather than one for
    // the reason there are two tables — one table gets one mapper — and the
    // pair of predicates each composes is the same pair.
    const options = yield* Options;
    const progression = yield* ClassProgression;
    const spells = yield* Spells;
    const equipment = yield* EquipmentRepo;
    const magicItems = yield* MagicItems;
    const ruleArticles = yield* RuleArticles;
    const feats = yield* Feats;
    const npcs = yield* Npcs;
    return handlers
      .handle("list", ({ query }) => creatures.library(query))
      .handle("environments", () => creatures.libraryEnvironments())
      .handle("creatureFacets", () => creatures.libraryFacets())
      .handle("create", ({ payload }) => creatures.libraryCreate(payload))
      .handle("findById", ({ params }) => creatures.libraryFindById(params.creatureId))
      .handle("update", ({ params, payload }) =>
        creatures.libraryUpdate(params.creatureId, payload),
      )
      .handle("remove", ({ params }) => creatures.libraryRemove(params.creatureId))
      .handle("optionVocabulary", () => options.libraryVocabulary())
      .handle("options", ({ query }) => options.library(query))
      .handle("createOption", ({ payload }) => options.libraryCreate(payload))
      .handle("findOption", ({ params }) => options.libraryFindById(params.optionId))
      .handle("optionProgression", ({ params }) => progression.libraryRead(params.optionId))
      .handle("updateOption", ({ params, payload }) =>
        options.libraryUpdate(params.optionId, payload),
      )
      .handle("removeOption", ({ params }) => options.libraryRemove(params.optionId))
      .handle("ruleArticles", ({ query }) => ruleArticles.library(query))
      .handle("createRuleArticle", ({ payload }) => ruleArticles.libraryCreate(payload))
      .handle("findRuleArticle", ({ params }) => ruleArticles.libraryFindById(params.ruleArticleId))
      .handle("updateRuleArticle", ({ params, payload }) =>
        ruleArticles.libraryUpdate(params.ruleArticleId, payload),
      )
      .handle("removeRuleArticle", ({ params }) => ruleArticles.libraryRemove(params.ruleArticleId))
      .handle("feats", ({ query }) => feats.library(query))
      .handle("createFeat", ({ payload }) => feats.libraryCreate(payload))
      .handle("findFeat", ({ params }) => feats.libraryFindById(params.featId))
      .handle("updateFeat", ({ params, payload }) => feats.libraryUpdate(params.featId, payload))
      .handle("removeFeat", ({ params }) => feats.libraryRemove(params.featId))
      .handle("spells", ({ query }) => spells.library(query))
      .handle("createSpell", ({ payload }) => spells.libraryCreate(payload))
      .handle("findSpell", ({ params }) => spells.libraryFindById(params.spellId))
      .handle("updateSpell", ({ params, payload }) => spells.libraryUpdate(params.spellId, payload))
      .handle("removeSpell", ({ params }) => spells.libraryRemove(params.spellId))
      .handle("equipment", ({ query }) => equipment.library(query))
      .handle("createEquipment", ({ payload }) => equipment.libraryCreate(payload))
      .handle("findEquipment", ({ params }) => equipment.libraryFindById(params.equipmentId))
      .handle("updateEquipment", ({ params, payload }) =>
        equipment.libraryUpdate(params.equipmentId, payload),
      )
      .handle("removeEquipment", ({ params }) => equipment.libraryRemove(params.equipmentId))
      .handle("npcs", ({ query }) => npcs.library(query))
      .handle("createNpc", ({ payload }) => npcs.libraryCreate(payload))
      .handle("findNpc", ({ params }) => npcs.libraryFindById(params.npcId))
      .handle("updateNpc", ({ params, payload }) => npcs.libraryUpdate(params.npcId, payload))
      .handle("archiveNpc", ({ params }) => npcs.libraryArchive(params.npcId))
      .handle("restoreNpc", ({ params }) => npcs.libraryRestore(params.npcId))
      .handle("removeNpc", ({ params }) => npcs.libraryRemove(params.npcId))
      .handle("magicItems", ({ query }) => magicItems.library(query))
      .handle("createMagicItem", ({ payload }) => magicItems.libraryCreate(payload))
      .handle("findMagicItem", ({ params }) => magicItems.libraryFindById(params.magicItemId))
      .handle("updateMagicItem", ({ params, payload }) =>
        magicItems.libraryUpdate(params.magicItemId, payload),
      )
      .handle("removeMagicItem", ({ params }) => magicItems.libraryRemove(params.magicItemId));
  }),
);

const EncounterCreaturesLive = HttpApiBuilder.group(
  TavernsApi,
  "encounterCreatures",
  Effect.fnUntraced(function* (handlers) {
    const roster = yield* EncounterCreatures;
    return handlers
      .handle("list", ({ params }) => roster.list(params.campaignId, params.encounterId))
      .handle("create", ({ params, payload }) =>
        roster.create(params.campaignId, params.encounterId, payload),
      )
      .handle("update", ({ params, payload }) =>
        roster.update(params.campaignId, params.encounterId, params.encounterCreatureId, payload),
      )
      .handle("remove", ({ params }) =>
        roster.remove(params.campaignId, params.encounterId, params.encounterCreatureId),
      );
  }),
);

const PrepLive = HttpApiBuilder.group(
  TavernsApi,
  "prep",
  Effect.fnUntraced(function* (handlers) {
    const prep = yield* PrepItems;
    return handlers
      .handle("list", ({ params }) => prep.list(params.campaignId, params.sessionId))
      .handle("create", ({ params, payload }) =>
        prep.create(params.campaignId, params.sessionId, payload),
      )
      .handle("findById", ({ params }) =>
        prep.findById(params.campaignId, params.sessionId, params.prepItemId),
      )
      .handle("update", ({ params, payload }) =>
        prep.update(params.campaignId, params.sessionId, params.prepItemId, payload),
      )
      .handle("remove", ({ params }) =>
        prep.remove(params.campaignId, params.sessionId, params.prepItemId),
      );
  }),
);

const BeatsLive = HttpApiBuilder.group(
  TavernsApi,
  "beats",
  Effect.fnUntraced(function* (handlers) {
    const beats = yield* Beats;
    return handlers
      .handle("list", ({ params, query }) => beats.list(params.campaignId, params.sessionId, query))
      .handle("create", ({ params, payload }) =>
        beats.create(params.campaignId, params.sessionId, payload),
      )
      .handle("findById", ({ params }) =>
        beats.findById(params.campaignId, params.sessionId, params.beatId),
      )
      .handle("update", ({ params, payload }) =>
        beats.update(params.campaignId, params.sessionId, params.beatId, payload),
      )
      .handle("remove", ({ params }) =>
        beats.remove(params.campaignId, params.sessionId, params.beatId),
      );
  }),
);

/**
 * The recap: what happened on the night.
 *
 * As thin as every other handler here, and that is worth noticing rather than
 * assuming — a recap is the read most likely to grow assembly logic in the
 * handler, because it is the one that reaches five tables. It does not: the
 * assembly is a repository read, so the assistant's `sessionRecap` tool will
 * call exactly what this calls.
 *
 * **Two paths, and the DM's is the gated one.** `read` goes through `asDmOf`
 * like the three live groups, because a `SessionRecap` carries whole
 * `Combatant` values; `readAsPlayer` answers the narrower `PlayerSessionRecap`
 * to any member. Which one a caller reaches is decided by the route they asked
 * for and the proof they can produce — there is no branch here, and nothing in
 * this file that could forget one.
 */
const RecapLive = HttpApiBuilder.group(
  TavernsApi,
  "recap",
  Effect.fnUntraced(function* (handlers) {
    const recap = yield* Recap;
    const asDm = yield* asDmOf;
    return handlers
      .handle("read", ({ params }) =>
        asDm(params.campaignId, (dm) => recap.read(dm, params.sessionId)),
      )
      .handle("readAsPlayer", ({ params }) =>
        recap.readAsPlayer(params.campaignId, params.sessionId),
      );
  }),
);

/**
 * What is on this table right now, to a player.
 *
 * The thinnest handler in the file, and deliberately so: everything this read
 * decides is decided in `repo/PlayerTable.ts` (which rows) and in
 * `PlayerLiveTable` (which fields). There is no branch on who is asking — a DM
 * calling it gets the same narrow answer, which is how *"what will my players
 * see"* stays one implementation.
 */
const PlayerTableLive = HttpApiBuilder.group(
  TavernsApi,
  "table",
  Effect.fnUntraced(function* (handlers) {
    const table = yield* PlayerTable;
    const rolls = yield* Rolls;
    const live = yield* LiveEvents;
    const heartbeat = Duration.seconds(yield* Effect.orDie(liveHeartbeatSeconds));

    const tickStream = (
      actor: Actor,
      campaignId: CampaignId,
      sessionId: SessionId,
      resume: number,
    ) => {
      let cursor = resume;
      const pull = Effect.gen(function* () {
        const drained: Array<number> = [];
        for (;;) {
          const page = yield* table.ticks(actor, campaignId, sessionId, cursor, PAGE);
          if (page.length === 0) break;
          cursor = page[page.length - 1]!;
          drained.push(...page);
          if (page.length < PAGE) break;
        }
        return drained;
      });
      const ticksFor = (rows: ReadonlyArray<number>): ReadonlyArray<PlayerLiveEvent> =>
        rows.map((seq): PlayerLiveEvent => ({
          id: String(seq),
          event: "tick",
          data: { tick: "session" },
        }));
      const asEvents = Stream.flatMap((rows: ReadonlyArray<number>) =>
        Stream.fromIterable(ticksFor(rows)),
      );
      const body = Stream.concat(
        Stream.fromEffect(Effect.orDie(pull)).pipe(asEvents),
        live.subscribe(sessionId).pipe(
          Stream.mapEffect(() => Effect.orDie(pull)),
          Stream.flatMap((rows) =>
            Stream.fromIterable(
              rows.length === 0
                ? [
                    {
                      id: String(cursor),
                      event: "tick",
                      data: { tick: "session" },
                    } satisfies PlayerLiveEvent,
                  ]
                : ticksFor(rows),
            ),
          ),
        ),
      );
      const heartbeats = Stream.fromSchedule(Schedule.spaced(heartbeat)).pipe(
        Stream.map((): PlayerLiveEvent => ({
          id: undefined,
          event: "heartbeat",
          data: new PlayerLiveHeartbeat({ seq: cursor }),
        })),
      );
      return Stream.merge(body, heartbeats);
    };

    return handlers
      .handle("read", ({ params }) => table.read(params.campaignId))
      .handle("rolls", ({ params, query }) =>
        rolls.listForCharacter(params.campaignId, params.sessionId, params.characterId, query),
      )
      .handle("events", ({ params, query, request }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const resume = query.since ?? Number(request.headers["last-event-id"] ?? Number.NaN);
          const cursor = Number.isSafeInteger(resume) && resume >= 0 ? resume : 0;
          yield* table.ticks(actor, params.campaignId, params.sessionId, cursor, 1);
          return tickStream(actor, params.campaignId, params.sessionId, cursor);
        }),
      );
  }),
);

const RollsLive = HttpApiBuilder.group(
  TavernsApi,
  "rolls",
  Effect.fnUntraced(function* (handlers) {
    const rolls = yield* Rolls;
    return handlers
      .handle("create", ({ params, payload }) => rolls.create(params.campaignId, payload))
      .handle("list", ({ params, query }) => rolls.list(params.campaignId, params.sessionId, query))
      .handle("findById", ({ params }) =>
        rolls.findById(params.campaignId, params.sessionId, params.rollId),
      );
  }),
);

const SearchLive = HttpApiBuilder.group(
  TavernsApi,
  "search",
  Effect.fnUntraced(function* (handlers) {
    const search = yield* Search;
    return handlers.handle("search", ({ params, query }) =>
      search.search(params.campaignId, query),
    );
  }),
);

/**
 * Hob.
 *
 * As thin as the rest, which is the point worth noticing here more than
 * anywhere: an assistant is the endpoint most likely to grow a "gather the
 * context" block in its handler, and there is none. `Hob.ask` returns the
 * stream and every fact in it arrives through an actor-scoped repository call
 * inside the toolkit — see `assistant/toolkit.ts`.
 *
 * `ask` is a `POST` that answers with a stream, and the ordering is the same one
 * `live.events` depends on: `Hob.ask`'s `Effect` half resolves the actor and
 * reads the campaign, so an unreachable campaign is a real 404 and an
 * unconfigured server a real 503, both before the response body opens.
 *
 * `accept` is the one endpoint in the product that produces an
 * `origin = 'assistant'` row, and it is as thin as everything else here for the
 * same reason: the proposal it materialises is on the turn, not in the request.
 * Note it is `Proposals` and not `Hob` — accepting is not asking, it works with
 * no model configured at all, and giving the assistant service a write path
 * would be the wrong shape to leave behind.
 */
const HobLive = HttpApiBuilder.group(
  TavernsApi,
  "hob",
  Effect.fnUntraced(function* (handlers) {
    const hob = yield* Hob;
    const threads = yield* HobThreads;
    const proposals = yield* Proposals;
    const dmActors = yield* CampaignCreatorActors;

    /**
     * Whose conversations a *listing* reaches — **one read, and the same
     * question `Hob.ask` asks itself for the panel.**
     *
     * A DM's panel resumes the campaign's own thread and a player's their own,
     * and the two sets are disjoint by predicate (`repo/visibility.ts`), so the
     * reach is not a filter over one set — it is which set the panel shows this
     * caller. It is derived from the `CampaignCreatorActor` proof rather than
     * from a role on the actor, because `Actor` carries no role and cannot: a
     * person is the DM of one table and a player at another on one credential.
     *
     * A failure is `"own"` rather than an error, and that is safe because it is
     * never the final answer: the predicate underneath refuses a caller who is
     * neither, with the ordinary `NotFound`. So a stranger's campaign is a 404
     * from the read, exactly as it was before there were two reaches.
     *
     * **`turns` and `accept` do not use it.** A creator holds threads in both
     * sets now — the panel's, and drafting threads of their own (see
     * `HobAsk.intent`) — so for an operation that *names* a thread, the thread's
     * own shape is the answer and the proof is the wrong question:
     * `threads.reachOf` reads it off the row, behind the disjunction of the two
     * complete predicates. Derived-from-the-proof here, a creator could draft a
     * character and then be refused the accept that keeps it.
     */
    const reachAt = (campaignId: CampaignId) =>
      Effect.map(Effect.result(dmActors.of(campaignId)), (proof) =>
        Result.isSuccess(proof) ? ("dm" as const) : ("own" as const),
      );

    return handlers
      .handle("status", ({ params }) => hob.status(params.campaignId))
      .handle("ask", ({ params, payload }) => hob.ask(params.campaignId, payload))
      .handle("threads", ({ params }) =>
        Effect.flatMap(reachAt(params.campaignId), (reach) =>
          threads.list(reach, params.campaignId),
        ),
      )
      .handle("turns", ({ params }) =>
        Effect.flatMap(threads.reachOf(params.campaignId, params.threadId), (reach) =>
          threads.turns(reach, params.campaignId, params.threadId),
        ),
      )
      .handle("accept", ({ params }) =>
        Effect.flatMap(threads.reachOf(params.campaignId, params.threadId), (reach) =>
          proposals.accept(reach, params.campaignId, params.threadId, params.turnId),
        ),
      );
  }),
);

/**
 * The campaign's cast.
 *
 * Creator Cast/profile/knowledge/memory/proposal handlers mint the
 * `CampaignCreatorActor` proof first. Player-direct and session-shared handlers
 * deliberately do not: they go through the player projection and thread
 * predicates, so Talk privately remains one player's own transcript and Open at
 * the table remains the live-session thread. `rehearse`, `talk` and
 * `sessionTalk` keep `hob.ask`'s ordering: the `Effect` half resolves reach, the
 * NPC and the thread before the stream opens, so a denial is a real 404 and an
 * unconfigured server a real 503.
 */
const NpcsLive = HttpApiBuilder.group(
  TavernsApi,
  "npcs",
  Effect.fnUntraced(function* (handlers) {
    const npcs = yield* Npcs;
    const knowledge = yield* NpcKnowledge;
    const memories = yield* NpcMemories;
    const proposals = yield* NpcProposals;
    const awareness = yield* NpcAwareness;
    const followUps = yield* NpcFollowUps;
    const threads = yield* NpcThreads;
    const agent = yield* NpcAgent;
    const creators = yield* CampaignCreatorActors;

    const asCreator = <A, E, R>(
      campaignId: CampaignId,
      use: (creator: CampaignCreatorActor) => Effect.Effect<A, E, R>,
    ) => Effect.flatMap(creators.of(campaignId), use);

    return handlers
      .handle("list", ({ params, query }) =>
        asCreator(params.campaignId, (creator) => npcs.list(creator, query)),
      )
      .handle("create", ({ params, payload }) =>
        asCreator(params.campaignId, (creator) => npcs.create(creator, payload)),
      )
      .handle("sources", ({ params }) =>
        asCreator(params.campaignId, (creator) => npcs.sourcesForCampaign(creator)),
      )
      .handle("copyFromSource", ({ params }) =>
        asCreator(params.campaignId, (creator) => npcs.copyFromSource(creator, params.sourceNpcId)),
      )
      .handle("followUp", ({ params }) =>
        asCreator(params.campaignId, (creator) => followUps.pending(creator)),
      )
      .handle("findById", ({ params }) =>
        asCreator(params.campaignId, (creator) => npcs.findById(creator, params.npcId)),
      )
      .handle("update", ({ params, payload }) =>
        asCreator(params.campaignId, (creator) => npcs.update(creator, params.npcId, payload)),
      )
      .handle("archive", ({ params }) =>
        asCreator(params.campaignId, (creator) => npcs.archive(creator, params.npcId)),
      )
      .handle("restore", ({ params }) =>
        asCreator(params.campaignId, (creator) => npcs.restore(creator, params.npcId)),
      )
      .handle("rehearsal", ({ params }) => agent.status(params.campaignId, params.npcId))
      .handle("rehearse", ({ params, payload }) =>
        agent.rehearse(params.campaignId, params.npcId, payload),
      )
      .handle("threads", ({ params }) =>
        asCreator(params.campaignId, (creator) => threads.list(creator, params.npcId)),
      )
      .handle("turns", ({ params }) =>
        asCreator(params.campaignId, (creator) =>
          threads.turns(creator, params.npcId, params.threadId),
        ),
      )
      .handle("knowledge", ({ params }) =>
        asCreator(params.campaignId, (creator) => knowledge.list(creator, params.npcId)),
      )
      .handle("createKnowledge", ({ params, payload }) =>
        asCreator(params.campaignId, (creator) => knowledge.create(creator, params.npcId, payload)),
      )
      .handle("updateKnowledge", ({ params, payload }) =>
        asCreator(params.campaignId, (creator) =>
          knowledge.update(creator, params.npcId, params.factId, payload),
        ),
      )
      .handle("retireKnowledge", ({ params }) =>
        asCreator(params.campaignId, (creator) =>
          knowledge.retire(creator, params.npcId, params.factId),
        ),
      )
      .handle("memories", ({ params }) =>
        asCreator(params.campaignId, (creator) => memories.list(creator, params.npcId)),
      )
      .handle("draftMemory", ({ params, payload }) =>
        asCreator(params.campaignId, (creator) => memories.draft(creator, params.npcId, payload)),
      )
      .handle("updateMemory", ({ params, payload }) =>
        asCreator(params.campaignId, (creator) =>
          memories.update(creator, params.npcId, params.memoryId, payload),
        ),
      )
      .handle("approveMemory", ({ params }) =>
        asCreator(params.campaignId, (creator) =>
          memories.approve(creator, params.npcId, params.memoryId),
        ),
      )
      .handle("retireMemory", ({ params }) =>
        asCreator(params.campaignId, (creator) =>
          memories.retire(creator, params.npcId, params.memoryId),
        ),
      )
      .handle("resetMemories", ({ params }) =>
        asCreator(params.campaignId, (creator) => memories.reset(creator, params.npcId)),
      )
      .handle("proposals", ({ params }) =>
        asCreator(params.campaignId, (creator) => proposals.list(creator, params.npcId)),
      )
      .handle("acceptProposal", ({ params }) =>
        asCreator(params.campaignId, (creator) =>
          proposals.accept(creator, params.npcId, params.proposalId),
        ),
      )
      .handle("rejectProposal", ({ params, payload }) =>
        asCreator(params.campaignId, (creator) =>
          proposals.reject(creator, params.npcId, params.proposalId, payload),
        ),
      )
      .handle("awarenessCandidates", ({ params }) =>
        asCreator(params.campaignId, (creator) => awareness.list(creator, params.npcId)),
      )
      .handle("updateAwarenessCandidate", ({ params, payload }) =>
        asCreator(params.campaignId, (creator) =>
          awareness.update(creator, params.npcId, params.candidateId, payload),
        ),
      )
      .handle("approveAwarenessCandidate", ({ params, payload }) =>
        asCreator(params.campaignId, (creator) =>
          awareness.approve(creator, params.npcId, params.candidateId, payload),
        ),
      )
      .handle("rejectAwarenessCandidate", ({ params, payload }) =>
        asCreator(params.campaignId, (creator) =>
          awareness.reject(creator, params.npcId, params.candidateId, payload),
        ),
      )
      .handle("playerList", ({ params }) => npcs.playerList(params.campaignId))
      .handle("playerFindById", ({ params }) =>
        npcs.playerFindById(params.campaignId, params.npcId),
      )
      .handle("playerStatus", ({ params }) => agent.playerStatus(params.campaignId, params.npcId))
      .handle("playerThreads", ({ params }) => threads.playerList(params.campaignId, params.npcId))
      .handle("playerTurns", ({ params }) =>
        threads.playerTurns(params.campaignId, params.npcId, params.threadId),
      )
      .handle("talk", ({ params, payload }) => agent.talk(params.campaignId, params.npcId, payload))
      .handle("sessionList", ({ params }) =>
        threads.sessionList(params.campaignId, params.sessionId),
      )
      .handle("sessionMonitor", ({ params }) =>
        asCreator(params.campaignId, (creator) => agent.sessionMonitor(creator, params.sessionId)),
      )
      .handle("openSession", ({ params }) =>
        asCreator(params.campaignId, (creator) =>
          threads.openSession(creator, params.npcId, params.sessionId),
        ),
      )
      .handle("pauseSession", ({ params }) =>
        asCreator(params.campaignId, (creator) =>
          threads.pauseSession(creator, params.npcId, params.sessionId),
        ),
      )
      .handle("resumeSession", ({ params }) =>
        asCreator(params.campaignId, (creator) =>
          threads.resumeSession(creator, params.npcId, params.sessionId),
        ),
      )
      .handle("closeSession", ({ params }) =>
        asCreator(params.campaignId, (creator) =>
          threads.closeSession(creator, params.npcId, params.sessionId),
        ),
      )
      .handle("sessionStatus", ({ params }) =>
        agent.sessionStatus(params.campaignId, params.sessionId, params.npcId),
      )
      .handle("sessionTurns", ({ params }) =>
        threads.sessionTurns(params.campaignId, params.sessionId, params.npcId),
      )
      .handle("sessionTalk", ({ params, payload }) =>
        agent.sessionTalk(params.campaignId, params.sessionId, params.npcId, payload),
      );
  }),
);

/**
 * Group Hob's handlers — the same five as the campaign surface, with one
 * reach: the group's conversation is the group's, so there is no proof to
 * resolve and no two sets to tell apart. `conversationReachable`'s `"sharedWorld"`
 * arm gates every thread read on live membership underneath.
 */
/** The Shared World's Library shelf. Reads and writes are the repository's whole story. */
const SharedWorldLibraryLive = HttpApiBuilder.group(
  TavernsApi,
  "sharedWorldLibrary",
  Effect.fnUntraced(function* (handlers) {
    const shares = yield* LibraryShares;
    return handlers
      .handle("list", ({ params }) => shares.list(params.worldId))
      .handle("share", ({ params, payload }) => shares.share(params.worldId, payload))
      .handle("unshare", ({ params, payload }) => shares.unshare(params.worldId, payload));
  }),
);

const SharedWorldHobLive = HttpApiBuilder.group(
  TavernsApi,
  "sharedWorldHob",
  Effect.fnUntraced(function* (handlers) {
    const hob = yield* Hob;
    const threads = yield* HobThreads;
    const proposals = yield* Proposals;

    return handlers
      .handle("status", ({ params }) => hob.sharedWorldStatus(params.worldId))
      .handle("ask", ({ params, payload }) => hob.askSharedWorld(params.worldId, payload))
      .handle("threads", ({ params }) => threads.list("sharedWorld", params.worldId))
      .handle("turns", ({ params }) =>
        threads.turns("sharedWorld", params.worldId, params.threadId),
      )
      .handle("accept", ({ params }) =>
        proposals.acceptSharedWorld(params.worldId, params.threadId, params.turnId),
      );
  }),
);

const RunsLive = HttpApiBuilder.group(
  TavernsApi,
  "runs",
  Effect.fnUntraced(function* (handlers) {
    const runs = yield* EncounterRuns;
    const direct = yield* HobDirectWrites;
    const dm = yield* asDmOf;
    return handlers
      .handle("list", ({ params }) =>
        dm(params.campaignId, (as) => runs.list(as, params.sessionId)),
      )
      .handle("start", ({ params, payload }) =>
        dm(params.campaignId, (as) => runs.start(as, params.sessionId, payload)),
      )
      .handle("resume", ({ params, payload }) =>
        dm(params.campaignId, (as) => runs.resume(as, params.sessionId, payload)),
      )
      .handle("findById", ({ params }) =>
        dm(params.campaignId, (as) => runs.findById(as, params.sessionId, params.runId)),
      )
      .handle("update", ({ params, payload }) =>
        dm(params.campaignId, (as) => runs.update(as, params.sessionId, params.runId, payload)),
      )
      .handle("nextTurn", ({ params, payload }) =>
        dm(params.campaignId, (as) => runs.nextTurn(as, params.sessionId, params.runId, payload)),
      )
      .handle("end", ({ params }) =>
        dm(params.campaignId, (as) => runs.end(as, params.sessionId, params.runId)),
      )
      .handle("hobDirectUpdates", ({ params }) =>
        dm(params.campaignId, (as) => direct.list(as, params.sessionId, params.runId)),
      )
      .handle("undoHobDirectUpdate", ({ params }) =>
        dm(params.campaignId, (as) =>
          direct.undo(as, params.sessionId, params.runId, params.updateId),
        ),
      );
  }),
);

const CombatantsLive = HttpApiBuilder.group(
  TavernsApi,
  "combatants",
  Effect.fnUntraced(function* (handlers) {
    const combatants = yield* Combatants;
    const dm = yield* asDmOf;
    return handlers
      .handle("list", ({ params }) =>
        dm(params.campaignId, (as) => combatants.list(as, params.sessionId, params.runId)),
      )
      .handle("create", ({ params, payload }) =>
        dm(params.campaignId, (as) =>
          combatants.create(as, params.sessionId, params.runId, payload),
        ),
      )
      .handle("update", ({ params, payload }) =>
        dm(params.campaignId, (as) =>
          combatants.update(as, params.sessionId, params.runId, params.combatantId, payload),
        ),
      )
      .handle("damage", ({ params, payload }) =>
        dm(params.campaignId, (as) =>
          combatants.damage(as, params.sessionId, params.runId, params.combatantId, payload),
        ),
      )
      .handle("remove", ({ params }) =>
        dm(params.campaignId, (as) =>
          combatants.remove(as, params.sessionId, params.runId, params.combatantId),
        ),
      );
  }),
);

/**
 * How many log rows one catch-up query fetches.
 *
 * The pull loops until a short page comes back, so this bounds the size of any
 * single array rather than the amount a client may catch up on — a laptop that
 * has been shut for an hour still gets everything, in pages.
 */
const PAGE = 200;

const LiveLive = HttpApiBuilder.group(
  TavernsApi,
  "live",
  Effect.fnUntraced(function* (handlers) {
    const events = yield* SessionEvents;
    const runs = yield* EncounterRuns;
    const live = yield* LiveEvents;
    // Directly, not through `asDmOf`: the streaming handler needs the proof as
    // a value it can hold for the life of the connection, not as a wrapper
    // around one call.
    const dmActors = yield* CampaignCreatorActors;
    // Read once, when the group is built, not per request. `orDie` because a
    // `LIVE_HEARTBEAT_SECONDS` that is not a number is a misconfigured
    // deployment and should stop the boot loudly — and because letting a
    // `ConfigError` into this layer's error channel would put it in the type of
    // every caller of `ApiLive`, for a value that has a committed default.
    const heartbeat = Duration.seconds(yield* Effect.orDie(liveHeartbeatSeconds));

    return (
      handlers
        .handle("log", ({ params, query }) =>
          Effect.flatMap(dmActors.of(params.campaignId), (as) =>
            events.list(as, params.sessionId, query),
          ),
        )
        /**
         * The live stream, and the only read in the product that is not a
         * response.
         *
         * **The order of the three steps below is the whole reconnect story, and
         * it is the one thing here that cannot be rearranged.**
         *
         *   1. Authorise. Resolving the actor and checking the run *before*
         *      returning a stream is what makes a denial an ordinary 404 rather
         *      than a failure event inside a 200 that a client has to be
         *      listening for.
         *   2. Subscribe. `LiveEvents.subscribe` acquires the subscription when
         *      the stream is built, which is *before* step 3 reads the backlog.
         *      Reversed — read, then subscribe — anything written in the gap
         *      between the two is in neither, and the client silently loses it.
         *      That gap is small, which is exactly what would make the bug
         *      survive testing and show up at a table.
         *   3. Replay, then tail. Both are the same query with the same cursor
         *      (`SessionEvents.pollForRun`), so catching up after an hour asleep
         *      is the path every event already takes rather than a special one
         *      that only runs when something has gone wrong.
         *
         * A doorbell that arrives during step 3 is not lost either: the
         * subscription buffers it, and the pull it triggers finds nothing new
         * because the cursor has already moved past it. Notifications are
         * idempotent by construction — they carry no data, so acting on a
         * duplicate is a query that returns no rows.
         */
        .handle("events", ({ params, query, headers }) =>
          Effect.gen(function* () {
            // The DM gate, resolved once for the whole connection rather than
            // per pull — for the reason `pollForRun` has always taken its actor
            // as an argument: the stream is consumed long after this effect has
            // returned, and permissions that could change under a fight are not
            // something anyone can reason about.
            const as = yield* dmActors.of(params.campaignId);
            // The ordinary read of the run, for its ordinary `NotFound` — which
            // is the endpoint's declared error and so is answered as a status
            // before a single byte of stream. It also checks the same two claims
            // every other live endpoint checks: that this session is in this
            // campaign, and that this run is in that session.
            yield* runs.findById(as, params.sessionId, params.runId);

            // `?since=` is what the derived client sends, because `HttpApiClient`
            // issues a plain `fetch` and a plain `fetch` does not resend
            // `Last-Event-ID`. The header is what a browser's native
            // `EventSource` sends by itself when it reconnects, and honouring it
            // is what makes that reconnect correct rather than silently lossy.
            const resume = query.since ?? Number(headers["last-event-id"] ?? Number.NaN);
            let cursor = Number.isSafeInteger(resume) && resume >= 0 ? resume : 0;

            const pull = Effect.gen(function* () {
              const drained: Array<SessionEvent> = [];
              for (;;) {
                const page = yield* events.pollForRun(
                  as,
                  params.sessionId,
                  params.runId,
                  cursor,
                  PAGE,
                );
                if (page.length === 0) break;
                cursor = page[page.length - 1]!.seq;
                drained.push(...page);
                if (page.length < PAGE) break;
              }
              return drained;
            });

            const asEvents = Stream.flatMap((rows: ReadonlyArray<SessionEvent>) =>
              Stream.fromIterable(
                rows.map((row): LiveEvent => ({
                  id: String(row.seq),
                  event: "session-event",
                  data: row,
                })),
              ),
            );

            const body = Stream.concat(
              Stream.fromEffect(pull).pipe(asEvents),
              live.subscribe(params.sessionId).pipe(
                Stream.mapEffect(() => pull),
                asEvents,
              ),
            );

            // No `id` on a heartbeat, deliberately: `Sse.encoder` omits the line
            // entirely for `undefined`, so a browser keeps the last real `seq` as
            // its `Last-Event-ID` and a reconnect after a quiet minute still
            // resumes from the right place rather than from the beginning.
            const heartbeats = Stream.fromSchedule(Schedule.spaced(heartbeat)).pipe(
              Stream.map((): LiveEvent => ({
                id: undefined,
                event: "heartbeat",
                data: new Heartbeat({ seq: cursor }),
              })),
            );

            return Stream.merge(body, heartbeats);
          }),
        )
    );
  }),
);

/** The API with every group implemented. Still needs its services provided. */
export const ApiLive = HttpApiBuilder.layer(TavernsApi).pipe(
  Layer.provide([
    HealthLive,
    MeLive,
    SharedWorldsLive,
    SharedWorldHistoryLive,
    SharedWorldLibraryLive,
    SharedWorldMembersLive,
    InvitePreviewLive,
    JoinLive,
    CampaignsLive,
    MembersLive,
    CampaignInvitesLive,
    SessionsLive,
    PartyLive,
    NotesLive,
    EncountersLive,
    CreaturesLive,
    CharacterOptionsLive,
    LibraryLive,
    EncounterCreaturesLive,
    PrepLive,
    BeatsLive,
    RollsLive,
    SearchLive,
    HobLive,
    SharedWorldHobLive,
    NpcsLive,
    RunsLive,
    CombatantsLive,
    LiveLive,
    RecapLive,
    PlayerTableLive,
  ]),
);
