import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authorization } from "./Actor.js";
import { Campaign, CampaignCreate, CampaignUpdate } from "./Campaign.js";
import { Character, CharacterCreate, CharacterUpdate } from "./Character.js";
import { Encounter, EncounterCreate, EncounterUpdate } from "./Encounter.js";
import { Conflict, NotFound } from "./Errors.js";
import {
  CampaignId,
  CharacterId,
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
  .add(PrepGroup) {}
