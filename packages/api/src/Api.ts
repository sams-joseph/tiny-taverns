import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { AccountIdentity } from "./Account.js";
import { Authorization } from "./Actor.js";
import { Beat, BeatCreate, BeatUpdate } from "./Beat.js";
import { Campaign, CampaignCreate, CampaignUpdate } from "./Campaign.js";
import {
  Character,
  CharacterDamage,
  CharacterOwnCreate,
  CharacterOwnUpdate,
  CharacterResourceSpend,
  CharacterRest,
} from "./Character.js";
import { OwnedCharacter, PartyJoin, PartySeat, PartySeatUpdate } from "./Party.js";
import {
  CharacterOption,
  ClassProgression,
  OptionFilter,
  OptionLibraryCreate,
  OptionLibraryUpdate,
  OptionVocabulary,
} from "./CharacterOption.js";
import { Combatant, CombatantCreate, CombatantDamage, CombatantUpdate } from "./Combatant.js";
import {
  Creature,
  CreatureFacets,
  CreatureFilter,
  CreatureLibraryCreate,
  CreatureLibraryUpdate,
  CreatureSort,
  LibraryFilter,
} from "./Creature.js";
import { Encounter, EncounterCreate, EncounterUpdate } from "./Encounter.js";
import { Feat, FeatFilter, FeatLibraryCreate, FeatLibraryUpdate, FeatSort } from "./Feat.js";
import {
  Equipment,
  EquipmentFilter,
  EquipmentLibraryCreate,
  EquipmentLibraryUpdate,
  EquipmentSort,
} from "./Equipment.js";
import {
  MagicItem,
  MagicItemFilter,
  MagicItemLibraryCreate,
  MagicItemLibraryUpdate,
  MagicItemSort,
} from "./MagicItem.js";
import {
  HobAccepted,
  HobAsk,
  HobEvent,
  HobStatus,
  HobThread,
  HobTurn,
  HobUnavailable,
} from "./Hob.js";
import { HobDirectResourceUpdate } from "./HobDirectResourceUpdate.js";
import {
  EncounterCreature,
  EncounterCreatureCreate,
  EncounterCreatureUpdate,
} from "./EncounterCreature.js";
import {
  EncounterRun,
  EncounterRunResume,
  EncounterRunStart,
  EncounterRunUpdate,
  NextTurn,
} from "./EncounterRun.js";
import { Conflict, NotFound, RateLimited } from "./Errors.js";
import {
  Group,
  GroupCampaignCard,
  GroupCreate,
  GroupMember,
  GroupMembership,
  GroupUpdate,
} from "./Group.js";
import { GroupLibraryShare, LibraryShareCreate } from "./LibraryShare.js";
import { GroupHobStatus } from "./Hob.js";
import {
  GroupHistoryEntry,
  GroupHistoryEntryCreate,
  GroupHistoryFromRecap,
  GroupHistorySummary,
} from "./GroupHistory.js";
import {
  AccountId,
  AssistantThreadId,
  AssistantTurnId,
  BeatId,
  CampaignCharacterId,
  CampaignId,
  CharacterId,
  CharacterOptionId,
  CombatantId,
  CreatureId,
  EncounterCreatureId,
  EncounterId,
  EncounterRunId,
  EquipmentId,
  FeatId,
  GroupId,
  GroupInviteId,
  HobDirectResourceUpdateId,
  MagicItemId,
  NpcId,
  NpcKnowledgeFactId,
  NpcMemoryId,
  NpcThreadId,
  RuleArticleId,
  RollId,
  SpellId,
  NoteId,
  PrepItemId,
  SessionId,
} from "./Ids.js";
import {
  GroupInvite,
  InviteCreate,
  InvitePreview,
  InviteRedeemed,
  InviteToken,
  IssuedInvite,
} from "./Invite.js";
import { CampaignMember, CampaignMemberAdd, CampaignMembership } from "./Membership.js";
import { Note, NoteCreate, NoteUpdate } from "./Note.js";
import {
  Npc,
  NpcCreate,
  NpcEvent,
  NpcKnowledgeFact,
  NpcKnowledgeFactCreate,
  NpcKnowledgeFactUpdate,
  NpcListFilter,
  NpcMemory,
  NpcMemoryCreate,
  NpcMemoryUpdate,
  NpcPlayerStatus,
  NpcRehearsalStatus,
  NpcSource,
  NpcRehearse,
  NpcSessionTalk,
  NpcTalk,
  NpcThread,
  NpcTurn,
  NpcUpdate,
  PlayerNpc,
} from "./Npc.js";
import { createdPageFilter, createdPageOf, pageOf } from "./Page.js";
import { PlayerLiveEvent, PlayerLiveTable } from "./PlayerLive.js";
import { PlayerSessionRecap } from "./PlayerRecap.js";
import { PrepItem, PrepItemCreate, PrepItemUpdate } from "./PrepItem.js";
import { SessionRecap } from "./Recap.js";
import {
  RuleArticle,
  RuleArticleDetail,
  RuleArticleFilter,
  RuleArticleLibraryCreate,
  RuleArticleLibraryUpdate,
  RuleArticleSort,
} from "./RuleArticle.js";
import { Roll, RollCreate, RollListFilter } from "./Roll.js";
import { SearchFilter, SearchHit } from "./Search.js";
import { Session, SessionCreate, SessionUpdate } from "./Session.js";
import { Spell, SpellFilter, SpellLibraryCreate, SpellLibraryUpdate, SpellSort } from "./Spell.js";
import { CharacterSpellbook } from "./Spellbook.js";
import { LiveEvent, SessionEvent, SessionLogFilter } from "./SessionEvent.js";

/** Liveness. The one endpoint with no actor and no campaign. */
export class HealthStatus extends Schema.Class<HealthStatus>("HealthStatus")({
  status: Schema.Literals(["ok"]),
  uptime: Schema.Finite,
}) {}

class HealthGroup extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check", "/health", { success: HealthStatus }),
) {}

/**
 * Groups: the top-level container for connected play. See `Group` for the
 * model. Campaign *creation* lives here rather than in `campaigns`, because a
 * campaign belongs to exactly one group and the group is the parent a create
 * has to claim — the same reason a character create names its campaign.
 */
class GroupsGroup extends HttpApiGroup.make("groups")
  .add(
    /** Every group this account is a live member of, with its own relation. */
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(GroupMembership) }),
    HttpApiEndpoint.post("create", "/", { payload: GroupCreate, success: Group }),
    HttpApiEndpoint.get("findById", "/:groupId", {
      params: { groupId: GroupId },
      success: Group,
      error: NotFound,
    }),
    /** Owner-only, like every group write — the governance decision. */
    HttpApiEndpoint.patch("update", "/:groupId", {
      params: { groupId: GroupId },
      payload: GroupUpdate,
      success: Group,
      error: NotFound,
    }),
    /** Soft delete, `campaigns.archive`'s shape: one column moves. */
    HttpApiEndpoint.delete("archive", "/:groupId", {
      params: { groupId: GroupId },
      success: Group,
      error: NotFound,
    }),
    HttpApiEndpoint.post("restore", "/:groupId/restore", {
      params: { groupId: GroupId },
      payload: Schema.Struct({}),
      success: Group,
      error: NotFound,
    }),
    /**
     * The group's campaign directory — every campaign in the group, as a
     * narrow card, to every live member. Content still requires participation;
     * see `GroupCampaignCard`.
     */
    HttpApiEndpoint.get("campaigns", "/:groupId/campaigns", {
      params: { groupId: GroupId },
      success: Schema.Array(GroupCampaignCard),
      error: NotFound,
    }),
    /**
     * Any live group member may create a campaign in the group — the
     * governance decision — and becomes its creator and sole DM, with the
     * creator participation row written in the same transaction.
     */
    HttpApiEndpoint.post("createCampaign", "/:groupId/campaigns", {
      params: { groupId: GroupId },
      payload: CampaignCreate,
      success: Campaign,
      error: NotFound,
    }),
  )
  .prefix("/groups")
  .middleware(Authorization) {}

class CampaignsGroup extends HttpApiGroup.make("campaigns")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(Campaign) }),
    HttpApiEndpoint.get("findById", "/:campaignId", {
      params: { campaignId: CampaignId },
      success: Campaign,
      error: NotFound,
    }),
    // `Conflict` is `currentSessionId` naming a session that is finished. A
    // campaign's current session is the night in progress, and §1.4 ends a
    // session by clearing this pointer — so pointing it back at an ended
    // session is a state conflict, not a missing row.
    HttpApiEndpoint.patch("update", "/:campaignId", {
      params: { campaignId: CampaignId },
      payload: CampaignUpdate,
      success: Campaign,
      error: [NotFound, Conflict],
    }),
    // Soft delete: a campaign is someone's two years of Thursday nights.
    HttpApiEndpoint.delete("archive", "/:campaignId", {
      params: { campaignId: CampaignId },
      success: Campaign,
      error: NotFound,
    }),
    /**
     * Put it back — the exact mirror of `archive`, and the reason archiving is
     * something a DM can be offered rather than warned about.
     *
     * **It clears one column and touches nothing else**, because `archive` set
     * one column and touched nothing else. That is what makes *"restoring puts
     * the campaign back exactly where it was"* a property of the statement
     * rather than a promise: the current session, the fight on the table, the
     * sharing toggle and every row hanging off the campaign are where they were
     * left. See `repo/Campaigns.ts`.
     *
     * A `POST` to a segment rather than a `PATCH` of a field, for the reason
     * `invites.revoke` and `runs.end` are: `archived_at` is on no update
     * payload, so shelving and unshelving are two named acts and neither is
     * something a client can do by sending a field.
     *
     * Idempotent, like `runs.end`: restoring a campaign that is not archived is
     * a no-op success rather than a `Conflict`. There is nothing for the DM to
     * reconcile — the campaign is on the list, which is what they asked for.
     * `NotFound` is the ordinary refusal and covers somebody else's campaign,
     * because `campaignWritable` matches no row for a player or a stranger and
     * saying it exists but is not yours is itself a disclosure.
     */
    HttpApiEndpoint.post("restore", "/:campaignId/restore", {
      params: { campaignId: CampaignId },
      payload: Schema.Struct({}),
      success: Campaign,
      error: NotFound,
    }),
  )
  .prefix("/campaigns")
  .middleware(Authorization) {}

