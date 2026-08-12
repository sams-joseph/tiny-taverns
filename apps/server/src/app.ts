import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat";
import { NodeHttpClient } from "@effect/platform-node";
import type { PgClient } from "@effect/sql-pg";
import type { Authorization } from "@taverns/api";
import { type Config, Effect, Layer, Option } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import type { SqlClient } from "effect/unstable/sql";
import { Accounts } from "./Accounts.js";
import { Hob } from "./assistant/Hob.js";
import { AuthorizationLive } from "./Authorization.js";
import { ClerkIdentityProvider } from "./ClerkIdentityProvider.js";
import {
  allowedOrigins,
  clerkJwtKey,
  hobApiKey,
  hobApiUrl,
  hobMaxTokens,
  hobModel,
} from "./Config.js";
import * as Database from "./Database.js";
import { ApiLive } from "./handlers.js";
import { Health } from "./Health.js";
import { IdentityProvider } from "./IdentityProvider.js";
import { LiveEvents } from "./live/LiveEvents.js";
import { Beats } from "./repo/Beats.js";
import { Campaigns } from "./repo/Campaigns.js";
import { Characters } from "./repo/Characters.js";
import { Combatants } from "./repo/Combatants.js";
import { Creatures } from "./repo/Creatures.js";
import { DmActors } from "./repo/DmActor.js";
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
 * Which identity provider is behind the seam — the one place in the server
 * that names a vendor and chooses.
 *
 * Unset key means disabled, not broken: this is the default configuration, it
 * is what CI runs, and it is what someone who has never opened the Clerk
 * dashboard gets.
 *
 * **Both branches log, and that is the point.** One line, always, saying which
 * mode the process is in. A silent "on" branch is not a saving: the way this
 * actually goes wrong is a key that was set somewhere the server does not read
 * — the wrong file, the wrong variable name, a shell that never exported it —
 * and the only symptom is a sign-in that fails much later, indistinguishably
 * from a bad key or a misconfigured dashboard. Saying "hosted sign-in is on"
 * at boot is what turns that into a five-second check.
 *
 * Neither line carries key material — not the PEM, not a prefix, not a length.
 * There is nothing to learn from those that "configured" does not already say,
 * and boot output ends up in log aggregators.
 */
export const identityFromConfig: Layer.Layer<IdentityProvider, Config.ConfigError> = Layer.unwrap(
  Effect.gen(function* () {
    const jwtKey = yield* clerkJwtKey;
    if (Option.isNone(jwtKey)) {
      yield* Effect.logInfo(
        "Hosted sign-in is OFF: CLERK_JWT_KEY is unset, so machine tokens are the only " +
          "credential. To turn it on, set it in apps/server/.env.local (see .env.example).",
      );
      return IdentityProvider.disabled;
    }
    yield* Effect.logInfo(
      "Hosted sign-in is ON: CLERK_JWT_KEY is configured, so session tokens are accepted " +
        "alongside machine tokens.",
    );
    // The same origins the CORS allowlist uses, so the `azp` check and the
    // browser allowlist cannot disagree about which front end this is.
    const authorizedParties = yield* allowedOrigins;
    return ClerkIdentityProvider.layer({ jwtKey: jwtKey.value, authorizedParties });
  }),
);

/**
 * Whether there is a model behind Hob — the assistant's half of the same
 * question `identityFromConfig` answers, arranged the same way and for the same
 * reasons.
 *
 * **Unset is the default configuration, and it is what CI runs.** No model
 * endpoint means `Hob.unavailable`: the server boots, every test passes, the
 * status endpoint says so, and the panel renders the honest *nothing is behind
 * this panel* line it already has. Nothing about the product is broken by the
 * absence, which is the whole definition of an opt-in dependency.
 *
 * **Both branches log, one line, every boot** — for the reason the identity
 * line exists. The way this actually goes wrong is a variable set somewhere the
 * server does not read (the wrong package's `.env.local`, a shell that never
 * exported it), and the only symptom would be a panel that quietly refuses to
 * offer a composer. The ON line names the model and the endpoint because both
 * are needed to diagnose a wrong answer, and **never the key**: `HOB_API_KEY`
 * is `Redacted` and does not appear here at all, not as a prefix and not as a
 * length.
 *
 * Both must be set. An endpoint with no model name would fail on the first
 * question with a provider error from inside a stream, which is a far worse way
 * to learn about a missing environment variable than a line at boot.
 */
