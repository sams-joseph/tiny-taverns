import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authorization } from "./Actor.js";
import { Campaign, CampaignCreate, CampaignUpdate } from "./Campaign.js";
import { Character, CharacterCreate, CharacterUpdate } from "./Character.js";
import { Creature, CreatureCreate, CreatureFilter, CreatureUpdate } from "./Creature.js";
import { Encounter, EncounterCreate, EncounterUpdate } from "./Encounter.js";
import {
  EncounterCreature,
  EncounterCreatureCreate,
  EncounterCreatureUpdate,
} from "./EncounterCreature.js";
import { Conflict, NotFound } from "./Errors.js";
import {
  CampaignId,
  CharacterId,
  CreatureId,
  EncounterCreatureId,
  EncounterId,
  NoteId,
  PrepItemId,
  SessionId,
} from "./Ids.js";
import { Note, NoteCreate, NoteUpdate } from "./Note.js";
import { PrepItem, PrepItemCreate, PrepItemUpdate } from "./PrepItem.js";
import { Session, SessionCreate, SessionUpdate } from "./Session.js";

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
    HttpApiEndpoint.patch("update", "/:campaignId", {
      params: { campaignId: CampaignId },
      payload: CampaignUpdate,
      success: Campaign,
      error: NotFound,
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
 * The wire contract. The server implements it and `apps/web` derives its client
 * from it, so request and response shapes cannot drift apart — there is only
 * one declaration and no codegen step between them.
 */
export class TavernsApi extends HttpApi.make("taverns")
  .add(HealthGroup)
  .add(CampaignsGroup)
  .add(SessionsGroup)
  .add(CharactersGroup)
  .add(NotesGroup)
  .add(EncountersGroup)
  .add(CreaturesGroup)
  .add(EncounterCreaturesGroup)
  .add(PrepGroup) {}
