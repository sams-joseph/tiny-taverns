import {
  type CampaignId,
  type CurrentActor,
  Heartbeat,
  type LiveEvent,
  type NotFound,
  type SessionEvent,
  TavernsApi,
} from "@taverns/api";
import { Duration, Effect, Layer, Schedule, Stream } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Hob } from "./assistant/Hob.js";
import { liveHeartbeatSeconds } from "./Config.js";
import { Health } from "./Health.js";
import { LiveEvents } from "./live/LiveEvents.js";
import { Beats } from "./repo/Beats.js";
import { Campaigns } from "./repo/Campaigns.js";
import { Characters } from "./repo/Characters.js";
import { Combatants } from "./repo/Combatants.js";
import { Creatures } from "./repo/Creatures.js";
import { type DmActor, DmActors } from "./repo/DmActor.js";
import { EncounterCreatures } from "./repo/EncounterCreatures.js";
import { EncounterRuns } from "./repo/EncounterRuns.js";
import { Encounters } from "./repo/Encounters.js";
import { HobThreads } from "./repo/HobThreads.js";
import { Invites } from "./repo/Invites.js";
import { Memberships } from "./repo/Memberships.js";
import { Notes } from "./repo/Notes.js";
import { PrepItems } from "./repo/PrepItems.js";
import { Proposals } from "./repo/Proposals.js";
import { Recap } from "./repo/Recap.js";
import { Search } from "./repo/Search.js";
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

/**
 * The DM gate for the three live groups, resolved once per group build.
 *
 * `runs`, `combatants` and `live` are the endpoints whose rows differ for a
 * player, and their repositories take a `DmActor` rather than a campaign id —
 * so this is the only expression in `handlers.ts` that turns a path segment
 * into one, and a handler that tried to skip it would have no campaign to pass.
 * See `repo/DmActor.ts`.
 *
 * The campaign id is named once per handler, which is what keeps the proof and
 * the read talking about the same table: there is no second id for it to
 * disagree with.
 */
const asDmOf = Effect.map(
  DmActors,
  (dmActors) =>
    <A, E, R>(
      campaignId: CampaignId,
      read: (dm: DmActor) => Effect.Effect<A, E, R>,
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
    return handlers
      .handle("list", () => campaigns.list)
      .handle("create", ({ payload }) => campaigns.create(payload))
      .handle("findById", ({ params }) => campaigns.findById(params.campaignId))
      .handle("update", ({ params, payload }) => campaigns.update(params.campaignId, payload))
      .handle("archive", ({ params }) => campaigns.archive(params.campaignId));
  }),
);

/**
 * The endpoints that name no campaign — which tables this account is at, which
 * characters it plays across them, and the one write a player may make.
 *
 * The two reads are `mine` on their repository and neither takes a proof: what a
 * credential already reaches is not a disclosure to the credential reaching it.
 * The narrowing to *your own* characters is in the predicate, not here — a
 * handler that filtered would be the leak pattern `repo/visibility.ts` exists
 * to prevent, and it has nothing to filter with.
 *
 * `updateCharacter` is as thin as the rest, which matters more here than
 * anywhere else in this file: it is the product's first player write, and a
 * "while we are here, refuse a live column" block would be the second place that
 * rule lives. There is nothing to refuse — `CharacterOwnUpdate` has no such
 * field, and `ownRowWritable` decides the row.
 */
const MeLive = HttpApiBuilder.group(
  TavernsApi,
  "me",
  Effect.fnUntraced(function* (handlers) {
    const memberships = yield* Memberships;
    const characters = yield* Characters;
    return handlers
      .handle("campaigns", () => memberships.mine)
      .handle("characters", () => characters.mine)
      .handle("updateCharacter", ({ params, payload }) =>
        characters.updateOwn(params.characterId, payload),
      );
  }),
);

/**
 * The roster, and the only handler here that spends a proof outside the live
 * groups and the recap.
 *
 * `Memberships` answers the same table from both ends — `mine` above with an
 * ordinary actor, `list` here with a `DmActor` — so this is the whole of the
 * fifth gate: a path segment becomes a proof, and there is no campaign id left
 * for the read to be given.
 */
const MembersLive = HttpApiBuilder.group(
  TavernsApi,
  "members",
  Effect.fnUntraced(function* (handlers) {
    const memberships = yield* Memberships;
    const asDm = yield* asDmOf;
    return handlers.handle("list", ({ params }) =>
      asDm(params.campaignId, (dm) => memberships.list(dm)),
    );
  }),
);

const InvitesLive = HttpApiBuilder.group(
  TavernsApi,
  "invites",
  Effect.fnUntraced(function* (handlers) {
    const invites = yield* Invites;
    return handlers
      .handle("list", ({ params }) => invites.list(params.campaignId))
      .handle("create", ({ params, payload }) => invites.create(params.campaignId, payload))
      .handle("revoke", ({ params }) => invites.revoke(params.campaignId, params.inviteId));
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
      .handle("assign", ({ params, payload }) =>
        characters.assign(params.campaignId, params.characterId, payload),
      )
      .handle("damage", ({ params, payload }) =>
        characters.damage(params.campaignId, params.characterId, payload),
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
    return handlers
      .handle("status", ({ params }) => hob.status(params.campaignId))
      .handle("ask", ({ params, payload }) => hob.ask(params.campaignId, payload))
      .handle("threads", ({ params }) => threads.list(params.campaignId))
      .handle("turns", ({ params }) => threads.turns(params.campaignId, params.threadId))
      .handle("accept", ({ params }) =>
        proposals.accept(params.campaignId, params.threadId, params.turnId),
      );
  }),
);

const RunsLive = HttpApiBuilder.group(
  TavernsApi,
  "runs",
  Effect.fnUntraced(function* (handlers) {
    const runs = yield* EncounterRuns;
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
    const dmActors = yield* DmActors;
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
    InvitePreviewLive,
    JoinLive,
    CampaignsLive,
    MembersLive,
    InvitesLive,
    SessionsLive,
    CharactersLive,
    NotesLive,
    EncountersLive,
    CreaturesLive,
    EncounterCreaturesLive,
    PrepLive,
    BeatsLive,
    SearchLive,
    HobLive,
    RunsLive,
    CombatantsLive,
    LiveLive,
    RecapLive,
  ]),
);
