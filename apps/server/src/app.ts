import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat";
import { NodeHttpClient } from "@effect/platform-node";
import type { PgClient } from "@effect/sql-pg";
import type { Authorization } from "@taverns/api";
import { type Config, Effect, Layer, Option, type Redacted } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import type { SqlClient } from "effect/unstable/sql";
import { Accounts } from "./Accounts.js";
import { Hob } from "./assistant/Hob.js";
import { NpcAgent } from "./assistant/NpcAgent.js";
import { AuthorizationLive } from "./Authorization.js";
import { ClerkIdentityProvider } from "./ClerkIdentityProvider.js";
import {
  allowedOrigins,
  clerkJwtKey,
  hobApiKey,
  hobApiUrl,
  hobMaxTokens,
  hobModel,
  npcPlayerCampaignDailyLimit,
} from "./Config.js";
import * as Database from "./Database.js";
import { ApiLive } from "./handlers.js";
import { Health } from "./Health.js";
import { IdentityProvider } from "./IdentityProvider.js";
import { LiveEvents } from "./live/LiveEvents.js";
import { Beats } from "./repo/Beats.js";
import { Campaigns } from "./repo/Campaigns.js";
import { Characters } from "./repo/Characters.js";
import { Party } from "./repo/Party.js";
import { ClassProgression } from "./repo/ClassProgression.js";
import { Combatants } from "./repo/Combatants.js";
import { Creatures } from "./repo/Creatures.js";
import { CampaignCreatorActors } from "./repo/CreatorActor.js";
import { EncounterCreatures } from "./repo/EncounterCreatures.js";
import { EncounterRuns } from "./repo/EncounterRuns.js";
import { Encounters } from "./repo/Encounters.js";
import { EquipmentRepo } from "./repo/Equipment.js";
import { Feats } from "./repo/Feats.js";
import { HobDirectWrites } from "./repo/HobDirectWrites.js";
import { HobThreads } from "./repo/HobThreads.js";
import { GroupHistory } from "./repo/GroupHistory.js";
import { LibraryShares } from "./repo/LibraryShares.js";
import { Groups } from "./repo/Groups.js";
import { Invites } from "./repo/Invites.js";
import { MagicItems } from "./repo/MagicItems.js";
import { Memberships } from "./repo/Memberships.js";
import { Notes } from "./repo/Notes.js";
import { NpcKnowledge } from "./repo/NpcKnowledge.js";
import { NpcMemories } from "./repo/NpcMemories.js";
import { Npcs } from "./repo/Npcs.js";
import { NpcThreads } from "./repo/NpcThreads.js";
import { Options } from "./repo/Options.js";
import { PlayerTable } from "./repo/PlayerTable.js";
import { PrepItems } from "./repo/PrepItems.js";
import { Proposals } from "./repo/Proposals.js";
import { Recap } from "./repo/Recap.js";
import { RuleArticles } from "./repo/RuleArticles.js";
import { Rolls } from "./repo/Rolls.js";
import { Search } from "./repo/Search.js";
import { SessionEvents } from "./repo/SessionEvents.js";
import { Sessions } from "./repo/Sessions.js";
import { Spells } from "./repo/Spells.js";

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
 * The provider layer both model-backed surfaces sit on — Hob and the NPC
 * rehearsal — spelled once so the two cannot disagree about the endpoint, the
 * credential or the output budget. `max_output_tokens` is named explicitly,
 * always: a provider package that does not recognise a model id caps it
 * silently, and the first symptom is an answer cut off mid-sentence.
 */
const languageModelLayer = (options: {
  readonly apiUrl: string;
  readonly model: string;
  readonly apiKey: Redacted.Redacted | undefined;
  readonly maxTokens: number;
}) =>
  OpenAiLanguageModel.layer({
    model: options.model,
    config: { max_output_tokens: options.maxTokens },
  }).pipe(
    Layer.provide(
      OpenAiClient.layer({ apiUrl: options.apiUrl, apiKey: options.apiKey }).pipe(
        Layer.provide(NodeHttpClient.layerUndici),
      ),
    ),
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
  | Campaigns
  | Creatures
  | CampaignCreatorActors
  | EquipmentRepo
  | GroupHistory
  | Groups
  | HobThreads
  | Options
  | Recap
  | Search
  | SessionEvents
  | Sessions
  | Spells
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
        languageModelLayer({
          apiUrl: apiUrl.value,
          model: model.value,
          // Absent is the ordinary case: a local server generally wants no
          // credential, and some want a placeholder. Neither is our business,
          // so the option is passed through as it arrived.
          apiKey: Option.getOrUndefined(apiKey),
          maxTokens,
        }),
      ),
    );
  }),
);

