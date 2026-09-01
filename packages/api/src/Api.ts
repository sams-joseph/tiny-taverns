import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { AccountIdentity } from "./Account.js";
import { Authorization } from "./Actor.js";
import { Beat, BeatCreate, BeatUpdate } from "./Beat.js";
import { Campaign, CampaignCreate, CampaignUpdate } from "./Campaign.js";
import {
  Character,
  CharacterAssign,
  CharacterCreate,
  CharacterDamage,
  CharacterOwnCreate,
  CharacterOwnUpdate,
  CharacterUpdate,
} from "./Character.js";
import {
  CharacterOption,
  ClassProgression,
  OptionDerive,
  OptionFilter,
  OptionLibraryCreate,
  OptionLibraryUpdate,
  OptionUpdate,
  OptionVocabulary,
} from "./CharacterOption.js";
import { Combatant, CombatantCreate, CombatantDamage, CombatantUpdate } from "./Combatant.js";
import {
  Creature,
  CreatureCreate,
  CreatureFacets,
  CreatureFilter,
  CreatureLibraryCreate,
  CreatureLibraryUpdate,
  CreatureSort,
  CreatureUpdate,
  LibraryFilter,
} from "./Creature.js";
import { Encounter, EncounterCreate, EncounterUpdate } from "./Encounter.js";
import {
  Equipment,
  EquipmentCreate,
  EquipmentFilter,
  EquipmentLibraryCreate,
  EquipmentLibraryUpdate,
  EquipmentSort,
  EquipmentUpdate,
} from "./Equipment.js";
import {
  MagicItem,
  MagicItemCreate,
  MagicItemFilter,
  MagicItemLibraryCreate,
  MagicItemLibraryUpdate,
  MagicItemSort,
  MagicItemUpdate,
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
import { Conflict, NotFound } from "./Errors.js";
import {
  AssistantThreadId,
  AssistantTurnId,
  BeatId,
  CampaignId,
  CharacterId,
  CharacterOptionId,
  CombatantId,
  CreatureId,
  EncounterCreatureId,
  EncounterId,
  EncounterRunId,
  EquipmentId,
  InviteId,
  MagicItemId,
  SpellId,
  NoteId,
  PrepItemId,
  SessionId,
} from "./Ids.js";
import {
  CampaignInvite,
  InviteCreate,
  InvitePreview,
  InviteRedeemed,
  InviteToken,
  IssuedInvite,
} from "./Invite.js";
import { CampaignMember, CampaignMembership } from "./Membership.js";
import { Note, NoteCreate, NoteUpdate } from "./Note.js";
import { createdPageFilter, createdPageOf, pageOf } from "./Page.js";
import { PlayerLiveTable } from "./PlayerLive.js";
import { PlayerSessionRecap } from "./PlayerRecap.js";
import { PrepItem, PrepItemCreate, PrepItemUpdate } from "./PrepItem.js";
import { SessionRecap } from "./Recap.js";
import { SearchFilter, SearchHit } from "./Search.js";
import { Session, SessionCreate, SessionUpdate } from "./Session.js";
import {
  Spell,
  SpellCreate,
  SpellFilter,
  SpellLibraryCreate,
  SpellLibraryUpdate,
  SpellSort,
  SpellUpdate,
} from "./Spell.js";
import { LiveEvent, SessionEvent, SessionLogFilter } from "./SessionEvent.js";

/** Liveness. The one endpoint with no actor and no campaign. */
export class HealthStatus extends Schema.Class<HealthStatus>("HealthStatus")({
  status: Schema.Literals(["ok"]),
  uptime: Schema.Finite,
}) {}

class HealthGroup extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check", "/health", { success: HealthStatus }),
) {}