/**
 * The tables this account is at, and what it is at them — and the characters it
 * plays across all of them.
 *
 * **The group whose reads name no campaign**, because they are the questions
 * you ask before you have one: a signed-in account with no membership anywhere
 * is a legitimate steady state — somebody who signed up and has not been
 * invited yet — and this is the read whose empty answer says so.
 *
 * `createCharacter` is the one endpoint here that does name one, and the
 * exception is worth reading rather than treating as drift: creation still needs
 * the campaign whose rules vocabulary and Hob thread shaped the sheet. It is a
 * context claim, refused by `ensureCampaignReadable` exactly as every other
 * create in the product refuses a false one, but it writes no seat. What the
 * endpoint still does not let a caller name is the *account* — so the group's
 * real property is intact where it matters: nothing here answers about, or
 * writes for, anybody but the credential.
 *
 * No endpoint here is a second answer to a campaign-scoped one. `campaigns`
 * composes the identical predicate `campaigns.list` does (see
 * `CampaignMembership`), so the two cannot disagree about reach; what it adds is
 * the role, which is a fact about the pair and has nowhere on the campaign row
 * to live. `archivedCampaigns` is that same read over the other shelf — one
 * repository method, one query, one predicate, and the shelf as its argument.
 * `characters` is the one list over the account-owned `character` table —
 * `repo/Characters.ts`'s `ownCharacter`, pure ownership, with each row's live
 * seats joined on.
 *
 * `identity` is the one read here that is about the account rather than about
 * what it has, and it is where the group's own property is at its plainest: it
 * takes nothing at all, so the account it answers about is the credential's by
 * construction.
 *
 * The three writes are the whole of what anybody may do to a `character` —
 * since the continuity decision there is no DM-typed character and no
 * assignment, so creators use these same three doors: **which rows** is
 * ownership (`ownCharacter`), so no write here reaches a row `characters`
 * above would not already answer, and **which columns** is `CharacterOwnCreate`
 * / `CharacterOwnUpdate`, so what may move is a fact about which schema exists.
 *
 * - `createCharacter` — `CharacterOwnCreate`, gated by `ensureCampaignReadable`
 *   on the campaign used as context, with `account_id` from `CurrentActor` and
 *   nowhere on the wire to put one.
 * - `updateCharacter` — ownership plus `expectedVersion` over the shared state.
 * - `deleteCharacter` — the same clause, retiring the live seats with the row.
 */
class MeGroup extends HttpApiGroup.make("me")
  .add(
    /**
     * Who is asking — the display name, and the id every row about this account
     * already carries.
     *
     * **The narrowest read in the product, and it is narrow by shape rather
     * than by predicate.** There is no parameter, no payload and no row id, so
     * there is nothing a caller could name but themselves; the row is
     * `CurrentActor`'s, which the middleware resolved. That is the same
     * property that puts `updateCharacter` in this group — *it names no
     * campaign, so there is none for a caller to claim* — with one fewer thing
     * to claim: it names no row either.
     *
     * It follows that there is **no error type**. Every other read here can be
     * empty and this one cannot be missing: an actor exists by the time a
     * handler runs, so the account it points at exists too, and a `NotFound`
     * would describe a state the schema cannot reach.
     *
     * **It is not a way to look anybody else up, and there is no shape it
     * could grow into one by accident.** A read that took an id would be a
     * second answer to `members.list`, which is behind the `DmActor` gate
     * precisely because other people's names are the DM's to enumerate. What
     * `AccountIdentity` carries and what it deliberately leaves out is written
     * down on the class.
     */
    HttpApiEndpoint.get("identity", "/", {
      success: AccountIdentity,
    }),
    HttpApiEndpoint.get("campaigns", "/campaigns", {
      success: Schema.Array(CampaignMembership),
    }),
    /**
     * The same read, over the shelf — every table this account is at whose
     * campaign has been archived.
     *
     * **A second path rather than a parameter on the read above, and the reason
     * is which mistake each shape makes possible.** A `?shelf=` filter would put
     * the default in a decoder: five call sites that have nothing to do with
     * archiving (`campaign/load.ts` and `characters/load.ts` read memberships
     * for the role and the campaign's name) would have to name a shelf to keep
     * answering what they answer today, and the day one of them named the wrong
     * one an archived campaign would appear in a live list with nothing failing.
     * Two paths make *"no existing read returns an archived campaign"* a fact
     * about which URL was asked for.
     *
     * **It is not a second answer**, which is the rule that would otherwise
     * argue the other way: `repo/Memberships.ts`'s `mine` takes the shelf and
     * there is one query, one join and one predicate behind both endpoints. The
     * only thing that differs is whether `campaign.archived_at` is null.
     *
     * Ungated, like `campaigns` above and for the same reason — the tables a
     * credential already reaches are not a disclosure to the credential that
     * reaches them. It answers a player's archived table too; what a player is
     * not offered is *restoring* one, which is `campaignWritable`'s answer and
     * not this list's.
     */
    HttpApiEndpoint.get("archivedCampaigns", "/campaigns/archived", {
      success: Schema.Array(CampaignMembership),
    }),
    /**
     * Every character this account plays, across every table it is at.
     *
     * **A list of account-owned rows, each with its seats.** Since the
     * continuity decision a character is top-level and one copy of playable
     * state; where it sits is `campaign_character`, and `OwnedCharacter`
     * carries the row plus its live seat references. Bringing a character to a
     * second table is another seat (`party.join`), never a copy — damage taken
     * at one table is visible at every other table seating the character.
     *
     * The seats carry `campaignId` as the join key; `GET /me/campaigns` is
     * the read that names campaigns — a name here would be a second answer to
     * what a campaign is called, which is the rule `CampaignMember.accountId`
     * already follows from the other side.
     */
    HttpApiEndpoint.get("characters", "/characters", {
      success: Schema.Array(OwnedCharacter),
    }),
    /** The bounded spell vocabulary for one owned character's picker. */
    HttpApiEndpoint.get("characterSpells", "/characters/:characterId/spells", {
      params: { characterId: CharacterId },
      success: CharacterSpellbook,
      error: NotFound,
    }),
    /**
     * **The first write in the product a player may make**, and the only
     * endpoint outside `join` that a non-DM can change anything through.
     *
     * It is here because **it names no campaign, and since the continuity
     * decision there is none to name**: the character row is account-owned and
     * top-level, so the predicate is `ownCharacter` — pure ownership, no
     * campaign clause. The row you may edit is the row that is yours, at
     * however many tables it is seated. It is also where the player's own
     * screen already reads from — `mine` above lists it, this patches one of
     * them.
     *
     * Two boundaries, and neither is a check in a handler:
     *
     * - **Which rows** — `repo/Characters.ts`'s `ownCharacter`: the
     *   `account_id = me` clause, which never matches anybody else's row.
     * - **Which columns** — `CharacterOwnUpdate`, which has no field for
     *   `hpCurrent`, `tempHp`, `conditions` or `accountId`, and no
     *   `visibility` because disclosure lives on the seat
     *   (`campaign_character.visibility`, the seat PATCH). The live half of a
     *   character is not something this payload can say. `expectedVersion` is
     *   the optimistic-concurrency guard over the shared state.
     *
     * `NotFound` covers every refusal, including "that is somebody else's",
     * because saying it exists but is not yours is itself a disclosure.
     */
    HttpApiEndpoint.patch("updateCharacter", "/characters/:characterId", {
      params: { characterId: CharacterId },
      payload: CharacterOwnUpdate,
      success: Character,
      error: [NotFound, Conflict],
    }),
    /**
     * **Writing down a character of your own** — the endpoint behind
     * `#/campaigns/:c/characters/new`, and since the continuity decision the
     * *only* way a `character` row comes into being: there is no DM-typed
     * character, no assignment and no re-pointing, and creators write their
     * own characters through this same door as everybody else.
     *
     * ### The one endpoint here that names a campaign, and what it means
     *
     * Everywhere else in this group the property is *it names no campaign, so
     * there is none for a caller to claim* — a character is account-owned and
     * the predicate is ownership. **This insert still names a campaign only as
     * context**: the form's pickers and Hob's drafting grammar are this
     * campaign's vocabulary, and subrace validation is checked against that
     * same vocabulary. Seating is a later, explicit `party.join`.
     *
     * What refuses a false context is `ensureCampaignReadable` — a live
     * membership, a credential that reaches this campaign, and creator-ness
     * *or* a shared campaign. A member at a table whose creator has not shared
     * it is refused here with the same `NotFound` everything else at that table
     * gives them. **No new predicate.**
     *
     * ### Whose it is, and where that is decided
     *
     * `account_id` is `CurrentActor`'s, taken server-side. It is not on
     * `CharacterOwnCreate` and there is nowhere on this endpoint to put one —
     * the `Invites.redeem` shape verbatim, which *"takes a token and nothing
     * else — no account id (it is `CurrentActor`'s, so a caller cannot invite
     * somebody else in)"*. There is no assignment and no re-pointing anywhere
     * in the product — the payload having no such field is the whole of how
     * "you cannot create a character for somebody else" is enforced.
     *
     * ### It fails closed, and that is the column default rather than a choice
     *
     * The create makes no `campaign_character` row. `CharacterOwnCreate` has no
     * `visibility` because disclosure lives on the seat, and there is no seat
     * until the owner intentionally adds the character to a campaign through
     * `party.join`.
     */
    HttpApiEndpoint.post("createCharacter", "/campaigns/:campaignId/characters", {
      params: { campaignId: CampaignId },
      payload: CharacterOwnCreate,
      success: Character,
      error: [NotFound, Conflict],
    }),
    /** Owner-only resource grains: one counter spend, and one rules-bounded rest. */
    HttpApiEndpoint.post("spendCharacterResource", "/characters/:characterId/spend", {
      params: { characterId: CharacterId },
      payload: CharacterResourceSpend,
      success: Character,
      error: [NotFound, Conflict],
    }),
    HttpApiEndpoint.post("restCharacter", "/characters/:characterId/rest", {
      params: { characterId: CharacterId },
      payload: CharacterRest,
      success: Character,
      error: [NotFound, Conflict],
    }),
    /**
     * Throwing away a character of your own.
     *
     * **It exists because creating one is now cheap**, which is a state the
     * product has not been in before: every `character` row until this slice
     * was typed by a DM who could already delete it, so a row nobody wanted was
     * a row somebody had chosen to make. A player who starts a character, gets
     * two fields in and changes their mind now leaves a real row in their DM's
     * party list, and the honest remedy is a way to take it back rather than an
     * apology in a comment.
     *
     * `ownCharacter`, the same clause `updateCharacter` composes and therefore
     * the same set of rows: yours and nobody else's. Somebody else's character
     * is the ordinary `NotFound` rather than a sentence saying whose it is.
     * The delete retires the character's live seats in the same transaction,
     * so no roster keeps a chair pointing at a row that is gone.
     *
     * **There is no DM delete beside it any more** — a character is
     * account-owned, and what a creator manages is the *seat*
     * (`party.leave`), which answers *"somebody left and their character goes
     * with them"* without touching the character itself.
     *
     * Like the PATCH beside it, one statement and no doorbell: nothing live
     * moved, and the fight's copy of a character is a snapshot that reads
     * nothing back. An open DM page stays stale until it refetches, exactly as
     * it does for a level-up typed between games.
     */
    HttpApiEndpoint.delete("deleteCharacter", "/characters/:characterId", {
      params: { characterId: CharacterId },
      success: Schema.Void,
      error: NotFound,
    }),
  )
  .prefix("/me")
  .middleware(Authorization) {}