/**
 * Whether there is a model behind NPC rehearsal and player chat — the same
 * three variables Hob reads, deliberately: an NPC is a second surface on the
 * one configured model, not a second model to configure. Unset means
 * `NpcAgent.unavailable`, which mirrors `Hob.unavailable`; the boot line for
 * Hob already names the model and endpoint, so this one says only which mode
 * the cast is in.
 */
export const npcAgentFromConfig: Layer.Layer<
  NpcAgent,
  Config.ConfigError,
  Npcs | NpcKnowledge | NpcMemories | NpcThreads | CampaignCreatorActors
> = Layer.unwrap(
  Effect.gen(function* () {
    const apiUrl = yield* hobApiUrl;
    const model = yield* hobModel;

    if (Option.isNone(apiUrl) || Option.isNone(model)) {
      yield* Effect.logInfo(
        "NPC rehearsal and player chat are OFF: they share Hob's model configuration, and none is set.",
      );
      return NpcAgent.unavailable;
    }

    const apiKey = yield* hobApiKey;
    const maxTokens = yield* hobMaxTokens;
    const campaignDailyLimit = yield* npcPlayerCampaignDailyLimit;
    yield* Effect.logInfo(`NPC rehearsal and player chat are ON, on Hob's model ${model.value}.`);

    return NpcAgent.layer({
      model: model.value,
      playerRateLimits: { perPlayerPerMinute: 10, perCampaignPerDay: campaignDailyLimit },
    }).pipe(
      Layer.provide(
        languageModelLayer({
          apiUrl: apiUrl.value,
          model: model.value,
          apiKey: Option.getOrUndefined(apiKey),
          maxTokens,
        }),
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
    | Campaigns
    | Creatures
    | CampaignCreatorActors
    | EquipmentRepo
    | GroupHistory
    | Groups
    | HobThreads
    | Options
    | Recap
    | Search
    | SessionEvents
    | Sessions
    | Spells
  > = assistantFromConfig,
  npcAgent: Layer.Layer<
    NpcAgent,
    E | Config.ConfigError,
    Npcs | NpcKnowledge | NpcMemories | NpcThreads | CampaignCreatorActors
  > = npcAgentFromConfig,
): Layer.Layer<
  | Accounts
  | Authorization
  | Beats
  | Campaigns
  | Groups
  | GroupHistory
  | LibraryShares
  | Characters
  | ClassProgression
  | Combatants
  | Creatures
  | CampaignCreatorActors
  | EncounterCreatures
  | EncounterRuns
  | Encounters
  | EquipmentRepo
  | Feats
  | Health
  | Hob
  | HobDirectWrites
  | HobThreads
  | Invites
  | LiveEvents
  | MagicItems
  | Memberships
  | Notes
  | NpcAgent
  | NpcKnowledge
  | NpcMemories
  | Npcs
  | NpcThreads
  // A campaign's rules vocabulary, and the Library originals behind it. An
  // ordinary campaign-scoped repository composing the shipped predicates — no
  // `LiveEvents`, because writing a class changes nothing at a table tonight.
  | Options
  | RuleArticles
  | Rolls
  | Party
  | PlayerTable
  | PrepItems
  | Proposals
  | Recap
  | Search
  | SessionEvents
  | Sessions
  | Spells,
  E | Config.ConfigError
> =>
  Layer.mergeAll(
    Accounts.layer,
    AuthorizationLive.pipe(Layer.provide([Accounts.layer, identity])),
    // Jotting a beat appends `beat-added` to the log, so it rings the doorbell
    // like every other live write.
    Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
    Campaigns.layer,
    Groups.layer,
    // The chronicle renders recaps at share time, so it composes `Recap`.
    GroupHistory.layer.pipe(Layer.provide(Recap.layer)),
    // The group's shared Library shelf — grants to copy, never content.
    LibraryShares.layer,
    // The owner's half of the shared character. Most durable sheet writes do
    // not ring, but resource spends and rests are live table facts when a night
    // is open, so the repository takes the same doorbell the party uses.
    Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
    // The campaign's half: the seats. The condition write-through and the
    // delta are live writes, so this is a live repository the way the old
    // campaign-scoped `Characters` was.
    Party.layer.pipe(Layer.provide(LiveEvents.layer)),
    // The concrete class progression rows under the Rules shelves. Read-only;
    // the importer and option derive path are the only writers today.
    ClassProgression.layer,
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
    CampaignCreatorActors.layer,
    EncounterCreatures.layer,
    EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
    Encounters.layer,
    // The conversation with Hob, as rows. An ordinary campaign-scoped
    // repository — it is here rather than under `assistant` because the panel
    // reads a thread back over HTTP whether or not a model is configured.
    HobThreads.layer,
    // Hob's direct resource writes are ordinary repository writes behind a
    // per-fight switch, not SQL inside the assistant loop.
    HobDirectWrites.layer.pipe(Layer.provide(LiveEvents.layer)),
    // Invitations, and the membership they grant. `Invites` writes no
    // `campaign_member` SQL of its own — it calls `repo/Memberships.ts`, which
    // with `repo/visibility.ts` is still the only pair of modules in `src` that
    // names the table. `Memberships` is a service now because membership has an
    // endpoint now: `GET /me/campaigns`.
    Invites.layer,
    LiveEvents.layer,
    Memberships.layer,
    Notes.layer,
    // The campaign's cast and its rehearsal transcripts: creator-only rows,
    // every method behind the `CampaignCreatorActor` proof.
    Npcs.layer,
    NpcKnowledge.layer,
    NpcMemories.layer,
    NpcThreads.layer.pipe(Layer.provide(LiveEvents.layer)),
    // The NPC rehearsal loop: no tools, no writes, one model call over a
    // versioned prompt. It reads the NPC, its transcript, and this NPC's
    // explicit facts/approved memories — no campaign-wide repositories.
    npcAgent.pipe(
      Layer.provide([
        Npcs.layer,
        NpcKnowledge.layer,
        NpcMemories.layer,
        NpcThreads.layer.pipe(Layer.provide(LiveEvents.layer)),
        CampaignCreatorActors.layer,
      ]),
    ),
    // The classes, races and backgrounds a character is built from — the campaign's
    // vocabulary and the Library originals behind it. No `LiveEvents`: editing
    // a class changes what the *next* character is made from, which is not
    // something a screen watching tonight's fight is waiting for.
    Options.layer,
    // Rules reference articles follow the same Library/campaign-copy ownership
    // as creatures, but their ordered sections are copied with them so a
    // campaign snapshot remains coherent after a system re-import.
    RuleArticles.layer,
    // Browser-submitted rolls are live session facts: the row and its marker
    // commit together, then the same session doorbell refreshes the tray.
    Rolls.layer.pipe(Layer.provide(LiveEvents.layer)),
    // Spells follow the same Library/campaign-copy ownership as creatures, but
    // write no live state and ring no doorbell.
    Spells.layer,
    // Mundane equipment follows the same Library/campaign-copy ownership as
    // creatures and spells, and writes no live state.
    EquipmentRepo.layer,
    // Magic items are their own copyable corpus because variants, rarity and
    // attunement are a different domain from mundane equipment.
    MagicItems.layer,
    // Feats are the final 2014 rules-corpus slice: own table, same
    // Library/campaign-copy predicates as the other copyable corpora.
    Feats.layer,
    // What is live at one table, to a player. Its read writes nothing, but its
    // stream subscribes to the same contentless doorbell as the DM runner.
    PlayerTable.layer.pipe(Layer.provide(LiveEvents.layer)),
    PrepItems.layer,
    // The accept path: the only writer of `origin = 'assistant'`. It composes
    // the ordinary create methods, so an accepted row is made by the same
    // statement an authored one is.
    Proposals.layer.pipe(
      Layer.provide([
        Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
        Campaigns.layer,
        // A player accepting a character draft goes through `createOwn`, so the
        // accept path holds `Characters` as well now — the same statement a
        // typed one takes, with `assistant_turn_id` on it.
        Characters.layer,
        EncounterCreatures.layer,
        Encounters.layer,
        // Group Hob's accepted chronicle line goes through the same
        // `GroupHistory.create` a member's own hand does.
        GroupHistory.layer.pipe(Layer.provide(Recap.layer)),
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
        CampaignCreatorActors.layer,
        // The group surface: the directory and the chronicle. Same memoised
        // layers the handlers already hold.
        Groups.layer,
        GroupHistory.layer.pipe(Layer.provide(Recap.layer)),
        HobThreads.layer,
        HobDirectWrites.layer.pipe(Layer.provide(LiveEvents.layer)),
        // `Options` is the newest, and it is the one Hob reads *outside* a
        // tool: a campaign's classes, races and backgrounds decide the shape of
        // `proposeCharacter`, so the player's toolkit is built per request.
        Options.layer,
        Recap.layer,
        Search.layer,
        SessionEvents.layer,
        Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
        Spells.layer,
        // The bundled equipment a drafted kit resolves its names against.
        EquipmentRepo.layer,
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
    | Groups
    | GroupHistory
    | LibraryShares
    | Characters
    | ClassProgression
    | Combatants
    | Creatures
    | CampaignCreatorActors
    | EncounterCreatures
    | EncounterRuns
    | Encounters
    | EquipmentRepo
    | Feats
    | Health
    | Hob
    | HobDirectWrites
    | HobThreads
    | Invites
    | LiveEvents
    | MagicItems
    | Memberships
    | Notes
    | NpcAgent
    | NpcKnowledge
    | NpcMemories
    | Npcs
    | NpcThreads
    | Options
    | RuleArticles
    | Rolls
    | Party
    | PlayerTable
    | PrepItems
    | Proposals
    | Recap
    | Search
    | SessionEvents
    | Sessions
    | Spells,
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
