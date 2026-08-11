import {
  CurrentActor,
  Heartbeat,
  type LiveEvent,
  type SessionEvent,
  TavernsApi,
} from "@taverns/api";
import { Duration, Effect, Layer, Schedule, Stream } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { liveHeartbeatSeconds } from "./Config.js";
import { Health } from "./Health.js";
import { LiveEvents } from "./live/LiveEvents.js";
import { Beats } from "./repo/Beats.js";
import { Campaigns } from "./repo/Campaigns.js";
import { Characters } from "./repo/Characters.js";
import { Combatants } from "./repo/Combatants.js";
import { Creatures } from "./repo/Creatures.js";
import { EncounterCreatures } from "./repo/EncounterCreatures.js";
import { EncounterRuns } from "./repo/EncounterRuns.js";
import { Encounters } from "./repo/Encounters.js";
import { Notes } from "./repo/Notes.js";
import { PrepItems } from "./repo/PrepItems.js";
import { SessionEvents } from "./repo/SessionEvents.js";
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

const EncountersLive = HttpApiBuilder.group(
  TavernsApi,
  "encounters",
  Effect.fnUntraced(function* (handlers) {
    const encounters = yield* Encounters;
    return handlers
      .handle("list", ({ params }) => encounters.list(params.campaignId))
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

const CreaturesLive = HttpApiBuilder.group(
  TavernsApi,
  "creatures",
  Effect.fnUntraced(function* (handlers) {
    const creatures = yield* Creatures;
    return handlers
      .handle("list", ({ params, query }) => creatures.list(params.campaignId, query))
      .handle("create", ({ params, payload }) => creatures.create(params.campaignId, payload))
      .handle("findById", ({ params }) => creatures.findById(params.campaignId, params.creatureId))
      .handle("update", ({ params, payload }) =>
        creatures.update(params.campaignId, params.creatureId, payload),
      )
      .handle("remove", ({ params }) => creatures.remove(params.campaignId, params.creatureId))
      .handle("derive", ({ params, payload }) =>
        creatures.derive(params.campaignId, params.creatureId, payload),
      );
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
      .handle("list", ({ params }) => beats.list(params.campaignId, params.sessionId))
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

const RunsLive = HttpApiBuilder.group(
  TavernsApi,
  "runs",
  Effect.fnUntraced(function* (handlers) {
    const runs = yield* EncounterRuns;
    return handlers
      .handle("list", ({ params }) => runs.list(params.campaignId, params.sessionId))
      .handle("start", ({ params, payload }) =>
        runs.start(params.campaignId, params.sessionId, payload),
      )
      .handle("resume", ({ params, payload }) =>
        runs.resume(params.campaignId, params.sessionId, payload),
      )
      .handle("findById", ({ params }) =>
        runs.findById(params.campaignId, params.sessionId, params.runId),
      )
      .handle("update", ({ params, payload }) =>
        runs.update(params.campaignId, params.sessionId, params.runId, payload),
      )
      .handle("nextTurn", ({ params, payload }) =>
        runs.nextTurn(params.campaignId, params.sessionId, params.runId, payload),
      )
      .handle("end", ({ params }) => runs.end(params.campaignId, params.sessionId, params.runId));
  }),
);

const CombatantsLive = HttpApiBuilder.group(
  TavernsApi,
  "combatants",
  Effect.fnUntraced(function* (handlers) {
    const combatants = yield* Combatants;
    return handlers
      .handle("list", ({ params }) =>
        combatants.list(params.campaignId, params.sessionId, params.runId),
      )
      .handle("create", ({ params, payload }) =>
        combatants.create(params.campaignId, params.sessionId, params.runId, payload),
      )
      .handle("update", ({ params, payload }) =>
        combatants.update(
          params.campaignId,
          params.sessionId,
          params.runId,
          params.combatantId,
          payload,
        ),
      )
      .handle("damage", ({ params, payload }) =>
        combatants.damage(
          params.campaignId,
          params.sessionId,
          params.runId,
          params.combatantId,
          payload,
        ),
      )
      .handle("remove", ({ params }) =>
        combatants.remove(params.campaignId, params.sessionId, params.runId, params.combatantId),
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
    // Read once, when the group is built, not per request. `orDie` because a
    // `LIVE_HEARTBEAT_SECONDS` that is not a number is a misconfigured
    // deployment and should stop the boot loudly — and because letting a
    // `ConfigError` into this layer's error channel would put it in the type of
    // every caller of `ApiLive`, for a value that has a committed default.
    const heartbeat = Duration.seconds(yield* Effect.orDie(liveHeartbeatSeconds));

    return (
      handlers
        .handle("log", ({ params, query }) =>
          events.list(params.campaignId, params.sessionId, query),
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
            const actor = yield* CurrentActor;
            // The ordinary read of the run, for its ordinary `NotFound` — which
            // is the endpoint's declared error and so is answered as a status
            // before a single byte of stream. It also checks the same two claims
            // every other live endpoint checks: that this session is in this
            // campaign, and that this run is in that session.
            yield* runs.findById(params.campaignId, params.sessionId, params.runId);

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
                  actor,
                  params.campaignId,
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
    CampaignsLive,
    SessionsLive,
    CharactersLive,
    NotesLive,
    EncountersLive,
    CreaturesLive,
    EncounterCreaturesLive,
    PrepLive,
    BeatsLive,
    RunsLive,
    CombatantsLive,
    LiveLive,
  ]),
);