export const assistantFromConfig: Layer.Layer<
  Hob,
  Config.ConfigError,
  Campaigns | Creatures | DmActors | HobThreads | Recap | Search | SessionEvents | Sessions
> = Layer.unwrap(
  Effect.gen(function* () {
    const apiUrl = yield* hobApiUrl;
    const model = yield* hobModel;

    if (Option.isNone(apiUrl) || Option.isNone(model)) {
      yield* Effect.logInfo(
        "Hob is OFF: no model endpoint is configured, so the assistant panel reports " +
          "itself unavailable. To turn it on, set HOB_API_URL and HOB_MODEL in " +
          "apps/server/.env.local (see .env.example).",
      );
      return Hob.unavailable;
    }

    const apiKey = yield* hobApiKey;
    const maxTokens = yield* hobMaxTokens;
    yield* Effect.logInfo(
      `Hob is ON: model ${model.value} at ${apiUrl.value}, max_tokens ${maxTokens}.`,
    );

    return Hob.layer({ model: model.value }).pipe(
      Layer.provide(
        OpenAiLanguageModel.layer({
          model: model.value,
          // Named explicitly, always. See `hobMaxTokens` — a provider package
          // that does not recognise a model id caps this silently, and the
          // first symptom is an answer cut off mid-sentence.
          config: { max_output_tokens: maxTokens },
        }).pipe(
          Layer.provide(
            OpenAiClient.layer({
              apiUrl: apiUrl.value,
              // Absent is the ordinary case: a local server generally wants no
              // credential, and some want a placeholder. Neither is our
              // business, so the option is passed through as it arrived.
              apiKey: Option.getOrUndefined(apiKey),
            }).pipe(Layer.provide(NodeHttpClient.layerUndici)),
          ),
        ),
      ),
    );
  }),
);

/**
 * Everything the handlers need, over whichever database it is given.
 *
 * Parameterised so the tests can mount the same wiring over a throwaway
 * database — the alternative is a second, subtly different assembly, which is
 * how a server ends up passing its tests and failing on boot. The identity
 * provider is parameterised for the same reason and defaults to the configured
 * one, so a test that says nothing about it gets exactly what production gets.
 */
export const servicesOver = <E>(
  database: Layer.Layer<SqlClient.SqlClient | PgClient.PgClient, E>,
  identity: Layer.Layer<IdentityProvider, E | Config.ConfigError> = identityFromConfig,
  assistant: Layer.Layer<
    Hob,
    E | Config.ConfigError,
    Campaigns | Creatures | DmActors | HobThreads | Recap | Search | SessionEvents | Sessions
  > = assistantFromConfig,
): Layer.Layer<
  | Accounts
  | Authorization
  | Beats
  | Campaigns
  | Characters
  | Combatants
  | Creatures
  | DmActors
  | EncounterCreatures
  | EncounterRuns
  | Encounters
  | Health
  | Hob
  | HobThreads
  | Invites
  | LiveEvents
  | Memberships
  | Notes
  | PrepItems
  | Proposals
  | Recap
  | Search
  | SessionEvents
  | Sessions,
  E | Config.ConfigError
