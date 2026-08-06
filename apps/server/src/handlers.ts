import { TavernsApi } from "@taverns/api";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Health } from "./Health.js";
import { Campaigns } from "./repo/Campaigns.js";
import { Characters } from "./repo/Characters.js";
import { Notes } from "./repo/Notes.js";
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
    return handlers
      .handle("list", () => campaigns.list)
      .handle("create", ({ payload }) => campaigns.create(payload))
      .handle("findById", ({ params }) => campaigns.findById(params.campaignId))
      .handle("update", ({ params, payload }) => campaigns.update(params.campaignId, payload))
      .handle("archive", ({ params }) => campaigns.archive(params.campaignId));
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

const CharactersLive = HttpApiBuilder.group(
  TavernsApi,
  "characters",
  Effect.fnUntraced(function* (handlers) {
    const characters = yield* Characters;
    return handlers
      .handle("list", ({ params }) => characters.list(params.campaignId))
      .handle("create", ({ params, payload }) => characters.create(params.campaignId, payload))
      .handle("findById", ({ params }) =>
        characters.findById(params.campaignId, params.characterId),
      )
      .handle("update", ({ params, payload }) =>
        characters.update(params.campaignId, params.characterId, payload),
      )
      .handle("remove", ({ params }) => characters.remove(params.campaignId, params.characterId));
  }),
);

const NotesLive = HttpApiBuilder.group(
  TavernsApi,
  "notes",
  Effect.fnUntraced(function* (handlers) {
    const notes = yield* Notes;
    return handlers
      .handle("list", ({ params }) => notes.list(params.campaignId))
      .handle("create", ({ params, payload }) => notes.create(params.campaignId, payload))
      .handle("findById", ({ params }) => notes.findById(params.campaignId, params.noteId))
      .handle("update", ({ params, payload }) =>
        notes.update(params.campaignId, params.noteId, payload),
      )
      .handle("remove", ({ params }) => notes.remove(params.campaignId, params.noteId));
  }),
);

/** The API with every group implemented. Still needs its services provided. */
export const ApiLive = HttpApiBuilder.layer(TavernsApi).pipe(
  Layer.provide([HealthLive, CampaignsLive, SessionsLive, CharactersLive, NotesLive]),
);
