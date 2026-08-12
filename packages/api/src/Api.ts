import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authorization } from "./Actor.js";
import { Beat, BeatCreate, BeatUpdate } from "./Beat.js";
import { Campaign, CampaignCreate, CampaignUpdate } from "./Campaign.js";
import { Character, CharacterCreate, CharacterUpdate } from "./Character.js";
import { Combatant, CombatantCreate, CombatantDamage, CombatantUpdate } from "./Combatant.js";
import { Creature, CreatureCreate, CreatureFilter, CreatureUpdate } from "./Creature.js";
import { Encounter, EncounterCreate, EncounterUpdate } from "./Encounter.js";
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
  CombatantId,
  CreatureId,
  EncounterCreatureId,
  EncounterId,
  EncounterRunId,
  InviteId,
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
import { CampaignMembership } from "./Membership.js";
import { Note, NoteCreate, NoteUpdate } from "./Note.js";
import { PrepItem, PrepItemCreate, PrepItemUpdate } from "./PrepItem.js";
import { SessionRecap } from "./Recap.js";
import { SearchFilter, SearchHit } from "./Search.js";
import { Session, SessionCreate, SessionUpdate } from "./Session.js";
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
  )
  .prefix("/campaigns")
  .middleware(Authorization) {}

/**
 * The tables this account is at, and what it is at them.
 *
 * **The one group in the product that names no campaign**, because it is the
 * question you ask before you have one: a signed-in account with no membership
 * anywhere is now a legitimate steady state — somebody who signed up and has
 * not been invited yet — and this is the read whose empty answer says so.
 *
 * It is not a second answer to `campaigns.list`. It composes the identical
 * predicate (see `CampaignMembership`), so the two cannot disagree about reach;
 * what it adds is the role, which is a fact about the pair and has nowhere on
 * the campaign row to live. That is what a player screen will branch on.
 */
class MeGroup extends HttpApiGroup.make("me")
  .add(
    HttpApiEndpoint.get("campaigns", "/campaigns", {
      success: Schema.Array(CampaignMembership),
    }),
  )
  .prefix("/me")
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
      error: NotFound,
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
    HttpApiEndpoint.get("list", "/", {
      params: { campaignId: CampaignId },
      success: Schema.Array(Note),
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
      success: Schema.Array(Encounter),
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
      success: Schema.Array(Creature),
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
    /** Copy a readable creature into this campaign, edits applied, origin trail kept. */
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
      success: Schema.Array(Beat),
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
 * What happened on the night — the thing a DM reads before the next game.
 *
 * One endpoint, and it is a **read of a session** rather than a table of its
 * own: nothing is stored, and there is no `POST`, `PATCH` or `DELETE` here
 * because there is nothing to write. See `SessionRecap` for what it assembles
 * and from where.
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
  .prefix("/campaigns/:campaignId/sessions/:sessionId")
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
  .add(InvitesGroup)
  .add(SessionsGroup)
  .add(CharactersGroup)
  .add(NotesGroup)
  .add(EncountersGroup)
  .add(CreaturesGroup)
  .add(EncounterCreaturesGroup)
  .add(PrepGroup)
  .add(BeatsGroup)
  .add(SearchGroup)
  .add(HobGroup)
  .add(RunsGroup)
  .add(CombatantsGroup)
  .add(LiveGroup)
  .add(RecapGroup) {}