/**
 * Who is at this table — the roster the party screen draws.
 *
 * The mirror of `me.campaigns`: one asks which tables this account is at, the
 * other who is at this one. Same row, read from the other end, which is why both
 * live in `repo/Memberships.ts` and neither writes a predicate of its own.
 *
 * **Behind the `DmActor` gate, and it is the fifth repository to be.** The
 * standing rule is that a repository takes the proof when its player projection
 * diverges from its DM projection, and here the player projection is *nothing*:
 * a member list is other people's account names and the shape of somebody's
 * table, and a player at it has no business enumerating who else was invited or
 * when. `Memberships.mine` stays ungated beside it — the campaigns a credential
 * already reaches are not a disclosure to the credential that reaches them.
 *
 * **There is no seat here and there never was one.** Three of the four statuses
 * the fourth delivery draws derive from rows that exist — this list, an
 * invitation from `invites.list`, and a `Character` whose `accountId` names a
 * member — and the fourth, an *open* seat with nobody in it, is not
 * representable, because a membership cannot exist before an account. See
 * `CampaignMember`, which is where each one is written down.
 *
 * Read-only, deliberately. A membership is written by exactly two statements
 * (`Campaigns.create`'s owner row and `Invites.redeem`'s player row) and revoked
 * by one (`invites.revoke`), and every one of those is an act on something else
 * — so a `POST` or `DELETE` here would be a third way to grant or take reach,
 * which is precisely what `repo/Memberships.ts` exists to prevent.
 */
class MembersGroup extends HttpApiGroup.make("members")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      success: Schema.Array(CampaignMember),
      error: NotFound,
    }),
    /**
     * The creator names an existing live group member as a participant — the
     * participation decision's write half. The named account must already be a
     * live member of the campaign's group (`campaign_member` carries a foreign
     * key into `group_member`, so a non-member is unrepresentable); an account
     * outside the group is a `NotFound` naming the member, and an account
     * already at the table is the same success, like a double-tapped Join.
     */
    HttpApiEndpoint.post("add", "/", {
      params: { campaignId: CampaignId },
      payload: CampaignMemberAdd,
      success: CampaignMember,
      error: NotFound,
    }),
    /**
     * The creator removes a player from the campaign. Removing the creator is
     * a `Conflict` — a campaign without its creator is unrepresentable, and
     * the honest answer names the reason rather than pretending the row is
     * missing. Retires the account's active party joins in the same
     * transaction, so `campaign_character`'s membership foreign key holds.
     */
    HttpApiEndpoint.delete("remove", "/:accountId", {
      params: { campaignId: CampaignId, accountId: AccountId },
      success: Schema.Void,
      error: [NotFound, Conflict],
    }),
  )
  .prefix("/campaigns/:campaignId/members")
  .middleware(Authorization) {}

/**
 * Who is in the group — readable by every live member, because a group is the
 * social container and its roster is what it is. Removal is the owner's act
 * alone (the governance decision), and removing the owner is refused: a group
 * without its owner-member is unrepresentable.
 */

/**
 * Group history: the group's shared chronicle — copies admitted on purpose,
 * canonical once admitted, ordered by acceptance. See `GroupHistory.ts` for
 * the model; the boundary it implements is `decision-group-hob-boundary.md`'s:
 * what has *happened* is the group's, unplayed prep stays its creator's.
 *
 * Reads are any live member's (`groupReadable`). `create` is any member
 * writing the chronicle by hand; `fromRecap` is the campaign **creator's**
 * act — it renders their played night to prose and stores the copy, which is
 * how canonical campaign history crosses into group context without a group
 * read ever touching campaign tables.
 */
class GroupHistoryGroup extends HttpApiGroup.make("groupHistory")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { groupId: GroupId },
      success: Schema.Array(GroupHistoryEntry),
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { groupId: GroupId },
      payload: GroupHistoryEntryCreate,
      success: GroupHistoryEntry,
      error: NotFound,
    }),
    HttpApiEndpoint.post("fromRecap", "/from-recap", {
      params: { groupId: GroupId },
      payload: GroupHistoryFromRecap,
      success: GroupHistoryEntry,
      error: [NotFound, Conflict],
    }),
    /** The current accepted summary, or `null` — the ordinary state of a young group. */
    HttpApiEndpoint.get("summary", "/summary", {
      params: { groupId: GroupId },
      success: Schema.NullOr(GroupHistorySummary),
      error: NotFound,
    }),
  )
  .prefix("/groups/:groupId/history")
  .middleware(Authorization) {}

/**
 * The group's shared Library shelf: the explicit share/copy layer of the
 * 2026-09-01 Library decision. `list` is any live member's; `share` and
 * `unshare` are the **owner's** — a grant over their own original, made and
 * withdrawn by them alone. What a share grants is being a `derive` source
 * for the group's campaigns; nothing here reads or writes the original.
 */
class GroupLibraryGroup extends HttpApiGroup.make("groupLibrary")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { groupId: GroupId },
      success: Schema.Array(GroupLibraryShare),
      error: NotFound,
    }),
    HttpApiEndpoint.post("share", "/", {
      params: { groupId: GroupId },
      payload: LibraryShareCreate,
      success: GroupLibraryShare,
      error: NotFound,
    }),
    /** Withdrawing the grant. Copies already made are snapshots and stand. */
    HttpApiEndpoint.post("unshare", "/unshare", {
      params: { groupId: GroupId },
      payload: LibraryShareCreate,
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
  )
  .prefix("/groups/:groupId/library")
  .middleware(Authorization) {}

class GroupMembersGroup extends HttpApiGroup.make("groupMembers")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { groupId: GroupId },
      success: Schema.Array(GroupMember),
      error: NotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:accountId", {
      params: { groupId: GroupId, accountId: AccountId },
      success: Schema.Void,
      error: [NotFound, Conflict],
    }),
  )
  .prefix("/groups/:groupId/members")
  .middleware(Authorization) {}

/**
 * Inviting somebody into the group — the owner's half.
 *
 * Group-scoped and owner-only, through `groupWritable`: the governance
 * decision puts membership and invitations in the owner's hands. An invitation
 * may also name one of the group's campaigns to seat the redeemer at in the
 * same act. See `GroupInvite` for the four lifetime rules.
 *
 * `create` is the only endpoint in the product that answers with a secret, and
 * it answers with it exactly once — the server keeps a digest, so a list can
 * never show it again. `revoke` is a `POST` rather than a `DELETE` because
 * nothing is deleted: the row survives with `revokedAt` set, which is what
 * makes a withdrawn invitation legible in the list rather than simply absent
 * from it.
 */
class InvitesGroup extends HttpApiGroup.make("invites")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { groupId: GroupId },
      success: Schema.Array(GroupInvite),
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { groupId: GroupId },
      payload: InviteCreate,
      success: IssuedInvite,
      error: NotFound,
    }),
    HttpApiEndpoint.post("revoke", "/:inviteId/revoke", {
      params: { groupId: GroupId, inviteId: GroupInviteId },
      payload: Schema.Struct({}),
      success: GroupInvite,
      // `Conflict`: the redeemer created a campaign in the group since, which
      // pins their membership — nothing is withdrawn, and the answer says why.
      error: [NotFound, Conflict],
    }),
  )
  .prefix("/groups/:groupId/invites")
  .middleware(Authorization) {}

/**
 * What the holder of an invitation can ask before they have an account.
 *
 * **The only group in the product with no `Authorization` middleware except
 * `health`**, and the disclosure it makes is deliberate and bounded: the
 * campaign's name, the DM's name and when the invitation dies, to whoever holds
 * a live token and nobody else. It exists so the step between a friend at the
 * table and the read-aloud text is a page that says what signing in gets you,
 * rather than a vendor's card in front of a stranger.
 *
 * It previews **live invitations only**. Expired, withdrawn and already-spent
 * tokens are the same `NotFound` an unknown one gets — telling the holder of a
 * dead token which kind of dead it is discloses that it was ever alive.
 */
class InvitePreviewGroup extends HttpApiGroup.make("invitePreview").add(
  HttpApiEndpoint.post("read", "/invites/preview", {
    payload: InviteToken,
    success: InvitePreview,
    error: NotFound,
  }),
) {}

/**
 * Accepting an invitation — the one endpoint that sits outside every campaign
 * predicate, because the caller has no reach yet.
 *
 * That is exactly the shape of thing that becomes a hole, so three properties
 * make the carve-out safe rather than merely small:
 *
 * - **It takes no account id.** The membership written is `CurrentActor`'s, the
 *   same way the assistant's tool handlers close over the campaign rather than
 *   taking one. A caller cannot invite somebody else in.
 * - **It takes no campaign id either.** The campaign is the invitation's, so a
 *   caller cannot redeem a token *at* a table of their choosing.
 * - **It grants a `player` membership and has no way to express another.** A
 *   `dm` membership is a different act, and it does not share this path.
 *
 * Behind `Authorization` like everything else, so the account it grants to is
 * one the identity layer resolved. `NotFound` covers every refusal — unknown,
 * expired, withdrawn, spent — and redeeming twice from the same account is the
 * same success rather than an error, because a double-tapped *Join* is one
 * person joining once.
 */
class JoinGroup extends HttpApiGroup.make("join")
  .add(
    HttpApiEndpoint.post("redeem", "/invites/redeem", {
      payload: InviteToken,
      success: InviteRedeemed,
      error: NotFound,
    }),
  )
  .middleware(Authorization) {}