class CampaignsGroup extends HttpApiGroup.make("campaigns")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(Campaign) }),
    HttpApiEndpoint.post("create", "/", {
      payload: CampaignCreate,
      success: Campaign,
    }),
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
 * exception is worth reading rather than treating as drift: a PATCH asks the
 * predicate about the row's own `campaign_id`, so there is nothing for a caller
 * to claim; **an insert has no row to derive that from**, and where a new
 * character goes is genuinely the caller's to say. It is a claim, refused by
 * `ensureCampaignReadable` exactly as every other create in the product refuses
 * one. What the endpoint still does not let a caller name is the *account* — so
 * the group's real property is intact where it matters: nothing here answers
 * about, or writes for, anybody but the credential.
 *
 * No endpoint here is a second answer to a campaign-scoped one. `campaigns`
 * composes the identical predicate `campaigns.list` does (see
 * `CampaignMembership`), so the two cannot disagree about reach; what it adds is
 * the role, which is a fact about the pair and has nowhere on the campaign row
 * to live. `archivedCampaigns` is that same read over the other shelf — one
 * repository method, one query, one predicate, and the shelf as its argument.
 * `characters` composes the identical predicate `characters.list` does,
 * narrowed to the caller's own rows — see `repo/visibility.ts`'s
 * `ownRowReadable`, which is `ownedRowReadable` *conjoined* with ownership and
 * therefore cannot be wider than it.
 *
 * `identity` is the one read here that is about the account rather than about
 * what it has, and it is where the group's own property is at its plainest: it
 * takes nothing at all, so the account it answers about is the credential's by
 * construction.
 *
 * The three writes are the whole of what a player may do to a `character`, and
 * they follow one rule from three sides: **which rows** is a predicate
 * conjoined with ownership, so no write here reaches a row `characters` above
 * would not already answer, and **which columns** is a payload of the player's
 * own rather than the DM's, so what may move is a fact about which schema
 * exists.
 *
 * - `createCharacter` — `CharacterOwnCreate`, gated by `ensureCampaignReadable`,
 *   with `account_id` from `CurrentActor` and nowhere on the wire to put one.
 * - `updateCharacter` — the product's first player write, over `ownRowWritable`.
 * - `deleteCharacter` — the same predicate as the PATCH, and it exists because
 *   creating a character is now something a player can abandon halfway.
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
     * **A list, not a row, and a character still belongs to exactly one
     * campaign.** The tempting shape — one character row several campaigns share
     * — would need a predicate that reaches across campaigns, which is the one
     * thing the whole membership model contains. Bringing a character to a
     * second table is a copy, shaped like `creatures/:id/derive`; it is not
     * built, and this endpoint is not the place it would go.
     *
     * It answers `Character` unchanged rather than a shape carrying the
     * campaign's *name*. `campaignId` is the join key and `GET /me/campaigns` is
     * the read that names campaigns — a name here would be a second answer to
     * what a campaign is called, which is the rule `CampaignMember.accountId`
     * already follows from the other side.
     */
    HttpApiEndpoint.get("characters", "/characters", {
      success: Schema.Array(Character),
    }),
    /**
     * **The first write in the product a player may make**, and the only
     * endpoint outside `join` that a non-DM can change anything through.
     *
     * It is here rather than in `characters` for the reason the whole group is
     * here: **it names no campaign, so there is none for a caller to claim.**
     * Everywhere else a parent id in a path is a client claim the predicate has
     * to refuse; here the row's own `campaign_id` is what the membership,
     * credential-scope and master-toggle clauses are asked about, so the
     * campaign a request reaches is by construction the campaign the row is in.
     * It is also where the player's own screen already reads from — `mine`
     * above lists it, this patches one of them.
     *
     * Two boundaries, and neither is a check in a handler:
     *
     * - **Which rows** — `repo/visibility.ts`'s `ownRowWritable`: yours, inside
     *   a campaign you hold a live membership of, through a credential that
     *   reaches it, while the DM has shared it. Strictly narrower than the read
     *   beside it.
     * - **Which columns** — `CharacterOwnUpdate`, which has no field for
     *   `hpCurrent`, `tempHp`, `conditions`, `visibility` or `accountId`. The
     *   live half of a character is not something this payload can say.
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
     * **A player writes down a character of their own** — the first row a
     * non-DM has ever been able to bring into being, and the endpoint that
     * makes `#/play/campaigns/:c/characters/new` possible.
     *
     * Until this existed, `characters.create` was the only way a `character`
     * row came about and it composes `campaignWritable`, which requires
     * `isDm`. So a player at a shared table could not create a character at
     * all — they waited for their DM to type one up and hand it over with
     * `CharacterAssign`. That door is unchanged; this is a second one, and the
     * two differ in exactly the way the group they each live in does.
     *
     * ### The one endpoint here that names a campaign, and why it has to
     *
     * Everywhere else in this group the property is *it names no campaign, so
     * there is none for a caller to claim* — a PATCH asks the predicate about
     * the row's own `campaign_id`, so the campaign a request reaches is by
     * construction the campaign the row is in. **An insert has no row to derive
     * that from.** Where the character goes is genuinely the caller's to say,
     * so it is a path segment and therefore a claim, exactly as it is on every
     * other create in the product.
     *
     * What refuses a false one is `ensureCampaignReadable` — a live membership,
     * a credential that reaches this campaign, and `isDm OR campaign.visibility
     * = 'shared'`. That is *the campaign half of `withinReadableCampaign`*, the
     * piece `ownRowReadable` and `ownRowWritable` already share and do not
     * restate, which is what makes the guarantee worth having: a row created
     * through this gate is readable and writable by its creator afterwards by
     * the same clauses, rather than by two lists kept in step. A player at a
     * table the DM has not shared is refused here with the same `NotFound`
     * everything else at that table gives them. **No new predicate.**
     *
     * ### Whose it is, and where that is decided
     *
     * `account_id` is `CurrentActor`'s, taken server-side. It is not on
     * `CharacterOwnCreate` and there is nowhere on this endpoint to put one —
     * the `Invites.redeem` shape verbatim, which *"takes a token and nothing
     * else — no account id (it is `CurrentActor`'s, so a caller cannot invite
     * somebody else in)"*. So the property `CharacterAssign` protects by being
     * a separate DM-only endpoint is protected here by the payload having no
     * such field, and a player cannot create a character for anybody else any
     * more than they can re-point one.
     *
     * **The DM's assign is not on this path and does not need to run.**
     * Requiring it would mean a player creating a character they then cannot
     * read. It stays what it is for: the character a DM types up mid-campaign,
     * and reassignment.
     *
     * ### It fails closed, and that is the column default rather than a choice
     *
     * `CharacterOwnCreate` has no `visibility`, so a new character is `dm`. Its
     * creator reads it because they own it and the DM reads it because `isDm`
     * is a disjunct of the same predicate; nobody else at the table does until
     * the DM shares it. A DM passing this gate through `isDm` may use it too —
     * harmless, and not a reason to narrow an endpoint whose audience is the
     * people who could not write anything before.
     */
    HttpApiEndpoint.post("createCharacter", "/campaigns/:campaignId/characters", {
      params: { campaignId: CampaignId },
      payload: CharacterOwnCreate,
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
     * `ownRowWritable`, the same predicate `updateCharacter` composes and
     * therefore the same set of rows: yours, in a campaign you hold a live
     * membership of, through a credential that reaches it, while the DM has
     * shared it. Somebody else's `shared` character is refused, an unassigned
     * one is refused (`account_id = me` never matches null), and both give the
     * ordinary `NotFound` rather than saying which.
     *
     * **It is not the DM's delete under another name.** `characters.remove`
     * composes `rowWritable` and reaches every character at the table; this
     * reaches one account's own. Neither is wider than the other where they
     * overlap, and the DM's stays the answer to *"somebody left and their
     * character goes with them"*.
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
  )
  .prefix("/campaigns/:campaignId/members")
  .middleware(Authorization) {}

/**
 * Inviting a player to the table — the DM's half.
 *
 * Campaign-scoped and DM-only, through the ordinary `campaignWritable`
 * predicate: an invitation is a credential, so listing or minting one is not
 * something a player at the table may do. See `CampaignInvite` for the four
 * lifetime rules and why each is the choice that fails safe.
 *
 * `create` is the only endpoint in the product that answers with a secret, and
 * it answers with it exactly once — the server keeps a digest, so a list can
 * never show it again. `revoke` is a `POST` rather than a `DELETE` because
 * nothing is deleted: the row survives with `revokedAt` set, which is what makes
 * a withdrawn invitation legible in the list rather than simply absent from it.
 */
class InvitesGroup extends HttpApiGroup.make("invites")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      success: Schema.Array(CampaignInvite),
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId },
      payload: InviteCreate,
      success: IssuedInvite,
      error: NotFound,
    }),
    HttpApiEndpoint.post("revoke", "/:inviteId/revoke", {
      params: { campaignId: CampaignId, inviteId: InviteId },
      payload: Schema.Struct({}),
      success: CampaignInvite,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/invites")
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

class CharactersGroup extends HttpApiGroup.make("characters")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      success: Schema.Array(Character),
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId },
      payload: CharacterCreate,
      success: Character,
      error: [NotFound, Conflict],
    }),
    HttpApiEndpoint.get("findById", "/:characterId", {
      params: { campaignId: CampaignId, characterId: CharacterId },
      success: Character,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:characterId", {
      params: { campaignId: CampaignId, characterId: CharacterId },
      payload: CharacterUpdate,
      success: Character,
      error: [NotFound, Conflict],
    }),
    /**
     * Whose character it is — the DM's act, and the one that makes
     * `character.account_id` mean something.
     *
     * Its own endpoint for the reason `CharacterAssign` gives: the PATCH is
     * where a player's own edits will land, and the owner of a row is the field
     * that must not be reachable from there.
     */
    HttpApiEndpoint.post("assign", "/:characterId/assign", {
      params: { campaignId: CampaignId, characterId: CharacterId },
      payload: CharacterAssign,
      success: Character,
      error: NotFound,
    }),
    /**
     * The delta, and the only way a current hit point moves outside a fight.
     *
     * Its own endpoint rather than a field on the PATCH above, for the reason
     * `combatants.damage` has one: it is the write that repeats, so it carries
     * a `requestId`, and it is the write whose *meaning* is arithmetic rather
     * than assignment.
     */
    HttpApiEndpoint.post("damage", "/:characterId/damage", {
      params: { campaignId: CampaignId, characterId: CharacterId },
      payload: CharacterDamage,
      success: Character,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:characterId", {
      params: { campaignId: CampaignId, characterId: CharacterId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/characters")
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
 * The bestiary: the campaign's own creatures *and* the global `system` corpus,
 * in one list.
 *
 * **Campaign-scoped in the path, even though half the rows it returns are
 * global.** The report sketched a top-level `/creatures`, but the same report
 * settles that an authored or imported creature belongs to a campaign
 * (§1.3) — so a top-level list would have to union across every campaign the
 * credential reaches and then explain what a write to it meant. Hanging the
 * group off the campaign makes the reachable set exactly "this campaign's
 * creatures plus the shared corpus", which is what `Bestiary.jsx` renders and
 * what an encounter roster may point at. The path is also the *only* thing that
 * gates the global rows: a system creature is reachable through a campaign this
 * actor can read, and through nothing else.
 *
 * `derive` is the reskin. A DM cannot edit a `system` creature — the write
 * predicate needs `campaign_id` to equal the campaign in the path, and a global
 * row's is null — so `derive` copies it into this campaign as an `authored` row
 * with `derivedFrom` set, applying the patch in the same request.
 */
class CreaturesGroup extends HttpApiGroup.make("creatures")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      query: CreatureFilter,
      success: pageOf(Creature, CreatureSort),
      error: NotFound,
    }),
    /**
     * Every environment the creatures this list can reach are tagged with.
     *
     * Its own read rather than a field on the page, because the chip row is a
     * fact about **the corpus** and a page is a fact about fifty rows of it.
     * Derived from the answers instead, a chip would exist only for an
     * environment that happened to be on the first page — and pressing one
     * narrows the query now, so later pages are narrower still and the row could
     * never grow back. A control that can filter itself out of existence is the
     * shape this codebase refuses.
     *
     * Same predicate as `list`, so a chip cannot name something the list will
     * not return.
     */
    HttpApiEndpoint.get("environments", "/environments", {
      params: { campaignId: CampaignId },
      success: Schema.Array(Schema.String),
      error: NotFound,
    }),
    HttpApiEndpoint.get("facets", "/facets", {
      params: { campaignId: CampaignId },
      success: CreatureFacets,
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId },
      payload: CreatureCreate,
      success: Creature,
      error: NotFound,
    }),
    HttpApiEndpoint.get("findById", "/:creatureId", {
      params: { campaignId: CampaignId, creatureId: CreatureId },
      success: Creature,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:creatureId", {
      params: { campaignId: CampaignId, creatureId: CreatureId },
      payload: CreatureUpdate,
      success: Creature,
      error: NotFound,
    }),
    /**
     * `Conflict` when the creature is still on an encounter's roster —
     * deleting it would silently change what that encounter contains.
     */
    HttpApiEndpoint.delete("remove", "/:creatureId", {
      params: { campaignId: CampaignId, creatureId: CreatureId },
      success: HttpApiSchema.NoContent,
      error: [NotFound, Conflict],
    }),
    /**
     * Copy a creature into this campaign, edits applied, origin trail kept —
     * **the third statement of the Library model**: using a monster in a
     * campaign copies it in, and what the campaign then holds is copied state.
     * Editing the original afterwards does not reach the copy.
     *
     * The source may be this campaign's own bestiary, the bundle, or **the
     * caller's own Library**, and nothing else — `copyableIntoCampaign` in
     * `repo/visibility.ts`. Copying between a DM's own tables is still refused.
     */
    HttpApiEndpoint.post("derive", "/:creatureId/derive", {
      params: { campaignId: CampaignId, creatureId: CreatureId },
      payload: CreatureUpdate,
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
 * The bundle, plus whatever this campaign has copied in — which is
 * `corpusRowReadable`, the same predicate and the same shape as the bestiary
 * one path up. It is campaign-scoped in the path for the identical reason: the
 * path is the *only* thing gating the bundled rows, and a top-level list would
 * have nothing to read them through.
 *
 * ### The two readers, and why one of them is a player
 *
 * This is where character options stop resembling monsters. A creature list is
 * the DM's; **this list is the create form's picker**, and the create form is a
 * player's screen. `libraryRowReadable` compares `account_id` to the *reader's*
 * account, so a player can never see their DM's Library — which is exactly why
 * a homebrew class has to be copied into the campaign before it can be picked,
 * and why this list rather than the Library one is what the picker reads.
 *
 * The consequence to hold on to: **`corpusRowReadable` ends in
 * `isDm OR visibility = 'shared'`**, so a copy the DM has not shared is a class
 * no player can choose. That is the seam working rather than a gap, and it is
 * answered by the copy-in dialog sending `shared` out loud — see
 * `OptionUpdate.visibility`.
 *
 * ### There is no `create` here, and that absence is the model
 *
 * The captain's second statement is that **authoring happens in the Library**;
 * a campaign row created directly would be copied state with no original behind
 * it. `POST /campaigns/:c/creatures` still exists and `AGENTS.md` already names
 * it as the one endpoint that contradicts the model — so this group does not
 * inherit the contradiction. A campaign gets an option by `derive` and by
 * nothing else.
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
    HttpApiEndpoint.get("vocabulary", "/vocabulary", {
      params: { campaignId: CampaignId },
      success: OptionVocabulary,
      error: NotFound,
    }),
    /**
     * Every option this campaign offers — all three kinds unless `kind` narrows it.
     *
     * One request rather than three is the common case and is why `kind` is a
     * query parameter: the create form wants classes, races *and* backgrounds,
     * and so does the Rules screen.
     */
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      query: OptionFilter,
      success: Schema.Array(CharacterOption),
      error: NotFound,
    }),
    HttpApiEndpoint.get("findById", "/:optionId", {
      params: { campaignId: CampaignId, optionId: CharacterOptionId },
      success: CharacterOption,
      error: NotFound,
    }),
    HttpApiEndpoint.get("progression", "/:optionId/progression", {
      params: { campaignId: CampaignId, optionId: CharacterOptionId },
      success: ClassProgression,
      error: NotFound,
    }),
    /**
     * Edit this campaign's copy — **including whether the players can see it**,
     * which is the one field a copy has that an original does not.
     *
     * A bundled option lands here readable and not writable, and the refusal is
     * the ordinary `NotFound`: `rowWritable` needs `campaign_id` to equal the
     * campaign in the path, and a bundled row's is null.
     */
    HttpApiEndpoint.patch("update", "/:optionId", {
      params: { campaignId: CampaignId, optionId: CharacterOptionId },
      payload: OptionUpdate,
      success: CharacterOption,
      error: [NotFound, Conflict],
    }),
    /**
     * Take this campaign's copy back off the table.
     *
     * **No `Conflict`, and nothing refuses it**, which is the snapshot working
     * rather than an oversight: a character stores its class as a *label*, so
     * removing the option leaves every character made from it standing with the
     * numbers they are playing. What they lose is a class the next character
     * can be built from.
     */
    HttpApiEndpoint.delete("remove", "/:optionId", {
      params: { campaignId: CampaignId, optionId: CharacterOptionId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
    /**
     * **Bring an option into this campaign** — the copy, and the only way a row
     * gets here.
     *
     * The source is `copyableIntoCampaign`: this campaign's own options, the
     * bundle, or the caller's own Library. Exactly the creature rule, and the
     * Library half is what makes authoring-then-using a path at all.
     *
     * The copy is a **snapshot**. Nothing is read through `derivedFrom`, so
     * editing the original afterwards does not reach it and deleting the
     * original leaves it standing — which is the single most surprising thing
     * about this feature and is why the dialog over it says so in words. A body
     * whose shape contradicts the source kind is a `Conflict`, the same
     * backstop `update` uses.
     */
    HttpApiEndpoint.post("derive", "/:optionId/derive", {
      params: { campaignId: CampaignId, optionId: CharacterOptionId },
      payload: OptionDerive,
      success: CharacterOption,
      error: [NotFound, Conflict],
    }),
  )
  .prefix("/campaigns/:campaignId/options")
  .middleware(Authorization) {}

/**
 * A campaign's spellbook: this campaign's copied spells plus the bundled 2014
 * SRD spell corpus. Unlike character options it is paged and filterable, and
 * unlike the Library shelf it answers what this campaign can reach.
 */
class SpellsGroup extends HttpApiGroup.make("spells")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      query: SpellFilter,
      success: pageOf(Spell, SpellSort),
      error: NotFound,
    }),
    HttpApiEndpoint.get("findById", "/:spellId", {
      params: { campaignId: CampaignId, spellId: SpellId },
      success: Spell,
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId },
      payload: SpellCreate,
      success: Spell,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:spellId", {
      params: { campaignId: CampaignId, spellId: SpellId },
      payload: SpellUpdate,
      success: Spell,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:spellId", {
      params: { campaignId: CampaignId, spellId: SpellId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
    HttpApiEndpoint.post("derive", "/:spellId/derive", {
      params: { campaignId: CampaignId, spellId: SpellId },
      payload: SpellUpdate,
      success: Spell,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/spells")
  .middleware(Authorization) {}

/** A campaign's mundane equipment copies plus the bundled 2014 SRD equipment corpus. */
class EquipmentGroup extends HttpApiGroup.make("equipment")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      query: EquipmentFilter,
      success: pageOf(Equipment, EquipmentSort),
      error: NotFound,
    }),
    HttpApiEndpoint.get("findById", "/:equipmentId", {
      params: { campaignId: CampaignId, equipmentId: EquipmentId },
      success: Equipment,
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId },
      payload: EquipmentCreate,
      success: Equipment,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:equipmentId", {
      params: { campaignId: CampaignId, equipmentId: EquipmentId },
      payload: EquipmentUpdate,
      success: Equipment,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:equipmentId", {
      params: { campaignId: CampaignId, equipmentId: EquipmentId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
    HttpApiEndpoint.post("derive", "/:equipmentId/derive", {
      params: { campaignId: CampaignId, equipmentId: EquipmentId },
      payload: EquipmentUpdate,
      success: Equipment,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/equipment")
  .middleware(Authorization) {}

/** A campaign's magic item copies plus the bundled 2014 SRD magic item corpus. */
class MagicItemsGroup extends HttpApiGroup.make("magicItems")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      query: MagicItemFilter,
      success: pageOf(MagicItem, MagicItemSort),
      error: NotFound,
    }),
    HttpApiEndpoint.get("findById", "/:magicItemId", {
      params: { campaignId: CampaignId, magicItemId: MagicItemId },
      success: MagicItem,
      error: NotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { campaignId: CampaignId },
      payload: MagicItemCreate,
      success: MagicItem,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("update", "/:magicItemId", {
      params: { campaignId: CampaignId, magicItemId: MagicItemId },
      payload: MagicItemUpdate,
      success: MagicItem,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:magicItemId", {
      params: { campaignId: CampaignId, magicItemId: MagicItemId },
      success: HttpApiSchema.NoContent,
      error: NotFound,
    }),
    HttpApiEndpoint.post("derive", "/:magicItemId/derive", {
      params: { campaignId: CampaignId, magicItemId: MagicItemId },
      payload: MagicItemUpdate,
      success: MagicItem,
      error: NotFound,
    }),
  )
  .prefix("/campaigns/:campaignId/magic-items")
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
 * **Its own group with one endpoint, for the reason `recap` is its own group**:
 * it is not a session and it is not a run. It answers *"is anything happening,
 * and what"* across three tables at once, and a client asking it is asking a
 * question neither row can answer alone.
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
  .add(CampaignsGroup)
  .add(MembersGroup)
  .add(InvitesGroup)
  .add(SessionsGroup)
  .add(CharactersGroup)
  .add(NotesGroup)
  .add(EncountersGroup)
  .add(CreaturesGroup)
  .add(SpellsGroup)
  .add(EquipmentGroup)
  .add(MagicItemsGroup)
  .add(CharacterOptionsGroup)
  .add(LibraryGroup)
  .add(EncounterCreaturesGroup)
  .add(PrepGroup)
  .add(BeatsGroup)
  .add(SearchGroup)
  .add(HobGroup)
  .add(RunsGroup)
  .add(CombatantsGroup)
  .add(LiveGroup)
  .add(RecapGroup)
  .add(PlayerTableGroup) {}