> =>
  Layer.mergeAll(
    Accounts.layer,
    AuthorizationLive.pipe(Layer.provide([Accounts.layer, identity])),
    // Jotting a beat appends `beat-added` to the log, so it rings the doorbell
    // like every other live write.
    Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
    Campaigns.layer,
    Characters.layer,
    // The live repositories ring the in-process fan-out after they commit, so
    // they take it as a dependency. It is merged in as well, because the
    // streaming handler subscribes to it — and `Layer` memoises by identity, so
    // all three share one `PubSub` rather than one each, which is the whole
    // point of a doorbell.
    Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
    Creatures.layer,
    // The DM gate the three live groups spend. It is a repository like any
    // other — one read of `campaign_member` through the shipped predicate —
    // and it is here rather than inside them because a repository that could
    // mint its own proof would be proving nothing.
    DmActors.layer,
    EncounterCreatures.layer,
    EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
    Encounters.layer,
    // The conversation with Hob, as rows. An ordinary campaign-scoped
    // repository — it is here rather than under `assistant` because the panel
    // reads a thread back over HTTP whether or not a model is configured.
    HobThreads.layer,
    // Invitations, and the membership they grant. `Invites` writes no
    // `campaign_member` SQL of its own — it calls `repo/Memberships.ts`, which
    // with `repo/visibility.ts` is still the only pair of modules in `src` that
    // names the table. `Memberships` is a service now because membership has an
    // endpoint now: `GET /me/campaigns`.
    Invites.layer,
    LiveEvents.layer,
    Memberships.layer,
    Notes.layer,
    PrepItems.layer,
    // The accept path: the only writer of `origin = 'assistant'`. It composes
    // the ordinary create methods, so an accepted row is made by the same
    // statement an authored one is.
    Proposals.layer.pipe(
      Layer.provide([
        Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
        Campaigns.layer,
        EncounterCreatures.layer,
        Encounters.layer,
        Notes.layer,
      ]),
    ),
    // A view over five tables and a writer of none. It needs no `LiveEvents`
    // for the same reason: nothing about reading a night changes it.
    Recap.layer,
    // Read-only, and the only place a `tsvector` is queried. No `LiveEvents`:
    // searching writes nothing and rings no doorbell.
    Search.layer,
    SessionEvents.layer,
    // `Sessions` is on the live side too now: finishing a night takes a fight
    // still on the table off it and carries it, so it appends to the log and
    // has to ring the same doorbell every other live write rings.
    Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
    Health.layer,
    // Hob reads through the repositories and writes nothing, so its dependency
    // list *is* the list of reads it may make — there is no `SqlClient` here,
    // and `test/hob.test.ts` fails if one appears in `src/assistant/`. The
    // repository layers are named again rather than threaded in, and that costs
    // nothing: `Layer` memoises by layer identity within a build, so these are
    // the same six services the handlers already have.
    assistant.pipe(
      Layer.provide([
        Campaigns.layer,
        Creatures.layer,
        DmActors.layer,
        HobThreads.layer,
        Recap.layer,
        Search.layer,
        SessionEvents.layer,
        Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
      ]),
    ),
  ).pipe(Layer.provide(database));

/**
 * The configured services, over the real database.
 *
 * Exported as a named constant rather than inlined because `main.ts` needs
 * *this object*, not an equivalent one: it provides it to the TCP listener so
 * the socket binds only after the pool is open and the migrations have run, and
 * `Layer` memoises by layer identity, so a second `servicesOver(Database.layer)`
 * would be a second pool and a second migration run. See the comment on
 * `listener` in `main.ts`.
 */
export const services = servicesOver(Database.layer);

/**
 * The HTTP application, minus the server it listens on.
 *
 * The services go *outside* `HttpRouter.serve`. Handler requirements travel as
 * `Request<"Requires", _>` markers that only `serve` unwraps, so providing them
 * to the route layer typechecks and then fails at the call site.
 */
export const applicationOver = <E>(
  serviceLayer: Layer.Layer<
    | Accounts
    | Authorization
    | Beats
    | Campaigns
    | Characters
    | Combatants
    | Creatures
    | DmActors
    | EncounterCreatures
    | EncounterRuns
    | Encounters
    | Health
    | Hob
    | HobThreads
    | Invites
    | LiveEvents
    | Memberships
    | Notes
    | PrepItems
    | Proposals
    | Recap
    | Search
    | SessionEvents
    | Sessions,
    E
  >,
  options?: { readonly quiet?: boolean },
) =>
  Effect.map(allowedOrigins, (origins) =>
    HttpRouter.serve(ApiLive, {
      disableListenLog: options?.quiet,
      disableLogger: options?.quiet,
      middleware: HttpMiddleware.cors({
        allowedOrigins: origins,
        // `b3` and `traceparent` are not optional here. `HttpClient` attaches
        // trace propagation headers to every outgoing request, which makes even
        // a plain `GET /health` a preflighted cross-origin request. Leave them
        // out and the browser blocks the call after a 204 preflight, with
        // nothing in the server log but the OPTIONS — the request that mattered
        // was never sent.
        allowedHeaders: ["content-type", "authorization", "b3", "traceparent"],
      }),
    }),
  ).pipe(Layer.unwrap, Layer.provide(serviceLayer));

export const application = applicationOver(services);