class SessionsGroup extends HttpApiGroup.make("sessions")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      success: Schema.Array(Session),
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId },
      payload: SessionCreate,
      success: Session,
      error: [NotFound, Conflict],
    }),
    HttpApiEndpoint.get("findById", "/:sessionId", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      success: Session,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:sessionId", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      payload: SessionUpdate,
      success: Session,
      error: [NotFound, Conflict],
    }),
    HttpApiEndpoint.delete("remove", "/:sessionId", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/sessions")
  .middleware(Authorization) {}

/**
 * The party: the seats at one campaign's table, each holding a shared,
 * account-owned character. See `Party.ts` for the model — the seat is the
 * campaign's row, the character is its owner's, and history is snapshots.
 */
class PartyGroup extends HttpApiGroup.make("party")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      success: Schema.Array(PartySeat),
      error: NotFound,
    }),
    /**
     * The owner seats their own character. The payload has no field for
     * anybody else's — consent is the shape — and the schema's composite key
     * proves the pair even against a forged request. Seating a character
     * already seated here is the same success, like a double-tapped Join.
     */
    HttpApiEndpoint.post("join", "/", {
      params: { campaignId: CampaignId },
      payload: PartyJoin,
      success: PartySeat,
      error: NotFound,
    }),
    /** The creator's seat PATCH: visibility, display, live conditions. */
    HttpApiEndpoint.patch("update", "/:campaignCharacterId", {
      params: { campaignId: CampaignId, campaignCharacterId: CampaignCharacterId },
      payload: PartySeatUpdate,
      success: PartySeat,
      error: NotFound,
    }),
    /**
     * Retiring a seat — the owner leaving, or the creator clearing the table.
     * The seat row survives with `left_at` stamped: the roster line is
     * campaign history and a delete would rewrite it.
     */
    HttpApiEndpoint.delete("leave", "/:campaignCharacterId", {
      params: { campaignId: CampaignId, campaignCharacterId: CampaignCharacterId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
    /**
     * The delta, through the seat — the creator's act, and the only way a
     * current hit point moves outside a fight. It lands on the **shared**
     * character, which is the continuity decision working: damage taken at
     * one table is what every table sees.
     */
    HttpApiEndpoint.post("damage", "/:campaignCharacterId/damage", {
      params: { campaignId: CampaignId, campaignCharacterId: CampaignCharacterId },
      payload: CharacterDamage,
      success: Character,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/party")
  .middleware(Authorization) {}

class NotesGroup extends HttpApiGroup.make("notes")
  .add(
    /**
     * Paged, oldest first — see `Page.ts` for the keyset and for what
     * `nextCursor` means. There is no `q`: the notes screen filters what the
     * campaign frame already loaded, deliberately, and `notes.list` gaining a
     * search box would be a second answer to a question `campaigns/:c/search`
     * already answers over four tables at once.
     */
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      query: createdPageFilter,
      success: createdPageOf(Note),
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId },
      payload: NoteCreate,
      success: Note,
      error: NotFound,
    }),
    HttpApiEndpoint.get("findById", "/:noteId", {
      params: { campaignId: CampaignId, noteId: NoteId },
      success: Note,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:noteId", {
      params: { campaignId: CampaignId, noteId: NoteId },
      payload: NoteUpdate,
      success: Note,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:noteId", {
      params: { campaignId: CampaignId, noteId: NoteId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/notes")
  .middleware(Authorization) {}

/**
 * The authored encounter templates behind `CampaignHome`'s Encounters tab.
 *
 * Campaign-scoped, not session-scoped: an encounter is reusable and outlives
 * any one night, and running it produces a separate `encounter_run` rather than
 * mutating the template.
 */
class EncountersGroup extends HttpApiGroup.make("encounters")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      query: createdPageFilter,
      success: createdPageOf(Encounter),
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId },
      payload: EncounterCreate,
      success: Encounter,
      error: NotFound,
    }),
    HttpApiEndpoint.get("findById", "/:encounterId", {
      params: { campaignId: CampaignId, encounterId: EncounterId },
      success: Encounter,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:encounterId", {
      params: { campaignId: CampaignId, encounterId: EncounterId },
      payload: EncounterUpdate,
      success: Encounter,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:encounterId", {
      params: { campaignId: CampaignId, encounterId: EncounterId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/encounters")
  .middleware(Authorization) {}

/**
 * The creatures a campaign can **use** — the picker behind encounter building,
 * and nothing else.
 *
 * **Campaign copies are plumbing now, not a collection** (captain's decision,
 * 2026-09-02). A campaign still holds internal instances of Library creatures —
 * an encounter roster points at one so later Library edits cannot rewrite a
 * built encounter — but the user never manages them: no campaign create, no
 * edit, no delete, no derive. The instance materialises inside
 * `encounterCreatures.create` at the point of use.
 *
 * So `list` answers **what this campaign can build from**: the bundle (under
 * the same row-visibility rule as always), the caller's own Library, and
 * originals explicitly shared to this campaign's group — `usableInCampaign` in
 * `repo/visibility.ts`. It never returns a campaign instance, which is what
 * keeps the copies invisible.
 *
 * `findById` is wider on purpose: it also resolves the internal instances a
 * roster or a fight names (`copyableIntoCampaign`), because a stat block of a
 * creature already on the table has to render whatever list it came from. An
 * id is not an enumeration; nothing offers these rows as a collection.
 */
class CreaturesGroup extends HttpApiGroup.make("creatures")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      query: CreatureFilter,
      success: pageOf(Creature, CreatureSort),
      error: NotFound,
    }),
    HttpApiEndpoint.get("findById", "/:creatureId", {
      params: { campaignId: CampaignId, creatureId: CreatureId },
      success: Creature,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/creatures")
  .middleware(Authorization) {}

/**
 * The Library: **where an original is authored**, and the only place a row
 * exists that is in no campaign and is somebody's.
 *
 * Two tables, one model, one group. A monster and a character option carry the
 * same three-owner shape — the bundle, an account's original, a campaign's copy
 * — because `repo/visibility.ts`'s four Library predicates are generic over a
 * table name and were called unmodified against the second one. So the four
 * statements below are read once and apply to both, and `derive` is the one
 * seam in each case.
 *
 * Captain's model, in their own words: *"The library should be where you create
 * the entities; when you use them in a campaign they are copied in, so the
 * library should only show the raw entity and not anything in campaigns, as the
 * campaign is a copied state of the entity."* Four statements, and this group is
 * the first two of them:
 *
 * 1. a creature can be owned by an **account** and sit in no campaign;
 * 2. **authoring happens here** — creating a monster is not an act inside a
 *    campaign, so nothing in this group names one;
 * 3. using one in a campaign **copies it in** — `creatures.derive`, which is at
 *    a path that has a campaign because a copy needs somewhere to land;
 * 4. this list shows **originals only**, never a campaign's copy of one.
 *
 * **This reverses the shape that shipped hours earlier.** The first Library read
 * gathered every campaign creature the credential could reach, over every table
 * at once. Under the model those are exactly the rows it must not show: they are
 * copies, and a copy that appeared here would offer to be edited without the
 * edit reaching the campaign that holds it. What replaces it is anchored on
 * `campaign_id is null` and is simpler than what it replaces — no quantifier and
 * no join to `campaign` at all.
 *
 * **What a reader gets is the bundle plus their own**, and nothing else ever.
 * `repo/visibility.ts`'s `libraryRowReadable` compares `account_id` to the
 * account the credential resolved to and to nothing a caller supplied, so there
 * is no shape of request in this group that asks for somebody else's Library.
 * Writes go through `libraryRowWritable`, the same predicate with the bundle's
 * disjunct removed — which is where the shared corpus's structural immutability
 * lives now that a null campaign no longer means "nobody's": a bundled row's
 * `account_id` is null, a null never equals a uuid, and
 * `creature_system_is_unowned` is what makes that a fact about the schema.
 *
 * **An account that is a member of nothing has a Library**, which is the one
 * outcome that changed for a reader rather than for the list: authoring cannot
 * require a campaign if it is not an act inside one.
 *
 * The search, the environment narrowing and the sort are the same controls the
 * campaign bestiary has (`LibraryFilter` is spread into `CreatureFilter`), so
 * the two lists cannot come to disagree about what "gob" finds or how CR orders.
 * The payloads are the same shape for the same reason, minus `visibility` — see
 * `CreatureLibraryCreate`, where its absence is the decision.
 */
/**
 * A campaign's **rules vocabulary**: the classes, races and backgrounds a
 * character at this table can be built from.
 *
 * **This list is the create form's picker**, and the create form is a player's
 * screen. It answers `usableInCampaign` (`repo/visibility.ts`): the bundle
 * under the row-visibility rule the importer relies on (`shared` bundle rows
 * reach players), the caller's own Library, and originals **explicitly shared
 * to this campaign's group** — which is how a homebrew class reaches the
 * players at a table now that campaign copies are internal plumbing (captain's
 * decision, 2026-09-02). The old path — copy it into the campaign, then share
 * the copy — is gone with the copy-management surface; the group share is the
 * one explicit act, and it exposes the original itself, as a vocabulary entry
 * only. A character seeded from one is still a snapshot: class, race and
 * background live on the character as labels, never as pointers.
 *
 * ### Not paged, on purpose
 *
 * A vocabulary is bounded by what it hangs off, like a campaign's members and a
 * night's checklist — see `Page.ts`, which lists exactly those as the reads
 * that are deliberately not paged. A picker with a *Show more* under it is a
 * picker that cannot be read at a glance. `OPTION_LIMIT` is the sanity bound.
 */
class CharacterOptionsGroup extends HttpApiGroup.make("options")
  .add(
    /**
     * Every option this campaign offers — all three kinds unless `kind` narrows
     * it. One request rather than three is the common case and is why `kind` is
     * a query parameter: the create form wants classes, races *and* backgrounds.
     */
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      query: OptionFilter,
      success: Schema.Array(CharacterOption),
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/options")
  .middleware(Authorization) {}

class LibraryGroup extends HttpApiGroup.make("library")
  .add(
    /**
     * The account's own creatures and the bundle, filtered the way the campaign
     * bestiary filters.
     *
     * No `NotFound`: there is no parent in the path to be missing, and an
     * account that has authored nothing gets the bundle rather than a 404 — the
     * same shape as `me.campaigns`, whose empty answer is a legitimate steady
     * state rather than an error.
     */
    HttpApiEndpoint.get("list", "/creatures", {
      query: LibraryFilter,
      success: pageOf(Creature, CreatureSort),
    }),
    /** The chip row's vocabulary, over this Library — see `creatures.environments`. */
    HttpApiEndpoint.get("environments", "/creatures/environments", {
      success: Schema.Array(Schema.String),
    }),
    HttpApiEndpoint.get("creatureFacets", "/creatures/facets", {
      success: CreatureFacets,
    }),
    /**
     * Author a monster. **No campaign, and no `origin`** — the column default
     * decides, so a client cannot claim `system` or `assistant` provenance here
     * any more than it can on the campaign path.
     */
    HttpApiEndpoint.post("create", "/creatures", {
      payload: CreatureLibraryCreate,
      success: Creature,
    }),
    HttpApiEndpoint.get("findById", "/creatures/:creatureId", {
      params: { creatureId: CreatureId },
      success: Creature,
      error: NotFound,
    }),
    /**
     * Edit one you own. A bundled creature is readable here and not writable,
     * and the refusal is the ordinary `NotFound` — saying "it exists but is not
     * yours" is itself a disclosure, and here it would also be an invitation to
     * keep trying.
     */
    HttpApiEndpoint.patch("update", "/creatures/:creatureId", {
      params: { creatureId: CreatureId },
      payload: CreatureLibraryUpdate,
      success: Creature,
      error: NotFound,
    }),
    /**
     * Delete one you own.
     *
     * **No `Conflict`, unlike the campaign path**, and the difference is
     * structural rather than an omission: the 409 there means an encounter's
     * roster still points at the creature, and a roster can only ever name a row
     * `corpusRowReadable` returned — which is a campaign's own creature or the
     * bundle, never a Library entity. Nothing in a campaign can reference an
     * original; a campaign holds copies. `library.test.ts` pins that, so the day
     * it stops being true this endpoint fails loudly rather than 500ing.
     */
    HttpApiEndpoint.delete("remove", "/creatures/:creatureId", {
      params: { creatureId: CreatureId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
    /**
     * The account's own **character options** and the bundled ones — the
     * classes, races and backgrounds it has authored, in no campaign.
     *
     * The same read as the creature list above with one word changed, because
     * the predicate underneath is literally the same function with a different
     * table name. What differs is downstream: an option here is invisible to
     * every player in the product until its owner copies it into a campaign.
     */
    HttpApiEndpoint.get("optionVocabulary", "/options/vocabulary", {
      success: OptionVocabulary,
    }),
    HttpApiEndpoint.get("options", "/options", {
      query: OptionFilter,
      success: Schema.Array(CharacterOption),
    }),
    /**
     * **Write a class, race or background.** The only place any of them is
     * authored, and the second statement of the captain's model applied to a
     * second table.
     *
     * No campaign, no `origin`, and no `visibility` — see
     * `OptionLibraryCreate`, where each absence is the decision.
     */
    HttpApiEndpoint.post("createOption", "/options", {
      payload: OptionLibraryCreate,
      success: CharacterOption,
    }),
    HttpApiEndpoint.get("findOption", "/options/:optionId", {
      params: { optionId: CharacterOptionId },
      success: CharacterOption,
      error: NotFound,
    }),
    HttpApiEndpoint.get("optionProgression", "/options/:optionId/progression", {
      params: { optionId: CharacterOptionId },
      success: ClassProgression,
      error: NotFound,
    }),
    /**
     * Edit one you own.
     *
     * **This does not reach any campaign's copy of it**, which is the whole of
     * what a snapshot means, and it is the thing a DM is most likely to be
     * surprised by. A `Conflict` is how a body that does not match the row's own
     * `kind` is refused — the payload cannot see the row it is patching, so the
     * repository is where the two are compared.
     */
    HttpApiEndpoint.patch("updateOption", "/options/:optionId", {
      params: { optionId: CharacterOptionId },
      payload: OptionLibraryUpdate,
      success: CharacterOption,
      error: [NotFound, Conflict],
    }),
    /**
     * Delete one you own. **Copies already in campaigns stay where they are**,
     * with `derivedFrom` going null — the same `on delete set null` a creature's
     * provenance pointer has, and the same reason.
     */
    HttpApiEndpoint.delete("removeOption", "/options/:optionId", {
      params: { optionId: CharacterOptionId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
    HttpApiEndpoint.get("ruleArticles", "/compendium", {
      query: RuleArticleFilter,
      success: pageOf(RuleArticle, RuleArticleSort),
    }),
    HttpApiEndpoint.post("createRuleArticle", "/compendium", {
      payload: RuleArticleLibraryCreate,
      success: RuleArticleDetail,
    }),
    HttpApiEndpoint.get("findRuleArticle", "/compendium/:ruleArticleId", {
      params: { ruleArticleId: RuleArticleId },
      success: RuleArticleDetail,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("updateRuleArticle", "/compendium/:ruleArticleId", {
      params: { ruleArticleId: RuleArticleId },
      payload: RuleArticleLibraryUpdate,
      success: RuleArticleDetail,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("removeRuleArticle", "/compendium/:ruleArticleId", {
      params: { ruleArticleId: RuleArticleId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
    HttpApiEndpoint.get("feats", "/feats", {
      query: FeatFilter,
      success: pageOf(Feat, FeatSort),
    }),
    HttpApiEndpoint.post("createFeat", "/feats", {
      payload: FeatLibraryCreate,
      success: Feat,
    }),
    HttpApiEndpoint.get("findFeat", "/feats/:featId", {
      params: { featId: FeatId },
      success: Feat,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("updateFeat", "/feats/:featId", {
      params: { featId: FeatId },
      payload: FeatLibraryUpdate,
      success: Feat,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("removeFeat", "/feats/:featId", {
      params: { featId: FeatId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
    HttpApiEndpoint.get("spells", "/spells", {
      query: SpellFilter,
      success: pageOf(Spell, SpellSort),
    }),
    HttpApiEndpoint.post("createSpell", "/spells", {
      payload: SpellLibraryCreate,
      success: Spell,
    }),
    HttpApiEndpoint.get("findSpell", "/spells/:spellId", {
      params: { spellId: SpellId },
      success: Spell,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("updateSpell", "/spells/:spellId", {
      params: { spellId: SpellId },
      payload: SpellLibraryUpdate,
      success: Spell,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("removeSpell", "/spells/:spellId", {
      params: { spellId: SpellId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
    HttpApiEndpoint.get("equipment", "/equipment", {
      query: EquipmentFilter,
      success: pageOf(Equipment, EquipmentSort),
    }),
    HttpApiEndpoint.post("createEquipment", "/equipment", {
      payload: EquipmentLibraryCreate,
      success: Equipment,
    }),
    HttpApiEndpoint.get("findEquipment", "/equipment/:equipmentId", {
      params: { equipmentId: EquipmentId },
      success: Equipment,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("updateEquipment", "/equipment/:equipmentId", {
      params: { equipmentId: EquipmentId },
      payload: EquipmentLibraryUpdate,
      success: Equipment,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("removeEquipment", "/equipment/:equipmentId", {
      params: { equipmentId: EquipmentId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
    HttpApiEndpoint.get("npcs", "/npcs", {
      query: NpcListFilter,
      success: Schema.Array(NpcSource),
    }),
    HttpApiEndpoint.post("createNpc", "/npcs", {
      payload: NpcCreate,
      success: NpcSource,
    }),
    HttpApiEndpoint.get("findNpc", "/npcs/:npcId", {
      params: { npcId: NpcId },
      success: NpcSource,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("updateNpc", "/npcs/:npcId", {
      params: { npcId: NpcId },
      payload: NpcUpdate,
      success: NpcSource,
      error: [NotFound, Conflict],
    }),
    HttpApiEndpoint.post("archiveNpc", "/npcs/:npcId/archive", {
      params: { npcId: NpcId },
      payload: Schema.Struct({}),
      success: NpcSource,
      error: NotFound,
    }),
    HttpApiEndpoint.post("restoreNpc", "/npcs/:npcId/restore", {
      params: { npcId: NpcId },
      payload: Schema.Struct({}),
      success: NpcSource,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("removeNpc", "/npcs/:npcId", {
      params: { npcId: NpcId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
    HttpApiEndpoint.get("magicItems", "/magic-items", {
      query: MagicItemFilter,
      success: pageOf(MagicItem, MagicItemSort),
    }),
    HttpApiEndpoint.post("createMagicItem", "/magic-items", {
      payload: MagicItemLibraryCreate,
      success: MagicItem,
    }),
    HttpApiEndpoint.get("findMagicItem", "/magic-items/:magicItemId", {
      params: { magicItemId: MagicItemId },
      success: MagicItem,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("updateMagicItem", "/magic-items/:magicItemId", {
      params: { magicItemId: MagicItemId },
      payload: MagicItemLibraryUpdate,
      success: MagicItem,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("removeMagicItem", "/magic-items/:magicItemId", {
      params: { magicItemId: MagicItemId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
  )
  .prefix("/library")
  .middleware(Authorization) {}

/**
 * What an encounter contains. The roster, not the running fight.
 *
 * Nested under the encounter for the same reason the checklist is nested under
 * the session: the encounter id arriving from a client is a claim, so the
 * campaign stays in the path and the read predicate is handed the campaign it
 * must contain the encounter within.
 */
class EncounterCreaturesGroup extends HttpApiGroup.make("encounterCreatures")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId, encounterId: EncounterId },
      success: Schema.Array(EncounterCreature),
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId, encounterId: EncounterId },
      payload: EncounterCreatureCreate,
      success: EncounterCreature,
      error: [NotFound, Conflict],
    }),
    HttpApiEndpoint.patch("update", "/:encounterCreatureId", {
      params: {
        campaignId: CampaignId,
        encounterId: EncounterId,
        encounterCreatureId: EncounterCreatureId,
      },
      payload: EncounterCreatureUpdate,
      success: EncounterCreature,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:encounterCreatureId", {
      params: {
        campaignId: CampaignId,
        encounterId: EncounterId,
        encounterCreatureId: EncounterCreatureId,
      },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/encounters/:encounterId/creatures")
  .middleware(Authorization) {}

/**
 * The "Before you sit down" checklist.
 *
 * Nested under the session in the path because that is where it hangs in the
 * model — see `PrepItem`. The campaign stays in the path too, so the read
 * predicate is handed the campaign it must contain the item within rather than
 * inferring it from the session it is about to trust.
 */
class PrepGroup extends HttpApiGroup.make("prep")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      success: Schema.Array(PrepItem),
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      payload: PrepItemCreate,
      success: PrepItem,
      error: NotFound,
    }),
    HttpApiEndpoint.get("findById", "/:prepItemId", {
      params: { campaignId: CampaignId, sessionId: SessionId, prepItemId: PrepItemId },
      success: PrepItem,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:prepItemId", {
      params: { campaignId: CampaignId, sessionId: SessionId, prepItemId: PrepItemId },
      payload: PrepItemUpdate,
      success: PrepItem,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:prepItemId", {
      params: { campaignId: CampaignId, sessionId: SessionId, prepItemId: PrepItemId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/sessions/:sessionId/prep")
  .middleware(Authorization) {}

/**
 * What actually happened — the DM's own line of prose about the night.
 *
 * The same shape as `PrepGroup` and nested the same way, because a beat hangs
 * off the session in the model: the campaign stays in the path so the read
 * predicate is handed the campaign the session must sit inside, rather than
 * inferring it from an id a client supplied.
 *
 * `create` is the only endpoint here with a product requirement attached to its
 * *shape*: **one field, one keystroke, no dialog round trip.** Typing and
 * pressing Enter must commit, and the optimistic rule the prep tick already
 * follows applies — render it immediately, reconcile on the response, toast on
 * failure. `update` and `remove` exist because a beat jotted in three seconds
 * at a dark table will contain a typo, and being correctable is precisely what
 * a `session_event` could not be.
 */
class BeatsGroup extends HttpApiGroup.make("beats")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      query: createdPageFilter,
      success: createdPageOf(Beat),
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      payload: BeatCreate,
      success: Beat,
      error: NotFound,
    }),
    HttpApiEndpoint.get("findById", "/:beatId", {
      params: { campaignId: CampaignId, sessionId: SessionId, beatId: BeatId },
      success: Beat,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:beatId", {
      params: { campaignId: CampaignId, sessionId: SessionId, beatId: BeatId },
      payload: BeatUpdate,
      success: Beat,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:beatId", {
      params: { campaignId: CampaignId, sessionId: SessionId, beatId: BeatId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/sessions/:sessionId/beats")
  .middleware(Authorization) {}

/**
 * What happened on the night — the thing a DM reads before the next game, and
 * the thing a player reads afterwards.
 *
 * **Two endpoints, because there are two audiences and they are told different
 * amounts.** `/recap` is the DM's and is behind the `DmActor` gate, so a player
 * asking for it gets the ordinary 404; `/recap/player` answers the narrower
 * `PlayerSessionRecap`, in which a monster carries a band and no armour class.
 * Distinct paths and distinct response schemas rather than one path that
 * filters — the captain's decision of 2026-08-12 — because a filter discloses
 * everything the day somebody forgets it, and a separate schema has to be
 * *written* before it can leak. See `PlayerSessionRecap`.
 *
 * Neither is stored, and there is no `POST`, `PATCH` or `DELETE` here because
 * there is nothing to write. See `SessionRecap` for what is assembled and from
 * where.
 *
 * Its own group rather than a sixth endpoint on `sessions`, because it is not
 * a session — it reaches five tables, and a client asking for one is asking a
 * different question from a client asking for the row. It shares `live`'s
 * prefix for the same reason `live` has it: both hang off one night.
 *
 * **The recap has two consumers and only one implementation.** The Chronicle
 * screen is one; the assistant's `sessionRecap` tool is the other, and it runs
 * on the server. That is why this is assembled here rather than composed in
 * the client the way `campaign/load.ts` composes a screen — composed there, the
 * assistant would write a second version, and the two would come to disagree
 * about what happened last session. It is also why it is behind `Authorization`
 * like everything else: the tool inherits the actor rather than being given a
 * path around it.
 */
class RecapGroup extends HttpApiGroup.make("recap")
  .add(
    HttpApiEndpoint.get("read", "/recap", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      success: SessionRecap,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.get("readAsPlayer", "/recap/player", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      success: PlayerSessionRecap,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/sessions/:sessionId")
  .middleware(Authorization) {}

/**
 * What is on this table **right now**, to somebody sitting at it.
 *
 * The read behind the player's live banner — *"The Salt Road is playing right
 * now · session 12 · round 3 · Brannoc is up"* — and behind the *Go to the
 * table* action beside it. Both were drawn on `CharacterSheet.jsx` and
 * `MyCharacters.jsx` from the fourth delivery onwards with nothing behind
 * either; this is what they read.
 *
 * **Its own group, for the reason `recap` is its own group**: it is not a
 * session and it is not a run. The table read answers *"is anything happening,
 * and what"* across three tables at once, the events endpoint is a contentless
 * player doorbell, and the rolls endpoint is the own-character log.
 *
 * **`null` is the ordinary success, not a failure.** Most of the time nobody is
 * playing, and a 404 for the common case would make the banner's absence
 * indistinguishable from a campaign this actor cannot reach. The 404 is kept
 * for exactly that second thing — a campaign a non-member, a revoked member or
 * a mis-scoped credential named — which is the ordinary refusal every other
 * campaign-scoped read gives.
 *
 * **It is not gated by `DmActor`, and it does not need to be**, which is the
 * distinction `repo/DmActor.ts` draws: the gate is for a read whose *player
 * projection diverges from the DM's*. This read has no DM projection at all —
 * a DM has the runner, `sessions.list` and `runs.list`, all of which say more
 * than this and are gated or DM-only already. What bounds it is
 * `PlayerLiveTable`, which cannot carry a number the DM was keeping, and
 * `repo/visibility.ts`, which decides whether there is a night, a fight or a
 * combatant to speak of at all. A DM may call it too, and gets the same narrow
 * answer — which is how *"what does the banner say to my players"* is one
 * request rather than a second implementation.
 */
class PlayerTableGroup extends HttpApiGroup.make("table")
  .add(
    HttpApiEndpoint.get("read", "/table", {
      params: { campaignId: CampaignId },
      success: Schema.NullOr(PlayerLiveTable),
      error: NotFound,
    }),
    HttpApiEndpoint.get("events", "/table/sessions/:sessionId/events", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      query: SessionLogFilter,
      success: HttpApiSchema.StreamSse({ events: PlayerLiveEvent }),
      error: NotFound,
    }),
    HttpApiEndpoint.get("rolls", "/table/sessions/:sessionId/characters/:characterId/rolls", {
      params: { campaignId: CampaignId, sessionId: SessionId, characterId: CharacterId },
      query: RollListFilter,
      success: Schema.Array(Roll),
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId")
  .middleware(Authorization) {}

/**
 * Searching one campaign's record — its notes, its beats and its bestiary.
 *
 * **Campaign-scoped in the path, and that is a security property rather than a
 * routing preference.** A top-level `/search` would be an account-wide read and
 * would have nothing to hand `campaignInScope` (`repo/visibility.ts`), so a
 * credential minted for one table would reach every other table the same DM
 * runs. That is precisely the leak the auth plan closed, and a search endpoint
 * is the worst place to reopen it: cross-campaign results look like a feature.
 *
 * One endpoint, one union, one set of predicates. The assistant's
 * `searchCampaign` tool calls the same repository method this handler calls —
 * see `SearchHit` — so there is exactly one place a `tsvector` is queried and
 * no second answer to what an actor may read.
 *
 * Cross-campaign search is deliberately not offered. It would have to intersect
 * `campaignInScope` per campaign, and no surface asks for it.
 */
class SearchGroup extends HttpApiGroup.make("search")
  .add(
    HttpApiEndpoint.get("search", "/", {
      params: { campaignId: CampaignId },
      query: SearchFilter,
      success: Schema.Array(SearchHit),
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/search")
  .middleware(Authorization) {}

/**
 * Hob, the assistant.
 *
 * **Campaign-scoped in the path, and for once that is more than a security
 * property — it is the whole grounding model.** The campaign id is not a
 * parameter of any tool Hob has; it is closed over by the tool handlers from
 * this path segment. So the model cannot *express* a call into another
 * campaign, let alone make one, and the actor-scoped predicate underneath is
 * the second lock rather than the only one. A top-level `/hob` would have
 * needed the campaign in the payload, which is a client claim, or in a tool
 * parameter, which is a model claim.
 *
 * Two endpoints and no more:
 *
 * - `status` says whether a model endpoint is configured. The panel asks
 *   before it offers a composer, so an unconfigured server produces the honest
 *   *nothing is behind this panel* rather than an input that drops questions.
 *   It is behind `Authorization` like everything else, and reading the
 *   campaign first means an unreachable one is a 404 rather than a disclosure
 *   that the assistant is switched on.
 * - `ask` streams the answer. A `POST` because the thread is a payload, and a
 *   stream because the designers chose a persistent conversation surface over
 *   a one-shot palette — a blocking call that returns a finished paragraph is
 *   a different product. Authorization happens *before* a stream is returned,
 *   so a denial is a real 404 with a JSON body and not a failure event inside
 *   a 200 nobody is listening for. Same ordering as `live.events`.
 *
 * - `threads` and `turns` are the conversation, read back. The panel resumes
 *   the newest thread on open, which is the whole of "it is still there after a
 *   reload"; a picker over the rest is a surface the designers have not drawn.
 * - `accept` is the **only** thing in the product that writes
 *   `origin = 'assistant'`. It takes no content payload at all, and that is the
 *   point: the row is materialised from the proposal the *server* stored on
 *   that turn, so a client cannot mint assistant provenance for prose it wrote
 *   itself. `Conflict` is a proposal already accepted, or a beat with no
 *   session in progress to file it against; `NotFound` is everything else,
 *   including a turn that proposed nothing.
 *
 * The accept path names campaign, thread *and* turn for the reason every nested
 * endpoint here does: a parent id is a client claim, and binding the foreign key
 * is what makes "is this turn in this thread, and is this thread in this
 * campaign" one question rather than three that are each satisfiable apart.
 */
class HobGroup extends HttpApiGroup.make("hob")
  .add(
    HttpApiEndpoint.get("status", "/", {
      params: { campaignId: CampaignId },
      success: HobStatus,
      error: NotFound,
    }),
    HttpApiEndpoint.post("ask", "/ask", {
      params: { campaignId: CampaignId },
      payload: HobAsk,
      success: HttpApiSchema.StreamSse({ events: HobEvent }),
      error: [NotFound, HobUnavailable],
    }),
    HttpApiEndpoint.get("threads", "/threads", {
      params: { campaignId: CampaignId },
      success: Schema.Array(HobThread),
      error: NotFound,
    }),
    HttpApiEndpoint.get("turns", "/threads/:threadId/turns", {
      params: { campaignId: CampaignId, threadId: AssistantThreadId },
      success: Schema.Array(HobTurn),
      error: NotFound,
    }),
    HttpApiEndpoint.post("accept", "/threads/:threadId/turns/:turnId/accept", {
      params: {
        campaignId: CampaignId,
        threadId: AssistantThreadId,
        turnId: AssistantTurnId,
      },
      payload: Schema.Struct({}),
      success: HobAccepted,
      error: [NotFound, Conflict],
    }),
  )
  .prefix("/campaigns/:campaignId/hob")
  .middleware(Authorization) {}

/**
 * The campaign's cast: structured NPCs, and the creator's rehearsal with each.
 *
 * **Creator-only, in every endpoint.** An NPC row carries creator-only private
 * material, and this slice has no player projection at all, so the whole group
 * answers through the `CampaignCreatorActor` path: a player, a stranger and a
 * revoked member all get the campaign's ordinary `NotFound`. When a player
 * channel arrives it will be a *distinct schema on a distinct path* — the
 * `PlayerSessionRecap` rule — never a field filter over `Npc`.
 *
 * `rehearse` is `hob.ask`'s protocol without the tools: a `POST` that answers a
 * stream, authorised before a byte of body so a denial is a 404 and an
 * unconfigured server a 503 (`HobUnavailable`, the same class, so one client
 * classifier covers both surfaces). `rehearsal` is the status read the screen
 * makes before it offers a composer, and it carries the prompt metadata the
 * inspector shows — the template version and a token estimate, never the
 * prompt. `archive` and `restore` are the reversible soft delete: transcripts
 * hang off an NPC and are worth keeping.
 */
class NpcsGroup extends HttpApiGroup.make("npcs")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      query: NpcListFilter,
      success: Schema.Array(Npc),
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId },
      payload: NpcCreate,
      success: Npc,
      error: NotFound,
    }),
    HttpApiEndpoint.get("sources", "/sources", {
      params: { campaignId: CampaignId },
      success: Schema.Array(NpcSource),
      error: NotFound,
    }),
    HttpApiEndpoint.post("copyFromSource", "/sources/:sourceNpcId/copy", {
      params: { campaignId: CampaignId, sourceNpcId: NpcId },
      payload: Schema.Struct({}),
      success: Npc,
      error: NotFound,
    }),
    HttpApiEndpoint.get("findById", "/:npcId", {
      params: { campaignId: CampaignId, npcId: NpcId },
      success: Npc,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:npcId", {
      params: { campaignId: CampaignId, npcId: NpcId },
      payload: NpcUpdate,
      success: Npc,
      error: [NotFound, Conflict],
    }),
    HttpApiEndpoint.post("archive", "/:npcId/archive", {
      params: { campaignId: CampaignId, npcId: NpcId },
      payload: Schema.Struct({}),
      success: Npc,
      error: NotFound,
    }),
    HttpApiEndpoint.post("restore", "/:npcId/restore", {
      params: { campaignId: CampaignId, npcId: NpcId },
      payload: Schema.Struct({}),
      success: Npc,
      error: NotFound,
    }),
    HttpApiEndpoint.get("rehearsal", "/:npcId/rehearsal", {
      params: { campaignId: CampaignId, npcId: NpcId },
      success: NpcRehearsalStatus,
      error: NotFound,
    }),
    HttpApiEndpoint.post("rehearse", "/:npcId/rehearse", {
      params: { campaignId: CampaignId, npcId: NpcId },
      payload: NpcRehearse,
      success: HttpApiSchema.StreamSse({ events: NpcEvent }),
      error: [NotFound, HobUnavailable],
    }),
    HttpApiEndpoint.get("threads", "/:npcId/threads", {
      params: { campaignId: CampaignId, npcId: NpcId },
      success: Schema.Array(NpcThread),
      error: NotFound,
    }),
    HttpApiEndpoint.get("turns", "/:npcId/threads/:threadId/turns", {
      params: { campaignId: CampaignId, npcId: NpcId, threadId: NpcThreadId },
      success: Schema.Array(NpcTurn),
      error: NotFound,
    }),
    HttpApiEndpoint.get("knowledge", "/:npcId/knowledge", {
      params: { campaignId: CampaignId, npcId: NpcId },
      success: Schema.Array(NpcKnowledgeFact),
      error: NotFound,
    }),
    HttpApiEndpoint.post("createKnowledge", "/:npcId/knowledge", {
      params: { campaignId: CampaignId, npcId: NpcId },
      payload: NpcKnowledgeFactCreate,
      success: NpcKnowledgeFact,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("updateKnowledge", "/:npcId/knowledge/:factId", {
      params: { campaignId: CampaignId, npcId: NpcId, factId: NpcKnowledgeFactId },
      payload: NpcKnowledgeFactUpdate,
      success: NpcKnowledgeFact,
      error: NotFound,
    }),
    HttpApiEndpoint.post("retireKnowledge", "/:npcId/knowledge/:factId/retire", {
      params: { campaignId: CampaignId, npcId: NpcId, factId: NpcKnowledgeFactId },
      payload: Schema.Struct({}),
      success: NpcKnowledgeFact,
      error: NotFound,
    }),
    HttpApiEndpoint.get("memories", "/:npcId/memories", {
      params: { campaignId: CampaignId, npcId: NpcId },
      success: Schema.Array(NpcMemory),
      error: NotFound,
    }),
    HttpApiEndpoint.post("draftMemory", "/:npcId/memories", {
      params: { campaignId: CampaignId, npcId: NpcId },
      payload: NpcMemoryCreate,
      success: NpcMemory,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("updateMemory", "/:npcId/memories/:memoryId", {
      params: { campaignId: CampaignId, npcId: NpcId, memoryId: NpcMemoryId },
      payload: NpcMemoryUpdate,
      success: NpcMemory,
      error: NotFound,
    }),
    HttpApiEndpoint.post("approveMemory", "/:npcId/memories/:memoryId/approve", {
      params: { campaignId: CampaignId, npcId: NpcId, memoryId: NpcMemoryId },
      payload: Schema.Struct({}),
      success: NpcMemory,
      error: NotFound,
    }),
    HttpApiEndpoint.post("retireMemory", "/:npcId/memories/:memoryId/retire", {
      params: { campaignId: CampaignId, npcId: NpcId, memoryId: NpcMemoryId },
      payload: Schema.Struct({}),
      success: NpcMemory,
      error: NotFound,
    }),
    HttpApiEndpoint.post("resetMemories", "/:npcId/memories/reset", {
      params: { campaignId: CampaignId, npcId: NpcId },
      payload: Schema.Struct({}),
      success: Schema.Array(NpcMemory),
      error: NotFound,
    }),
    HttpApiEndpoint.get("playerList", "/-/player", {
      params: { campaignId: CampaignId },
      success: Schema.Array(PlayerNpc),
      error: NotFound,
    }),
    HttpApiEndpoint.get("playerFindById", "/:npcId/player", {
      params: { campaignId: CampaignId, npcId: NpcId },
      success: PlayerNpc,
      error: NotFound,
    }),
    HttpApiEndpoint.get("playerStatus", "/:npcId/player/status", {
      params: { campaignId: CampaignId, npcId: NpcId },
      success: NpcPlayerStatus,
      error: NotFound,
    }),
    HttpApiEndpoint.get("playerThreads", "/:npcId/player/threads", {
      params: { campaignId: CampaignId, npcId: NpcId },
      success: Schema.Array(NpcThread),
      error: NotFound,
    }),
    HttpApiEndpoint.get("playerTurns", "/:npcId/player/threads/:threadId/turns", {
      params: { campaignId: CampaignId, npcId: NpcId, threadId: NpcThreadId },
      success: Schema.Array(NpcTurn),
      error: NotFound,
    }),
    HttpApiEndpoint.post("talk", "/:npcId/player/talk", {
      params: { campaignId: CampaignId, npcId: NpcId },
      payload: NpcTalk,
      success: HttpApiSchema.StreamSse({ events: NpcEvent }),
      error: [NotFound, HobUnavailable, RateLimited],
    }),
    HttpApiEndpoint.get("sessionList", "/-/sessions/:sessionId", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      success: Schema.Array(PlayerNpc),
      error: NotFound,
    }),
    HttpApiEndpoint.post("openSession", "/:npcId/sessions/:sessionId/open", {
      params: { campaignId: CampaignId, npcId: NpcId, sessionId: SessionId },
      payload: Schema.Struct({}),
      success: NpcThread,
      error: [NotFound, Conflict],
    }),
    HttpApiEndpoint.get("sessionStatus", "/:npcId/sessions/:sessionId/status", {
      params: { campaignId: CampaignId, npcId: NpcId, sessionId: SessionId },
      success: NpcPlayerStatus,
      error: NotFound,
    }),
    HttpApiEndpoint.get("sessionTurns", "/:npcId/sessions/:sessionId/turns", {
      params: { campaignId: CampaignId, npcId: NpcId, sessionId: SessionId },
      success: Schema.Array(NpcTurn),
      error: NotFound,
    }),
    HttpApiEndpoint.post("sessionTalk", "/:npcId/sessions/:sessionId/talk", {
      params: { campaignId: CampaignId, npcId: NpcId, sessionId: SessionId },
      payload: NpcSessionTalk,
      success: HttpApiSchema.StreamSse({ events: NpcEvent }),
      error: [NotFound, HobUnavailable],
    }),
  )
  .prefix("/campaigns/:campaignId/npcs")
  .middleware(Authorization) {}

/**
 * The live session: starting a fight, running it, and ending it.
 *
 * Nested under the session because a run belongs to one night — and, as
 * everywhere else here, the campaign stays in the path so the read predicate is
 * handed the campaign the session must sit inside rather than inferring it from
 * an id a client supplied.
 *
 * `start` is the only endpoint that writes more than one table: it creates the
 * run, seeds a combatant per party member and per creature-instance on the
 * roster, points the session at it, and appends the first log line — in one
 * transaction, because a half-seeded fight is worse than no fight.
 *
 * `end` is a `POST` rather than a `DELETE` because nothing is deleted. The run,
 * its combatants and its log survive: `EncounterRunner.jsx:164` promises the DM
 * that "initiative order and hit points are saved to Session 12", and a fight
 * that can be reopened next week is the point of §1.4's "interrupted and
 * resumed".
 */
/**
 * Group Hob: the assistant over the group's canonical record.
 *
 * `HobGroup`'s shape, group-scoped: the group is a path segment closed over by
 * the handlers and never a tool parameter, the threads are the group's one
 * shared conversation (any live member resumes it — the chronicle's own
 * audience), and the accept keeps the one thing this surface can offer, a
 * chronicle line. What the assistant may know here is
 * `decision-group-hob-boundary.md`'s list — played sessions, story beats,
 * combat outcomes, shared recaps — and never anybody's unplayed prep;
 * `hob-group.test.ts` measures that at the provider wire.
 */
class HobGroupSurface extends HttpApiGroup.make("hobGroup")
  .add(
    HttpApiEndpoint.get("status", "/", {
      params: { groupId: GroupId },
      success: GroupHobStatus,
      error: NotFound,
    }),
    HttpApiEndpoint.post("ask", "/ask", {
      params: { groupId: GroupId },
      payload: HobAsk,
      success: HttpApiSchema.StreamSse({ events: HobEvent }),
      error: [NotFound, HobUnavailable],
    }),
    HttpApiEndpoint.get("threads", "/threads", {
      params: { groupId: GroupId },
      success: Schema.Array(HobThread),
      error: NotFound,
    }),
    HttpApiEndpoint.get("turns", "/threads/:threadId/turns", {
      params: { groupId: GroupId, threadId: AssistantThreadId },
      success: Schema.Array(HobTurn),
      error: NotFound,
    }),
    HttpApiEndpoint.post("accept", "/threads/:threadId/turns/:turnId/accept", {
      params: {
        groupId: GroupId,
        threadId: AssistantThreadId,
        turnId: AssistantTurnId,
      },
      payload: Schema.Struct({}),
      success: HobAccepted,
      error: [NotFound, Conflict],
    }),
  )
  .prefix("/groups/:groupId/hob")
  .middleware(Authorization) {}

class RunsGroup extends HttpApiGroup.make("runs")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      success: Schema.Array(EncounterRun),
      error: NotFound,
    }),
    /**
     * `Conflict` when this session already has a fight on the table. Exactly
     * one encounter is live — starting a second is a mistake worth saying out
     * loud rather than a silent switch, because the first one's initiative
     * order is still on screen.
     */
    HttpApiEndpoint.post("start", "/", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      payload: EncounterRunStart,
      success: EncounterRun,
      error: [NotFound, Conflict],
    }),
    /**
     * Pick up a fight the last night was finished over.
     *
     * A `POST` to a fixed segment rather than to `/:runId/resume`, because the
     * run it creates lives under *this* session and the predecessor lives under
     * another one — the id in the path would name a row that is not in the
     * path's session, which every other endpoint here refuses on principle.
     *
     * `Conflict` covers the two states the DM can see and understand: this
     * session already has a fight on the table, and that fight has already been
     * resumed somewhere. A fight that was ended rather than carried is a
     * `Conflict` too — it is not missing, it is over.
     */
    HttpApiEndpoint.post("resume", "/resume", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      payload: EncounterRunResume,
      success: EncounterRun,
      error: [NotFound, Conflict],
    }),
    HttpApiEndpoint.get("findById", "/:runId", {
      params: { campaignId: CampaignId, sessionId: SessionId, runId: EncounterRunId },
      success: EncounterRun,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:runId", {
      params: { campaignId: CampaignId, sessionId: SessionId, runId: EncounterRunId },
      payload: EncounterRunUpdate,
      success: EncounterRun,
      error: NotFound,
    }),
    /** Advance initiative, rolling the round over at the end of the order. */
    HttpApiEndpoint.post("nextTurn", "/:runId/next-turn", {
      params: { campaignId: CampaignId, sessionId: SessionId, runId: EncounterRunId },
      payload: NextTurn,
      success: EncounterRun,
      error: NotFound,
    }),
    /** Take the fight off the table. Idempotent — ending an ended run is a no-op. */
    HttpApiEndpoint.post("end", "/:runId/end", {
      params: { campaignId: CampaignId, sessionId: SessionId, runId: EncounterRunId },
      payload: Schema.Struct({}),
      success: EncounterRun,
      error: NotFound,
    }),
    /** Audit rows for Hob's direct resource spends in this fight, newest first. */
    HttpApiEndpoint.get("hobDirectUpdates", "/:runId/hob-direct-updates", {
      params: { campaignId: CampaignId, sessionId: SessionId, runId: EncounterRunId },
      success: Schema.Array(HobDirectResourceUpdate),
      error: NotFound,
    }),
    /** Undo one direct resource spend, if the counter still holds Hob's after value. */
    HttpApiEndpoint.post("undoHobDirectUpdate", "/:runId/hob-direct-updates/:updateId/undo", {
      params: {
        campaignId: CampaignId,
        sessionId: SessionId,
        runId: EncounterRunId,
        updateId: HobDirectResourceUpdateId,
      },
      payload: Schema.Struct({}),
      success: HobDirectResourceUpdate,
      error: [NotFound, Conflict],
    }),
  )
  .prefix("/campaigns/:campaignId/sessions/:sessionId/runs")
  .middleware(Authorization) {}

/**
 * The initiative list — the thing the DM's finger is on all night.
 *
 * `damage` is separate from `update` on purpose: it is a delta, it is the write
 * that happens every few seconds, and it is the one that carries a `requestId`
 * so a double-tap cannot apply twice. See `CombatantDamage`.
 *
 * `remove` is a real delete and the only way a combatant leaves the order.
 * Hit points reaching zero does **not** do it — `EncounterRunner.jsx:107`.
 */
class CombatantsGroup extends HttpApiGroup.make("combatants")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId, sessionId: SessionId, runId: EncounterRunId },
      success: Schema.Array(Combatant),
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId, sessionId: SessionId, runId: EncounterRunId },
      payload: CombatantCreate,
      success: Combatant,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:combatantId", {
      params: {
        campaignId: CampaignId,
        sessionId: SessionId,
        runId: EncounterRunId,
        combatantId: CombatantId,
      },
      payload: CombatantUpdate,
      success: Combatant,
      error: NotFound,
    }),
    HttpApiEndpoint.post("damage", "/:combatantId/damage", {
      params: {
        campaignId: CampaignId,
        sessionId: SessionId,
        runId: EncounterRunId,
        combatantId: CombatantId,
      },
      payload: CombatantDamage,
      success: Combatant,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:combatantId", {
      params: {
        campaignId: CampaignId,
        sessionId: SessionId,
        runId: EncounterRunId,
        combatantId: CombatantId,
      },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/sessions/:sessionId/runs/:runId/combatants")
  .middleware(Authorization) {}

/**
 * The session log, and the live stream over it.
 *
 * **This is the one group where a read is a stream rather than a response**,
 * and it is the only way in which the live surface differs from the CRUD around
 * it — writes are still ordinary `POST`s (§4.3).
 *
 * `log` and `events` are the same query behind two transports, deliberately:
 * both take `since`, both return the rows after it in `seq` order, and both
 * apply the same visibility predicate. A client that cannot hold a connection
 * open polls `log`; a client that can opens `events` and gets the same rows
 * pushed. Reconnect is then not a special path — it is the ordinary path with a
 * cursor, which is why it can be relied on.
 *
 * `events` accepts the cursor two ways. `?since=` is what the derived client
 * uses, because `HttpApiClient` issues a plain `fetch` and a plain `fetch` does
 * not resend `Last-Event-ID`. The header is what a browser's native
 * `EventSource` sends by itself on its automatic reconnect, and honouring it is
 * what makes that reconnect correct for free rather than silently lossy.
 */
class RollsGroup extends HttpApiGroup.make("rolls")
  .add(
    HttpApiEndpoint.post("create", "/rolls", {
      params: { campaignId: CampaignId },
      payload: RollCreate,
      success: Roll,
      error: [NotFound, Conflict],
    }),
    HttpApiEndpoint.get("list", "/sessions/:sessionId/rolls", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      query: RollListFilter,
      success: Schema.Array(Roll),
      error: NotFound,
    }),
    HttpApiEndpoint.get("findById", "/sessions/:sessionId/rolls/:rollId", {
      params: { campaignId: CampaignId, sessionId: SessionId, rollId: RollId },
      success: Roll,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId")
  .middleware(Authorization) {}

class LiveGroup extends HttpApiGroup.make("live")
  .add(
    HttpApiEndpoint.get("log", "/log", {
      params: { campaignId: CampaignId, sessionId: SessionId },
      query: SessionLogFilter,
      success: Schema.Array(SessionEvent),
      error: NotFound,
    }),
    HttpApiEndpoint.get("events", "/runs/:runId/events", {
      params: { campaignId: CampaignId, sessionId: SessionId, runId: EncounterRunId },
      query: { since: SessionLogFilter.since },
      headers: { "last-event-id": Schema.optional(Schema.String) },
      /**
       * Authorization failures are still an ordinary 404 response, not a
       * failure event inside a 200 stream: the handler resolves the actor and
       * checks the run *before* it returns a stream at all.
       */
      success: HttpApiSchema.StreamSse({ events: LiveEvent }),
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/sessions/:sessionId")
  .middleware(Authorization) {}

/**
 * The wire contract. The server implements it and `apps/web` derives its client
 * from it, so request and response shapes cannot drift apart — there is only
 * one declaration and no codegen step between them.
 */
export class TavernsApi extends HttpApi.make("taverns")
  .add(HealthGroup)
  .add(MeGroup)
  .add(InvitePreviewGroup)
  .add(JoinGroup)
  .add(GroupsGroup)
  .add(GroupHistoryGroup)
  .add(GroupLibraryGroup)
  .add(HobGroupSurface)
  .add(GroupMembersGroup)
  .add(CampaignsGroup)
  .add(MembersGroup)
  .add(InvitesGroup)
  .add(SessionsGroup)
  .add(PartyGroup)
  .add(NotesGroup)
  .add(EncountersGroup)
  .add(CreaturesGroup)
  .add(CharacterOptionsGroup)
  .add(LibraryGroup)
  .add(EncounterCreaturesGroup)
  .add(PrepGroup)
  .add(BeatsGroup)
  .add(RollsGroup)
  .add(SearchGroup)
  .add(HobGroup)
  .add(NpcsGroup)
  .add(RunsGroup)
  .add(CombatantsGroup)
  .add(LiveGroup)
  .add(RecapGroup)
  .add(PlayerTableGroup) {}
